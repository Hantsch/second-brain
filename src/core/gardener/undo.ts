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
 * Und eine Aktion, die eine Datei verwirft (`discard.ts`), traegt die Marke ihres
 * `VaultStore.delete` **im** Protokoll: `undoFix` holt damit erst die Datei aus dem
 * Papierkorb und dann die geaenderten Inhalte zurueck — eine Marke, ein Rueckweg.
 *
 * Die Chronik (`wiki/log.md`) wird nicht zurueckgedreht: sie ist append-only
 * (docs/MODULE-SCHEMA.md). Was passiert ist, ist passiert — auch das
 * Zurueckdrehen selbst.
 */

import type { GardenerFindingKind, GardenerFix } from '@shared/types';
import { sha256 } from '@core/vault/hash';
import { joinVaultPath, trashDir } from '@core/vault/paths';
import { trashManifestPath } from '@core/vault/trash';
import type { WikiStore } from '@core/wiki';

/**
 * What the undo needs of the store: the knowledge core's write surface **and** the
 * vault's trash. A discarded page lies in there, and only `VaultStore.undo` knows
 * how to bring it back. `VaultStore` satisfies this structurally — every caller
 * hands one in already.
 */
export interface UndoStore extends WikiStore {
  undo(token: string): Promise<string[]>;
}

/** A journal can also come from an action no finding triggered. */
export type FixJournalKind = GardenerFindingKind | 'discard' | 'supersede';
export type FixJournalAction = GardenerFix['action'] | 'discard' | 'supersede';

/** Ein geaenderter Pfad mit seinem Zustand davor. */
export interface FixStep {
  path: string;
  /** Vollstaendiger Dateiinhalt vor der Aenderung. */
  before: string;
  /** Hash des Inhalts, den der Fix geschrieben hat. */
  hashAfter: string;
}

/**
 * The file an action moved to the trash. `token` is `VaultStore.delete`'s own mark,
 * and it lives **inside** the journal so content and file come back under *one*
 * mark — the surface keeps a single way back, not two.
 */
export interface FixDelete {
  /** The path the file had in the vault. */
  path: string;
  /** The mark `VaultStore.delete` returned. */
  token: string;
}

export interface FixJournal {
  version: 1;
  kind: FixJournalKind;
  action: FixJournalAction;
  steps: FixStep[];
  /** Only for a discard: the file that went to the trash. */
  deleted?: FixDelete;
}

/** `.secondbrain/trash/<marke>/gardener.json` */
export function fixJournalPath(token: string): string {
  return joinVaultPath(trashDir(), token, 'gardener.json');
}

function isDelete(value: unknown): value is FixDelete {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record['path'] === 'string' && typeof record['token'] === 'string';
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
    const deleted = record['deleted'];
    return {
      version: 1,
      kind: kind as FixJournalKind,
      action: action as FixJournalAction,
      steps: steps.filter(isStep),
      ...(isDelete(deleted) ? { deleted } : {}),
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
 * The trash manifest of a mark, or `null` when the mark is not one. A journal that
 * somebody edited by hand must never become a path — `assertUndoToken` refuses,
 * and there is simply nothing to restore then.
 */
function manifestOf(token: string): string | null {
  try {
    return trashManifestPath(token);
  } catch {
    return null;
  }
}

/**
 * Bring a discarded file back out of the trash. `false` — the path stays `kept` —
 * in exactly the three cases in which restoring would be a claim rather than a
 * restore: something lies at the target again (`undo` would refuse too, and
 * overwriting is not ours to do), the trash entry is gone (already restored: the
 * second undo), or the mark is unreadable.
 */
async function restoreDeleted(store: UndoStore, deleted: FixDelete): Promise<boolean> {
  if (await store.exists(deleted.path)) return false;
  const manifest = manifestOf(deleted.token);
  if (manifest === null || !(await store.exists(manifest))) return false;
  await store.undo(deleted.token);
  return true;
}

/**
 * Einen Fix zurueckdrehen. Ohne Protokoll passiert nichts — die Marke ist dann
 * unbekannt, und das ist kein Fehler, den der Nutzer beheben kann.
 *
 * Rueckwaerts durch die Aktion: eine verworfene Seite wurde **zuletzt** geloescht,
 * also kommt sie **zuerst** zurueck — danach die Dateien, deren Inhalt sich
 * geaendert hat. Fuer die Zusicherungen macht die Reihenfolge keinen Unterschied
 * (jeder Schritt prueft selbst), fuer das Lesen des Protokolls schon.
 */
export async function undoFix(store: UndoStore, token: string): Promise<UndoFixResult> {
  const journal = parseFixJournal(await store.readText(fixJournalPath(token)));
  const restored: string[] = [];
  const kept: string[] = [];
  if (journal === null) return { restored, kept };

  if (journal.deleted !== undefined) {
    const back = await restoreDeleted(store, journal.deleted);
    (back ? restored : kept).push(journal.deleted.path);
  }
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
