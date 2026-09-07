/* Die Kanäle des Aufnehmens und der Wissens-Module im Hauptprozess — an echten
 * Dateien, ohne Netz und ohne echtes Modell.
 *
 * Der Prüfstein ist der Weg einer Quelle: sie liegt danach unverändert unter
 * `raw/`, der Index kennt sie, und die Verdichtung passiert genau dann, wenn ein
 * Modell dafür eingerichtet ist — sonst sagt der Auftrag ehrlich `awaiting-llm`.
 *
 * Und was davon nach außen dringt, geht seit 074 D4 über die eine Warteschlange:
 * jeder Auftrag wird als `WorkTask` (`kind: 'ingest'`, Spur `import`) gespiegelt
 * und mit `event:work-tasks` verschickt. `IngestQueue` selbst bleibt unberührt —
 * ihr Pump, ihre Parallelität, ihr Abbruch je Auftrag sind dieselben.
 *
 * Die Modul-Kanäle stehen hier mit im Haus, weil sie am selben Kern hängen
 * (`@core/wiki`) und dieselbe Verdrahtung brauchen: Store, Index, Nachlauf.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { IngestJob, WorkTask } from '@shared/types';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';

/* Electron gibt es im Test nicht: kein Fenster, kein Dialog, keine Verschlüsselung. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
}));

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

const MODULE = 'identity-management';

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { ingestHandlers } = await import('../../src/main/ipc/ingest');
  const { moduleHandlers } = await import('../../src/main/ipc/modules');
  const { getWorkQueue, resetWorkQueue } = await import('../../src/main/work-queue');

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  /* Die Warteschlange ist prozessweit; ohne diesen Schnitt trüge der nächste
     Test die Aufgaben des vorigen mit sich. */
  resetWorkQueue();
  const workQueue = getWorkQueue(services);
  services.attachVaultStore((root) => new FsVaultStore(root));
  /* Kein Watcher: der Index zieht über `settle()` im Handler nach — genau das
     soll geprüft werden. */
  services.attachIndex((root) => IndexService.open(new FsVaultStore(root)));

  const handlers: Handlers = { ...ingestHandlers(services), ...moduleHandlers(services) };
  const events = vi.spyOn(services, 'sendEvent');
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, events, workQueue };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

