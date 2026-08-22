/* Der Pflegezustand als Datei: was `present(heute)` zeigt — und was `save(lauf)`
 * vergisst.
 *
 * Warum das einen eigenen Test bekommt: `save` ist die einzige Stelle der App,
 * die eine Entscheidung des Nutzers **loescht**. Ein „passt so" und ein „nicht
 * jetzt" sind Eingaben, die kein Screen wiederherstellen kann; wer sie
 * faelschlich wegwirft, tut das lautlos. Geprueft wird deshalb nicht der
 * Glueckspfad, sondern die drei Kanten, an denen genau das passieren wuerde:
 *
 * 1. Der Lauf hat den Befund wiedergefunden — die Entscheidung bleibt.
 * 2. Der Lauf hat ihn nicht wiedergefunden — sie faellt weg, sonst waechst die
 *    Datei mit jedem Lauf und schrumpft nie.
 * 3. Der Lauf **konnte** ihn nicht finden (`LLM_ONLY_KINDS`, Lauf ohne Modell) —
 *    sie bleibt. Ohne diese Ausnahme wuerde ein einziger Lauf ohne Modell jede
 *    Entscheidung zu einem Modellbefund vernichten.
 *
 * Dazu die Kante zwischen 1 und 2: der Lauf hat den Befund wiedergefunden, aber
 * das Modell hat den Kandidaten diesmal verworfen. Dann fehlt er in `findings`
 * und steht doch in `consideredIds` — die Entscheidung bleibt, denn verworfen
 * heisst „jetzt nicht zeigen", nicht „im Bestand erledigt".
 *
 * Und die vierte, die keine Methode hat: ein **abgebrochener** Lauf erreicht
 * `save` nie. Dass Laden und Anzeigen fuer sich nichts vergessen, steht deshalb
 * als eigener Fall drin.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findingId } from '@core/gardener';
import { GARDENER_FINDING_KINDS } from '@shared/types';
import type {
  FindingSeverity,
  GardenerFinding,
  GardenerFindingKind,
  GardenerRunScope,
} from '@shared/types';
import { GARDENER_STATE_FILE, GardenerState } from '../../src/main/gardener-state';
import type { StoredRun } from '../../src/main/gardener-state';
import { TODAY, day, stamp } from '../helpers/time';

/** Ein Befund mit echter Kennung — `kind:hash`, wie die Checks sie bauen. */
function finding(
  kind: GardenerFindingKind,
  key: string,
  severity: FindingSeverity = 'warn',
  module: string | null = 'demo',
): GardenerFinding {
  return {
    id: findingId(kind, key),
    kind,
    severity,
    title: `${kind} ${key}`,
    detail: '',
    paths: [module === null ? `inbox/${key}.md` : `modules/${module}/wiki/concepts/${key}.md`],
    module,
    foundAt: stamp(),
    fix: null,
  };
}

/** Ein abgeschlossener Lauf. `size` 10 macht die Gesundheit nachrechenbar. */
function run(findings: readonly GardenerFinding[], usedLlm = false, size = 10): StoredRun {
  return { ranAt: stamp(), usedLlm, findings: [...findings], advice: [], size };
}

/**
 * Ein abgebrochener Lauf (021b): plant mehr Stufen, als er erreicht hat, und
 * trägt den zum Zeitpunkt des Stopps eingefrorenen Gesundheitswert.
 */
function partialRun(
  findings: readonly GardenerFinding[],
  healthAsOf: StoredRun['healthAsOf'],
): StoredRun {
  return {
    ...run(findings),
    plan: ['checks', 'audit'],
    completed: ['checks'],
    healthAsOf,
  };
}

/**
 * Ein Lauf über einen Teil (021c). Er erreicht **jede** geplante Stufe — dass er
 * trotzdem nicht abgeschlossen ist, liegt allein am Bereich. `healthAsOf` trägt
 * er wie `saveRun` es tut: den Wert des Berichts, den er ersetzt.
 */
function scopedRun(
  findings: readonly GardenerFinding[],
  scope: GardenerRunScope,
  healthAsOf?: StoredRun['healthAsOf'],
): StoredRun {
  return {
    ...run(findings),
    plan: ['checks', 'audit'],
    completed: ['checks', 'audit'],
    scope,
    ...(healthAsOf === undefined ? {} : { healthAsOf }),
  };
}

