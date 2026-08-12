/* Der ganze Weg des Wissens, einmal durch — über die echten IPC-Handler, auf
 * einem echten Vault, ohne Netz und ohne echtes Modell.
 *
 * Geprüft wird die Kette, an der Welle C hängt und die keine Einzelprüfung sieht:
 *
 *   Modul anlegen → Quelle aufnehmen → Rohquelle liegt unverändert
 *   → Verdichtung schreibt Source-Seite, Entität, Konzept, Katalog, Chronik
 *   → Frage stellen → Antwort trägt Belege, die wirklich in den Dateien stehen
 *   → „als Wiki-Seite ablegen" schreibt Seite, Katalog und Chronik.
 *
 * Dazu derselbe Weg **ohne Route**: die Quelle landet trotzdem, der Auftrag sagt
 * ehrlich `awaiting-llm`, und die Frage liefert die Fundstellen (Guardrail 1).
 *
 * Und die Regel, die über allem steht: unter `raw/` wird nichts verändert. Der
 * Test vergleicht Hashes vor und nach einem Verdichtungslauf.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob } from '@shared/types';
import { createFetchFake, jsonResponse, sseChunks, sseResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const MODULE_TITLE = 'Zugangsverwaltung';
const MODULE = 'zugangsverwaltung';
/* Der Titel der Quelle kommt aus der ersten Überschrift — das macht der Ingestor. */
const SOURCE_TEXT = [
  '# Kurze Token, weniger Ärger',
  '',
  'Ein Praxisbericht aus dem Betrieb von Orbit Identity: seit die Access-Token',
  'nur noch eine Viertelstunde leben, kostet ein geleakter Token fast nichts.',
].join('\n');
/** Der Satz, an dem die Antwort später hängt — er steht so in der Verdichtung. */
const CLAIM =
  'Access-Token leben 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei jeder Nutzung';
const SUMMARY = [
  '## Worum es geht',
  '',
  'Kurze Token begrenzen den Schaden eines Lecks im Betrieb von Orbit Identity.',
  '',
  '## Tragende Aussagen',
  '',
  `- ${CLAIM}.`,
].join('\n');
const QUESTION = 'Wie lange leben Access-Token?';

/** Die Vorschläge des Modells für das Wiki: eine Entität, ein Konzept. */
const INGEST_REPLY = {
  pages: [
    {
      slug: 'orbit-identity',
      type: 'entity',
      title: 'Orbit Identity',
      action: 'create',
      patch: 'Orbit Identity stellt die Token aus und rotiert die Refresh-Token.',
      tags: ['auth'],
      contradicts: null,
    },
    {
      slug: 'token-lebensdauer',
      type: 'concept',
      title: 'Token-Lebensdauer',
      action: 'create',
      patch: 'Kurze Access-Token begrenzen den Schaden eines Lecks auf eine Viertelstunde.',
      tags: ['auth'],
      contradicts: null,
    },
  ],
  overviewChange: null,
};

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { chatHandlers } = await import('../../src/main/ipc/chat');
  const { ingestHandlers } = await import('../../src/main/ipc/ingest');
  const { moduleHandlers } = await import('../../src/main/ipc/modules');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über `settle()` im Handler nach — genau das
     soll die Kette leisten. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = {
    ...moduleHandlers(services),
    ...ingestHandlers(services),
    ...chatHandlers(services),
  };
  const streams: IpcEvents['event:llm-stream'][] = [];
  vi.spyOn(services, 'sendEvent').mockImplementation((name, payload) => {
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

  return { services, settings, call, streams };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** sha256 jeder Datei unter `raw/`, vault-relativ. */
async function rawHashes(vault: TempVault): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const root = vault.absolute('raw');
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      const bytes = await readFile(full);
      out.set(
        relative(root, full).split('\\').join('/'),
        createHash('sha256').update(bytes).digest('hex'),
      );
    }
  };
  await walk(root);
  return out;
}

