/**
 * Papierkorb und Rueckgaengig-Marken. Geloescht wird im Vault nie wirklich: die
 * Datei wandert nach `.secondbrain/trash/<token>/<originalpfad>` und `undo(token)`
 * holt sie exakt dorthin zurueck, wo sie war.
 */

import { assertSafeVaultPath, joinVaultPath, trashDir } from './paths';
import { VaultPathError } from './types';

const TOKEN_PATTERN = /^[a-z0-9-]{8,80}$/;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** Neue Marke: sortierbar nach Zeit, dateisystemtauglich, kollisionsarm. */
export function createUndoToken(date = new Date()): string {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `-${pad(date.getMilliseconds(), 3)}`;
  const random = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${stamp}-${random}`;
}

/** Marken kommen von aussen zurueck — sie duerfen niemals zu einem Pfad werden, der ausbricht. */
export function assertUndoToken(token: string): string {
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) {
    throw new VaultPathError(String(token), 'Keine gueltige Rueckgaengig-Marke.');
  }
  return token;
}

/** `.secondbrain/trash/<token>` */
export function trashRoot(token: string): string {
  return joinVaultPath(trashDir(), assertUndoToken(token));
}

/**
 * `.secondbrain/trash/<token>.json` — das Verzeichnis dessen, was zu dieser Marke
 * gehoert. Ohne diese Liste wuesste `undo` nicht, ob ein Ordner als Ganzes oder
 * einzelne Dateien zurueckwandern muessen.
 */
export function trashManifestPath(token: string): string {
  return joinVaultPath(trashDir(), `${assertUndoToken(token)}.json`);
}

export interface TrashEntry {
  /** Originalpfad im Vault. */
  path: string;
  dir: boolean;
}

/**
 * Warum diese Marke angelegt wurde — und damit, was `undo` am Zielort erwarten darf.
 *
 * `delete`: das Original ist weg, `undo` legt es in einen leeren Platz zurueck. Liegt
 * dort wieder etwas, ist das ein Konflikt: fremder Inhalt wird nie ueberschrieben.
 * `snapshot`: das Original blieb liegen und wurde danach ueberschrieben. Hier ist die
 * belegte Zieldatei genau der Normalfall — `undo` legt die Kopie darueber.
 */
export type TrashKind = 'delete' | 'snapshot';

export interface TrashManifest {
  token: string;
  deletedAt: string;
  kind: TrashKind;
  entries: TrashEntry[];
}

/** Manifest aus rohem JSON lesen; `null`, wenn es unbrauchbar ist. */
export function parseManifest(raw: string | null): TrashManifest | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<TrashManifest>;
    if (typeof candidate.token !== 'string' || !Array.isArray(candidate.entries)) return null;
    const entries = candidate.entries
      .filter((entry): entry is TrashEntry => typeof entry?.path === 'string')
      .map((entry) => ({ path: entry.path, dir: entry.dir === true }));
    return {
      token: candidate.token,
      deletedAt: typeof candidate.deletedAt === 'string' ? candidate.deletedAt : '',
      /* Aeltere Manifeste kennen `kind` nicht. Sie stammen ausnahmslos aus `delete`,
         und das ist ohnehin die vorsichtige Lesart: nur sie schuetzt den Zielort. */
      kind: candidate.kind === 'snapshot' ? 'snapshot' : 'delete',
      entries,
    };
  } catch {
    return null;
  }
}

/** `.secondbrain/trash/<token>/<originalpfad>` */
export function trashPath(token: string, path: string): string {
  return joinVaultPath(trashRoot(token), assertSafeVaultPath(path));
}

/** Aus einem Papierkorb-Pfad den Originalpfad zurueckrechnen. */
export function originalPath(token: string, path: string): string {
  const root = `${trashRoot(token)}/`;
  const normalized = assertSafeVaultPath(path);
  if (!normalized.startsWith(root)) {
    throw new VaultPathError(path, 'Pfad liegt nicht in diesem Papierkorb-Ordner.');
  }
  return normalized.slice(root.length);
}
