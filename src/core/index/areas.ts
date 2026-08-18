/**
 * Areas: read the file, count what is in it.
 *
 * An area is `areas/<slug>.md` with `type: area` — an ongoing responsibility
 * with no end (docs/VAULT-FORMAT.md). The filing path has been writing dated
 * blocks into these files for a while; this derivation is the read path that was
 * missing, so nothing lands somewhere the app can never look at again.
 *
 * Two rules carry the whole file, both of them about not losing anything:
 *
 * - **Headings are resolved, not assumed.** Which `##` heading holds the notes is
 *   `core/areas/sections` business, matched folded, so "Notizen" and "Notes" are
 *   the same section. One alias list, one place to get it wrong.
 * - **Nothing is dropped for being untidy.** An entry whose heading is no date,
 *   and text sitting under the notes section without any heading at all, both
 *   become notes and go to the end in file order. A hand-edited file is as valid
 *   as one the app wrote.
 */

import type { Area, AreaNote, Todo } from '@shared/types';
import { AREA_ENTRY_LEVEL, areaSectionRanges } from '@core/areas';
import { excerpt } from '@core/vault/doc';
import { baseName, extName } from '@core/vault/paths';
import { findSections } from '@core/vault/sections';
import type { SectionRange } from '@core/vault/sections';
import { asDate } from './text';
import { scopeFor } from './todos';
import type { IndexedDoc } from './types';

/** Length of `AreaNote.excerpt` — a preview, never the entry itself. */
const EXCERPT_CHARS = 240;

export interface AreaNoteParseOptions {
  /** 1-based line number of the first body line in the file (`IndexedDoc.bodyLine`). */
  lineOffset?: number;
  /**
   * Put the entry's text into `excerpt` exactly as it stands in the file instead
   * of the preview.
   *
   * The preview is not a shortened version of the entry: `excerpt()` takes the
   * first paragraph, drops markdown and folds every run of whitespace into one
   * space. That is right for a card and wrong for everything that wants the note
   * back — the `areas:notes` channel, which reads the file when the user expands
   * a section. The index itself stays on the preview: it must not become a copy
   * of the vault.
   */
  verbatim?: boolean;
}

/** Text of a line range, without leading and trailing blank lines. */
function textOf(lines: readonly string[], from: number, until: number): string {
  return lines.slice(from, Math.max(from, until)).join('\n').trim();
}

/** What lands in `AreaNote.excerpt`: the entry itself, or a preview of it. */
function noteText(text: string, verbatim: boolean): string {
  return verbatim ? text : excerpt(text, EXCERPT_CHARS);
}

/** First non-empty line in a range, or null if there is none. */
function firstContent(lines: readonly string[], from: number, until: number): number | null {
  for (let at = from; at < until; at += 1) {
    if ((lines[at] ?? '').trim().length > 0) return at;
  }
  return null;
}

/**
 * Text between the notes heading and the first entry. Usually there is none; if
 * there is, someone wrote it there by hand and it must not disappear just
 * because it carries no date.
 */
function leadNote(
  lines: readonly string[],
  section: SectionRange,
  until: number,
  offset: number,
  verbatim: boolean,
): AreaNote | null {
  const at = firstContent(lines, section.start, until);
  if (at === null) return null;
  return {
    day: null,
    heading: null,
    line: offset + at,
    excerpt: noteText(textOf(lines, at, until), verbatim),
  };
}

/**
 * Newest first. Entries without a parsable date go to the end and keep the order
 * they have in the file: `Array.sort` is stable, so equal days — and all the
 * undated ones — stay as they stand. Sorting an undated entry by a stand-in date
 * would silently shuffle the user's own file.
 */
function sortNotes(notes: AreaNote[]): AreaNote[] {
  return notes.sort((a, b) => {
    if (a.day === null || b.day === null) {
      if (a.day === b.day) return 0;
      return a.day === null ? 1 : -1;
    }
    return a.day === b.day ? 0 : a.day < b.day ? 1 : -1;
  });
}

/**
 * All note entries of an area body, newest first. Every notes section counts —
 * a file with two of them has both halves read.
 */
export function parseAreaNotes(body: string, options: AreaNoteParseOptions = {}): AreaNote[] {
  const offset = options.lineOffset ?? 1;
  const verbatim = options.verbatim === true;
  const lines = body.split('\n');
  const entries = findSections(body, AREA_ENTRY_LEVEL);
  const notes: AreaNote[] = [];

  for (const section of areaSectionRanges(body, 'notes')) {
    const inside = entries.filter(
      (entry) => entry.headingLine >= section.start && entry.headingLine < section.end,
    );
    const lead = leadNote(lines, section, inside[0]?.headingLine ?? section.end, offset, verbatim);
    if (lead !== null) notes.push(lead);
    for (const entry of inside) {
      notes.push({
        day: asDate(entry.heading),
        heading: entry.heading.trim(),
        line: offset + entry.headingLine,
        excerpt: noteText(textOf(lines, entry.start, entry.end), verbatim),
      });
    }
  }

  return sortNotes(notes);
}

/**
 * `areas/gesundheit.md` → `gesundheit`. The file name, not the frontmatter: the
 * same slug `areaPath()` builds and `core/capture/context` offers as a filing
 * target, so a deep link and a filing target mean the same area.
 */
function areaSlug(path: string): string {
  const name = baseName(path);
  return name.slice(0, name.length - extName(name).length) || name;
}

/** Open todos per file — every checkbox in an area file belongs to that area. */
function openTodosByPath(todos: readonly Todo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const todo of todos) {
    if (todo.state !== 'open') continue;
    counts.set(todo.path, (counts.get(todo.path) ?? 0) + 1);
  }
  return counts;
}

/** The newest note of an area, '' when it has none — areas without notes sort last. */
function newestDay(area: Area): string {
  return area.notes.find((note) => note.day !== null)?.day ?? '';
}

/**
 * Newest entry first. That answers "what did I think about lately" instead of
 * reciting the alphabet. Which area sits at the very top — the default one — is
 * the screen's decision, not the index's.
 */
function sortAreas(areas: Area[]): Area[] {
  return areas.sort((a, b) => {
    const left = newestDay(a);
    const right = newestDay(b);
    if (left !== right) return left < right ? 1 : -1;
    const byTitle = a.title.localeCompare(b.title);
    return byTitle !== 0 ? byTitle : a.path.localeCompare(b.path);
  });
}

/**
 * All areas from the indexed documents. `docs` may be the whole vault — the area
 * files are picked out here. `todos` are the already parsed checkboxes; counting
 * them again from the body would be a second reading of the same lines.
 */
export function deriveAreas(docs: readonly IndexedDoc[], todos: readonly Todo[] = []): Area[] {
  const openTodos = openTodosByPath(todos);
  const areas: Area[] = [];

  for (const doc of docs) {
    if (doc.docType !== 'area') continue;
    const notes = parseAreaNotes(doc.body, { lineOffset: doc.bodyLine });
    areas.push({
      path: doc.path,
      slug: areaSlug(doc.path),
      title: doc.title,
      // Path, frontmatter, tag, private — the order VAULT-FORMAT.md prescribes.
      scope: scopeFor(doc.path, doc.frontmatter),
      hash: doc.hash,
      noteCount: notes.length,
      openTodoCount: openTodos.get(doc.path) ?? 0,
      notes,
    });
  }

  return sortAreas(areas);
}