describe('Der Weg des Wissens über die echten Kanäle', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;
  /** Die Antwort, die das gefälschte Modell streamt — wird nach dem Ingest gesetzt. */
  let answerText = '';

  beforeEach(async () => {
    vault = await createTempVault();
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-flow-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
    answerText = '';
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    /* Der Index-Nachlauf hängt nicht am Auftrag — beim Abräumen also einen
       Augenblick warten, sonst schreibt er in einen Ordner, den es nicht mehr gibt. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vault.cleanup().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vault.cleanup();
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  /**
   * Ein Modell hinter gefälschtem `fetch`. Es antwortet nach Form der Anfrage:
   * Strom → die Antwort auf die Frage, JSON-Schema → die Wiki-Vorschläge,
   * sonst → die Verdichtung als Markdown.
   */
  async function routeToFakeModel(): Promise<void> {
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
    /* Ohne `query-rerank`: das Sortieren würde nur einen Aufruf kosten und die
       Reihenfolge der Suche ist hier schon die richtige. */
    await harness.settings.setVaultSection('routing', {
      tasks: {
        'summarize-source': { providerId: 'local-1', model: 'qwen2.5:14b' },
        'wiki-ingest': { providerId: 'local-1', model: 'qwen2.5:14b' },
        'query-answer': { providerId: 'local-1', model: 'qwen2.5:14b' },
      },
      defaults: {},
    });
    const fake = createFetchFake((call) => {
      if (call.body?.['stream'] === true) {
        return sseResponse(sseChunks([{ choices: [{ delta: { content: answerText } }] }]));
      }
      if (call.body?.['response_format'] !== undefined) return jsonResponse(reply(INGEST_REPLY));
      return jsonResponse(reply(SUMMARY));
    });
    vi.stubGlobal('fetch', fake.fetch);
  }

  function reply(content: unknown): unknown {
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    return { choices: [{ message: { content: text } }] };
  }

  /** Wartet, bis der Auftrag nichts mehr tut. */
  async function settled(id: string): Promise<IngestJob> {
    let job: IngestJob | undefined;
    await vi.waitFor(
      async () => {
        job = (await harness.call('ingest:jobs', undefined)).find((entry) => entry.id === id);
        expect(job?.stage).toMatch(/done|error|awaiting-llm/);
      },
      { timeout: 15000, interval: 25 },
    );
    if (job === undefined) throw new Error('Auftrag verschwunden');
    return job;
  }

  /**
   * Wartet, bis der Index nachgezogen hat — er ist die Grundlage jeder Antwort.
   * Gefragt wird über die Kanäle, nicht am Index vorbei: dieselbe Sicht, die auch
   * die Oberfläche hat.
   */
  async function indexedPage(path: string): Promise<void> {
    await vi.waitFor(
      async () => {
        const pages = await harness.call('modules:pages', { module: MODULE });
        expect(
          pages.map((page) => page.path),
          `Index kennt ${path} nicht`,
        ).toContain(path);
      },
      { timeout: 15000, interval: 25 },
    );
  }

  async function indexedSource(rawPath: string): Promise<void> {
    await vi.waitFor(
      async () => {
        const sources = await harness.call('modules:sources', {});
        expect(
          sources.map((source) => source.path),
          `Index kennt ${rawPath} nicht`,
        ).toContain(rawPath);
      },
      { timeout: 15000, interval: 25 },
    );
  }

  /** Wartet auf das Abschluss-Ereignis dieser Antwort. */
  async function waitForDone(messageId: string): Promise<IpcEvents['event:llm-stream']> {
    return vi.waitFor(
      () => {
        const done = harness.streams.find((event) => event.messageId === messageId && event.done);
        expect(done, 'kein Abschluss-Ereignis').toBeDefined();
        return done as IpcEvents['event:llm-stream'];
      },
      { timeout: 15000, interval: 25 },
    );
  }

  const ingestText = async (module: string | null) =>
    harness.call('ingest:start', { kind: 'text', input: SOURCE_TEXT, module });

  it('führt Modul, Quelle, Verdichtung, Frage und Ablegen zu einer Kette zusammen', async () => {
    await routeToFakeModel();

    // ── Modul anlegen ────────────────────────────────────────────────────────
    const created = await harness.call('modules:create', {
      title: MODULE_TITLE,
      description: 'Anmeldung, Rollen und Token.',
    });
    expect(created.slug).toBe(MODULE);
    for (const path of [
      `modules/${MODULE}/module.md`,
      `modules/${MODULE}/AGENTS.md`,
      `modules/${MODULE}/wiki/index.md`,
      `modules/${MODULE}/wiki/log.md`,
      `modules/${MODULE}/wiki/overview.md`,
    ]) {
      expect(await vault.exists(path), path).toBe(true);
    }

    // ── Quelle aufnehmen und verdichten ──────────────────────────────────────
    const started = await ingestText(MODULE);
    const job = await settled(started.id);
    expect(job.stage).toBe('done');

    /* Die Rohquelle liegt unverändert: der Text kam so herein. */
    expect(job.rawPath).toMatch(/^raw\/files\//);
    expect(await vault.read(`${job.rawPath}/source.md`)).toContain(SOURCE_TEXT);

    const sourcePage = job.touchedPages.find((path) => path.includes('/wiki/sources/')) ?? '';
    expect(sourcePage).toMatch(/wiki\/sources\/s-\d{4}-\d{2}-\d{2}-/);
    expect(await vault.read(sourcePage)).toContain(CLAIM);
    /* Entität und Konzept sind entstanden, Katalog und Chronik mitgeschrieben. */
    expect(await vault.exists(`modules/${MODULE}/wiki/entities/orbit-identity.md`)).toBe(true);
    expect(await vault.exists(`modules/${MODULE}/wiki/concepts/token-lebensdauer.md`)).toBe(true);
    const catalog = (await vault.read(`modules/${MODULE}/wiki/index.md`)) ?? '';
    expect(catalog).toContain('token-lebensdauer');
    expect(catalog).toContain('orbit-identity');
    const log = (await vault.read(`modules/${MODULE}/wiki/log.md`)) ?? '';
    expect(log).toMatch(/^## \[\d{4}-\d{2}-\d{2}\] ingest \| /m);
    /* Und das Protokoll der Rohquelle weiß, wohin verdichtet wurde. */
    const protocol = JSON.parse((await vault.read(`${job.rawPath}/.ingest.json`)) ?? '{}');
    expect(protocol.sourcePage).toMatch(/^s-\d{4}-\d{2}-\d{2}-/);
    expect(protocol.modules).toEqual([MODULE]);

    // ── Frage stellen ────────────────────────────────────────────────────────
    await indexedPage(sourcePage);
    /* Die Antwort belegt mit dem Pfad und zitiert wörtlich — beides prüft der Kern. */
    answerText = [`Access-Token leben 15 Minuten [[${sourcePage}]].`, '', `„${CLAIM}"`].join('\n');

    const asked = await harness.call('chat:ask', { question: QUESTION, module: MODULE });
    const done = await waitForDone(asked.messageId);
    expect(done.error).toBeUndefined();

    const thread = await harness.call('chat:thread', { id: asked.threadId });
    const answer = thread?.messages[1];
    expect(answer?.role).toBe('assistant');
    expect(answer?.model).toBe('qwen2.5:14b');
    expect(answer?.unsupported).toBeUndefined();

    /* Jeder Beleg zeigt auf eine Datei, die es gibt, und zitiert daraus wörtlich. */
    const citations = answer?.citations ?? [];
    expect(citations.length).toBeGreaterThan(0);
    for (const citation of citations) {
      const file = (await vault.read(citation.path)) ?? '';
      expect(file.length, citation.path).toBeGreaterThan(0);
      expect(file.replace(/\s+/g, ' ')).toContain(citation.quote.replace(/\s+/g, ' '));
    }
    expect(citations.map((citation) => citation.path)).toContain(sourcePage);

    // ── Antwort als Wiki-Seite ablegen ───────────────────────────────────────
    const write = await harness.call('chat:fileBack', {
      threadId: asked.threadId,
      messageId: asked.messageId,
      module: MODULE,
      title: 'Lebensdauer von Access-Token',
    });
    expect(write.path).toBe(`modules/${MODULE}/wiki/concepts/lebensdauer-von-access-token.md`);
    const page = (await vault.read(write.path)) ?? '';
    expect(page).toContain('type: concept');
    expect(page).toContain('15 Minuten');
    expect(page).toContain('## Belege');
    expect((await vault.read(`modules/${MODULE}/wiki/index.md`)) ?? '').toContain(
      'lebensdauer-von-access-token',
    );
    expect((await vault.read(`modules/${MODULE}/wiki/log.md`)) ?? '').toContain(
      `query | ${QUESTION}`,
    );
  });

  it('legt die Quelle auch ohne Route ab und antwortet mit den Fundstellen', async () => {
    await harness.call('modules:create', { title: MODULE_TITLE, description: 'Ohne Modell.' });

    const job = await settled((await ingestText(MODULE)).id);

    /* Die Rohquelle liegt, die Verdichtung ist offen — nicht gescheitert. */
    expect(job.stage).toBe('awaiting-llm');
    expect(await vault.read(`${job.rawPath}/source.md`)).toContain(SOURCE_TEXT);
    expect(job.touchedPages).toEqual([]);
    const protocol = JSON.parse((await vault.read(`${job.rawPath}/.ingest.json`)) ?? '{}');
    expect(protocol.sourcePage).toBeNull();
    /* Kein Wiki-Schreibvorgang: der Katalog ist so leer wie beim Anlegen. */
    expect((await vault.read(`modules/${MODULE}/wiki/index.md`)) ?? '').not.toContain('s-20');

    await indexedSource(job.rawPath ?? '');
    const asked = await harness.call('chat:ask', { question: 'Orbit Identity Access-Token' });
    const done = await waitForDone(asked.messageId);

    /* Nicht gestreamt: ohne Modell trägt der Abschluss den ganzen Text. */
    expect(harness.streams.filter((event) => !event.done)).toEqual([]);
    expect(done.delta.length).toBeGreaterThan(0);
    const citations = done.citations ?? [];
    expect(citations.length).toBeGreaterThan(0);
    for (const citation of citations) {
      const file = (await vault.read(citation.path)) ?? '';
      expect(file.replace(/\s+/g, ' '), citation.path).toContain(
        citation.quote.replace(/\s+/g, ' '),
      );
      expect(citation.line).toBeGreaterThan(0);
    }
    /* Die Fundstelle ist die Rohquelle selbst — mehr gibt es ohne Verdichtung nicht. */
    expect(citations.some((citation) => citation.path.startsWith('raw/'))).toBe(true);
  });

  it('lässt jede Datei unter raw/ unverändert, wenn verdichtet wird', async () => {
    await harness.call('modules:create', { title: MODULE_TITLE, description: 'Rohquellen.' });
    const started = await ingestText(MODULE);
    const first = await settled(started.id);
    expect(first.stage).toBe('awaiting-llm');
    const protocolPath = `${first.rawPath}/.ingest.json`;

    const before = await rawHashes(vault);
    expect(before.size).toBeGreaterThan(1);
    const protocolBefore = JSON.parse((await vault.read(protocolPath)) ?? '{}');

    await routeToFakeModel();
    await harness.call('ingest:retry', { id: started.id });
    expect((await settled(started.id)).stage).toBe('done');

    const after = await rawHashes(vault);
    /* Nichts kommt hinzu, nichts fällt weg. */
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());

    /* Der Inhalt der Quelle ist unantastbar. Geändert werden darf nur das
       Protokoll daneben, und dort nur die Buchhaltung der App (`sourcePage`,
       `modules`) — sonst wäre jede Quelle für immer „unverdichtet". */
    const changed = [...after.entries()]
      .filter(([path, hash]) => before.get(path) !== hash)
      .map(([path]) => path);
    expect(changed).toEqual([protocolPath.slice('raw/'.length)]);

    const protocolAfter = JSON.parse((await vault.read(protocolPath)) ?? '{}');
    expect(protocolAfter.sourcePage).toMatch(/^s-\d{4}-\d{2}-\d{2}-/);
    /* Jedes andere Feld steht wortwörtlich noch da. */
    expect({ ...protocolAfter, sourcePage: protocolBefore.sourcePage }).toEqual(protocolBefore);
  });
});