describe('Quellen- und Modul-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-ingest-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    /* Der Index-Nachlauf hängt nicht am Auftrag (`void settle(...)`) — er darf
       ihn nicht aufhalten. Beim Abräumen heißt das: einen Augenblick warten und
       notfalls ein zweites Mal löschen, sonst schreibt er in einen Ordner, den
       dieser Test gerade wegnimmt. */
    await new Promise((resolve) => setTimeout(resolve, 100));
    await vault.cleanup().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await vault.cleanup();
    });
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 3 });
  });

  /** Wartet, bis der Auftrag nichts mehr tut. */
  async function settled(id: string): Promise<IngestJob> {
    let job: IngestJob | undefined;
    await vi.waitFor(
      async () => {
        job = (await harness.call('ingest:jobs', undefined)).find((entry) => entry.id === id);
        expect(job?.stage).toMatch(/done|error|awaiting-llm/);
      },
      { timeout: 5000, interval: 20 },
    );
    if (job === undefined) throw new Error('Auftrag verschwunden');
    return job;
  }

  /**
   * Der Auftrag, der in einer Aufgabe steckt — oder `null`, wenn es kein
   * Aufnahme-Auftrag ist. `id` ist der Unterscheider: nur ein `IngestJob` hat
   * eine, ein `GardenerRunProgress` nicht.
   */
  function jobDetail(task: WorkTask): IngestJob | null {
    const detail = task.detail;
    return detail !== null && 'id' in detail ? detail : null;
  }

  /**
   * Jede Spiegelung dieses Auftrags, in der Reihenfolge, in der sie hinausging.
   * `event:work-tasks` trägt immer die ganze Liste, deshalb wird sie flach
   * gezogen und auf den einen Auftrag gefiltert.
   */
  function mirrored(jobId: string): WorkTask[] {
    return harness.events.mock.calls
      .filter((entry) => entry[0] === 'event:work-tasks')
      .flatMap((entry) => entry[1] as WorkTask[])
      .filter((task) => task.kind === 'ingest' && jobDetail(task)?.id === jobId);
  }

  /** Der jüngste Stand der gespiegelten Aufgabe zu diesem Auftrag. */
  function lastMirrored(jobId: string): WorkTask {
    const last = mirrored(jobId).at(-1);
    if (last === undefined) throw new Error(`keine gespiegelte Aufgabe zu ${jobId}`);
    return last;
  }

  // ── Ohne Modell ────────────────────────────────────────────────────────────

  it('legt einen eingefügten Text als Rohquelle ab und bleibt ehrlich ohne Modell', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: '# Digital gardening\n\nEin Absatz über wachsende Seiten statt Blogeinträgen.',
      module: MODULE,
    });
    /* Der Auftrag läuft sofort an — die Antwort kommt nicht erst nach der Datei. */
    expect(['queued', 'fetching']).toContain(started.stage);

    const job = await settled(started.id);

    /* Die Rohquelle liegt — die Verdichtung ist offen, nicht gescheitert. */
    expect(job.stage).toBe('awaiting-llm');
    expect(job.rawPath).toMatch(/^raw\/files\//);
    expect(job.touchedPages).toEqual([]);
    expect(await vault.read(`${job.rawPath}/source.md`)).toContain('Digital gardening');
    const log = JSON.parse((await vault.read(`${job.rawPath}/.ingest.json`)) ?? '{}');
    expect(log.sourcePage).toBeNull();
    expect(log.modules).toEqual([MODULE]);
  });

  it('meldet den Fortschritt an den Renderer und zieht den Index nach', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: 'Eine Notiz, die als Quelle abgelegt wird.',
      module: null,
    });
    const job = await settled(started.id);

    /* Der Fortschritt geht über die Warteschlange hinaus, nicht mehr über einen
       eigenen Kanal: jede Stufe steht im `detail` der gespiegelten Aufgabe. */
    const snapshots = mirrored(started.id);
    const stages = snapshots.map((task) => jobDetail(task)?.stage);
    expect(stages).toContain('fetching');
    expect(stages).toContain('awaiting-llm');

    /* Und die Aufgabe selbst ist eine Aufnahme auf der Spur `import` — sie
       taucht damit neben jeder anderen langlaufenden Arbeit auf. */
    const task = lastMirrored(started.id);
    expect(task.kind).toBe('ingest');
    expect(task.lane).toBe('import');
    expect(task.subject.label).toBe(job.label);
    /* `awaiting-llm` ist ein ehrliches Ende, kein Absturz: die Rohquelle liegt. */
    expect(task.state).toBe('done');
    expect(task.error).toBeNull();
    expect(task.progress).toBe(1);
    expect(jobDetail(task)?.stage).toBe('awaiting-llm');

    /* Der Index kennt die Quelle danach, ohne dass ein Watcher lief. Der Nachlauf
       hängt nicht am Auftrag — er darf ihn nicht aufhalten. */
    await vi.waitFor(
      async () => {
        const sources = await harness.call('modules:sources', {});
        expect(sources.map((source) => source.path)).toContain(job.rawPath);
      },
      { timeout: 5000, interval: 25 },
    );
  });

  it('weist eine leere Eingabe ab, statt eine leere Quelle anzulegen', async () => {
    await expect(
      harness.call('ingest:start', { kind: 'text', input: '   \n ', module: null }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('bricht einen Auftrag ab und sagt es als Grund, nicht als Fehler', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: 'Wird gleich abgebrochen.',
      module: null,
    });
    await harness.call('ingest:cancel', { id: started.id });

    const job = await settled(started.id);
    expect(job.stage).toBe('error');
    expect(job.error).toBe('cancelled');

    /* Dasselbe in der Warteschlange: ein Abbruch ist `cancelled`, nicht
       `failed` — sonst läse die Aufgabenliste ein Stoppen als Absturz und böte
       ein Wiederholen für etwas an, das niemand scheitern sah. */
    const task = lastMirrored(started.id);
    expect(task.state).toBe('cancelled');
    expect(task.error).toBeNull();
  });

  it('meldet ein echtes Scheitern als gescheiterte Aufgabe, mit Grund im Klartext', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'file',
      input: join(userDataDir, 'gibt-es-nicht.md'),
      module: null,
    });

    const job = await settled(started.id);
    expect(job.stage).toBe('error');
    expect(job.error).toBe('not-found');

    /* Der Code des Auftrags überlebt den Weg in die Warteschlange — die Aufgabe
       trägt denselben Grund, nicht ein anonymes „unknown". */
    const task = lastMirrored(started.id);
    expect(task.state).toBe('failed');
    expect(task.error).toBe('not-found');
    expect(task.message).toBe(job.message);
    expect(task.message).toBeTruthy();
  });

  it('spiegelt einen wiederholten Auftrag als neue Aufgabe, nicht als auferstandene', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'file',
      input: join(userDataDir, 'auch-nicht-da.md'),
      module: null,
    });
    await settled(started.id);
    const failed = lastMirrored(started.id);
    expect(failed.state).toBe('failed');

    /* Die Datei gibt es inzwischen — dasselbe Auftrags-Id, ein zweiter Anlauf. */
    await writeFile(join(userDataDir, 'auch-nicht-da.md'), '# Jetzt da\n\nEin Absatz.\n', 'utf8');
    await harness.call('ingest:retry', { id: started.id });
    const second = await settled(started.id);
    expect(second.stage).toBe('awaiting-llm');

    /* Eine abgeschlossene Aufgabe lässt sich nicht zurückdrehen: der zweite
       Anlauf ist eine eigene Aufgabe, und die gescheiterte bleibt lesbar. */
    const fresh = lastMirrored(started.id);
    expect(fresh.id).not.toBe(failed.id);
    expect(fresh.state).toBe('done');
    expect(new Set(mirrored(started.id).map((task) => task.id)).size).toBe(2);
    expect(harness.workQueue.list().filter((task) => task.state === 'failed')).toHaveLength(1);
  });

  it('kennt die abgelösten Fortschrittskanäle nicht mehr', async () => {
    const { IPC_EVENTS } = await import('@shared/ipc');
    const names: readonly string[] = IPC_EVENTS;
    /* 074, D4: beide Kanäle sind ersatzlos weg — was sie trugen, steht in
       `event:work-tasks`. Ein Zuhörer darauf käme im Preload nicht mehr durch. */
    expect(names).not.toContain('event:ingest-progress');
    expect(names).not.toContain('event:gardener-progress');
    expect(names).toContain('event:work-tasks');
  });

  it('verlangt einen offenen Vault', async () => {
    await harness.services.closeVault();
    await expect(
      harness.call('ingest:start', { kind: 'text', input: 'Ohne Vault.', module: null }),
    ).rejects.toMatchObject({ code: 'no-vault' });
    await expect(harness.call('ingest:jobs', undefined)).rejects.toMatchObject({
      code: 'no-vault',
    });
  });

  it('sagt beim yt-dlp-Zustand, was ist — ohne etwas zu holen', async () => {
    const status = await harness.call('ingest:ytdlpStatus', undefined);
    expect(typeof status.available).toBe('boolean');
    /* Fehlt es, gibt es keinen Pfad und keine Version — nichts wird behauptet. */
    if (!status.available) {
      expect(status.path).toBeNull();
      expect(status.version).toBeNull();
    }
  });

  // ── Mit Modell ─────────────────────────────────────────────────────────────

  /**
   * Ein Modell, das über gefälschtes `fetch` antwortet. Die Verdichtung bekommt
   * Markdown, der Wiki-Schritt (er verlangt ein JSON-Schema) bekommt JSON.
   *
   * `hold` hält jede Antwort auf, solange der Test einen laufenden Auftrag braucht.
   */
  async function routeToFakeModel(hold?: Promise<void>): Promise<void> {
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
      tasks: {
        'summarize-source': { providerId: 'local-1', model: 'qwen2.5:14b' },
        'wiki-ingest': { providerId: 'local-1', model: 'qwen2.5:14b' },
      },
      defaults: {},
    });
    const fake = createFetchFake(async (call) => {
      if (hold !== undefined) await hold;
      const structured = call.body?.['response_format'] !== undefined;
      const content = structured
        ? JSON.stringify({ suggestions: [], overviewChange: null })
        : '## Worum es geht\n\nKurze Token senken den Schaden eines Lecks.';
      return jsonResponse({ choices: [{ message: { content } }] });
    });
    vi.stubGlobal('fetch', fake.fetch);
  }

  it('verdichtet mit Modell zu einer Source-Seite und trägt sie im Protokoll nach', async () => {
    await routeToFakeModel();

    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: '# Kurze Token\n\nEin Praxisbericht über 15-Minuten-Tokens und Rotation.',
      module: MODULE,
    });
    const job = await settled(started.id);

    expect(job.stage).toBe('done');
    const sourcePage = job.touchedPages.find((path) => path.includes('/wiki/sources/'));
    expect(sourcePage).toBeDefined();
    expect(await vault.read(sourcePage ?? '')).toContain('Worum es geht');
    /* Katalog und Chronik sind mitgeschrieben — sonst wäre die Seite verwaist. */
    expect(job.touchedPages).toContain(`modules/${MODULE}/wiki/index.md`);
    expect(job.touchedPages).toContain(`modules/${MODULE}/wiki/log.md`);
    const log = JSON.parse((await vault.read(`${job.rawPath}/.ingest.json`)) ?? '{}');
    expect(log.sourcePage).toMatch(/^s-\d{4}-\d{2}-\d{2}-/);
    expect(log.modules).toEqual([MODULE]);
  });

  it('wiederholt einen Auftrag ohne eine zweite Rohquelle anzulegen', async () => {
    const started = await harness.call('ingest:start', {
      kind: 'text',
      input: 'Einmal geschrieben, einmal verdichtet.',
      module: MODULE,
    });
    const first = await settled(started.id);

    await routeToFakeModel();
    await harness.call('ingest:retry', { id: started.id });
    const second = await settled(started.id);

    expect(second.rawPath).toBe(first.rawPath);
    expect(second.stage).toBe('done');
    await vi.waitFor(
      async () => {
        const raws = (await harness.call('modules:sources', {})).filter((source) =>
          source.path.startsWith('raw/files/'),
        );
        /* Genau eine Rohquelle, obwohl der Auftrag zweimal lief — und sie gilt
           jetzt als verdichtet. */
        expect(raws).toHaveLength(1);
        expect(raws[0]?.sourcePage).not.toBeNull();
      },
      { timeout: 5000, interval: 25 },
    );
  });

  it('stoppt denselben Import als Duplikat, bevor eine zweite Rohquelle entsteht', async () => {
    const input = 'Eine Quelle, die exakt einmal in raw liegen soll.';
    const first = await settled(
      (
        await harness.call('ingest:start', {
          kind: 'text',
          input,
          module: null,
        })
      ).id,
    );

    const duplicate = await harness.call('ingest:start', {
      kind: 'text',
      input: `${input}\r\n`,
      module: null,
    });

    expect(duplicate.stage).toBe('duplicate');
    expect(duplicate.duplicateOf).toBe(first.rawPath);
    expect(duplicate.rawPath).toBe(first.rawPath);
    await vi.waitFor(async () => {
      const matching = (await harness.call('modules:sources', {})).filter(
        (source) => source.path === first.rawPath,
      );
      expect(matching).toHaveLength(1);
    });
  });

  it('verdichtet eine Bestandsquelle aus dem Detailfenster ohne neuen Rohimport', async () => {
    const first = await settled(
      (
        await harness.call('ingest:start', {
          kind: 'text',
          input: '# Später verdichten\n\nDiese Quelle wurde in einer früheren Phase nur abgelegt.',
          module: null,
        })
      ).id,
    );
    expect(first.stage).toBe('awaiting-llm');
    await vi.waitFor(async () => {
      expect(
        (await harness.call('modules:sources', {})).some((source) => source.path === first.rawPath),
      ).toBe(true);
    });

    const detail = await harness.call('ingest:detail', { path: first.rawPath ?? '' });
    expect(detail.source.sourcePage).toBeNull();

    await routeToFakeModel();
    const started = await harness.call('ingest:condense', {
      path: first.rawPath ?? '',
      module: MODULE,
    });
    const condensed = await settled(started.id);

    expect(condensed.stage).toBe('done');
    expect(condensed.rawPath).toBe(first.rawPath);
    const protocol = JSON.parse((await vault.read(`${first.rawPath}/.ingest.json`)) ?? '{}');
    expect(protocol.sourcePage).toMatch(/^s-/);
  });

  it('verdichtet eine Bestandsquelle auch bei zwei Klicks nur einmal', async () => {
    const first = await settled(
      (
        await harness.call('ingest:start', {
          kind: 'text',
          input: '# Einmal verdichten\n\nZweimal geklickt, einmal verdichtet.',
          module: null,
        })
      ).id,
    );
    await vi.waitFor(async () => {
      expect(
        (await harness.call('modules:sources', {})).some((source) => source.path === first.rawPath),
      ).toBe(true);
    });

    /* Das Modell antwortet erst auf Freigabe — sonst wäre der erste Lauf schon
       durch, bevor der zweite Klick kommt, und es gäbe nichts zu prüfen. */
    const gate = { release: (): void => {}, promise: Promise.resolve() };
    gate.promise = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
    await routeToFakeModel(gate.promise);

    const started = await harness.call('ingest:condense', {
      path: first.rawPath ?? '',
      module: MODULE,
    });
    const again = await harness.call('ingest:condense', {
      path: first.rawPath ?? '',
      module: MODULE,
    });
    /* Derselbe Auftrag, kein zweiter: ein Klick zuviel legt keine zweite Seite an. */
    expect(again.id).toBe(started.id);

    gate.release();
    const condensed = await settled(started.id);
    expect(condensed.stage).toBe('done');
    expect(condensed.touchedPages.filter((path) => path.includes('/wiki/sources/'))).toHaveLength(
      1,
    );

    /* Und danach ist Schluss: die Quelle trägt ihre Seite. */
    await expect(
      harness.call('ingest:condense', { path: first.rawPath ?? '', module: MODULE }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('kopiert nachgereichte Dateien kollisionsfrei in den sources-Ordner des Videos', async () => {
    const youtubePath = 'raw/youtube/xOFkpf9KgKg';
    await vault.write(
      `${youtubePath}/.ingest.json`,
      `${JSON.stringify({
        kind: 'youtube',
        origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
        ingestedAt: '2026-08-12T08:00:00+02:00',
        title: 'ComfyUI workflow',
        sourcePage: null,
        modules: [],
        provenance: { metadata: 'test' },
      })}\n`,
    );
    await vault.write(`${youtubePath}/metadata.json`, '{"links":[]}\n');
    await harness.services.requireIndex().rebuild();
    const youtube = (await harness.call('modules:sources', {})).find(
      (source) => source.kind === 'youtube',
    );
    expect(youtube).toBeDefined();
    const external = join(userDataDir, 'workflow.json');
    await writeFile(external, '{"workflow":true}\n', 'utf8');
    const { attachSourceFiles } = await import('../../src/main/ipc/source-detail');

    const first = await attachSourceFiles(harness.services, youtube?.path ?? '', [external]);
    const second = await attachSourceFiles(harness.services, youtube?.path ?? '', [external]);

    expect(first.detail.attachments.map((entry) => entry.name)).toContain('workflow.json');
    expect(second.detail.attachments.map((entry) => entry.name)).toEqual([
      'workflow-2.json',
      'workflow.json',
    ]);
    expect(await vault.read(`${youtube?.path}/sources/workflow.json`)).toContain('workflow');
    expect(await vault.read(`${youtube?.path}/sources/workflow-2.json`)).toContain('workflow');
  });

  // ── Module ─────────────────────────────────────────────────────────────────

  it('legt ein Modul mit Katalog, Chronik, Synthese und Schema an — zweimal ohne Schaden', async () => {
    const created = await harness.call('modules:create', {
      title: 'Zweites Hirn',
      description: 'Methodik und Werkzeuge.',
    });

    expect(created.slug).toBe('zweites-hirn');
    for (const path of [
      'modules/zweites-hirn/module.md',
      'modules/zweites-hirn/AGENTS.md',
      'modules/zweites-hirn/wiki/index.md',
      'modules/zweites-hirn/wiki/log.md',
      'modules/zweites-hirn/wiki/overview.md',
    ]) {
      expect(await vault.exists(path), path).toBe(true);
    }
    expect(await vault.read('modules/zweites-hirn/module.md')).toContain('type: note');

    const again = await harness.call('modules:create', {
      title: 'Zweites Hirn',
      description: 'Anders formuliert.',
    });
    expect(again.slug).toBe('zweites-hirn');
    /* Bestand gewinnt: die Beschreibung der Datei bleibt stehen. */
    expect(await vault.read('modules/zweites-hirn/module.md')).toContain('Methodik und Werkzeuge.');
  });

  it('liest eine Seite mit Belegen und eingehenden Verweisen', async () => {
    const found = await harness.call('modules:page', {
      path: `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`,
    });

    expect(found?.page.type).toBe('concept');
    expect(found?.page.inbound).toContain(`${MODULE}/oauth2`);
    expect(found?.doc.body).toContain('15 Minuten');
  });

  it('weigert sich, etwas zu lesen, das keine Wiki-Seite ist', async () => {
    await expect(
      harness.call('modules:page', { path: `modules/${MODULE}/wiki/log.md` }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('schreibt eine Seite mit Hash und lehnt einen veralteten Hash ab', async () => {
    const path = `modules/${MODULE}/wiki/entities/scim.md`;
    const before = await harness.call('modules:page', { path });
    expect(before).not.toBeNull();

    const written = await harness.call('modules:savePage', {
      path,
      body: 'Von Hand ergänzt: wird noch nicht benutzt.\n',
      expectedHash: before?.doc.hash ?? '',
    });
    expect(written.path).toBe(path);
    const raw = (await vault.read(path)) ?? '';
    expect(raw).toContain('Von Hand ergänzt');
    /* `updated` setzt nur die App, und nur wenn sie selbst schreibt. */
    expect(raw).toMatch(/updated: \d{4}-\d{2}-\d{2}/);

    await expect(
      harness.call('modules:savePage', {
        path,
        body: 'Mit einem alten Hash geschrieben.',
        expectedHash: before?.doc.hash ?? '',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    expect(await vault.read(path)).toContain('Von Hand ergänzt');
  });

  it('baut den Graphen aus den Wikilinks und lässt kaputte Ziele weg', async () => {
    const graph = await harness.call('modules:graph', { module: MODULE });

    const ids = graph.nodes.map((node) => node.id);
    expect(ids).toContain(`${MODULE}/oauth2`);
    expect(ids).toContain(`${MODULE}/token-lebensdauer`);
    expect(ids).not.toContain(`${MODULE}/device-code-flow`);

    /* Die Kante ist ungerichtet: gezeichnet wird eine Linie, kein Pfeil. */
    const linked = (a: string, b: string): boolean =>
      graph.edges.some(([from, to]) => (from === a && to === b) || (from === b && to === a));
    expect(linked(`${MODULE}/oauth2`, `${MODULE}/token-lebensdauer`)).toBe(true);
    /* Ein kaputter Wikilink ist keine Kante — er hat kein Ziel. */
    expect(graph.edges.every(([from, to]) => ids.includes(from) && ids.includes(to))).toBe(true);
    /* Und jede Kante steht nur einmal drin, aus welcher Richtung auch immer. */
    const keys = graph.edges.map(([from, to]) => [from, to].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
