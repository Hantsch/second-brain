/**
 * The IPC contract. The single source of truth for the boundary between
 * renderer and main.
 *
 * Rules:
 * - The renderer never touches the file system directly. Everything runs
 *   through these channels.
 * - A channel is entered here, registered in main, and used in the renderer
 *   via `src/renderer/lib/api.ts`. The preload only knows this list.
 * - Channels are `area:action`. Events are `event:...` and flow only
 *   main → renderer.
 */

import type {
  AgentKind,
  AgentProject,
  AgentCliStatus,
  AgentProtectionState,
  AgentSessionSummary,
  AgentSetupApplyRequest,
  AgentSetupApplyResult,
  AgentSetupState,
  AppSettings,
  Area,
  AreaNote,
  ChatThread,
  Citation,
  ClaudeSession,
  CoachRequest,
  CondenseProposal,
  CondenseUnit,
  DashboardData,
  DashboardLayout,
  DocLanguage,
  DumpItem,
  EngineBuildId,
  FilingProposal,
  FilingResult,
  GardenerDiscardPlan,
  GardenerDiscardResult,
  GardenerFinding,
  GardenerReport,
  GardenerRunProgress,
  GardenerRunScope,
  GardenerSupersedeResult,
  HfModelSearchRequest,
  HfModelSearchResponse,
  HfPullFile,
  IngestJob,
  IngestKind,
  JournalDay,
  JournalFrontmatterFields,
  KnowledgeModule,
  LlamaOverrides,
  LlamaStartPlan,
  LocalRuntimeStatus,
  MachineScanResult,
  ModelRef,
  ModuleDeletePlan,
  ModuleDeleteResult,
  ModuleRenamePlan,
  ModuleRenameResult,
  ModuleUndoResult,
  OrphanTargets,
  Project,
  ProjectFrontmatter,
  ProjectStatus,
  ProposedTodo,
  ProviderConfig,
  ProviderKind,
  ProviderPreset,
  RawSource,
  RecommendationSet,
  Reminder,
  Routing,
  RuntimeId,
  RuntimePlan,
  Scope,
  SearchHit,
  SearchQuery,
  SettingsSnapshot,
  TaskDefinition,
  TaskKind,
  TaskResult,
  TerminalIntent,
  TerminalLaunchResult,
  Todo,
  TranscriptPage,
  VaultDoc,
  VaultSettings,
  VaultStatus,
  WikiPage,
  WorkTask,
  WriteResult,
  SourceDetail,
  UpdateActionResult,
  UpdateState,
} from './types';

/** Answer to a question asked of Gaston. */
export interface AskAnswer {
  threadId: string;
  messageId: string;
}

export interface IndexStats {
  docs: number;
  todos: number;
  projects: number;
  modules: number;
  pages: number;
  words: number;
  builtAt: string | null;
  durationMs: number | null;
  /** Vault-relative paths of files skipped because they exceed the size guard. */
  oversized: string[];
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
  userData: string;
  /** Is the app running in demo mode on a sample vault? */
  demo: boolean;
}

/** Notes of one version as Markdown; `null` when the changelog has no section for it. */
export interface ReleaseNotes {
  version: string;
  markdown: string | null;
}

/** A write with conflict protection: `expectedHash` = what the client read. */
export interface WriteRequest {
  path: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  expectedHash?: string;
}

/**
 * One heading that only needs a new name — mirrors `SectionRename` from
 * `@core/vault/section-migration`. Kept as its own shape here (not imported
 * from the core) for the same reason `JournalStreamBlock` mirrors
 * `JournalBlock`: nothing outside that module needs to import from it just to
 * describe the wire shape.
 */
export interface SectionRename {
  kind: string;
  /** The heading as it stands in the file. */
  from: string;
  /** The heading it becomes — the target language's word for this kind. */
  to: string;
}

/** One heading whose content moves under the heading the file already has — mirrors `SectionFold`. */
export interface SectionFold {
  kind: string;
  /** The old-language heading that goes. */
  from: string;
  /** The target-language heading that receives its content. */
  into: string;
}

/** What one file needs, and the hash it was planned at — mirrors `SectionMigrationEntry`. */
export interface SectionMigrationEntry {
  path: string;
  hash: string;
  renames: SectionRename[];
  folds: SectionFold[];
}

/**
 * What became of one file in `vault:sectionMigrate` — mirrors
 * `SectionMigrationOutcome`. `conflict`: the file changed since the plan,
 * nothing was written. `missing`: the file is gone. `unchanged`: nothing was
 * left to do. `skipped`: the path isn't one this migration may touch.
 */
export type SectionMigrationOutcome = 'migrated' | 'conflict' | 'missing' | 'unchanged' | 'skipped';

/** Mirrors `SectionMigrationResult`. */
export interface SectionMigrationResult {
  path: string;
  outcome: SectionMigrationOutcome;
  renames: number;
  folds: number;
}

/** One round of the coaching dialogue, as it appears in the journal entry. */
export interface JournalTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Time 'HH:MM' from the speaker line; `null` when there is none. */
  at: string | null;
}

/**
 * One block of the "Day" stream (011), the IPC-facing mirror of
 * `JournalBlock` from `@core/journal`: my own prose (`entry`) or an app
 * answer (`answer`), in write order. `at` is the answer's time, `null` for an
 * `entry` block — the renderer never derives it itself.
 */
export interface JournalStreamBlock {
  kind: 'entry' | 'answer';
  text: string;
  at: string | null;
}

/**
 * A journal day for display: the file plus its three sections, already
 * split apart. The renderer never parses markdown itself — otherwise there
 * would be a second version of the file format that drifts apart the moment
 * someone writes a day entry by hand.
 */
export interface JournalDayView {
  day: JournalDay;
  doc: VaultDoc;
  /** Prose of the "Day" section — what the human wrote themselves. */
  text: string;
  /** The "Day" section as a stream of blocks, in write order (011). */
  stream: JournalStreamBlock[];
  /** Rounds of the "Conversation" section, oldest first (legacy). */
  turns: JournalTurn[];
  /** The "Facts" section, verbatim as it is in the file. */
  facts: string;
  /**
   * This day's own loose ends (020, D5; 069, D3): the union of what's still
   * open (`openLooseEnds()`, unchanged) and what's since been resolved
   * (`dayLooseEnds()`, 069/D2), filtered to `day.date`. A candidate is either
   * open (`resolution: null`) or resolved, never both.
   */
  looseEnds: JournalDayLooseEnd[];
}

/**
 * One of a day's loose ends as `journal:get` shows them (069, D3): the
 * announcement plus what settled it, or `null` while it's still open.
 * A sibling of `JournalInterviewLooseEnd` — that one stays the interview's own
 * shape (no `resolution`, since the interview only ever asks about an open
 * one) — rather than a variant of it, so a resolved loose end's shape doesn't
 * have to lie about a field the interview never fills in.
 */
export interface JournalDayLooseEnd {
  /** Same id scheme as `JournalInterviewLooseEnd.id` (`loose-end:<hash>`) —
      what `journal:answerLooseEnd` and the maintenance screen track it under. */
  id: string;
  day: string;
  /** The announcing sentence, verbatim — never a claim, always a quote. */
  quote: string;
  /** `null` while still open; otherwise the day that picked it back up. */
  resolution: { day: string; path: string } | null;
}

/**
 * One of the interview's five fixed topics (012) — mirrors `InterviewTopic`
 * from `@core/journal`. Kept as its own literal union here (not imported from
 * the core) for the same reason `JournalStreamBlock` mirrors `JournalBlock`:
 * `src/shared/` is the IPC-facing layer, and nothing outside `core/journal`
 * should have to import from it just to describe the wire shape.
 */
export type JournalInterviewTopic = 'work' | 'events' | 'people' | 'open' | 'feeling';

/** One interview question, answered or still open — mirrors `InterviewStep`. */
export interface JournalInterviewStep {
  topic: JournalInterviewTopic;
  question: string;
}

/**
 * The interview's optional extra question about a still-open loose end (020,
 * D8) — mirrors `InterviewLooseEnd` from `@core/journal`. Unlike
 * `JournalInterviewStep`, `question` is not part of this shape: nothing here
 * gets written into the day file (`journal:answerLooseEnd` only writes the
 * typed answer, never this prompt), so the wording is the renderer's own UI
 * text (`journal.interview.looseEnd.question`, UI language), built from
 * `quote` — the same reasoning `CloseLabels` already applies to the day
 * close's reasoning text.
 */
