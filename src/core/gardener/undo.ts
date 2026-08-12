/**
 * Der Rueckweg eines Fixes.
 *
 * `VaultStore.delete` legt eine Kopie in den Papierkorb und gibt eine Marke
 * zurueck; fuer eine **Aenderung** an einer bestehenden Datei gibt es das nicht —
 * `undo(token)` weigert sich, wenn am Zielort schon wieder eine Datei liegt. Ein
 * Fix braucht deshalb sein eigenes Protokoll, und es liegt am selben Ort wie das
 * der Ablage: `.secondbrain/trash/<marke>/gardener.json`. Es traegt den Inhalt vor
 * der Aenderung und den Hash danach.
 *
 * Zwei Zusicherungen:
 * - **Kein Rueckweg schreibt eine fremde Zeile um.** Stimmt der Hash nicht mehr,
 *   hat der Nutzer die Datei seither selbst bearbeitet — dann bleibt sie, wie sie
 *   ist, und der Pfad kommt als `kept` zurueck. Dieselbe Haltung wie beim
 *   Zurueckdrehen einer Ablage.
 * - **Zweimal zurueckdrehen tut nichts.** Nach dem ersten Mal passt der Hash nicht
 *   mehr; der zweite Aufruf aendert nichts und behauptet auch nichts.
 *
 * Die Chronik (`wiki/log.md`) wird nicht zurueckgedreht: sie ist append-only
 * (docs/MODULE-SCHEMA.md). Was passiert ist, ist passiert — auch das
 * Zurueckdrehen selbst.
 */

import type { GardenerFindingKind, GardenerFix } from '@shared/types';
import { sha256 } from '@core/vault/hash';
import { joinVaultPath, trashDir } from '@core/vault/paths';
import type { WikiStore } from '@core/wiki';

/** Ein geaenderter Pfad mit seinem Zustand davor. */
export interface FixStep {
  path: string;
  /** Vollstaendiger Dateiinhalt vor der Aenderung. */
  before: string;
  /** Hash des Inhalts, den der Fix geschrieben hat. */
  hashAfter: string;
}

export interface FixJournal {
  version: 1;
  kind: GardenerFindingKind;
  action: GardenerFix['action'];
  steps: FixStep[];
}

/** `.secondbrain/trash/<marke>/gardener.json` */
export function fixJournalPath(token: string): string {
  return joinVaultPath(trashDir(), token, 'gardener.json');
}

function isStep(value: unknown): value is FixStep {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['path'] === 'string' &&
    typeof record['before'] === 'string' &&
    typeof record['hashAfter'] === 'string'
  );
}

/** Protokoll aus rohem JSON lesen; `null`, wenn es unbrauchbar ist. */
export function parseFixJournal(raw: string | null): FixJournal | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const steps = record['steps'];
    if (!Array.isArray(steps)) return null;
    const kind = record['kind'];
    const action = record['action'];
    if (typeof kind !== 'string' || typeof action !== 'string') return null;
    return {
      version: 1,
      kind: kind as GardenerFindingKind,
      action: action as GardenerFix['action'],
      steps: steps.filter(isStep),
    };
  } catch {
    return null;
  }
}

export async function writeFixJournal(
  store: WikiStore,
  token: string,
  journal: FixJournal,
): Promise<void> {
  await store.writeText(fixJournalPath(token), `${JSON.stringify(journal, null, 2)}\n`);
}

export interface UndoFixResult {
  /** Pfade, die wieder auf dem Stand von vorher sind. */
  restored: string[];
  /** Pfade, die unberuehrt bleiben, weil sie sich seither geaendert haben. */
  kept: string[];
}

/**
 * Einen Fix zurueckdrehen. Ohne Protokoll passiert nichts — die Marke ist dann
 * unbekannt, und das ist kein Fehler, den der Nutzer beheben kann.
 */
export async function undoFix(store: WikiStore, token: string): Promise<UndoFixResult> {
  const journal = parseFixJournal(await store.readText(fixJournalPath(token)));
  const restored: string[] = [];
  const kept: string[] = [];
  if (journal === null) return { restored, kept };

  for (const step of [...journal.steps].reverse()) {
    const current = await store.readText(step.path);
    if (current === null || sha256(current) !== step.hashAfter) {
      kept.push(step.path);
      continue;
    }
    await store.writeText(step.path, step.before, { expectedHash: step.hashAfter });
    restored.push(step.path);
  }
  return { restored, kept };
}
