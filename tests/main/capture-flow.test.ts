/* Welle B als Ganzes: der Weg eines Gedanken durch die **echten** Handler.
 *
 * Anders als `capture-ipc.test.ts`, das die Erfassen-Kanäle für sich prüft, läuft
 * hier die vollständige Handler-Karte aus `register-all.ts` auf einem Temp-Vault —
 * dieselbe Karte, die die App registriert. Damit ist geprüft, dass Erfassen,
 * Einordnen, Ablegen, LLM-Verwaltung und Einstellungen zusammen funktionieren und
 * nicht nur jedes für sich.
 *
 * Zwei Wege:
 *   1. Ohne Modell: dumpen → Inbox → heuristischer Vorschlag → Ziel wechseln →
 *      ablegen → die Zieldatei enthält genau den erwarteten Markdown-Block →
 *      Rückgängig stellt alles her.
 *   2. Mit Modell: Provider anlegen → Modelle abfragen → Route setzen → dieselbe
 *      Einordnung benutzt danach wirklich das Modell.
 *
 * Kein echtes Netz und kein echter Dienst: `fetch` ist gefälscht. Der
 * `FakeProvider` des Kerns lässt sich hier absichtlich nicht nehmen —
 * `llm:addProvider` weist `kind: 'fake'` ab, weil diese Art Tests und dem
 * Demo-Modus gehört. Über die echten Handler bleibt nur der Weg über eine
 * OpenAI-kompatible Adresse mit injiziertem `fetch`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { FilingAction } from '@shared/types';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW_MS, TODAY } from '../helpers/time';

/* Electron gibt es im Test nicht: keine Fenster, keine Verschlüsselung, keine
   Dialoge. Gerufen wird davon nichts — die Handler-Karte wird aber vollständig
   gebaut, also müssen alle Bereiche importierbar sein. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
  safeStorage: { isEncryptionAvailable: () => false },
  globalShortcut: { register: vi.fn(), unregister: vi.fn(), unregisterAll: vi.fn() },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

const PROJECT = 'projects/work/kundenportal-relaunch/project.md';
const HOCHBEET = 'projects/private/hochbeet-bauen/project.md';

/** Ein Gedanke, wie er wirklich getippt wird: ein Ziel, eine Aufgabe, eine Frist. */
const DUMP_TEXT =
  'Kundenportal: die Angebotsliste braucht bei 400 Zeilen über drei Sekunden. ' +
  'Bis morgen die Ladezeiten messen.';

async function createApp(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { createLlmBridge } = await import('../../src/main/llm-bridge');
  const { buildHandlers } = await import('../../src/main/ipc/register-all');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);

  /* Wie `core-bridge.ts`, nur ohne Watcher: chokidar hat in einem Test nichts zu
     beobachten, und der Index zieht über die Handler selbst nach. */
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));
  services.attachLlm(createLlmBridge(services));

  const handlers = buildHandlers(services);
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events: vi.spyOn(services, 'sendEvent') };
}

type App = Awaited<ReturnType<typeof createApp>>;

