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
  AgentSessionSummary,
  AppSettings,
  Area,
  AreaNote,
  ChatThread,
  Citation,
  ClaudeSession,
  CoachRequest,
  DashboardData,
  DashboardLayout,
  DocLanguage,
  DumpItem,
  FilingProposal,
  FilingResult,
  GardenerDiscardPlan,
  GardenerDiscardResult,
  GardenerFinding,
  GardenerFindingKind,
  GardenerReport,
  GardenerRunScope,
  GardenerRunTrigger,
  GardenerStageId,
  GardenerSupersedeResult,
  IngestJob,
  IngestKind,
  JournalDay,
  KnowledgeModule,
  LocalRuntimeStatus,
  MachineScanResult,
  ModelRef,
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
  RuntimePlan,
  Scope,
  SearchHit,
  SearchQuery,
  SettingsSnapshot,
  TaskDefinition,
  TaskKind,
  Todo,
  TranscriptPage,
  VaultDoc,
  VaultSettings,
  VaultStatus,
  WikiPage,
  WriteResult,
  SourceDetail,
} from './types';

/** Answer to a question asked of the Second Brain. */
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
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
  userData: string;
  /** Is the app running in demo mode on a sample vault? */
  demo: boolean;
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
   * Loose ends announced on this day that are still open (020, D5) — the
   * same `openLooseEnds()` the interview's follow-up and the maintenance
   * report already read, filtered to `day.date`. Reusing
   * `JournalInterviewLooseEnd` rather than a second shape keeps the id
   * (`loose-end:<id>`) identical to the one the dashboard and maintenance
   * screen already track this loose end under.
   */
  looseEnds: JournalInterviewLooseEnd[];
}

/**
 * The frontmatter fields of a journal day, as the day close-out suggests
 * them and as the user confirms them. `null` for mood and energy means "not
 * found" resp. "do not write" — never "set to null".
 */
export interface JournalFrontmatterFields {
  people: string[];
  /** Project slugs. */
  projects: string[];
  mood: number | null;
  energy: number | null;
  tags: string[];
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
 * The day close-out's suggestion. Nothing from it is written yet: the card
 * shows it, `journal:applyClose` carries out what was confirmed.
 */
export interface JournalCloseSuggestion {
  date: string;
  path: string;
  /** Same shape as in the inbox — the same card, the same buttons. */
  proposal: FilingProposal;
  frontmatter: JournalFrontmatterFields;
  /** Produced entirely without a model. */
  heuristic: boolean;
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
  /** Day close-out: extract facts, todos, and mood as suggestions. */
  'journal:close': { req: { date: string }; res: JournalCloseSuggestion | null };
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

