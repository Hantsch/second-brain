/**
 * Deterministic input selection for condensing an area (story 037, D5).
 *
 * `condenseArea()` (D7) must not let a model decide what it may read — so this
 * module picks the inputs itself, from data the index already parsed:
 *
 * 1. The area's own notes section (`parseAreaNotes`, `@core/index/areas`).
 * 2. The area's todos, restricted to its todos section range (`parseTodos`
 *    over `areaSectionRanges(body, 'todos')`, not the whole body — a stray
 *    checkbox above "## Todos" is prose, not a task).
 * 3. Day entries carrying the area's slug in their `areas:` frontmatter
 *    (`daysOfArea`, story 036), bounded to the last **90 days** from "now".
 *
 * The 90-day bound is a stated design decision (Decision Q4 of story 037,
 * mirroring the contradiction check's 24-page precedent for a bounded input),
 * not an implementation detail: an area's history keeps growing, and a
 * condensation run needs a fixed, explainable window rather than "everything".
 *
 * `now` is always injectable — never `Date.now()` directly — so the window is
 * testable without waiting or mocking global time (mirrors `today`/`now`
 * parameters elsewhere in `@core/index` and `@core/overview`).
 *
 * No model or gateway is involved anywhere in this file: it is pure selection
 * over already-parsed vault data.
 */

import type { AreaNote, JournalDay, Todo } from '@shared/types';
import { areaSectionRanges } from '@core/areas/sections';
import { ageInDays } from '@core/index/dates';
import { areaSlug, daysOfArea, parseAreaNotes } from '@core/index/areas';
import type { IndexedDoc } from '@core/index/types';
import { parseTodos } from '@core/index/todos';
import type { DateLike } from '@core/vault/paths';

/** Days back from "now" a day entry may still count as input (Decision Q4). */
export const CONDENSE_DAY_WINDOW_DAYS = 90;

export interface CondenseInputsOptions {
  /** "Now" the 90-day window is measured from. Tests pass a fixed date. */
  now?: DateLike;
}

/**
 * What the selector left out, and why. Day entries that do not carry the
 * area's slug at all are **not** truncation — they were never candidates for
 * this area, the same way `daysOfArea()` simply never returns them. Only
 * candidates that exist (the slug matches) but fall outside the 90-day window
 * are dropped and counted here. `null` when nothing was dropped.
 */
export interface CondenseTruncationReport {
  /** Number of day entries dropped for being older than the window. */
  count: number;
  reason: string;
}

/**
 * One **document** a condensation run reads, paired with the content hash it had
 * at that moment.
 *
 * The hash is `IndexedDoc.hash` — sha256 of the whole file, already computed by
 * the indexer. Story 039 (Decision Q1) settles "newer" on exactly that hash, not
 * on the file's mtime and not on the frontmatter field `updated`: a file touched
 * without being changed is not new material, and the vault's conflict detection
 * already answers "did this file move on" the same way. A second hash scheme
 * would be a second truth.
 */
export interface CondenseInput {
  /** Vault-relative path of the document. */
  path: string;
  /** `IndexedDoc.hash` of that document as it stands in `docs`. */
  hash: string;
}

/** The three deterministic inputs of one area's condensation run. */
export interface CondenseInputSelection {
  /** Area slug the selection was made for. */
  slug: string;
  /** The area's own notes entries, in `parseAreaNotes()`'s order (newest first). */
  notes: AreaNote[];
  /** The area's todos, from its todos section only. */
  todos: Todo[];
  /** Day entries naming this area's slug, within the last 90 days, oldest first. */
  days: JournalDay[];
  /** What was dropped for being outside the window; `null` if nothing was. */
  truncated: CondenseTruncationReport | null;
}

/** The area's own file, or `null` when the slug has none. */
function findAreaDoc(docs: readonly IndexedDoc[], slug: string): IndexedDoc | null {
  return docs.find((doc) => doc.docType === 'area' && areaSlug(doc.path) === slug) ?? null;
}

