/* Der Weg durch die letzte Welle — an den **echten** Handlern, auf einem echten
 * Temp-Vault, ohne Netz und ohne Dienst.
 *
 * Die Bereichstests daneben prüfen jeder ihre Kanäle. Dieser prüft die Naht: ob
 * das, was der eine Bereich in die Datei schreibt, der nächste dort auch findet.
 * Genau da sind frühere Wellen gescheitert — zwei Fassungen des Tagesformats, ein
 * Rückweg, den niemand ausgeführt hat, ein Fix ohne Chronikeintrag.
 *
 * Ein Durchgang **mit** Route (FakeProvider über `openai-compatible` und ein
 * injiziertes `fetch`):
 *   Tag anlegen → zwei Coaching-Runden → beide stehen im Blockquote-Format in der
 *   Datei → Stimmung setzen (genau eine Zeile Diff) → Tag abschließen (schreibt
 *   nichts) → bestätigen (Todo landet) → Rückgängig (Stand von vorher) →
 *   Pflegelauf findet die gesäten Mängel → ein Fix schreibt, `log.md` trägt den
 *   `lint`-Eintrag, `gardener:undoFix` dreht ihn zurück.
 *
 * Und derselbe Weg **ohne** Route: der Eintrag wird geschrieben, es wird keine
 * Antwort erfunden, und die deterministischen Befunde stehen vollständig da
 * (Guardrail 1).
 *
 * Gerufen wird über `buildHandlers` — dieselbe Karte, die `registerAllHandlers`
 * auf `ipcMain` setzt. Ein Bereich, der hier fehlt, fehlt in der App.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, JournalCloseSuggestion } from '@shared/types';
import { createFetchFake, sseChunks, sseResponse } from '../fakes/llm';
import type { FetchResponder } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

/* Electron gibt es im Test nicht: keine Fenster, keine Verschlüsselung, keine
   Dialoge. Gerufen werden nur Kanäle, die keinen davon brauchen. */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  screen: { getAllDisplays: () => [], getCursorScreenPoint: () => ({ x: 0, y: 0 }) },
}));

/** Ein Tag, den der Fixture-Bestand noch nicht hat — er entsteht hier. */
const DATE = '2026-08-11';
const DAY_PATH = 'journal/2026/08/2026-08-11.md';
const CATALOG = 'modules/identity-management/wiki/index.md';
const LOG = 'modules/identity-management/wiki/log.md';

/* Ein Tagestext mit genau einer Aufgabe („muss … zusammenlegen") — die Heuristik
   des Erfassens findet sie ohne Modell, und der Tagesabschluss benutzt dieselbe. */
const DAY_TEXT =
  'Vormittag im Testsystem, nachmittags das Abnahmeprotokoll vorbereitet. ' +
  'Ich muss den doppelten Interceptor im Kundenportal zusammenlegen.';

const FIRST_REPLY = 'Das klingt nach einem Tag, der mehr wollte als hineinpasst.';
const SECOND_REPLY = 'Zwei der drei offenen Punkte warten auf andere.';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { forgetGardenerState } = await import('../../src/main/gardener-state');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');
  const { cancelGardenerRun } = await import('../../src/main/gardener-run-state');
  const { buildHandlers } = await import('../../src/main/ipc/register-all');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');
  const { resetTaskResults } = await import('../../src/main/task-results');

  /* Zustand aus einem früheren Test darf nicht überleben. */
  forgetSessions();
  forgetOverviewState();
  forgetGardenerState();
  cancelGardenerRun();
  /* 073, D4: `journal:close` queues its work now — a fresh queue and result
     store per test, or one test's task would still be there for the next. */
  resetWorkQueue();
  resetTaskResults();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über die Handler nach — genau das wird geprüft. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = buildHandlers(services);
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

  return { services, settings, call, streams, queue: getWorkQueue(services) };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/** Zeilen, die in `after` stehen und in `before` nicht — und umgekehrt. */
function lineDiff(before: string, after: string): { added: string[]; removed: string[] } {
  const old = before.split('\n');
  const next = after.split('\n');
  return {
    added: next.filter((line) => !old.includes(line)),
    removed: old.filter((line) => !next.includes(line)),
  };
}

function findingOfKind(findings: readonly GardenerFinding[], kind: string): GardenerFinding {
  const found = findings.find((finding) => finding.kind === kind);
  expect(found, `Befund der Art ${kind}`).toBeDefined();
  return found as GardenerFinding;
}

/**
 * `journal:close` als abgewarteter Task (073, D4): queued, wartet, holt den
 * Vorschlag über `tasks:result`. `null` bleibt `null` — genau die Antwort, die
 * der synchrone Kanal vorher direkt gegeben hat (`closeDay`'s eigener
 * "nichts zu schließen"-Fall).
 */
