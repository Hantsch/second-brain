/* The last maintenance report and the set of "fine as is" entries.
   Both live in `<vault>/.secondbrain/gardener.json` — not in the
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
   dismissed, plus the size of the stock at the time of the run. What the
   screen sees is only produced in `present()` — filtered and with the health
   score recalculated. Only this way does "fine as is" stay reversible without
   checking again, and only this way does the health score always match the
   list shown next to it. */

import { join } from 'node:path';
import { healthScore } from '@core/gardener';
import type { GardenerFinding, GardenerReport } from '@shared/types';
import { readJson, writeJsonAtomic } from './fs-json';

/** Vault-relative location. Also documented in docs/VAULT-FORMAT.md. */
export const GARDENER_STATE_FILE = '.secondbrain/gardener.json';

export const GARDENER_STATE_VERSION = 1;

/** A run as it is stored — before any filtering. */
export interface StoredRun {
  ranAt: string;
  usedLlm: boolean;
  /** All findings of the run, unfiltered. */
  findings: GardenerFinding[];
  advice: string[];
  /** `vaultSize` at the time of the run — the reference size for health. */
  size: number;
}

/** A resolved finding with the token used to undo its fix. */
export interface FixedFinding {
  id: string;
  undoToken: string;
}

interface StoredGardener {
  version: number;
  run: StoredRun | null;
  /** IDs the user has marked as "fine as is". */
  dismissed: string[];
  /**
   * Findings a fix has written. They stay in the run and are only hidden —
   * that way `undoFix` can bring them back without checking again. A new run
   * clears the list: then what's in the files is what counts.
   */
  fixed: FixedFinding[];
}

function empty(): StoredGardener {
  return { version: GARDENER_STATE_VERSION, run: null, dismissed: [], fixed: [] };
}

function isFinding(value: unknown): value is GardenerFinding {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['kind'] === 'string' &&
    typeof record['severity'] === 'string' &&
    typeof record['title'] === 'string' &&
    Array.isArray(record['paths'])
  );
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function readFixed(value: unknown): FixedFinding[] {
  if (!Array.isArray(value)) return [];
  const result: FixedFinding[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = record['id'];
    const undoToken = record['undoToken'];
    if (typeof id === 'string' && typeof undoToken === 'string') result.push({ id, undoToken });
  }
  return result;
}

/** A stored run, or `null` if the file carries nothing usable. */
function readRun(value: unknown): StoredRun | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const ranAt = record['ranAt'];
  const size = record['size'];
  if (typeof ranAt !== 'string' || typeof size !== 'number') return null;
  const findings = Array.isArray(record['findings']) ? record['findings'].filter(isFinding) : [];
  return {
    ranAt,
    usedLlm: record['usedLlm'] === true,
    findings,
    advice: readStrings(record['advice']),
    size: Math.max(0, Math.trunc(size)),
  };
}

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

  static async load(root: string): Promise<GardenerState> {
    const stored = await readJson<Partial<StoredGardener>>(
      join(root, ...GARDENER_STATE_FILE.split('/')),
    );
    const state = new GardenerState(root, empty());
    if (stored !== null) {
      state.data = {
        version: GARDENER_STATE_VERSION,
        run: readRun(stored.run),
        dismissed: readStrings(stored.dismissed),
        fixed: readFixed(stored.fixed),
      };
    }
    return state;
  }

  /** IDs considered "fine as is". */
  dismissed(): ReadonlySet<string> {
    return new Set(this.data.dismissed);
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
   * The report as the screen sees it: without the dismissed findings, and
   * with the health score that belongs to exactly this list. `null` without a
   * run — a made-up 100 would be the kind of lie a dashboard dies from.
   */
  present(): GardenerReport | null {
    const run = this.data.run;
    if (run === null) return null;
    const hidden = new Set([...this.dismissed(), ...this.fixed()]);
    const findings = run.findings.filter((finding) => !hidden.has(finding.id));
    const health = healthScore(findings, run.size);
    return {
      ranAt: run.ranAt,
      usedLlm: run.usedLlm,
      findings,
      health: health.score ?? 0,
      healthKnown: health.score !== null,
      healthContributions: health.contributions,
      advice: run.advice,
    };
  }

  /**
   * Stores a run. The "fine as is" set stays (it's a decision about the
   * subject matter, not about the run); the list of resolved findings is
   * cleared — what a fix actually resolved is now determined by the new run.
   */
  async save(run: StoredRun): Promise<void> {
    this.data.run = run;
    this.data.fixed = [];
    await this.write();
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
export function gardenerState(root: string): Promise<GardenerState> {
  const known = loaded.get(root);
  if (known !== undefined) return known;
  loaded.clear();
  const pending = GardenerState.load(root);
  loaded.set(root, pending);
  return pending;
}

/** Forgets the loaded state — for tests and when closing the vault. */
export function forgetGardenerState(): void {
  loaded.clear();
}
