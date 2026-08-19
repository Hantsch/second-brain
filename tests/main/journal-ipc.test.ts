/* Die Tagebuch-Kanäle im Hauptprozess — an echten Dateien, ohne Netz.
 *
 * Geprüft wird, was auf diesem Screen niemand verlieren darf:
 *
 * - Der eigene Satz steht in der Datei, **bevor** ein Modell gefragt wird — auch
 *   wenn der Stream danach mit einem Fehler endet oder abgebrochen wird.
 * - Ohne Route wird der Eintrag geschrieben und **keine Antwort erfunden**.
 * - Ein Haltungswechsel wirkt auf den nächsten Aufruf (der Auftrag von „Tipps"
 *   steht nur dann im Prompt).
 * - Der Editor des Tagestextes schreibt mit dem eingefrorenen Hash: ein veralteter
 *   Hash bekommt `conflict`, und das Gespräch bleibt unangetastet.
 * - Der Tagesabschluss schreibt nichts; erst `journal:applyClose` schreibt, und
 *   der zurückgegebene Rückweg stellt den Stand davor wieder her.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStream } from '@core/journal';
import type { IpcChannel, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
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

const DATE = '2026-08-10';
const DAY_PATH = 'journal/2026/08/2026-08-10.md';
const PROJECT_PATH = 'projects/work/kundenportal-relaunch/project.md';
const REPLY = 'Das klingt nach einem Tag, der mehr wollte als hineinpasst.';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { journalHandlers } = await import('../../src/main/ipc/journal');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über den Handler nach, genau das wird geprüft. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = journalHandlers(services);
  const streams: IpcEvents['event:llm-stream'][] = [];
  const changed: IpcEvents['event:vault-changed'][] = [];
  const events = vi.spyOn(services, 'sendEvent').mockImplementation((name, payload) => {
    if (name === 'event:llm-stream') streams.push(payload as IpcEvents['event:llm-stream']);
    if (name === 'event:vault-changed') changed.push(payload as IpcEvents['event:vault-changed']);
  });

  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events, streams, changed };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Tagebuch-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-journal-'));
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
    /* Nur das Gespräch: der Tagesabschluss soll ohne Modell laufen, damit die
       Heuristik-Zusage mitgeprüft wird. */
    await harness.settings.setVaultSection('routing', {
      tasks: { 'journal-chat': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(responder);
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  /** Antwort in Stücken, wie ein echter SSE-Strom. */
  function streamed(text: string, pieces = 5): FetchResponder {
    const size = Math.ceil(text.length / pieces);
    const parts: string[] = [];
    for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size));
    return () =>
      sseResponse(sseChunks(parts.map((part) => ({ choices: [{ delta: { content: part } }] }))));
  }

  async function waitForDone(messageId: string): Promise<IpcEvents['event:llm-stream']> {
    return vi.waitFor(
      () => {
        const done = harness.streams.find((event) => event.messageId === messageId && event.done);
        expect(done, 'kein Abschluss-Ereignis').toBeDefined();
        return done as IpcEvents['event:llm-stream'];
      },
      { timeout: 8000, interval: 20 },
    );
  }

  /* Vorgabe „Tipps": seit 011 ist `listen` die Haltung, die **kein** Modell fragt
     (sie geht über `journal:append`), taugt also nicht als Vorgabe für die Wege,
     die hier geprüft werden — Stream, Abbruch, Ausfall. */
  const coach = (patch: Partial<IpcRequest<'journal:coach'>> = {}) =>
    harness.call('journal:coach', {
      mode: 'tips',
      date: DATE,
      message: 'Der Sprint fühlt sich unmöglich an.',
      useHistory: true,
      ...patch,
    });

  // ── Lesen ──────────────────────────────────────────────────────────────────

  it('liefert den Tag in Abschnitten, damit der Renderer kein Markdown parst', async () => {
    const view = await harness.call('journal:get', { date: DATE });

    expect(view?.day.date).toBe(DATE);
    expect(view?.text).toContain('Vormittag im Testsystem');
    /* Die Prosa endet vor dem Gespräch — sonst stünde der Coach im Tagestext. */
    expect(view?.text).not.toContain('Second Brain');
    expect(view?.turns.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    expect(view?.turns[0]).toMatchObject({ at: '18:40' });
    expect(view?.turns[0]?.text).toBe('Der Sprint fühlt sich unmöglich an.');
    expect(view?.facts).toContain('- [ ] Doppelten Interceptor');
    expect(view?.doc.hash.length).toBeGreaterThan(10);
    /* Der Strom (011) kommt aus derselben Kernfunktion, die der Renderer sonst
       selbst aufrufen würde — hier gegen sie gegengeprüft, statt ihre Logik im
       Test zu wiederholen. Der Alt-Abschnitt „Gespräch" zählt für `parseStream`
       nicht mit, „Tag" liefert nur die eine Prosa-Zeile als `entry`. */
    const expected = parseStream(view!.doc.body).map((block) => ({
      kind: block.kind,
      text: block.text,
      at: block.kind === 'answer' ? block.at : null,
    }));
    expect(view?.stream).toEqual(expected);
    expect(view?.stream).toHaveLength(1);
    expect(view?.stream[0]).toMatchObject({ kind: 'entry', at: null });
  });

  it('meldet einen Tag ohne Datei als null, statt einen leeren zu erfinden', async () => {
    expect(await harness.call('journal:get', { date: '2026-08-09' })).toBeNull();
    expect(await vault.exists('journal/2026/08/2026-08-09.md')).toBe(false);
  });

  // ── Gespräch ───────────────────────────────────────────────────────────────

  it('streamt die Antwort und protokolliert beide Runden im Tageseintrag', async () => {
    await routeTo(streamed(REPLY));

    const { messageId, threadId } = await coach();
    const done = await waitForDone(messageId);

    const pieces = harness.streams.filter((event) => event.messageId === messageId && !event.done);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.map((event) => event.delta).join('')).toBe(REPLY);
    expect(done.delta).toBe('');
    expect(done.error).toBeUndefined();
    /* Die Marke ist der Tag: das Gespräch lebt in der Datei, nicht in einer Ablage. */
    expect(threadId).toBe(`journal-${DATE}`);

    const file = (await vault.read(DAY_PATH)) ?? '';
    /* Meine Worte als Prosa, die Antwort als Antwortblock darunter (011) — und
       meine Worte stehen nirgends als Zitat. */
    expect(file).toContain('\nDer Sprint fühlt sich unmöglich an.\n');
    expect(file).toContain(`> ${REPLY}`);
    expect(file.split('> **Ich**')).toHaveLength(2);
    /* Genau eine neue Antwort neben der einen aus dem Bestand. */
    expect(file.split('> **Second Brain**')).toHaveLength(3);
    /* Der Alt-Abschnitt „Gespräch" bleibt unangetastet, mit seinen zwei Runden. */
    const view = await harness.call('journal:get', { date: DATE });
    expect(view?.turns).toHaveLength(2);
    /* Der Renderer erfährt davon über das Ereignis, nicht über Polling. */
    expect(harness.changed.some((event) => event.paths.includes(DAY_PATH))).toBe(true);
  });

  it('hält die eigene Runde fest, auch wenn der Stream mit einem Fehler endet', async () => {
    await routeTo(() => new Error('connect ECONNREFUSED'));

    const { messageId } = await coach({ message: 'Heute war zu viel.' });
    const done = await waitForDone(messageId);

    /* Der Ausfall ist ein Zustand mit Grund, kein Absturz. */
    expect(done.error).toBe('unreachable');
    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).toContain('\nHeute war zu viel.\n');
    /* Keine erfundene Antwort darunter: die eine Runde des Beispielbestands
       bleibt die einzige Antwort in der Datei. */
    expect(file.split('Second Brain')).toHaveLength(2);
  });

  it('bricht ab, ohne die eigene Runde zu verlieren und ohne halbe Antwort', async () => {
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

    const { messageId } = await coach({ message: 'Ich mag heute nicht mehr.' });
    await harness.call('journal:abort', { messageId });
    const done = await waitForDone(messageId);

    expect(done.error).toBe('cancelled');
    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).toContain('\nIch mag heute nicht mehr.\n');
    expect(file.split('Second Brain')).toHaveLength(2);
  });

  it('legt den Tag an, wenn zu einem Tag ohne Datei gesprochen wird', async () => {
    await routeTo(streamed(REPLY));

    const { messageId } = await coach({ date: '2026-08-07', message: 'Nachtrag zu Freitag.' });
    await waitForDone(messageId);

    const file = (await vault.read('journal/2026/08/2026-08-07.md')) ?? '';
    expect(file).toContain('type: journal');
    expect(file).toContain('\nNachtrag zu Freitag.\n');
  });

  it('wechselt mit der Haltung den Auftrag des nächsten Aufrufs', async () => {
    const fake = await routeTo(streamed(REPLY));

    await waitForDone((await coach({ mode: 'tips' })).messageId);
    await waitForDone((await coach({ mode: 'analyze' })).messageId);

    const systemOf = (index: number): string => {
      const body = fake.calls[index]?.body as { messages?: { role: string; content: string }[] };
      return (body.messages ?? []).find((turn) => turn.role === 'system')?.content ?? '';
    };
    expect(systemOf(0)).toContain('höchstens drei Vorschläge');
    expect(systemOf(1)).not.toContain('höchstens drei Vorschläge');
    expect(systemOf(1)).toContain('Datum des Eintrags');
  });

  it('weist Runde ohne Text, unmögliches Datum und unbekannte Haltung ab', async () => {
    await expect(coach({ message: '   ' })).rejects.toMatchObject({ code: 'invalid' });
    await expect(coach({ date: '2026-02-31' })).rejects.toMatchObject({ code: 'invalid' });
    /* Eine Haltung, die es nicht gibt, ist eine Absage — kein Absturz im
       Hintergrundlauf, der als Stream-Fehler zurückkäme. */
    await expect(
      coach({ mode: 'erfunden' as IpcRequest<'journal:coach'>['mode'] }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(harness.streams).toEqual([]);
  });

  // ── Ohne Modell ────────────────────────────────────────────────────────────

  it('schreibt ohne Route den Eintrag und erfindet keine Antwort', async () => {
    const { messageId } = await coach({ message: 'Niemand da, der antwortet?' });
    const done = await waitForDone(messageId);

    expect(harness.streams.filter((event) => !event.done)).toEqual([]);
    expect(done.delta).toBe('');
    /* Der Grund kommt als Code — formuliert wird im Renderer. */
    expect(done.error).toBe('no-route');
    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).toContain('\nNiemand da, der antwortet?\n');
    expect(file.split('Second Brain')).toHaveLength(2);
  });

  it('legt im Modus „analysieren" die gefundenen früheren Tage als Belege bei', async () => {
    await vault.write(
      'journal/2026/07/2026-07-22.md',
      [
        '---',
        'type: journal',
        "title: 'Mittwoch, 22. Juli 2026'",
        'date: 2026-07-22',
        'mood: 2',
        'tags: [stress]',
        '---',
        '',
        '## Tag',
        '',
        'Der Sprint fühlt sich unmöglich an, drei Baustellen gleichzeitig.',
        '',
      ].join('\n'),
    );
    await harness.services.openVault(vault.root);

    const { messageId } = await coach({
      mode: 'analyze',
      message: 'Der Sprint fühlt sich wieder unmöglich an.',
    });
    const done = await waitForDone(messageId);

    expect(done.error).toBe('no-route');
    const evidence = done.citations ?? [];
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0]?.title).toBe('2026-07-22');
    expect(evidence[0]?.path).toBe('journal/2026/07/2026-07-22.md');
    /* Wörtlich aus der Datei — daraus darf der Renderer eine Aussage machen. */
    expect(evidence[0]?.quote).toContain('unmöglich');
  });

  // ── Schreiben ──────────────────────────────────────────────────────────────

  it('hängt Prosa an den Abschnitt „Tag" und legt einen fehlenden Tag an', async () => {
    const result = await harness.call('journal:append', {
      date: '2026-08-08',
      text: 'Später Nachtrag: Werkstatt aufgeräumt.',
    });

    expect(result.created).toBe(true);
    expect(result.path).toBe('journal/2026/08/2026-08-08.md');
    const file = (await vault.read(result.path)) ?? '';
    expect(file.indexOf('Werkstatt')).toBeGreaterThan(file.indexOf('## Tag'));
    /* Ein frischer Tag hat seit 011 nur „Tag" und „Fakten" — die Prosa steht
       unter „Tag", also vor „Fakten". */
    expect(file.indexOf('Werkstatt')).toBeLessThan(file.indexOf('## Fakten'));

    const second = await harness.call('journal:append', {
      date: '2026-08-08',
      text: 'Und die Säge geschärft.',
    });
    expect(second.created).toBe(false);
  });

  it('verliert beim Speichern keine eingebettete Antwort, wenn die Datei keine Tag-Überschrift hat', async () => {
    /* Ein von Hand geschriebener Tag ohne "## Tag" — z. B. weil jemand die
       Überschrift versehentlich gelöscht hat. `dayText()` (die Lesefassung für
       Suche/Prompts/Tagesabschluss) streicht eingebettete Antwortblöcke
       absichtlich; die Editier-Oberfläche darf das nicht tun, sonst würde
       Speichern die Antwort der App unbemerkt löschen. */
    const path = 'journal/2026/08/2026-08-13.md';
    const answer = '> **Second Brain** — 09:00\n> Eine Antwort der App.';
    await vault.write(
      path,
      [
        '---',
        'type: journal',
        "title: 'Donnerstag, 13. August 2026'",
        'date: 2026-08-13',
        'tags: []',
        '---',
        '',
        'Prosa ohne Überschrift.',
        '',
        answer,
        '',
      ].join('\n'),
    );

    const opened = await harness.call('journal:get', { date: '2026-08-13' });
    expect(opened?.text).toContain('Prosa ohne Überschrift.');
    expect(opened?.text).toContain('Eine Antwort der App.');

    /* Speichern mit unverändertem Text muss die Datei byte-identisch lassen —
       insbesondere darf die Antwort nicht verschwinden. */
    await harness.call('journal:setDay', {
      date: '2026-08-13',
      text: opened?.text ?? '',
      expectedHash: opened?.doc.hash,
    });

    const file = (await vault.read(path)) ?? '';
    expect(file).toContain('Eine Antwort der App.');
    expect(
      parseStream((await harness.call('journal:get', { date: '2026-08-13' }))?.doc.body ?? ''),
    ).toEqual([
      { kind: 'entry', text: 'Prosa ohne Überschrift.', line: expect.any(Number) },
      { kind: 'answer', text: 'Eine Antwort der App.', at: '09:00', line: expect.any(Number) },
    ]);
  });

  it('ersetzt beim Speichern nur den Tagestext — das Gespräch bleibt stehen', async () => {
    const before = await harness.call('journal:get', { date: DATE });

    await harness.call('journal:setDay', {
      date: DATE,
      text: 'Neu geschrieben, weil der erste Satz falsch war.',
      expectedHash: before?.doc.hash,
    });

    const after = await harness.call('journal:get', { date: DATE });
    expect(after?.text).toBe('Neu geschrieben, weil der erste Satz falsch war.');
    expect(after?.turns).toHaveLength(2);
    expect(after?.facts).toContain('Doppelten Interceptor');
    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).toContain('mood: 3');
    expect(file).not.toContain('Vormittag im Testsystem');
  });

  it('lehnt das Speichern mit veraltetem Hash ab, statt fremden Text zu überschreiben', async () => {
    const opened = await harness.call('journal:get', { date: DATE });
    /* Jemand editiert die Datei von außen, während der Editor offen ist. */
    const raw = (await vault.read(DAY_PATH)) ?? '';
    await vault.write(DAY_PATH, raw.replace('Vormittag', 'Vormittag (extern geändert)'));

    await expect(
      harness.call('journal:setDay', {
        date: DATE,
        text: 'Mein Stand.',
        expectedHash: opened?.doc.hash,
      }),
    ).rejects.toMatchObject({ code: 'conflict' });

    /* Nichts überschrieben: die fremde Änderung steht noch da. */
    expect((await vault.read(DAY_PATH)) ?? '').toContain('extern geändert');
  });

  it('setzt Stimmung und Energie und ändert dabei nur diese Zeilen', async () => {
    const before = (await vault.read(DAY_PATH)) ?? '';

    const day = await harness.call('journal:setMood', { date: DATE, mood: 5 });

    expect(day.mood).toBe(5);
    expect(day.energy).toBe(2);
    const after = (await vault.read(DAY_PATH)) ?? '';
    const changed = after
      .split('\n')
      .filter((line, at) => line !== before.split('\n')[at])
      .map((line) => line.trim());
    expect(changed).toEqual(['mood: 5']);
  });

  it('legt für eine Stimmung ohne Datei den Tag an, statt ins Leere zu klicken', async () => {
    const day = await harness.call('journal:setMood', { date: '2026-08-06', mood: 4, energy: 3 });

    expect(day.mood).toBe(4);
    expect(day.energy).toBe(3);
    /* Angelegt mit dem Rumpf eines frischen Tages (011: „Tag" und „Fakten"). */
    expect((await vault.read('journal/2026/08/2026-08-06.md')) ?? '').toContain('## Tag');
  });

  // ── Tagesabschluss ─────────────────────────────────────────────────────────

  it('schlägt den Tagesabschluss vor, ohne etwas zu schreiben', async () => {
    /* Ein Tag mit einer Aufgabe im Text, einem bekannten Namen mitten im Satz und
       einem „morgen", das gegen das Datum des Eintrags zählt. */
    const path = 'journal/2026/08/2026-08-11.md';
    await vault.write(
      path,
      [
        '---',
        'type: journal',
        "title: 'Dienstag, 11. August 2026'",
        'date: 2026-08-11',
        'tags: []',
        '---',
        '',
        '## Tag',
        '',
        'Heute war Miriam beim Abnahmeprotokoll dabei.',
        'Ich muss morgen die Ladezeiten der Angebotsliste messen.',
        '',
      ].join('\n'),
    );
    const before = (await vault.read(path)) ?? '';

    const suggestion = await harness.call('journal:close', { date: '2026-08-11' });

    expect(suggestion?.date).toBe('2026-08-11');
    expect(suggestion?.path).toBe(path);
    /* Ohne Modell: die Heuristik trägt, und sie sagt es. */
    expect(suggestion?.heuristic).toBe(true);
    expect(suggestion?.proposal.reason.length).toBeGreaterThan(0);
    expect(suggestion?.proposal.primary.target).toBe('journal');
    /* „morgen" ist der Tag nach dem Eintrag, nicht nach heute. */
    const found = suggestion?.proposal.todos.find((todo) => todo.text.includes('Ladezeiten'));
    expect(found).toMatchObject({ due: '2026-08-12' });
    expect(suggestion?.frontmatter.people).toContain('Miriam');
    /* Und nichts davon steht in der Datei. */
    expect(await vault.read(path)).toBe(before);
  });

  it('schreibt den Tagesabschluss erst nach Bestätigung und nimmt ihn zurück', async () => {
    const view = await harness.call('journal:get', { date: DATE });

    const applied = await harness.call('journal:applyClose', {
      date: DATE,
      todos: [
        {
          text: 'Abnahmeprotokoll mit Miriam durchgehen',
          scope: 'work',
          due: '2026-08-12',
          waitingFor: null,
          priority: 0,
          project: null,
        },
        {
          text: 'Ladezeiten der Angebotsliste messen',
          scope: 'work',
          due: null,
          waitingFor: null,
          priority: 2,
          project: 'kundenportal-relaunch',
        },
      ],
      frontmatter: {
        people: ['Tobias'],
        projects: [],
        mood: 2,
        energy: null,
        tags: [],
      },
      expectedHash: view?.doc.hash,
    });

    expect(applied.written).toEqual([DAY_PATH, PROJECT_PATH]);
    const day = (await vault.read(DAY_PATH)) ?? '';
    /* Das Todo ohne Projekt steht unter „Fakten", mit Frist und ohne das andere. */
    expect(day).toContain('- [ ] Abnahmeprotokoll mit Miriam durchgehen @due:2026-08-12');
    expect(day).not.toContain('Ladezeiten der Angebotsliste messen');
    /* Bestand gewinnt: Miriam und Jonas bleiben, Tobias kommt dazu. */
    expect(day).toContain('people: [Miriam, Jonas, Tobias]');
    expect(day).toContain('mood: 2');
    /* Das Todo mit Projekt geht in die Projektdatei — sichtbar, nicht heimlich. */
    expect((await vault.read(PROJECT_PATH)) ?? '').toContain(
      '- [ ] Ladezeiten der Angebotsliste messen !!',
    );

    /* Der Rückweg: dieselben `vault:write`-Aufträge, die der Renderer ausführt. */
    for (const entry of applied.undo) {
      await harness.services.requireStore().write(entry);
    }
    const reverted = (await vault.read(DAY_PATH)) ?? '';
    expect(reverted).not.toContain('Abnahmeprotokoll mit Miriam durchgehen');
    expect(reverted).toContain('people: [Miriam, Jonas]');
    expect(reverted).toContain('mood: 3');
    /* Die Projektdatei ist wieder die von vorher — ihr eigenes Ladezeiten-Todo
       stand schon drin und bleibt, das neue ist weg. */
    const project = (await vault.read(PROJECT_PATH)) ?? '';
    expect(project).not.toContain('Ladezeiten der Angebotsliste messen');
    expect(project).toContain('Ladezeiten der Angebotsliste unter 1,5 s bringen');
  });

  it('schreibt nichts, wenn eine Zieldatei des Abschlusses fehlt', async () => {
    const before = (await vault.read(DAY_PATH)) ?? '';

    await expect(
      harness.call('journal:applyClose', {
        date: DATE,
        todos: [
          {
            text: 'Gehört zu einem Projekt, das es nicht gibt',
            scope: 'work',
            due: null,
            waitingFor: null,
            priority: 0,
            project: 'gibt-es-nicht',
          },
          {
            text: 'Ladezeiten messen',
            scope: 'work',
            due: null,
            waitingFor: null,
            priority: 0,
            project: 'kundenportal-relaunch',
          },
        ],
        frontmatter: { people: [], projects: [], mood: null, energy: null, tags: [] },
      }),
    ).resolves.toMatchObject({ written: [DAY_PATH, PROJECT_PATH] });

    /* Ein unbekanntes Projekt ist kein Fehler: das Todo landet beim Tag. */
    expect((await vault.read(DAY_PATH)) ?? '').toContain('Gehört zu einem Projekt');
    expect(before).not.toBe(await vault.read(DAY_PATH));
  });

  it('lehnt einen Abschluss für einen Tag ohne Datei ab', async () => {
    await expect(
      harness.call('journal:applyClose', {
        date: '2026-08-05',
        todos: [],
        frontmatter: { people: [], projects: [], mood: 3, energy: null, tags: [] },
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
    expect(await vault.exists('journal/2026/08/2026-08-05.md')).toBe(false);
  });

  // ── Migration: Gespräch → Strom (011, D6) ───────────────────────────────────

  it('faltet den Alt-Abschnitt „Gespräch" in den Strom und entfernt die Überschrift', async () => {
    const before = await harness.call('journal:get', { date: DATE });

    const result = await harness.call('journal:foldDay', {
      date: DATE,
      expectedHash: before?.doc.hash,
    });

    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).not.toContain('## Gespräch');
    expect(result.hash).not.toBe(before?.doc.hash);

    const after = await harness.call('journal:get', { date: DATE });
    /* Die Prosa aus „Tag" und meine gefaltete Runde bilden zusammen einen
       Prosa-Lauf (nichts trennt sie), die Antwort der App folgt als eigener
       Antwortblock. */
    expect(after?.stream.map((block) => block.kind)).toEqual(['entry', 'answer']);
    expect(after?.stream[0]?.text).toContain('Vormittag im Testsystem');
    expect(after?.stream[0]?.text).toContain('Der Sprint fühlt sich unmöglich an.');
    expect(after?.stream[1]).toMatchObject({
      kind: 'answer',
      at: '18:40',
      text: 'Zwei der drei offenen Punkte warten auf andere. Was heute an dir hing, ist fertig.',
    });
    /* Der Alt-Leser findet danach nichts mehr — der Abschnitt, aus dem er
       liest, ist weg. */
    expect(after?.turns).toEqual([]);
  });

  it('lässt einen Tag ohne Gespräch-Abschnitt unangetastet', async () => {
    /* `foldLegacyDay` ist eine Durchreiche ohne Konversationsabschnitt (siehe
       `core/journal/legacy.ts`) — hier gegen die Datei geprüft, nicht nur
       gegen die reine Funktion. */
    const path = 'journal/2026/08/2026-08-08.md';
    await harness.call('journal:append', { date: '2026-08-08', text: 'Nur Prosa, kein Gespräch.' });
    const before = (await vault.read(path)) ?? '';

    await harness.call('journal:foldDay', { date: '2026-08-08' });

    expect(await vault.read(path)).toBe(before);
  });

  it('legt für einen Fold ohne Datei den Tag an, statt ins Leere zu klicken', async () => {
    /* Wie `journal:setDay`/`journal:setMood`: ein fehlender Tag ist kein
       Fehler, er entsteht über `ensureDay`. Ein frischer Tag hat kein
       „Gespräch" (011), also ist das Falten hier ein reiner Leerlauf — der
       Tag existiert danach trotzdem, mit „Tag" und „Fakten". */
    const path = 'journal/2026/08/2026-08-06.md';
    expect(await vault.exists(path)).toBe(false);

    const result = await harness.call('journal:foldDay', { date: '2026-08-06' });

    expect(result.path).toBe(path);
    const file = (await vault.read(path)) ?? '';
    expect(file).toContain('## Tag');
    expect(file).toContain('## Fakten');
  });

  it('lehnt das Falten mit veraltetem Hash ab, statt das Gespräch zu überschreiben', async () => {
    const opened = await harness.call('journal:get', { date: DATE });
    /* Jemand editiert die Datei von außen, während der Vorschlag offen ist. */
    const raw = (await vault.read(DAY_PATH)) ?? '';
    await vault.write(DAY_PATH, raw.replace('Vormittag', 'Vormittag (extern geändert)'));

    await expect(
      harness.call('journal:foldDay', { date: DATE, expectedHash: opened?.doc.hash }),
    ).rejects.toMatchObject({ code: 'conflict' });

    /* Nichts überschrieben: weder die fremde Änderung noch der Alt-Abschnitt. */
    const file = (await vault.read(DAY_PATH)) ?? '';
    expect(file).toContain('extern geändert');
    expect(file).toContain('## Gespräch');
  });

  // ── Ohne Vault ─────────────────────────────────────────────────────────────

  it('verlangt einen offenen Vault', async () => {
    await harness.services.closeVault();

    await expect(harness.call('journal:get', { date: DATE })).rejects.toMatchObject({
      code: 'no-vault',
    });
    await expect(coach()).rejects.toMatchObject({ code: 'no-vault' });
    await expect(harness.call('journal:close', { date: DATE })).rejects.toMatchObject({
      code: 'no-vault',
    });
    await expect(harness.call('journal:foldDay', { date: DATE })).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});