describe('Der Weg eines Gedanken durch die echten Handler', () => {
  let vault: TempVault;
  let userDataDir: string;
  let app: App;

  beforeEach(async () => {
    /* Feste Uhr: nur so lässt sich der geschriebene Block wortwörtlich vergleichen —
       er trägt das Datum als Unterüberschrift. Timer bleiben echt. */
    vi.useFakeTimers({ now: NOW_MS, toFake: ['Date'] });
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-flow-'));
    app = await createApp(userDataDir);
    await app.call('vault:open', { path: vault.root });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    await app.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── Ohne Modell ────────────────────────────────────────────────────────────

  it('dumpt, schlägt heuristisch vor, legt in ein gewechseltes Ziel ab und nimmt es zurück', async () => {
    const before = { work: await vault.read(PROJECT), private: await vault.read(HOCHBEET) };

    // 1. Erfassen: der Gedanke liegt sofort als Datei.
    const dump = await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    expect(dump.path.startsWith('inbox/')).toBe(true);
    const raw = (await vault.read(dump.path)) ?? '';
    expect(raw.startsWith('---\n')).toBe(true);
    expect(raw).toContain('type: dump');
    expect(raw).toContain('status: raw');
    expect(raw).toContain(DUMP_TEXT);

    // 2. Die Inbox zeigt ihn — vor jedem Watcher-Lauf.
    const inbox = await app.call('capture:inbox', undefined);
    expect(inbox.map((entry) => entry.path)).toContain(dump.path);

    // 3. Ohne Route entscheidet die Heuristik, mit nachvollziehbarem Grund.
    const proposal = await app.call('capture:classify', { path: dump.path });
    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(PROJECT);
    expect(proposal.reason).toMatch(/Kundenportal/i);
    expect(proposal.confidence).toBeLessThanOrEqual(0.6);
    expect(proposal.todos.map((todo) => todo.due)).toContain('2026-08-11');

    // 4. Der Mensch wechselt das Ziel: „eigentlich privat, ins Hochbeet".
    const target = proposal.alternatives.find((action) => action.path === HOCHBEET);
    expect(target).toBeDefined();

    // 5. Ablegen.
    const result = await app.call('capture:apply', {
      proposal: { ...proposal, primary: target as FilingAction },
    });
    expect(result.written).toContain(HOCHBEET);
    expect(result.undoToken).not.toBeNull();

    /* 6. Die Zieldatei trägt genau den erwarteten Block: Datum als
       Unterüberschrift am Ende von „Notizen" (angehängt heißt angehängt — die
       Chronik bleibt aufsteigend), das Todo als Checkbox unter „Todos". */
    const filed = (await vault.read(HOCHBEET)) ?? '';
    expect(filed).toContain(
      [
        '## Notizen',
        '',
        '### 2026-08-08',
        '',
        'Schnittliste: 4 × 120 cm, 4 × 60 cm, 4 × 80 cm für die Ecken, plus zwei Querstreben.',
        '',
        `### ${TODAY}`,
        '',
        DUMP_TEXT,
      ].join('\n'),
    );
    /* Das Todo nennt selbst ein Projekt (der Text sagt „Kundenportal"), also
       landet es dort und nicht beim gewählten Hauptziel. Das ist Absicht — und
       in der Karte sichtbar (`inbox.proposal.todoInto`), sonst wäre es ein
       Schreibvorgang in eine Datei, die niemand gewählt hat. */
    const todo = proposal.todos[0];
    expect(todo?.project).toBe('kundenportal-relaunch');
    expect(result.written).toContain(PROJECT);
    expect((await vault.read(PROJECT)) ?? '').toContain(
      [
        '- [ ] Fallback für abgelaufene Sitzungen bauen @wait:Jonas @needed:2026-08-12',
        '- [x] Bilder auf WebP umgestellt @done:2026-08-06',
        '- [ ] Bis morgen die Ladezeiten messen @due:2026-08-11',
      ].join('\n'),
    );
    /* Im gewählten Ziel steht der Text, aber keine erfundene Checkbox. */
    expect(filed).not.toContain('@due:2026-08-11');
    expect(await vault.exists(dump.path)).toBe(false);

    // 7. Rückgängig: Bestand wie vorher — in beiden Dateien — Dump wieder da.
    await app.call('capture:undo', { undoToken: result.undoToken ?? '' });

    expect(await vault.read(HOCHBEET)).toBe(before.private);
    expect(await vault.read(PROJECT)).toBe(before.work);
    expect(await vault.exists(dump.path)).toBe(true);
    expect((await vault.read(dump.path)) ?? '').toContain('status: raw');
    const back = await app.call('capture:inbox', undefined);
    expect(back.map((entry) => entry.path)).toContain(dump.path);
  });

  it('meldet jeden Schritt an den Renderer, damit die Oberfläche nachlädt', async () => {
    const dump = await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    const proposal = await app.call('capture:classify', { path: dump.path });
    app.events.mockClear();

    await app.call('capture:apply', { proposal });

    const changed = app.events.mock.calls.filter(([name]) => name === 'event:vault-changed');
    expect(changed).toHaveLength(1);
    expect(changed[0]?.[1]).toMatchObject({ external: false });
    expect((changed[0]?.[1] as { paths: string[] }).paths).toContain(PROJECT);
  });

  // ── Mit Modell ─────────────────────────────────────────────────────────────

  it('nimmt einen angelegten Provider samt Route und ordnet danach mit dem Modell ein', async () => {
    const verdict = {
      title: 'Angebotsliste lädt zu langsam',
      scope: 'work',
      tags: ['kundenportal'],
      target: 'project',
      targetKey: 'kundenportal-relaunch',
      section: 'Notizen',
      reason: 'Der Text beschreibt die Angebotsliste dieses Projekts.',
      confidence: 0.91,
      todos: [],
      waitingOn: [],
      entities: [],
    };
    /* Ein Dienst, der Modelle listet und Antworten gibt — beides über gefälschtes
       `fetch`, nichts davon geht ins Netz. */
    const fake = createFetchFake((call) =>
      call.url.includes('/models')
        ? jsonResponse({ data: [{ id: 'qwen2.5:14b' }, { id: 'llama3.2:3b' }] })
        : jsonResponse({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
    );
    vi.stubGlobal('fetch', fake.fetch);

    // Vorher: kein Provider, keine Route, also Heuristik.
    expect(await app.call('llm:providers', undefined)).toEqual([]);
    const first = await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    expect((await app.call('capture:classify', { path: first.path })).heuristic).toBe(true);
    expect(fake.calls).toHaveLength(0);

    // Provider anlegen — nur über diesen Kanal, mit Schlüssel im Schlüsselspeicher.
    const provider = await app.call('llm:addProvider', {
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      local: true,
    });
    expect(provider.id).toBeTruthy();
    expect(provider.hasKey).toBe(false);

    // Modelle abfragen: was dort läuft, steht danach am Provider.
    const models = await app.call('llm:models', { id: provider.id });
    expect(models).toContain('qwen2.5:14b');
    const stored = await app.call('llm:providers', undefined);
    expect(stored[0]?.models).toEqual(models);

    // Route setzen — der Mensch bestätigt, nichts geschieht von selbst.
    const routing = await app.call('llm:setRoute', {
      task: 'classify-dump',
      ref: { providerId: provider.id, model: 'qwen2.5:14b' },
    });
    expect(routing.tasks['classify-dump']).toEqual({
      providerId: provider.id,
      model: 'qwen2.5:14b',
    });

    // Dieselbe Aufgabe, jetzt mit Modell: die Entscheidung kommt von dort.
    const second = await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    const proposal = await app.call('capture:classify', { path: second.path });

    expect(proposal.heuristic).toBe(false);
    expect(proposal.title).toBe('Angebotsliste lädt zu langsam');
    expect(proposal.confidence).toBe(0.91);
    expect(proposal.reason).toBe('Der Text beschreibt die Angebotsliste dieses Projekts.');
    expect(proposal.primary.path).toBe(PROJECT);
    /* Es war wirklich ein Aufruf an die eingerichtete Adresse. */
    const completions = fake.calls.filter((call) => call.url.includes('/chat/completions'));
    expect(completions).toHaveLength(1);
    expect(completions[0]?.url.startsWith('http://localhost:11434/v1')).toBe(true);
    expect(completions[0]?.body?.model).toBe('qwen2.5:14b');

    /* Und der Weg bleibt begehbar: ablegen funktioniert mit dem Modellvorschlag
       genauso wie mit dem heuristischen. */
    const result = await app.call('capture:apply', { proposal });
    expect((await vault.read(PROJECT)) ?? '').toContain('Bis morgen die Ladezeiten messen.');
    expect(result.undoToken).not.toBeNull();
  });

  it('nimmt mit dem Provider auch seine Route mit — keine Route zeigt ins Leere', async () => {
    vi.stubGlobal('fetch', createFetchFake(() => jsonResponse({ data: [] })).fetch);
    const provider = await app.call('llm:addProvider', {
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      local: true,
    });
    await app.call('llm:setRoute', {
      task: 'classify-dump',
      ref: { providerId: provider.id, model: 'qwen2.5:14b' },
    });

    await app.call('llm:removeProvider', { id: provider.id });

    expect(await app.call('llm:routing', undefined)).toEqual({ tasks: {}, defaults: {} });
    /* Und das Einordnen fällt sauber auf die Heuristik zurück. */
    const dump = await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    expect((await app.call('capture:classify', { path: dump.path })).heuristic).toBe(true);
  });

  // ── Einstellungen und Erfassen greifen ineinander ──────────────────────────

  it('schaltet das Einordnen im Hintergrund über die Einstellungen scharf', async () => {
    const fake = createFetchFake(() =>
      jsonResponse({ choices: [{ message: { content: '{"target":"inbox"}' } }] }),
    );
    vi.stubGlobal('fetch', fake.fetch);
    const provider = await app.call('llm:addProvider', {
      label: 'Ollama',
      kind: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      local: true,
    });
    await app.call('llm:setRoute', {
      task: 'classify-dump',
      ref: { providerId: provider.id, model: 'qwen2.5:14b' },
    });

    await app.call('settings:setVault', { patch: { capture: { autoClassify: false } } });
    await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toHaveLength(0);

    await app.call('settings:setVault', { patch: { capture: { autoClassify: true } } });
    await app.call('capture:dump', { text: DUMP_TEXT, origin: 'window' });

    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
  });
});
