/**
 * Vault-relative Pfade: Wache, Bauer, Datumsteile.
 *
 * Innerhalb des Vaults ist '/' der einzige Trenner — unabhaengig vom Betriebssystem.
 * Nur der Dateisystem-Adapter (`fs-store.ts`) uebersetzt das in echte OS-Pfade.
 *
 * Diese Datei ist bewusst frei von Node-Importen: reine Zeichenkettenarbeit, damit
 * die Pfadregeln ohne Dateisystem testbar bleiben. Namen macht slug.ts.
 */

import { INTERNAL_DIRS, VAULT_DIRS, VAULT_MARKER_FILE, VAULT_SETTINGS_FILE } from '@shared/types';
import type { Scope, WikiPageType } from '@shared/types';
import { sanitizeSegment, slugify } from './slug';
import { VaultPathError } from './types';

/* Namensbildung lebt in slug.ts; hier weitergegeben, damit Aufrufer einen Ort haben. */
export { FALLBACK_SLUG, MAX_SLUG_LENGTH, sanitizeSegment, slugify, uniqueSlug } from './slug';

/** Alles, woraus sich ein Datum ableiten laesst. */
export type DateLike = Date | string | number;

/** Rohquellen-Arten mit einem in VAULT-FORMAT.md festgelegten Ort unter `raw/`. */
export type RawKind = 'youtube' | 'file' | 'url';

const WIKI_PAGE_DIRS: Record<WikiPageType, string> = {
  source: 'sources',
  entity: 'entities',
  concept: 'concepts',
  overview: '',
};

/* Auf Windows verbotene Dateinamen — ein Vault muss auch dort funktionieren. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
/* Zeichen, die Windows in Dateinamen ablehnt (':' faengt zugleich Laufwerksbuchstaben). */
const FORBIDDEN_CHARS = /[<>:"|?*]/;

/* Steuerzeichen gehoeren in keinen Dateinamen. Als Schleife statt Zeichenklasse, damit
   weder ein Steuerzeichen noch eine Lint-Ausnahme im Quelltext stehen muss. */
function hasControlChar(segment: string): boolean {
  for (let index = 0; index < segment.length; index += 1) {
    const code = segment.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

// ── Pfad-Hygiene ───────────────────────────────────────────────────────────────

/** Backslashes zu '/', doppelte Trenner und './' weg. Wirft nicht. */
export function toVaultPath(input: string): string {
  const segments = input
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part.length > 0 && part !== '.');
  return segments.join('/');
}

/**
 * Wachfunktion: akzeptiert nur Pfade, die sicher innerhalb des Vaults liegen.
 * Abgelehnt werden '..', absolute Pfade, UNC- und Laufwerkspfade sowie Namen,
 * die Windows nicht schreiben kann. Rueckgabe ist der normalisierte Pfad.
 */
export function assertSafeVaultPath(input: string): string {
  if (typeof input !== 'string' || input.trim().length === 0) {
    throw new VaultPathError(String(input), 'Leerer Pfad.');
  }
  const raw = input.replace(/\\/g, '/');
  if (raw.startsWith('/')) {
    throw new VaultPathError(input, 'Absolute Pfade sind im Vault nicht erlaubt.');
  }
  if (/^[a-z]:/i.test(raw)) {
    throw new VaultPathError(input, 'Laufwerksbuchstaben sind im Vault nicht erlaubt.');
  }
  const segments = raw.split('/').filter((part) => part.length > 0 && part !== '.');
  if (segments.length === 0) {
    throw new VaultPathError(input, 'Pfad ohne Inhalt.');
  }
  for (const segment of segments) {
    if (segment === '..') {
      throw new VaultPathError(input, 'Pfad verlaesst den Vault ("..").');
    }
    if (FORBIDDEN_CHARS.test(segment) || hasControlChar(segment)) {
      throw new VaultPathError(input, `Unerlaubtes Zeichen im Namen "${segment}".`);
    }
    if (segment.endsWith('.') || segment.endsWith(' ')) {
      throw new VaultPathError(
        input,
        `Name darf nicht auf Punkt oder Leerzeichen enden: "${segment}".`,
      );
    }
    if (WINDOWS_RESERVED.test(segment)) {
      throw new VaultPathError(input, `"${segment}" ist auf Windows ein reservierter Name.`);
    }
  }
  return segments.join('/');
}

/** Wie `assertSafeVaultPath`, aber als Pruefung ohne Ausnahme. */
export function isSafeVaultPath(input: string): boolean {
  try {
    assertSafeVaultPath(input);
    return true;
  } catch {
    return false;
  }
}

/** Setzt Vault-Segmente zu einem geprueften Pfad zusammen. */
export function joinVaultPath(...parts: (string | number)[]): string {
  return assertSafeVaultPath(parts.map((part) => String(part)).join('/'));
}

/** Elternordner eines Vault-Pfads; '' fuer Dateien in der Wurzel. */
export function dirName(path: string): string {
  const normalized = toVaultPath(path);
  const cut = normalized.lastIndexOf('/');
  return cut < 0 ? '' : normalized.slice(0, cut);
}

/** Letztes Segment eines Vault-Pfads. */
export function baseName(path: string): string {
  const normalized = toVaultPath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

/** Endung inklusive Punkt, klein geschrieben; '' wenn keine vorhanden. */
export function extName(path: string): string {
  const name = baseName(path);
  const cut = name.lastIndexOf('.');
  return cut <= 0 ? '' : name.slice(cut).toLowerCase();
}

/** Liegt `path` in `dir` (oder ist `dir` selbst)? */
export function isInside(dir: string, path: string): boolean {
  const base = toVaultPath(dir);
  const candidate = toVaultPath(path);
  if (base.length === 0) return true;
  return candidate === base || candidate.startsWith(`${base}/`);
}

// ── Datum ──────────────────────────────────────────────────────────────────────

function toDate(value: DateLike): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  // Ein reines Datum ohne Zeitzone wuerde als UTC gelesen und koennte im lokalen
  // Kalender einen Tag zurueckspringen — deshalb hier von Hand zusammensetzen.
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plain) {
    return new Date(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]));
  }
  return new Date(value);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Lokales Datum als 'YYYY-MM-DD'. */
