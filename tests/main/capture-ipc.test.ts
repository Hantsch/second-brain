/* Die Erfassen-Kanäle im Hauptprozess — an echten Dateien, ohne Netz.
 *
 * Der Prüfstein ist der Weg eines Gedanken: er landet als Datei, bekommt einen
 * begründeten Vorschlag (mit Modell oder ohne), wird abgelegt — und alles davon
 * lässt sich zurücknehmen. Was hier grün ist, funktioniert auch bei einem
 * Nutzer ohne Sprachmodell.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { FilingAction, FilingProposal } from '@shared/types';
import { isoDay, journalPath } from '@core/vault/paths';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

/* Electron gibt es im Test nicht: Fenster keine, Verschlüsselung keine. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  screen: {
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

/** Ein Index, der zählen und suchen kann, aber keine Ablageziele kennt. */
function crippledIndex() {
  return {
    stats: () => ({
      docs: 0,
      todos: 0,
      projects: 0,
      modules: 0,
      pages: 0,
      words: 0,
      builtAt: null,
      durationMs: null,
      oversized: [],
    }),
    rebuild: async () => crippledIndex().stats(),
    search: () => [],
  };
}

async function createHarness(userDataDir: string, options: { crippled?: boolean } = {}) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { captureHandlers } = await import('../../src/main/ipc/capture');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: chokidar hat in einem Test nichts zu beobachten. Der Index
     zieht über `settle()` im Handler nach — genau das soll geprüft werden. */
  services.attachIndex((root) =>
    options.crippled ? crippledIndex() : IndexService.open(new FsVaultStore(root)),
  );

  const handlers: Handlers = captureHandlers(services);
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

const PROJECT_PATH = 'projects/work/kundenportal-relaunch/project.md';

