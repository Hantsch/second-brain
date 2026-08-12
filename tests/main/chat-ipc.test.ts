/* Die Fragen-Kanäle im Hauptprozess — an echten Dateien, ohne Netz.
 *
 * Der Prüfstein ist der Weg einer Frage: sie steht als Datei, bevor irgendein
 * Modell antwortet; die Antwort fließt stückweise als `event:llm-stream` und endet
 * mit geprüften Belegen; ein Abbruch schreibt nichts; ohne Modell kommen die
 * Fundstellen statt eines Fehlers. Und eine gute Antwort wird eine Wiki-Seite.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { ChatThread } from '@shared/types';
import { createFetchFake, sseChunks, sseResponse } from '../fakes/llm';
import type { FetchResponder } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

/* Electron gibt es im Test nicht: Fenster keine, Verschlüsselung keine. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const MODULE = 'identity-management';
const TOKEN_PAGE = `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`;
const QUESTION = 'Wie lange leben Access-Token?';
const VERBATIM =
  'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei jeder Nutzung';

/** Eine Antwort, wie ein Modell sie geben soll: Beleg als Pfad, Zitat wortwörtlich. */
const GOOD_ANSWER = [
  `Access-Token leben 15 Minuten [[${TOKEN_PAGE}]].`,
  '',
  `Wörtlich: „${VERBATIM}"`,
].join('\n');

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { chatHandlers } = await import('../../src/main/ipc/chat');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über den Handler nach, genau das wird geprüft. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = chatHandlers(services);
  const streams: IpcEvents['event:llm-stream'][] = [];
  const events = vi.spyOn(services, 'sendEvent').mockImplementation((name, payload) => {
    if (name === 'event:llm-stream') streams.push(payload as IpcEvents['event:llm-stream']);
  });

  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events, streams };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Fragen-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-chat-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  /** Route auf ein Modell, das über gefälschtes `fetch` antwortet — nie ein Dienst. */
  async function routeTo(responder: FetchResponder) {
    await harness.settings.setVaultSection('providers', [
      {
        id: 'local-1',
        label: 'Lokal',
        kind: 'openai-compatible',
        baseUrl: 'http://localhost:11434/v1',
        hasKey: false,
        local: true,
        enabled: true,
        models: ['qwen2.5:14b'],
        createdAt: '2026-08-10T12:00:00.000Z',
      },
    ]);
    /* Nur die Antwort-Aufgabe: das Sortieren würde einen zweiten Aufruf kosten. */
    await harness.settings.setVaultSection('routing', {
      tasks: { 'query-answer': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(responder);
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  /** Antwort in Stücken, wie ein echter SSE-Strom. */
  function streamed(text: string, pieces = 6): FetchResponder {
    const size = Math.ceil(text.length / pieces);
    const parts: string[] = [];
    for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size));
    return () =>
      sseResponse(sseChunks(parts.map((part) => ({ choices: [{ delta: { content: part } }] }))));
  }

  /** Wartet, bis der Stream zu dieser Nachricht fertig ist. */
  async function waitForDone(messageId: string): Promise<IpcEvents['event:llm-stream']> {
    /* Grosszuegig: das Gateway wiederholt einen Netzausfall mit echtem Backoff. */
    return vi.waitFor(
      () => {
        const done = harness.streams.find((event) => event.messageId === messageId && event.done);
        expect(done, 'kein Abschluss-Ereignis').toBeDefined();
        return done as IpcEvents['event:llm-stream'];
      },
      { timeout: 8000, interval: 20 },
    );
  }

  const ask = (patch: Partial<IpcRequest<'chat:ask'>> = {}) =>
    harness.call('chat:ask', { question: QUESTION, ...patch });

  // ── Frage schreiben ────────────────────────────────────────────────────────

  it('schreibt die Frage sofort als Datei, bevor eine Antwort existiert', async () => {
    await routeTo(streamed(GOOD_ANSWER));

    const { threadId, messageId } = await ask();

    /* Genau hier hängt „kein Verlust bei Absturz mitten im Stream". */
    const raw = (await vault.read(`.secondbrain/chats/${threadId}.json`)) ?? '';
    const thread = JSON.parse(raw) as ChatThread;
    expect(thread.title).toBe(QUESTION);
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]).toMatchObject({ role: 'user', content: QUESTION });
    expect(messageId.startsWith('m-')).toBe(true);
    await waitForDone(messageId);
  });

  it('weist eine Frage ohne Text ab, statt ein leeres Gespräch anzulegen', async () => {
    await expect(ask({ question: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    expect(await harness.call('chat:threads', {})).toEqual([]);
  });

  // ── Streamen und belegen ───────────────────────────────────────────────────

  it('streamt die Antwort stückweise und schließt mit geprüften Belegen ab', async () => {
    await routeTo(streamed(GOOD_ANSWER));

    const { threadId, messageId } = await ask();
    const done = await waitForDone(messageId);

    const pieces = harness.streams.filter((event) => event.messageId === messageId && !event.done);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((event) => event.delta).join('')).toBe(GOOD_ANSWER);
    /* Der Abschluss trägt keinen Text mehr, aber die Belege. */
    expect(done.delta).toBe('');
    expect(done.threadId).toBe(threadId);
    expect(done.citations?.some((citation) => citation.path === TOKEN_PAGE)).toBe(true);
    expect(done.error).toBeUndefined();

    const thread = await harness.call('chat:thread', { id: threadId });
    const answer = thread?.messages[1];
    expect(answer?.role).toBe('assistant');
    expect(answer?.id).toBe(messageId);
    expect(answer?.content).toContain('15 Minuten');
    expect(answer?.model).toBe('qwen2.5:14b');
    expect(answer?.unsupported).toBeUndefined();
    /* Der Beleg zeigt auf die Zeile, in der das Zitat wirklich steht. */
    const citation = answer?.citations?.[0];
    const line = (await vault.read(TOKEN_PAGE))?.split('\n')[(citation?.line ?? 0) - 1] ?? '';
    expect(VERBATIM).toContain(line.trim());
  });

  it('kennzeichnet eine Antwort, deren Zitat nirgends steht, als unbelegt', async () => {
    await routeTo(
      streamed(
        [
          `Access-Token leben zwölf Stunden [[${TOKEN_PAGE}]].`,
          '',
          'Wörtlich: „Access-Token leben zwölf Stunden, so ist es entschieden"',
        ].join('\n'),
      ),
    );

    const { threadId, messageId } = await ask();
    await waitForDone(messageId);

    const thread = await harness.call('chat:thread', { id: threadId });
    expect(thread?.messages[1]?.unsupported).toBe(true);
  });

  it('führt das Gespräch weiter und nimmt die Vorgeschichte mit', async () => {
    const fake = await routeTo(streamed(GOOD_ANSWER));
    const first = await ask();
    await waitForDone(first.messageId);

    const second = await ask({ question: 'Und die Refresh-Token?', threadId: first.threadId });
    await waitForDone(second.messageId);

    expect(second.threadId).toBe(first.threadId);
    const thread = await harness.call('chat:thread', { id: first.threadId });
    expect(thread?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    /* Die frühere Runde steht im zweiten Prompt — und die neue Frage nur einmal. */
    const body = fake.calls[1]?.body as { messages?: { role: string; content: string }[] };
    const roles = (body.messages ?? []).map((turn) => turn.role);
    expect(roles.filter((role) => role === 'assistant')).toHaveLength(1);
    const asked = (body.messages ?? []).filter((turn) =>
      turn.content.includes('Und die Refresh-Token?'),
    );
    expect(asked).toHaveLength(1);
  });

  it('beginnt ein neues Gespräch, wenn die mitgegebene Marke nicht mehr existiert', async () => {
    await routeTo(streamed(GOOD_ANSWER));

    const { threadId, messageId } = await ask({ threadId: 'c-2020-01-01-0800-weg0' });
    await waitForDone(messageId);

    expect(threadId).not.toBe('c-2020-01-01-0800-weg0');
    expect((await harness.call('chat:thread', { id: threadId }))?.title).toBe(QUESTION);
  });

  // ── Abbrechen ──────────────────────────────────────────────────────────────

  it('bricht ab, ohne eine halbe Antwort zu schreiben', async () => {
    /* Ein Modell, das nie antwortet — bis der Abbruch das Signal auslöst. */
    await routeTo(
      (call) =>
        new Promise((_resolve, reject) => {
          call.signal?.addEventListener('abort', () => {
            const error = new Error('Abgebrochen.');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    const { threadId, messageId } = await ask();
    await harness.call('chat:abort', { messageId });
    const done = await waitForDone(messageId);

    expect(done.error).toBe('cancelled');
    const thread = await harness.call('chat:thread', { id: threadId });
    /* Die Frage bleibt, die unvollständige Antwort wird nicht behauptet. */
    expect(thread?.messages).toHaveLength(1);
    expect(thread?.messages[0]?.role).toBe('user');
  });

  it('meldet einen Ausfall des Modells als Abschluss mit Grund', async () => {
    await routeTo(() => new Error('connect ECONNREFUSED'));

    const { threadId, messageId } = await ask();
    const done = await waitForDone(messageId);

    /* Ohne Modell bleibt die Suche — der Kern fällt auf die Fundstellen zurück. */
    expect(done.error).toBeUndefined();
    expect(done.delta).toContain('Stellen');
    expect((await harness.call('chat:thread', { id: threadId }))?.messages).toHaveLength(2);
  });

  // ── Ohne Modell ────────────────────────────────────────────────────────────

  it('liefert ohne Route die Fundstellen statt eines Fehlers', async () => {
    const { threadId, messageId } = await ask();
    const done = await waitForDone(messageId);

    /* Nicht gestreamt: der Abschluss trägt den ganzen Text. */
    expect(harness.streams.filter((event) => !event.done)).toEqual([]);
    expect(done.delta.length).toBeGreaterThan(0);
    expect(done.citations?.length).toBeGreaterThan(0);
    expect(done.citations?.some((citation) => citation.path === TOKEN_PAGE)).toBe(true);

    const answer = (await harness.call('chat:thread', { id: threadId }))?.messages[1];
    expect(answer?.model).toBeUndefined();
    expect(answer?.citations?.[0]?.line).toBeGreaterThan(0);
  });

  it('sagt ehrlich, wenn nichts im Vault dazu steht', async () => {
    const { threadId, messageId } = await ask({ question: 'Quantenkaffee' });
    const done = await waitForDone(messageId);

    expect(done.citations).toEqual([]);
    const answer = (await harness.call('chat:thread', { id: threadId }))?.messages[1];
    expect(answer?.unsupported).toBe(true);
    expect(answer?.content).toContain('nichts');
  });

  // ── Gespräche verwalten ────────────────────────────────────────────────────

  it('listet Gespräche, sucht im Verlauf und löscht mit Rückweg', async () => {
    const first = await ask();
    await waitForDone(first.messageId);
    const second = await ask({ question: 'Was steht zur Rollenvererbung?' });
    await waitForDone(second.messageId);

    const threads = await harness.call('chat:threads', {});
    expect(threads.map((thread) => thread.id)).toEqual([second.threadId, first.threadId]);
    expect(
      (await harness.call('chat:threads', { query: 'Rollenvererbung' })).map(
        (thread) => thread.title,
      ),
    ).toEqual(['Was steht zur Rollenvererbung?']);

    await harness.call('chat:delete', { id: second.threadId });
    expect(await harness.call('chat:thread', { id: second.threadId })).toBeNull();
    /* Der Papierkorb hat sie: gelöscht ist nicht verloren. */
    expect(await vault.exists('.secondbrain/trash')).toBe(true);
  });

  // ── Zurückschreiben ────────────────────────────────────────────────────────

  it('legt die Antwort als Wiki-Seite ab, mit Belegen, Katalog und Chronik', async () => {
    await routeTo(streamed(GOOD_ANSWER));
    const { threadId, messageId } = await ask();
    await waitForDone(messageId);

    const write = await harness.call('chat:fileBack', {
      threadId,
      messageId,
      module: MODULE,
      title: 'Lebensdauer von Access-Token',
    });

    expect(write.path).toBe(`modules/${MODULE}/wiki/concepts/lebensdauer-von-access-token.md`);
    const page = (await vault.read(write.path)) ?? '';
    expect(page).toContain('type: concept');
    expect(page).toContain('15 Minuten');
    /* Der Pfad in der Antwort ist zu einem echten Wikilink geworden. */
    expect(page).toContain('[[token-lebensdauer]]');
    expect(page).toContain('## Belege');
    expect((await vault.read(`modules/${MODULE}/wiki/index.md`)) ?? '').toContain(
      'lebensdauer-von-access-token',
    );
    const log = (await vault.read(`modules/${MODULE}/wiki/log.md`)) ?? '';
    expect(log).toContain('query | Wie lange leben Access-Token?');
    /* Der Renderer erfährt davon über das Ereignis, nicht über Polling. */
    expect(harness.events).toHaveBeenCalledWith(
      'event:vault-changed',
      expect.objectContaining({ external: false }),
    );
  });

  it('legt ein neues Modul an, wenn der Nutzer eines nennt, das es nicht gibt', async () => {
    const { threadId, messageId } = await ask();
    await waitForDone(messageId);

    const write = await harness.call('chat:fileBack', {
      threadId,
      messageId,
      module: 'Zugangsverwaltung',
      title: 'Lebensdauer von Access-Token',
    });

    expect(write.path.startsWith('modules/zugangsverwaltung/wiki/concepts/')).toBe(true);
    expect(await vault.exists('modules/zugangsverwaltung/AGENTS.md')).toBe(true);
    expect(await vault.exists('modules/zugangsverwaltung/wiki/log.md')).toBe(true);
  });

  it('weist das Zurückschreiben ohne Antwort, Modul oder Titel ab', async () => {
    const { threadId, messageId } = await ask();
    await waitForDone(messageId);

    await expect(
      harness.call('chat:fileBack', { threadId, messageId, module: '', title: 'X' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      harness.call('chat:fileBack', {
        threadId,
        messageId: `${messageId}-q`,
        module: MODULE,
        title: 'X',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    await expect(
      harness.call('chat:fileBack', {
        threadId: 'c-2020-01-01-0800-weg0',
        messageId,
        module: MODULE,
        title: 'X',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // ── Ohne Vault ─────────────────────────────────────────────────────────────

  it('verlangt einen offenen Vault', async () => {
    await harness.services.closeVault();

    await expect(ask()).rejects.toMatchObject({ code: 'no-vault' });
    await expect(harness.call('chat:threads', {})).rejects.toMatchObject({ code: 'no-vault' });
  });
});
