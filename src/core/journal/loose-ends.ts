/**
 * Loose ends: a day announced something for a later day — "morgen bin ich beim
 * Notar" — that day has come and gone, and nothing since says how it went.
 *
 * Derived, never read from a file and never stored: the caller hands over the
 * days it already has (the same `body` the index carries) plus the todos, and
 * gets a list back. Same input, same output, same ids — no clock, no `ranAt`, so
 * `.secondbrain/index/` stays deletable (CLAUDE.md: "the index is derived").
 *
 * The rule, in order:
 *
 * 1. Only the user's own `entry` blocks of the "Day" stream count (`parseStream`).
 *    An `answer` block is the app's own text — an announcement it wrote itself
 *    would be a loose end of its own making.
 * 2. Per sentence, the dates come from `findDates()` (`@core/capture`), resolved
 *    against **the day the sentence stands in**: "morgen" in a day from last week
 *    means the day after that day, not tomorrow.
 * 3. One of those dates has to be **forward-looking** (`isForward`) and lie
 *    strictly between the day itself and today. Strictly: an announcement for
 *    today or later has not come due yet, and one for the day itself or earlier
 *    is a report, not an announcement.
 * 4. What is already answered drops out: a later day that links this day and
 *    picks its subject back up, or a todo carrying the subject and a deadline.
 *
 * Scope of the heuristic, deliberately: `findDates()` resolves German relative
 * phrasing plus language-neutral dates (`15.08.`, `2026-08-15`, `KW 34`). English
 * relative phrasing ("tomorrow", "next week") resolves to no date at all and can
 * therefore not produce a loose end here — that is the model pass's job, not this
 * one's. An English sentence naming a real date works exactly like a German one.
 */

import type { IndexedDoc } from '@core/index/types';
import type { JournalDay, LooseEnd, Todo } from '@shared/types';
import { findDates } from '@core/capture';
import { collapse, fold } from '@core/index/text';
import { sha256 } from '@core/vault/hash';
import { parseStream } from './stream';

/**
 * A day as this rule needs it: where the file is and what is in it. Deliberately
 * only the two fields it reads, so a caller can pass a `JournalDay` straight from
 * the index — and a test does not have to fake fifteen fields it never touches.
 */
export interface LooseEndDay {
  day: Pick<JournalDay, 'date' | 'path'>;
  doc: Pick<IndexedDoc, 'body' | 'bodyLine'>;
}

/** A todo as this rule reads it: its wording and whether it carries a deadline. */
export type LooseEndTodo = Pick<Todo, 'text' | 'due'>;

/** Length of the id — the same 16 hex characters `todoId` uses. */
const ID_CHARS = 16;

/**
 * The stable id of a loose end: the day plus the sentence, nothing time-based.
 * One function, because the model pass (`loose-ends-llm.ts`) has to arrive at the
 * same id for the same sentence — otherwise the same loose end could be answered
 * twice, and a dismissal would not survive the run that found it.
 */
export function looseEndId(day: string, quote: string): string {
  return sha256(`${day}\n${quote}`).slice(0, ID_CHARS);
}
/** Shorter words carry no subject ("bin", "der") — a hit on those is noise. */
const MIN_TERM = 4;
/** A subject is a handle, not a summary. */
const MAX_SUBJECT_WORDS = 6;

/**
 * Words that never name what was announced: function words in both languages,
 * every word that is itself a date, and every spelled-out number — "um zwei" is
 * a clock reading, not a topic, and a number written in digits is dropped
 * already. Everything else in a sentence is fair game as a subject term.
 */
