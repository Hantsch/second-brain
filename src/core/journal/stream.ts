/**
 * The stream format of a day (011): my prose and the app's answers live together
 * under one heading — "## Day"/"## Tag" — in write order. Prose is plain
 * Markdown, as typed; an app answer is the same blockquote block
 * `dialog.ts#formatTurn` already writes for "Gaston", restricted to that
 * one speaker — a stream block is never authored by "me" as a quote.
 *
 * Reading is as lenient as `dialog.ts#parseDialog`, for the same reason: the
 * user is allowed to write in this file too.
 *
 * - **A recognized assistant block becomes an `answer`.** Everything else —
 *   plain paragraphs, but also a blockquote with no speaker, an unfamiliar
 *   speaker, or a broken continuation — stays exactly where it is, as the raw
 *   text of the surrounding `entry` block. That's the least surprising reading
 *   for a block a person added by hand: it survives untouched, still visibly a
 *   quote (its '>' marks aren't stripped), instead of vanishing or raising an
 *   error. It is deliberately *not* reinterpreted as a genuine assistant turn.
 *
 * `## Conversation`/`## Gespräch` is legacy (docs/VAULT-FORMAT.md) and is never
 * read here — only the "Day" section is scanned. Folding the legacy section
 * into the stream is a separate migration (D5 of 011), not this module's job.
 *
 * `appendEntry`/`appendAnswer` are the write side (D2): they append into "Day"
 * through `day.ts#appendToDay`, mirroring `dialog.ts#appendTurn` but targeting
 * the `day` section kind instead of `dialogue`.
 */

import type { DocLanguage } from '@shared/types';
import { findSections } from '@core/vault/sections';
import type { DateLike } from '@core/vault/paths';
import { appendToDay } from './day';
import { assistantBlockSpans, formatTurn, timeOf } from './dialog';
import { isSectionOf } from './sections';
import { JournalError } from './types';
import type { JournalBlock, JournalStore } from './types';

/** First non-blank line in `lines`, relative to `offset` — points an `entry`
 *  block at its actual content instead of a leading blank line. */
function firstContentLine(lines: readonly string[], offset: number): number {
  const at = lines.findIndex((line) => line.trim().length > 0);
  return offset + (at < 0 ? 0 : at);
}

function pushEntry(blocks: JournalBlock[], raw: readonly string[], start: number): void {
  const text = raw.join('\n').trim();
  if (text.length === 0) return;
  blocks.push({ kind: 'entry', text, line: firstContentLine(raw, start) });
}

/**
 * The ordered blocks of the "Day" section(s): plain-prose runs as `entry`,
 * embedded assistant blockquotes as `answer`. A legacy body (a separate
 * "Conversation" section alongside "Day") parses cleanly too — that other
 * section is never inspected, so a legacy day yields `entry` blocks only,
 * exactly its own prose.
 */
export function parseStream(body: string): JournalBlock[] {
  const lines = body.split('\n');
  const blocks: JournalBlock[] = [];
  for (const range of findSections(body, 2)) {
    if (!isSectionOf(range.heading, 'day')) continue;
    const spans = assistantBlockSpans(lines, range.start, range.end);
    let cursor = range.start;
    for (const span of spans) {
      pushEntry(blocks, lines.slice(cursor, span.start), cursor);
      blocks.push({ kind: 'answer', text: span.text, at: span.at, line: span.start });
      cursor = span.end;
    }
    pushEntry(blocks, lines.slice(cursor, range.end), cursor);
  }
  return blocks;
}

/**
 * The blockquote block for an app answer — exactly what `dialog.ts#formatTurn`
 * already produces for the `assistant` role. Exported so `appendEntry` (D2) can
 * append an answer without a second copy of the quoting rules.
 */
export function formatAnswer(text: string, at: string, docLanguage: DocLanguage = 'de'): string {
  return formatTurn('assistant', text, at, docLanguage);
}

/**
 * Options shared by `appendEntry`/`appendAnswer` — the write-side counterpart
 * of `parseStream` (D2 of 011). Lives here, not in `day.ts`: `formatAnswer`
 * (this module) is needed to build the block, and `day.ts` must not import
 * this module back (it would close a cycle through `dialog.ts`, which already
 * imports `appendToDay` from `day.ts`).
 */
export interface AppendEntryOptions {
  docLanguage?: DocLanguage;
  expectedHash?: string;
}

/**
 * Appends `text` as plain prose under "Day" — my own words, exactly as typed.
 * If the day's file is missing, it gets created, same as `appendTurn`.
 */
export async function appendEntry(
  store: JournalStore,
  date: DateLike,
  text: string,
  options: AppendEntryOptions = {},
): Promise<{ path: string; hash: string }> {
  const written = await appendToDay(store, date, 'day', text, {
    docLanguage: options.docLanguage,
    expectedHash: options.expectedHash,
  });
  return { path: written.path, hash: written.hash };
}

export interface AppendAnswerOptions {
  docLanguage?: DocLanguage;
  /** Time 'HH:MM'. If missing, derived from `now`. */
  at?: string;
  now?: DateLike;
  expectedHash?: string;
}

/**
 * Appends an app answer under "Day", as the same blockquote block
 * `appendTurn` writes for the `assistant` role — just in the "Day" section
 * instead of "Conversation", since 011 the stream lives in one place.
 */
export async function appendAnswer(
  store: JournalStore,
  date: DateLike,
  text: string,
  options: AppendAnswerOptions = {},
): Promise<{ path: string; hash: string; at: string }> {
  const content = text.replace(/\r\n/g, '\n').trim();
  if (content.length === 0) {
    throw new JournalError('invalid', 'Eine Antwort ohne Text wird nicht protokolliert.');
  }
  const at = options.at ?? timeOf(options.now ?? new Date());
  const docLanguage = options.docLanguage ?? 'de';
  const written = await appendToDay(store, date, 'day', formatAnswer(content, at, docLanguage), {
    docLanguage,
    expectedHash: options.expectedHash,
  });
  return { path: written.path, hash: written.hash, at };
}
