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
import { LLM_ONLY_KINDS, healthScore, kindOf } from '@core/gardener';
import type { GardenerFinding, GardenerHiddenFinding, GardenerReport } from '@shared/types';
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
  /**
   * The IDs the run **re-derived**, before the model's audit dropped any of
   * them: the deterministic candidates plus the contradictions the model named.
   *
   * Why this exists next to `findings`: for `near-duplicate` and
   * `missing-page` the audit may reject a candidate the deterministic check
   * produced again unchanged. That rejection is the model's opinion about what
   * to *show* this run — it is not evidence that the vault condition is gone,
   * so it must not delete the user's decision about it (`save`). Missing or
   * empty — a file written before this field existed — means: fall back to
   * `findings`, exactly the behaviour from before.
   */
  consideredIds?: string[];
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
   * Finding ID → calendar day from which it counts again (ISO). The same shape
   * and the same cleanup as the reminder snoozes in `overview-state.ts`: a day
   * that has passed is not a snooze anymore, so it doesn't stay in the file.
   */
  snoozed: Record<string, string>;
  /**
   * Findings a fix has written. They stay in the run and are only hidden —
   * that way `undoFix` can bring them back without checking again. A new run
   * clears the list: then what's in the files is what counts.
   */
  fixed: FixedFinding[];
}

function empty(): StoredGardener {
  return { version: GARDENER_STATE_VERSION, run: null, dismissed: [], snoozed: {}, fixed: [] };
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

/** Only entries that look like `YYYY-MM-DD` — anything else isn't a day. */
function readDays(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[key] = day;
  }
  return out;
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
    consideredIds: readStrings(record['consideredIds']),
    advice: readStrings(record['advice']),
    size: Math.max(0, Math.trunc(size)),
  };
}

/**
 * Does a decision ("fine as is", snoozed) survive this run? Two cases keep it,
 * and only these two: the run found the finding again — the decision still has
 * a subject. Or the run **could not** have found it, because the kind is one
 * only a model produces (`LLM_ONLY_KINDS`) and this run had none; a run that
 * never looked says nothing by staying silent. Without that second case, one
 * single run without a model would delete every dismissal of a model finding,
 * and no screen would ever show it.
 *
 * Anything else falls away: the finding is gone, so the decision about it is
 * too — otherwise the file grows with every run and never shrinks. The kind
 * comes out of the ID (`kind:hash`), because a dismissed finding is exactly the
 * case where the finding itself is no longer there to ask.
 *
 * "The run found it again" means `considered`, not the shown list: a candidate
 * the model rejected was still re-derived, and only a re-derivation may end a
 * decision.
 */
function outlivesRun(id: string, considered: ReadonlySet<string>, usedLlm: boolean): boolean {
  if (considered.has(id)) return true;
  if (usedLlm) return false;
  const kind = kindOf(id);
  return LLM_ONLY_KINDS.some((llmOnly) => llmOnly === kind);
}

/**
 * What the run re-derived: the shown findings plus everything it considered.
 * The union, not `consideredIds` alone — a run stored without that field (or by
 * a caller that doesn't fill it) then falls back to its findings instead of
 * silently dropping every decision.
 */
function consideredBy(run: StoredRun): ReadonlySet<string> {
  const ids = new Set(run.findings.map((finding) => finding.id));
  for (const id of run.consideredIds ?? []) ids.add(id);
  return ids;
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

  /**
   * Loads the state and cleans up as it goes: snoozes whose day has come drop
   * out, the same way `overview-state.ts` does it. A file without `snoozed` —
   * written before this field existed — simply has none.
   */
  static async load(root: string, today: string): Promise<GardenerState> {
    const stored = await readJson<Partial<StoredGardener>>(
      join(root, ...GARDENER_STATE_FILE.split('/')),
    );
    const state = new GardenerState(root, empty());
    if (stored !== null) {
      state.data = {
        version: GARDENER_STATE_VERSION,
        run: readRun(stored.run),
        dismissed: readStrings(stored.dismissed),
        snoozed: readDays(stored.snoozed),
        fixed: readFixed(stored.fixed),
      };
      state.pruneSnoozes(today);
    }
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
   * The report as the screen sees it: the open findings in `findings`, the ones
   * the user put away in `hidden` — each with its state and, for a snooze, the
   * day it runs out. The health score is computed over the open list alone, so
   * the number always matches the list beside it. `null` without a run — a
   * made-up 100 would be the kind of lie a dashboard dies from.
   *
   * A snooze whose day has come is open again even if `pruneSnoozes` hasn't run
   * yet: left running past midnight, the file is a day behind the calendar.
   * Findings a fix has resolved are in neither list — they aren't a decision to
   * review, they're done until the next run.
   *
   * `resolved` are ids that a write outside this file has settled — today only
   * the answered loose ends (020, D5), whose record lives in
   * `.secondbrain/loose-ends.json`. They're treated exactly like a fixed
   * finding: gone from both lists, because an answer isn't a decision to
   * review, and gone here rather than at each caller, so no reader of a stored
   * run can miss it (`ipc/gardener-deps.ts`, `gardenerReport`).
   */
  present(today: string, resolved: ReadonlySet<string> = new Set()): GardenerReport | null {
    const run = this.data.run;
    if (run === null) return null;
    const dismissed = this.dismissed();
    const fixed = this.fixed();
    const findings: GardenerFinding[] = [];
    const hidden: GardenerHiddenFinding[] = [];
    for (const finding of run.findings) {
      if (fixed.has(finding.id) || resolved.has(finding.id)) continue;
      const until = this.data.snoozed[finding.id];
      if (dismissed.has(finding.id)) hidden.push({ finding, state: 'dismissed' });
      else if (until !== undefined && until > today) {
        hidden.push({ finding, state: 'snoozed', until });
      } else findings.push(finding);
    }
    const health = healthScore(findings, run.size);
    return {
      ranAt: run.ranAt,
      usedLlm: run.usedLlm,
      findings,
      hidden,
      health: health.score ?? 0,
      healthKnown: health.score !== null,
      healthContributions: health.contributions,
      advice: run.advice,
    };
  }

  /**
   * Stores a run — and the only place a decision is ever forgotten.
   *
   * "Fine as is" and a snooze are decisions about a thing, not about a run, so
   * they outlive it; but one whose finding is gone would stay in the file
   * forever. `outlivesRun` decides that, and it only ever sees what a
   * **completed** run re-derived (`consideredBy`): a cancelled run throws
   * before `save`, and its partial list must never be read as "everything else
   * is gone".
   *
   * The list of resolved findings is cleared — what a fix actually resolved is
   * now determined by the new run.
   */
  async save(run: StoredRun): Promise<void> {
    const considered = consideredBy(run);
    this.data.run = run;
    this.data.fixed = [];
    this.data.dismissed = this.data.dismissed.filter((id) =>
      outlivesRun(id, considered, run.usedLlm),
    );
    for (const id of Object.keys(this.data.snoozed)) {
      if (!outlivesRun(id, considered, run.usedLlm)) delete this.data.snoozed[id];
    }
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
