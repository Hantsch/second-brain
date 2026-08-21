/**
 * The newer page supersedes the older one — a single frontmatter field,
 * `supersedes`, in the shape `relations.ts` already knows how to read
 * (`RELATION_FIELDS`, `relationSlugs`, `namesContradiction`'s sibling fields).
 *
 * Both pages stay. This action names a relation, it does not remove anything —
 * whoever wants the older page gone reaches for `discardPage` instead, a
 * different action with a different cost. The write itself mirrors
 * `markReviewed` in `fixes.ts` exactly: one frontmatter field, through
 * `composeContent`, so the user's own formatting of the rest of the file
 * survives untouched.
 *
 * Same three rules as every other fix in this module:
 * - **Read fresh.** Both pages are read from the store at call time.
 * - **Already named is not an error to fix twice.** If the older page's slug is
 *   already in the newer page's `supersedes` array, nothing is written and the
 *   caller gets `invalid` — the same stance `markReviewed` and `addLinks` take
 *   for a precondition that no longer holds.
 * - **Undo is mandatory.** The journal is written before the write, exactly as
 *   in `fixes.ts` and `discard-page.ts`, and `undoFix` puts the field back.
 */

import type { DocLanguage } from '@shared/types';
import { asStringList } from '@core/index/text';
import { composeContent } from '@core/vault/compose';
import { parse } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import type { VaultStore } from '@core/vault/types';
import { appendLog, pageRefOf } from '@core/wiki';
import type { PageRef } from '@core/wiki';
import { GardenerError } from './types';
import { writeFixJournal } from './undo';
import type { FixJournal } from './undo';

export interface SupersedeDeps {
  store: VaultStore;
  /** Language of the chronicle entry. */
  docLanguage?: DocLanguage;
  /** The "now". Tests pass a fixed time. */
  now?: DateLike;
}

export interface SupersedeInput {
  newerPath: string;
  olderPath: string;
  /**
   * Hash the caller last read the newer page at. Given, a page edited since
   * raises `conflict` instead of the relation being named on a stale text.
   */
  expectedHash?: string;
}

export interface SupersedeResult {
  /** The newer page — the only file this action writes. */
  written: string;
  /** Mark for `undoFix`; restores the field to what it was before. */
  undoToken: string;
  /** The chronicle entry with the `lint` mark; it is not rolled back. */
  logged: string | null;
}

/** A page, read fresh from the store. */
interface Current {
  path: string;
  raw: string;
  frontmatter: Record<string, unknown>;
}

async function readCurrent(store: VaultStore, path: string): Promise<Current> {
  const raw = await store.readText(path);
  if (raw === null) throw new GardenerError('not-found', `Datei fehlt: ${path}`);
  const { frontmatter } = parse(raw);
  return { path, raw, frontmatter };
}

function refOf(current: Current): PageRef {
  const ref = pageRefOf(current.path, current.frontmatter);
  if (ref === null) throw new GardenerError('invalid', `Keine Wiki-Seite: ${current.path}`);
  return ref;
}

/**
 * The raw `supersedes` entries, verbatim — cross-module references may carry a
 * `module/slug` form and that spelling is preserved when the array is rewritten.
 */
function supersedesRaw(frontmatter: Record<string, unknown>): string[] {
  return asStringList(frontmatter['supersedes']);
}

/** Does one of the raw entries already name `slug`, module qualifier or not? */
function namesSlug(raw: readonly string[], slug: string): boolean {
  return raw.some((value) => (value.includes('/') ? value.split('/').pop() : value) === slug);
}

/**
 * Name that `newer` supersedes `older` — one frontmatter field on `newer`,
 * appended to whatever the array already held. `older` itself is read only to
 * resolve its slug and module; its file is never written.
 */
export async function supersede(
  deps: SupersedeDeps,
  { newerPath, olderPath, expectedHash }: SupersedeInput,
): Promise<SupersedeResult> {
  const newer = await readCurrent(deps.store, newerPath);
  const newerRef = refOf(newer);
  if (expectedHash !== undefined && expectedHash !== sha256(newer.raw)) {
    throw new GardenerError(
      'conflict',
      `„${newer.path}" wurde seit der Vorschau geaendert und bleibt stehen.`,
    );
  }

  const older = await readCurrent(deps.store, olderPath);
  const olderRef = refOf(older);

  const existing = supersedesRaw(newer.frontmatter);
  if (namesSlug(existing, olderRef.slug)) {
    throw new GardenerError(
      'invalid',
      `„${newerRef.slug}" nennt „${olderRef.slug}" schon als abgeloest.`,
    );
  }
  const olderId =
    olderRef.module === newerRef.module ? olderRef.slug : `${olderRef.module}/${olderRef.slug}`;
  const next = composeContent(newer.path, newer.raw, {
    path: newer.path,
    frontmatter: { supersedes: [...existing, olderId] },
  });

  const day = isoDay(deps.now ?? new Date());
  const token = createUndoToken(new Date(deps.now === undefined ? Date.now() : deps.now));
  const journal: FixJournal = {
    version: 1,
    kind: 'supersede',
    action: 'supersede',
    steps: [{ path: newer.path, before: newer.raw, hashAfter: sha256(next) }],
  };
  await writeFixJournal(deps.store, token, journal);

  await deps.store.writeText(newer.path, next, { expectedHash: sha256(newer.raw) });

  const entry = await appendLog(
    deps.store,
    newerRef.module,
    {
      kind: 'lint',
      day,
      touched: [`[[${newerRef.slug}]]`, `[[${olderRef.slug}]]`],
      findings: `supersede (${olderRef.slug} -> ${newerRef.slug})`,
    },
    { language: deps.docLanguage ?? 'de', now: day },
  );

  return { written: newer.path, undoToken: token, logged: entry.path };
}
