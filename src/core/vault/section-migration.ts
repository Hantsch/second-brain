/**
 * Moving a file's section headings from one document language to the other —
 * the engine behind the migration the settings screen offers when
 * `languages.documents` changes (story 024).
 *
 * Two shapes of change, and only these two:
 *
 * - **rename** — the file has the old-language heading and not the new one:
 *   `## Notizen` becomes `## Notes`, the content underneath is not touched.
 * - **fold** — the file has *both*: the old section's content moves under the
 *   heading that is already in the target language and the emptied heading
 *   goes. Never a second section for one thing, and never a duplicated line.
 *
 * Three rules this module is built around:
 *
 * 1. **Plan and apply are the same computation.** `planSectionMigration` only
 *    describes what `applySectionMigration` will do; the apply step re-reads
 *    the file and derives the operations again from the freshly read body. A
 *    plan therefore carries no file content — it travels over IPC (D7) — and a
 *    body the app hasn't looked at is never rewritten from a stale plan.
 * 2. **A stale hash beats an overwrite.** Every write goes out with the
 *    `expectedHash` the plan was taken from. If the file moved on in between,
 *    the doc is reported as `conflict` and left exactly as it is; the other
 *    files of the same run still go through.
 * 3. **Nothing happens without being asked.** This module is the *only* place
 *    that renames a heading in a file the app did not write, and it runs only
 *    on the user's explicit trigger. The filing path stays append-only.
 */

import { fold } from '@core/index/text';
import type { DocLanguage, VaultDoc, WriteResult } from '@shared/types';
import { VAULT_DIRS } from '@shared/types';
import { extName, isInside, isInternalPath } from './paths';
import { sectionKindOf, sectionNameFor } from './section-names';
import type { SectionKind } from './section-names';
import { appendToSection, findSections } from './sections';
import { VaultConflictError } from './types';

/** One heading that gets a new name, its content untouched. */
export interface SectionRename {
  kind: SectionKind;
  /** The heading as it stands in the file. */
  from: string;
  /** The heading it becomes — the target language's word for this kind. */
  to: string;
}

/** One heading whose content moves under the heading the file already has. */
export interface SectionFold {
  kind: SectionKind;
  /** The old-language heading that goes. */
  from: string;
  /** The target-language heading that receives its content. */
  into: string;
}

/** What one file needs, and the hash it was read at. */
export interface SectionMigrationEntry {
  path: string;
  hash: string;
  renames: SectionRename[];
  folds: SectionFold[];
}

/**
 * What became of one file.
 *
 * - `migrated` — written.
 * - `conflict` — the file changed since the plan; nothing was written.
 * - `missing` — the file is gone.
 * - `unchanged` — there was nothing left to do (the user fixed it by hand).
 * - `skipped` — the path is not one this migration may write to (see
 *   `isMigratablePath`). A plan coming back over IPC is checked, not trusted.
 */
export type SectionMigrationOutcome = 'migrated' | 'conflict' | 'missing' | 'unchanged' | 'skipped';

export interface SectionMigrationResult {
  path: string;
  outcome: SectionMigrationOutcome;
  /** What actually happened, derived from the file as it was read. */
  renames: number;
  folds: number;
}

/** What planning needs of a document — an indexed doc or a read one both fit. */
export type MigratableDoc = Pick<VaultDoc, 'path' | 'body' | 'hash'>;

/** What the migration needs of the store — deliberately narrow, like `FilingStore`. */
export interface SectionMigrationStore {
  read(path: string): Promise<VaultDoc | null>;
  write(input: { path: string; body?: string; expectedHash?: string }): Promise<WriteResult>;
}

/**
 * May this path be rewritten by the migration?
 *
 * Markdown outside `raw/` (immutable source payloads, CLAUDE.md), outside
 * `.secondbrain/` (derived) and outside `modules/<slug>/wiki/` (wiki pages carry
 * their own schema headings from docs/MODULE-SCHEMA.md, with their own language
 * table — story 023 owns those). Checked in both `planSectionMigration` and
 * `applySectionMigration`, because in between the plan crosses IPC.
 */
export function isMigratablePath(path: string): boolean {
  if (extName(path) !== '.md') return false;
  if (isInternalPath(path)) return false;
  if (isInside(VAULT_DIRS.raw, path)) return false;
  return !new RegExp(`^${VAULT_DIRS.modules}/[^/]+/wiki/`).test(path);
}

interface Operations {
  renames: SectionRename[];
  folds: SectionFold[];
}

const NOTHING: Operations = { renames: [], folds: [] };

/**
 * The renames and folds a body needs to speak `to`.
 *
 * Only `##` headings count — that is the level the vault's managed sections
 * live at (docs/VAULT-FORMAT.md), so a `### Notizen` inside someone's prose is
 * left alone. Comparison is folded, like everywhere else: a file already
 * writing `## notes` in lower case is in the target language and stays as the
 * user typed it.
 *
 * A file with the same old heading twice keeps its shape: both are renamed (the
 * duplication was already there and is not this migration's business), or both
 * fold into the one target section.
 */