describe('Erfassen-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-capture-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  const dump = (text: string, patch: Partial<IpcRequest<'capture:dump'>> = {}) =>
    harness.call('capture:dump', { text, origin: 'window', ...patch });

  // ── Schreiben ──────────────────────────────────────────────────────────────

  it('schreibt den Dump sofort als Datei mit dem Frontmatter aus VAULT-FORMAT.md', async () => {
    const item = await dump('Die Angebotsliste braucht einen Sammelaufruf.', {
      origin: 'quick-capture',
      tags: ['kundenportal'],
      scope: 'work',
    });

    expect(item.path.startsWith('inbox/')).toBe(true);
    expect(item.status).toBe('raw');
    expect(item.title).toBe('Die Angebotsliste braucht einen Sammelaufruf.');
    const raw = await vault.read(item.path);
    expect(raw).toContain('type: dump');
    expect(raw).toContain('origin: quick-capture');
    expect(raw).toContain('status: raw');
    expect(raw).toContain('scope: work');
    expect(raw).toContain('- kundenportal');
    expect(raw).toContain('Die Angebotsliste braucht einen Sammelaufruf.');
  });

  it('meldet die Änderung, damit der Renderer nachlädt', async () => {
    const item = await dump('Noppenfolie und zwei Säcke Blumenerde besorgen.');
    expect(harness.events).toHaveBeenCalledWith('event:vault-changed', {
      paths: [item.path],
      external: false,
    });
  });

  it('weist einen leeren Dump ab, statt eine leere Datei anzulegen', async () => {
    await expect(dump('   \n  ')).rejects.toMatchObject({ code: 'invalid' });
  });

  // ── Inbox ──────────────────────────────────────────────────────────────────

  it('zeigt den gerade geschriebenen Dump in der Inbox', async () => {
    const item = await dump('Release in KW 34 einplanen.');
    const inbox = await harness.call('capture:inbox', undefined);
    expect(inbox.map((entry) => entry.path)).toContain(item.path);
  });

  it('findet auch einen Dump, den der Index noch nicht kennt', async () => {
    await vault.write(
      'inbox/2026-08-10-0900-von-hand.md',
      '---\ntype: dump\ntitle: Von Hand hineingelegt\ncreated: 2026-08-10T09:00:00+02:00\norigin: cli\nstatus: raw\ntags: []\nscope: null\n---\n\nEine Datei, die jemand selbst dorthin gelegt hat.\n',
    );

    const inbox = await harness.call('capture:inbox', undefined);

    const found = inbox.find((entry) => entry.path === 'inbox/2026-08-10-0900-von-hand.md');
    expect(found?.title).toBe('Von Hand hineingelegt');
    expect(found?.origin).toBe('cli');
  });

  it('stellt neueste zuerst und bewusst Liegengebliebenes hinten', async () => {
    await vault.write(
      'inbox/2026-08-09-1000-bleibt-liegen.md',
      '---\ntype: dump\ntitle: Bleibt liegen\ncreated: 2026-08-09T10:00:00+02:00\norigin: window\nstatus: kept\ntags: []\nscope: null\n---\n\nSoll einfach hier liegen.\n',
    );
    await vault.write(
      'inbox/2026-08-08-1000-aelter.md',
      '---\ntype: dump\ntitle: Älter\ncreated: 2026-08-08T10:00:00+02:00\norigin: window\nstatus: raw\ntags: []\nscope: null\n---\n\nÄlterer offener Dump.\n',
    );

    const inbox = await harness.call('capture:inbox', undefined);
    const titles = inbox.map((entry) => entry.title);

    expect(titles.indexOf('Älter')).toBeLessThan(titles.indexOf('Bleibt liegen'));
    expect(titles.at(-1)).toBe('Bleibt liegen');
  });

  // ── Einordnen ohne Modell ──────────────────────────────────────────────────

  it('ordnet ohne Route heuristisch ein und nennt einen echten Grund', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.');

    const proposal = await harness.call('capture:classify', { path: item.path });

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.target).toBe('project');
    expect(proposal.primary.path).toBe(PROJECT_PATH);
    expect(proposal.reason).toContain('Kundenportal');
    expect(proposal.confidence).toBeLessThanOrEqual(0.6);
    /* Der Text, der geschrieben würde, steht drin — wortwörtlich. */
    expect(proposal.primary.content).toContain('Ladezeiten der Angebotsliste');
    /* „Bleibt liegen" ist immer einen Klick entfernt. */
    expect(proposal.alternatives.some((action) => action.target === 'inbox')).toBe(true);
  });

  it('legt jedes erreichbare Ziel als fertige Aktion bei', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');

    const proposal = await harness.call('capture:classify', { path: item.path });
    const paths = proposal.alternatives.map((action) => action.path);

    expect(paths).toContain('areas/gesundheit.md');
    expect(paths).toContain('modules/identity-management/module.md');
    expect(paths.some((path) => path.startsWith('journal/'))).toBe(true);
    expect(paths).toContain(item.path);
    /* Der Text ist fertig: ein Bereich bekommt den Datumskopf, die Inbox nicht. */
    const area = proposal.alternatives.find((action) => action.path === 'areas/gesundheit.md');
    expect(area?.content.startsWith('### ')).toBe(true);
    expect(area?.section).toBe('Notizen');
  });

  it('legt einen Dump auch in einen Bereich ab, wenn der Nutzer das Ziel wechselt', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const area = proposal.alternatives.find((action) => action.path === 'areas/gesundheit.md');
    expect(area).toBeDefined();

    await harness.call('capture:apply', {
      proposal: { ...proposal, primary: area as NonNullable<typeof area>, extras: [] },
    });

    expect(await vault.read('areas/gesundheit.md')).toContain('Ladezeiten der Angebotsliste');
    expect(await vault.read(PROJECT_PATH)).not.toContain('Ladezeiten der Angebotsliste prüfen.');
  });

  it('sagt bei einem Dump, den es nicht gibt, dass es ihn nicht gibt', async () => {
    await expect(
      harness.call('capture:classify', { path: 'inbox/gibt-es-nicht.md' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  // ── Einordnen mit Modell ───────────────────────────────────────────────────

  /** Ein Modell, das über gefälschtes `fetch` antwortet — nie ein echter Dienst. */
  async function routeToFakeModel(verdict: Record<string, unknown>) {
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
      tasks: { 'classify-dump': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(() =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify(verdict) } }] }),
    );
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  it('nimmt die Antwort des Modells und fragt es nur einmal je Dump', async () => {
    const fake = await routeToFakeModel({
      title: 'Sammelaufruf für Berechtigungen',
      scope: 'work',
      tags: ['kundenportal'],
      target: 'project',
      targetKey: 'kundenportal-relaunch',
      section: 'Notizen',
      reason: 'Der Text beschreibt die Angebotsliste dieses Projekts.',
      confidence: 0.88,
      todos: [],
      waitingOn: [],
      entities: [],
    });
    const item = await dump('Für jede Zeile werden die Berechtigungen einzeln nachgeladen.');

    const first = await harness.call('capture:classify', { path: item.path });
    const second = await harness.call('capture:classify', { path: item.path });

    expect(first.heuristic).toBe(false);
    expect(first.title).toBe('Sammelaufruf für Berechtigungen');
    expect(first.confidence).toBe(0.88);
    expect(second).toEqual(first);
    /* Genau ein Modellaufruf: der zweite kam aus dem Speicher. */
    expect(fake.calls).toHaveLength(1);
  });

  it('ordnet nach dem Dump von selbst ein, ohne dass jemand fragt', async () => {
    const fake = await routeToFakeModel({
      target: 'project',
      targetKey: 'kundenportal-relaunch',
      reason: 'Gehört zum Kundenportal.',
      confidence: 0.8,
    });

    await dump('Kundenportal: die Angebotsliste ist zu langsam.');

    await vi.waitFor(() => expect(fake.calls).toHaveLength(1));
    /* Der Vorschlag lag schon bereit — kein zweiter Aufruf. */
    const inbox = await harness.call('capture:inbox', undefined);
    const first = inbox[0];
    expect(first).toBeDefined();
    await harness.call('capture:classify', { path: first?.path ?? '' });
    expect(fake.calls).toHaveLength(1);
  });

  it('lässt das Einordnen im Hintergrund weg, wenn es abgeschaltet ist', async () => {
    const fake = await routeToFakeModel({ target: 'inbox' });
    await harness.settings.setVaultSection('capture', {
      ...(harness.settings.vault()?.capture ?? { quickCaptureShortcut: '' }),
      autoClassify: false,
      closeAfterCapture: true,
    });

    await dump('Kundenportal: die Angebotsliste ist zu langsam.');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fake.calls).toHaveLength(0);
  });

  it('meldet als Toast, wenn das Einordnen im Hintergrund scheitert', async () => {
    const broken = await createHarness(userDataDir, { crippled: true });
    await broken.services.openVault(vault.root);

    await broken.call('capture:dump', { text: 'Kundenportal prüfen.', origin: 'window' });

    await vi.waitFor(() =>
      expect(broken.events).toHaveBeenCalledWith('event:toast', {
        kind: 'warn',
        message: 'toast.classifyFailed',
      }),
    );
    await broken.services.closeVault();
  });

  it('verwirft ein Ziel, das es nicht gibt, und behält die Heuristik', async () => {
    await routeToFakeModel({
      target: 'project',
      targetKey: 'gibt-es-nicht',
      reason: 'Frei erfunden.',
      confidence: 0.99,
    });
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');

    const proposal = await harness.call('capture:classify', { path: item.path });

    expect(proposal.heuristic).toBe(true);
    expect(proposal.reason).not.toBe('Frei erfunden.');
    expect(proposal.primary.path).toBe(PROJECT_PATH);
  });

  it('ordnet weiter ein, wenn das Modell ausfällt', async () => {
    await routeToFakeModel({});
    vi.stubGlobal('fetch', createFetchFake(() => new Error('connect ECONNREFUSED')).fetch);
    const item = await dump('Kundenportal: Ladezeiten prüfen.');

    const proposal = await harness.call('capture:classify', { path: item.path });

    expect(proposal.heuristic).toBe(true);
    expect(proposal.primary.path).toBe(PROJECT_PATH);
  });

  // ── Ablegen und zurücknehmen ───────────────────────────────────────────────

  it('legt ab: Notiz unter Notizen, Todo unter Todos, Dump bleibt als Beleg', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    expect(proposal.todos.length).toBeGreaterThan(0);

    const result = await harness.call('capture:apply', { proposal });

    expect(result.written).toContain(PROJECT_PATH);
    expect(result.undoToken).not.toBeNull();
    const project = (await vault.read(PROJECT_PATH)) ?? '';
    expect(project).toContain('Ladezeiten der Angebotsliste bis morgen prüfen');
    expect(project).toContain('- [ ] ');
    expect(project).toContain('@due:');
    /* Der Dump bleibt liegen und trägt den Beleg: wohin und wann. Gelöscht wird
       nichts — die Liste kennt ihn weiter, jetzt als „filed" statt als offen. */
    expect(await vault.exists(item.path)).toBe(true);
    const receipt = (await vault.read(item.path)) ?? '';
    expect(receipt).toContain('status: filed');
    expect(receipt).toContain(`filed_into: ${PROJECT_PATH}`);
    expect(receipt).toMatch(/filed_at: \d{4}-\d{2}-\d{2}/);
    expect(receipt).toContain('Ladezeiten der Angebotsliste bis morgen prüfen.');

    const inbox = await harness.call('capture:inbox', undefined);
    const listed = inbox.find((entry) => entry.path === item.path);
    expect(listed?.status).toBe('filed');
    expect(listed?.filedInto).toBe(PROJECT_PATH);
    expect(listed?.filedAt).not.toBeNull();
  });

  it('nimmt eine Ablage vollständig zurück', async () => {
    const before = (await vault.read(PROJECT_PATH)) ?? '';
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const result = await harness.call('capture:apply', { proposal });

    await harness.call('capture:undo', { undoToken: result.undoToken ?? '' });

    expect(await vault.exists(item.path)).toBe(true);
    const after = (await vault.read(PROJECT_PATH)) ?? '';
    expect(after).not.toContain('Ladezeiten der Angebotsliste bis morgen prüfen');
    /* Der Bestand ist wieder der von vorher — Zeile für Zeile. */
    expect(after.trim()).toBe(before.trim());
    /* Auch der Beleg ist weg: er zeigte auf eine Ablage, die es nicht mehr gibt.
       Nennt das Rückgängig den Dump nicht, zieht der Aufrufer den Index für diese
       Datei nicht nach — dann stünde in der Liste weiter „filed". */
    const inbox = await harness.call('capture:inbox', undefined);
    const reopened = inbox.find((entry) => entry.path === item.path);
    expect(reopened?.status).toBe('raw');
    expect(reopened?.filedInto).toBeNull();
    expect(reopened?.filedAt).toBeNull();
  });

  it('schreibt nur die Todos, die der Nutzer stehen gelassen hat', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste bis morgen prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const edited: FilingProposal = {
      ...proposal,
      primary: { ...proposal.primary, content: '### 2026-08-10\n\nVom Nutzer umgeschrieben.' },
      todos: [],
      extras: [],
    };

    await harness.call('capture:apply', { proposal: edited });

    const project = (await vault.read(PROJECT_PATH)) ?? '';
    expect(project).toContain('Vom Nutzer umgeschrieben.');
    expect(project).not.toContain('Ladezeiten der Angebotsliste bis morgen prüfen');
  });

  // ── Main prüft nach, was der Renderer schickt ─────────────────────────────

  it('capture:apply refuses a tampered primary path and writes nothing', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const tampered: FilingProposal = {
      ...proposal,
      primary: {
        ...proposal.primary,
        target: 'project',
        path: 'projects/work/gibt-es-nicht/project.md',
      },
    };

    await expect(harness.call('capture:apply', { proposal: tampered })).rejects.toMatchObject({
      code: 'invalid',
    });

    expect(await vault.exists('projects/work/gibt-es-nicht/project.md')).toBe(false);
    expect(await vault.read(item.path)).not.toContain('status: filed');
  });

  it('capture:apply ignores renderer-supplied extras when no todo comes along', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const smuggled: FilingAction = {
      target: 'area',
      path: 'areas/gesundheit.md',
      section: 'Todos',
      content: '- [ ] Eingeschleust',
    };
    const tampered: FilingProposal = { ...proposal, todos: [], extras: [smuggled] };

    await harness.call('capture:apply', { proposal: tampered });

    expect(await vault.read('areas/gesundheit.md')).not.toContain('Eingeschleust');
  });

  it('capture:apply refuses a dumpPath outside the inbox', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const tampered: FilingProposal = { ...proposal, dumpPath: PROJECT_PATH };

    await expect(harness.call('capture:apply', { proposal: tampered })).rejects.toMatchObject({
      code: 'invalid',
    });

    expect(await vault.read(PROJECT_PATH)).not.toContain('status: filed');
  });

  it('files into an edited target the proposal offered', async () => {
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    const area = proposal.alternatives.find((action) => action.path === 'areas/gesundheit.md');
    expect(area).toBeDefined();
    const edited: FilingAction = {
      ...(area as FilingAction),
      content: '### 2026-08-22\n\nVom Nutzer umformuliert.',
    };

    const result = await harness.call('capture:apply', {
      proposal: { ...proposal, primary: edited, extras: [], todos: [] },
    });

    expect(result.written).toContain('areas/gesundheit.md');
    expect(await vault.read('areas/gesundheit.md')).toContain('Vom Nutzer umformuliert.');
  });

  it('every target withAllTargets offers passes re-validation', async () => {
    /* `Run.append` in the core only appends to a file that already exists; a
       fresh day's journal entry is normally created by the journal module
       (`ensureDay`), before capture ever touches it. Filing into "today" is
       therefore only reachable once that file exists — same as in the app. */
    const today = isoDay(new Date());
    await vault.write(
      journalPath(today),
      `---\ntype: journal\ntitle: Testtag\ndate: ${today}\nlang: de\ntags: []\n---\n\n## Tag\n\n## Fakten\n`,
    );
    const item = await dump('Kundenportal: Ladezeiten der Angebotsliste prüfen.');
    const proposal = await harness.call('capture:classify', { path: item.path });
    expect(proposal.alternatives.length).toBeGreaterThan(0);

    for (const target of proposal.alternatives) {
      const result = await harness.call('capture:apply', {
        proposal: { ...proposal, primary: target, extras: [], todos: [] },
      });
      if (result.undoToken !== null) {
        await harness.call('capture:undo', { undoToken: result.undoToken });
      }
    }
  });

  it('lässt einen Dump bewusst liegen, ohne ihn zu verschieben — und bietet den Rückweg', async () => {
    const item = await dump('Zu viele Baustellen gleichzeitig.');

    const { dump: kept, undoToken } = await harness.call('capture:keep', { path: item.path });

    expect(kept.status).toBe('kept');
    expect(await vault.read(item.path)).toContain('status: kept');
    expect(await vault.exists(item.path)).toBe(true);

    /* „Liegen lassen" ist keine Aktion ohne Rückgängig: der Dump verschwindet
       nicht, aber sein voriger Status kommt zurück. */
    await harness.call('capture:undo', { undoToken });
    expect(await vault.read(item.path)).not.toContain('status: kept');
    expect(await vault.exists(item.path)).toBe(true);
  });

  it('verwirft einen Dump mit Rückweg', async () => {
    const item = await dump('Doch nichts.');

    const { undoToken } = await harness.call('capture:discard', { path: item.path });
    expect(await vault.exists(item.path)).toBe(false);

    await harness.call('capture:undo', { undoToken });
    expect(await vault.exists(item.path)).toBe(true);
  });

  it('weist einen Vorschlag ohne Dump ab', async () => {
    await expect(
      harness.call('capture:apply', {
        proposal: { todos: [] } as unknown as FilingProposal,
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('verlangt einen offenen Vault', async () => {
    await harness.services.closeVault();
    await expect(dump('Ohne Vault gibt es keine Datei.')).rejects.toMatchObject({
      code: 'no-vault',
    });
    await expect(harness.call('capture:inbox', undefined)).rejects.toMatchObject({
      code: 'no-vault',
    });
  });
});