export interface JournalInterviewLooseEnd {
  /** Passed straight through to `journal:answerLooseEnd`'s `id`. */
  id: string;
  /** Passed straight through to `journal:answerLooseEnd`'s `day`. */
  day: string;
  /** The announcing sentence, verbatim — never a claim, always a quote. */
  quote: string;
}

/**
 * The interview plan for one day (012): which of the five topics are still
 * open, and whether a model is routed for the optional follow-up (`mode`).
 * Mirrors `InterviewPlan` from `@core/journal`.
 */
export interface JournalInterviewPlan {
  /** Remaining steps, in `INTERVIEW_TOPICS` order. */
  steps: JournalInterviewStep[];
  /** 'model': a route exists for `journal-chat`, so a follow-up can be asked. */
  mode: 'model' | 'fixed';
  finished: boolean;
  /** The one optional loose-end question (020, D8) — `null` when none is open. */
  looseEnd: JournalInterviewLooseEnd | null;
}

/**
 * All channels: channel name → request/response.
 * `void` means: no argument resp. no return value.
 */
export interface IpcRoutes {
  // ── Vault ────────────────────────────────────────────────────────────────
  'vault:status': { req: void; res: VaultStatus };
  /** Open the folder dialog and load the vault. null = cancelled. */
  'vault:choose': { req: void; res: VaultStatus | null };
  'vault:open': { req: { path: string }; res: VaultStatus };
  'vault:create': { req: { path: string; name: string }; res: VaultStatus };
  'vault:close': { req: void; res: VaultStatus };
  'vault:recent': { req: void; res: { path: string; name: string; exists: boolean }[] };
  'vault:read': { req: { path: string }; res: VaultDoc | null };
  'vault:write': { req: WriteRequest; res: WriteResult };
  'vault:delete': { req: { path: string }; res: { undoToken: string } };
  'vault:tree': { req: { dir?: string }; res: { path: string; dir: boolean; size: number }[] };
  /**
   * Which files still carry section headings in the other document language,
   * and what a migration to `to` would do to them (story 024, D7) — the read
   * side of the section-heading migration in `@core/vault/section-migration`.
   * `count` is `entries.length`, carried alongside so the settings screen can
   * show "N files carry old-language headings" without counting itself.
   * Files with nothing to do are not in `entries` — an already-migrated vault
   * yields `count: 0`.
   */
  'vault:sectionPlan': {
    req: { to: DocLanguage };
    res: { to: DocLanguage; count: number; entries: SectionMigrationEntry[] };
  };
  /**
   * Runs a plan (or a subset of it) from `vault:sectionPlan`. Each entry's
   * `hash` guards its write exactly as the plan was taken: a file that moved
   * on in between comes back as `conflict` in `results`, not as an overwrite.
   * One file's conflict does not stop the others in the same call.
   */
  'vault:sectionMigrate': {
    req: { to: DocLanguage; entries: SectionMigrationEntry[] };
    res: { results: SectionMigrationResult[]; migrated: number; conflicts: number };
  };

  // ── Index & search ───────────────────────────────────────────────────────
  'index:stats': { req: void; res: IndexStats };
  'index:rebuild': { req: void; res: IndexStats };
  'search:query': { req: SearchQuery; res: SearchHit[] };
  /**
   * Resolves each of `targets` — a vault path, a wikilink, or a bare slug, as
   * it stands in the file at `from` — to the vault-relative path it means, via
   * `resolveLink()` in `core/index/resolve-link.ts` (059, D2). One batched
   * round trip per rendered document, not one channel call per link. The
   * response is keyed by the input target string, so a target that appears
   * more than once still needs only one lookup, and a target nothing can
   * resolve comes back `null` rather than a guess (guardrail 3/5). Without an
   * index, every target resolves to `null` — the same honest-empty-state
   * guard `search:query` uses, never a throw.
   */
  'search:resolveLinks': {
    req: { from: string; targets: string[] };
    res: Record<string, string | null>;
  };

  // ── Capture & filing ─────────────────────────────────────────────────────
  'capture:dump': {
    req: { text: string; origin: DumpItem['origin']; tags?: string[]; scope?: Scope | null };
    res: DumpItem;
  };
  'capture:inbox': { req: void; res: DumpItem[] };
  'capture:classify': { req: { path: string }; res: FilingProposal };
  'capture:apply': { req: { proposal: FilingProposal }; res: FilingResult };
  /** "Leave it" — with undo: `undoToken` writes the previous status back. */
  'capture:keep': { req: { path: string }; res: { dump: DumpItem; undoToken: string } };
  'capture:discard': { req: { path: string }; res: { undoToken: string } };
  'capture:undo': { req: { undoToken: string }; res: void };
  /** Open/close the quick-capture window. */
  'capture:window': { req: { show: boolean }; res: void };

  // ── Projects ─────────────────────────────────────────────────────────────
  'projects:list': { req: { scope?: Scope; includeDone?: boolean }; res: Project[] };
  'projects:get': { req: { slug: string }; res: { project: Project; doc: VaultDoc } | null };
  'projects:create': {
    req: { title: string; scope: Scope; status?: ProjectStatus; body?: string };
    res: Project;
  };
  'projects:patch': {
    req: {
      slug: string;
      patch: Partial<ProjectFrontmatter>;
      expectedHash?: string;
      /**
       * Where this patch comes from: a direct edit (`user`, the default) or accepting
       * an AI suggestion (`suggestion`). Decides `by` in the `status_set`/`next_step_set`
       * stamps this write produces — manual edit and suggestion-accept are otherwise
       * indistinguishable at this boundary.
       */
      origin?: 'user' | 'suggestion';
    };
    res: Project;
  };
  'projects:append': {
    req: { slug: string; section: string; content: string };
    res: WriteResult;
  };
  /**
   * A hand-written note into the project's notes section. The block is the one
   * filing a dump writes (`### YYYY-MM-DD` plus the text), character for
   * character — both paths write the same shape into the same file.
   *
   * Which heading it lands under comes from the file ("Notizen" · "Notes"); the
   * document language only decides when the file carries neither yet.
   *
   * `expectedHash` is the hash the client read; without it the file's current
   * hash is used — the write is guarded either way, never unguarded. `block`
   * comes back exactly as written, so the caller can hand it straight to
   * `projects:removeNote` for the undo.
   */
  'projects:createNote': {
    req: { slug: string; text: string; expectedHash?: string };
    res: WriteResult & { block: string };
  };
  /**
   * Undo of `projects:createNote`: takes exactly that block back out again.
   *
   * If the block no longer stands in the file verbatim, the user has edited it
   * meanwhile — then nothing is written and his version stays. That is a plain
   * success with the file's current hash, not a conflict: the undo has nothing
   * left to undo, and no line of his is rewritten for it.
   */
  'projects:removeNote': { req: { slug: string; block: string }; res: WriteResult };
  /** LLM derives status and next step from the project history (a suggestion). */
  'projects:suggestStatus': {
    req: { slug: string };
    res: {
      status: ProjectStatus;
      nextStep: string;
      reason: string;
      /**
       * Produced without a model — from rules over the existing data. If a
       * model is configured, the channel falls back to this when the model
       * fails or returns nonsense; this field then says so instead of
       * claiming an interpretation that didn't happen.
       */
      heuristic?: boolean;
    } | null;
  };
  'projects:resolveWaiting': { req: { slug: string; index: number }; res: Project };

  // ── Areas ────────────────────────────────────────────────────────────────
  'areas:list': { req: void; res: Area[] };
  /**
   * The notes of one area, read from the file — not from the index.
   *
   * `AreaNote.excerpt` carries the **full** entry here, character for character
   * as it stands in the file. The list from `areas:list` carries the preview;
   * the index deliberately doesn't hold note bodies (it would become a copy of
   * the vault), so the text of an expanded section comes from here.
   */
  'areas:notes': { req: { slug: string }; res: AreaNote[] };
  /**
   * A note into an area's notes section. Without `area` it lands in the default
   * area `areas/notes.md`, which is created on first use.
   *
   * `expectedHash` is the hash the client read; without it the file's current
   * hash is used — the write is guarded either way, never unguarded.
   */
  'areas:createNote': {
    req: { text: string; area?: string | null; expectedHash?: string };
    res: WriteResult;
  };
  'areas:create': { req: { title: string }; res: Area };
  /**
   * Move one note from one area to another: `line` is the `AreaNote.line` of the
   * entry, `expectedHash` guards the source file. Either both files change or
   * neither does — a note is never in two files, and never in none.
   */
  'areas:moveNote': {
    req: { from: string; to: string; line: number; expectedHash: string };
    res: { from: WriteResult; to: WriteResult };
  };

