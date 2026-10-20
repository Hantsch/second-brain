/* Vault-Struktur und Dokument-Grundformen.
   Die Dateien sind die Wahrheit — jeder Typ hier beschreibt, was auf der Platte liegt. */

/** Ordner erster Ordnung im Vault. Relativ zur Vault-Wurzel. */
export const VAULT_DIRS = {
  inbox: 'inbox',
  journal: 'journal',
  projects: 'projects',
  areas: 'areas',
  modules: 'modules',
  raw: 'raw',
  internal: '.secondbrain',
} as const;

/** Unterordner von `.secondbrain/` — alles hier ist aus den Dateien ableitbar. */
export const INTERNAL_DIRS = {
  index: '.secondbrain/index',
  chats: '.secondbrain/chats',
  logs: '.secondbrain/logs',
  trash: '.secondbrain/trash',
} as const;

export const VAULT_SETTINGS_FILE = '.secondbrain/settings.json';
export const VAULT_MARKER_FILE = '.secondbrain/vault.json';

/** Was für ein Dokument eine Markdown-Datei ist. Steht im Frontmatter als `type`. */
export type DocType =
  | 'dump'
  | 'note'
  | 'project'
  | 'area'
  | 'condensed'
  | 'journal'
  | 'source'
  | 'entity'
  | 'concept'
  | 'overview'
  | 'raw';

/**
 * Alle Mitglieder von `DocType`, zur Laufzeit erreichbar. Einzige Wahrheit —
 * spaetere Ableitungen (z.B. eine Ausschlussliste) bauen darauf auf, statt die
 * Literale erneut aufzuzaehlen.
 */
export const ALL_DOC_TYPES: readonly DocType[] = [
  'dump',
  'note',
  'project',
  'area',
  'condensed',
  'journal',
  'source',
  'entity',
  'concept',
  'overview',
  'raw',
];

/**
 * Exhaustiveness-Check auf Typ-Ebene: Wird `DocType` um ein Mitglied erweitert, ohne
 * `ALL_DOC_TYPES` zu pflegen, wird `_MissingDocTypes` zu einem Typ ungleich `never` und
 * die Zuweisung unten schlaegt beim Typechecken fehl (statt erst zur Laufzeit).
 */
type _MissingDocTypes = Exclude<DocType, (typeof ALL_DOC_TYPES)[number]>;
const _allDocTypesIsExhaustive: _MissingDocTypes extends never ? true : never = true;
void _allDocTypesIsExhaustive;

/** Arbeit oder Privat — die Trennung, die im Dashboard überall auftaucht. */
export type Scope = 'work' | 'private';

export const SCOPES: readonly Scope[] = ['work', 'private'];

/** Frontmatter-Felder, die jedes Dokument trägt. */
export interface BaseFrontmatter {
  type: DocType;
  title: string;
  created: string;
  updated?: string;
  tags?: string[];
  /** ISO-Sprachcode des Dokumentinhalts, z. B. 'de' oder 'en'. */
  lang?: string;
  [key: string]: unknown;
}

/** Eine gelesene Markdown-Datei: Frontmatter + Rumpf, plus Herkunft. */
export interface VaultDoc<F extends BaseFrontmatter = BaseFrontmatter> {
  /** Pfad relativ zur Vault-Wurzel, immer mit `/` als Trenner. */
  path: string;
  frontmatter: F;
  /** Der Text unter dem Frontmatter, unverändert. */
  body: string;
  /** sha256 über den gesamten Dateiinhalt — erkennt externe Änderungen. */
  hash: string;
  /** mtime als ISO-String. */
  modified: string;
  size: number;
}

/** Ergebnis eines Schreibvorgangs. Nie still überschreiben. */
export interface WriteResult {
  path: string;
  hash: string;
  /** true, wenn die Datei neu angelegt wurde. */
  created: boolean;
}

/** Wird geworfen, wenn die Datei sich seit dem Lesen extern geändert hat. */
export interface ConflictInfo {
  path: string;
  expectedHash: string;
  actualHash: string;
}

/** Zustand des geöffneten Vaults, wie der Renderer ihn sieht. */
export interface VaultStatus {
  /** Absoluter Pfad, oder null wenn noch kein Vault geöffnet ist. */
  root: string | null;
  name: string | null;
  /** true, sobald die Ordnerstruktur angelegt und der Index geladen ist. */
  ready: boolean;
  /** Anzahl indizierter Dokumente. */
  docCount: number;
  /** Letzter vollständiger Indexlauf, ISO. */
  indexedAt: string | null;
  /** Läuft gerade ein (Neu-)Aufbau des Index? */
  indexing: boolean;
  /** ISO timestamp of the last failed watcher-driven index refresh, or null when the index is current. A timestamp only — never the error text (Guardrail 6). */
  indexRefreshFailedAt: string | null;
}
