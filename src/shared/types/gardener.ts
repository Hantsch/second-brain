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
  | 'project-without-next-step'
  /** A day announced something for a later day that never got a follow-up. */
  | 'loose-end'
  /**
   * A condensed artifact is missing or older than its material — an area's or
   * project's condensed file, or a module's overview page.
   */
  | 'condensation-due';

/**
 * Every finding kind this build knows, as a list. Needed wherever a kind
 * arrives from outside the type system and has to be checked against what is
 * known — today the run scope read back from `.secondbrain/gardener.json`
 * (`main/gardener-state.ts`).
 *
 * Must name every member of `GardenerFindingKind`; the state test guards that,
 * because a kind missing here would silently read as unknown.
 */
export const GARDENER_FINDING_KINDS: readonly GardenerFindingKind[] = [
  'orphan',
  'broken-link',
  'index-drift',
  'stale-page',
  'contradiction',
  'missing-page',
  'near-duplicate',
  'unfiled-dump',
  'unprocessed-source',
  'project-without-next-step',
  'loose-end',
  'condensation-due',
];

export type FindingSeverity = 'info' | 'warn' | 'high';

/**
 * A stage of a maintenance run, for progress reporting. Mirrors
 * `GardenerStageId` in `@core/gardener/progress` — kept as its own type here
 * since `src/shared/` describes the wire, not the core's own type.
 */
export type GardenerStageId = 'checks' | 'audit' | 'loose-ends';

/** Who asked for this run — the user via the screen, or the autorun (021 D3). */
export type GardenerRunTrigger = 'user' | 'auto';

/**
 * What a maintenance run last reported (074, D2).
 *
 * The one home of a shape that used to be written out twice — once as the
 * `event:gardener-progress` payload in `src/shared/ipc.ts`, once as
 * `GardenerProgressEvent` in `src/main/ipc/gardener-deps.ts`. Two copies of a
 * wire shape drift; this is the type both of those now point at, and the one
 * a mirrored `WorkTask` carries in its `detail` so the Tasks screen and
 * `gardener:runStatus` read the same numbers the run itself published.
 *
 * `phase`, `check`, `done`, `total` are the original flat counts; `stage`,
 * `percent`, `remaining`, `startedAt`, `trigger` are the weighted view
 * (021a, D1) — see `@core/gardener/progress` for the weight math.
 */
export interface GardenerRunProgress {
  phase: 'checks' | 'audit' | 'loose-ends' | 'done';
  check: GardenerFindingKind | null;
  done: number;
  total: number;
  running: boolean;
  /** The stage this step belongs to, per the weighted stage plan. */
  stage: GardenerStageId | 'done';
  /** 0..100, the cumulative weighted progress. */
  percent: number;
  /** Stages not yet started, in plan order. */
  remaining: GardenerStageId[];
  /** When this run started — ISO timestamp, same convention as `ranAt`. */
  startedAt: string;
  /** Who asked for this run. */
  trigger: GardenerRunTrigger;
}

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
  /**
   * Which detector found this: the heuristic check, or the model pass over its
   * candidates (020, D4). Optional so a report persisted before this field
   * existed still reads back cleanly.
   */
  origin?: 'heuristic' | 'model';
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

/**
 * The part of the vault a run looked at (021c). Absent means: all of it.
 *
 * The two axes narrow **together** — `{ kinds: ['orphan'], module: 'demo' }` is
 * "orphans in module demo", not "orphans anywhere plus everything in demo".
 * An axis the scope does not name narrows nothing.
 *
 * `module: null` are the findings **without** a module (dumps, projects,
 * sources) — the same distinction the screen's filter draws with `'none'`. It
 * is a `null` and not an absent key because the difference matters: absent is
 * "every module", `null` is "the ones that have none".
 *
 * A scope that narrows nothing — no `module`, and no or an empty `kinds` — is
 * not a narrower scope but no scope: it reads as a full run everywhere.
 */
export interface GardenerRunScope {
  kinds?: GardenerFindingKind[];
  module?: string | null;
}

export interface GardenerReport {
  ranAt: string;
  /** Was an LLM used, or only the deterministic checks? */
  usedLlm: boolean;
  /**
   * Did the run reach every stage it planned to? `false` means the run was
   * stopped partway (021b) — a legacy run without a recorded plan reads as
   * complete, which is what it was. Optional so a report built without any
   * notion of stages (fixtures, the synchronous `report.ts` builder) still
   * satisfies the type; every reader of a partial run gets it from `present()`.
   */
  complete?: boolean;
  /** Stages the plan called for but this run never reached. Only set when `complete` is `false`. */
  missingStages?: GardenerStageId[];
  /**
   * When `complete` is `false`: the date of the run the frozen `health` below
   * actually comes from — not this run's own `ranAt`, which would claim a
   * number for stages that never ran.
   */
  healthAsOf?: string;
  /**
   * The part of the vault this run looked at (021c) — set exactly when the run
   * was scoped, absent when it checked everything. A scoped run is never
   * `complete`, so the screen can say both what was checked now and where the
   * numbers and findings beside it still come from.
   */
  scope?: GardenerRunScope;
  /**
   * Beside a `scope`: which finding kinds a stage of that run actually looked
   * for. Not the same as the kinds the scope named — a scope over
   * `contradiction` or `loose-end` on a vault with no model routed names a kind
   * nothing in the run could produce, and this list is then empty for it.
   *
   * The screen needs the difference to stay honest (AC 6): "checked, nothing
   * here" and "this scope needed a model stage that did not run" are two
   * different statements, and only one of them may be made without a model.
   * Absent beside an absent `scope` — a full run says what it says through
   * `complete` and `usedLlm`.
   */
  checkedKinds?: GardenerFindingKind[];
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
  /**
   * Whether the run can be handed to the agent for interpretation: `offered` when it has
   * no audit yet and a page to interpret, `open` while such a job waits for the agent.
   * Filled by main on the report channels; a report built elsewhere has none.
   */
  agentAudit?: { offered: boolean; open: boolean };
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