  // ── Condensation (story 037/038) ────────────────────────────────────────
  /**
   * The existing condensed artifact of an area, `null` when it has never been
   * condensed. Never touches the gateway — reading is always possible without
   * a configured model.
   */
  'condense:read': {
    req: { unit: CondenseUnit; slug: string };
    res: {
      content: string;
      hash: string;
      path: string;
      condensedAt: string;
      sources: string[];
    } | null;
  };
  /**
   * Starts the condensation over the unit's deterministic inputs (Guardrail 2:
   * nothing is written here). Answers with the *task* it queued, not with the
   * proposal (073, D3): the run may take minutes, so the user walks away and
   * the finished proposal is fetched via `tasks:result` under the task's id.
   * Only `llm-unavailable` is still thrown by the channel itself, before any
   * task exists — a level with no model routed is a dead end, never a queued
   * task that could only fail. Every other reason a run has no proposal
   * (`invalid` for no inputs or an unattributable reply, `unknown` for a failed
   * gateway call) becomes the task's own failure message.
   */
  'condense:run': { req: { unit: CondenseUnit; slug: string }; res: WorkTask };
  /**
   * Accepts a proposal: snapshots whatever currently sits at `proposal.path` (for
   * undo), then writes `proposal.after` hash-guarded against `proposal.baseHash`.
   * A stale hash comes back as `conflict` and leaves the file untouched.
   * `proposal.unit` carries which level this is — the request has no separate
   * `unit` field, it rides inside the proposal.
   */
  'condense:accept': {
    req: { proposal: CondenseProposal };
    res: { path: string; hash: string; undoToken: string | null };
  };
  /**
   * Records a rejection in the artifact's human-owned `Direktiven`/`Directives`
   * section — the next run can read why. Never writes the machine sections.
   */
  'condense:reject': {
    req: { unit: CondenseUnit; slug: string; reason: string };
    res: { path: string };
  };
  /**
   * Deletes the condensed artifact outright (043, D1) — the way back to "never
   * condensed", unlike `condense:reject`, which keeps the artifact and only
   * records a reason. `expectedHash` guards exactly like `condense:accept`'s
   * `proposal.baseHash`: a stale hash comes back as `conflict` and leaves the
   * file byte-identical. An artifact that doesn't exist at all is `invalid` —
   * there is nothing to delete. `undoToken` is the way back: the file moves
   * into `.secondbrain/trash/` (same contract as `vault:delete`), it is never
   * removed outright.
   */
  'condense:delete': {
    req: { unit: CondenseUnit; slug: string; expectedHash: string };
    res: { path: string; undoToken: string };
  };

  // ── Todos ────────────────────────────────────────────────────────────────
  'todos:list': {
    req: { scope?: Scope; project?: string; area?: string; open?: boolean; dueBefore?: string };
    res: Todo[];
  };
  'todos:toggle': { req: { id: string }; res: Todo };
  'todos:create': {
    req: {
      text: string;
      scope: Scope;
      project?: string | null;
      /** Exclusive with `project`: a new todo lands in a project or an area, not both. */
      area?: string | null;
      due?: string | null;
      /** 1 = low, 2 = medium, 3 = high. Medium is the default. */
      priority?: 1 | 2 | 3;
    };
    res: Todo;
  };
  'todos:update': {
    req: { id: string; text?: string; due?: string | null; priority?: 1 | 2 | 3 };
    res: Todo;
  };
  /** Reorder every checkbox in one project file by stable todo id. */
  'todos:reorder': { req: { ids: string[] }; res: Todo[] };

  // ── Journal & coaching ───────────────────────────────────────────────────
  'journal:list': { req: { limit?: number }; res: JournalDay[] };
  /** The journal day with its three sections — the renderer never parses markdown. */
  'journal:get': { req: { date: string }; res: JournalDayView | null };
  /** Append prose to the "Day" section; if the file doesn't exist, it is created. */
  'journal:append': { req: { date: string; text: string }; res: WriteResult };
  /**
   * Replace the "Day" section — the editor's write path. `expectedHash` is
   * the hash the editor read when opening: without it, saving would silently
   * overwrite a change made elsewhere.
   */
  'journal:setDay': {
    req: { date: string; text: string; expectedHash?: string };
    res: WriteResult;
  };
  'journal:setMood': {
    req: { date: string; mood?: number; energy?: number; expectedHash?: string };
    res: JournalDay;
  };
  /**
   * Mark a day finished or reopen it by hand (009, D3) — the manual switch
   * next to the day close-out (`journal:applyClose`), which sets the same
   * field automatically. `closed: true` writes today's date, `false` clears
   * it to `null` (a frontmatter patch can set a field but not delete it).
   */
  'journal:setClosed': {
    req: { date: string; closed: boolean; expectedHash?: string };
    res: JournalDay;
  };
  /** Coaching response; streams over `event:llm-stream`. */
  'journal:coach': { req: CoachRequest; res: { threadId: string; messageId: string } };
  /** Abort a running coaching response. The user's own turn stays written. */
  'journal:abort': { req: { messageId: string }; res: void };
  /**
   * Starts the day close-out: extract facts, todos, and mood as a suggestion
   * (073, D4). Answers with the *task* it queued, not the suggestion itself —
   * mirrors `condense:run`: the suggestion is fetched via `tasks:result`
   * under the task's id once it finishes. `null`, with no task created,
   * means there is nothing to close (no entry, or an entry with no text) —
   * unlike `condense:run`, a heuristic-only close (no model routed for
   * `extract-tasks`) still queues a task, just off the model lane: 071's
   * decision that a heuristic close is still a useful result, not a dead end.
   */
  'journal:close': { req: { date: string }; res: WorkTask | null };
  /**
   * Write the confirmed day close-out: todos as checkboxes (under "Facts"
   * resp. in the project file the todo names) and the day's frontmatter
   * fields. `undo` is the way back — each entry is a `vault:write` that
   * restores the previous state.
   */
  'journal:applyClose': {
    req: {
      date: string;
      todos: ProposedTodo[];
      frontmatter: JournalFrontmatterFields;
      expectedHash?: string;
    };
    res: { written: string[]; undo: WriteRequest[] };
  };
  /**
   * Discards a day close-out suggestion without applying it (073 review
   * finding 2) — the `journal:close` counterpart to `condense:reject`/
   * `condense:delete`, which already mark their unit's stored result the same
   * way. Nothing is written; it only marks whatever `journal:close` once
   * stored for this date as decided, the same best-effort `markBySubject` call
   * `journal:applyClose` makes on success — a date with nothing stored is a
   * no-op, not a refusal. Without this, a discarded (or already applied)
   * suggestion stays retrievable via `tasks:result` and can resurface on a
   * remount or a cache refetch.
   */
  'journal:discardClose': { req: { date: string }; res: void };
  /**
   * One-time migration (011, D5/D6): folds the legacy "Conversation" section
   * into the "Day" stream and removes the heading. `expectedHash` guards the
   * write exactly like `journal:setDay` — without it, the file's current hash
   * is used, but the write is never unguarded.
   */
  'journal:foldDay': { req: { date: string; expectedHash?: string }; res: WriteResult };

  /**
   * Answers a loose end (020, D5): my own words about what happened, appended
   * into today's "Day" stream, preceded by a back-reference wikilink to the
   * day that made the announcement. `expectedHash` guards today's file
   * exactly like `journal:setDay` — stale, and the write fails with
   * `conflict` instead of overwriting.
   */
  'journal:answerLooseEnd': {
    req: { id: string; day: string; text: string; expectedHash?: string };
    res: { path: string; hash: string };
  };