const NOISE = new Set(
  `
  aber alle allen also auch beim bereits dabei damit dann dass davon dazu dein deine denn
  dich diese diesem diesen dieser dieses doch dort durch eigentlich eine einem einen einer
  eines endlich erst etwas gerade gibt habe haben hatte hatten hier immer jetzt kann kaum
  koennen machen mache mehr mein meine meinen muss muessen nach nicht noch nochmal oder
  ohne schon sehr sein seine sich sind soll sollte ueber viel vielen vielleicht wann weil
  weiter wenn werde werden wieder will wird wollte wurde wurden
  about after again also because been before could does from gets going have into just
  know like make more much need only over said should some still than that them then
  there these they this through want well were what when will with would your
  heute morgen gestern uebermorgen naechste naechsten naechster naechstes kommende
  kommenden kommender woche wochen monat monats monatsende ende tage tagen jahr
  montag dienstag mittwoch donnerstag freitag samstag sonnabend sonntag
  januar februar maerz april juni juli august september oktober november dezember
  today tomorrow yesterday week weeks month next monday tuesday wednesday thursday
  friday saturday sunday january february march june july october december
  eins zwei drei vier fuenf sechs sieben acht neun zehn zwoelf zwanzig hundert tausend
  three four five seven eight nine eleven twelve twenty thirty hundred thousand
  `.split(/\s+/u),
);

/** Weekday labels `findDates()` produces, folded — always projected forward. */
const WEEKDAYS = new Set([
  'montag',
  'dienstag',
  'mittwoch',
  'donnerstag',
  'freitag',
  'samstag',
  'sonnabend',
  'sonntag',
]);

/**
 * Relative phrases that point forward. `heute` and `gestern` are deliberately
 * absent: neither of them announces anything.
 */
const FORWARD_PHRASES: readonly RegExp[] = [
  /^morgen$/,
  /^uebermorgen$/,
  /^(naechste|kommende)[nrs]?\s+woche$/,
  /^in\s+(einer|zwei)\s+wochen?$/,
  /^(monatsende|ende\s+des\s+monats)$/,
];

/**
 * Is this date reference an announcement?
 *
 * A reference carrying digits is a date the user wrote out (`15.08.`, `KW 34`,
 * "in 3 Tagen"). Whether it lies ahead is then the date's business, not the
 * wording's — and step 3 of the rule has already decided that.
 *
 * A bare weekday is the one ambiguous case: `findDates()` always projects
 * `Freitag` forward, so "am Freitag war der Notar da" would resolve to a day that
 * was never announced. It therefore only counts with a word in front of it that
 * can only mean the future. Anything softer is left to the model pass — an
 * invented loose end costs the user more than one this rule passes on.
 */
function isForward(label: string, sentence: string): boolean {
  const key = collapse(fold(label));
  if (/\d/.test(key)) return true;
  if (FORWARD_PHRASES.some((phrase) => phrase.test(key))) return true;
  if (!WEEKDAYS.has(key)) return false;
  return new RegExp(`(naechste|kommende)[nrs]?\\s+${key}`, 'u').test(fold(sentence));
}

/** A sentence out of an entry block, with the line it starts on. */
interface Fragment {
  text: string;
  /** 0-based, relative to the block's first line. */
  line: number;
}

/** Leading markdown that is structure, not prose. */
const LEAD_MARKERS = /^\s{0,3}(?:>\s?)*(?:[-*+]\s+|\d+[.)]\s+)?/;
const HEADING = /^\s{0,3}#{1,6}\s/;
/** A line that opens a block of its own — whatever came before it has ended. */
const BLOCK_OPENER = /^\s{0,3}(?:>|[-*+]\s|\d+[.)]\s|#{1,6}\s)/;
/** End of a sentence — never the dot of `15.08.`, which belongs to the date. */
const SENTENCE_END = /(?<!\d)[.!?…]+(?:\s+|$)/gu;

/** The sentences on one line, plus whether the last one is still open. */
function splitLine(line: string): { parts: string[]; open: boolean } {
  const body = line.replace(LEAD_MARKERS, '');
  const parts: string[] = [];
  let at = 0;
  for (const match of body.matchAll(SENTENCE_END)) {
    if (match.index === undefined) continue;
    const end = match.index + match[0].length;
    const piece = collapse(body.slice(at, end));
    if (piece.length > 0) parts.push(piece);
    at = end;
  }
  const rest = collapse(body.slice(at));
  if (rest.length > 0) parts.push(rest);
  return { parts, open: rest.length > 0 };
}

/**
 * The sentences of an entry block. A soft line break inside a paragraph keeps a
 * sentence together — a blank line, a heading or a new list item ends it, since
 * those start a new thought instead of continuing one.
 */
