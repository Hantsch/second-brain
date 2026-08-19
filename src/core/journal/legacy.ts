/**
 * The one-time fold of a legacy day (011, D5): the separate
 * "Gespräch"/"Conversation" section moves into the day stream under
 * "Tag"/"Day", and the legacy heading disappears.
 *
 * This is a **pure text function**. It takes the body, it returns a body — no
 * store, no clock, no `Date.now()`. That is deliberate: a migration that
 * rewrites a whole day file has to be assertable byte for byte in a test, and
 * anything that depends on "now" would make it unassertable. Whoever calls it
 * (`journal:foldDay`, D6) is the one that reads, hash-guards, confirms with the
 * human and writes — nothing here runs on its own, and nothing calls this
 * automatically (the story: "nothing is migrated behind my back").
 *
 * What it does to the file, and why:
 *
 * - **No conversation section, no change.** The body comes back as the very same
 *   string — not re-indented, not re-trimmed. A fold that has nothing to fold
 *   must not be able to touch a single byte.
 * - **My turns become plain prose**, the app's turns become the blockquote block
 *   `stream.ts#formatAnswer` writes. That is the format decision of 011: in the
 *   stream, my own words look exactly like something I typed there directly, and
 *   only the app's words are quoted.
 * - **The turn texts are taken over verbatim**; only the surrounding form
 *   changes. See "What is lost" below for the metadata that the target format
 *   has no place for.
 * - **Frontmatter is never touched**, by construction: this module's `body` is
 *   the text *below* the frontmatter block everywhere in `journal/*` (`readDay`
 *   hands on `doc.body`, which `parse()` has already split off), so the YAML is
 *   not part of the input at all. Callers must keep passing `doc.body`, not the
 *   file content.
 * - **"Fakten"/"Facts" comes back byte-identical**, heading and content, and in
 *   the same place relative to the other sections: no line inside that range is
 *   read, moved or rewritten. docs/VAULT-FORMAT.md puts it last (Day,
 *   Conversation, Facts), but nothing here relies on that — the fold works on
 *   the ranges it finds, in whatever order a hand-edited file has them.
 *
 * **What is lost, knowingly** — a fold is the one write path in this module that
 * removes lines, so each of these is a decision, not an accident:
 *
 * 1. **The speaker label and the timestamp of my own turns.** Prose in the
 *    stream carries neither; that is precisely what "my turns as prose" means.
 *    The sentence itself survives verbatim.
 * 2. **Lines in the conversation section that were not a readable turn** — a
 *    blockquote without a speaker, a foreign speaker, a hand-written margin
 *    note. `parseDialog` skips them (that leniency is inherited here on
 *    purpose), and removing the section removes them with it. Keeping them would
 *    leave them orphaned in a body whose heading is gone. This is the accepted
 *    trade-off of this deliverable, and it is why the fold is a single explicit
 *    action the human confirms first (D9) instead of something the app does on
 *    its own.
 * 3. **A non-canonical app speaker label.** `parseDialog` also accepts "Coach"
 *    or "Brain" as the app; the folded block always says "Second Brain", because
 *    otherwise `parseStream` would not read it back as an answer.
 *
 * Known limit, not handled: if one of my own turns quotes an app speaker line
 * inside itself (`> > **Second Brain** — 10:00`), that line becomes a real
 * answer block once my turn is prose. Recognising that would mean guessing at
 * nested quoting; a hand-written case that rare is better left visible in the
 * file than silently rewritten.
 */

import type { DocLanguage } from '@shared/types';
import { findSections } from '@core/vault/sections';
import type { SectionRange } from '@core/vault/sections';
import { parseDialog } from './dialog';
import { isSectionOf, journalSections } from './sections';
import { formatAnswer } from './stream';
import type { DialogTurn } from './types';

/**
 * The timestamp a folded app answer gets when its speaker line carried none.
 * The block format needs a time, this function has no "now" to fall back on, and
 * guessing a plausible one would be inventing content. `00:00` is the visible
 * placeholder instead — readable as "no time was recorded", not mistakable for a
 * measurement.
 */
const MISSING_TIME = '00:00';

/** Where folded content goes, and what goes there. Empty `lines` = nothing to do. */
interface Insertion {
  at: number;
  lines: readonly string[];
}

/** The turn as it belongs in the stream: my words as prose, the app's as a quote. */
function blockFor(turn: DialogTurn, lang: DocLanguage): string {
  const text = turn.text.replace(/\r\n/g, '\n').trim();
  return turn.role === 'user' ? text : formatAnswer(text, turn.at ?? MISSING_TIME, lang);
}

/**
 * First line *after* the last content line of the section — trailing blank lines
 * belong to the gap before the next heading, so folded content goes in front of
 * them and the spacing of the following section stays as the user had it.
 */
function endOfContent(lines: readonly string[], section: SectionRange): number {
  let at = section.end;
  while (at > section.start && (lines[at - 1] ?? '').trim().length === 0) at -= 1;
  return at;
}

/**
 * Folded content is appended at the *end* of the day section: whatever prose is
 * already there keeps its place, the conversation follows it. Each block gets a
 * blank line in front so prose stays prose and a quote stays its own block.
 *
 * If the file has no day section at all (hand-edited legacy), one is created
 * where the conversation stood — that keeps the content in its old position
 * relative to "Fakten" instead of moving it to the end of the file. A day
 * section is only created when there is something to put in it.
 */
function insertionOf(
  lines: readonly string[],
  day: SectionRange | undefined,
  firstDialogue: SectionRange,
  blocks: readonly string[],
  lang: DocLanguage,
): Insertion {
  const content = blocks.flatMap((block) => ['', ...block.split('\n')]);
  if (day !== undefined) return { at: endOfContent(lines, day), lines: content };
  if (content.length === 0) return { at: 0, lines: [] };
  return {
    at: firstDialogue.headingLine,
    lines: [`## ${journalSections(lang).day}`, ...content],
  };
}

/**
 * Fold a legacy day: every turn of the conversation section appears exactly once
 * in the day stream afterwards, in its original order, and the conversation
 * section is gone. A body without such a section is returned unchanged.
 *
 * `lang` only decides the wording of a day heading that has to be created; the
 * headings that are already in the file are the ones that count (`sections.ts`).
 */
export function foldLegacyDay(body: string, lang: DocLanguage = 'de'): string {
  const sections = findSections(body, 2);
  const dialogues = sections.filter((range) => isSectionOf(range.heading, 'dialogue'));
  const firstDialogue = dialogues[0];
  /* Nothing to fold: the same string back, byte for byte. */
  if (firstDialogue === undefined) return body;

  /* `parseDialog` reads every conversation section of the body in document
     order, so a hand-edited file with both "Gespräch" and "Conversation" folds
     in the order it reads, and both headings go. */
  const blocks = parseDialog(body).map((turn) => blockFor(turn, lang));
  const lines = body.split('\n');
  /* The *first* day section, like `sectionIn`/`appendToSection` pick it — a file
     with two of them keeps appending into the one it already started with. */
  const day = sections.find((range) => isSectionOf(range.heading, 'day'));
  const insertion = insertionOf(lines, day, firstDialogue, blocks, lang);
  const removed = (at: number): boolean =>
    dialogues.some((range) => at >= range.headingLine && at < range.end);

  const kept: string[] = [];
  for (let at = 0; at <= lines.length; at += 1) {
    if (at === insertion.at) kept.push(...insertion.lines);
    if (at === lines.length) break;
    if (removed(at)) continue;
    kept.push(lines[at] ?? '');
  }
  return kept.join('\n');
}
