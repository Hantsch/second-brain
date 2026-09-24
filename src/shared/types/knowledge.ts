/* Wissens-Module (Karpathy-Wiki), Suche, Chat und Ingest. */

import type { BaseFrontmatter, DocType, Scope } from './vault';

export type WikiPageType = 'source' | 'entity' | 'concept' | 'overview';

export interface WikiFrontmatter extends BaseFrontmatter {
  type: WikiPageType;
  /** Modul-Slug, zu dem die Seite gehört. */
  module: string;
  /** Source-Seiten, die diese Seite belegen (`s-...`-Slugs). */
  sources?: string[];
  /** Zeitpunkt des letzten Pflegelaufs über diese Seite. */
  reviewed?: string;
}

/** Ein Wissens-Modul ist ein eigenes kleines Wiki unter `modules/<slug>/`. */
export interface KnowledgeModule {
  slug: string;
  title: string;
  description: string;
  created: string;
  updated: string;
  counts: { sources: number; entities: number; concepts: number };
  /** Offene Pflege-Befunde in diesem Modul. */
  findingCount: number;
  /** Letzter Ingest, ISO. */
  lastIngest: string | null;
  tags: string[];
}

export interface WikiPage {
  path: string;
  module: string;
  slug: string;
  title: string;
  type: WikiPageType;
  created: string;
  updated: string;
  tags: string[];
  sources: string[];
  /** Wikilinks, die von dieser Seite ausgehen. */
  outbound: string[];
  /** Seiten, die hierher verlinken. */
  inbound: string[];
  excerpt: string;
  wordCount: number;
}

/**
 * Warum eine Rohquelle nichts zum Verdichten hergibt. Ein string union statt
 * einer youtube-spezifischen Markierung: Story 064 füllt dasselbe Feld mit
 * eigenen Gründen — dieser union bekommt dann weitere Mitglieder, ohne dass
 * `RawSource.blocked` selbst sich ändert.
 */
export type SourceBlockReason = 'no-transcript';

/** Eine Rohquelle unter `raw/` — unveränderlich, Fixpunkt aller Zitate. */
export interface RawSource {
  /** Ordner oder Datei relativ zur Vault-Wurzel. */
  path: string;
  title: string;
  kind: 'youtube' | 'file' | 'url' | 'text' | 'bundle';
  ingestedAt: string;
  /** Slug der zugehörigen Wiki-Source-Seite, falls schon verdichtet. */
  sourcePage: string | null;
  /** Originalherkunft: URL oder Ursprungspfad. */
  origin: string | null;
  bytes: number;
  /** Zu welchen Modulen die Quelle verdichtet wurde. */
  modules: string[];
  /**
   * Warum die Quelle nichts zum Verdichten hergibt, oder `null` wenn sie es
   * tut (bzw. ein legacy-Protokoll ohne diese Information keine Aussage
   * erlaubt). Nur youtube-Quellen kennen bislang einen Grund.
   */
  blocked: SourceBlockReason | null;
}

/** A URL found while checking a YouTube video for downloadable resources. */
export interface SourceResourceLink {
  url: string;
  /** Context from the description, when it provides a useful label. */
  label: string | null;
}

/** A workflow, model, file, repository, or other resource mentioned by a video. */
export interface SourceResourceMention {
  name: string;
  /** The evidence from the transcript or description, kept short. */
  mention: string;
  location: 'video' | 'description';
  /** Timecode such as `12:34`, only when the transcript supports it. */
  timestamp: string | null;
  /** Description links that plausibly lead to this resource. */
  links: SourceResourceLink[];
}

/** Persistent result of the resource check performed during YouTube condensation. */
export interface SourceResourceReport {
  generatedAt: string;
  /** True only if a model inspected the transcript, not merely the description links. */
  analyzedWithModel: boolean;
  model: string | null;
  resources: SourceResourceMention[];
  /** Every description link remains visible, even when it could not be matched safely. */
  descriptionLinks: SourceResourceLink[];
}

/** A file manually supplied for a source, stored below its `sources/` directory. */
export interface SourceAttachment {
  name: string;
  path: string;
  bytes: number | null;
  directory: boolean;
}

/** Everything the source detail window needs in one read. */
export interface SourceDetail {
  source: RawSource;
  resourceReport: SourceResourceReport | null;
  attachments: SourceAttachment[];
}

export interface SearchHit {
  path: string;
  title: string;
  docType: DocType;
  /** Modul-Slug bei Wiki-Seiten. */
  module: string | null;
  /** Relevanz 0..1, normalisiert. */
  score: number;
  /** Textstelle mit Trefferkontext, Fundstellen mit `**` markiert. */
  snippet: string;
  updated: string;
  tags: string[];
}

export interface SearchQuery {
  text: string;
  /** Auf Dokumenttypen einschränken. */
  types?: DocType[];
  /** Auf ein Modul einschränken. */
  module?: string;
  /** Auf Arbeit oder Privat einschränken. */
  scope?: Scope;
  tags?: string[];
  /** Nur Dokumente ab diesem Datum. */
  since?: string;
  limit?: number;
}

/** Eine Fundstelle, mit der eine Antwort belegt ist. */
export interface Citation {
  path: string;
  title: string;
  /** Zitierter Ausschnitt, wortwörtlich aus der Datei. */
  quote: string;
  /** Zeilennummer des Zitatanfangs, wenn bestimmbar. */
  line: number | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  at: string;
  citations?: Citation[];
  /** Welches Modell geantwortet hat — Transparenz über die Route. */
  model?: string;
  /** Antwort ohne Belege: die App sagt es, statt zu raten. */
  unsupported?: boolean;
}

export type ChatKind =
  /** Frage an Gaston, Antwort nur aus Belegen. */
  | 'ask'
  /** Tagebuch-/Coaching-Gespräch. */
  | 'journal'
  /** Freies Gespräch über ein Modul. */
  | 'module';

export interface ChatThread {
  id: string;
  kind: ChatKind;
  title: string;
  created: string;
  updated: string;
  messages: ChatMessage[];
  /** Bei `module`: Modul-Slug. Bei `journal`: Datum. */
  context: string | null;
}

export type IngestKind = 'youtube' | 'file' | 'url' | 'text';

export type IngestStage =
  | 'queued'
  | 'fetching'
  | 'writing-raw'
  | 'summarizing'
  | 'wiki-update'
  | 'indexing'
  | 'done'
  | 'error'
  /** The exact source already exists; no second raw source was written. */
  | 'duplicate'
  /** Rohquelle liegt, aber der Verdichtungsschritt braucht ein LLM. */
  | 'awaiting-llm'
  /**
   * The raw source is filed, but it holds nothing to distill — a video without a
   * transcript, a PDF that isn't read. Terminal and honest: no model can turn an
   * empty source into content, so this is neither `awaiting-llm` nor an `error`.
   * `job.message` carries the reason as an `IngestNoteCode`.
   */
  | 'no-content';

export interface IngestJob {
  id: string;
  kind: IngestKind;
  /** URL, Dateipfad oder Kurztext. */
  input: string;
  label: string;
  /** Zielmodul, oder null für „später einordnen". */
  module: string | null;
  stage: IngestStage;
  progress: number;
  message: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** Angelegte Rohquelle. */
  rawPath: string | null;
  /** Geschriebene bzw. geänderte Wiki-Seiten. */
  touchedPages: string[];
  /** Existing raw path when duplicate detection stopped this import. */
  duplicateOf?: string | null;
  /** What the condensed page is built from. Undefined behaves as `'transcript'`. */
  basis?: 'transcript' | 'metadata';
}
