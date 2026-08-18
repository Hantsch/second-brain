/**
 * Der Vertrag des Index. Alles hier ist **abgeleitet**: `.secondbrain/index/` darf
 * jederzeit geloescht werden, der Index baut sich aus den Dateien wieder auf.
 *
 * Deshalb gilt: kein Feld, das nicht aus einer Vault-Datei folgt. Was der Nutzer
 * geschrieben hat, steht in der Datei — hier steht nur, was daraus berechnet wurde.
 */

import type { AsPlainObject } from 'minisearch';
import type { Area, DocType, Project, RawSource, Scope, Todo, WikiPage } from '@shared/types';

/**
 * Eine indizierte Markdown-Datei.
 *
 * `updated` ist die mtime der Datei, nicht das Frontmatter-Feld `updated`: extern
 * editierte Dateien sollen als frisch gelten (VAULT-FORMAT.md, „die mtime zaehlt").
 */
export interface IndexedDoc {
  /** Vault-relativer Pfad, immer mit '/'. Gleichzeitig die ID im Suchindex. */
  path: string;
  docType: DocType;
  title: string;
  tags: string[];
  /** Sprachcode aus dem Frontmatter, sonst null. */
  lang: string | null;
  /** mtime der Datei, ISO. Grundlage jeder „was war zuletzt"-Sortierung. */
  updated: string;
  /** sha256 des vollen Dateiinhalts — erkennt externe Aenderungen. */
  hash: string;
  size: number;
  /** Rumpf in Originalschreibung. Grundlage der Snippets. */
  body: string;
  /**
   * Derselbe Rumpf klein geschrieben — das Suchfeld. Wird beim Laden aus `body`
   * abgeleitet und deshalb nicht mitgespeichert.
   */
  text: string;
  /** Woerter im Rumpf, ohne Code-Blöcke. */
  words: number;
  /** 1-basierte Zeilennummer der ersten Rumpfzeile in der Datei. */
  bodyLine: number;
  /** Frontmatter, wie es in der Datei steht — unbekannte Felder eingeschlossen. */
  frontmatter: Record<string, unknown>;
  /** Modul-Slug bei allem unter `modules/<slug>/`. */
  module: string | null;
  /** Arbeit oder privat, soweit aus Pfad, Frontmatter oder Tag ableitbar. */
  scope: Scope | null;
  /** Projekt-Slug bei allem unter `projects/<scope>/<slug>/`. */
  project: string | null;
}

/** Ein Wikilink, der ins Nichts zeigt. Futter fuer den Pflegelauf. */
export interface BrokenLink {
  /** Seite, in der der Link steht (`modul/slug`). */
  from: string;
  /** Ziel, wie es in der Datei steht. */
  target: string;
  path: string;
}

/** Zaehlungen eines Wissens-Moduls, wie `KnowledgeModule.counts` sie braucht. */
export interface ModulePageCounts {
  sources: number;
  entities: number;
  concepts: number;
}

/**
 * Der vollstaendige abgeleitete Zustand eines Vaults. Reine Daten, keine Methoden —
 * damit er sich serialisieren und in Tests von Hand bauen laesst.
 */
export interface VaultIndex {
  docs: IndexedDoc[];
  todos: Todo[];
  projects: Project[];
  areas: Area[];
  pages: WikiPage[];
  sources: RawSource[];
  /** Modul-Slug → Seitenzahlen. */
  counts: Map<string, ModulePageCounts>;
  brokenLinks: BrokenLink[];
  /** Ende des letzten Laufs, ISO. */
  builtAt: string;
  /** Dauer des letzten Laufs in Millisekunden. */
  durationMs: number;
  /** Schneller Zugriff auf `docs` — dieselben Objekte, keine Kopien. */
  byPath: Map<string, IndexedDoc>;
}

/** Serialisierter MiniSearch-Zustand. Nur `search.ts` deutet ihn. */
export type SerializedSearch = AsPlainObject;

/** Was `IndexStore.load()` zurueckgibt: Daten plus Suchzustand. */
export interface StoredIndex {
  index: VaultIndex;
  /** null, wenn der Suchzustand fehlte oder nicht passte — dann neu aufbauen. */
  search: SerializedSearch | null;
}

/**
 * Ablage des Index. Bewusst schmal: laden, speichern, wegwerfen. Wer nicht laden
 * kann, bekommt `null` und baut neu — ein kaputter Index ist kein Fehlerfall.
 */
export interface IndexStore {
  load(): Promise<StoredIndex | null>;
  save(index: VaultIndex, search?: SerializedSearch | null): Promise<void>;
  clear(): Promise<void>;
}

/** Fortschritt eines Indexlaufs. Passt auf `IndexProgress` der Shell. */
export type IndexProgress = (done: number, total: number) => void;

/** Eine Arbeitsspur von aussen (Claude-Session, Journal) auf ein Projekt. */
export interface ExternalTouch {
  /** Zeitpunkt, ISO. */
  at: string;
  source: Project['lastTouchSource'];
}

/** Projekt-Slug → juengste Spur von aussen. */
export type ExternalTouches = ReadonlyMap<string, ExternalTouch>;

/** Ab so vielen Tagen ohne Spur gilt ein Projekt als stagnierend. */
export const DEFAULT_STALE_AFTER_DAYS = 14;

/** Hoechstzahl an Treffern, wenn die Anfrage keine nennt. */
export const DEFAULT_SEARCH_LIMIT = 20;

/** Laenge eines Snippets in Zeichen. */
export const SNIPPET_CHARS = 240;

/** Ein leerer Index — der ehrliche Zustand, solange nichts gelesen wurde. */
export function emptyIndex(builtAt = new Date().toISOString()): VaultIndex {
  return {
    docs: [],
    todos: [],
    projects: [],
    areas: [],
    pages: [],
    sources: [],
    counts: new Map(),
    brokenLinks: [],
    builtAt,
    durationMs: 0,
    byPath: new Map(),
  };
}