  /**
   * The interview (012): which of the five fixed topics still have no answer
   * for this day. Works on a day that has no file yet — planning is a read,
   * it never creates one just to answer the question.
   */
  'journal:interviewPlan': { req: { date: string }; res: JournalInterviewPlan };
  /**
   * Write one answered interview step into the day: the question as the
   * app's blockquote, the answer as prose right below it — one call, one
   * append (`recordAnswer`). No `expectedHash`: appending adds and rewrites
   * no line of the user's, so a conflict here would be pure friction, the
   * same trade-off `journal:append` already makes.
   */
  'journal:interviewAnswer': {
    req: { date: string; step: JournalInterviewStep; answer: string };
    res: { path: string; hash: string; at: string };
  };
  /**
   * The interview's optional model follow-up to a step just answered — one
   * extra question about that answer, never a sixth topic. `noModel: true`
   * with `question: null` means no route at all; `false` with `null` means a
   * model answered but nothing it said held up.
   */
  'journal:interviewFollowUp': {
    req: { date: string; step: JournalInterviewStep; answer: string };
    res: { question: string | null; noModel: boolean };
  };

  // ── Knowledge modules ────────────────────────────────────────────────────
  'modules:list': { req: void; res: KnowledgeModule[] };
  'modules:create': { req: { title: string; description: string }; res: KnowledgeModule };
  'modules:pages': { req: { module: string; type?: WikiPage['type'] }; res: WikiPage[] };
  'modules:page': { req: { path: string }; res: { page: WikiPage; doc: VaultDoc } | null };
  'modules:savePage': { req: WriteRequest; res: WriteResult };
  'modules:sources': { req: { module?: string }; res: RawSource[] };
  /** Graph for the module view. */
  'modules:graph': {
    req: { module: string };
    res: { nodes: { id: string; title: string; type: string }[]; edges: [string, string][] };
  };
  /**
   * Preview of a module rename (063, D4): the folder move (unless title-only)
   * and every page/frontmatter/`AGENTS.md`/protocol/wikilink rewrite it would
   * make — nothing is written yet. `blocked: 'target-exists'` comes straight
   * out of the vault content (the core plan); `'digestion-pending'` is added
   * here, at the IPC layer, when the ingest queue still holds a job targeting
   * this module — a queued digestion would recreate the old folder right
   * after a rename lands.
   */
  'modules:renamePlan': { req: { slug: string; title: string }; res: ModuleRenamePlan };
  /**
   * Confirms a rename. `fingerprint` is the preview's own, from `renamePlan` —
   * a plan re-computed at apply time and found to differ refuses with
   * `conflict`, and so does a digestion that started after the preview.
   */
  'modules:rename': {
    req: { slug: string; title: string; fingerprint: string };
    res: ModuleRenameResult;
  };
  /**
   * Preview of a module delete (063, D4): page count, every affected raw
   * source ("returns to undigested" vs. "stays digested elsewhere"), inbound
   * wikilinks that would break, and projects that would lose the slug.
   */
  'modules:deletePlan': { req: { slug: string }; res: ModuleDeletePlan };
  /** Confirms a delete — same `fingerprint`/digestion-pending guard as `rename`. */
  'modules:delete': { req: { slug: string; fingerprint: string }; res: ModuleDeleteResult };
  /**
   * Undoes a rename or a delete — one token, one way back (`undoFix`, extended
   * for the whole module by 063). Settles with a full index refresh: a moved
   * or restored folder has no `.md` extension for a path-scoped refresh to key on.
   */
  'modules:undo': { req: { undoToken: string }; res: ModuleUndoResult };

  // ── Asking questions ─────────────────────────────────────────────────────
  /** Question to Gaston; answer streams over `event:llm-stream`. */
  'chat:ask': {
    req: {
      question: string;
      threadId?: string;
      module?: string | null;
      scope?: Scope | null;
      /** Restrict the answer to documents under this project slug. */
      project?: string | null;
    };
    res: AskAnswer;
  };
  /**
   * The most recent conversations. `query` searches title and messages — so
   * that what fell out of the list is still reachable, instead of showing a
   * random assortment.
   */
  'chat:threads': {
    req: { kind?: ChatThread['kind']; query?: string; limit?: number };
    res: ChatThread[];
  };
  'chat:thread': { req: { id: string }; res: ChatThread | null };
  'chat:delete': { req: { id: string }; res: void };
  'chat:abort': { req: { messageId: string }; res: void };
  /** File the answer as a wiki page, so the exploration doesn't vanish in the chat. */
  'chat:fileBack': {
    req: { threadId: string; messageId: string; module: string; title: string };
    res: WriteResult;
  };

  // ── Ingesting sources ────────────────────────────────────────────────────
  'ingest:start': {
    req: { kind: IngestKind; input: string; module?: string | null; force?: boolean };
    res: IngestJob;
  };
  'ingest:jobs': { req: void; res: IngestJob[] };
  'ingest:cancel': { req: { id: string }; res: void };
  'ingest:retry': { req: { id: string }; res: IngestJob };
  /** Condense a raw source that already exists, including one from an earlier session. */
  'ingest:condense': {
    req: {
      path: string;
      module: string;
      /** What to build the page from. Defaults to `'transcript'`. */
      basis?: 'transcript' | 'metadata';
    };
    res: IngestJob;
  };
  /**
   * Fetch an uncondensed YouTube source without a transcript again, in place. The
   * replaced files go to the trash first; without a new transcript nothing is written.
   */
  'ingest:refetch': { req: { path: string }; res: IngestJob };
  /** Read the persistent state shown by the source detail window. */
  'ingest:detail': { req: { path: string }; res: SourceDetail };
  /** Re-run the YouTube resource check without re-condensing the wiki source. */
  'ingest:analyzeResources': { req: { path: string }; res: SourceDetail };
  /** Pick files and copy them below the YouTube source's `sources/` folder. */
  'ingest:attachFiles': { req: { path: string }; res: SourceDetail };
  /** Pick files via dialog. */
  'ingest:pickFiles': { req: void; res: string[] };
  /** Status of the yt-dlp binary. */
  'ingest:ytdlpStatus': {
    req: void;
    res: { available: boolean; path: string | null; version: string | null };
  };
  'ingest:ytdlpInstall': {
    req: void;
    res: { available: boolean; path: string | null; version: string | null };
  };

