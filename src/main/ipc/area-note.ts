/* Moving a single note between two area files — the one write path in this area
 * that touches two files at once.
 *
 * Separate from `areas.ts` for the same reason `journal-day.ts` is separate from
 * `journal.ts`: the channels live there, what exactly happens in the files lives
 * here. Two promises hold above everything else:
 *
 * - **The block is sliced out, never rebuilt.** What gets written into the target
 *   is the entry as it stands in the source, character for character. A
 *   reconstruction from the parsed heading plus the parsed text would already
 *   differ from the file when someone wrote `###   2026-08-04` with two spaces —
 *   and the note would land in the target in a shape the user never wrote.
 * - **Either both files change or neither does.** If the append into the target
 *   fails, the removal in the source is taken back. A note that is in no file at
 *   all is the one outcome this module exists to prevent.
 */

import { AREA_ENTRY_LEVEL } from '@core/areas';
import { parseAreaNotes } from '@core/index';
import { findSections } from '@core/vault';
import type { WriteResult } from '@shared/types';
import { fail } from './errors';

/** What the move needs from the store — narrow, so the rollback is testable. */
export interface NoteMoveStore {
  write(input: { path: string; body?: string; expectedHash?: string }): Promise<WriteResult>;
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<{ path: string; hash: string }>;
}

/** The file the note leaves. */
export interface NoteMoveSource {
  path: string;
  /** The body without the note — what gets written. */
  body: string;
  /** The body as it stands now — what the rollback puts back. */
  previous: string;
  /** Hash of the file as it was read: the guard on the removal. */
  hash: string;
}

/** The file the note arrives in. */
export interface NoteMoveTarget {
  path: string;
  /** The notes heading of *this* file — the existing one wins (`areaSectionIn`). */
  section: string;
  /** Hash read right before the append; the target has no client-known hash. */
  hash: string;
  block: string;
}

/** The entry a line points at. */
export type NoteAt =
  /** A dated entry, with its block exactly as it stands in the file. */
  | { kind: 'entry'; block: string }
  /** Prose directly under the notes heading, without an entry heading of its own. */
  | { kind: 'lead' }
  /** No note starts on that line. */
  | { kind: 'missing' };

/**
 * The note that starts on file line `line`. `bodyLine` is the 1-based file line
 * of the first body line (`IndexedDoc.bodyLine`) — the same offset
 * `parseAreaNotes` reports its lines with.
 */
export function noteAt(doc: { body: string; bodyLine: number }, line: number): NoteAt {
  /* Which lines carry a note is `parseAreaNotes`' answer, not a second reading
     of the same file: only entries below a notes section count, and a lead note
     is told apart from a dated one by its missing heading. */
  const note = parseAreaNotes(doc.body, { lineOffset: doc.bodyLine }).find(
    (entry) => entry.line === line,
  );
  if (note === undefined) return { kind: 'missing' };
  if (note.heading === null) return { kind: 'lead' };

  const at = line - doc.bodyLine;
  const entry = findSections(doc.body, AREA_ENTRY_LEVEL).find((range) => range.headingLine === at);
  if (entry === undefined) return { kind: 'missing' };
  const block = doc.body.split('\n').slice(at, entry.end).join('\n');
  /* Trailing blank lines belong to the spacing between entries, not to the note.
     Leading ones cannot exist: the slice starts at the heading. */
  return { kind: 'entry', block: block.replace(/\s+$/, '') };
}

/** The note that line points at, or an honest refusal naming why not. */
export function requireNoteBlock(
  doc: { body: string; bodyLine: number },
  line: number,
  path: string,
): string {
  const found = noteAt(doc, line);
  if (found.kind === 'entry') return found.block;
  if (found.kind === 'lead') {
    /* Where such a note ends is a guess — the next entry, the end of the
       section, the end of the file. Guessing wrong would move the wrong text
       out of the user's file, so this says no instead. */
    throw fail(
      'invalid',
      `Zeile ${line} in ${path} ist ein Notiztext ohne Datums-Überschrift und lässt sich nicht verschieben`,
    );
  }
  throw fail('not-found', `in Zeile ${line} von ${path} beginnt keine Notiz`);
}

/**
 * Put the source file back the way it was. Reports whether it worked — a failed
 * rollback is the one case where the note really is nowhere, and that has to be
 * said out loud rather than hidden behind the original error.
 */
async function revert(
  store: NoteMoveStore,
  source: NoteMoveSource,
  hash: string,
): Promise<boolean> {
  try {
    await store.write({ path: source.path, body: source.previous, expectedHash: hash });
    return true;
  } catch (error) {
    console.warn('[areas] Rücknahme der Notiz fehlgeschlagen:', error);
    return false;
  }
}

/**
 * The two writes a move consists of: remove in the source, append in the target.
 * The source is written first — it is the file whose hash the client knows, so it
 * is the one whose conflict is meaningful. If the target's append fails, the
 * removal is taken back and the original error is what the caller sees.
 */
export async function applyNoteMove(
  store: NoteMoveStore,
  source: NoteMoveSource,
  target: NoteMoveTarget,
): Promise<{ from: WriteResult; to: WriteResult }> {
  const removed = await store.write({
    path: source.path,
    body: source.body,
    expectedHash: source.hash,
  });
  try {
    const appended = await store.append(target.path, target.section, target.block, {
      expectedHash: target.hash,
    });
    return { from: removed, to: { path: appended.path, hash: appended.hash, created: false } };
  } catch (error) {
    if (await revert(store, source, removed.hash)) throw error;
    /* Neither written nor put back: no note text in the message — the paths are
       what the user needs, the text is in neither log nor error. */
    throw fail(
      'io',
      `die Notiz konnte nicht in ${target.path} geschrieben und nicht in ${source.path} zurückgelegt werden`,
      { from: source.path, to: target.path },
    );
  }
}
