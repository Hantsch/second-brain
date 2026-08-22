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
import type { FindingSeverity, GardenerFinding, GardenerFindingKind } from '@shared/types';
import { GARDENER_STATE_FILE, GardenerState } from '../../src/main/gardener-state';
import type { StoredRun } from '../../src/main/gardener-state';
import { TODAY, day, stamp } from '../helpers/time';

/** Ein Befund mit echter Kennung — `kind:hash`, wie die Checks sie bauen. */
function finding(
  kind: GardenerFindingKind,
  key: string,
  severity: FindingSeverity = 'warn',
): GardenerFinding {
  return {
    id: findingId(kind, key),
    kind,
    severity,
    title: `${kind} ${key}`,
    detail: '',
    paths: [`modules/demo/wiki/concepts/${key}.md`],
    module: 'demo',
    foundAt: stamp(),
    fix: null,
  };
}

/** Ein abgeschlossener Lauf. `size` 10 macht die Gesundheit nachrechenbar. */
function run(findings: readonly GardenerFinding[], usedLlm = false, size = 10): StoredRun {
  return { ranAt: stamp(), usedLlm, findings: [...findings], advice: [], size };
}

const ORPHAN = finding('orphan', 'verwaiste-seite');
const STALE = finding('stale-page', 'angestaubte-seite');
const BROKEN = finding('broken-link', 'kaputter-link');
/** Die eine Art, die nur ein Modell hervorbringt (`LLM_ONLY_KINDS`). */
const CONTRA = finding('contradiction', 'widerspruch', 'high');
/** Ein Kandidat: deterministisch gefunden, aber vom Audit beurteilbar. */
const DUPLICATE = finding('near-duplicate', 'beinahe-dublette');

interface StoredShape {
  dismissed?: string[];
  snoozed?: Record<string, string>;
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
});