  // ── LLM management ───────────────────────────────────────────────────────
  'llm:presets': { req: void; res: ProviderPreset[] };
  'llm:providers': { req: void; res: ProviderConfig[] };
  'llm:addProvider': {
    req: { label: string; kind: ProviderKind; baseUrl: string; apiKey?: string; local?: boolean };
    res: ProviderConfig;
  };
  'llm:updateProvider': {
    req: { id: string; patch: Partial<Omit<ProviderConfig, 'id'>>; apiKey?: string };
    res: ProviderConfig;
  };
  'llm:removeProvider': { req: { id: string }; res: void };
  'llm:probe': { req: { id: string }; res: ProviderConfig };
  'llm:models': { req: { id: string }; res: string[] };
  /**
   * Is a local runtime already running on this machine? Checks the addresses
   * of the presets with `local: true` (Ollama, LM Studio) and reports what
   * answers. This lets the settings screen give concrete guidance instead of
   * guessing in general terms; it sets nothing up itself — adopting it stays
   * a separate step.
   */
  'llm:detectLocal': {
    req: void;
    res: {
      /** ID of the preset from `core/llm/presets`. */
      presetId: string;
      label: string;
      baseUrl: string;
      /** Did the address respond? */
      running: boolean;
      /** What's loaded there — empty if nothing answered. */
      models: string[];
      /** Is a provider already configured for this address? */
      configured: boolean;
    }[];
  };
  /**
   * Status of a local runtime (019c; 033 generalises it from Ollama-only to
   * any `RuntimeId`): whether it's running, installed but stopped, or absent.
   * Feeds the guided "get a local runtime" flow — distinct from
   * `llm:detectLocal`'s multi-preset running check. The response echoes
   * `runtime` back so a caller juggling both runtime cards never has to track
   * which request a given answer belongs to.
   */
  'llm:localRuntimeStatus': {
    req: { runtime: RuntimeId };
    res: { runtime: RuntimeId; status: LocalRuntimeStatus };
  };
  /**
   * The precondition judgement for an in-app runtime install (019c, D2; 033
   * adds `runtime`): size, where the installer would land, where models
   * would end up. A plain read with no side effect — the same shape as
   * `llm:scanMachine` — so the confirmation dialog can show real numbers
   * before anything downloads. `runtime` is echoed in the response for the
   * same reason as `llm:localRuntimeStatus`.
   */
  'llm:runtimeInstallPlan': {
    req: { runtime: RuntimeId; buildId?: EngineBuildId };
    res: RuntimePlan & { runtime: RuntimeId };
  };
  /**
   * Starts the installer download after the user has confirmed the plan from
   * `llm:runtimeInstallPlan` (033 adds `runtime`, so the download fetches the
   * right runtime's engine). What to fetch and where to put it both come from
   * the plan for that runtime, not from anything else the renderer supplies.
   * Progress and completion arrive over `event:install-progress`, keyed by the
   * returned `downloadId` — the same run/report split `journal:coach`/
   * `event:llm-stream` uses for a streamed operation. Throws (closed
   * `IpcError` code `invalid`) instead of starting a download if the plan
   * turns out blocked at this moment (a race with `llm:scanMachine`, e.g. disk
   * filled up between reading the plan and confirming it) — by the time this
   * channel is called, the renderer has already shown the plan and only
   * offers the button when `canInstall` was true.
   */
  'llm:downloadRuntime': {
    req: { runtime: RuntimeId; buildId?: EngineBuildId };
    res: { downloadId: string };
  };
  /**
   * Cancels a running installer download; an unknown id changes nothing.
   * `runtime` (033) routes the cancel to the right runtime's installer.
   */
  'llm:cancelRuntimeDownload': { req: { runtime: RuntimeId; downloadId: string }; res: void };
  /**
   * Opens the installer file the most recently *completed* `llm:downloadRuntime`
   * run for this runtime produced, in its OS default handler (019c, D3; 033
   * adds `runtime`) — so the user doesn't have to go find the file themselves.
   * The handler tracks the last completed download's path per runtime itself,
   * the same way `llm:downloadRuntime` already tracks its running downloads —
   * it never trusts a filesystem path the renderer might supply.
   * `shell.openPath` never throws; a non-empty return is the OS's own
   * human-readable failure reason, carried through as `reason` (this is
   * OS/installer-path info, not vault content, so it's fine to surface as-is).
   * `reason: 'no-installer-downloaded'` if no download has completed yet this
   * run.
   */
  'llm:openRuntimeInstaller': {
    req: { runtime: RuntimeId };
    res: { opened: boolean; reason?: string };
  };
  /**
   * Starts the given runtime's server, then polls the same detection
   * `llm:localRuntimeStatus` uses until it reports `'running'` or a few
   * seconds pass (019c, D3; 033 adds `runtime`) — the "start it for me" step
   * once the runtime is installed but not running. Ollama's server is spawned
   * detached and outlives this app; llama.cpp's (034, D3) is tracked and
   * stopped again on quit, which is what `llm:stopLlamaEngine` acts on.
   *
   * `reason` is closed and never a raw error string from the process (034,
   * AC 5): `'timeout'` if the server never answered in time, `'spawn-failed'`
   * if the binary itself couldn't be started (e.g. a race with an uninstall),
   * plus the four causes 034 can name for llama.cpp and act on —
   * `'binary-missing'`, `'model-missing'`, `'port-in-use'`,
   * `'out-of-memory'`. Ollama's implementation only ever reports the first
   * two, so widening this stays backward compatible for it.
   */
  'llm:startLocalRuntime': {
    req: { runtime: RuntimeId };
    res: {
      runtime: RuntimeId;
      started: boolean;
      status: LocalRuntimeStatus;
      reason?:
        | 'timeout'
        | 'spawn-failed'
        | 'port-in-use'
        | 'model-missing'
        | 'binary-missing'
        | 'out-of-memory';
    };
  };
  /**
   * llama.cpp-specific status detail (034, D2) that the generic
   * `llm:localRuntimeStatus` doesn't carry: `ownedByApp` (Decisions, Q6 — a
   * foreign runtime is shown as running but never stopped) and which port in
   * the 11435–11444 range (Decisions, Q3) it is actually reachable on. A
   * dedicated channel rather than widening `llm:localRuntimeStatus`, since
   * both of these are meaningless for Ollama, which has no port range to
   * probe and no lifecycle this app doesn't already fully own via `PATH`.
   */
  'llm:llamaEngineStatus': {
    req: void;
    res: { status: LocalRuntimeStatus; ownedByApp: boolean; port: number | null };
  };
  /**
   * The start plan (034, D1's `planLlamaStart`) for the currently installed
   * model file and the current machine facts/resource budget/overrides —
   * what the card shows before a start (AC 3) so the values and their one-
   * sentence reasons are visible ahead of pressing the button, not only
   * after. `null` when no `.gguf` file is installed yet: there is nothing to
   * plan for, which is an honest empty state, not a refusal.
   */
  'llm:llamaStartPlan': {
    req: void;
    res: LlamaStartPlan | null;
  };
  /**
   * Stops the llama.cpp engine *this app started* (034, D3) — llama.cpp-only,
   * because it is the only runtime whose process this app tracks; Ollama's
   * `ollama serve` is deliberately detached and this app never stops it.
   *
   * Never refused (Decisions, Q5): `stopped: true` when a tracked process was
   * signalled, `stopped: false` when there was nothing app-owned to stop —
   * that second case is a no-op, not an error. A foreign engine (something
   * answering on a port in the range that this app did not spawn) is never
   * touched by this channel (Decisions, Q6).
   */
  'llm:stopLlamaEngine': {
    req: void;
    res: { stopped: boolean };
  };
  /**
   * Sets (or clears, `null`) one or both of the advanced start-plan overrides
   * (034, Decisions Q1) — `machine.llamaOverrides`, machine-local like the
   * VRAM override and the resource budget above. A field left out of the
   * request is untouched, so setting one never clobbers the other (D5).
   * Returns the freshly derived start plan (D1) directly — `null` when no
   * `.gguf` file is installed — so the card's readout updates in the same
   * round trip a stop/start already does, without a follow-up
   * `llm:llamaStartPlan` call. A value that isn't a non-negative integer is
   * refused with `invalid`; there is no ceiling on this side of the
   * boundary — `planLlamaStart`'s own clamp is the one that applies it (see
   * `shared/llm/llama-overrides.ts`).
   */
  'llm:setLlamaOverrides': { req: Partial<LlamaOverrides>; res: LlamaStartPlan | null };
  /**
   * Sets the auto-start mode (034, D6; Decisions Q2) —
   * `machine.llamaAutoStart`, machine-local like the overrides above.
   * `'manual'` (the default) never starts the engine on its own; `'on-
   * demand'` lets the LLM request path start it the first time a task needs
   * it and finds it `installed-stopped` (`ensureLlamaRunning`,
   * `llamacpp-autostart.ts`). A value that is neither is refused with
   * `invalid`.
   */
  'llm:setLlamaAutoStart': { req: 'manual' | 'on-demand'; res: void };
  /**
   * Pulls a model into the given local runtime (019c, D4; 033 adds `runtime`,
   * since llama.cpp fills its model directory from a Hugging Face file rather
   * than Ollama's native pull) — the last step of the guided flow, once a
   * runtime is running but empty. Returns immediately with a `pullId`; the
   * pull itself runs on in the background and reports over
   * `event:pull-progress`, the same run/report split `llm:downloadRuntime`
   * uses. Throws (closed code `invalid`) on an empty model id, nothing else:
   * an unreachable runtime or a model it doesn't know surfaces as a closing
   * event with an `error`, not as a rejected call. `hfFile` (033, D7) is set
   * only for `runtime: 'llamacpp'`, whose model directory is filled from a
   * Hugging Face file rather than a native pull tag; `modelId` still names
   * the file (its base name) for progress reporting, so `event:pull-progress`
   * needs no shape change either. Refused up front — before the download
   * starts — when the free-disk check (`detail.blockedReason`,
   * `detail.freeDiskMb`) does not clear.
   */
  'llm:pullModel': {
    req: { runtime: RuntimeId; modelId: string; hfFile?: HfPullFile };
    res: { pullId: string };
  };
  /**
   * Searches Hugging Face for GGUF model repositories, or lists one
   * repository's `.gguf` files (033, D3/D4/D8) — D3's two-step flow
   * (`searchHfModels` then `listHfModelFiles`) folded into one channel rather
   * than two, since both steps share the same honest-failure shape
   * (`HfLookupReason`) and the file-listing step is never useful on its own.
   * Anonymous access only — no token, see the story's "Hugging Face access"
   * decision. Never throws for a gated repo or an offline network: those are
   * honest states named in the response (`ok: false, reason`), not bugs.
   */
  'llm:searchModelFiles': { req: HfModelSearchRequest; res: HfModelSearchResponse };
  /**
   * Cancels a running pull; an unknown id changes nothing. The partial model is
   * removed from Ollama before the run's closing event goes out, so a repeat
   * pull of the same model starts clean.
   */
  'llm:cancelPull': { req: { pullId: string }; res: void };
  'llm:tasks': { req: void; res: TaskDefinition[] };
  'llm:routing': { req: void; res: Routing };
  'llm:setRoute': { req: { task: TaskKind; ref: ModelRef | null }; res: Routing };
  'llm:setDefault': {
    req: { tier: 'cheap' | 'balanced' | 'strong'; ref: ModelRef | null };
    res: Routing;
  };
  /**
   * Suggestion for which existing model fits which task. Only a suggestion:
   * it's adopted via `llm:setRoute`/`llm:setDefault` once the user confirms it.
   */
  'llm:suggestRouting': { req: void; res: Routing };
  'llm:testTask': {
    req: { task: TaskKind };
    res: { ok: boolean; latencyMs: number; sample: string; error?: string };
  };
  /** Cheap machine facts (RAM, CPU, disk, GPU) for judging local-model capacity. */
  'llm:scanMachine': { req: void; res: MachineScanResult };
  /**
   * The remembered result of the last `llm:scanMachine` (035, D2): what the
   * machine card shows on mount, without probing anything and without the
   * user clicking scan first. Facts and verdict are derived fresh from the
   * cached pre-override facts against the settings as they stand right now
   * — the same derivation `llm:scanMachine` and the two setters below use —
   * so nothing returned here can disagree with the current VRAM override or
   * resource budget. `null` means this machine has never been scanned: the
   * honest empty state, never an invented result.
   */
  'llm:getMachineScan': { req: void; res: MachineScanResult | null };
  /**
   * Sets or clears the manually entered VRAM override (028): detection can't
   * read VRAM above 4 GB on Windows (32-bit `AdapterRAM`, see 019a), so the
   * user can type the figure in by hand. Persisted machine-locally (never in
   * the vault) and folded into every subsequent `MachineFacts` the same way
   * a detected value would be — the verdict and the model recommendation use
   * it exactly like a measurement. `vramMb: null` clears it. Returns a fresh
   * scan result — the same shape as `llm:scanMachine` — so caller and store
   * stay in sync in one round trip, without a second call to
   * `llm:getMachineScan` just to see the value just written. A figure
   * outside the accepted range (see `shared/llm/vram-override.ts`) is
   * refused with `invalid` and nothing is written.
   */
  'llm:setVramOverride': { req: { vramMb: number | null }; res: MachineScanResult };
  /**
   * Sets the share of this machine's RAM/VRAM that model sizing may plan
   * against (029) — the user's way of keeping headroom for everything else
   * running on the machine. Persisted machine-locally (never in the vault),
   * like the VRAM override, and applied inside `judgeCapacity` after the
   * fixed reserves, so every verdict — the machine card's and the one behind
   * the model recommendation — plans with the same percentage. Returns a
   * fresh scan result, the same shape as `llm:scanMachine`, so the change is
   * visible in one round trip, the same way `llm:setVramOverride` avoids a
   * follow-up `llm:getMachineScan` call. A figure outside 10–100 or
   * anything that isn't a whole percent (see `shared/llm/resource-budget.ts`)
   * is refused with `invalid` and nothing is written.
   */
  'llm:setResourceBudget': { req: { percent: number }; res: MachineScanResult };
  /**
   * One recommended target per task, with reason/tradeoff keys and cost per
   * run — a proposal, nothing is written until `llm:setRoute`/`llm:setDefault`
   * confirms it.
   */
  'llm:recommendModels': { req: void; res: RecommendationSet };