function operationsFor(body: string, to: DocLanguage): Operations {
  const byKind = new Map<SectionKind, string[]>();
  for (const range of findSections(body, 2)) {
    const heading = range.heading.trim();
    const kind = sectionKindOf(heading);
    if (kind === null) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), heading]);
  }

  const renames: SectionRename[] = [];
  const folds: SectionFold[] = [];
  for (const [kind, headings] of byKind) {
    const target = sectionNameFor(kind, to);
    const wanted = fold(target);
    /* "Todos" is the same word in both languages — nothing to migrate there,
       and this is where that falls out by itself. */
    const outdated = headings.filter((heading) => fold(heading) !== wanted);
    if (outdated.length === 0) continue;
    const into = headings.find((heading) => fold(heading) === wanted);
    if (into === undefined) {
      for (const from of outdated) renames.push({ kind, from, to: target });
    } else {
      for (const from of outdated) folds.push({ kind, from, into });
    }
  }
  return { renames, folds };
}

function isBlank(line: string | undefined): boolean {
  return (line ?? '').trim().length === 0;
}

/** The section's own lines, without the blank lines that were only spacing. */
function contentOf(lines: string[], start: number, end: number): string[] {
  let first = start;
  let last = end;
  while (first < last && isBlank(lines[first])) first += 1;
  while (last > first && isBlank(lines[last - 1])) last -= 1;
  return lines.slice(first, last);
}

/** The heading line rebuilt with a new name, keeping the user's indentation. */
function renamedHeading(line: string, name: string): string {
  const prefix = /^(\s*#{2}\s+)/.exec(line)?.[1] ?? '## ';
  return `${prefix}${name}`;
}

function applyRenames(body: string, renames: readonly SectionRename[]): string {
  if (renames.length === 0) return body;
  const wanted = new Map(renames.map((rename) => [fold(rename.from), rename.to]));
  const lines = body.split('\n');
  for (const range of findSections(body, 2)) {
    const name = wanted.get(fold(range.heading.trim()));
    if (name === undefined) continue;
    lines[range.headingLine] = renamedHeading(lines[range.headingLine] ?? '', name);
  }
  return lines.join('\n');
}

/**
 * One fold: the old section's lines out, the same lines appended to the target
 * section. Appended, not merged by date — `appendToSection` is the one routine
 * every write path in the app uses to put text under a heading, and the case
 * this migration exists for has the app's stray section *after* the user's own,
 * so appending is also the document's own order.
 */
function foldOnce(body: string, from: string, into: string): string {
  const wanted = fold(from);
  const source = findSections(body, 2).find((range) => fold(range.heading.trim()) === wanted);
  if (source === undefined) return body;

  const lines = body.split('\n');
  const content = contentOf(lines, source.start, source.end);
  const without = [...lines.slice(0, source.headingLine), ...lines.slice(source.end)].join('\n');
  /* An empty section is only its heading — that goes, and there is no line to move. */
  if (content.length === 0) return without;
  return appendToSection(without, into, content.join('\n')).content;
}

/**
 * The migrated body. Renames first (they move no line), then one fold at a
 * time, each against the text as it stands after the previous one — so no index
 * from an earlier scan is ever used on a body that has since shifted.
 */
export function migrateSectionHeadings(body: string, to: DocLanguage): string {
  let current = applyRenames(body, operationsFor(body, to).renames);
  for (;;) {
    const next = operationsFor(current, to).folds[0];
    if (next === undefined) return current;
    const folded = foldOnce(current, next.from, next.into);
    /* Nothing moved although something was planned: stop instead of looping. */
    if (folded === current) return current;
    current = folded;
  }
}

/**
 * Which files carry section headings in the other document language, and what
 * would happen to them. Files with nothing to do are not in the plan, so an
 * already-migrated vault yields `[]`.
 */
export function planSectionMigration(
  docs: readonly MigratableDoc[],
  to: DocLanguage,
): SectionMigrationEntry[] {
  const plan: SectionMigrationEntry[] = [];
  for (const doc of docs) {
    if (!isMigratablePath(doc.path)) continue;
    const { renames, folds } = operationsFor(doc.body, to);
    if (renames.length === 0 && folds.length === 0) continue;
    plan.push({ path: doc.path, hash: doc.hash, renames, folds });
  }
  return plan;
}

async function migrateOne(
  store: SectionMigrationStore,
  entry: SectionMigrationEntry,
  to: DocLanguage,
): Promise<SectionMigrationResult> {
  const at = (outcome: SectionMigrationOutcome, ops: Operations = NOTHING) => ({
    path: entry.path,
    outcome,
    renames: ops.renames.length,
    folds: ops.folds.length,
  });

  if (!isMigratablePath(entry.path)) return at('skipped');
  const doc = await store.read(entry.path);
  if (doc === null) return at('missing');
  /* The hash of the plan, not of what was just read: a file that moved on is a
     conflict, and nothing is written for it. */
  if (doc.hash !== entry.hash) return at('conflict');

  const operations = operationsFor(doc.body, to);
  const body = migrateSectionHeadings(doc.body, to);
  if (body === doc.body) return at('unchanged', operations);

  try {
    await store.write({ path: entry.path, body, expectedHash: entry.hash });
  } catch (error) {
    if (error instanceof VaultConflictError) return at('conflict');
    throw error;
  }
  return at('migrated', operations);
}

/**
 * Runs a plan. One result per entry, in the plan's order; a conflict on one
 * file does not stop the others, because the user asked for the run and half of
 * it done is better than a batch abandoned over a file they happen to have open
 * in Obsidian.
 */
export async function applySectionMigration(
  store: SectionMigrationStore,
  plan: readonly SectionMigrationEntry[],
  to: DocLanguage,
): Promise<SectionMigrationResult[]> {
  const results: SectionMigrationResult[] = [];
  for (const entry of plan) {
    results.push(await migrateOne(store, entry, to));
  }
  return results;
}
