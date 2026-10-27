/* The last maintenance report and the decisions the user made about it —
   "fine as is" and "not now, ask me again on <day>".
   All of it lives in `<vault>/.secondbrain/gardener.json` — not in the
   vault settings and not in the search index.

   Why a dedicated file:
   - **Settings are configuration.** A list of found findings and a growing
     set of dismissed IDs are operational state — the same reasoning as for
     the snoozes in `overview-state.ts`. `deepMerge` also can't remove
     anything; an undone "fine as is" would stay forever.
   - **But not in `overview.json` either.** A report is ten kilobytes of
     findings, the snooze state is two maps of calendar days. Discarding the
     report (it's derivable: one check is enough) shouldn't cost the reminder
     snoozes too.
   - **`.secondbrain/` may be deleted** (VAULT-FORMAT.md). If the file is
     missing, there's no report — the UI says "not checked yet" and doesn't
     claim a 100. That's the honest loss.

   The report is stored **raw**: all findings of the run, including ones later
   dismissed or snoozed, plus the size of the stock at the time of the run.
   What the screen sees is only produced in `present(today)` — split into open
   and hidden, and with the health score recalculated over the open list. Only
   this way do "fine as is" and a snooze stay reversible without checking
   again, and only this way does the health score always match the list shown
   next to it. */

import { join } from 'node:path';
import {
  applySavedRun,
  bookAgentAudit,
  empty,
  presentRun,
  readStoredGardener,
} from '@core/gardener';
import type { AuditResult, SaveRunOptions, StoredGardener, StoredRun } from '@core/gardener';
import type { GardenerReport } from '@shared/types';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relative location. Also documented in docs/VAULT-FORMAT.md. */
export const GARDENER_STATE_FILE = '.secondbrain/gardener.json';

export const GARDENER_STATE_VERSION = 1;

/** The stored run shape, unchanged in this file — now defined in
 * `@core/gardener/run-record` (027, D1). Re-exported so every existing
 * `import type { StoredRun } from '../gardener-state'` keeps working. */
export type { StoredRun };

/** Same for the save options, now defined beside the merge they steer in
 * `@core/gardener/run-merge` (027, D3). */
export type { SaveRunOptions };

/**
 * The maintenance state of an open vault. One instance per vault root;
 * whoever fetches it via `gardenerState()` always gets the same one.
 */
export class GardenerState {
  private data: StoredGardener;

  private constructor(
    readonly root: string,
    data: StoredGardener,
  ) {
    this.data = data;
  }

  private get file(): string {
    return join(this.root, ...GARDENER_STATE_FILE.split('/'));
  }

  /**
   * Loads the state and cleans up as it goes: snoozes whose day has come drop
   * out, the same way `overview-state.ts` does it. A file without `snoozed` —
   * written before this field existed — simply has none.
   */
  static async load(root: string, today: string): Promise<GardenerState> {
    const stored = await readJson<unknown>(join(root, ...GARDENER_STATE_FILE.split('/')));
    const data =
      stored === null
        ? empty(GARDENER_STATE_VERSION)
        : readStoredGardener(stored, GARDENER_STATE_VERSION);
    const state = new GardenerState(root, data);
    state.pruneSnoozes(today);
    return state;
  }

  /** IDs considered "fine as is". */
  dismissed(): ReadonlySet<string> {
    return new Set(this.data.dismissed);
  }

  /** Until when this finding is snoozed, or `null`. */
  snoozedUntil(id: string): string | null {
    return this.data.snoozed[id] ?? null;
  }

  /** IDs whose fix was written. */
  fixed(): ReadonlySet<string> {
    return new Set(this.data.fixed.map((entry) => entry.id));
  }

  /** The raw run, as stored. */
  run(): StoredRun | null {
    return this.data.run;
  }

  /**
   * The report as the screen sees it — open findings, hidden ones, and the
   * (possibly frozen) health score. The full reasoning, including why a
   * partial or scoped run never computes its own score, now lives with the
   * logic in `@core/gardener/run-present#presentRun` (027, D4); this method
   * is only the delegation, `this.data` being the one piece that method can't
   * reach on its own.
   */
  present(today: string, resolved: ReadonlySet<string> = new Set()): GardenerReport | null {
    return presentRun(this.data, today, resolved);
  }

