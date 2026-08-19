/**
 * The three sections of a journal entry (docs/VAULT-FORMAT.md): "Day" carries
 * what happened, "Conversation" the coaching dialogue, "Facts" what the day
 * close extracted and the human confirmed.
 *
 * Two things this file decides, and only this file:
 *
 * - **What the heading is called.** In the document language — the index
 *   knows both versions (`core/index/journal.ts`).
 * - **Which heading is used when the file already has one.** If the file has
 *   "## Gespräch" and the document language has since become English, content
 *   is appended below it rather than creating a second section "Conversation".
 *   The user's file sets the tone, not the setting.
 */

import type { DocLanguage } from '@shared/types';
import { SECTION_DAY, SECTION_FACTS } from '@core/capture';
import { fold } from '@core/index/text';
import { findSections } from '@core/vault/sections';
import { assistantBlockSpans } from './dialog';

/** An ATX heading, as `core/vault/sections` recognizes it. */
const HEADING = /^ {0,3}#{1,6}\s/;

/** Which of the three sections is meant. */
export type JournalSectionKind = 'day' | 'dialogue' | 'facts';

/** The headings of a journal entry in one language. */
export type JournalSections = Record<JournalSectionKind, string>;

/* The German names come from `core/capture/actions` — two versions of them
   would mean two versions of docs/VAULT-FORMAT.md. */
const HEADINGS: Record<DocLanguage, JournalSections> = {
  de: { day: SECTION_DAY, dialogue: 'Gespräch', facts: SECTION_FACTS },
  en: { day: 'Day', dialogue: 'Conversation', facts: 'Facts' },
};

/**
 * Headings that count as the same section — compared folded, so that
 * "Gespräch" and "Gespraech" match the same thing.
 */
const ALIASES: Record<JournalSectionKind, readonly string[]> = {
  day: ['tag', 'day'],
  dialogue: ['gespraech', 'conversation'],
  facts: ['fakten', 'facts'],
};

/** The headings in this document language. */
export function journalSections(docLanguage: DocLanguage = 'de'): JournalSections {
  return HEADINGS[docLanguage] ?? HEADINGS.de;
}

/** Is this heading the named section? */
export function isSectionOf(heading: string, kind: JournalSectionKind): boolean {
  return ALIASES[kind].includes(fold(heading.trim()));
}

/**
 * The heading content gets appended under: the existing one if there is one,
 * otherwise the document language's.
 */
export function sectionIn(
  body: string,
  kind: JournalSectionKind,
  docLanguage: DocLanguage = 'de',
): string {
  const found = findSections(body, 2).find((range) => isSectionOf(range.heading, kind));
  return found?.heading.trim() ?? journalSections(docLanguage)[kind];
}

/** The text of a section; '' if it doesn't exist. Same-named ones are joined. */
export function sectionText(body: string, kind: JournalSectionKind): string {
  const lines = body.split('\n');
  const parts = findSections(body, 2)
    .filter((range) => isSectionOf(range.heading, kind))
    .map((range) => lines.slice(range.start, range.end).join('\n').trim());
  return parts.filter((part) => part.length > 0).join('\n\n');
}

/**
 * Everything that isn't "Conversation"/"Facts" or a heading line — the raw
 * material both `dayText` (below) and the day's *edit* surface
 * (`main/ipc/journal-day.ts#toView`'s no-heading fallback) start from.
 *
 * "Conversation" and "Facts" are dropped: the conversation also contains the
 * coach's own sentences, and "Facts" has already been extracted. Everything
 * else stays — including an embedded answer blockquote — even in a body
 * without any heading at all: a hand-written file is just as valid as one
 * the app created.
 *
 * This is deliberately the *unfiltered* version: `dayText` below additionally
 * strips answer blocks for reading (search, prompts, day close), but the
 * editor that writes the "Day" section back (`withDayText`) must start from
 * every byte that's actually there, or saving a heading-less day would
 * silently delete an answer the app wrote — the exact silent loss CLAUDE.md
 * rules out, just aimed at the app's own words instead of the human's.
 */
export function rawDayText(body: string): string {
  const dropped = findSections(body, 2).filter(
    (range) => isSectionOf(range.heading, 'dialogue') || isSectionOf(range.heading, 'facts'),
  );
  const kept = body
    .split('\n')
    .filter((line, at) => {
      if (HEADING.test(line)) return false;
      return !dropped.some((range) => at >= range.headingLine && at < range.end);
    })
    .join('\n');
  return kept.trim();
}

/**
 * What the human themself wrote about the day — the basis of every
 * extraction and every prompt.
 *
 * Since 011, an app answer can also live *inside* "Day" itself, interleaved
 * with the human's prose (`stream.ts`). Its blockquote is stripped out here
 * too, for the same reason "Conversation" is dropped: the coach's own sentence
 * must never come back as a todo the human supposedly wrote (see
 * `close.test.ts`). The scan runs across the whole body rather than just the
 * kept "Day" range — harmless where it overlaps an already-dropped section,
 * correct where the answer sits in the content that's kept.
 *
 * This is a *read* view, meant for search/prompts/close-out — never for
 * writing back. The edit surface uses `rawDayText` instead, which keeps the
 * answer blocks, precisely so this function's stripping never becomes a
 * deletion (see `rawDayText`'s doc comment).
 */
export function dayText(body: string): string {
  const raw = rawDayText(body);
  const rawLines = raw.split('\n');
  const answers = assistantBlockSpans(rawLines, 0, rawLines.length);
  if (answers.length === 0) return raw;
  return rawLines
    .filter((_line, at) => !answers.some((span) => at >= span.start && at < span.end))
    .join('\n')
    .trim();
}
