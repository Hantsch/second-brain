/* The seams between shell and core.

   Here the shell describes only *what* it needs from the core — as narrow
   subsets of the core contracts. `core/vault`'s `VaultStore` and a gateway from
   `core/llm` fulfill them structurally; they're wired in via `services.attach*`
   in `src/main/core-bridge.ts`. If a part is missing, the app stays usable and
   says so honestly. */

import type { IndexStats, WriteRequest } from '@shared/ipc';
import type {
  Area,
  DumpItem,
  JournalDay,
  KnowledgeModule,
  Project,
  ProviderConfig,
  ProviderPreset,
  RawSource,
  RecommendationSet,
  Routing,
  SearchHit,
  SearchQuery,
  TaskDefinition,
  TaskKind,
  Todo,
  VaultDoc,
  WikiPage,
  WriteResult,
} from '@shared/types';

/** What the shell knows about a path in the vault, without reading it. */
export interface VaultEntry {
  path: string;
  size: number;
  dir: boolean;
}

/** Subset of `core/vault`'s `VaultStore` — only what the IPC channels need. */
export interface VaultStoreLike {
  readonly root: string;
  read(path: string): Promise<VaultDoc | null>;
  write(input: WriteRequest): Promise<WriteResult>;
  /** Create new; if the file already exists, this is a conflict. */
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
  /** Read raw text (logs, JSON); `null` if the file doesn't exist. */
  readText(path: string): Promise<string | null>;
  /** Write raw text — for anything that isn't Markdown with frontmatter. */
  writeText(path: string, content: string): Promise<WriteResult>;
  /**
   * Append under a section heading. If the section is missing, it's created at
   * the end; frontmatter stays untouched. This is the write path for filing —
   * a dump never travels into a foreign file via `write`.
   */
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<{ path: string; hash: string }>;
  exists(path: string): Promise<boolean>;
  /** Copies the file's current state into the trash without touching it; `null` if there is no file. */
  snapshot(path: string): Promise<string | null>;
  /** Creates a directory (recursive, idempotent). */
  mkdir(dir: string): Promise<void>;
  delete(path: string): Promise<{ path: string; undoToken: string }>;
  /** Restores what's in the trash under this marker. Returns the paths. */
  undo(token: string): Promise<string[]>;
  walk(options?: {
    dir?: string;
    /** Only files with this extension, including the dot (`.md`). */
    ext?: string;
    recursive?: boolean;
    includeDirs?: boolean;
  }): AsyncIterable<VaultEntry>;
}

/** Progress of an index run. */
export type IndexProgress = (done: number, total: number) => void;

/**
 * The derived lists of the index. They're optional because an index without
 * them can still search and count: if they're missing, the affected channels
 * honestly say they can't deliver anything — instead of claiming an empty list.
 */
export interface IndexListsLike {
  projects(): readonly Project[];
  areas(): readonly Area[];
  todos(): readonly Todo[];
  pages(): readonly WikiPage[];
  sources(): readonly RawSource[];
  dumps(): readonly DumpItem[];
  journal(): readonly JournalDay[];
  modules(): readonly KnowledgeModule[];
}

/** What the shell uses from an index (subset of `core/index`). */
export interface IndexLike extends Partial<IndexListsLike> {
  stats(): IndexStats | Promise<IndexStats>;
  rebuild(onProgress?: IndexProgress): Promise<IndexStats>;
  search(query: SearchQuery): SearchHit[] | Promise<SearchHit[]>;
  /**
   * After external changes: re-read the affected paths. Without paths, the
   * index catches up regardless — needed by anyone who hasn't changed files
   * but the computation basis itself (e.g. external work traces).
   */
  refresh?(paths?: readonly string[]): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

/** What the shell uses from the LLM layer (subset of `core/llm`). */
export interface LlmBridge {
  /** Task catalog from `core/llm/tasks`. */
  tasks(): readonly TaskDefinition[];
  presets(): readonly ProviderPreset[];
  probe(providerId: string): Promise<ProviderConfig>;
  models(providerId: string): Promise<string[]>;
  testTask(task: TaskKind): Promise<{
    ok: boolean;
    latencyMs: number;
    sample: string;
    error?: string;
  }>;
  suggestRouting(): Routing | Promise<Routing>;
  recommendModels(): RecommendationSet | Promise<RecommendationSet>;
}

/** Watches the vault (subset of `core/vault/watch`). */
export interface VaultWatcherLike {
  dispose(): void | Promise<void>;
}

export type VaultStoreFactory = (root: string) => VaultStoreLike | Promise<VaultStoreLike>;

export type IndexFactory = (root: string, store: VaultStoreLike) => IndexLike | Promise<IndexLike>;

export type VaultWatcherFactory = (
  root: string,
  onChange: (paths: string[], external: boolean) => void,
) => VaultWatcherLike | Promise<VaultWatcherLike>;