const ORPHAN = finding('orphan', 'verwaiste-seite');
const STALE = finding('stale-page', 'angestaubte-seite');
const BROKEN = finding('broken-link', 'kaputter-link');
/** Ein zweiter verwaister Befund — was ein Lauf über die Art neu findet. */
const ORPHAN_NEU = finding('orphan', 'neu-verwaiste-seite');
/** Ein Befund in einem *anderen* Modul: das, was ein Teil-Lauf nie ansieht. */
const FREMD = finding('index-drift', 'fremdes-modul', 'warn', 'anderes');
/** Ein Befund ohne Modul (Dump, Projekt, Quelle) — der Filter nennt das „none". */
const OHNE_MODUL = finding('unfiled-dump', 'ungefilterter-dump', 'warn', null);
/** Die eine Art, die nur ein Modell hervorbringt (`LLM_ONLY_KINDS`). */
const CONTRA = finding('contradiction', 'widerspruch', 'high');
/** Ein Kandidat: deterministisch gefunden, aber vom Audit beurteilbar. */
const DUPLICATE = finding('near-duplicate', 'beinahe-dublette');

interface StoredShape {
  dismissed?: string[];
  snoozed?: Record<string, string>;
  fixed?: { id: string; undoToken: string }[];
}

describe('Pflegezustand: ausblenden, vertagen, vergessen', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sb-gardener-state-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function stateFile(): string {
    return join(root, ...GARDENER_STATE_FILE.split('/'));
  }

  /** Was wirklich in der Datei steht — nicht, was die Instanz im Kopf hat. */
  async function onDisk(): Promise<StoredShape> {
    return JSON.parse(await readFile(stateFile(), 'utf8')) as StoredShape;
  }

  /** Eine Zustandsdatei von Hand, fuer die Faelle vor dieser Version. */
  async function writeState(value: unknown): Promise<void> {
    await mkdir(dirname(stateFile()), { recursive: true });
    await writeFile(stateFile(), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  }

  it('trennt offene von ausgeblendeten Befunden und rechnet die Gesundheit nur über die offenen', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE, BROKEN]));

    /* Drei mittlere Befunde auf 10 Einheiten: 100 − 100·9/30. */
    expect(state.present(TODAY)?.health).toBe(70);

    expect(await state.dismiss(ORPHAN.id)).toBe(true);
    expect(await state.snooze(STALE.id, day(1))).toBe(true);

    const report = state.present(TODAY);
    expect(report?.findings.map((entry) => entry.id)).toEqual([BROKEN.id]);
    expect(report?.hidden).toEqual([
      { finding: ORPHAN, state: 'dismissed' },
      { finding: STALE, state: 'snoozed', until: day(1) },
    ]);
    /* Ein mittlerer Befund auf 10 Einheiten — der Wert gehoert zur Liste
       daneben, nicht zum Lauf. */
    expect(report?.health).toBe(90);
    expect(report?.healthKnown).toBe(true);
    expect(report?.healthContributions?.map((entry) => entry.kind)).toEqual(['broken-link']);
  });

  it('haelt eine anderswo erledigte Kennung aus beiden Listen heraus', async () => {
    /* Ein beantwortetes loses Ende (020, D5) steht in seiner eigenen Datei, nicht
       in `dismissed`. Es hier zu filtern und nicht erst beim naechsten Lauf ist
       der Unterschied zwischen „kommt nie wieder" und „kommt bis zum naechsten
       Lauf wieder" — die Gesundheit rechnet ohne es weiter. */
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, BROKEN]));

    const report = state.present(TODAY, new Set([ORPHAN.id]));

    expect(report?.findings.map((entry) => entry.id)).toEqual([BROKEN.id]);
    expect(report?.hidden).toEqual([]);
    /* Ohne die Menge bleibt alles wie bisher. */
    expect(state.present(TODAY)?.findings.map((entry) => entry.id)).toEqual([ORPHAN.id, BROKEN.id]);
  });

  it('lässt einen Aufschub ab seinem Tag wieder mitzählen', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN]));

    await state.snooze(ORPHAN.id, day(1));
    expect(state.present(TODAY)?.findings).toEqual([]);

    /* Der Tag selbst ist der Tag, ab dem es wieder zaehlt — nicht der letzte
       Tag der Ruhe. Dieselbe Grenze wie bei den Erinnerungen. */
    await state.snooze(ORPHAN.id, TODAY);
    expect(state.present(TODAY)?.findings.map((entry) => entry.id)).toEqual([ORPHAN.id]);
    expect(state.present(TODAY)?.hidden).toEqual([]);

    /* Und ueber Mitternacht hinaus: dieselbe Datei, ein spaeteres Heute. */
    await state.snooze(ORPHAN.id, day(1));
    const later = await GardenerState.load(root, day(2));
    expect(later.snoozedUntil(ORPHAN.id)).toBeNull();
    expect(later.present(day(2))?.findings.map((entry) => entry.id)).toEqual([ORPHAN.id]);
  });

  it('behält beim Speichern die Entscheidung, die der Lauf wiedergefunden hat', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE]));
    await state.dismiss(ORPHAN.id);
    await state.snooze(STALE.id, day(3));

    await state.save(run([ORPHAN, STALE]));

    expect([...state.dismissed()]).toEqual([ORPHAN.id]);
    expect(state.snoozedUntil(STALE.id)).toBe(day(3));
    const file = await onDisk();
    expect(file.dismissed).toEqual([ORPHAN.id]);
    expect(file.snoozed).toEqual({ [STALE.id]: day(3) });
  });

  it('verwirft beim Speichern die Entscheidung, die der Lauf nicht wiedergefunden hat', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE]));
    await state.dismiss(ORPHAN.id);
    await state.snooze(STALE.id, day(3));

    /* Ein vollständiger Lauf, der beide nicht mehr nennt: die Sache ist weg,
       also auch die Entscheidung darüber. */
    await state.save(run([BROKEN]));

    expect([...state.dismissed()]).toEqual([]);
    expect(state.snoozedUntil(STALE.id)).toBeNull();
    const file = await onDisk();
    expect(file.dismissed).toEqual([]);
    expect(file.snoozed).toEqual({});
  });

  it('behält einen ausgeblendeten Widerspruch, wenn der Lauf ohne Modell lief', async () => {
    const state = await GardenerState.load(root, TODAY);
    /* Ein Widerspruch entsteht nur mit Modell — also lief der erste Lauf mit. */
    await state.save(run([ORPHAN, CONTRA], true));
    await state.dismiss(ORPHAN.id);
    await state.dismiss(CONTRA.id);
    await state.snooze(CONTRA.id, day(3));

    /* Ohne Modell hat dieser Lauf nach Widersprüchen nie gesucht: sein
       Schweigen sagt zu ihnen nichts. Zum verwaisten Befund sagt es alles. */
    await state.save(run([], false));

    expect([...state.dismissed()]).toEqual([CONTRA.id]);
    expect(state.snoozedUntil(CONTRA.id)).toBe(day(3));
    expect(await onDisk()).toMatchObject({
      dismissed: [CONTRA.id],
      snoozed: { [CONTRA.id]: day(3) },
    });

    /* Ein Lauf **mit** Modell hat gesucht und nichts gefunden — jetzt darf die
       Entscheidung weg. Sonst bliebe sie für immer. */
    await state.save(run([], true));
    expect([...state.dismissed()]).toEqual([]);
    expect(state.snoozedUntil(CONTRA.id)).toBeNull();
  });

  it('behält die Entscheidung zu einem Kandidaten, den nur das Modell verworfen hat', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save({ ...run([DUPLICATE, ORPHAN], true), consideredIds: [] });
    await state.dismiss(DUPLICATE.id);
    await state.snooze(DUPLICATE.id, day(3));

    /* Am Bestand hat sich nichts geändert: die deterministische Prüfung erzeugt
       denselben Kandidaten wieder — nur das Audit urteilt diesmal anders und
       verwirft ihn. Er fehlt damit in `findings`, steht aber in
       `consideredIds`. Ein Modellurteil darüber, was gezeigt wird, darf die
       Entscheidung des Nutzers über die Sache nicht löschen. */
    await state.save({
      ...run([ORPHAN], true),
      consideredIds: [DUPLICATE.id, ORPHAN.id],
    });

    expect([...state.dismissed()]).toEqual([DUPLICATE.id]);
    expect(state.snoozedUntil(DUPLICATE.id)).toBe(day(3));
    expect(await onDisk()).toMatchObject({
      dismissed: [DUPLICATE.id],
      snoozed: { [DUPLICATE.id]: day(3) },
    });

    /* Auch über die Datei hinweg: `consideredIds` wird mitgeschrieben und
       gelesen, sonst wäre die Entscheidung beim nächsten Lauf doch weg. */
    const later = await GardenerState.load(root, TODAY);
    expect(later.run()?.consideredIds).toEqual([DUPLICATE.id, ORPHAN.id]);

    /* Und die alte Regel bleibt: erzeugt die deterministische Prüfung ihn
       selbst nicht mehr — weg aus beiden Listen —, fällt die Entscheidung. */
    await later.save({ ...run([ORPHAN], true), consideredIds: [ORPHAN.id] });
    expect([...later.dismissed()]).toEqual([]);
    expect(later.snoozedUntil(DUPLICATE.id)).toBeNull();
  });

  it('lädt eine Datei ohne `snoozed` — und vergisst dabei nichts', async () => {
    await writeState({
      version: 1,
      run: { ranAt: stamp(), usedLlm: false, findings: [ORPHAN], advice: [], size: 10 },
      dismissed: [ORPHAN.id],
      fixed: [],
    });

    const state = await GardenerState.load(root, TODAY);
    expect(state.snoozedUntil(ORPHAN.id)).toBeNull();
    expect([...state.dismissed()]).toEqual([ORPHAN.id]);
    const report = state.present(TODAY);
    expect(report?.findings).toEqual([]);
    expect(report?.hidden).toEqual([{ finding: ORPHAN, state: 'dismissed' }]);
  });

  it('vergisst eine Entscheidung nur nach einem abgeschlossenen Lauf, nicht beim Lesen', async () => {
    /* Genau die Lage nach einem abgebrochenen Lauf: die Entscheidung steht in
       der Datei, der gespeicherte Lauf kennt den Befund nicht. Laden und
       Anzeigen dürfen sie nicht anfassen — `save` hat nie stattgefunden. */
    await writeState({
      version: 1,
      run: { ranAt: stamp(), usedLlm: false, findings: [BROKEN], advice: [], size: 10 },
      dismissed: [ORPHAN.id],
      snoozed: { [STALE.id]: day(3) },
      fixed: [],
    });

    const state = await GardenerState.load(root, TODAY);
    const report = state.present(TODAY);
    expect(report?.findings.map((entry) => entry.id)).toEqual([BROKEN.id]);
    expect(report?.hidden).toEqual([]);
    expect([...state.dismissed()]).toEqual([ORPHAN.id]);
    expect(state.snoozedUntil(STALE.id)).toBe(day(3));
    /* Und nichts davon ist zurückgeschrieben worden. */
    expect(await onDisk()).toMatchObject({
      dismissed: [ORPHAN.id],
      snoozed: { [STALE.id]: day(3) },
    });
  });

  it('vertagt nichts, was kein Lauf kennt', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN]));

    expect(await state.snooze(STALE.id, day(1))).toBe(false);
    expect(await state.unsnooze(STALE.id)).toBe(false);
    expect((await onDisk()).snoozed).toEqual({});
  });

  it('behält beim Speichern eines abgebrochenen Laufs jede Entscheidung, auch zu Nicht-Wiedergefundenem', async () => {
    /* 021b D1: ein Lauf, der nur die erste Stufe erreicht hat, hat zu allem
       ausserhalb dieser Stufe geschwiegen — Schweigen darf keine Entscheidung
       loeschen. STALE fehlt im zweiten (abgebrochenen) Lauf komplett und wird
       trotzdem nicht aus `dismissed` entfernt. */
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE]));
    await state.dismiss(STALE.id);

    await state.save(partialRun([ORPHAN], { ranAt: stamp(), score: 70, contributions: [] }));

    expect([...state.dismissed()]).toEqual([STALE.id]);
    expect(await onDisk()).toMatchObject({ dismissed: [STALE.id] });
  });

  it('rechnet die Gesundheit eines vollständigen Laufs weiterhin selbst', async () => {
    /* Kein `plan` gesetzt (wie bisher): unverändertes Verhalten. */
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([BROKEN]));

    const report = state.present(TODAY);
    expect(report?.complete).toBe(true);
    expect(report?.missingStages).toBeUndefined();
    expect(report?.healthAsOf).toBeUndefined();
    expect(report?.health).toBe(90);
  });

  it('zeigt bei einem abgebrochenen Lauf den eingefrorenen Wert samt seinem Datum, nicht einen aus den Teilbefunden gerechneten', async () => {
    const frozenAt = stamp(-1);
    const state = await GardenerState.load(root, TODAY);
    await state.save(
      partialRun([ORPHAN, STALE, BROKEN], { ranAt: frozenAt, score: 42, contributions: [] }),
    );

    const report = state.present(TODAY);
    /* Drei Befunde auf 10 Einheiten würden 70 rechnen (siehe erster Test oben) —
       gezeigt wird stattdessen der eingefrorene Wert. */
    expect(report?.complete).toBe(false);
    expect(report?.health).toBe(42);
    expect(report?.healthKnown).toBe(true);
    expect(report?.healthAsOf).toBe(frozenAt);
    expect(report?.missingStages).toEqual(['audit']);
  });

  it('lässt die Gesundheit eines abgebrochenen Laufs ohne früheren Bericht unbekannt', async () => {
    /* Die allererste Prüfung dieses Vaults, mittendrin gestoppt: es gibt keinen
       vollständigen Lauf, auf den ein Wert zeigen könnte. Aus den halben
       Befunden einen zu rechnen wäre genau die Zahl, die dieser Lauf nicht
       hergibt — „unbekannt" ist die einzige ehrliche Antwort. */
    const state = await GardenerState.load(root, TODAY);
    await state.save(partialRun([ORPHAN, STALE, BROKEN], undefined));

    const report = state.present(TODAY);
    expect(report?.complete).toBe(false);
    /* Drei Befunde auf 10 Einheiten würden 70 rechnen — es wird nichts gerechnet. */
    expect(report?.healthKnown).toBe(false);
    expect(report?.health).toBe(0);
    expect(report?.healthContributions).toEqual([]);
    expect(report?.healthAsOf).toBeUndefined();
    /* Die Befunde selbst bleiben: gestoppt heißt behalten, nur ohne Wert. */
    expect(report?.findings.map((finding) => finding.id)).toEqual([ORPHAN.id, STALE.id, BROKEN.id]);
  });

  it('behält einen erledigten Befund, wenn der Lauf die Prüfungen nicht selbst gefahren ist', async () => {
    /* 021b: die Befunde eines fortgesetzten Laufs sind die geerbten des Stopps.
       Nichts hat noch einmal in die Dateien gesehen, also darf auch nichts
       vergessen, dass ein Fix einen davon schon erledigt hat — sonst stünde er
       wieder offen da, ohne dass ihn jemand nachgeprüft hätte. */
    const state = await GardenerState.load(root, TODAY);
    await state.save(partialRun([ORPHAN, STALE], undefined));
    await state.markFixed(ORPHAN.id, 'undo-1');

    await state.save(run([ORPHAN, STALE]), { checksReran: false });

    expect([...state.fixed()]).toEqual([ORPHAN.id]);
    expect(state.present(TODAY)?.findings.map((finding) => finding.id)).toEqual([STALE.id]);
    expect(await onDisk()).toMatchObject({ fixed: [{ id: ORPHAN.id, undoToken: 'undo-1' }] });
  });

  it('vergisst ihn bei einem Lauf, der selbst geprüft hat', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE]));
    await state.markFixed(ORPHAN.id, 'undo-1');

    await state.save(run([ORPHAN, STALE]));

    /* Der neue Lauf hat die Dateien gelesen: was er findet, steht wieder offen da. */
    expect([...state.fixed()]).toEqual([]);
    expect(state.present(TODAY)?.findings.map((finding) => finding.id)).toEqual([
      ORPHAN.id,
      STALE.id,
    ]);
  });

  it('liest einen Lauf ohne `plan` als abgeschlossen — die alte Form kannte die Stufen noch nicht', async () => {
    await writeState({
      version: 1,
      run: { ranAt: stamp(), usedLlm: false, findings: [ORPHAN], advice: [], size: 10 },
      dismissed: [],
      fixed: [],
    });

    const state = await GardenerState.load(root, TODAY);
    const report = state.present(TODAY);
    expect(report?.complete).toBe(true);
    expect(report?.missingStages).toBeUndefined();
  });

  /* 021c: ein Lauf über einen Teil. Die Kante, an der lautlos Daten verschwinden
     würden — ein Lauf über ein Modul, der jeden Befund des letzten vollständigen
     Laufs woanders mitnimmt. Geprüft wird deshalb beides: dass der Teil ersetzt
     wird, und dass alles andere unangetastet stehen bleibt. */
  it('ersetzt bei einem Lauf über eine Art nur diese Art und lässt jede andere stehen', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, STALE, BROKEN]));

    await state.save(scopedRun([ORPHAN_NEU], { kinds: ['orphan'] }));

    const ids = state.present(TODAY)?.findings.map((entry) => entry.id);
    /* Was der Teil-Lauf nie angesehen hat, steht noch da. */
    expect(ids).toContain(STALE.id);
    expect(ids).toContain(BROKEN.id);
    /* Im Bereich gilt der neue Lauf — keine Vereinigung mit dem alten Befund. */
    expect(ids).toContain(ORPHAN_NEU.id);
    expect(ids).not.toContain(ORPHAN.id);
    expect(ids).toHaveLength(3);

    /* Und so steht es in der Datei, nicht nur im Kopf dieser Instanz. */
    const later = await GardenerState.load(root, TODAY);
    expect(
      later
        .run()
        ?.findings.map((entry) => entry.id)
        .sort(),
    ).toEqual([STALE.id, BROKEN.id, ORPHAN_NEU.id].sort());
  });

  it('ersetzt bei einem Lauf über ein Modul nur dessen Befunde, `module: null` nur die ohne Modul', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, FREMD, OHNE_MODUL]));

    await state.save(scopedRun([ORPHAN_NEU], { module: 'demo' }));
    expect(
      state
        .present(TODAY)
        ?.findings.map((entry) => entry.id)
        .sort(),
    ).toEqual([FREMD.id, OHNE_MODUL.id, ORPHAN_NEU.id].sort());

    /* `null` ist hier ein Wert und kein „egal": nur die Befunde ohne Modul
       fallen weg, die beiden mit Modul bleiben. */
    await state.save(scopedRun([], { module: null }));
    expect(
      state
        .present(TODAY)
        ?.findings.map((entry) => entry.id)
        .sort(),
    ).toEqual([FREMD.id, ORPHAN_NEU.id].sort());
  });

  it('vergisst bei einem Lauf über einen Teil keine Entscheidung und schreibt den Rat nicht um', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save({ ...run([ORPHAN, STALE]), advice: ['Zuerst die verwaisten Seiten.'] });
    await state.dismiss(ORPHAN.id);
    await state.snooze(STALE.id, day(3));

    /* Ein Lauf über eine ganz andere Art: zu ORPHAN und STALE hat er nicht
       hingesehen, also darf sein Schweigen zu ihnen nichts entscheiden. */
    await state.save({
      ...scopedRun([BROKEN], { kinds: ['broken-link'] }),
      advice: ['Nur dieser Teil.'],
    });

    expect([...state.dismissed()]).toEqual([ORPHAN.id]);
    expect(state.snoozedUntil(STALE.id)).toBe(day(3));
    /* Der Rat ist eine Aussage über den ganzen Vault (021c, Entscheidung 2) —
       ein Lauf über ein Stück davon erneuert ihn nicht. */
    expect(state.present(TODAY)?.advice).toEqual(['Zuerst die verwaisten Seiten.']);
    expect(await onDisk()).toMatchObject({
      dismissed: [ORPHAN.id],
      snoozed: { [STALE.id]: day(3) },
    });
  });

  it('bleibt mit jeder erreichten Stufe ein unvollständiger Lauf — und nennt seinen Bereich', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(scopedRun([ORPHAN_NEU], { kinds: ['orphan'], module: 'demo' }));

    const report = state.present(TODAY);
    expect(report?.complete).toBe(false);
    expect(report?.scope).toEqual({ kinds: ['orphan'], module: 'demo' });

    /* Über die Datei hinweg, sonst wäre der Lauf beim nächsten Öffnen wieder ein
       vollständiger — und der Gesundheitswert würde über den Teil gerechnet. */
    const later = await GardenerState.load(root, TODAY);
    expect(later.present(TODAY)?.complete).toBe(false);
    expect(later.present(TODAY)?.scope).toEqual({ kinds: ['orphan'], module: 'demo' });
  });

  it('zeigt nach einem Lauf über einen Teil den eingefrorenen Wert des letzten vollständigen', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save({ ...run([BROKEN]), ranAt: stamp(-1) });
    const before = state.present(TODAY);
    expect(before?.health).toBe(90);

    /* Wie `saveRun` es tut: der Teil-Lauf trägt den Wert des Berichts, den er
       ersetzt, samt dessen Datum. */
    await state.save(
      scopedRun(
        [ORPHAN, STALE, BROKEN],
        { module: 'demo' },
        {
          ranAt: before?.ranAt ?? '',
          score: before?.health ?? 0,
          contributions: before?.healthContributions ?? [],
        },
      ),
    );

    const after = state.present(TODAY);
    /* Drei mittlere Befunde auf 10 Einheiten würden 70 rechnen — ein Teil des
       Vaults bewegt den Wert des Vaults nicht. */
    expect(after?.findings).toHaveLength(3);
    expect(after?.health).toBe(90);
    expect(after?.healthKnown).toBe(true);
    expect(after?.healthAsOf).toBe(stamp(-1));
    expect(after?.ranAt).toBe(stamp());
  });

  it('behält einen erledigten Befund außerhalb des Bereichs und vergisst den darin', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([ORPHAN, FREMD]));
    await state.markFixed(ORPHAN.id, 'undo-demo');
    await state.markFixed(FREMD.id, 'undo-fremd');

    await state.save(scopedRun([ORPHAN_NEU], { module: 'demo' }));

    /* Im Bereich hat der Lauf in die Dateien gesehen: was er nennt, steht wieder
       offen da. Außerhalb hat niemand gesehen — der erledigte Befund bleibt aus
       der Liste und sein Rückgängig-Token bleibt bekannt. Sonst stünde ein
       längst behobener Befund aus einem anderen Modul plötzlich wieder offen. */
    expect([...state.fixed()]).toEqual([FREMD.id]);
    expect(state.present(TODAY)?.findings.map((entry) => entry.id)).toEqual([ORPHAN_NEU.id]);
    expect(await onDisk()).toMatchObject({ fixed: [{ id: FREMD.id, undoToken: 'undo-fremd' }] });
  });

  /* 021c, die eine Kante, an der ein Teil-Lauf lautlos löscht: der Bereich nennt
     eine Art, die in *diesem* Lauf keine Stufe hervorbringen konnte — ein
     Widerspruch ohne konfiguriertes Modell. Der Lauf findet dazu nichts, und
     dieses Nichts ist keine Aussage. Wer es als eine liest, löscht den Befund,
     den Fix dazu und lässt „passt so" auf eine Kennung zeigen, die es nirgends
     mehr gibt. */
  it('löscht keine Art, nach der in diesem Lauf keine Stufe gesehen hat', async () => {
    const ZWEITER = finding('contradiction', 'zweiter-widerspruch', 'high');
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([CONTRA, ZWEITER, ORPHAN], true));
    await state.dismiss(CONTRA.id);
    await state.markFixed(ZWEITER.id, 'undo-widerspruch');

    /* Ohne Route für die Deutung gibt es die Stufe nicht: der Lauf plant nur die
       Prüfungen und hat nach keiner einzigen Art gesehen, die sein Bereich
       nennt (`checkedKinds: []`). */
    await state.save({
      ...scopedRun([], { kinds: ['contradiction'] }),
      plan: ['checks'],
      completed: ['checks'],
      checkedKinds: [],
    });

    expect(
      state
        .run()
        ?.findings.map((entry) => entry.id)
        .sort(),
    ).toEqual([CONTRA.id, ZWEITER.id, ORPHAN.id].sort());
    /* Die Entscheidung und der Rückweg zeigen weiter auf etwas, das es gibt. */
    expect([...state.dismissed()]).toEqual([CONTRA.id]);
    expect([...state.fixed()]).toEqual([ZWEITER.id]);
    const report = state.present(TODAY);
    expect(report?.hidden?.map((entry) => entry.finding.id)).toEqual([CONTRA.id]);
    /* Und der Bericht sagt es auch, statt „geprüft, nichts gefunden" zu
       suggerieren: nach nichts gesehen. */
    expect(report?.checkedKinds).toEqual([]);

    /* Über die Datei hinweg — dort täte der Verlust weh. */
    const later = await GardenerState.load(root, TODAY);
    expect(later.run()?.findings).toHaveLength(3);
  });

  it('ersetzt eine Art, nach der eine Stufe wirklich gesehen hat, auch wenn sie nichts fand', async () => {
    const state = await GardenerState.load(root, TODAY);
    await state.save(run([CONTRA, ORPHAN], true));

    /* Diesmal lief die Deutung: sie hat nach Widersprüchen gesehen und keinen
       mehr genannt. Das *ist* eine Aussage — der Befund fällt weg. Ohne diesen
       Gegenfall würde die Regel oben auch von einem Bereich erfüllt, der nie
       etwas ersetzt. */
    await state.save({
      ...scopedRun([], { kinds: ['contradiction'] }),
      checkedKinds: ['contradiction'],
    });

    expect(state.run()?.findings.map((entry) => entry.id)).toEqual([ORPHAN.id]);
    expect(state.present(TODAY)?.checkedKinds).toEqual(['contradiction']);
  });

  it('verwirft beim Lesen unbekannte Befundarten aus dem Bereich, behält den Rest', async () => {
    await writeState({
      version: 1,
      run: {
        ranAt: stamp(),
        usedLlm: false,
        findings: [ORPHAN, STALE],
        advice: [],
        size: 10,
        plan: ['checks'],
        completed: ['checks'],
        scope: { kinds: ['orphan', 'aus-der-zukunft'], module: null },
      },
      dismissed: [],
      fixed: [],
    });

    const state = await GardenerState.load(root, TODAY);
    expect(state.run()?.scope).toEqual({ kinds: ['orphan'], module: null });
    expect(state.present(TODAY)?.complete).toBe(false);
  });

  it('liest einen Bereich, von dem nichts Bekanntes bleibt, als keinen Bereich', async () => {
    await writeState({
      version: 1,
      run: {
        ranAt: stamp(),
        usedLlm: false,
        findings: [ORPHAN],
        advice: [],
        size: 10,
        plan: ['checks'],
        completed: ['checks'],
        scope: { kinds: ['aus-der-zukunft'] },
      },
      dismissed: [],
      fixed: [],
    });

    /* Kein Bereich heißt: ein Lauf über alles. Ein für immer unvollständiger
       Lauf, der nicht sagen kann, was er abgedeckt hat, wäre schlimmer. */
    const state = await GardenerState.load(root, TODAY);
    expect(state.run()?.scope).toBeUndefined();
    expect(state.present(TODAY)?.complete).toBe(true);
    expect(state.present(TODAY)?.scope).toBeUndefined();
  });

  it('kennt jede Befundart in `GARDENER_FINDING_KINDS`', () => {
    /* Gegen diese Liste wird ein gespeicherter Bereich geprüft: fehlt dort eine
       Art, fällt ein Bereich über sie beim Lesen lautlos weg. Die Zuordnung
       erzwingt der Compiler — eine neue Art in `GardenerFindingKind` macht sie
       unvollständig und dieser Test rot. */
    const alle: Record<GardenerFindingKind, true> = {
      orphan: true,
      'broken-link': true,
      'index-drift': true,
      'stale-page': true,
      contradiction: true,
      'missing-page': true,
      'near-duplicate': true,
      'unfiled-dump': true,
      'unprocessed-source': true,
      'project-without-next-step': true,
      'loose-end': true,
    };
    expect([...GARDENER_FINDING_KINDS].sort()).toEqual(Object.keys(alle).sort());
  });

  it('verwirft eine unlesbare Datei zu `null` — „noch nicht geprüft", keine erfundene 100', async () => {
    await mkdir(dirname(stateFile()), { recursive: true });
    await writeFile(stateFile(), '{ das ist kein JSON', 'utf8');

    const state = await GardenerState.load(root, TODAY);
    expect(state.run()).toBeNull();
    expect(state.present(TODAY)).toBeNull();
  });
});
