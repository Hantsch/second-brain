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
import { joinVaultPath, trashDir } from '@core/vault/paths';
import { restoreSteps, type RollbackStep } from '@core/vault/rollback';
import { trashManifestPath } from '@core/vault/trash';
import type { WikiStore } from '@core/wiki';
import { GardenerError } from './types';

/**
 * What the undo needs of the store: the knowledge core's write surface **and** the
 * vault's trash. A discarded page lies in there, and only `VaultStore.undo` knows
 * how to bring it back. `VaultStore` satisfies this structurally — every caller
 * hands one in already.
 */
export interface UndoStore extends WikiStore {
  undo(token: string): Promise<string[]>;
  /** Only a journal with `moved` (a module rename) calls this — to put the folder back. */
  move(from: string, to: string): Promise<unknown>;
}

/**
 * A journal can also come from an action no finding triggered. `module-rename` and
 * `module-delete` are story 063's: the whole module under one mark.
 */
export type FixJournalKind =
  GardenerFindingKind | 'discard' | 'supersede' | 'module-rename' | 'module-delete';
export type FixJournalAction =
  GardenerFix['action'] | 'discard' | 'supersede' | 'module-rename' | 'module-delete';

/**
 * Ein geaenderter Pfad mit seinem Zustand davor — dieselbe Form wie
 * `RollbackStep` aus `core/vault/rollback.ts`, dessen Rueckweg dieser Modul
 * teilt. Der eigene Name bleibt bestehen, damit nichts, was `FixStep`
 * importiert, umgeschrieben werden muss.
 */
export type FixStep = RollbackStep;

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

/**
 * The folder a module rename moved (`VaultStore.move(from, to)`). The one structural
 * step without a hash guard, so it is written into the journal only **after** the
 * move landed — a journal that names a move always describes one that happened.
 */
export interface FixMove {
  /** The folder's path before the rename, e.g. `modules/old`. */
  from: string;
  /** The folder's path after the rename, e.g. `modules/new`. */
  to: string;
}

export interface FixJournal {
  version: 1;
  kind: FixJournalKind;
  action: FixJournalAction;
  /**
   * Content steps. For a rename, the steps inside the folder carry the **old** path:
   * they were written before the move, and `undoFix` moves the folder back first.
   */
  steps: FixStep[];
  /** Only for a discard: the file that went to the trash. */
  deleted?: FixDelete;
  /** Only for a module rename that changed the slug: the folder that moved. */
  moved?: FixMove;
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

function isMove(value: unknown): value is FixMove {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record['from'] === 'string' && typeof record['to'] === 'string';
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
    const moved = record['moved'];
    return {
      version: 1,
      kind: kind as FixJournalKind,
      action: action as FixJournalAction,
      steps: steps.filter(isStep),
      ...(isDelete(deleted) ? { deleted } : {}),
      ...(isMove(moved) ? { moved } : {}),
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
 * Put a renamed module's folder back where it was. `false` when there is nothing to
 * move — the folder no longer sits at `to` (already moved back: the second undo) —
 * and the steps then run against whatever lies at the old paths, each with its own
 * hash check.
 *
 * Something at **both** places is the one case with no safe answer: the old path has
 * been taken since, so the folder cannot go back, and the steps inside it were
 * recorded at exactly that old path — restoring them would write the rename's
 * "before" into a folder that is not the one it came from. So the whole undo stops
 * here, before a single byte is written, and says so.
 */
async function moveBack(store: UndoStore, moved: FixMove): Promise<boolean> {
  if (!(await store.exists(moved.to))) return false;
  if (await store.exists(moved.from)) {
    throw new GardenerError(
      'conflict',
      `„${moved.from}“ ist inzwischen wieder belegt; „${moved.to}“ bleibt, wo es ist.`,
    );
  }
  await store.move(moved.to, moved.from);
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
 *
 * A moved folder is the exception where the order *is* the guarantee: its steps
 * name the old paths, so the folder has to be back there before they run — and a
 * refused move-back (`moveBack`) throws before any step is touched.
 */
export async function undoFix(store: UndoStore, token: string): Promise<UndoFixResult> {
  const journal = parseFixJournal(await store.readText(fixJournalPath(token)));
  const restored: string[] = [];
  const kept: string[] = [];
  if (journal === null) return { restored, kept };

  if (journal.moved !== undefined) {
    const back = await moveBack(store, journal.moved);
    (back ? restored : kept).push(journal.moved.from);
  }
  if (journal.deleted !== undefined) {
    const back = await restoreDeleted(store, journal.deleted);
    (back ? restored : kept).push(journal.deleted.path);
  }
  const stepResult = await restoreSteps(store, journal.steps);
  restored.push(...stepResult.restored);
  kept.push(...stepResult.kept);
  return { restored, kept };
}
