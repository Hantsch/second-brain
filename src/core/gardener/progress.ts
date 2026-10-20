/**
 * Der Fortschritt eines Pflegelaufs — die Rechnung hinter dem Balken.
 *
 * Der Lauf hat bis zu drei Stufen: die zehn mechanischen Checks (Millisekunden),
 * und bis zu zwei Modell-Stufen (`audit`, `loose-ends`), die je Sekunden dauern
 * koennen. Ein Balken, der jeden Check gleich gewichtet, springt nach dem ersten
 * Tick auf ~83% und friert dann auf der langsamen Modell-Stufe ein — das ist die
 * Zahl, nicht die Wahrheit. Deshalb zaehlen die Checks zusammen **eine** Einheit,
 * jede Modell-Stufe **sechs**: mit beiden Stufen erreichbar wiegen die Checks
 * 1 von 13 (~7.7%), mit einer 1 von 7 (~14%), ohne Modell 1 von 1 (100%).
 *
 * Waehrend einer Modell-Stufe gibt es keinen Zwischenstand — sie traegt 0 bei,
 * bis sie fertig ist. Der Balken steht dann still; das ist die bewusste,
 * dokumentierte Grenze dieser Rechnung, kein Fehler.
 */

export type GardenerStageId = 'checks' | 'audit' | 'loose-ends';

export interface StagePlanEntry {
  stage: GardenerStageId;
  weight: number;
}

/** Gewicht der Checks-Stufe insgesamt, unabhaengig von ihrer Anzahl. */
export const CHECKS_STAGE_WEIGHT = 1;

/** Gewicht je Modell-Stufe. */
export const MODEL_STAGE_WEIGHT = 6;

export interface StagePlanOptions {
  /** Ist ueberhaupt ein Modell erreichbar? Ohne das gibt es keine Modell-Stufe. */
  useLlm: boolean;
  /** Ist die zweite Modell-Stufe (Loose Ends) erreichbar? */
  useLooseEnds: boolean;
}

/**
 * Die Stufen dieses Laufs, in Reihenfolge, mit ihrem Gewicht. `checks` ist immer
 * dabei; `audit` und `loose-ends` nur, wenn sie erreichbar sind — kein Modell
 * konfiguriert heisst: keine Modell-Stufe, nicht eine, die nie faellig wird.
 */
export function computeStagePlan(options: StagePlanOptions): StagePlanEntry[] {
  const plan: StagePlanEntry[] = [{ stage: 'checks', weight: CHECKS_STAGE_WEIGHT }];
  if (!options.useLlm) return plan;
  plan.push({ stage: 'audit', weight: MODEL_STAGE_WEIGHT });
  if (options.useLooseEnds) plan.push({ stage: 'loose-ends', weight: MODEL_STAGE_WEIGHT });
  return plan;
}

export interface ProgressInput {
  plan: readonly StagePlanEntry[];
  /** Die Stufe, die gerade laeuft. */
  current: GardenerStageId;
  /**
   * Fortschritt innerhalb der aktuellen Stufe, 0..1. Fuer `checks` ist das
   * `done / 10`; fuer eine Modell-Stufe gibt es keinen Zwischenstand, also 0
   * bis sie abgeschlossen ist.
   */
  currentFraction: number;
}

export interface ProgressResult {
  /** 0..100, ganzzahlig — das kumulierte Gewicht, das bereits erledigt ist. */
  percent: number;
  /** Die noch nicht begonnenen Stufen, in Planreihenfolge. */
  remaining: GardenerStageId[];
}

/**
 * Prozent und Restliste aus Plan, aktueller Stufe und ihrem Innenfortschritt.
 * Abgeschlossene Stufen vor der aktuellen zaehlen voll, die aktuelle anteilig,
 * alles danach nichts.
 */
export function computeProgress(input: ProgressInput): ProgressResult {
  const { plan, current, currentFraction } = input;
  const totalWeight = plan.reduce((sum, entry) => sum + entry.weight, 0);
  const currentIndex = plan.findIndex((entry) => entry.stage === current);
  const currentEntry = currentIndex < 0 ? undefined : plan[currentIndex];

  if (totalWeight <= 0 || currentEntry === undefined) {
    return { percent: 0, remaining: plan.map((entry) => entry.stage) };
  }

  const fraction = Math.min(1, Math.max(0, currentFraction));
  const completedWeight =
    plan.slice(0, currentIndex).reduce((sum, entry) => sum + entry.weight, 0) +
    currentEntry.weight * fraction;

  const percent = Math.min(100, Math.max(0, Math.round((100 * completedWeight) / totalWeight)));
  const remaining = plan.slice(currentIndex + 1).map((entry) => entry.stage);

  return { percent, remaining };
}
