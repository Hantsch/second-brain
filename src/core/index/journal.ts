/**
 * Journal entries: a day is a file (`journal/YYYY/MM/YYYY-MM-DD.md`).
 *
 * Everything here is derived. `turns` counts the speaker lines in the
 * "Conversation" section — two lines make one turn; a turn that's only
 * started still counts, so an unanswered question doesn't disappear.
 */

import type { JournalDay } from '@shared/types';
import { excerpt, extractSections } from '@core/vault/doc';
import { baseName } from '@core/vault/paths';
import { asDate, asStringList, contentLines } from './text';
import type { IndexedDoc } from './types';

/** Section with the coaching dialogue, compared lowercased. */
const DIALOGUE_SECTIONS = new Set(['gespräch', 'gespraech', 'conversation']);

/** A speaker line: `> **Ich** — 18:40`. */
const SPEAKER = /^>\s*\*\*[^*]+\*\*/;

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()))
    return Number(value.trim());
  return null;
}

/** Date from the frontmatter, otherwise from the file name. */
function dateOf(doc: IndexedDoc): string {
  const declared = asDate(doc.frontmatter['date']);
  if (declared !== null) return declared;
  const name = baseName(doc.path);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(name);
  return match?.[1] ?? '';
}

/** Speaker lines in the dialogue section → turns. */
export function countTurns(body: string): number {
  let speakers = 0;
  for (const [heading, text] of extractSections(body)) {
    if (!DIALOGUE_SECTIONS.has(heading.trim().toLowerCase())) continue;
    for (const { line } of contentLines(text)) {
      if (SPEAKER.test(line)) speakers += 1;
    }
  }
  return Math.ceil(speakers / 2);
}

/** First paragraph under '## Tag', otherwise the first paragraph of the body. */
function dayExcerpt(body: string, maxChars = 200): string {
  for (const [heading, text] of extractSections(body)) {
    if (heading.trim().toLowerCase() !== 'tag' && heading.trim().toLowerCase() !== 'day') continue;
    const found = excerpt(text, maxChars);
    if (found.length > 0) return found;
  }
  return excerpt(body, maxChars);
}

/** An indexed document as a journal entry. */
export function toJournalDay(doc: IndexedDoc): JournalDay {
  return {
    path: doc.path,
    date: dateOf(doc),
    title: doc.title,
    mood: numberOf(doc.frontmatter['mood']),
    energy: numberOf(doc.frontmatter['energy']),
    people: asStringList(doc.frontmatter['people']),
    projects: asStringList(doc.frontmatter['projects']),
    tags: doc.tags,
    excerpt: dayExcerpt(doc.body),
    wordCount: doc.words,
    turns: countTurns(doc.body),
  };
}

/** All journal entries, most recent first. */
export function deriveJournalDays(docs: readonly IndexedDoc[]): JournalDay[] {
  const days: JournalDay[] = [];
  for (const doc of docs) {
    if (doc.docType !== 'journal') continue;
    days.push(toJournalDay(doc));
  }
  days.sort((a, b) =>
    a.date === b.date ? a.path.localeCompare(b.path) : a.date < b.date ? 1 : -1,
  );
  return days;
}
