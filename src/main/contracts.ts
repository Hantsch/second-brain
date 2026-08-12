/* Die Nahtstellen zwischen Shell und Kern.

   Die Shell beschreibt hier nur, *was* sie vom Kern braucht — als schmale
   Untermengen der Kern-Verträge. `core/vault`'s `VaultStore` und ein Gateway aus
   `core/llm` erfüllen sie strukturell; eingehängt werden sie über
   `services.attach*` in `src/main/core-bridge.ts`. Fehlt ein Teil, bleibt die
   App benutzbar und sagt es ehrlich. */

import type { IndexStats, WriteRequest } from '@shared/ipc';
import type {
  DumpItem,
  JournalDay,
  KnowledgeModule,
  Project,
  ProviderConfig,
  ProviderPreset,
  RawSource,
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

/** Was die Shell an einem Pfad im Vault weiß, ohne ihn zu lesen. */
export interface VaultEntry {
  path: string;
  size: number;
  dir: boolean;
}

/** Untermenge von `core/vault`'s `VaultStore` — nur was die IPC-Kanäle brauchen. */
export interface VaultStoreLike {
  readonly root: string;
  read(path: string): Promise<VaultDoc | null>;
  write(input: WriteRequest): Promise<WriteResult>;
  /** Neu anlegen; existiert die Datei schon, gibt es einen Konflikt. */
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
  /** Rohen Text lesen (Protokolle, JSON); `null`, wenn es die Datei nicht gibt. */
  readText(path: string): Promise<string | null>;
  /** Rohen Text schreiben — für alles, was kein Markdown mit Frontmatter ist. */
  writeText(path: string, content: string): Promise<WriteResult>;
  /**
   * Unter einer Abschnitts-Überschrift anhängen. Fehlt der Abschnitt, wird er am
   * Ende angelegt; Frontmatter bleibt unberührt. Das ist der Schreibweg des
   * Ablegens — ein Dump wandert nie über `write` in eine fremde Datei.
   */
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<{ path: string; hash: string }>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<{ path: string; undoToken: string }>;
  /** Nimmt zurück, was unter dieser Marke im Papierkorb liegt. Gibt die Pfade zurück. */
  undo(token: string): Promise<string[]>;
  walk(options?: {
    dir?: string;
    /** Nur Dateien mit dieser Endung, inklusive Punkt (`.md`). */
    ext?: string;
    recursive?: boolean;
    includeDirs?: boolean;
  }): AsyncIterable<VaultEntry>;
}

/** Fortschritt eines Indexlaufs. */
export type IndexProgress = (done: number, total: number) => void;

/**
 * Die abgeleiteten Listen des Index. Sie sind optional, weil ein Index ohne sie
 * immer noch suchen und zählen kann: fehlen sie, sagen die betroffenen Kanäle
 * ehrlich, dass sie nichts liefern können — statt eine leere Liste zu behaupten.
 */
export interface IndexListsLike {
  projects(): readonly Project[];
  todos(): readonly Todo[];
  pages(): readonly WikiPage[];
  sources(): readonly RawSource[];
  dumps(): readonly DumpItem[];
  journal(): readonly JournalDay[];
  modules(): readonly KnowledgeModule[];
}

/** Was die Shell an einem Index benutzt (Untermenge von `core/index`). */
export interface IndexLike extends Partial<IndexListsLike> {
  stats(): IndexStats | Promise<IndexStats>;
  rebuild(onProgress?: IndexProgress): Promise<IndexStats>;
  search(query: SearchQuery): SearchHit[] | Promise<SearchHit[]>;
  /**
   * Nach externen Änderungen: betroffene Pfade neu einlesen. Ohne Pfade zieht
   * der Index in jedem Fall nach — das braucht, wer nicht Dateien geändert hat,
   * sondern die Rechengrundlage (etwa die Arbeitsspuren von außen).
   */
  refresh?(paths?: readonly string[]): void | Promise<void>;
  dispose?(): void | Promise<void>;
}

/** Was die Shell an der LLM-Schicht benutzt (Untermenge von `core/llm`). */
export interface LlmBridge {
  /** Aufgabenkatalog aus `core/llm/tasks`. */
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
}

/** Beobachtet den Vault (Untermenge von `core/vault/watch`). */
export interface VaultWatcherLike {
  dispose(): void | Promise<void>;
}

export type VaultStoreFactory = (root: string) => VaultStoreLike | Promise<VaultStoreLike>;

export type IndexFactory = (root: string, store: VaultStoreLike) => IndexLike | Promise<IndexLike>;

export type VaultWatcherFactory = (
  root: string,
  onChange: (paths: string[], external: boolean) => void,
) => VaultWatcherLike | Promise<VaultWatcherLike>;
