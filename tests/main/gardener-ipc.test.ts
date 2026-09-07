/* Die Pflege im Hauptprozess — an echten Dateien, ohne Netz und ohne Modell.
 *
 * Der Prüfstein dieses Bereichs: **was ein Kanal meldet, muss passiert sein.**
 * Deshalb steht hier vor allem, was danach in den Dateien steht:
 *   - `gardener:report` liest den letzten Lauf und prüft **nicht** (kein
 *     Fortschritt, kein neuer Zeitstempel). Ohne Lauf ist die Antwort `null`.
 *   - `gardener:run` meldet Fortschritt je Prüfung und ist abbrechbar; ein
 *     Abbruch lässt den letzten Bericht unberührt.
 *   - Ohne Modell stehen die deterministischen Befunde vollständig da und der
 *     Bericht sagt `usedLlm: false` — Guardrail 1.
 *   - „Passt so" landet in `.secondbrain/gardener.json`, überlebt einen weiteren
 *     Lauf und ist zurücknehmbar. Eine unbekannte Kennung ist ein Fehler.
 *   - Ein Fix schreibt genau die Zeile aus seiner Vorschau — und `gardener:undoFix`
 *     dreht Datei **und** Befundliste zurück.
 *   - Was nichts schreibt (`open-classify`), schreibt auch nichts.
 *   - Das Dashboard bekommt den Wert des letzten Laufs, nicht eine erfundene 100.
 *   - `gardener.runOnOpen` wird wirklich gelesen.
 *   - `reminders:unsnooze` nimmt eine Ruhezeit zurück — sonst wäre „ruhig stellen"
 *     eine Aktion ohne Rückgängig.
 *   - Beim gewählten Ziel einer verwaisten Seite bleiben zwei Absagen
 *     unterscheidbar: `conflict`, wenn die Datei sich zwischen Lesen und
 *     Schreiben ändert, und `invalid`, wenn das Ziel kein Kandidat mehr ist.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerFinding, GardenerRunProgress, WorkTask } from '@shared/types';
import { FsVaultStore, sha256 } from '@core/vault';
import { createFetchFake, jsonResponse } from '../fakes/llm';
import { toIpcError } from '../../src/main/ipc/errors';
import {
  beginGardenerRun,
  cancelGardenerRun,
  gardenerRunSnapshot,
} from '../../src/main/gardener-run-state';
import { getWorkQueue, resetWorkQueue } from '../../src/main/work-queue';
import { IPC_ERROR_PREFIX, encodeIpcError } from '../../src/preload/ipc-error-wire';
import { createTempVault } from '../helpers/vault';
import type { TempVault } from '../helpers/vault';
import { NOW, TODAY, day, freezeTime } from '../helpers/time';

/* Electron gibt es im Test nicht: keine Fenster, keine Verschlüsselung. */
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
}));

const CATALOG = 'modules/identity-management/wiki/index.md';

type Handlers = Partial<{
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K> | Promise<IpcResponse<K>>;
}>;

interface Sent {
  name: IpcEventName;
  payload: unknown;
}

async function createHarness(userDataDir: string) {
  const { FsVaultStore } = await import('@core/vault');
  const { IndexService } = await import('@core/index');
  const { createKeyStore } = await import('../../src/main/secrets');
  const { createServices } = await import('../../src/main/services');
  const { SettingsService } = await import('../../src/main/settings');
  const { forgetGardenerState } = await import('../../src/main/gardener-state');
  const { forgetOverviewState } = await import('../../src/main/overview-state');
  const { forgetSessions } = await import('../../src/main/ipc/overview-deps');
  const { gardenerHandlers } = await import('../../src/main/ipc/gardener');
  const { dashboardHandlers } = await import('../../src/main/ipc/dashboard');
  const { moduleHandlers } = await import('../../src/main/ipc/modules');
  const { reminderHandlers } = await import('../../src/main/ipc/reminders');

  /* Zustand aus einem früheren Test darf nicht überleben. */
  forgetSessions();
  forgetOverviewState();
  forgetGardenerState();
  cancelGardenerRun();
  /* Die Warteschlange ist ein Singleton: ohne Rücksetzen meldete sie noch an
     die `services` des vorigen Tests (074, D2). */
  resetWorkQueue();

  const settings = await SettingsService.load(userDataDir);
  const keys = await createKeyStore(userDataDir);
  const services = createServices(settings, keys, userDataDir);
  services.attachVaultStore((root) => new FsVaultStore(root));
  services.attachIndex((root) =>
    IndexService.open(new FsVaultStore(root), { now: () => new Date(NOW) }),
  );

  /* Ereignisse gehen im Test in eine Liste statt an ein Fenster. */
  const sent: Sent[] = [];
  const send = <E extends IpcEventName>(name: E, payload: IpcEvents[E]): void => {
    sent.push({ name, payload });
  };
  services.sendEvent = send as typeof services.sendEvent;

  const handlers: Handlers = {
    ...gardenerHandlers(services),
    ...dashboardHandlers(services),
    ...moduleHandlers(services),
    ...reminderHandlers(services),
  };
  const call = async <K extends IpcChannel>(
    channel: K,
    request: IpcRequest<K>,
  ): Promise<IpcResponse<K>> => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`kein Handler für ${channel}`);
    return (handler as (payload: IpcRequest<K>) => Promise<IpcResponse<K>>)(request);
  };

  return { services, settings, call, sent };
}

type Harness = Awaited<ReturnType<typeof createHarness>>;

/**
 * Der Schritt, den die gespiegelte Pflege-Aufgabe in dieser Meldung trägt.
 *
 * Seit 074 D2 fährt jeder veröffentlichte Schritt als `detail` der Aufgabe über
 * `event:work-tasks` mit, statt über einen eigenen Fortschrittskanal — die
 * Prüfungen unten sind dieselben, nur die Quelle ist der Spiegel.
 */
function gardenerStep(payload: unknown): GardenerRunProgress | null {
  const task = (payload as WorkTask[]).filter((entry) => entry.kind === 'gardener').at(-1);
  return (task?.detail as GardenerRunProgress | undefined) ?? null;
}

/**
 * Der Anfangszustand, mit dem der Lauf den Platz belegt: `running`, aber noch
 * über keinem Stufenplan (`total === 0`). Das ist keine Meldung des Laufs,
 * sondern sein Anfang — die Prüfungen hier meinen die veröffentlichten
 * Schritte. Der schließende Schnappschuss trägt dieselbe 0, aber
 * `running: false`, und bleibt darum drin.
 */
function isClaimSeed(step: GardenerRunProgress): boolean {
  return step.running && step.total === 0;
}

/** Die Fortschrittsmeldungen des letzten Laufs. */
function progress(harness: Harness): GardenerRunProgress[] {
  const steps: GardenerRunProgress[] = [];
  for (const entry of harness.sent) {
    if (entry.name !== 'event:work-tasks') continue;
    const step = gardenerStep(entry.payload);
    /* Jede Zustandsänderung der Warteschlange meldet die ganze Liste; ein
       Schritt zählt einmal, nicht so oft wie er mitgereicht wird. */
    if (step === null || step === steps.at(-1) || isClaimSeed(step)) continue;
    steps.push(step);
  }
  return steps;
}

/** Der Zustand, in dem die gespiegelte Pflege-Aufgabe zuletzt gemeldet wurde. */
function lastGardenerTask(harness: Harness): WorkTask | null {
  for (let index = harness.sent.length - 1; index >= 0; index -= 1) {
    const entry = harness.sent[index];
    if (entry?.name !== 'event:work-tasks') continue;
    const task = (entry.payload as WorkTask[]).filter((one) => one.kind === 'gardener').at(-1);
    if (task !== undefined) return task;
  }
  return null;
}

function findingOfKind(findings: readonly GardenerFinding[], kind: string): GardenerFinding {
  const found = findings.find((finding) => finding.kind === kind);
  expect(found, `Befund der Art ${kind}`).toBeDefined();
  return found as GardenerFinding;
}

const SCIM = 'modules/identity-management/wiki/entities/scim.md';
const SCIM_MENTION = 'modules/identity-management/wiki/entities/scim-erwaehnung.md';
const MODULE_LOG = 'modules/identity-management/wiki/log.md';

/**
 * Eine zusaetzliche Seite, die „SCIM" im Text nennt, ohne dorthin zu verlinken —
 * genau die eine Stelle, die `singleMention` (`checks/orphan.ts`) braucht, damit
 * der Verwaisten-Befund einen automatischen Fix bekommt.
 */
async function addScimMention(vault: TempVault, harness: Harness): Promise<string> {
  await vault.write(
    SCIM_MENTION,
    [
      '---',
      'type: entity',
      'title: SCIM-Erwähnung',
      'module: identity-management',
      'created: 2026-04-15',
      'updated: 2026-04-15',
      'reviewed: 2026-04-15',
      'tags: [auth]',
      'lang: de',
      '---',
      '',
      'Dieser Text erwähnt SCIM 2.0, ohne dorthin zu verlinken.',
      '',
    ].join('\n'),
  );
  await harness.services.requireIndex().refresh?.();
  return SCIM_MENTION;
}

/**
 * Jede Markdown-Datei im Vault (nie `.secondbrain/`), als Pfad → sha256 ihres
 * Inhalts. Der Beweis für D6, dass „passt so", „nicht jetzt" und der Rückweg
 * nur `.secondbrain/gardener.json` anfassen: dieselbe Menge davor und danach.
 */
async function snapshotMarkdown(vault: TempVault): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(relDir: string): Promise<void> {
    const entries = await readdir(vault.absolute(relDir === '' ? '.' : relDir), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.name === '.secondbrain') continue;
      const relPath = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(relPath);
      } else if (entry.name.endsWith('.md')) {
        out.set(relPath, sha256((await vault.read(relPath)) ?? ''));
      }
    }
  }
  await walk('');
  return out;
}

