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
  AppSettings,
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
  GardenerFinding,
  GardenerFindingKind,
  GardenerReport,
  IngestJob,
  IngestKind,
  JournalDay,
  KnowledgeModule,
  ModelRef,
  Project,
  ProjectFrontmatter,
  ProjectStatus,
  ProposedTodo,
  ProviderConfig,
  ProviderKind,
  ProviderPreset,
  RawSource,
  Reminder,
  Routing,
  Scope,
  SearchHit,
  SearchQuery,
  SettingsSnapshot,
  TaskDefinition,
  TaskKind,
  Todo,
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

/** One round of the coaching dialogue, as it appears in the journal entry. */
export interface JournalTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Time 'HH:MM' from the speaker line; `null` when there is none. */
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
  /** Rounds of the "Conversation" section, oldest first. */
  turns: JournalTurn[];
  /** The "Facts" section, verbatim as it is in the file. */
  facts: string;
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
    req: { slug: string; patch: Partial<ProjectFrontmatter>; expectedHash?: string };
    res: Project;
  };
  'projects:append': {
    req: { slug: string; section: string; content: string };
    res: WriteResult;
  };
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

  // ── Todos ────────────────────────────────────────────────────────────────
  'todos:list': {
    req: { scope?: Scope; project?: string; open?: boolean; dueBefore?: string };
    res: Todo[];
  };
  'todos:toggle': { req: { id: string }; res: Todo };
  'todos:create': {
    req: {
      text: string;
      scope: Scope;
      project?: string | null;
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
    req: { question: string; threadId?: string; module?: string | null; scope?: Scope | null };
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

  // ── Dashboard, reminders, maintenance ────────────────────────────────────
  'dashboard:data': { req: void; res: DashboardData };
  'dashboard:layout': { req: void; res: DashboardLayout };
  'dashboard:setLayout': { req: { layout: DashboardLayout }; res: DashboardLayout };
  'reminders:list': { req: void; res: Reminder[] };
  'reminders:snooze': { req: { id: string; days: number }; res: void };
  /** Lift a snooze — the way back to `reminders:snooze`, otherwise there would be none. */
  'reminders:unsnooze': { req: { id: string }; res: void };
  'gardener:report': { req: void; res: GardenerReport | null };
  'gardener:run': { req: { useLlm?: boolean }; res: GardenerReport };
  /** Cancels a running maintenance pass; without a running pass, nothing happens. */
  'gardener:cancel': { req: void; res: void };
  'gardener:dismiss': { req: { id: string }; res: void };
  /** Undo "looks fine": the finding counts again — and again against health. */
  'gardener:undismiss': { req: { id: string }; res: void };
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

  // ── Claude sessions ──────────────────────────────────────────────────────
  'claude:sessions': { req: { limit?: number }; res: ClaudeSession[] };
  'claude:link': { req: { sessionId: string; project: string }; res: void };

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
  'projects:suggestStatus',
  'projects:resolveWaiting',
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
  'journal:coach',
  'journal:abort',
  'journal:close',
  'journal:applyClose',
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
  'llm:tasks',
  'llm:routing',
  'llm:setRoute',
  'llm:setDefault',
  'llm:suggestRouting',
  'llm:testTask',
  'dashboard:data',
  'dashboard:layout',
  'dashboard:setLayout',
  'reminders:list',
  'reminders:snooze',
  'reminders:unsnooze',
  'gardener:report',
  'gardener:run',
  'gardener:cancel',
  'gardener:dismiss',
  'gardener:undismiss',
  'gardener:applyFix',
  'gardener:undoFix',
  'claude:sessions',
  'claude:link',
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
   * `null` means either the model interpretation (`phase: 'audit'`) or the
   * end. The run can be cancelled via `gardener:cancel` — so progress here
   * isn't decoration, it's the basis for deciding whether to cancel.
   */
  'event:gardener-progress': {
    phase: 'checks' | 'audit' | 'done';
    check: GardenerFindingKind | null;
    done: number;
    total: number;
    running: boolean;
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