  // ── Dashboard, reminders, maintenance ────────────────────────────────────
  'dashboard:data': { req: void; res: DashboardData };
  'dashboard:layout': { req: void; res: DashboardLayout };
  'dashboard:setLayout': { req: { layout: DashboardLayout }; res: DashboardLayout };
  'reminders:list': { req: void; res: Reminder[] };
  'reminders:snooze': { req: { id: string; days: number }; res: void };
  /** Lift a snooze — the way back to `reminders:snooze`, otherwise there would be none. */
  'reminders:unsnooze': { req: { id: string }; res: void };
  'gardener:report': { req: void; res: GardenerReport | null };
  /**
   * The current run's last-known snapshot — the same payload `event:gardener-
   * progress` carries — or `null` when no run is going (021a, D4). This is
   * what lets a screen mounted mid-run show the bar immediately instead of
   * waiting for the next progress event.
   */
  'gardener:runStatus': { req: void; res: GardenerRunProgress | null };
  /**
   * `resume: true` continues the last stored run instead of starting fresh
   * (021b, D3): stages it already finished are not run a second time — a
   * check does not run twice, and a model stage that already answered is not
   * asked again. Without a stored run, or with one that already reached every
   * planned stage, this is the same as a plain run (the latter a no-op that
   * still ends the same way a run does).
   *
   * `scope` narrows the run to part of the vault (021c): only checks whose
   * kind is named run at all, a model stage whose every possible output lies
   * outside it is not asked, and the ones that are see only the findings that
   * fall inside it. Absent — the normal case — checks and re-derives
   * everything, exactly as before this field existed.
   *
   * Resuming a run that was scoped keeps that scope, whether or not this
   * request repeats it: a continue may finish a part-run, never turn it into a
   * complete check of the whole vault.
   */
  'gardener:run': {
    req: { useLlm?: boolean; resume?: boolean; scope?: GardenerRunScope };
    res: GardenerReport;
  };
  /** Cancels a running maintenance pass; without a running pass, nothing happens. */
  'gardener:cancel': { req: void; res: void };
  'gardener:dismiss': { req: { id: string }; res: void };
  /** Undo "looks fine": the finding counts again — and again against health. */
  'gardener:undismiss': { req: { id: string }; res: void };
  /** Puts a finding away until it counts again — mirrors `reminders:snooze`. */
  'gardener:snooze': { req: { id: string; days: number }; res: void };
  /** Lift a snooze — the way back to `gardener:snooze`, otherwise there would be none. */
  'gardener:unsnooze': { req: { id: string }; res: void };
  /**
   * `written` are the changed files, `open` are the ones the screen should
   * open (for `merge` and the `open-*` actions, this is the only effect —
   * they write nothing). `undoToken` is absent exactly when nothing was written.
   */
  'gardener:applyFix': {
    req: { finding: GardenerFinding };
    res: { written: string[]; open?: string[]; undoToken?: string };
  };
  /**
   * Revert a fix. `restored` are the files that are back to their previous
   * state; `kept` are the ones the user has since edited themselves — those
   * stay as they are. An unknown token changes nothing.
   */
  'gardener:undoFix': {
    req: { undoToken: string };
    res: { restored: string[]; kept: string[] };
  };
  /**
   * Preview of discarding a page (015 D6): what would disappear and what would
   * be repointed, computed fresh — nothing is written. `path` must be named by
   * a finding in the current persisted report; a path the report doesn't
   * currently know is rejected (`not-found`) instead of trusted from the
   * caller — the same stance `add-to-index` takes in `core/gardener/fixes.ts`.
   */
  'gardener:discardPlan': { req: { path: string; keep?: string }; res: GardenerDiscardPlan };
  /**
   * Confirms a discard: repoints inbound wikilinks at `keep`, drops the
   * catalog line, moves the page to the trash. Same path check as
   * `discardPlan`. `expectedHash` is the hash the confirm step was shown
   * (`plan.target.hash`); given, a page edited since raises `conflict`.
   */
  'gardener:discardPage': {
    req: { path: string; keep?: string; expectedHash?: string };
    res: GardenerDiscardResult;
  };
  /**
   * Confirms that `newerPath` supersedes `olderPath` — one frontmatter field,
   * both pages stay. Same path check as `discardPlan`, applied to both paths.
   * `expectedHash` guards `newerPath` exactly as in `discardPage`.
   */
  'gardener:supersede': {
    req: { newerPath: string; olderPath: string; expectedHash?: string };
    res: GardenerSupersedeResult;
  };
  /**
   * Ranked candidates for an orphan finding that has no unambiguous fix (016
   * D2): reads the finding's own module and returns pages the user could pick
   * as the "add a reference" target, plus the exact line a pick would append.
   * Read-only — nothing is written. Rejects a finding id the current report
   * doesn't know (`not-found`) or one that isn't an orphan-without-fix
   * (`invalid`): this channel only makes sense for the case the automatic fix
   * left undecided.
   */
  'gardener:orphanTargets': { req: { findingId: string }; res: OrphanTargets };
  /**
   * Confirms a pick from `gardener:orphanTargets` (016 D3): appends the very
   * line the preview showed to `target`, through the same `add-links` fix the
   * automatic single-candidate case uses — so a picked target and a found one
   * are indistinguishable to `core/gardener/fixes.ts`.
   *
   * `target` is a bare path from the renderer and is therefore **not** trusted:
   * main recomputes the candidate set for the finding and rejects anything not
   * in it (`invalid`) — another module, the orphan itself, a page that already
   * links it, or any non-wiki path. Same finding checks as `orphanTargets`.
   * `undoToken` is optional exactly as in `applyFix`; `add-links` writes one
   * file, so `written` names it.
   */
  'gardener:linkOrphan': {
    req: { findingId: string; target: string };
    res: { written: string[]; undoToken?: string };
  };
  /**
   * Enters several orphan pages into their module's overview in one go. Takes
   * finding ids, never paths: main reads the findings from the current report
   * and only accepts orphans whose own fix is the overview entry (`invalid`
   * otherwise, `not-found` for an id the report doesn't know). Each entry is
   * the finding's preview line verbatim. One `undoToken` takes back every
   * overview this call wrote.
   */
  'gardener:linkOrphans': {
    req: { findingIds: string[] };
    res: { written: string[]; undoToken?: string };
  };
  /**
   * The current work queue, insertion order — the same list the last
   * `event:work-tasks` carried, for a screen that mounts mid-run (071, D3).
   */
  'work:list': { req: void; res: WorkTask[] };
  /**
   * Stop a running task. The record stays in the list as `cancelled` — a task
   * the user stopped is history, not a gap (072, D2). `false` means there was
   * nothing to stop: no such task, or one that had already finished.
   */
  'tasks:cancel': { req: { id: string }; res: boolean };
  /**
   * Take a task that has not started out of its lane, so it never runs. Same
   * answer as `tasks:cancel`: `false` when there was nothing to take out.
   */
  'tasks:remove': { req: { id: string }; res: boolean };
  /**
   * Run a failed task again — as a *new* task; the failed record stays as it
   * is. Answers with the newly queued task, or `null` when there was nothing
   * to retry (unknown id, or a task that did not fail).
   */
  'tasks:retry': { req: { id: string }; res: WorkTask | null };
  /**
   * The result a finished task left behind (073) — the proposal a run the user
   * walked away from produced. `null` when there is none: an unknown id, a task
   * that produced no result (`hasResult: false`), or one whose result has
   * already been accepted or rejected.
   */
  'tasks:result': { req: { id: string }; res: TaskResult | null };

