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
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcChannel, IpcEventName, IpcEvents, IpcRequest, IpcResponse } from '@shared/ipc';
import type { GardenerFinding } from '@shared/types';
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
  const { cancelGardenerRun, gardenerHandlers } = await import('../../src/main/ipc/gardener');
  const { dashboardHandlers } = await import('../../src/main/ipc/dashboard');
  const { moduleHandlers } = await import('../../src/main/ipc/modules');
  const { reminderHandlers } = await import('../../src/main/ipc/reminders');

  /* Zustand aus einem früheren Test darf nicht überleben. */
  forgetSessions();
  forgetOverviewState();
  forgetGardenerState();
  cancelGardenerRun();

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

/** Die Fortschrittsmeldungen des letzten Laufs. */
function progress(harness: Harness): IpcEvents['event:gardener-progress'][] {
  return harness.sent
    .filter((entry) => entry.name === 'event:gardener-progress')
    .map((entry) => entry.payload as IpcEvents['event:gardener-progress']);
}

function findingOfKind(findings: readonly GardenerFinding[], kind: string): GardenerFinding {
  const found = findings.find((finding) => finding.kind === kind);
  expect(found, `Befund der Art ${kind}`).toBeDefined();
  return found as GardenerFinding;
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

  it('bricht einen Lauf ab und lässt den letzten Bericht unberührt', async () => {
    const first = await harness.call('gardener:run', {});
    harness.sent.length = 0;

    /* Beim ersten Fortschritt abbrechen — der Lauf gibt der Ereignisschleife
       zwischen zwei Prüfungen das Wort, sonst käme der Abbruch nie an. */
    let cancelled = false;
    const send = harness.services.sendEvent;
    harness.services.sendEvent = ((name, payload) => {
      send(name, payload);
      if (name === 'event:gardener-progress' && !cancelled) {
        cancelled = true;
        void harness.call('gardener:cancel', undefined);
      }
    }) as typeof harness.services.sendEvent;

    await expect(harness.call('gardener:run', {})).rejects.toMatchObject({ code: 'cancelled' });
    harness.services.sendEvent = send;

    const kept = await harness.call('gardener:report', undefined);
    expect(kept?.ranAt).toBe(first.ranAt);
    /* Auch der abgebrochene Lauf endet sichtbar. */
    expect(progress(harness).at(-1)).toMatchObject({ running: false });
  });

  it('lässt keinen zweiten Lauf gleichzeitig zu', async () => {
    const running = harness.call('gardener:run', {});
    await expect(harness.call('gardener:run', {})).rejects.toMatchObject({ code: 'invalid' });
    await running;
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
});
