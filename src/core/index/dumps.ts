/**
 * Dumps: the files in `inbox/` as a list, in the shape the inbox screen needs.
 *
 * Derived, nothing invented: title, timestamp, origin, and status live in
 * the file's frontmatter (VAULT-FORMAT.md, section "Dump"). If a field is
 * missing, the honest default applies — `status: raw`, origin unknown.
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
  /** The "now" that `ageDays` is relative to. */
  now?: DateLike;
}

/** File name without extension — stable across restarts and usable in a URL. */
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

/** A single indexed document as a dump. */
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
    filedInto: asText(doc.frontmatter['filed_into']),
    filedAt: asText(doc.frontmatter['filed_at']),
  };
}

/**
 * A file just read as a dump — the path without the index.
 *
 * Whoever writes a dump must be able to return it immediately: the index
 * only catches up later via the watcher, and until then the UI would show
 * the old state.
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
    filedInto: asText(doc.frontmatter['filed_into']),
    filedAt: asText(doc.frontmatter['filed_at']),
  };
}

/**
 * All dumps from the indexed documents, most recent first.
 *
 * What's counted is anything that lives in `inbox/` **or** carries `type:
 * dump`: if the user moves a dump by hand, it doesn't vanish from the list.
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
