/**
 * Dumps: die Dateien in `inbox/` als Liste, wie der Inbox-Screen sie braucht.
 *
 * Abgeleitet, nichts erfunden: Titel, Zeitpunkt, Herkunft und Status stehen im
 * Frontmatter der Datei (VAULT-FORMAT.md, Abschnitt „Dump"). Fehlt ein Feld,
 * gilt der ehrliche Standard — `status: raw`, Herkunft unbekannt.
 */

import type { CaptureOrigin, DumpItem, VaultDoc } from '@shared/types';
import { titleFor, wordCount } from '@core/vault/doc';
import { baseName, extName, isInside } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { ageInDays } from './dates';
import { asStringList, asText } from './text';
import { scopeHint } from './todos';
import type { IndexedDoc } from './types';

const ORIGINS: readonly CaptureOrigin[] = [
  'window',
  'quick-capture',
  'chat',
  'clipboard',
  'drop',
  'cli',
];

const STATUSES: readonly DumpItem['status'][] = ['raw', 'proposed', 'filed', 'kept'];

export interface DumpDerivationOptions {
  /** Das „jetzt", auf das sich `ageDays` bezieht. */
  now?: DateLike;
}

/** Dateiname ohne Endung — stabil ueber Neustarts und in der URL brauchbar. */
export function dumpId(path: string): string {
  const name = baseName(path);
  const ext = extName(name);
  return ext.length > 0 ? name.slice(0, name.length - ext.length) : name;
}

function originOf(value: unknown): CaptureOrigin {
  const text = asText(value);
  return text !== null && (ORIGINS as readonly string[]).includes(text)
    ? (text as CaptureOrigin)
    : 'window';
}

function statusOf(value: unknown): DumpItem['status'] {
  const text = asText(value);
  return text !== null && (STATUSES as readonly string[]).includes(text)
    ? (text as DumpItem['status'])
    : 'raw';
}

/** Ein einzelnes indiziertes Dokument als Dump. */
export function toDumpItem(doc: IndexedDoc, options: DumpDerivationOptions = {}): DumpItem {
  const now = options.now ?? new Date();
  const created = asText(doc.frontmatter['created']) ?? doc.updated;
  return {
    path: doc.path,
    id: dumpId(doc.path),
    title: doc.title,
    text: doc.body.trim(),
    created,
    origin: originOf(doc.frontmatter['origin']),
    status: statusOf(doc.frontmatter['status']),
    ageDays: ageInDays(created, now),
    wordCount: doc.words,
    tags: doc.tags.length > 0 ? doc.tags : asStringList(doc.frontmatter['tags']),
    scope: doc.scope,
  };
}

/**
 * Eine gerade gelesene Datei als Dump — der Weg ohne Index.
 *
 * Wer einen Dump schreibt, muss ihn sofort zurueckgeben koennen: der Index zieht
 * erst ueber den Watcher nach, und bis dahin wuerde die Oberflaeche den alten
 * Stand zeigen.
 */
export function dumpFromDoc(doc: VaultDoc, options: DumpDerivationOptions = {}): DumpItem {
  const now = options.now ?? new Date();
  const created = asText(doc.frontmatter['created']) ?? doc.modified;
  const text = doc.body.trim();
  return {
    path: doc.path,
    id: dumpId(doc.path),
    title: titleFor(doc.path, doc.frontmatter),
    text,
    created,
    origin: originOf(doc.frontmatter['origin']),
    status: statusOf(doc.frontmatter['status']),
    ageDays: ageInDays(created, now),
    wordCount: wordCount(text),
    tags: asStringList(doc.frontmatter['tags']),
    scope: scopeHint(doc.path, doc.frontmatter),
  };
}

/**
 * Alle Dumps aus den indizierten Dokumenten, der jüngste zuerst.
 *
 * Gezaehlt wird, was in `inbox/` liegt **oder** `type: dump` traegt: verschiebt
 * der Nutzer einen Dump von Hand, verschwindet er nicht aus der Liste.
 */
export function deriveDumps(
  docs: readonly IndexedDoc[],
  options: DumpDerivationOptions = {},
): DumpItem[] {
  const dumps: DumpItem[] = [];
  for (const doc of docs) {
    if (doc.docType !== 'dump' && !isInside('inbox', doc.path)) continue;
    dumps.push(toDumpItem(doc, options));
  }
  dumps.sort((a, b) =>
    a.created === b.created ? a.path.localeCompare(b.path) : a.created < b.created ? 1 : -1,
  );
  return dumps;
}
