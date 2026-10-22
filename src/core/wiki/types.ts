/**
 * Der Vertrag des Wissens-Kerns.
 *
 * Ein Modul ist ein Karpathy-Wiki (docs/MODULE-SCHEMA.md): Quellen werden **einmal**
 * verdichtet, Seiten wachsen zusammen, Widersprueche bleiben stehen und werden
 * benannt. Alles hier beschreibt nur, *was* dieser Kern von aussen braucht — Store
 * und Index kommen als schmale Sichten herein, damit der Kern ohne Dateisystem und
 * ohne Indexdienst testbar bleibt.
 */

import type {
  Citation,
  DocLanguage,
  KnowledgeModule,
  ModelRef,
  SearchHit,
  SearchQuery,
  VaultDoc,
  WikiPage,
  WikiPageType,
  WriteResult,
} from '@shared/types';
import type { IndexedDoc, PassageHit } from '@core/index/types';
import type { LlmGateway } from '@core/llm';
import type { DateLike } from '@core/vault/paths';
import type { DeleteResult } from '@core/vault/types';

/** Ein Schreibvorgang mit Konfliktschutz. Untermenge von `WriteInput` aus `core/vault`. */
export interface WikiWriteInput {
  path: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  expectedHash?: string;
}

/**
 * Was der Wissens-Kern am Store braucht. `VaultStore` erfuellt es strukturell;
 * Tests reichen `MemoryVaultStore` herein.
 */
export interface WikiStore {
  read(path: string): Promise<VaultDoc | null>;
  readText(path: string): Promise<string | null>;
  write(input: WikiWriteInput): Promise<WriteResult>;
  writeText(
    path: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<WriteResult>;
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string; frontmatterIfNew?: Record<string, unknown> },
  ): Promise<{ path: string; hash: string }>;
  exists(path: string): Promise<boolean>;
}

/**
 * What a transaction (`transaction.ts`) needs on top of that: the vault's trash.
 * Taking back a page this run created means `delete` — a copy into
 * `.secondbrain/trash/` plus a mark, never a permanent removal. `VaultStore`
 * satisfies this structurally, `MemoryVaultStore` too, so no caller and no
 * fixture has to hand in anything new.
 */
export interface WikiTxStore extends WikiStore {
  delete(path: string): Promise<DeleteResult>;
}

/**
 * Was der Wissens-Kern am Index braucht. `IndexService` erfuellt es strukturell.
 * Nur Lesen: der Index ist abgeleitet und wird hier nie fortgeschrieben.
 */
export interface WikiIndexView {
  index(): { docs: readonly IndexedDoc[]; byPath: ReadonlyMap<string, IndexedDoc> };
  search(query: SearchQuery): SearchHit[];
  /** Matching passages with their file lines, not collapsed per file (053). */
  searchPassages(query: SearchQuery): PassageHit[];
  pages(): readonly WikiPage[];
  modules(): readonly KnowledgeModule[];
}

/** Gemeinsame Optionen aller schreibenden Ablaeufe. */
export interface WikiOptions {
  /** Sprache, in der Seiten geschrieben werden. */
  docLanguage?: DocLanguage;
  /**
   * Fremdsprachige Quellen beim Verdichten in die Dokumentsprache uebersetzen
   * (Einstellung `languages.translateSources`). Vorgabe `true`. Aus heisst: die
   * Verdichtung bleibt in der Sprache der Quelle — nur die Abschnitts-Ueberschriften
   * stehen weiter in der Dokumentsprache, weil sie zum Vault-Format gehoeren.
   */
  translateSources?: boolean;
  /** Das „jetzt". Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** Alles, was Ingest, Frage und Zurueckschreiben brauchen. */
export interface WikiDeps extends WikiOptions {
  store: WikiStore;
  index: WikiIndexView;
  gateway: LlmGateway;
  /**
   * Fortschritt einer Verdichtung, 0..1, streng steigend. Fragen und
   * Zurueckschreiben rufen das nie auf — nur `condenseSource`/`ingestSource`
   * bewegen damit den Balken, statt ihn bis zum Ende stillstehen zu lassen
   * (Story 050, D7). Wie der Aufrufer die Zahl weiterreicht, ist seine Sache.
   */
  onProgress?: (progress: number) => void;
}

/**
 * What a digestion needs on top of that: a store with the vault's trash.
 * `ingestSource` writes through a `WikiTransaction`, and taking back a page this
 * run created is a `delete` — so the store underneath has to offer one.
 * `VaultStore` and `MemoryVaultStore` both satisfy it structurally, so no caller
 * and no fixture has to hand in anything new.
 */
export interface WikiIngestDeps extends WikiDeps {
  store: WikiTxStore;
}

/** Eine Seite, wie der Kern sie beim Suchen und Schreiben identifiziert. */
export interface PageRef {
  /** Vault-relativer Pfad. */
  path: string;
  module: string;
  slug: string;
  type: WikiPageType;
  title: string;
}

/** Ein benannter Widerspruch. Er wird gemeldet, nicht geglaettet. */
export interface WikiContradiction {
  /** Seite, der widersprochen wird (`modul/slug` oder Slug). */
  page: string;
  /** Source-Seite, aus der der Widerspruch kommt. */
  source: string;
  /** Ein Satz: worin der Konflikt besteht. */
  note: string;
}

/** Ergebnis eines Ingests. `usedLlm: false` heisst: Rohquelle eingetragen, unverdichtet. */
export interface WikiIngestResult {
  module: string;
  /** Pfad der Source-Seite. */
  sourcePage: string;
  /** Slug der Source-Seite (`s-YYYY-MM-DD-…`). */
  sourceSlug: string;
  /** Alle geschriebenen oder ergaenzten Dateien, Source-Seite eingeschlossen. */
  touchedPages: string[];
  /** Seiten, die neu entstanden sind. */
  createdPages: string[];
  contradictions: WikiContradiction[];
  /** Hat ein Modell verdichtet? */
  usedLlm: boolean;
  /** Modell, das verdichtet hat. */
  model: ModelRef | null;
}

/** Ein Ausschnitt, mit dem eine Antwort belegt werden kann — wortwoertlich aus der Datei. */
export interface WikiExcerpt {
  path: string;
  title: string;
  /** Modul-Slug bei Wiki-Seiten, sonst null. */
  module: string | null;
  /** Wortwoertlicher Text aus der Datei, mehrere Zeilen moeglich. */
  quote: string;
  /** 1-basierte Zeilennummer der ersten Zitatzeile in der Datei. */
  line: number;
  /** Relevanz aus der Suche, 0..1. */
  score: number;
}

/** Antwort auf eine Frage — mit Belegen oder mit ehrlicher Absage. */
export interface WikiAnswer {
  question: string;
  /** Der Antworttext. Nie leer: ohne Beleg steht hier die Absage. */
  answer: string;
  /** Gegen die Dateien geprueft. Ein nicht auffindbares Zitat ist hier nicht drin. */
  citations: Citation[];
  /** Die Ausschnitte, die dem Modell vorlagen. */
  excerpts: WikiExcerpt[];
  /** Antwort ohne tragfaehigen Beleg — die Oberflaeche sagt das ausdruecklich. */
  unsupported: boolean;
  usedLlm: boolean;
  model: ModelRef | null;
}

/** Fehler des Wissens-Kerns. `code` entspricht `IpcError.code`. */
export class WikiError extends Error {
  readonly code: 'not-found' | 'invalid' | 'conflict';

  constructor(code: 'not-found' | 'invalid' | 'conflict', message: string) {
    super(message);
    this.name = 'WikiError';
    this.code = code;
  }
}
