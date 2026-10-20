/**
 * Just dump it: text → file in `inbox/`.
 *
 * The write path is deliberately dumb. It files nothing, calls no model, and
 * waits on nothing: the thought has to be captured before it's lost. Filing
 * happens later, as a proposal the user confirms.
 *
 * Format: docs/VAULT-FORMAT.md, section "Dump".
 */

import type { CaptureOrigin, DumpItem, Scope, WriteResult } from '@shared/types';
import { wordCount } from '@core/vault/doc';
import { MAX_SLUG_LENGTH, inboxPath, slugify } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { dumpId } from '@core/index/dumps';

/**
 * What the write path needs from the store — deliberately narrow.
 * `VaultStore` fulfills it structurally; the shell passes in its own,
 * equally narrow view.
 */
export interface DumpStore {
  exists(path: string): Promise<boolean>;
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
}

/** Length of the derived title. Enough for one line in the inbox. */
const TITLE_CHARS = 70;

/** This many name variants are tried when the minute is already taken. */
const MAX_ATTEMPTS = 50;

/**
 * Room the disambiguation needs in the name: '-2' through '-50', or as a
 * last resort '-<milliseconds>' (13 digits plus a hyphen).
 */
const SUFFIX_ROOM = 14;

export interface DumpInput {
  text: string;
  origin: CaptureOrigin;
  tags?: string[];
  scope?: Scope | null;
}

export interface DumpWriteOptions {
  /** The "now" for the filename and `created`. Tests supply a fixed time. */
  now?: DateLike;
}

/** The text is empty, there is nothing to file. */
export class EmptyDumpError extends Error {
  readonly code = 'invalid' as const;

  constructor() {
    super('Der Dump ist leer.');
    this.name = 'EmptyDumpError';
  }
}

/**
 * Title of a dump: the first content line, truncated. A dump has no title —
 * that's why one is derived rather than invented.
 */
export function dumpTitle(text: string, maxChars = TITLE_CHARS): string {
  const first = text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|#{1,6}\s+|>\s*)/, '').trim())
    .find((line) => line.length > 0);
  if (first === undefined) return '';
  if (first.length <= maxChars) return first;
  const cut = first.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Free path in `inbox/`: on collision, '-2', '-3', … gets appended.
 *
 * The name portion is truncated **beforehand** for the variants. `inboxPath`
 * slugifies again and truncates to `MAX_SLUG_LENGTH` in the process — with a
 * long title, the appended number would fall victim to exactly that
 * truncation, every attempt would end up with the same name, and the second
 * dump of the same minute would come back as a conflict instead of a file.
 * A thought must not fail just because it starts out long.
 */
async function freeInboxPath(store: DumpStore, at: DateLike, slug: string): Promise<string> {
  const first = inboxPath(at, slug);
  if (!(await store.exists(first))) return first;

  const base = slugify(slug, MAX_SLUG_LENGTH - SUFFIX_ROOM);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = inboxPath(at, `${base}-${attempt}`);
    if (!(await store.exists(candidate))) return candidate;
  }
  return inboxPath(at, `${base}-${Date.now()}`);
}

/**
 * Writes the dump and returns it in the shape the renderer displays.
 * The index catches up via the watcher — nothing gets indexed here.
 */
export async function writeDump(
  store: DumpStore,
  input: DumpInput,
  options: DumpWriteOptions = {},
): Promise<DumpItem> {
  const text = input.text.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) throw new EmptyDumpError();

  const at = options.now ?? new Date();
  const created = new Date(at instanceof Date ? at : new Date(at)).toISOString();
  const title = dumpTitle(text);
  const tags = (input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  const scope = input.scope ?? null;
  const path = await freeInboxPath(store, at, slugify(title));

  await store.create(
    path,
    {
      type: 'dump',
      title,
      created,
      origin: input.origin,
      status: 'raw',
      tags,
      scope,
    },
    `${text}\n`,
  );

  return {
    path,
    id: dumpId(path),
    title,
    text,
    created,
    origin: input.origin,
    status: 'raw',
    ageDays: 0,
    wordCount: wordCount(text),
    tags,
    scope,
    // A fresh dump is unfiled by definition — there is nothing to point at yet.
    filedInto: null,
    filedAt: null,
  };
}