/** Todos of one area doc, restricted to its todos section range(s). */
function areaTodos(doc: IndexedDoc): Todo[] {
  const lines = doc.body.split('\n');
  const todos: Todo[] = [];
  for (const range of areaSectionRanges(doc.body, 'todos')) {
    const sectionBody = lines.slice(range.start, range.end).join('\n');
    todos.push(
      ...parseTodos(sectionBody, {
        path: doc.path,
        frontmatter: doc.frontmatter,
        lineOffset: doc.bodyLine + range.start,
      }),
    );
  }
  return todos;
}

/** Splits `days` (oldest first, from `daysOfArea`) into kept and dropped-by-age. */
function windowDays(
  days: readonly JournalDay[],
  now: DateLike,
): { kept: JournalDay[]; dropped: number } {
  const kept: JournalDay[] = [];
  let dropped = 0;
  for (const day of days) {
    if (ageInDays(day.date, now) > CONDENSE_DAY_WINDOW_DAYS) dropped += 1;
    else kept.push(day);
  }
  return { kept, dropped };
}

/**
 * The **document** inventory of one area's condensation: the area file, then the
 * day entries carrying its slug within the same 90-day window
 * `selectCondenseInputs()` uses — each with the content hash it has right now.
 *
 * One entry per document, never per note or per todo: an area's notes and its
 * todos both live inside `areas/<slug>.md`, so that one file hash already covers
 * both (story 039, Decision "Inputs = the area file plus its tagged day
 * entries"). The area file is listed even when it holds nothing yet — it was
 * read, and a note added to it later has to register as new material.
 *
 * This is deliberately the **one** selector both sides of the freshness question
 * share: `condenseArea()` records these hashes into the artifact, and the
 * maintenance check compares the recorded ones against a fresh call. Two
 * inventories that disagree about what an input is would make every artifact
 * permanently due or permanently fresh — silently, because a hash comparison
 * cannot tell a wrong pairing from a real change.
 *
 * The order is deterministic — area file first, then days oldest first, the same
 * order `selectCondenseInputs()` returns them in — so a digest over the
 * inventory identifies a state and not a shuffle.
 *
 * Index-only, like `deriveAreas()`: no file is opened here.
 */
export function areaInputs(
  docs: readonly IndexedDoc[],
  slug: string,
  options: CondenseInputsOptions = {},
): CondenseInput[] {
  const now = options.now ?? new Date();
  const inputs: CondenseInput[] = [];

  const area = findAreaDoc(docs, slug);
  if (area !== null) inputs.push({ path: area.path, hash: area.hash });

  const byPath = new Map(docs.map((doc) => [doc.path, doc]));
  const { kept } = windowDays(daysOfArea(docs, slug), now);
  for (const day of kept) {
    const doc = byPath.get(day.path);
    // A day always comes from a doc, so this cannot miss. Skipping rather than
    // substituting an empty hash keeps "no hash" meaning exactly one thing:
    // nothing was recorded for this path.
    if (doc !== undefined) inputs.push({ path: doc.path, hash: doc.hash });
  }

  return inputs;
}

/**
 * Selects the deterministic inputs of area `slug` out of the indexed
 * documents `docs` — the same `readonly IndexedDoc[]` shape `deriveAreas()`
 * and `daysOfArea()` already take, so no separate read path exists for this.
 *
 * An area with no matching doc gets empty notes/todos, and whatever day
 * entries still carry its slug (there is no requirement that the area file
 * itself exists for a day to reference it).
 */
export function selectCondenseInputs(
  docs: readonly IndexedDoc[],
  slug: string,
  options: CondenseInputsOptions = {},
): CondenseInputSelection {
  const now = options.now ?? new Date();
  const area = findAreaDoc(docs, slug);

  const notes =
    area === null ? [] : parseAreaNotes(area.body, { lineOffset: area.bodyLine, verbatim: true });
  const todos = area === null ? [] : areaTodos(area);

  const allDays = daysOfArea(docs, slug);
  const { kept, dropped } = windowDays(allDays, now);

  return {
    slug,
    notes,
    todos,
    days: kept,
    truncated:
      dropped === 0
        ? null
        : {
            count: dropped,
            reason: `${dropped} day entr${dropped === 1 ? 'y' : 'ies'} older than ${CONDENSE_DAY_WINDOW_DAYS} days were left out.`,
          },
  };
}