describe('Pflege-Kanäle im Main', () => {
  let vault: TempVault;
  let userDataDir: string;
  let harness: Harness;

  beforeEach(async () => {
    /* Altersrechnungen hängen am Kalendertag. */
    freezeTime();
    vault = await createTempVault({ sample: true });
    userDataDir = await mkdtemp(join(tmpdir(), 'sb-userdata-gardener-'));
    harness = await createHarness(userDataDir);
    await harness.services.openVault(vault.root);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await harness.services.closeVault();
    await vault.cleanup();
    await rm(userDataDir, { recursive: true, force: true });
  });

  // ── Bericht laden, ohne zu prüfen ──────────────────────────────────────────

  it('gibt ohne Pflegelauf keinen Bericht — und prüft dabei nicht', async () => {
    expect(await harness.call('gardener:report', undefined)).toBeNull();
    expect(progress(harness)).toEqual([]);
    expect(await vault.exists('.secondbrain/gardener.json')).toBe(false);
  });

  it('liest den letzten Bericht, ohne neu zu laufen', async () => {
    const run = await harness.call('gardener:run', {});
    harness.sent.length = 0;

    const again = await harness.call('gardener:report', undefined);

    expect(again?.ranAt).toBe(run.ranAt);
    expect(again?.findings.map((finding) => finding.id)).toEqual(
      run.findings.map((finding) => finding.id),
    );
    /* Kein Lauf heißt: keine Fortschrittsmeldung. */
    expect(progress(harness)).toEqual([]);
  });

  // ── Lauf ───────────────────────────────────────────────────────────────────

  it('findet ohne Modell die deterministischen Befunde und sagt, dass keins beteiligt war', async () => {
    const report = await harness.call('gardener:run', { useLlm: true });

    expect(report.usedLlm).toBe(false);
    expect(report.healthKnown).toBe(true);
    expect(report.health).toBeGreaterThan(0);
    expect(report.health).toBeLessThan(100);
    /* Die vier absichtlichen Mängel des Fixture-Vaults (tests/fixtures/index.ts). */
    const kinds = new Set(report.findings.map((finding) => finding.kind));
    expect(kinds).toContain('broken-link');
    expect(kinds).toContain('orphan');
    expect(kinds).toContain('index-drift');
    expect(kinds).toContain('unprocessed-source');
    /* Ohne Modell gibt es keine Deutung — also auch keinen Rat und keine
       Widersprüche, statt beides zu erfinden. */
    expect(report.advice).toEqual([]);
    expect(kinds.has('contradiction')).toBe(false);
    /* Die Beiträge summieren sich auf den verlorenen Teil des Werts. */
    const lost = (report.healthContributions ?? []).reduce((sum, entry) => sum + entry.points, 0);
    expect(lost).toBe(100 - report.health);
  });

  // ── Lose Enden im echten Lauf (020, D4/D5) ─────────────────────────────────

  /** Der Tag, der zwei Ankündigungen macht: eine deutsche, eine englische. */
  const ANNOUNCING_DAY = day(-5);
  const ANNOUNCING_PATH = `journal/2026/08/${ANNOUNCING_DAY}.md`;
  /* Die englische Ankündigung — `findDates()` löst sie nicht auf, also ist sie
     genau das, was nur die Modellstufe finden kann. */
  const ENGLISH_QUOTE = 'Tomorrow I finally call the tax office.';

  async function seedAnnouncingDay(): Promise<void> {
    await vault.write(
      ANNOUNCING_PATH,
      [
        '---',
        'type: journal',
        `title: 'Tag ${ANNOUNCING_DAY}'`,
        `date: ${ANNOUNCING_DAY}`,
        'lang: de',
        '---',
        '',
        '## Tag',
        '',
        'Morgen bin ich beim Notar.',
        '',
        ENGLISH_QUOTE,
        '',
      ].join('\n'),
    );
    await harness.services.requireIndex().refresh?.();
  }

  /** Route nur für `journal-loose-ends` — die Deutung bleibt absichtlich ohne. */
  async function routeLooseEndsTo(proposals: unknown) {
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
      tasks: { 'journal-loose-ends': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(() =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify(proposals) } }] }),
    );
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  it('findet lose Enden ohne Modell und meldet die Heuristik als Herkunft', async () => {
    await seedAnnouncingDay();

    const report = await harness.call('gardener:run', {});

    const looseEnds = report.findings.filter((finding) => finding.kind === 'loose-end');
    expect(looseEnds.length).toBeGreaterThan(0);
    expect(looseEnds.every((finding) => finding.origin === 'heuristic')).toBe(true);
    expect(report.usedLlm).toBe(false);
  });

  it('führt die Modellstufe für lose Enden im echten Lauf mit und sagt, dass ein Modell mitgeredet hat', async () => {
    await seedAnnouncingDay();
    const fake = await routeLooseEndsTo({
      looseEnds: [
        {
          day: ANNOUNCING_DAY,
          quote: ENGLISH_QUOTE,
          subject: 'tax office',
          refDate: day(-4),
        },
      ],
    });

    const report = await harness.call('gardener:run', { useLlm: true });

    /* Die Stufe ist wirklich gelaufen — nicht nur „hätte laufen können". */
    expect(fake.calls.length).toBe(1);
    const fromModel = report.findings.filter((finding) => finding.origin === 'model');
    expect(fromModel.map((finding) => finding.kind)).toEqual(['loose-end']);
    expect(fromModel[0]?.paths).toEqual([ANNOUNCING_PATH]);
    /* Ohne Route für `gardener-audit` gibt es keine Deutung — `usedLlm` hängt
       hier allein an der zweiten Stufe (F1: das ODER, nicht nur der Audit). */
    expect(report.advice).toEqual([]);
    expect(report.usedLlm).toBe(true);
    /* Und die Stufe meldet sich im Fortschritt, statt still zu laufen — seit
       021a D1 unter eigenem Namen: sie wiegt eigenständig, also heißt sie auch
       eigenständig und teilt sich `'audit'` nicht mehr mit der Deutung. */
    expect(progress(harness).some((step) => step.phase === 'loose-ends')).toBe(true);
    expect(progress(harness).some((step) => step.phase === 'audit')).toBe(false);
  });

  it('lässt ein beantwortetes loses Ende auch aus dem abgelegten Bericht heraus — ohne neuen Lauf', async () => {
    await seedAnnouncingDay();
    const { forgetLooseEndState, looseEndState } = await import('../../src/main/loose-end-state');
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'loose-end');

    /* Beantwortet wird **nach** dem Lauf: der abgelegte Bericht kennt den Befund
       noch, und nur der Lesepfad darf ihn jetzt noch fernhalten. */
    const state = await looseEndState(vault.root);
    await state.recordAnswered({
      id: target.id,
      day: ANNOUNCING_DAY,
      path: ANNOUNCING_PATH,
      answeredAt: `${TODAY}T12:00:00.000Z`,
    });

    const again = await harness.call('gardener:report', undefined);
    expect(again?.findings.some((finding) => finding.id === target.id)).toBe(false);
    expect(again?.hidden?.some((entry) => entry.finding.id === target.id)).toBe(false);

    /* Auch nach einem Neustart der Ablage — die Datei trägt es, nicht der Cache. */
    forgetLooseEndState();
    const afterRestart = await harness.call('gardener:report', undefined);
    expect(afterRestart?.findings.some((finding) => finding.id === target.id)).toBe(false);
  });

  it('meldet Fortschritt je Prüfung und ein Ende', async () => {
    await harness.call('gardener:run', {});
    const steps = progress(harness);

    expect(steps.length).toBeGreaterThan(5);
    expect(steps.filter((step) => step.phase === 'checks').length).toBeGreaterThan(5);
    expect(steps.some((step) => step.check === 'orphan')).toBe(true);
    /* Ohne Modell gibt es keine Deutungs-Phase. */
    expect(steps.some((step) => step.phase === 'audit')).toBe(false);
    expect(steps.at(-1)).toMatchObject({ running: false });
  });

  /**
   * Bricht den Lauf ab, sobald `phase` gemeldet wird — synchron aus der
   * Ereignisschleife heraus, denn genau zwischen zwei Stufen gibt der Lauf ihr
   * das Wort. `stop` sagt, welcher Abbruch es ist: der geklickte
   * (`gardener:cancel`) oder der beim Schließen und Beenden (`main/index.ts`).
   * Der Rückgabewert stellt den Versand wieder her.
   */
  function cancelOn(phase: GardenerRunProgress['phase'], stop: () => void): () => void {
    const send = harness.services.sendEvent;
    let fired = false;
    harness.services.sendEvent = ((name, payload) => {
      send(name, payload);
      if (fired || name !== 'event:work-tasks') return;
      const step = gardenerStep(payload);
      if (step === null || isClaimSeed(step) || step.phase !== phase) return;
      fired = true;
      stop();
    }) as typeof harness.services.sendEvent;
    return () => {
      harness.services.sendEvent = send;
    };
  }

  /**
   * Routen für **beide** Modellstufen. Gefragt wird trotzdem keins: die Tests
   * hier brechen ab, bevor die Stufe ihren Aufruf macht — und genau das prüft
   * `fake.calls`.
   */
  async function routeModelStages() {
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
    const ref = { providerId: 'local-1', model: 'qwen2.5:14b' };
    await harness.settings.setVaultSection('routing', {
      tasks: { 'gardener-audit': ref, 'journal-loose-ends': ref },
      defaults: {},
    });
    const fake = createFetchFake(() => jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    vi.stubGlobal('fetch', fake.fetch);
    return fake;
  }

  it('behält beim Abbruch, was die fertigen Stufen gefunden haben — als Teillauf', async () => {
    /* Ein vollständiger Lauf zuerst: nur gegen ihn ist zu sehen, dass der
       Teillauf dieselben Befunde trägt und die alte Zahl übernimmt. */
    const first = await harness.call('gardener:run', {});
    const fake = await routeModelStages();
    harness.sent.length = 0;

    /* Abbrechen, sobald die Deutung dran ist: die zehn Prüfungen sind fertig,
       die beiden Modellstufen haben nicht angefangen. */
    const restore = cancelOn('audit', () => void harness.call('gardener:cancel', undefined));
    const partial = await harness.call('gardener:run', { useLlm: true });
    restore();

    /* Kein Modell wurde gefragt — der Abbruch kam davor. */
    expect(fake.calls.length).toBe(0);
    /* Der Lauf ist da, und er gibt sich als halber zu erkennen. (Die Uhr steht
       im Test, `ranAt` unterscheidet die beiden Läufe also nicht — dass der
       Teillauf den vollständigen abgelöst hat, zeigt die Datei unten.) */
    expect(partial.complete).toBe(false);
    expect(partial.missingStages).toEqual(['audit', 'loose-ends']);
    expect(partial.usedLlm).toBe(false);
    /* Und er trägt genau das, was die Prüfungen gefunden haben: derselbe
       unveränderte Vault, dieselben Befunde wie im vollständigen Lauf. */
    expect(partial.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    );
    /* Die Zahl stammt aus dem letzten **vollständigen** Lauf und sagt das auch,
       statt aus einer halben Prüfung gerechnet zu werden. */
    expect(partial.health).toBe(first.health);
    expect(partial.healthAsOf).toBe(first.ranAt);

    /* Nicht nur im Speicher: so steht es in der Datei. */
    const stored = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      run: { plan?: string[]; completed?: string[]; healthAsOf?: { ranAt: string } };
    };
    expect(stored.run.plan).toEqual(['checks', 'audit', 'loose-ends']);
    expect(stored.run.completed).toEqual(['checks']);
    expect(stored.run.healthAsOf?.ranAt).toBe(first.ranAt);

    /* Der abgebrochene Lauf endet sichtbar und gibt den Platz frei — in der
       Warteschlange als abgebrochene Aufgabe, nicht als fertige (074, D2). */
    expect(lastGardenerTask(harness)).toMatchObject({ state: 'cancelled' });
    expect(gardenerRunSnapshot()).toBeNull();
    expect(await harness.call('gardener:runStatus', undefined)).toBeNull();
  });

  it('lässt „abbrechen" den Lauf nicht mehr scheitern — und den letzten Bericht unberührt', async () => {
    const first = await harness.call('gardener:run', {});
    harness.sent.length = 0;

    /* Beim ersten Fortschritt abbrechen — der Lauf gibt der Ereignisschleife
       zwischen zwei Prüfungen das Wort, sonst käme der Abbruch nie an. */
    const restore = cancelOn('checks', () => void harness.call('gardener:cancel', undefined));
    const answer = await harness.call('gardener:run', {});
    restore();

    /* Ein Abbruch ist kein Fehler mehr: die Antwort ist der Bericht, der auf
       der Platte steht. */
    expect(answer.ranAt).toBe(first.ranAt);
    expect(answer.complete).not.toBe(false);
    expect(answer.findings.map((finding) => finding.id)).toEqual(
      first.findings.map((finding) => finding.id),
    );
    /* Ein Lauf, der keine einzige Stufe geschafft hat, hat nichts abgeleitet —
       er darf einen vollständigen Bericht nicht durch einen leeren ersetzen. */
    const kept = await harness.call('gardener:report', undefined);
    expect(kept?.ranAt).toBe(first.ranAt);
    expect(kept?.complete).not.toBe(false);
    /* Auch der abgebrochene Lauf endet sichtbar. */
    expect(lastGardenerTask(harness)).toMatchObject({ state: 'cancelled' });
    /* Und er hinterlässt keinen Zustand, der weiter „es läuft" behauptet. */
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('schreibt beim Abbruch durchs Beenden gar nichts', async () => {
    const first = await harness.call('gardener:run', {});
    await routeModelStages();
    const before = await vault.read('.secondbrain/gardener.json');
    harness.sent.length = 0;

    /* Genau der Aufruf aus `main/index.ts`: der Vault wird geschlossen. Auch
       nach fertigen Prüfungen bleibt davon nichts liegen. */
    const restore = cancelOn('audit', () => cancelGardenerRun('shutdown'));
    const answer = await harness.call('gardener:run', { useLlm: true });
    restore();

    expect(await vault.read('.secondbrain/gardener.json')).toBe(before);
    expect(answer.ranAt).toBe(first.ranAt);
    expect(answer.complete).not.toBe(false);
    expect(answer.healthAsOf).toBeUndefined();
    expect(lastGardenerTask(harness)).toMatchObject({ state: 'cancelled' });
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('bricht den Lauf beim Schließen des Vaults ab — mit dem Grund, der nichts aufhebt', async () => {
    /* Derselbe Weg wie beim Wechseln des Vaults: `openVault` schließt den alten
       zuerst. Bliebe der Lauf laufen, schriebe er in einen Vault, den der
       Nutzer gerade zugemacht hat — oder in den, der ihn ablöst. */
    const emitted: unknown[] = [];
    /* Mit Warteschlange, wie jeder echte Lauf: `closeVault` bricht seit 074 D2
       über `cancelAll` ab, und der Spiegel ist es, der den echten Lauf
       erreicht. */
    const handle = beginGardenerRun({
      trigger: 'user',
      emit: (step) => emitted.push(step),
      workQueue: getWorkQueue(harness.services),
    });
    expect(handle).not.toBeNull();

    await harness.services.closeVault();

    expect(handle?.cancelledBy()).toBe('shutdown');
    expect(handle?.signal.aborted).toBe(true);
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('hört auf zu arbeiten, wenn der Vault mitten im Lauf geschlossen wird', async () => {
    const first = await harness.call('gardener:run', {});
    const fake = await routeModelStages();
    /* Eine Änderung, die ein weiterlaufender Lauf mitschriebe: fiele doch etwas
       in die Datei, stünde sie dort — bei stehender Uhr wären zwei gleiche
       Läufe sonst Byte für Byte identisch. */
    await addScimMention(vault, harness);
    const before = await vault.read('.secondbrain/gardener.json');
    harness.sent.length = 0;

    /* Der Vault geht zu, während die Deutung dran wäre: die zehn Prüfungen sind
       fertig — weitergerechnet wird trotzdem nichts mehr. */
    const restore = cancelOn('audit', () => void harness.services.closeVault());
    const running = harness.call('gardener:run', { useLlm: true });
    /* Ohne Vault gibt es auch keinen Bericht mehr zurückzulesen — der Lauf
       endet mit genau dieser Absage, nicht mit einem halben Bericht. */
    await expect(running).rejects.toMatchObject({ code: 'no-vault' });
    restore();

    /* Der Beweis, dass der Abbruch angekommen ist: die Modellstufe hat nach dem
       Schließen nicht mehr angefangen. Ein Lauf, der weiterliefe, würde für
       einen zugemachten Vault noch ein Modell fragen — und danach in ihn
       schreiben. */
    expect(fake.calls.length).toBe(0);
    expect(await vault.read('.secondbrain/gardener.json')).toBe(before);
    expect(gardenerRunSnapshot()).toBeNull();

    /* Und nach dem Wiederöffnen steht der letzte vollständige Bericht da. */
    await harness.services.openVault(vault.root);
    const kept = await harness.call('gardener:report', undefined);
    expect(kept?.ranAt).toBe(first.ranAt);
    expect(kept?.complete).not.toBe(false);
  });

  // ── Fortsetzen (021b, D3) ───────────────────────────────────────────────────

  it('setzt einen abgebrochenen Lauf fort, ohne eine Prüfung zu wiederholen', async () => {
    await seedAnnouncingDay();
    const fake = await routeModelStages();

    /* Abbrechen, sobald die Deutung dran ist: die zehn Prüfungen sind fertig,
       die beiden Modellstufen haben nicht angefangen — derselbe Zustand wie im
       Teillauf-Test oben. */
    const restore = cancelOn('audit', () => void harness.call('gardener:cancel', undefined));
    const partial = await harness.call('gardener:run', { useLlm: true });
    restore();
    expect(partial.complete).toBe(false);
    expect(fake.calls.length).toBe(0);
    const orphanBefore = findingOfKind(partial.findings, 'orphan');
    expect(orphanBefore.paths[0]).toBe(SCIM);
    expect(orphanBefore.fix).toBeNull();

    /* Eine Änderung, die eine erneute Prüfung sichtbar verändern würde: die
       verwaiste Seite bekommt eine Erwähnung, die ihr einen automatischen Fix
       gäbe — sähe der fortgesetzte Lauf den `orphan`-Befund noch einmal, trüge
       er diesen Fix. Steht er weiter mit `fix: null` da, hat die Prüfung nicht
       noch einmal gelaufen. */
    await addScimMention(vault, harness);
    harness.sent.length = 0;

    const resumed = await harness.call('gardener:run', { useLlm: true, resume: true });

    /* Beide Modellstufen sind jetzt tatsächlich gelaufen — genau einmal je Stufe. */
    expect(fake.calls.length).toBe(2);
    expect(resumed.complete).not.toBe(false);
    const orphanAfter = findingOfKind(resumed.findings, 'orphan');
    expect(orphanAfter.paths[0]).toBe(SCIM);
    expect(orphanAfter.fix).toBeNull();

    /* Der Fortschritt beginnt bei der Deutung, nicht bei den Prüfungen: der
       erste Schritt dieses Laufs liegt schon über 0%, weil die Prüfungen als
       erledigt gelten, statt den Balken neu bei null zu zeigen. */
    const steps = progress(harness);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((step) => step.phase !== 'checks')).toBe(true);
    expect(steps[0]?.percent).toBeGreaterThan(0);
  });

  it('lässt eine Entscheidung über einen Fortsetzungslauf hinweg unberührt', async () => {
    await seedAnnouncingDay();
    await routeModelStages();
    const restore = cancelOn('audit', () => void harness.call('gardener:cancel', undefined));
    const partial = await harness.call('gardener:run', { useLlm: true });
    restore();
    const dismissTarget = findingOfKind(partial.findings, 'broken-link');
    await harness.call('gardener:dismiss', { id: dismissTarget.id });

    const resumed = await harness.call('gardener:run', { useLlm: true, resume: true });

    /* Nach dem fortgesetzten, jetzt vollständigen Lauf gilt „passt so" weiter —
       `save()` prunte normal, weil der Lauf vollständig ist, und die
       Entscheidung hat weiter ein Ziel. */
    expect(resumed.findings.some((finding) => finding.id === dismissTarget.id)).toBe(false);
    const state = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      dismissed: string[];
    };
    expect(state.dismissed).toContain(dismissTarget.id);
  });

  it('lässt einen erledigten Befund den Fortsetzungslauf überleben', async () => {
    await routeModelStages();
    const restore = cancelOn('audit', () => void harness.call('gardener:cancel', undefined));
    const partial = await harness.call('gardener:run', { useLlm: true });
    restore();
    expect(partial.complete).toBe(false);

    /* Zwischen Stopp und Fortsetzen wird einer der gefundenen Befunde per Fix
       erledigt — die Datei ist geschrieben, der Befund nur noch ausgeblendet. */
    const drift = partial.findings.find(
      (finding) => finding.kind === 'index-drift' && finding.fix?.action === 'add-to-index',
    ) as GardenerFinding;
    expect(drift).toBeDefined();
    const applied = await harness.call('gardener:applyFix', { finding: drift });
    expect(applied.undoToken).toBeDefined();

    const resumed = await harness.call('gardener:run', { useLlm: true, resume: true });

    /* Der fortgesetzte Lauf erbt die Befunde des Stopps, er prüft sie nicht neu.
       Also darf er auch nicht vergessen, dass dieser hier erledigt ist — sonst
       stünde er wieder offen da, ohne dass irgendwer nachgesehen hätte. */
    expect(resumed.complete).not.toBe(false);
    expect(resumed.findings.some((finding) => finding.id === drift.id)).toBe(false);
    const stored = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      fixed: { id: string }[];
    };
    expect(stored.fixed.map((entry) => entry.id)).toContain(drift.id);

    /* Und weil er noch als erledigt geführt wird, gilt auch der Rückweg weiter. */
    const undone = await harness.call('gardener:undoFix', {
      undoToken: applied.undoToken as string,
    });
    expect(undone.restored).toEqual([CATALOG]);
    const back = await harness.call('gardener:report', undefined);
    expect(back?.findings.some((finding) => finding.id === drift.id)).toBe(true);
  });

  it('fasst einen bereits vollständigen Lauf beim Fortsetzen nicht neu an', async () => {
    const first = await harness.call('gardener:run', {});
    const dismissTarget = findingOfKind(first.findings, 'orphan');
    await harness.call('gardener:dismiss', { id: dismissTarget.id });
    harness.sent.length = 0;

    const resumed = await harness.call('gardener:run', { resume: true });

    /* Nichts fehlte, also lief keine einzige Prüfung noch einmal — nur die
       eine schließende Meldung, keine je-Prüfung-Fortschritte. */
    expect(progress(harness).every((step) => step.phase !== 'checks')).toBe(true);
    expect(resumed.findings.map((finding) => finding.id)).toEqual(
      first.findings.filter((finding) => finding.id !== dismissTarget.id).map((f) => f.id),
    );
    /* Und die Entscheidung ist nicht weggefallen. */
    expect(resumed.findings.some((finding) => finding.id === dismissTarget.id)).toBe(false);
    const after = await harness.call('gardener:report', undefined);
    expect(after?.hidden?.some((entry) => entry.finding.id === dismissTarget.id)).toBe(true);
  });

  it('lässt keinen zweiten Lauf gleichzeitig zu — und gibt danach wieder frei', async () => {
    const running = harness.call('gardener:run', {});
    expect(gardenerRunSnapshot()).toMatchObject({ running: true, trigger: 'user' });

    await expect(harness.call('gardener:run', {})).rejects.toMatchObject({ code: 'invalid' });

    await running;
    expect(gardenerRunSnapshot()).toBeNull();
  });

  // ── Laufstatus abfragen ─────────────────────────────────────────────────────

  it('gibt null zurück, wenn kein Lauf geht', async () => {
    expect(await harness.call('gardener:runStatus', undefined)).toBeNull();
  });

  it('gibt die laufende Momentaufnahme zurück, ohne auf ein Ereignis zu warten', async () => {
    const running = harness.call('gardener:run', {});

    const status = await harness.call('gardener:runStatus', undefined);
    expect(status).toMatchObject({ running: true, trigger: 'user' });

    await running;
    expect(await harness.call('gardener:runStatus', undefined)).toBeNull();
  });

  it('gibt den Lauf auch frei, wenn er scheitert', async () => {
    const index = harness.services.requireIndex.bind(harness.services);
    harness.services.requireIndex = () => {
      throw new Error('Index kaputt');
    };

    await expect(harness.call('gardener:run', {})).rejects.toThrow('Index kaputt');
    harness.services.requireIndex = index;

    /* Ein gescheiterter Lauf endet so sichtbar wie ein fertiger — und der
       nächste darf sofort starten, statt an einem hängengebliebenen
       „es läuft schon" zu scheitern. */
    expect(progress(harness).at(-1)).toMatchObject({ running: false });
    expect(gardenerRunSnapshot()).toBeNull();
    await harness.call('gardener:run', {});
  });

  // ── Passt so ───────────────────────────────────────────────────────────────

  it('blendet einen Befund dauerhaft aus, rechnet die Gesundheit neu und nimmt es zurück', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');

    await harness.call('gardener:dismiss', { id: target.id });

    const after = await harness.call('gardener:report', undefined);
    expect(after?.findings.some((finding) => finding.id === target.id)).toBe(false);
    expect(after?.health).toBeGreaterThan(report.health);
    const state = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      dismissed: string[];
    };
    expect(state.dismissed).toContain(target.id);

    /* Ein weiterer Lauf hält die Entscheidung — dieselbe Zusage wie bei den
       Erinnerungen: die Kennung hängt an der Sache, nicht am Lauf. */
    const second = await harness.call('gardener:run', {});
    expect(second.findings.some((finding) => finding.id === target.id)).toBe(false);

    await harness.call('gardener:undismiss', { id: target.id });
    const back = await harness.call('gardener:report', undefined);
    expect(back?.findings.some((finding) => finding.id === target.id)).toBe(true);
  });

  it('weist ab, was kein Lauf kennt', async () => {
    await harness.call('gardener:run', {});
    await expect(harness.call('gardener:dismiss', { id: 'gibt-es-nicht' })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(harness.call('gardener:undismiss', { id: 'gibt-es-nicht' })).rejects.toMatchObject(
      {
        code: 'not-found',
      },
    );
  });

  // ── Ruhezeit ───────────────────────────────────────────────────────────────

  it('legt einen Befund für einen Zeitraum still, zeigt ihn im Bericht als ausgeblendet — und hebt es wieder auf', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');
    harness.sent.length = 0;

    await harness.call('gardener:snooze', { id: target.id, days: 3 });

    /* Dasselbe Aufwecken wie bei „Passt so" — sonst müsste der Schirm auf
       eine erneute Anfrage warten, um die Ruhezeit zu sehen. */
    expect(harness.sent.some((entry) => entry.name === 'event:vault-changed')).toBe(true);

    const after = await harness.call('gardener:report', undefined);
    expect(after?.findings.some((finding) => finding.id === target.id)).toBe(false);
    const hidden = after?.hidden?.find((entry) => entry.finding.id === target.id);
    expect(hidden).toMatchObject({ state: 'snoozed', until: day(3) });
    const state = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      snoozed: Record<string, string>;
    };
    expect(state.snoozed[target.id]).toBe(day(3));

    await harness.call('gardener:unsnooze', { id: target.id });
    const back = await harness.call('gardener:report', undefined);
    expect(back?.findings.some((finding) => finding.id === target.id)).toBe(true);
    expect(back?.hidden?.some((entry) => entry.finding.id === target.id)).toBe(false);
  });

  it('weist eine unbekannte Kennung beim Stillstellen ab', async () => {
    await harness.call('gardener:run', {});
    await expect(
      harness.call('gardener:snooze', { id: 'gibt-es-nicht', days: 3 }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('weist eine Ruhezeit außerhalb von 1 bis 365 Tagen ab', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');

    await expect(harness.call('gardener:snooze', { id: target.id, days: 0 })).rejects.toMatchObject(
      { code: 'invalid' },
    );
    await expect(
      harness.call('gardener:snooze', { id: target.id, days: 366 }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('weist ab, eine Ruhezeit aufzuheben, die es nicht gibt', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');

    await expect(harness.call('gardener:unsnooze', { id: target.id })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(harness.call('gardener:unsnooze', { id: 'gibt-es-nicht' })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('lässt einen Befund wieder auftauchen, sobald seine Ruhezeit abgelaufen ist', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');
    await harness.call('gardener:snooze', { id: target.id, days: 1 });
    const stillHidden = await harness.call('gardener:report', undefined);
    expect(stillHidden?.findings.some((finding) => finding.id === target.id)).toBe(false);

    /* Der Tag, ab dem die Ruhezeit nicht mehr gilt — dieselbe Uhr, die
       `gardenerToday()` liest. */
    vi.setSystemTime(Date.parse(`${day(1)}T09:00:00+02:00`));

    const later = await harness.call('gardener:report', undefined);
    expect(later?.findings.some((finding) => finding.id === target.id)).toBe(true);
    expect(later?.hidden?.some((entry) => entry.finding.id === target.id)).toBe(false);
  });

  // ── Guardrail: nur gardener.json (017 D6) ───────────────────────────────────

  /* Das Kernversprechen von 017: „passt so", „nicht jetzt" und der Rückweg sind
     abgeleiteter Zustand, keine Änderung an der Sache selbst. Anders als die
     Schreibwege aus 015/016 (Verwerfen, Überholen, Verweis eintragen), die
     bewusst eine Vault-Datei anfassen und deshalb hash-gewacht sind, dürfen
     diese vier Kanäle *nie* eine Markdown-Datei berühren — nur die eine JSON
     neben ihr. */
  it('D6: „passt so", „nicht jetzt" und der Rückweg ändern keine Markdown-Datei im Vault', async () => {
    const report = await harness.call('gardener:run', {});
    const dismissTarget = findingOfKind(report.findings, 'orphan');
    const snoozeTarget = findingOfKind(report.findings, 'broken-link');

    const before = await snapshotMarkdown(vault);

    await harness.call('gardener:dismiss', { id: dismissTarget.id });
    await harness.call('gardener:snooze', { id: snoozeTarget.id, days: 3 });

    expect(await snapshotMarkdown(vault)).toEqual(before);
    expect(await vault.exists('.secondbrain/gardener.json')).toBe(true);
    const afterHide = (await vault.read('.secondbrain/gardener.json')) ?? '';

    await harness.call('gardener:undismiss', { id: dismissTarget.id });
    await harness.call('gardener:unsnooze', { id: snoozeTarget.id });

    expect(await snapshotMarkdown(vault)).toEqual(before);
    /* Zur Kontrolle: `gardener.json` selbst hat sich zwischen den beiden
       Momentaufnahmen sehr wohl bewegt — sonst würde dieser Test nichts über
       den Unterschied zu einer Markdown-Datei aussagen. */
    const afterRestore = (await vault.read('.secondbrain/gardener.json')) ?? '';
    expect(afterRestore).not.toBe(afterHide);
  });

  // ── Übersteht einen frischen Lauf (017 D6) ──────────────────────────────────

  it('D6: ein weggelegter Befund übersteht einen frischen Lauf und bleibt danach zurückholbar', async () => {
    const report = await harness.call('gardener:run', {});
    const target = findingOfKind(report.findings, 'orphan');
    await harness.call('gardener:dismiss', { id: target.id });

    /* Ein vollständiger, neuer Lauf — nicht nur ein weiterer `gardener:report`. */
    const rerun = await harness.call('gardener:run', {});
    expect(rerun.findings.some((finding) => finding.id === target.id)).toBe(false);
    expect(rerun.hidden).toContainEqual({
      finding: expect.objectContaining({ id: target.id }),
      state: 'dismissed',
    });

    /* Ein frischer Bericht danach — wie nach einem Neuladen des Screens —
       kennt die Ausblendung immer noch, nicht nur direkt nach dem Lauf. */
    const reloaded = await harness.call('gardener:report', undefined);
    const hiddenAfterReload = reloaded?.hidden?.find((entry) => entry.finding.id === target.id);
    expect(hiddenAfterReload).toMatchObject({ state: 'dismissed' });

    /* Und der Rückweg funktioniert nach diesem frischen Lauf genauso wie
       vorher. */
    await harness.call('gardener:undismiss', { id: target.id });
    const restored = await harness.call('gardener:report', undefined);
    expect(restored?.findings.some((finding) => finding.id === target.id)).toBe(true);
    expect(restored?.hidden?.some((entry) => entry.finding.id === target.id)).toBe(false);
  });

  // ── Fixes ──────────────────────────────────────────────────────────────────

  it('trägt einen Katalogeintrag genau so nach, wie die Vorschau es zeigt — und dreht ihn zurück', async () => {
    const report = await harness.call('gardener:run', {});
    const drift = report.findings.find(
      (finding) => finding.kind === 'index-drift' && finding.fix?.action === 'add-to-index',
    );
    expect(drift).toBeDefined();
    const preview = drift?.fix?.preview ?? '';
    expect(preview.length).toBeGreaterThan(0);

    const result = await harness.call('gardener:applyFix', { finding: drift as GardenerFinding });

    expect(result.written).toEqual([CATALOG]);
    expect(result.undoToken).toBeDefined();
    const catalog = (await vault.read(CATALOG)) ?? '';
    expect(catalog).toContain('scim');
    /* Der erledigte Befund verschwindet aus der Liste, ohne neuen Lauf. */
    const after = await harness.call('gardener:report', undefined);
    expect(after?.findings.some((finding) => finding.id === drift?.id)).toBe(false);

    const undone = await harness.call('gardener:undoFix', {
      undoToken: result.undoToken as string,
    });
    expect(undone.restored).toEqual([CATALOG]);
    expect(undone.kept).toEqual([]);
    expect((await vault.read(CATALOG)) ?? '').not.toContain('scim');
    const back = await harness.call('gardener:report', undefined);
    expect(back?.findings.some((finding) => finding.id === drift?.id)).toBe(true);
  });

  it('lässt eine seither bearbeitete Datei beim Zurückdrehen in Ruhe', async () => {
    const report = await harness.call('gardener:run', {});
    const drift = report.findings.find(
      (finding) => finding.kind === 'index-drift' && finding.fix?.action === 'add-to-index',
    ) as GardenerFinding;
    const result = await harness.call('gardener:applyFix', { finding: drift });

    /* Der Nutzer schreibt selbst — der Rückweg darf das nicht plattbügeln. */
    await vault.write(CATALOG, `${(await vault.read(CATALOG)) ?? ''}\n- von Hand\n`);
    const undone = await harness.call('gardener:undoFix', {
      undoToken: result.undoToken as string,
    });

    expect(undone.restored).toEqual([]);
    expect(undone.kept).toEqual([CATALOG]);
    expect((await vault.read(CATALOG)) ?? '').toContain('von Hand');
  });

  it('schreibt nichts, wenn der Fix nur öffnet', async () => {
    /* Ein Dump, der lange genug liegt: sein Fix ist „zum Einordnen öffnen".
       Das Alter steht im Frontmatter, nicht in der mtime — der Check rechnet mit
       `created`. */
    await vault.write(
      'inbox/2026-07-11-0900-liegengeblieben.md',
      `---\ntype: dump\ntitle: Liegengeblieben\ncreated: ${day(-30)}T09:00:00+02:00\norigin: window\nstatus: raw\ntags: []\nscope: null\n---\n\nEin Gedanke, den niemand eingeordnet hat.\n`,
    );
    await harness.services.requireIndex().refresh?.();
    const report = await harness.call('gardener:run', {});
    const dump = findingOfKind(report.findings, 'unfiled-dump');
    const before = await vault.read(dump.paths[0] ?? '');

    const result = await harness.call('gardener:applyFix', { finding: dump });

    expect(result.written).toEqual([]);
    expect(result.open).toEqual(dump.paths);
    expect(result.undoToken).toBeUndefined();
    expect(await vault.read(dump.paths[0] ?? '')).toBe(before);
    /* Nichts geschrieben heißt: der Befund steht weiter da. */
    const after = await harness.call('gardener:report', undefined);
    expect(after?.findings.some((finding) => finding.id === dump.id)).toBe(true);
  });

  it('lehnt einen überholten Fix ab, statt blind zu schreiben', async () => {
    const report = await harness.call('gardener:run', {});
    const drift = report.findings.find(
      (finding) => finding.kind === 'index-drift' && finding.fix?.action === 'add-to-index',
    ) as GardenerFinding;
    await harness.call('gardener:applyFix', { finding: drift });

    await expect(harness.call('gardener:applyFix', { finding: drift })).rejects.toMatchObject({
      code: 'invalid',
    });
  });

  // ── Discard & Supersede (015 D6) ────────────────────────────────────────────

  it('weist einen Pfad ab, den kein aktueller Lauf kennt', async () => {
    await harness.call('gardener:run', {});
    const unknown = 'modules/identity-management/wiki/entities/nicht-da.md';

    await expect(harness.call('gardener:discardPlan', { path: unknown })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(harness.call('gardener:discardPage', { path: unknown })).rejects.toMatchObject({
      code: 'not-found',
    });
    await expect(
      harness.call('gardener:supersede', { newerPath: unknown, olderPath: unknown }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('zeigt die Vorschau eines Verwerfens, ohne etwas zu schreiben', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const path = orphan.paths[0] as string;
    const before = await vault.read(path);

    const plan = await harness.call('gardener:discardPlan', { path });

    expect(plan.target.path).toBe(path);
    expect(plan.catalogPath).toBe(CATALOG);
    /* Rein lesend — die Vorschau darf die Seite nicht verändern. */
    expect(await vault.read(path)).toBe(before);
  });

  it('verwirft eine Seite, meldet den Papierkorb-Pfad an settle — und macht es rückgängig', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const path = orphan.paths[0] as string;
    harness.sent.length = 0;

    const result = await harness.call('gardener:discardPage', { path });

    expect(result.discarded).toBe(path);
    expect(result.undoToken).toBeDefined();
    expect(await vault.exists(path)).toBe(false);
    /* `settle` trägt sowohl die geänderten Dateien als auch den gelöschten Pfad —
       sonst würde der Schirm die verworfene Seite weiter für vorhanden halten. */
    const wake = harness.sent.find((entry) => entry.name === 'event:vault-changed');
    expect(wake?.payload).toMatchObject({
      paths: expect.arrayContaining([path, ...result.written]),
    });

    const undone = await harness.call('gardener:undoFix', { undoToken: result.undoToken });
    expect(undone.restored).toContain(path);
    expect(await vault.exists(path)).toBe(true);
  });

  it('benennt, dass eine Seite eine andere abloest — und macht es rückgängig', async () => {
    const report = await harness.call('gardener:run', {});
    /* `scim.md` fehlt im Katalog (index-drift) *und* hat keinen Verweis von
       woanders (orphan); `oauth2.md` trägt den toten Verweis (broken-link) —
       zwei verschiedene, echte Wiki-Seiten aus demselben Bericht. */
    const newer = findingOfKind(report.findings, 'index-drift').paths[0] as string;
    const older = findingOfKind(report.findings, 'broken-link').paths[0] as string;
    expect(newer).not.toBe(older);

    const result = await harness.call('gardener:supersede', { newerPath: newer, olderPath: older });

    expect(result.written).toBe(newer);
    expect(result.undoToken).toBeDefined();
    expect(await vault.read(newer)).toContain('supersedes:');

    const undone = await harness.call('gardener:undoFix', { undoToken: result.undoToken });
    expect(undone.restored).toContain(newer);
    expect(await vault.read(newer)).not.toContain('supersedes:');
  });

  /* AC 10, zweiter Satz: „eine Datei, die seit dem Lauf bearbeitet wurde, wird
     auch nicht stillschweigend verworfen". Der Hash-Vergleich im Kern kann das
     nicht leisten — die Vorschau liest die schon bearbeitete Datei und stimmt
     mit sich selbst ueberein. Deshalb haelt jeder Befund den Hash seiner Dateien
     zum Laufzeitpunkt fest, und die drei Kanaele vergleichen dagegen. */
  it('meldet einen Konflikt, wenn die Datei seit dem Lauf bearbeitet wurde — vor jedem Schreiben', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const path = orphan.paths[0] as string;
    const other = findingOfKind(report.findings, 'broken-link').paths[0] as string;
    /* Der Lauf hat den Hash festgehalten — ohne ihn gäbe es nichts zu vergleichen. */
    expect(orphan.hashes?.[path]).toBeTypeOf('string');

    /* Der Nutzer schreibt in Obsidian, ohne danach neu zu prüfen. */
    await vault.write(path, `${(await vault.read(path)) ?? ''}\nVon Hand ergänzt.\n`);

    /* Schon die Vorschau sagt es: sonst zeigte der Dialog einen Plan, den der
       Klick nicht halten kann. */
    await expect(harness.call('gardener:discardPlan', { path })).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(harness.call('gardener:discardPage', { path })).rejects.toMatchObject({
      code: 'conflict',
    });
    await expect(
      harness.call('gardener:supersede', { newerPath: path, olderPath: other }),
    ).rejects.toMatchObject({ code: 'conflict' });

    /* Die Datei steht noch da, mit der Änderung des Nutzers. */
    expect(await vault.exists(path)).toBe(true);
    expect((await vault.read(path)) ?? '').toContain('Von Hand ergänzt.');

    /* Und nach einem neuen Lauf geht es wieder — der Konflikt hängt am veralteten
       Bericht, nicht an der Datei. Der Lauf rechnet auf dem Index, also muss der
       die Fremdänderung erst gesehen haben; in der App macht das der Watcher. */
    await harness.services.requireIndex().refresh?.();
    const again = await harness.call('gardener:run', {});
    expect(findingOfKind(again.findings, 'orphan').paths[0]).toBe(path);
    const plan = await harness.call('gardener:discardPlan', { path });
    expect(plan.target.path).toBe(path);
  });

  // ── Verwaiste Seite: Ziel wählen (016 D2) ───────────────────────────────────

  it('nennt Ziele für eine verwaiste Seite ohne automatischen Fix, ohne zu schreiben', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    expect(orphan.fix).toBeNull();
    const path = orphan.paths[0] as string;
    const before = await vault.read(path);

    const result = await harness.call('gardener:orphanTargets', { findingId: orphan.id });

    expect(result.line).toBe('Bezug: [[scim]]');
    /* Überblicksseite zuerst, der Rest alphabetisch nach Titel — die mittlere
       Gruppe (Titel teilt ein Wort mit dem der verwaisten Seite) bleibt leer,
       weil kein anderer Titel ein Wort mit "SCIM" teilt. */
    expect(result.targets.map((target) => target.slug)).toEqual([
      'overview',
      's-2026-08-04-token-lifetimes-blog',
      'oauth2',
      'token-lebensdauer',
    ]);
    /* Rein lesend. */
    expect(await vault.read(path)).toBe(before);
  });

  it('weist eine unbekannte Befundkennung ab', async () => {
    await harness.call('gardener:run', {});
    await expect(
      harness.call('gardener:orphanTargets', { findingId: 'gibt-es-nicht' }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('weist einen Befund ab, der kein verwaister ist', async () => {
    const report = await harness.call('gardener:run', {});
    const brokenLink = findingOfKind(report.findings, 'broken-link');

    await expect(
      harness.call('gardener:orphanTargets', { findingId: brokenLink.id }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  it('weist eine verwaiste Seite ab, die schon einen automatischen Fix hat', async () => {
    /* Eine zusätzliche Seite, die "SCIM" im Text nennt, ohne zu verlinken —
       genau die eine Stelle, die `singleMention` braucht, damit der Befund
       einen Fix bekommt und diese Kanal-Vorbedingung nicht mehr gilt. */
    await vault.write(
      'modules/identity-management/wiki/entities/scim-erwaehnung.md',
      [
        '---',
        'type: entity',
        'title: SCIM-Erwähnung',
        'module: identity-management',
        'created: 2026-04-15',
        'updated: 2026-04-15',
        'reviewed: 2026-04-15',
        'tags: [auth]',
        'lang: de',
        '---',
        '',
        'Dieser Text erwähnt SCIM 2.0, ohne dorthin zu verlinken.',
        '',
      ].join('\n'),
    );
    await harness.services.requireIndex().refresh?.();

    const scimPath = 'modules/identity-management/wiki/entities/scim.md';
    const report = await harness.call('gardener:run', {});
    const orphan = report.findings.find(
      (finding) => finding.kind === 'orphan' && finding.paths[0] === scimPath,
    );
    expect(orphan?.fix).not.toBeNull();

    await expect(
      harness.call('gardener:orphanTargets', { findingId: (orphan as GardenerFinding).id }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  // ── Verwaiste Seite: Ziel bestätigen (016 D3) ───────────────────────────────

  it('schreibt die Zeile aus der Vorschau in das gewählte Ziel — und dreht sie zurück', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    expect(orphan.paths[0]).toBe(SCIM);
    expect(orphan.fix).toBeNull();
    const preview = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    const target = 'modules/identity-management/wiki/entities/oauth2.md';
    expect(preview.targets.map((entry) => entry.path)).toContain(target);
    const before = (await vault.read(target)) ?? '';

    const result = await harness.call('gardener:linkOrphan', { findingId: orphan.id, target });

    expect(result.written).toEqual([target]);
    expect(result.undoToken).toBeDefined();
    /* Genau eine Zeile dazu — und das `updated`, das jeder Schreibweg setzt.
       Nichts anderes an der Seite darf sich bewegt haben. */
    const beforeLines = before.split('\n');
    const after = (await vault.read(target)) ?? '';
    const added = after
      .split('\n')
      .filter((line) => line.length > 0 && !beforeLines.includes(line));
    expect(added).toEqual([`updated: ${TODAY}`, preview.line]);
    expect(preview.line).toBe('Bezug: [[scim]]');
    /* Die Chronik des Moduls bekommt ihren `lint`-Eintrag. */
    expect((await vault.read(MODULE_LOG)) ?? '').toContain('orphan (add-links)');
    /* Der erledigte Befund verschwindet aus der Liste, ohne neuen Lauf. */
    const done = await harness.call('gardener:report', undefined);
    expect(done?.findings.some((finding) => finding.id === orphan.id)).toBe(false);

    const undone = await harness.call('gardener:undoFix', {
      undoToken: result.undoToken as string,
    });
    expect(undone.restored).toEqual([target]);
    expect(await vault.read(target)).toBe(before);
  });

  /* 016 D7: dieser Testbestand läuft überall ohne konfiguriertes Modell
     (Guardrail 1) — hier steht das ausdrücklich hin, statt nebenbei zu gelten.
     Ein Fund, den nur eine deterministische Prüfung erzeugt hat, wird durch
     eine menschliche Wahl behoben, ohne dass irgendein Schritt dazwischen ein
     Modell braucht oder fragt. */
  it('kommt vom Fund bis zum geschriebenen Verweis ganz ohne Modell aus', async () => {
    const report = await harness.call('gardener:run', { useLlm: true });
    expect(report.usedLlm).toBe(false);
    const orphan = findingOfKind(report.findings, 'orphan');
    const target = 'modules/identity-management/wiki/entities/oauth2.md';

    const preview = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    expect(preview.targets.map((entry) => entry.path)).toContain(target);

    const result = await harness.call('gardener:linkOrphan', { findingId: orphan.id, target });

    expect(result.written).toEqual([target]);
    expect(result.undoToken).toBeDefined();
    const after = await harness.call('gardener:report', undefined);
    expect(after?.usedLlm).toBe(false);
    expect(after?.findings.some((finding) => finding.id === orphan.id)).toBe(false);
  });

  /* Der Kern der Sache: der Renderer schickt einen nackten Pfad zurück, und das
     Main rechnet die erlaubte Menge neu, statt ihm zu glauben. Alles, was ein
     Angreifer wie ein Versehen nennen könnte — eine und dieselbe Absage. */
  it('weist jedes Ziel ab, das nicht in der neu gerechneten Auswahl steht', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');

    /* Eine Seite in einem anderen Modul — und eine, die die verwaiste Seite
       inzwischen selbst verlinkt: `orphanTargets` schließt beide aus, also ist
       die Auswahl frisch gerechnet und nicht aus dem Lauf übernommen. */
    await vault.write(
      'modules/zweites-modul/module.md',
      '---\ntype: note\ntitle: Zweites Modul\nslug: zweites-modul\ndescription: Ein zweites Modul\ncreated: 2026-05-01\nupdated: 2026-05-01\ntags: []\nlang: de\n---\n\nEin zweites Modul.\n',
    );
    const foreign = 'modules/zweites-modul/wiki/concepts/fremd.md';
    await vault.write(
      foreign,
      '---\ntype: concept\ntitle: Fremde Seite\nmodule: zweites-modul\ncreated: 2026-05-01\nupdated: 2026-05-01\nreviewed: 2026-05-01\ntags: []\nlang: de\n---\n\nEine Seite in einem anderen Modul.\n',
    );
    const linking = 'modules/identity-management/wiki/concepts/verlinkt-scim.md';
    await vault.write(
      linking,
      '---\ntype: concept\ntitle: Verlinkt SCIM\nmodule: identity-management\ncreated: 2026-05-01\nupdated: 2026-05-01\nreviewed: 2026-05-01\ntags: []\nlang: de\n---\n\nDiese Seite verlinkt [[scim]] schon.\n',
    );
    await harness.services.requireIndex().refresh?.();

    const rejected = [
      /* Die verwaiste Seite selbst. */
      SCIM,
      /* Ein anderes Modul. */
      foreign,
      /* Verlinkt schon — der Lauf wusste das noch nicht, die Auswahl schon. */
      linking,
      /* Struktur, keine Seite (VAULT-FORMAT.md). */
      CATALOG,
      MODULE_LOG,
      /* Und irgendein Vault-Pfad, der gar keine Wiki-Seite ist. */
      'journal/2026/08/2026-08-10.md',
      'projects/work/kundenportal-relaunch/project.md',
      'raw/web/2026-08-06-digital-gardening-ueberblick.md',
    ];
    for (const target of rejected) {
      const before = await vault.read(target);
      await expect(
        harness.call('gardener:linkOrphan', { findingId: orphan.id, target }),
      ).rejects.toMatchObject({ code: 'invalid' });
      /* Abgewiesen heißt: nicht angefasst. */
      expect(await vault.read(target)).toBe(before);
    }
  });

  it('weist eine unbekannte Befundkennung beim Bestätigen ab', async () => {
    await harness.call('gardener:run', {});
    await expect(
      harness.call('gardener:linkOrphan', {
        findingId: 'gibt-es-nicht',
        target: 'modules/identity-management/wiki/entities/oauth2.md',
      }),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('bestätigt nur für einen Verwaisten-Befund ohne automatischen Fix', async () => {
    const report = await harness.call('gardener:run', {});
    const brokenLink = findingOfKind(report.findings, 'broken-link');
    await expect(
      harness.call('gardener:linkOrphan', {
        findingId: brokenLink.id,
        target: 'modules/identity-management/wiki/entities/oauth2.md',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });

    /* Und eine verwaiste Seite, die schon einen automatischen Fix hat: dafür ist
       `gardener:applyFix` da, nicht dieser Kanal. */
    const mention = await addScimMention(vault, harness);
    const again = await harness.call('gardener:run', {});
    const withFix = again.findings.find(
      (finding) => finding.kind === 'orphan' && finding.paths[0] === SCIM,
    ) as GardenerFinding;
    expect(withFix.fix).not.toBeNull();
    await expect(
      harness.call('gardener:linkOrphan', { findingId: withFix.id, target: mention }),
    ).rejects.toMatchObject({ code: 'invalid' });
  });

  /* Regression: der eindeutige Ein-Kandidaten-Fall geht weiter über
     `gardener:applyFix` und ist von einem gewählten Ziel nicht zu unterscheiden —
     dieselbe Aktion, dieselbe Zeile, dieselbe Zieldatei. */
  it('schreibt den eindeutigen Verweis weiter über applyFix', async () => {
    const mention = await addScimMention(vault, harness);
    const report = await harness.call('gardener:run', {});
    const orphan = report.findings.find(
      (finding) => finding.kind === 'orphan' && finding.paths[0] === SCIM,
    ) as GardenerFinding;
    expect(orphan.fix?.action).toBe('add-links');
    expect(orphan.paths[1]).toBe(mention);

    const result = await harness.call('gardener:applyFix', { finding: orphan });

    expect(result.written).toEqual([mention]);
    expect(result.undoToken).toBeDefined();
    expect((await vault.read(mention)) ?? '').toContain(orphan.fix?.preview ?? 'x');
  });

  // ── Verwaiste Seite: Hash-Wache und ehrliches Scheitern (016 D4) ───────────

  /* Der Unterschied, der hier festgeschrieben wird, ist der ganze Punkt dieser
     drei Tests:

     - **`conflict`** heißt „jemand war schneller": die Datei hat sich zwischen
       dem frischen Lesen und dem Schreiben *innerhalb desselben Aufrufs*
       geändert. Nur das ist ein Konflikt — eine Änderung *vor* dem Aufruf liest
       `addLinks` einfach mit (dritter Test).
     - **`invalid`** heißt „die Auswahl passt nicht mehr": das Ziel steht in der
       neu gerechneten Kandidatenliste nicht mehr. Nichts wurde versucht.

     Verschwimmt die Grenze, wird aus einem ehrlichen „bitte neu prüfen" ein
     stilles Überschreiben — oder umgekehrt eine Absage, die nach Datenverlust
     klingt, obwohl nur die Vorschau veraltet war. */
  it('meldet einen Konflikt, wenn das Ziel zwischen Lesen und Schreiben von außen wächst', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const target = 'modules/identity-management/wiki/entities/oauth2.md';
    const preview = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    expect(preview.targets.map((entry) => entry.path)).toContain(target);
    const foreign = 'Von einem anderen Prozess geschrieben.';
    const raced = `${(await vault.read(target)) ?? ''}\n${foreign}\n`;

    /* Die Fremdänderung muss **während** des Aufrufs landen: `addLinks` hat den
       alten Inhalt und dessen Hash dann schon gelesen, geschrieben wird erst
       danach. Der Store gehört dem Kanal (`wikiStore`), also ist das Lesen am
       Prototyp die einzige Stelle, an der diese Lücke zu treffen ist. Der Aufruf
       sieht weiter den alten Inhalt — genau so sieht ein echtes Wettrennen aus. */
    const readOriginal = FsVaultStore.prototype.readText;
    const plain = new FsVaultStore(vault.root);
    let injected = false;
    const spy = vi
      .spyOn(FsVaultStore.prototype, 'readText')
      .mockImplementation(async (path: string) => {
        const content = await readOriginal.call(plain, path);
        if (path === target && !injected) {
          injected = true;
          /* Am Store vorbei, wie ein Editor von außen. */
          await vault.write(target, raced);
        }
        return content;
      });

    const failed: unknown = await harness
      .call('gardener:linkOrphan', { findingId: orphan.id, target })
      .then(
        () => null,
        (error: unknown) => error,
      )
      .finally(() => spy.mockRestore());

    expect(injected).toBe(true);
    /* Der Wortlaut sagt, woher die Absage kommt: aus `assertWritable`
       (`core/vault/compose.ts`), also von der Hash-Wache selbst — nicht aus einer
       Vorprüfung im Kanal, die ein Wettrennen gar nicht sehen kann. */
    expect(failed).toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('Konflikt in'),
    });
    /* Und der Code überlebt jeden Sprung: `registry.ts` verpackt jeden Fehler
       mit `toIpcError`, das Preload steckt ihn als JSON in die Nachricht. Der
       Renderer packt in `decodeIpcError` genau dieses JSON wieder aus — dieselbe
       Vorsilbe, dieselbe Codeliste; importieren darf ein Main-Test ihn nicht
       (tsconfig-Grenze), also wird hier ausgepackt wie dort. */
    const wire = encodeIpcError(toIpcError(failed));
    expect(wire.message.startsWith(IPC_ERROR_PREFIX)).toBe(true);
    const decoded: unknown = JSON.parse(wire.message.slice(IPC_ERROR_PREFIX.length));
    expect(decoded).toMatchObject({ code: 'conflict' });

    /* Nicht überschrieben: Zeichen für Zeichen das, was der andere Prozess
       geschrieben hat — und kein Verweis auf die verwaiste Seite. */
    expect(await vault.read(target)).toBe(raced);
    expect(raced).not.toContain(preview.line);
    /* Nichts erledigt heißt: der Befund steht noch offen. */
    const still = await harness.call('gardener:report', undefined);
    expect(still?.findings.some((finding) => finding.id === orphan.id)).toBe(true);
  });

  it('weist ein Ziel als „nicht mehr wählbar" ab, nicht als Konflikt', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const target = 'modules/identity-management/wiki/entities/oauth2.md';
    const preview = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    expect(preview.targets.map((entry) => entry.path)).toContain(target);

    /* Jemand hat den Verweis von Hand gesetzt: damit ist das Ziel kein Kandidat
       mehr — `orphanTargets` schließt jede Seite aus, die die verwaiste Seite
       schon verlinkt. Die Datei ist geändert, aber das ist hier nicht die
       Nachricht: der Klick macht keinen Sinn mehr. */
    const byHand = `${(await vault.read(target)) ?? ''}\n${preview.line}\n`;
    await vault.write(target, byHand);
    await harness.services.requireIndex().refresh?.();

    const again = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    expect(again.targets.map((entry) => entry.path)).not.toContain(target);
    await expect(
      harness.call('gardener:linkOrphan', { findingId: orphan.id, target }),
    ).rejects.toMatchObject({ code: 'invalid' });

    /* Abgewiesen heißt: nicht angefasst — die Zeile des Nutzers steht genau
       einmal da. */
    expect(await vault.read(target)).toBe(byHand);
  });

  it('liest das gewählte Ziel frisch und hängt den Verweis unter eine Fremdänderung', async () => {
    const report = await harness.call('gardener:run', {});
    const orphan = findingOfKind(report.findings, 'orphan');
    const target = 'modules/identity-management/wiki/entities/oauth2.md';
    const preview = await harness.call('gardener:orphanTargets', { findingId: orphan.id });
    const byHand = 'Eine Zeile, die der Nutzer in Obsidian geschrieben hat.';
    await vault.write(target, `${(await vault.read(target)) ?? ''}\n${byHand}\n`);

    const result = await harness.call('gardener:linkOrphan', { findingId: orphan.id, target });

    expect(result.written).toEqual([target]);
    const after = (await vault.read(target)) ?? '';
    /* Kein Wort verloren, und der Verweis steht **unter** der Fremdänderung:
       geschrieben wurde auf dem Stand, der beim Klick auf der Platte lag. */
    expect(after).toContain(byHand);
    expect(after.indexOf(preview.line)).toBeGreaterThan(after.indexOf(byHand));
    expect(after).toContain(`updated: ${TODAY}`);
  });

  // ── Dashboard ──────────────────────────────────────────────────────────────

  it('gibt dem Dashboard den Wert des letzten Laufs, vorher keinen', async () => {
    const before = await harness.call('dashboard:data', undefined);
    expect(before.healthKnown).toBe(false);
    expect(before.health).toBe(0);

    const report = await harness.call('gardener:run', {});
    const after = await harness.call('dashboard:data', undefined);

    expect(after.healthKnown).toBe(true);
    expect(after.health).toBe(report.health);
    expect(after.findingCount).toBe(report.findings.length);
  });

  // ── Modul-Screen ───────────────────────────────────────────────────────────

  /* Zwei Orte für dieselbe Frage wären einer zu viel: die Modulkarte zeigt die
     Befunde ihres Moduls aus demselben Lauf, den der Pflege-Screen zeigt. */
  it('zählt die Befunde je Modul erst, wenn ein Lauf vorliegt', async () => {
    const before = await harness.call('modules:list', undefined);
    expect(before.length).toBeGreaterThan(0);
    /* Ohne Lauf ist 0 keine Behauptung über den Bestand, sondern „nichts bekannt". */
    expect(before.every((module) => module.findingCount === 0)).toBe(true);

    const report = await harness.call('gardener:run', {});
    const after = await harness.call('modules:list', undefined);
    for (const module of after) {
      expect(module.findingCount, module.slug).toBe(
        report.findings.filter((finding) => finding.module === module.slug).length,
      );
    }
    expect(after.some((module) => module.findingCount > 0)).toBe(true);

    /* „Passt so" senkt die Zahl mit — sie liest denselben gefilterten Bericht. */
    const target = findingOfKind(report.findings, 'orphan');
    const owner = after.find((module) => module.slug === target.module);
    expect(owner).toBeDefined();
    await harness.call('gardener:dismiss', { id: target.id });
    const quieter = (await harness.call('modules:list', undefined)).find(
      (module) => module.slug === target.module,
    );
    expect(quieter?.findingCount).toBe((owner?.findingCount ?? 0) - 1);
  });

  // ── Beim Öffnen prüfen ─────────────────────────────────────────────────────

  it('prüft beim Öffnen, wenn die Einstellung es sagt — und sonst nicht', async () => {
    const { GardenerAutorun } = await import('../../src/main/gardener-autorun');
    const autorun = new GardenerAutorun(harness.services, { delayMs: 0 });

    await harness.settings.patchVault({ gardener: { runOnOpen: false } });
    expect(await autorun.run()).toBe('off');
    expect(await vault.exists('.secondbrain/gardener.json')).toBe(false);

    await harness.settings.patchVault({ gardener: { runOnOpen: true } });
    expect(await autorun.run()).toBe('ran');
    const report = await harness.call('gardener:report', undefined);
    expect(report?.findings.length).toBeGreaterThan(0);
    expect(report?.ranAt.slice(0, 10)).toBe(TODAY);
  });

  it('meldet den Lauf beim Öffnen — mit „auto" als Auslöser', async () => {
    const { GardenerAutorun } = await import('../../src/main/gardener-autorun');
    const autorun = new GardenerAutorun(harness.services, { delayMs: 0 });
    await harness.settings.patchVault({ gardener: { runOnOpen: true } });
    harness.sent.length = 0;

    expect(await autorun.run()).toBe('ran');

    /* Vorher lief dieser Lauf ohne `onProgress` — er passierte, und der
       Bildschirm sagte nichts dazu. */
    const steps = progress(harness);
    expect(steps.length).toBeGreaterThan(5);
    expect(steps.every((step) => step.trigger === 'auto')).toBe(true);
    expect(steps.at(-1)).toMatchObject({ running: false });
    expect(gardenerRunSnapshot()).toBeNull();
  });

  it('bricht auch den Lauf beim Öffnen ab — es ist derselbe Abbruch', async () => {
    const { GardenerAutorun } = await import('../../src/main/gardener-autorun');
    const autorun = new GardenerAutorun(harness.services, { delayMs: 0 });
    await harness.settings.patchVault({ gardener: { runOnOpen: true } });

    let cancelled = false;
    const send = harness.services.sendEvent;
    harness.services.sendEvent = ((name, payload) => {
      send(name, payload);
      const step = name === 'event:work-tasks' ? gardenerStep(payload) : null;
      if (step !== null && !isClaimSeed(step) && !cancelled) {
        cancelled = true;
        /* Genau der Aufruf vom Schließen des Vaults und vom Beenden — mit dem
           Grund, der nichts zurücklässt (021b, D2). */
        cancelGardenerRun('shutdown');
      }
    }) as typeof harness.services.sendEvent;

    const result = await autorun.run();
    harness.services.sendEvent = send;

    /* Kein „no-index": ein abgebrochener Lauf darf nicht als halb gebauter
       Index durchgehen, sonst versucht `runWhenReady` genau ihn erneut. */
    expect(result).toBe('cancelled');
    expect(await vault.exists('.secondbrain/gardener.json')).toBe(false);
    expect(progress(harness).at(-1)).toMatchObject({ trigger: 'auto' });
    expect(lastGardenerTask(harness)).toMatchObject({ state: 'cancelled' });
    expect(gardenerRunSnapshot()).toBeNull();
  });

  /* 074, D3: „ein Lauf geht" hat jetzt genau eine Quelle — die Warteschlange
     selbst, nicht mehr ein lokales Feld, das mit ihr übereinstimmt. Die beiden
     Prüfungen unten setzen eine `'gardener'`-Aufgabe direkt über die
     Warteschlange, ohne `beginGardenerRun` — das ist der Beweis, dass
     `GardenerAutorun.run()` wirklich dort nachsieht, statt an einem eigenen
     Merker vorbeizuschauen. */
  it('meldet „busy", wenn die Warteschlange schon eine laufende Pflege-Aufgabe führt', async () => {
    const { GardenerAutorun } = await import('../../src/main/gardener-autorun');
    const autorun = new GardenerAutorun(harness.services, { delayMs: 0 });
    await harness.settings.patchVault({ gardener: { runOnOpen: true } });
    getWorkQueue(harness.services).startExternal({
      kind: 'gardener',
      lane: 'model',
      subject: { label: 'Maintenance run', ref: null },
    });

    expect(await autorun.run()).toBe('busy');
  });

  it('lässt wieder laufen, sobald diese Aufgabe direkt in der Warteschlange abgebrochen wird', async () => {
    const { GardenerAutorun } = await import('../../src/main/gardener-autorun');
    const autorun = new GardenerAutorun(harness.services, { delayMs: 0 });
    await harness.settings.patchVault({ gardener: { runOnOpen: true } });
    const workQueue = getWorkQueue(harness.services);
    const handle = workQueue.startExternal({
      kind: 'gardener',
      lane: 'model',
      subject: { label: 'Maintenance run', ref: null },
    });
    expect(await autorun.run()).toBe('busy');

    /* Der Abbruch kommt hier direkt aus der Warteschlange (etwa der „Stop"
       auf dem Aufgaben-Schirm), nicht über `cancelGardenerRun` — und ist
       sofort sichtbar, weil `run()` dieselbe Warteschlange abfragt. */
    workQueue.cancel(handle.id, 'user');

    expect(await autorun.run()).toBe('ran');
  });

  // ── Erinnerungen ───────────────────────────────────────────────────────────

  it('nimmt eine Ruhezeit zurück — und weist eine unbekannte ab', async () => {
    const before = await harness.call('reminders:list', undefined);
    const first = before[0];
    expect(first).toBeDefined();

    await harness.call('reminders:snooze', { id: first!.id, days: 7 });
    expect(
      (await harness.call('reminders:list', undefined)).some(
        (reminder) => reminder.id === first!.id,
      ),
    ).toBe(false);

    await harness.call('reminders:unsnooze', { id: first!.id });

    expect(
      (await harness.call('reminders:list', undefined)).some(
        (reminder) => reminder.id === first!.id,
      ),
    ).toBe(true);
    const state = JSON.parse((await vault.read('.secondbrain/overview.json')) ?? '{}') as {
      snoozes: Record<string, string>;
    };
    expect(state.snoozes[first!.id]).toBeUndefined();
    await expect(harness.call('reminders:unsnooze', { id: 'gibt-es-nicht' })).rejects.toMatchObject(
      {
        code: 'not-found',
      },
    );
  });

  // ── Geltungsbereich (021c) ───────────────────────────────────────────────────

  it('lässt bei einem auf eine Art beschränkten Lauf nur die passende Prüfung laufen', async () => {
    const report = await harness.call('gardener:run', { scope: { kinds: ['near-duplicate'] } });

    /* Die vier absichtlichen Mängel des Fixture-Vaults wären ohne
       Beschränkung da (siehe die erste `gardener:run`-Prüfung oben) — hier
       darf keiner davon auftauchen, weil ihre Prüfungen nie liefen. */
    const kinds = new Set(report.findings.map((finding) => finding.kind));
    expect(kinds.has('orphan')).toBe(false);
    expect(kinds.has('broken-link')).toBe(false);
    expect(kinds.has('index-drift')).toBe(false);
    expect(kinds.has('unprocessed-source')).toBe(false);
    expect([...kinds].every((kind) => kind === 'near-duplicate')).toBe(true);
    expect(report.scope).toEqual({ kinds: ['near-duplicate'] });
    /* Ein beschränkter Lauf hat nie alles gesehen. */
    expect(report.complete).toBe(false);
  });

  it('lässt die Deutung nur die Befunde im Geltungsbereich sehen', async () => {
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
      tasks: { 'gardener-audit': { providerId: 'local-1', model: 'qwen2.5:14b' } },
      defaults: {},
    });
    const fake = createFetchFake(() => jsonResponse({ choices: [{ message: { content: '{}' } }] }));
    vi.stubGlobal('fetch', fake.fetch);

    /* `near-duplicate` steht mit im Bereich, weil die Deutung sonst gar nicht
       erst läuft: über eine Art, zu der sie weder ein Urteil abgeben
       (`AUDIT_CANDIDATE_KINDS`) noch einen Widerspruch beitragen darf, wird kein
       Modell gefragt — siehe den Fall weiter unten. Geprüft wird hier trotzdem
       genau dasselbe: was die Stufe zu sehen bekommt, ist der Bereich. */
    await harness.call('gardener:run', {
      useLlm: true,
      scope: { kinds: ['orphan', 'near-duplicate'] },
    });

    /* Die Stufe hat wirklich gefragt — mit dem verwaisten Befund als Seite. */
    expect(fake.calls.length).toBe(1);
    const body = JSON.stringify(fake.calls[0]?.body ?? {});
    expect(body).toContain('orphan');
    /* Und nicht mit den übrigen deterministischen Befunden — die Prüfungen,
       die sie gefunden hätten, sind für diesen Lauf gar nicht gelaufen. */
    expect(body).not.toContain('| broken-link |');
    expect(body).not.toContain('| index-drift |');
    expect(body).not.toContain('| unprocessed-source |');
  });

  it('lässt einen auf ein Modul beschränkten Lauf keinen Befund außerhalb davon finden', async () => {
    /* Ein Dump ohne Modul (`unfiled-dump` trägt immer `module: null`) — genau
       das, was ein Modul-Geltungsbereich ausschließen muss. */
    await vault.write(
      'inbox/2026-07-11-0900-liegengeblieben.md',
      `---\ntype: dump\ntitle: Liegengeblieben\ncreated: ${day(-30)}T09:00:00+02:00\norigin: window\nstatus: raw\ntags: []\nscope: null\n---\n\nEin Gedanke, den niemand eingeordnet hat.\n`,
    );
    await harness.services.requireIndex().refresh?.();

    const report = await harness.call('gardener:run', {
      scope: { module: 'identity-management' },
    });

    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((finding) => finding.module === 'identity-management')).toBe(true);
    expect(report.scope).toEqual({ module: 'identity-management' });
  });

  it('schließt einen beschränkten Lauf ohne Modell trotzdem ab und findet die mechanischen Befunde', async () => {
    /* `useLlm: true` ohne eine Route für `gardener-audit` — genau der
       Pflichtfall „kein Modell konfiguriert" (Leitplanke 1), jetzt auch für
       einen beschränkten Lauf. */
    const report = await harness.call('gardener:run', {
      useLlm: true,
      scope: { kinds: ['orphan'] },
    });

    expect(report.usedLlm).toBe(false);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.every((finding) => finding.kind === 'orphan')).toBe(true);
    expect(report.complete).toBe(false);
  });

  it('fragt die Stufe für lose Enden nicht, wenn der Bereich kein loses Ende halten kann', async () => {
    await seedAnnouncingDay();
    const fake = await routeModelStages();

    /* Ein loses Ende trägt immer `module: null` (`looseEndFinding`), ein Bereich
       über ein Modul kann also nie eins behalten. Dann darf die Stufe auch nicht
       laufen: sie kostet einen vollen Modellaufruf und schickte den Inhalt jedes
       Journaltags in eine Anfrage, für die dieser Lauf nicht gedacht war
       (Leitplanke 6) — um ihr Ergebnis danach vollständig wegzufiltern. */
    const report = await harness.call('gardener:run', {
      useLlm: true,
      scope: { module: 'identity-management' },
    });

    /* Genau ein Aufruf, und der gehört der Deutung. Nicht zwei. */
    expect(fake.calls.length).toBe(1);
    expect(progress(harness).some((step) => step.phase === 'loose-ends')).toBe(false);
    /* Und sie steht auch nicht als „fehlend" da: sie war nie geplant, statt
       geplant und übergangen. */
    expect(report.missingStages).toEqual([]);
    expect(report.findings.some((finding) => finding.kind === 'loose-end')).toBe(false);
  });

  it('fragt gar kein Modell, wenn keine Modellstufe im Bereich etwas beitragen kann', async () => {
    await seedAnnouncingDay();
    const fake = await routeModelStages();

    const report = await harness.call('gardener:run', {
      useLlm: true,
      scope: { kinds: ['orphan'] },
    });

    /* Über `orphan` darf die Deutung nicht urteilen (`AUDIT_CANDIDATE_KINDS`),
       und einen Widerspruch will dieser Bereich nicht — die Stufe für lose Enden
       erst recht nicht. Beide bleiben ungefragt. */
    expect(fake.calls.length).toBe(0);
    expect(report.usedLlm).toBe(false);
    expect(progress(harness).some((step) => step.phase === 'audit')).toBe(false);
    expect(progress(harness).some((step) => step.phase === 'loose-ends')).toBe(false);
    expect(report.missingStages).toEqual([]);
    /* Nachgesehen wurde nach genau einer Art — und der Bericht sagt es, damit
       der Screen „nachgesehen, nichts da" von „dafür hätte es eine Modellstufe
       gebraucht" unterscheiden kann. */
    expect(report.checkedKinds).toEqual(['orphan']);
  });

  it('löscht bei einem Bereich über eine nur vom Modell findbare Art keinen alten Befund', async () => {
    const first = await harness.call('gardener:run', {});
    expect(first.findings.length).toBeGreaterThan(0);

    /* Kein Modell konfiguriert und ein Bereich allein über `contradiction`:
       keine Stufe dieses Laufs kann so einen Befund hervorbringen. Sein leeres
       Ergebnis heißt „nicht nachgesehen" — würde es als „alles weg" gelesen,
       wäre der ganze letzte vollständige Lauf gelöscht. */
    const scoped = await harness.call('gardener:run', {
      useLlm: true,
      scope: { kinds: ['contradiction'] },
    });

    expect(scoped.usedLlm).toBe(false);
    expect(scoped.checkedKinds).toEqual([]);
    expect(scoped.complete).toBe(false);
    expect(scoped.findings.map((finding) => finding.id).sort()).toEqual(
      first.findings.map((finding) => finding.id).sort(),
    );
    expect(scoped.health).toBe(first.health);

    /* Nicht nur im Speicher: die Datei trägt sie alle noch. */
    const stored = JSON.parse((await vault.read('.secondbrain/gardener.json')) ?? '{}') as {
      run: { findings: { id: string }[]; checkedKinds?: string[] };
    };
    expect(stored.run.findings).toHaveLength(first.findings.length);
    expect(stored.run.checkedKinds).toEqual([]);
  });

  it('bleibt beim Fortsetzen ein Lauf über den Teil, statt sich zum vollständigen zu machen', async () => {
    const first = await harness.call('gardener:run', {});
    const outside = first.findings.filter((finding) => finding.module !== 'identity-management');
    expect(outside.length).toBeGreaterThan(0);
    await routeModelStages();

    /* Ein Lauf über ein Modul, abgebrochen bevor die Deutung ihren Aufruf
       macht — genau der Zustand, aus dem „weitermachen" fortsetzt. */
    const restore = cancelOn('audit', () => void harness.call('gardener:cancel', undefined));
    const partial = await harness.call('gardener:run', {
      useLlm: true,
      scope: { module: 'identity-management' },
    });
    restore();
    expect(partial.complete).toBe(false);
    expect(partial.scope).toEqual({ module: 'identity-management' });

    /* „Weitermachen" schickt keinen Bereich mit (GardenScreen), der Lauf muss
       ihn selbst mitbringen. Sonst erreicht der fortgesetzte Lauf jede geplante
       Stufe, gilt als vollständige Prüfung des ganzen Vaults — und rechnet den
       Gesundheitswert über Befunde neu, die niemand neu abgeleitet hat, während
       er die Entscheidungen dazu wegputzt. */
    const resumed = await harness.call('gardener:run', { useLlm: true, resume: true });

    expect(resumed.complete).toBe(false);
    expect(resumed.scope).toEqual({ module: 'identity-management' });
    /* Die Zahl bleibt die des letzten vollständigen Laufs, mit dessen Datum. */
    expect(resumed.health).toBe(first.health);
    expect(resumed.healthAsOf).toBe(first.ranAt);
    /* Und was außerhalb des Moduls lag, hat den Fortsetzungslauf überlebt. */
    for (const finding of outside) {
      expect(resumed.findings.some((entry) => entry.id === finding.id)).toBe(true);
    }
  });

  it('lässt keinen zweiten Lauf gleichzeitig zu, auch nicht mit Geltungsbereich', async () => {
    const running = harness.call('gardener:run', { scope: { kinds: ['orphan'] } });
    expect(gardenerRunSnapshot()).toMatchObject({ running: true, trigger: 'user' });

    await expect(
      harness.call('gardener:run', { scope: { kinds: ['near-duplicate'] } }),
    ).rejects.toMatchObject({ code: 'invalid' });

    await running;
    expect(gardenerRunSnapshot()).toBeNull();
  });
});