  /**
   * Stores a run. What the run does to the state it lands in — which decision
   * survives it, which fix stays recorded, how a scoped run is laid over the
   * one before it — is decided in `@core/gardener/run-merge#applySavedRun`
   * (027, D3); this method is the write. A cancelled run never gets here: it
   * throws before `save`, and its partial list must never be read as
   * "everything else is gone".
   */
  async save(run: StoredRun, options: SaveRunOptions = {}): Promise<void> {
    this.data = applySavedRun(this.data, run, options);
    await this.write();
  }

  /**
   * Books an agent's audit into the stored run it was asked about — the run
   * stored at `ranAt`. Deliberately not `save`: an audit re-derives nothing, so
   * it must not pass through the pruning a new run applies to "fine as is" and
   * snoozes (`bookAgentAudit`). `false`, and nothing written, when that run is
   * gone or was replaced since.
   */
  async bookAgentAudit(ranAt: string, audit: AuditResult, at: string): Promise<boolean> {
    const next = bookAgentAudit(this.data, ranAt, audit, at);
    if (next === null) return false;
    this.data = next;
    await this.write();
    return true;
  }

  /**
   * Records a finding as resolved. `undoToken` is the fix's token;
   * `undoFixed(token)` reverses the entry.
   */
  async markFixed(id: string, undoToken: string): Promise<void> {
    if (this.data.fixed.some((entry) => entry.id === id)) return;
    this.data.fixed = [...this.data.fixed, { id, undoToken }];
    await this.write();
  }

  /** Removes the entry for this token — the finding counts again. */
  async undoFixed(undoToken: string): Promise<void> {
    const next = this.data.fixed.filter((entry) => entry.undoToken !== undoToken);
    if (next.length === this.data.fixed.length) return;
    this.data.fixed = next;
    await this.write();
  }

  /**
   * Dismisses a finding. `false` means: it doesn't exist in the last run —
   * then nothing is written either. A button that reports success and does
   * nothing is worse than a missing button.
   */
  async dismiss(id: string): Promise<boolean> {
    if (!this.knows(id)) return false;
    if (this.data.dismissed.includes(id)) return true;
    this.data.dismissed = [...this.data.dismissed, id];
    await this.write();
    return true;
  }

  /** Undoes "fine as is". `false` means: wasn't dismissed. */
  async undismiss(id: string): Promise<boolean> {
    if (!this.data.dismissed.includes(id)) return false;
    this.data.dismissed = this.data.dismissed.filter((entry) => entry !== id);
    await this.write();
    return true;
  }

  /**
   * Puts a finding away until `until` — the day from which it counts again.
   * `false` for the same reason as `dismiss`: no run knows this finding.
   */
  async snooze(id: string, until: string): Promise<boolean> {
    if (!this.knows(id)) return false;
    this.data.snoozed[id] = until;
    await this.write();
    return true;
  }

  /**
   * Lifts the snooze: the entry drops out, the finding counts again. Same
   * reasoning as `overview-state.ts` — setting the day to "today" would not be
   * the reverse. `false` means: wasn't snoozed.
   */
  async unsnooze(id: string): Promise<boolean> {
    if (this.data.snoozed[id] === undefined) return false;
    delete this.data.snoozed[id];
    await this.write();
    return true;
  }

  /** Remove snoozes whose day has come. `true` if something changed. */
  pruneSnoozes(today: string): boolean {
    let changed = false;
    for (const [id, until] of Object.entries(this.data.snoozed)) {
      if (until > today) continue;
      delete this.data.snoozed[id];
      changed = true;
    }
    return changed;
  }

  /** Does the last run know this finding? */
  knows(id: string): boolean {
    return this.data.run?.findings.some((finding) => finding.id === id) === true;
  }

  private async write(): Promise<void> {
    await writeJsonAtomic(this.file, this.data);
  }
}

/* One instance per vault. The vault changes rarely; the map stays small and
   is cleared on a switch so no foreign state lingers. */
const loaded = new Map<string, Promise<GardenerState>>();

/** This vault's maintenance state. The file is read on the first call. */
export function gardenerState(root: string, today: string): Promise<GardenerState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = GardenerState.load(root, today);
  loaded.set(root, pending);
  return pending;
}

/** Forgets the loaded state — for tests and when closing the vault. */
export function forgetGardenerState(): void {
  loaded.clear();
}