  // ── Claude sessions ──────────────────────────────────────────────────────
  'claude:sessions': { req: { limit?: number }; res: ClaudeSession[] };
  'claude:link': { req: { sessionId: string; project: string }; res: void };

  // ── Agent sessions (Claude & Codex) ──────────────────────────────────────
  'agents:projects': { req: { agent: AgentKind }; res: AgentProject[] };
  'agents:sessions': { req: { agent: AgentKind; projectKey: string }; res: AgentSessionSummary[] };
  'agents:transcript': {
    req: { agent: AgentKind; sessionId: string; projectKey: string; cursor?: string | null };
    res: TranscriptPage;
  };
  /**
   * Link an agent project (a working directory) to a vault project: the
   * directory moves into that project's `repos`, exactly as `claude:link`
   * does it for a single session. Per project, not per session — `repos`
   * names the directory, so every session in it shares the link.
   */
  'agents:link': { req: { agent: AgentKind; projectKey: string; project: string }; res: void };
  /** Is the `claude` CLI on this machine? Only looked up on PATH, never started. */
  'agent:cliStatus': { req: void; res: AgentCliStatus };
  /** Which of the agent setup files in the vault are current, outdated, missing or the user's own. */
  'agent:setupStatus': { req: void; res: AgentSetupState };
  /** Which of the protection rules in the vault's agent settings are in place; read-only. */
  'agent:protectionStatus': { req: void; res: AgentProtectionState };
  /**
   * Writes the confirmed setup files. Each entry carries the hash the user saw;
   * a file changed since then comes back as `conflict`, never overwritten.
   */
  'agent:setupApply': { req: AgentSetupApplyRequest; res: AgentSetupApplyResult };
  /**
   * Opens a terminal in the vault with `claude` started, optionally with a skill as first
   * prompt. Refusals are part of the result, not errors; main does the launch, nothing else.
   */
  'agent:launchTerminal': { req: TerminalIntent; res: TerminalLaunchResult };

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings:get': { req: void; res: SettingsSnapshot };
  'settings:setApp': { req: { patch: DeepPartial<AppSettings> }; res: SettingsSnapshot };
  'settings:setVault': { req: { patch: DeepPartial<VaultSettings> }; res: SettingsSnapshot };
  'settings:setLanguages': {
    req: { ui?: 'de' | 'en'; documents?: DocLanguage; conversation?: 'de' | 'en' };
    res: SettingsSnapshot;
  };

  // ── Window & system ──────────────────────────────────────────────────────
  'window:minimize': { req: void; res: void };
  'window:toggleMaximize': { req: void; res: { maximized: boolean } };
  'window:close': { req: void; res: void };
  /**
   * The renderer's answer to `event:close-requested` (042, D6): the user has
   * seen what closing would cost — a maintenance run that is still going — and
   * wants to close anyway. Lets the vetoed close through and carries out
   * exactly that close, so confirming ends up in the same place the title
   * bar's × would have. Never refused: a confirm that no veto is waiting for
   * changes nothing at all, rather than closing a window nobody asked to
   * close.
   */
  'window:confirmClose': { req: void; res: void };
  /**
   * The other answer to `event:close-requested` (042, D6, AC 8): leave both the
   * run and the window alone. Drops the vetoed close for good — including the
   * guard's dead-man timer, which would otherwise close the window a few
   * seconds after the user said not to. Only this one attempt is dropped: the
   * next close is judged from scratch, so cancelling is never an authorisation
   * for anything later. Never refused, exactly as `window:confirmClose`.
   */
  'window:cancelClose': { req: void; res: void };
  'window:isMaximized': { req: void; res: boolean };
  /**
   * Brings the main window to the front (from the tray icon, from the
   * background) and gives it focus. Quick-capture needs this: "show main
   * window" would otherwise be a button that only closes itself.
   */
  'window:show': { req: void; res: void };
  'shell:openPath': { req: { path: string }; res: void };
  'shell:openExternal': { req: { url: string }; res: void };
  'shell:showInFolder': { req: { path: string }; res: void };
  'app:info': { req: void; res: AppInfo };
  'app:releaseNotes': { req: void; res: ReleaseNotes };
  /** The remembered update state; never touches the network. */
  'update:state': { req: void; res: UpdateState };
  /** A manual check (ignores the 24 h window); resolves with the resulting state. */
  'update:check': { req: void; res: UpdateState };
  /** Downloads the offered update; resolves once it finished, failed or was cancelled. */
  'update:download': { req: void; res: UpdateActionResult };
  /** Stops the running download; resolves once it is back in `available`. */
  'update:cancelDownload': { req: void; res: UpdateActionResult };
  /** Refused while a task runs or an LLM streams; never cancels either. */
  'update:installAndRestart': { req: void; res: UpdateActionResult };
  /** Hides the offer for this process only. */
  'update:dismiss': { req: void; res: UpdateActionResult };
}

export type IpcChannel = keyof IpcRoutes;
export type IpcRequest<K extends IpcChannel> = IpcRoutes[K]['req'];
export type IpcResponse<K extends IpcChannel> = IpcRoutes[K]['res'];