export function sentencesOf(text: string): Fragment[] {
  const found: Fragment[] = [];
  let buffer = '';
  let start = 0;
  const flush = (): void => {
    if (buffer.length > 0) found.push({ text: buffer, line: start });
    buffer = '';
  };

  text.split('\n').forEach((line, index) => {
    if (line.trim().length === 0 || HEADING.test(line)) {
      flush();
      return;
    }
    if (buffer.length > 0 && BLOCK_OPENER.test(line)) flush();
    const { parts, open } = splitLine(line);
    parts.forEach((piece, at) => {
      if (buffer.length === 0) start = index;
      buffer = buffer.length === 0 ? piece : `${buffer} ${piece}`;
      if (at < parts.length - 1 || !open) flush();
    });
  });
  flush();
  return found;
}

/** A candidate subject word with the offset it stands at. */
interface Word {
  text: string;
  at: number;
}

/** Everything in a sentence that could name a subject, in reading order. */
function contentWords(sentence: string): Word[] {
  const words: Word[] = [];
  for (const match of sentence.matchAll(/[\p{L}\p{N}]+/gu)) {
    const key = fold(match[0]);
    if (match.index === undefined) continue;
    if (key.length < MIN_TERM || /\d/.test(key) || NOISE.has(key)) continue;
    words.push({ text: match[0], at: match.index });
  }
  return words;
}

/**
 * The words of a sentence that name its subject, in their own spelling.
 *
 * `at` is where the date reference stands. It is the anchor, because a paragraph
 * without full stops is one single sentence here (`sentencesOf`) and the
 * announcement is then rarely its first clause — taking the head of the sentence
 * named a trip to the Mondsee "vormittag ruhig lost vereinzelt paar fragen".
 *
 * Read **forward** from the reference: both languages put what was announced
 * behind a fronted date ("Morgen bin ich beim Notar", "fahr dann morgen so um
 * zwei nach Mondsee"). Only when nothing follows it ("The notary signing is on
 * 2026-08-19") does the subject lie in front, and then it is the words nearest
 * to it. Deliberately not a window on both sides at once: what stands just
 * before an announcement is usually the tail of the previous clause, and
 * dragging that in is the very bug this rule fixes.
 *
 * `at = 0` reads the whole sentence from its start — for a caller that has no
 * date reference at hand this is exactly the old behaviour.
 */
function subjectWords(sentence: string, at = 0): string[] {
  const words = contentWords(sentence);
  const start = words.findIndex((word) => word.at >= at);
  const ahead = start === -1 ? [] : words.slice(start);
  const picked =
    ahead.length > 0 ? ahead.slice(0, MAX_SUBJECT_WORDS) : words.slice(-MAX_SUBJECT_WORDS);
  return picked.map((word) => word.text);
}

/**
 * The terms a subject is recognized by elsewhere: folded, deduplicated, and
 * compared as substrings — German glues words together ("Notartermin" is "Notar"
 * plus "Termin"), and a whole-word comparison would miss exactly that.
 *
 * `at` is the offset of the date reference in `text`, when the caller knows it:
 * the terms have to be the same words the subject shows, or a loose end would be
 * subtracted by a different name than the one it is displayed under.
 */
export function subjectTerms(text: string, at = 0): string[] {
  return [...new Set(subjectWords(text, at).map(fold))];
}

/** Wikilink targets in a text, reduced to their last path segment. */
function linkTargets(text: string): Set<string> {
  const targets = new Set<string>();
  for (const match of text.matchAll(/\[\[([^\]]+)\]\]/gu)) {
    const target = (match[1] ?? '').split('|')[0]?.trim() ?? '';
    const leaf = target.split('/').pop();
    if (leaf !== undefined && leaf.length > 0) targets.add(leaf);
  }
  return targets;
}

/** A day reduced to what the subtraction needs: its own words, folded once. */
interface EntryText {
  date: string;
  folded: string;
  links: Set<string>;
}

function entryTextOf(source: LooseEndDay): EntryText {
  const text = parseStream(source.doc.body)
    .filter((block) => block.kind === 'entry')
    .map((block) => block.text)
    .join('\n\n');
  return { date: source.day.date, folded: fold(text), links: linkTargets(text) };
}

