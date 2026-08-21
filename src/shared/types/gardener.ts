/* Maintenance findings, fixes, and the discard/supersede actions (story 015) —
   split out of `overview.ts` once the report, discard, and supersede shapes
   together pushed that file past the soft line limit. */

import type { WikiPageType } from './knowledge';

/** A finding from the maintenance run — the antidote to a rotting wiki. */
export type GardenerFindingKind =
  /** Page that nobody links to. */
  | 'orphan'
  /** Wikilink pointing at nothing. */
  | 'broken-link'
  /** Page is missing from the module's `index.md`, or listed there wrongly. */
  | 'index-drift'
  /** Page is old and was never reviewed. */
  | 'stale-page'
  /** Two pages claim contradictory things. */
  | 'contradiction'
  /** Frequently mentioned term without its own page. */
  | 'missing-page'
  /** Two pages are almost the same. */
  | 'near-duplicate'
  /** Dump has been sitting unfiled in the inbox for too long. */
  | 'unfiled-dump'
  /** Source sits in `raw/` but was never condensed. */
  | 'unprocessed-source'
  /** Project without a next step. */
  | 'project-without-next-step';

export type FindingSeverity = 'info' | 'warn' | 'high';

export interface GardenerFinding {
  id: string;
  kind: GardenerFindingKind;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** Affected files. */
  paths: string[];
  module: string | null;
  foundAt: string;
  /**
   * Content hash of each named file **at run time**, keyed by path. This is what
   * makes "the run is stale" a question that can be answered at all: a finding
   * carries the state it was derived from, so an action on it (discard,
   * supersede) can tell a file that has been edited since the run from one that
   * has not — without that, a fresh read at click time is always self-consistent
   * and a file edited between run and click would be discarded silently (AC 10).
   * Absent for a path the index did not know; then the freshness of that path is
   * simply unknown and no conflict is claimed.
   */
  hashes?: Record<string, string>;
  /** Suggestion the user can accept with a click. */
  fix: GardenerFix | null;
}

export interface GardenerFix {
  /** What the click does. */
  action:
    'add-to-index' | 'add-links' | 'mark-reviewed' | 'open-classify' | 'open-ingest' | 'merge';
  label: string;
  /** Preview of the change, if it can be generated mechanically. */
  preview: string | null;
}

/**
 * Where the health score comes from. A number without justification is a
 * claim — with this breakdown, the screen can say **why** the score is what
 * it is. The points add up to `100 − health`.
 */
export interface GardenerHealthContribution {
  kind: GardenerFindingKind;
  count: number;
  /** Points lost in this category, rounded. */
  points: number;
}

/**
 * A finding the user has taken out of the list, with the reason it is out.
 * `until` is the day a snooze runs out — the day from which the finding counts
 * again; a dismissal has no end and carries no day.
 */
export interface GardenerHiddenFinding {
  finding: GardenerFinding;
  state: 'dismissed' | 'snoozed';
  until?: string;
}

export interface GardenerReport {
  ranAt: string;
  /** Was an LLM used, or only the deterministic checks? */
  usedLlm: boolean;
  /** The open findings — and only those. */
  findings: GardenerFinding[];
  /**
   * Dismissed findings plus the ones still snoozed. Deliberately **not** in
   * `findings`: the dashboard tile and the per-module counts read that field,
   * and they must not count what the user has put away. They are carried along
   * rather than dropped so the screen can show and undo them without a new run.
   */
  hidden?: GardenerHiddenFinding[];
  /** Health score 0..100, derived from the count and severity of findings. */
  health: number;
  /**
   * Is there any stock at all for the score to refer to? `false` means:
   * `health` is unknown, not 0 — an empty vault has no health. Same contract
   * as `DashboardData.healthKnown`.
   */
  healthKnown?: boolean;
  /** Contributions per category, largest first. */
  healthContributions?: GardenerHealthContribution[];
  /** What the user should do next, at most three sentences. */
  advice: string[];
}

/**
 * A page's identity — mirrors `PageRef` from `@core/wiki`, kept as its own shape
 * here since `src/shared/` describes the wire, not the core's own type.
 */
export interface GardenerPageRef {
  path: string;
  module: string;
  slug: string;
  type: WikiPageType;
  title: string;
}

/** The page a discard would remove, as read just now — `hash` guards the write. */
export interface GardenerDiscardTarget extends GardenerPageRef {
  hash: string;
}

/** One inbound line that would be repointed at the surviving page, when `keep` names one. */
export interface GardenerDiscardRepoint {
  path: string;
  /** The line as it stands now. */
  before: string;
  /** The same line, with the wikilink target repointed to `keep`. */
  after: string;
}

/**
 * Preview of discarding a page (`gardener:discardPlan`, 015 D4/D6): what would
 * disappear and what would be repointed — nothing has been written yet.
 * Mirrors `DiscardPlan` from `@core/gardener/discard`.
 */
export interface GardenerDiscardPlan {
  target: GardenerDiscardTarget;
  /** Pages that link to the target, from the index graph. Empty is not an error. */
  inbound: GardenerPageRef[];
  catalogPath: string;
  /** The exact line that would be dropped from the catalog; `null` if there is none. */
  catalogLine: string | null;
  /** One entry per inbound page; empty unless `keep` was given. */
  repoints: GardenerDiscardRepoint[];
}

/** What `gardener:discardPage` changed — `undoToken` reverses content and file together. */
export interface GardenerDiscardResult {
  /** The page that is now in the trash. */
  discarded: string;
  /** Files whose content changed: repointed pages and the catalog. */
  written: string[];
  undoToken: string;
  /** The chronicle entry with the `lint` mark; it is not rolled back. */
  logged: string | null;
}

/** What `gardener:supersede` changed — one frontmatter field on the newer page. */
export interface GardenerSupersedeResult {
  /** The newer page — the only file this action writes. */
  written: string;
  undoToken: string;
  /** The chronicle entry with the `lint` mark; it is not rolled back. */
  logged: string | null;
}

/** A page the user could pick as the target of an orphan's "add a reference" fix. */
export interface OrphanTarget {
  path: string;
  title: string;
  slug: string;
}

/**
 * Ranked, filtered candidates for an orphan with no unambiguous target (story
 * 016) — the user picks one instead of the automatic single-candidate fix.
 */
export interface OrphanTargets {
  /** The exact line a pick would append — from `relatedLine`, same builder the
   *  existing single-candidate fix uses. */
  line: string;
  /** Candidate pages, ordered: overview page first, then pages sharing a mention
   *  word with the orphan, then the rest — titles ascending within each group. */
  targets: OrphanTarget[];
}
