/**
 * The conversation lives in the journal entry — not in a database, not in a
 * separate JSON file. Format from docs/VAULT-FORMAT.md, blockquote per turn:
 *
 * ```
 * > **Ich** — 18:40
 * > Der Sprint fühlt sich unmöglich an.
 *
 * > **Second Brain** — 18:40
 * > ...
 * ```
 *
 * Two guarantees, because the user is allowed to write in this file too:
 *
 * - **Reading is lenient.** A block without a speaker, with an unfamiliar
 *   speaker, or with a broken timestamp is skipped, not interpreted.
 * - **Writing only appends.** Nothing here deletes or rewrites a line. What
 *   the user added by hand survives every turn.
 */

import type { DocLanguage } from '@shared/types';
import { fold } from '@core/index/text';
import { findSections } from '@core/vault/sections';
import type { DateLike } from '@core/vault/paths';
import { appendToDay } from './day';
import { isSectionOf } from './sections';
import { JournalError } from './types';
import type { DialogRole, DialogTurn, JournalStore } from './types';

/** Speaker line: `> **Ich** — 18:40`. The timestamp is optional. */
const SPEAKER_LINE = /^ {0,3}>\s*\*\*\s*([^*]+?)\s*\*\*\s*(?:[—–-]\s*(\d{1,2}:\d{2})\s*)?$/;
/** Continuation of a blockquote: '> Text', '>' or '> '. */
const QUOTE_LINE = /^ {0,3}>\s?(.*)$/;

/** What the speakers are called in the document language. */
const SPEAKERS: Record<DocLanguage, Record<DialogRole, string>> = {
  de: { user: 'Ich', assistant: 'Second Brain' },
  en: { user: 'Me', assistant: 'Second Brain' },
};

/* Folded labels that are recognized as a role. Anything else is a foreign
   block and stays untouched. */
const LABELS: Record<DialogRole, readonly string[]> = {
  user: ['ich', 'me', 'i'],
  assistant: ['second brain', 'secondbrain', 'brain', 'coach'],
};

function roleOf(label: string): DialogRole | null {
  const key = fold(label).replace(/\s+/g, ' ').trim();
  if (LABELS.user.includes(key)) return 'user';
  if (LABELS.assistant.includes(key)) return 'assistant';
  return null;
}

/** Time 'HH:MM' in local time — the timestamp of a turn. */
export function timeOf(at: DateLike = new Date()): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) {
    throw new JournalError('invalid', `Keine Uhrzeit: ${String(at)}`);
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A turn as a blockquote. Blank lines in the text are kept as '>' so the
 * block stays contiguous — a real blank line would break it apart and turn
 * the second half into a block without a speaker.
 */
export function formatTurn(
  role: DialogRole,
  text: string,
  at: string,
  docLanguage: DocLanguage = 'de',
): string {
  const speaker = (SPEAKERS[docLanguage] ?? SPEAKERS.de)[role];
  const lines = text
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n')
    .map((line) => (line.trim().length === 0 ? '>' : `> ${line.trimEnd()}`));
  return [`> **${speaker}** — ${at}`, ...lines].join('\n');
}

interface Block {
  label: string;
  at: string | null;
  line: number;
  lines: string[];
}

function toTurn(block: Block): DialogTurn | null {
  const role = roleOf(block.label);
  if (role === null) return null;
  const text = block.lines.join('\n').trim();
  if (text.length === 0) return null;
  return { role, text, at: block.at, line: block.line };
}

/**
 * The blocks of a line range. A block starts at a speaker line and ends at
 * the first line that's no longer a blockquote — a blank line, a paragraph, a
 * list. That ends it and stays in place.
 */
function blocksIn(lines: readonly string[], from: number, to: number): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (let at = from; at < to; at += 1) {
    const line = lines[at] ?? '';
    const speaker = SPEAKER_LINE.exec(line);
    if (speaker !== null) {
      current = { label: speaker[1] ?? '', at: speaker[2] ?? null, line: at, lines: [] };
      blocks.push(current);
      continue;
    }
    if (current !== null) {
      const quoted = QUOTE_LINE.exec(line);
      if (quoted !== null) {
        current.lines.push(quoted[1] ?? '');
        continue;
      }
    }
    current = null;
  }
  return blocks;
}

/**
 * The turns from the "Conversation" section, oldest first. If the section
 * doesn't exist, the list is empty — that's a result, not an error.
 */
export function parseDialog(body: string): DialogTurn[] {
  const lines = body.split('\n');
  const turns: DialogTurn[] = [];
  for (const range of findSections(body, 2)) {
    if (!isSectionOf(range.heading, 'dialogue')) continue;
    for (const block of blocksIn(lines, range.start, range.end)) {
      const turn = toTurn(block);
      if (turn !== null) turns.push(turn);
    }
  }
  return turns;
}

/** The most recent turns as prompt history, oldest first. */
export function dialogHistory(
  body: string,
  turns: number,
): { role: DialogRole; content: string }[] {
  /* `slice(-0)` would be the whole list — hence the explicit case. */
  if (turns <= 0) return [];
  return parseDialog(body)
    .slice(-turns)
    .map((turn) => ({ role: turn.role, content: turn.text }));
}

export interface AppendTurnOptions {
  docLanguage?: DocLanguage;
  /** Time 'HH:MM'. If missing, derived from `now`. */
  at?: string;
  now?: DateLike;
}

/**
 * Appends a turn under "Conversation". If the day's file is missing, it gets
 * created: a sentence that lands nowhere would be the worst case for this
 * screen.
 */
export async function appendTurn(
  store: JournalStore,
  date: DateLike,
  role: DialogRole,
  text: string,
  options: AppendTurnOptions = {},
): Promise<{ path: string; hash: string; at: string }> {
  const content = text.replace(/\r\n/g, '\n').trim();
  if (content.length === 0) {
    throw new JournalError('invalid', 'Eine Runde ohne Text wird nicht protokolliert.');
  }
  const at = options.at ?? timeOf(options.now ?? new Date());
  const docLanguage = options.docLanguage ?? 'de';
  const written = await appendToDay(
    store,
    date,
    'dialogue',
    formatTurn(role, content, at, docLanguage),
    { docLanguage },
  );
  return { path: written.path, hash: written.hash, at };
}