/**
 * Is it settled? Two ways, both readable off the vault and neither of them a
 * state the app would have to write down anywhere:
 *
 * - a **later day links this day and picks its subject back up** — that is a
 *   person coming back to it in their own words;
 * - a **todo with a deadline** carries the subject: then the loose end has a home
 *   already, and the todo list is where it gets chased, not here.
 *
 * The two checks read the subject at different widths on purpose. The todo
 * check is `.every` — every term has to show up in the *same* todo sentence —
 * so narrowing the terms to the words right around the date (`at`-anchored)
 * only makes that easier to satisfy correctly, which is the point of the
 * at-anchoring. The link check is `.some` — any *one* term found anywhere in
 * the later day's prose is enough — and there a narrower term set makes the
 * match *harder*, not easier: fewer terms means fewer chances for one of them
 * to appear in the later day's own wording. That branch therefore keeps
 * reading the subject from the head of the sentence (no `at`), the same
 * broader window it always used, so a later day answering in different words
 * still gets recognized.
 */
function isAnswered(
  day: string,
  quote: string,
  at: number | undefined,
  entries: readonly EntryText[],
  dated: readonly string[],
): boolean {
  const narrow = subjectTerms(quote, at);
  if (narrow.length > 0 && dated.some((text) => narrow.every((term) => text.includes(term)))) {
    return true;
  }
  const broad = subjectTerms(quote);
  return entries.some(
    (entry) =>
      entry.date > day &&
      entry.links.has(day) &&
      (broad.length === 0 || broad.some((term) => entry.folded.includes(term))),
  );
}

/**
 * The subtraction of step 4, prepared once for a whole stock: "is the
 * announcement in `quote`, made on `day`, already settled?"
 *
 * Exported because the model pass (`loose-ends-llm.ts`) has to apply exactly the
 * same subtraction to what a model proposes — AC 6 and AC 8 are properties of a
 * loose end, not of the detector that found it, and a second implementation of
 * "already answered" would be a second truth that drifts.
 *
 * A factory rather than a plain function: the day texts and the dated todos are
 * folded once per stock, not once per candidate.
 *
 * `at` is the offset of the date reference inside `quote`, for a caller that has
 * it (`findLooseEnds`); without it the subject is read from the head of the
 * quote, as before.
 */
export function settledCheck(
  days: readonly LooseEndDay[],
  todos: readonly LooseEndTodo[],
): (day: string, quote: string, at?: number) => boolean {
  const entries = days.map(entryTextOf);
  const dated = todos.filter((todo) => todo.due !== null).map((todo) => fold(todo.text));
  return (day, quote, at) => isAnswered(day, quote, at, entries, dated);
}

/**
 * Every announcement whose day has passed unanswered, oldest first.
 *
 * `today` comes from the caller — nothing here asks the clock, or the rule would
 * not be testable (same reasoning as `@core/capture/dates.ts`).
 */
export function findLooseEnds(
  days: readonly LooseEndDay[],
  todos: readonly LooseEndTodo[],
  today: string,
): LooseEnd[] {
  const settled = settledCheck(days, todos);
  const found = new Map<string, LooseEnd>();

  for (const source of days) {
    const { date, path } = source.day;
    if (date >= today) continue;

    for (const block of parseStream(source.doc.body)) {
      if (block.kind !== 'entry') continue;
      for (const sentence of sentencesOf(block.text)) {
        const hit = findDates(sentence.text, date).find(
          (candidate) =>
            candidate.iso > date &&
            candidate.iso < today &&
            isForward(candidate.label, sentence.text),
        );
        if (hit === undefined) continue;

        if (settled(date, sentence.text, hit.at)) continue;
        const words = subjectWords(sentence.text, hit.at);

        const id = looseEndId(date, sentence.text);
        if (found.has(id)) continue;
        found.set(id, {
          id,
          day: date,
          path,
          line: source.doc.bodyLine + block.line + sentence.line,
          quote: sentence.text,
          subject: words.join(' '),
          refDate: hit.iso,
          origin: 'heuristic',
        });
      }
    }
  }

  return [...found.values()].sort((a, b) => a.day.localeCompare(b.day) || a.line - b.line);
}
