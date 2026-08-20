/**
 * Journal entries: a day is a file (`journal/YYYY/MM/YYYY-MM-DD.md`).
 *
 * Everything here is derived. `turns` (011: "app answers", not "exchanges")
 * counts assistant blockquote blocks — inside "Day"/"Tag" for the current
 * stream format (docs/VAULT-FORMAT.md), inside "Conversation"/"Gespräch" for
 * a legacy day that still has that section. The day-list dot only needs to
 * know the app said something today, not how the exchange was shaped.
 */

import type { JournalDay } from '@shared/types';
import { excerpt, extractSections } from '@core/vault/doc';
import { baseName } from '@core/vault/paths';
import { asDate, asStringList, contentLines, fold } from './text';
import type { IndexedDoc } from './types';

/** Section with the coaching dialogue, compared lowercased. */
const DIALOGUE_SECTIONS = new Set(['gespräch', 'gespraech', 'conversation']);

/** A speaker line: `> **Ich** — 18:40`. Captures the label so the caller can
 *  tell an assistant line from a user line. Up to 3 leading spaces tolerated
 *  before the `>`, matching `@core/journal/dialog.ts#SPEAKER_LINE` and this
 *  file's own `QUOTE_LINE` below — a speaker line indented like that still
 *  opens a real blockquote (CommonMark), and `parseStream`/`assistantBlockSpans`
 *  (the core module this file can't import, see `ASSISTANT_LABELS`) already
 *  accept it; this scanner used to require column 0 and silently missed it. */
const SPEAKER = /^ {0,3}>\s*\*\*\s*([^*]+?)\s*\*\*/;

/** Continuation of a blockquote: '> Text', '>' or '> '. */
const QUOTE_LINE = /^ {0,3}>\s?(.*)$/;

/**
 * Speaker labels that count as the app, folded and compared the same way
 * `fold` does. Duplicated from `@core/journal/dialog.ts#LABELS.assistant`
 * rather than imported: `@core/journal/day.ts` already imports
 * `deriveJournalDays`/`toJournalDay` from this file, so an import the other
 * way (`@core/index/journal.ts` → `@core/journal`) would close a cycle. Keep
 * both lists in sync if the assistant's speaker name ever changes.
 */
const ASSISTANT_LABELS = new Set(['second brain', 'secondbrain', 'brain', 'coach']);

function isAssistantLabel(label: string): boolean {
  return ASSISTANT_LABELS.has(fold(label).replace(/\s+/g, ' ').trim());
}

/** Is this heading the section that carries the day's own words? */
function isDaySection(heading: string): boolean {
  const key = heading.trim().toLowerCase();
  return key === 'tag' || key === 'day';
}

interface AnswerSpan {
  start: number;
  end: number;
}

/**
 * Line spans of assistant blockquote blocks in `lines` — a recognized
 * speaker line plus its quoted continuation, closed by anything that isn't a
 * '>' line. Mirrors `@core/journal/dialog.ts#assistantBlockSpans` closely
 * enough for deriving an index view (see the comment on `ASSISTANT_LABELS`
 * for why it's a local copy, not an import). A block without actual text
 * (just the speaker line) is not an answer — same rule `appendAnswer`
 * enforces on write.
 */
function assistantAnswerSpans(lines: readonly string[]): AnswerSpan[] {
  const spans: AnswerSpan[] = [];
  let start = -1;
  let content: string[] = [];
  const close = (end: number): void => {
    if (start >= 0 && content.join('\n').trim().length > 0) spans.push({ start, end });
    start = -1;
    content = [];
  };
  for (let at = 0; at < lines.length; at += 1) {
    const line = lines[at] ?? '';
    const speaker = SPEAKER.exec(line);
    if (speaker !== null) {
      close(at);
      if (isAssistantLabel(speaker[1] ?? '')) start = at;
      continue;
    }
    const quote = start >= 0 ? QUOTE_LINE.exec(line) : null;
    if (quote !== null) {
      content.push(quote[1] ?? '');
      continue;
    }
    close(at);
  }
  close(lines.length);
  return spans;
}

/** `text` with every assistant answer block removed — so an excerpt built
 *  from it never surfaces the app's own sentences. A no-op for text without
 *  any (a legacy day's "Day" section never had one to begin with). */
function stripAssistantAnswers(text: string): string {
  const lines = text.split('\n');
  const spans = assistantAnswerSpans(lines);
  if (spans.length === 0) return text;
  return lines
    .filter((_line, at) => !spans.some((span) => at >= span.start && at < span.end))
    .join('\n');
}

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

/**
 * App answers in the day: assistant blockquote blocks inside "Day"/"Tag"
 * (011 stream format), plus assistant speaker lines inside
 * "Conversation"/"Gespräch" for a day that still has that legacy section.
 * The two passes are additive — a hand-edited day can have both, and nothing
 * from either is dropped.
 */
export function countTurns(body: string): number {
  let answers = 0;
  for (const [heading, text] of extractSections(body)) {
    if (isDaySection(heading)) {
      answers += assistantAnswerSpans(text.split('\n')).length;
      continue;
    }
    if (!DIALOGUE_SECTIONS.has(heading.trim().toLowerCase())) continue;
    for (const { line } of contentLines(text)) {
      const speaker = SPEAKER.exec(line);
      if (speaker !== null && isAssistantLabel(speaker[1] ?? '')) answers += 1;
    }
  }
  return answers;
}

/** First paragraph under '## Tag', with any app answer stripped out first —
 *  otherwise the first paragraph of the body. */
function dayExcerpt(body: string, maxChars = 200): string {
  for (const [heading, text] of extractSections(body)) {
    if (!isDaySection(heading)) continue;
    const found = excerpt(stripAssistantAnswers(text), maxChars);
    if (found.length > 0) return found;
  }
  return excerpt(stripAssistantAnswers(body), maxChars);
}

/** An indexed document as a journal entry. */
export function toJournalDay(doc: IndexedDoc): JournalDay {
  return {
    path: doc.path,
    date: dateOf(doc),
    title: doc.title,
    closed: asDate(doc.frontmatter['closed']),
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