  // ── Asking questions ─────────────────────────────────────────────────────
  /** Question to the Second Brain; answer streams over `event:llm-stream`. */
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
    req: { kind: IngestKind; input: string; module?: string | null };
    res: IngestJob;
  };
  'ingest:jobs': { req: void; res: IngestJob[] };
  'ingest:cancel': { req: { id: string }; res: void };
  'ingest:retry': { req: { id: string }; res: IngestJob };
  /** Condense a raw source that already exists, including one from an earlier session. */
  'ingest:condense': { req: { path: string; module: string }; res: IngestJob };
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
   * Status of the Ollama runtime specifically (019c): whether it's running,
   * installed but stopped, or absent. Feeds the guided "get a local runtime"
   * flow — distinct from `llm:detectLocal`'s multi-preset running check.
   */
  'llm:localRuntimeStatus': { req: void; res: LocalRuntimeStatus };
  /**
   * The precondition judgement for an in-app runtime install (019c, D2): size,
   * where the installer would land, where models would end up. A plain read
   * with no side effect — the same shape as `llm:scanMachine` — so the
   * confirmation dialog can show real numbers before anything downloads.
   */
  'llm:runtimeInstallPlan': { req: void; res: RuntimePlan };
  /**
   * Starts the installer download after the user has confirmed the plan from
   * `llm:runtimeInstallPlan`. Takes no request payload: what to fetch and
   * where to put it both come from the plan, not from anything the renderer
   * supplies. Progress and completion arrive over `event:install-progress`,
   * keyed by the returned `downloadId` — the same run/report split
   * `journal:coach`/`event:llm-stream` uses for a streamed operation. Throws
   * (closed `IpcError` code `invalid`) instead of starting a download if the
   * plan turns out blocked at this moment (a race with `llm:scanMachine`,
   * e.g. disk filled up between reading the plan and confirming it) — by the
   * time this channel is called, the renderer has already shown the plan and
   * only offers the button when `canInstall` was true.
   */
  'llm:downloadRuntime': { req: void; res: { downloadId: string } };
  /** Cancels a running installer download; an unknown id changes nothing. */
  'llm:cancelRuntimeDownload': { req: { downloadId: string }; res: void };
  /**
   * Opens the installer file the most recently *completed* `llm:downloadRuntime`
   * run produced, in its OS default handler (019c, D3) — so the user doesn't
   * have to go find the file themselves. No request payload: the handler
   * tracks the last completed download's path itself, the same way
   * `llm:downloadRuntime` already tracks its running downloads — it never
   * trusts a filesystem path the renderer might supply. `shell.openPath` never
   * throws; a non-empty return is the OS's own human-readable failure reason,
   * carried through as `reason` (this is OS/installer-path info, not vault
   * content, so it's fine to surface as-is). `reason: 'no-installer-downloaded'`
   * if no download has completed yet this run.
   */
  'llm:openRuntimeInstaller': { req: void; res: { opened: boolean; reason?: string } };
  /**
   * Starts `ollama serve` detached, so it keeps running after this call
   * returns, then polls the same detection `llm:localRuntimeStatus` uses
   * until it reports `'running'` or a few seconds pass (019c, D3) — the
   * "start it for me" step once the runtime is installed but not running.
   * `reason` is closed: `'timeout'` if the server never answered in time,
   * `'spawn-failed'` if the `ollama` binary itself couldn't be started (e.g.
   * a race with an uninstall) — never a thrown error either way.
   */
  'llm:startLocalRuntime': {
    req: void;
    res: { started: boolean; status: LocalRuntimeStatus; reason?: 'timeout' | 'spawn-failed' };
  };
  /**
   * Pulls a model into the local Ollama runtime (019c, D4) — the last step of
   * the guided flow, once a runtime is running but empty. Returns immediately
   * with a `pullId`; the pull itself runs on in the background and reports over
   * `event:pull-progress`, the same run/report split `llm:downloadRuntime`
   * uses. Throws (closed code `invalid`) on an empty model id, nothing else:
   * an unreachable runtime or a model Ollama doesn't know surfaces as a
   * closing event with an `error`, not as a rejected call.
   */
  'llm:pullModel': { req: { modelId: string }; res: { pullId: string } };
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
  'gardener:runStatus': { req: void; res: IpcEvents['event:gardener-progress'] | null };
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
  'llm:pullModel',
  'llm:cancelPull',
  'llm:tasks',
  'llm:routing',
  'llm:setRoute',
  'llm:setDefault',
  'llm:suggestRouting',
  'llm:testTask',
  'llm:scanMachine',
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
  'claude:sessions',
  'claude:link',
  'agents:projects',
  'agents:sessions',
  'agents:transcript',
  'agents:link',
  'settings:get',
  'settings:setApp',
  'settings:setVault',
  'settings:setLanguages',
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:isMaximized',
  'window:show',
  'shell:openPath',
  'shell:openExternal',
  'shell:showInFolder',
  'app:info',
];

/** Events that main sends to the renderer. */
export interface IpcEvents {
  /** A file in the vault has changed (including from outside the app). */
  'event:vault-changed': { paths: string[]; external: boolean };
  'event:index-progress': { done: number; total: number; indexing: boolean };
  'event:ingest-progress': IngestJob;
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
   * Progress of a maintenance run. `check` is the check currently running;
   * `null` means either a model stage (`phase: 'audit'` or `'loose-ends'`) or
   * the end. The run can be cancelled via `gardener:cancel` — so progress here
   * isn't decoration, it's the basis for deciding whether to cancel.
   *
   * `phase`, `check`, `done`, `total` are the original, flat-count fields —
   * kept unchanged so nothing downstream breaks mid-story. `stage`, `percent`,
   * `remaining`, `startedAt`, `trigger` are the weighted view (021a, D1): the
   * ten mechanical checks together count as little as one model stage's
   * fraction, so the bar doesn't jump to ~83% before the slow part even
   * starts. See `@core/gardener/progress` for the weight math.
   */
  'event:gardener-progress': {
    phase: 'checks' | 'audit' | 'loose-ends' | 'done';
    check: GardenerFindingKind | null;
    done: number;
    total: number;
    running: boolean;
    /** The stage this event belongs to, per the weighted stage plan. */
    stage: GardenerStageId | 'done';
    /** 0..100, the cumulative weighted progress. */
    percent: number;
    /** Stages not yet started, in plan order. */
    remaining: GardenerStageId[];
    /** When this run started — ISO timestamp, same convention as `ranAt`. */
    startedAt: string;
    /** Who asked for this run. */
    trigger: GardenerRunTrigger;
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
}

export type IpcEventName = keyof IpcEvents;

export const IPC_EVENTS: readonly IpcEventName[] = [
  'event:vault-changed',
  'event:index-progress',
  'event:ingest-progress',
  'event:llm-stream',
  'event:gardener-progress',
  'event:install-progress',
  'event:pull-progress',
  'event:reminder',
  'event:toast',
  'event:capture-focus',
  'event:vault-status',
  'event:settings',
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
    | 'unknown';
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