/** All channel names at runtime — the preload lets only these through. */
export const IPC_CHANNELS: readonly IpcChannel[] = [
  'vault:status',
  'vault:choose',
  'vault:open',
  'vault:create',
  'vault:close',
  'vault:recent',
  'vault:read',
  'vault:write',
  'vault:delete',
  'vault:tree',
  'vault:sectionPlan',
  'vault:sectionMigrate',
  'index:stats',
  'index:rebuild',
  'search:query',
  'search:resolveLinks',
  'capture:dump',
  'capture:inbox',
  'capture:classify',
  'capture:apply',
  'capture:keep',
  'capture:discard',
  'capture:undo',
  'capture:window',
  'projects:list',
  'projects:get',
  'projects:create',
  'projects:patch',
  'projects:append',
  'projects:createNote',
  'projects:removeNote',
  'projects:suggestStatus',
  'projects:resolveWaiting',
  'areas:list',
  'areas:notes',
  'areas:createNote',
  'areas:create',
  'areas:moveNote',
  'condense:read',
  'condense:run',
  'condense:accept',
  'condense:reject',
  'condense:delete',
  'todos:list',
  'todos:toggle',
  'todos:create',
  'todos:update',
  'todos:reorder',
  'journal:list',
  'journal:get',
  'journal:append',
  'journal:setDay',
  'journal:setMood',
  'journal:setClosed',
  'journal:coach',
  'journal:abort',
  'journal:close',
  'journal:applyClose',
  'journal:discardClose',
  'journal:foldDay',
  'journal:answerLooseEnd',
  'journal:interviewPlan',
  'journal:interviewAnswer',
  'journal:interviewFollowUp',
  'modules:list',
  'modules:create',
  'modules:pages',
  'modules:page',
  'modules:savePage',
  'modules:sources',
  'modules:graph',
  'modules:renamePlan',
  'modules:rename',
  'modules:deletePlan',
  'modules:delete',
  'modules:undo',
  'chat:ask',
  'chat:threads',
  'chat:thread',
  'chat:delete',
  'chat:abort',
  'chat:fileBack',
  'ingest:start',
  'ingest:jobs',
  'ingest:cancel',
  'ingest:retry',
  'ingest:condense',
  'ingest:refetch',
  'ingest:detail',
  'ingest:analyzeResources',
  'ingest:attachFiles',
  'ingest:pickFiles',
  'ingest:ytdlpStatus',
  'ingest:ytdlpInstall',
  'llm:presets',
  'llm:providers',
  'llm:addProvider',
  'llm:updateProvider',
  'llm:removeProvider',
  'llm:probe',
  'llm:models',
  'llm:detectLocal',
  'llm:localRuntimeStatus',
  'llm:runtimeInstallPlan',
  'llm:downloadRuntime',
  'llm:cancelRuntimeDownload',
  'llm:openRuntimeInstaller',
  'llm:startLocalRuntime',
  'llm:llamaEngineStatus',
  'llm:llamaStartPlan',
  'llm:stopLlamaEngine',
  'llm:setLlamaOverrides',
  'llm:setLlamaAutoStart',
  'llm:pullModel',
  'llm:cancelPull',
  'llm:searchModelFiles',
  'llm:tasks',
  'llm:routing',
  'llm:setRoute',
  'llm:setDefault',
  'llm:suggestRouting',
  'llm:testTask',
  'llm:scanMachine',
  'llm:getMachineScan',
  'llm:setVramOverride',
  'llm:setResourceBudget',
  'llm:recommendModels',
  'dashboard:data',
  'dashboard:layout',
  'dashboard:setLayout',
  'reminders:list',
  'reminders:snooze',
  'reminders:unsnooze',
  'gardener:report',
  'gardener:runStatus',
  'gardener:run',
  'gardener:cancel',
  'gardener:dismiss',
  'gardener:undismiss',
  'gardener:snooze',
  'gardener:unsnooze',
  'gardener:applyFix',
  'gardener:undoFix',
  'gardener:discardPlan',
  'gardener:discardPage',
  'gardener:supersede',
  'gardener:orphanTargets',
  'gardener:linkOrphan',
  'gardener:linkOrphans',
  'work:list',
  'tasks:cancel',
  'tasks:remove',
  'tasks:retry',
  'tasks:result',
  'claude:sessions',
  'claude:link',
  'agents:projects',
  'agents:sessions',
  'agents:transcript',
  'agents:link',
  'agent:cliStatus',
  'agent:setupStatus',
  'agent:protectionStatus',
  'agent:setupApply',
  'agent:launchTerminal',
  'settings:get',
  'settings:setApp',
  'settings:setVault',
  'settings:setLanguages',
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:confirmClose',
  'window:cancelClose',
  'window:isMaximized',
  'window:show',
  'shell:openPath',
  'shell:openExternal',
  'shell:showInFolder',
  'app:info',
  'app:releaseNotes',
  'update:state',
  'update:check',
  'update:download',
  'update:cancelDownload',
  'update:installAndRestart',
  'update:dismiss',
];

/** Events that main sends to the renderer. */
export interface IpcEvents {
  /** A file in the vault has changed (including from outside the app). */
  'event:vault-changed': { paths: string[]; external: boolean };
  'event:index-progress': { done: number; total: number; indexing: boolean };
  /** A chunk of a streaming LLM response. */
  'event:llm-stream': {
    messageId: string;
    threadId: string;
    delta: string;
    done: boolean;
    citations?: Citation[];
    error?: string;
  };
  /**
   * Progress of an installer download started via `llm:downloadRuntime`
   * (019c, D2). `downloadId` matches the id that channel returned — so a
   * stale listener from a previous attempt can tell it isn't its own.
   * `done: true` is always the last event for a given `downloadId`, whether
   * it finished, was cancelled (`error: 'cancelled'`), or failed (`error`
   * holds an `IpcError['code']`, never a raw message).
   */
  'event:install-progress': {
    downloadId: string;
    downloadedMb: number;
    totalMb: number;
    done: boolean;
    error?: string;
  };
  /**
   * Progress of a model pull started via `llm:pullModel` (019c, D4). `pullId`
   * matches the id that channel returned, so a stale listener can tell it
   * isn't its own. `status` is Ollama's own phase wording (`pulling manifest`,
   * `downloading`, `verifying sha256 digest`) — a foreign string, shown as-is
   * next to the bar rather than translated. `completed`/`total` are bytes,
   * summed over all layers, so `completed` never walks backwards.
   * `done: true` is always the last event for a given `pullId`, whether it
   * finished, was cancelled (`error: 'cancelled'`), or failed (`error` holds an
   * `IpcError['code']`, never a raw message).
   */
  'event:pull-progress': {
    pullId: string;
    modelId: string;
    status: string;
    completed: number;
    total: number;
    done: boolean;
    error?: string;
  };
  'event:reminder': Reminder;
  'event:toast': { kind: 'info' | 'success' | 'warn' | 'error'; message: string };
  /** The user pressed the quick-capture hotkey. */
  'event:capture-focus': { text?: string };
  'event:vault-status': VaultStatus;
  'event:settings': SettingsSnapshot;
  /**
   * A close or a quit was vetoed because a maintenance run is going (042, D6)
   * — the prompt for whether that run may be killed. By the time this arrives
   * main has already called `preventDefault()`; the close happens once
   * `window:confirmClose` comes back, or after the guard's ~5 s dead-man timer
   * gives up on an answer (an unanswerable prompt must never be able to make
   * the app unclosable).
   *
   * Payload-free on purpose: what the prompt shows about the run is already in
   * the renderer's own live work-queue state (`event:work-tasks`, mirrored by
   * `core/work/registry.ts` since 074). A second copy of it here could only
   * ever disagree with that one.
   */
  'event:close-requested': void;
  /**
   * The whole work queue, full list not a delta, every time any task in it
   * changes state (071, D3) — the same "no delta" contract `IngestJob`'s
   * per-job event has, but one queue for every kind of long-running work
   * instead of one channel per feature.
   */
  'event:work-tasks': WorkTask[];
  /** Every change of the update state, including the end of a check. */
  'event:update': UpdateState;
}

export type IpcEventName = keyof IpcEvents;

export const IPC_EVENTS: readonly IpcEventName[] = [
  'event:vault-changed',
  'event:index-progress',
  'event:llm-stream',
  'event:install-progress',
  'event:pull-progress',
  'event:reminder',
  'event:toast',
  'event:capture-focus',
  'event:vault-status',
  'event:settings',
  'event:close-requested',
  'event:work-tasks',
  'event:update',
];

/** Errors that come back over IPC carry this shape. */
export interface IpcError {
  code:
    | 'no-vault'
    | 'not-found'
    | 'conflict'
    | 'llm-unavailable'
    | 'invalid'
    | 'io'
    | 'cancelled'
    | 'unknown'
    | 'too-large';
  message: string;
  detail?: unknown;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object | undefined
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};