export function isoDay(date: DateLike = new Date()): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = toDate(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lokaler Zeitstempel als 'YYYY-MM-DD-HHmm' — der Namensteil eines Dumps. */
export function minuteStamp(date: DateLike = new Date()): string {
  const d = toDate(date);
  return `${isoDay(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// ── Pfad-Bauer (Reihenfolge wie in VAULT-FORMAT.md) ────────────────────────────

/** `inbox/2026-08-10-1432-kurz-slug.md` */
export function inboxPath(date: DateLike, slug: string): string {
  return joinVaultPath(VAULT_DIRS.inbox, `${minuteStamp(date)}-${slugify(slug)}.md`);
}

/** `journal/2026/08/2026-08-10.md` */
export function journalPath(date: DateLike = new Date()): string {
  const day = isoDay(date);
  return joinVaultPath(VAULT_DIRS.journal, day.slice(0, 4), day.slice(5, 7), `${day}.md`);
}

/** `projects/work/<slug>` */
export function projectDir(scope: Scope, slug: string): string {
  return joinVaultPath(VAULT_DIRS.projects, scope, slugify(slug));
}

/** `projects/work/<slug>/project.md` */
export function projectPath(scope: Scope, slug: string): string {
  return joinVaultPath(projectDir(scope, slug), 'project.md');
}

/** `projects/work/<slug>/notes` — optionale Langtexte zum Projekt. */
export function projectNotesDir(scope: Scope, slug: string): string {
  return joinVaultPath(projectDir(scope, slug), 'notes');
}

/** `areas/<slug>.md` */
export function areaPath(slug: string): string {
  return joinVaultPath(VAULT_DIRS.areas, `${slugify(slug)}.md`);
}

/** `modules/<slug>` */
export function moduleDir(module: string): string {
  return joinVaultPath(VAULT_DIRS.modules, slugify(module));
}

/** `modules/<slug>/module.md` */
export function modulePath(module: string): string {
  return joinVaultPath(moduleDir(module), 'module.md');
}

/** `modules/<slug>/wiki` */
export function wikiDir(module: string): string {
  return joinVaultPath(moduleDir(module), 'wiki');
}

/** `modules/<slug>/wiki/index.md` — Katalog aller Seiten. */
export function wikiIndexPath(module: string): string {
  return joinVaultPath(wikiDir(module), 'index.md');
}

/** `modules/<slug>/wiki/log.md` — append-only Chronik. */
export function wikiLogPath(module: string): string {
  return joinVaultPath(wikiDir(module), 'log.md');
}

/**
 * Wiki-Seite eines Moduls. Bei `overview` gibt es genau eine Seite
 * (`wiki/overview.md`); der Slug wird dann nicht verwendet.
 */
export function modulePagePath(module: string, type: WikiPageType, slug = 'overview'): string {
  if (type === 'overview') return joinVaultPath(wikiDir(module), 'overview.md');
  return joinVaultPath(wikiDir(module), WIKI_PAGE_DIRS[type], `${slugify(slug)}.md`);
}

/** Slug einer Source-Seite: `s-2026-08-10-auth0-rbac-guide`. */
export function sourceSlug(date: DateLike, slug: string): string {
  return `s-${isoDay(date)}-${slugify(slug)}`;
}

/**
 * Ort einer Rohquelle unter `raw/`:
 * `youtube` -> Ordner `raw/youtube/<video-id>`,
 * `file` -> Ordner `raw/files/<datum>-<slug>`,
 * `url` -> Datei `raw/web/<datum>-<slug>.md`.
 *
 * Die Video-ID bleibt buchstabengetreu: sie ist der Schluessel zurueck zur Quelle,
 * kein Anzeigename.
 */
export function rawPath(kind: RawKind, slug: string, date: DateLike = new Date()): string {
  const day = isoDay(date);
  if (kind === 'youtube') return joinVaultPath(VAULT_DIRS.raw, 'youtube', sanitizeSegment(slug));
  if (kind === 'file') return joinVaultPath(VAULT_DIRS.raw, 'files', `${day}-${slugify(slug)}`);
  return joinVaultPath(VAULT_DIRS.raw, 'web', `${day}-${slugify(slug)}.md`);
}

/** Protokolldatei einer Rohquelle: `<ordner>/.ingest.json`. */
export function ingestLogPath(rawDir: string): string {
  return joinVaultPath(rawDir, '.ingest.json');
}

// ── Interne Pfade (.secondbrain) ───────────────────────────────────────────────

export const markerPath = (): string => VAULT_MARKER_FILE;
export const vaultSettingsPath = (): string => VAULT_SETTINGS_FILE;
export const indexPath = (): string => `${INTERNAL_DIRS.index}/index.json`;

/** The files a persisted index consists of, all derived from its manifest path. */
export interface IndexFiles {
  /** `<dir>/<stem>.json` — everything except bodies and search state. */
  manifest: string;
  /** `<dir>/<stem>.bodies` — one bucket file per first two hex chars of `sha256(path)`. */
  bodiesDir: string;
  /** `<dir>/<stem>.search.json` — the MiniSearch state plus the hashes it covers. */
  search: string;
}

/** Layout of the index next to a manifest; the stem is the file name without `.json`. */
export function indexFiles(manifest: string = indexPath()): IndexFiles {
  const dir = dirName(manifest);
  const name = baseName(manifest);
  const stem = name.toLowerCase().endsWith('.json') ? name.slice(0, -'.json'.length) : name;
  const sibling = (file: string): string => (dir.length === 0 ? file : `${dir}/${file}`);
  return {
    manifest: toVaultPath(manifest),
    bodiesDir: sibling(`${stem}.bodies`),
    search: sibling(`${stem}.search.json`),
  };
}

/** One body bucket file, `<bodiesDir>/<bucket>.json`. */
export function indexBucketPath(files: IndexFiles, bucket: string): string {
  return `${files.bodiesDir}/${bucket}.json`;
}

export const chatPath = (id: string): string => joinVaultPath(INTERNAL_DIRS.chats, `${id}.json`);
export const trashDir = (): string => INTERNAL_DIRS.trash;

/* Only the vault-root `.claude`: Claude Code reads it from the project root, so a
   nested `.claude` (inside a module, say) is ordinary user content. */
const AGENT_CONFIG_DIR = '.claude';

/** Is the path the vault-root `.claude` folder or inside it? Agent config, not knowledge. */
export function isAgentConfigPath(path: string): boolean {
  return isInside(AGENT_CONFIG_DIR, path);
}

/** Liegt der Pfad im ableitbaren Teil des Vaults? */
export function isInternalPath(path: string): boolean {
  return isInside(VAULT_DIRS.internal, path);
}