async function closeDay(harness: Harness, date: string): Promise<JournalCloseSuggestion | null> {
  const task = await harness.call('journal:close', { date });
  if (task === null) return null;
  await vi.waitFor(() => {
    const found = harness.queue.list().find((entry) => entry.id === task.id);
    if (found === undefined || found.state === 'queued' || found.state === 'running') {
      throw new Error(`Task ${task.id} läuft noch`);
    }
    return found;
  });
  const result = await harness.call('tasks:result', { id: task.id });
  return result?.kind === 'journal-close' ? result.suggestion : null;
}

describe('Welle E von einer Naht zur nächsten', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-flow-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  /**
   * Route **nur** für das Gespräch, auf einen `openai-compatible`-Provider mit
   * injiziertem `fetch`. Der Tagesabschluss läuft damit absichtlich ohne Modell:
   * so ist die Heuristik-Zusage im selben Durchgang mitgeprüft.
   */
  async function routeCoachTo(responder: FetchResponder) {
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
    await harness.settings.setVaultSection('routing', {
      tasks: { 'journal-chat': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(responder);
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  /** Antwort in fünf Stücken, wie ein echter SSE-Strom. */
  function streamed(...replies: string[]): FetchResponder {
    return (_call, index) => {
      const text = replies[Math.min(index, replies.length - 1)] ?? '';
      const size = Math.max(1, Math.ceil(text.length / 5));
      const parts: string[] = [];
      for (let at = 0; at < text.length; at += size) parts.push(text.slice(at, at + size));
      return sseResponse(
        sseChunks(parts.map((part) => ({ choices: [{ delta: { content: part } }] }))),
      );
    };
  }

  async function waitForDone(messageId: string): Promise<IpcEvents['event:llm-stream']> {
    return vi.waitFor(
      () => {
        const done = harness.streams.find((event) => event.messageId === messageId && event.done);
        expect(done, 'kein Abschluss-Ereignis').toBeDefined();
        return done as IpcEvents['event:llm-stream'];
      },
      { interval: 20 },
    );
  }

  /* Haltung „Tipps": seit 011 fragt `listen` kein Modell mehr (die Haltung legt nur
     ab, über `journal:append`) — hier geht es aber gerade um die Runde mit Antwort. */
  async function coachRound(message: string): Promise<IpcEvents['event:llm-stream']> {
    const { messageId } = await harness.call('journal:coach', {
      mode: 'tips',
      date: DATE,
      message,
      useHistory: true,
    });
    return waitForDone(messageId);
  }

  it('trägt Tag, Gespräch, Stimmung, Abschluss und Pflege durch dieselben Dateien', async () => {
    await routeCoachTo(streamed(FIRST_REPLY, SECOND_REPLY));

    // ── Tageseintrag anlegen ─────────────────────────────────────────────────
    const created = await harness.call('journal:setDay', { date: DATE, text: DAY_TEXT });
    expect(created.path).toBe(DAY_PATH);
    const fresh = (await vault.read(DAY_PATH)) ?? '';
    /* Das Format aus docs/VAULT-FORMAT.md, vom Kern angelegt — die Abschnitte eines
       frischen Tages stehen da, auch der noch leere. Seit 011 sind es zwei: „Tag"
       trägt den Strom aus Prosa und Antworten, „Gespräch" wird nicht mehr angelegt. */
    expect(fresh).toContain('type: journal');
    expect(fresh).toContain(`date: ${DATE}`);
    expect(fresh).toContain('## Tag');
    expect(fresh).not.toContain('## Gespräch');
    expect(fresh).toContain('## Fakten');
    expect(fresh).toContain('doppelten Interceptor');

    // ── Zwei Coaching-Runden ─────────────────────────────────────────────────
    const first = await coachRound('Der Sprint fühlt sich unmöglich an.');
    expect(first.error).toBeUndefined();
    const second = await coachRound('Und morgen kommt die Abnahme.');
    expect(second.error).toBeUndefined();
    /* Ein Tag ist ein Faden: beide Runden tragen dieselbe Thread-Marke. */
    expect(second.threadId).toBe(first.threadId);

    const talked = (await vault.read(DAY_PATH)) ?? '';
    const stream = talked.slice(talked.indexOf('## Tag'), talked.indexOf('## Fakten'));
    /* Ein Strom unter „Tag" (011): meine Sätze als Prosa, jede Antwort als
       Blockquote-Block darunter — Sprecherzeile mit Uhrzeit wie in VAULT-FORMAT.md.
       Meine Worte werden nie zitiert, deshalb steht dort keine „Ich"-Zeile. */
    expect(stream.match(/^> \*\*Gaston\*\* — \d\d:\d\d$/gm)).toHaveLength(2);
    expect(stream).not.toContain('> **Ich**');
    for (const line of ['Der Sprint fühlt sich unmöglich an.', 'Und morgen kommt die Abnahme.']) {
      expect(stream).toContain(`\n${line}\n`);
    }
    for (const reply of [FIRST_REPLY, SECOND_REPLY]) {
      expect(stream).toContain(`> ${reply}`);
    }
    /* Der Renderer bekommt den Tag getrennt, ohne selbst Markdown zu lesen — und
       dieser Tag hat keinen Alt-Abschnitt, also auch keine Alt-Runden. */
    const view = await harness.call('journal:get', { date: DATE });
    expect(view?.turns).toEqual([]);

    // ── Stimmung: genau eine Zeile ───────────────────────────────────────────
    const beforeMood = (await vault.read(DAY_PATH)) ?? '';
    await harness.call('journal:setMood', { date: DATE, mood: 4 });
    const afterMood = (await vault.read(DAY_PATH)) ?? '';
    const moodDiff = lineDiff(beforeMood, afterMood);
    expect(moodDiff.added).toEqual(['mood: 4']);
    expect(moodDiff.removed).toEqual([]);

    // ── Tagesabschluss: schlägt vor, schreibt nicht ──────────────────────────
    const untouched = (await vault.read(DAY_PATH)) ?? '';
    const suggestion = await closeDay(harness, DATE);
    expect(suggestion).not.toBeNull();
    /* Ohne Route für `extract-tasks` läuft der Abschluss deterministisch — und
       sagt es, statt eine Deutung zu behaupten. */
    expect(suggestion?.heuristic).toBe(true);
    expect(suggestion?.proposal.todos.length).toBeGreaterThan(0);
    expect(suggestion?.proposal.todos.some((todo) => /Interceptor/.test(todo.text))).toBe(true);
    /* Aus den Sätzen des Coachs wird kein Todo — gelesen wird nur „Tag". */
    expect(suggestion?.proposal.todos.some((todo) => todo.text.includes('hineinpasst'))).toBe(
      false,
    );
    expect((await vault.read(DAY_PATH)) ?? '').toBe(untouched);

    // ── Erst nach Bestätigung landen die Todos ───────────────────────────────
    /* Wohin, entscheidet der Text des Todos: nennt es ein Projekt, geht es in
       dessen Datei, sonst unter „Fakten" des Tages. Der Vorschlag sagt es vorher —
       deshalb steht der Stand dieser Dateien hier schon fest, bevor geschrieben wird. */
    const targets = [
      DAY_PATH,
      ...[suggestion?.proposal.primary, ...(suggestion?.proposal.extras ?? [])]
        .filter((action) => action !== undefined)
        .map((action) => action.path),
    ];
    const before = new Map<string, string>();
    for (const path of targets) before.set(path, (await vault.read(path)) ?? '');

    const applied = await harness.call('journal:applyClose', {
      date: DATE,
      todos: suggestion?.proposal.todos ?? [],
      /* Genau, was die Karte zeigt: Personen, Projekte und Tags des Tages. Der
         Tageseintrag wird also auch selbst geschrieben. */
      frontmatter: suggestion?.frontmatter ?? {
        people: [],
        projects: [],
        mood: null,
        energy: null,
        tags: [],
        areas: [],
      },
    });
    expect(applied.written).toContain(DAY_PATH);
    expect(applied.written.length).toBeGreaterThan(0);
    const lines = (await Promise.all(applied.written.map((path) => vault.read(path)))).join('\n');
    expect(lines).toMatch(/- \[ \] .*Interceptor/);

    // ── Und der Rückweg stellt den Stand davor wieder her ────────────────────
    expect(applied.undo.length).toBeGreaterThan(0);
    for (const entry of applied.undo) await harness.call('vault:write', entry);
    const back = (await vault.read(DAY_PATH)) ?? '';
    /* Der Rumpf ist zeichengleich — die Prosa und das Gespräch hat der Rückweg
       nicht angefasst. */
    expect(back.slice(back.indexOf('## Tag'))).toBe(untouched.slice(untouched.indexOf('## Tag')));
    const dayDiff = lineDiff(untouched, back);
    expect(dayDiff.removed).toEqual([]);
    /* Was übrig bleibt, ist die bekannte Grenze: **ein Frontmatter-Patch kann kein
       Feld entfernen.** Ein Feld, das es vorher nicht gab, steht danach leer da —
       begründet in `journal-day.ts` (`previousFields`). Ein erfundener alter Wert
       wäre schlimmer als eine leere Liste — und `closed: null` ist genau das,
       was „wieder offen" in der Datei heißt (009). */
    expect(dayDiff.added.filter((line) => !/^[a-z]+: (\[\]|null)$/.test(line))).toEqual([]);

    for (const path of applied.written) {
      /* Die Zeile ist weg, und keine andere fehlt. */
      const now = (await vault.read(path)) ?? '';
      expect(now, path).not.toMatch(/- \[ \] .*Interceptor/);
      expect(lineDiff(before.get(path) ?? '', now).removed, path).toEqual([]);
    }

    // ── Pflege: die gesäten Mängel stehen da ─────────────────────────────────
    const report = await harness.call('gardener:run', {});
    /* Ohne Route für `gardener-audit` bleibt der Lauf deterministisch — Guardrail 1. */
    expect(report.usedLlm).toBe(false);
    expect(report.healthKnown).toBe(true);
    const kinds = new Set(report.findings.map((finding) => finding.kind));
    for (const kind of ['broken-link', 'orphan', 'index-drift', 'unprocessed-source']) {
      expect(kinds, `gesäter Mangel ${kind}`).toContain(kind);
    }
    /* Widersprüche entstehen nur im Audit. Ohne Modell wird keiner behauptet. */
    expect(kinds.has('contradiction')).toBe(false);

    // ── Ein Fix schreibt genau seine Vorschau und ist rückgängig ─────────────
    const drift = report.findings.find(
      (finding) => finding.kind === 'index-drift' && finding.fix?.action === 'add-to-index',
    );
    expect(drift, 'ein Fix für den fehlenden Katalogeintrag').toBeDefined();
    const catalogBefore = (await vault.read(CATALOG)) ?? '';
    const logBefore = (await vault.read(LOG)) ?? '';

    const fix = await harness.call('gardener:applyFix', { finding: drift as GardenerFinding });
    expect(fix.written).toEqual([CATALOG]);
    expect(fix.undoToken).toBeDefined();
    const catalogAfter = (await vault.read(CATALOG)) ?? '';
    expect(lineDiff(catalogBefore, catalogAfter).added).toContain(drift?.fix?.preview ?? '');

    /* Die Chronik trägt den `lint`-Eintrag — MODULE-SCHEMA.md: jeder Eingriff der
       App steht im log.md des Moduls. */
    const logAfter = (await vault.read(LOG)) ?? '';
    expect(logAfter.length).toBeGreaterThan(logBefore.length);
    expect(logAfter).toMatch(/^## \[\d{4}-\d\d-\d\d\] lint/m);
    expect(logAfter).toContain('index-drift (add-to-index)');

    const undone = await harness.call('gardener:undoFix', {
      undoToken: fix.undoToken as string,
    });
    expect(undone.restored).toEqual([CATALOG]);
    expect(undone.kept).toEqual([]);
    expect((await vault.read(CATALOG)) ?? '').toBe(catalogBefore);
    /* Der Chronikeintrag bleibt: `log.md` ist append-only, und ein Eingriff, den es
       gab, wird nicht aus der Geschichte gestrichen. */
    expect((await vault.read(LOG)) ?? '').toBe(logAfter);
  });

  it('schreibt ohne Route den Eintrag, erfindet keine Antwort und findet trotzdem', async () => {
    /* Kein Provider, keine Route — und kein `fetch`: gäbe es einen Aufruf, würde er
       hier scheitern statt heimlich ins Netz zu gehen. */
    vi.stubGlobal('fetch', () => {
      throw new Error('ohne Route darf niemand ein Modell rufen');
    });
    await harness.call('journal:setDay', { date: DATE, text: DAY_TEXT });

    const done = await coachRound('Der Sprint fühlt sich unmöglich an.');
    /* Der Grund kommt als Code; formuliert wird im Renderer. */
    expect(done.error).toBe('no-route');
    expect(done.delta).toBe('');

    const written = (await vault.read(DAY_PATH)) ?? '';
    /* Die eigenen Worte stehen da — geschrieben, bevor gefragt wird, als Prosa. */
    expect(written).toContain('\nDer Sprint fühlt sich unmöglich an.\n');
    /* Und kein Antwortblock: gespielte Empathie wäre schlimmer als Stille. */
    expect(written).not.toContain('> **Gaston**');
    const view = await harness.call('journal:get', { date: DATE });
    expect(view?.turns).toEqual([]);

    /* Der Tagesabschluss läuft trotzdem und sagt, dass er ohne Modell entstand. */
    const suggestion = await closeDay(harness, DATE);
    expect(suggestion?.heuristic).toBe(true);
    expect(suggestion?.proposal.todos.length).toBeGreaterThan(0);

    /* Und die Pflege liefert die deterministischen Befunde vollständig. */
    const report = await harness.call('gardener:run', {});
    expect(report.usedLlm).toBe(false);
    expect(findingOfKind(report.findings, 'broken-link').paths.length).toBeGreaterThan(0);
    expect(findingOfKind(report.findings, 'orphan').paths.length).toBeGreaterThan(0);
    expect(report.advice).toEqual([]);
  });
});
