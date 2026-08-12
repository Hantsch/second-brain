/**
 * Das Gespraech steht im Tageseintrag — nicht in einer Datenbank, nicht in einer
 * JSON-Datei daneben. Format aus docs/VAULT-FORMAT.md, Blockquote je Runde:
 *
 * ```
 * > **Ich** — 18:40
 * > Der Sprint fühlt sich unmöglich an.
 *
 * > **Second Brain** — 18:40
 * > ...
 * ```
 *
 * Zwei Zusicherungen, weil der Nutzer in dieser Datei mitschreiben darf:
 *
 * - **Gelesen wird nachsichtig.** Ein Block ohne Sprecher, mit fremdem Sprecher
 *   oder mit kaputter Uhrzeit wird uebersprungen, nicht gedeutet.
 * - **Geschrieben wird nur angehaengt.** Nichts hier loescht oder schreibt eine
 *   Zeile um. Was der Nutzer von Hand ergaenzt hat, ueberlebt jede Runde.
 */

import type { DocLanguage } from '@shared/types';
import { fold } from '@core/index/text';
import { findSections } from '@core/vault/sections';
import type { DateLike } from '@core/vault/paths';
import { appendToDay } from './day';
import { isSectionOf } from './sections';
import { JournalError } from './types';
import type { DialogRole, DialogTurn, JournalStore } from './types';

/** Sprecherzeile: `> **Ich** — 18:40`. Die Uhrzeit ist freiwillig. */
const SPEAKER_LINE = /^ {0,3}>\s*\*\*\s*([^*]+?)\s*\*\*\s*(?:[—–-]\s*(\d{1,2}:\d{2})\s*)?$/;
/** Fortsetzung eines Blockquotes: '> Text', '>' oder '> '. */
const QUOTE_LINE = /^ {0,3}>\s?(.*)$/;

/** Wie die Sprecher in der Dokumentsprache heissen. */
const SPEAKERS: Record<DocLanguage, Record<DialogRole, string>> = {
  de: { user: 'Ich', assistant: 'Second Brain' },
  en: { user: 'Me', assistant: 'Second Brain' },
};

/* Gefaltete Bezeichnungen, die als Rolle erkannt werden. Alles andere ist ein
   fremder Block und bleibt unberuehrt liegen. */
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

/** Uhrzeit 'HH:MM' in Ortszeit — der Zeitstempel einer Runde. */
export function timeOf(at: DateLike = new Date()): string {
  const date = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(date.getTime())) {
    throw new JournalError('invalid', `Keine Uhrzeit: ${String(at)}`);
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Eine Runde als Blockquote. Leerzeilen im Text bleiben als '>' erhalten, damit
 * der Block zusammenhaengt — eine echte Leerzeile wuerde ihn aufreissen und die
 * zweite Haelfte zu einem sprecherlosen Block machen.
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
 * Die Bloecke eines Zeilenbereichs. Ein Block beginnt an einer Sprecherzeile und
 * endet an der ersten Zeile, die kein Blockquote mehr ist — eine Leerzeile, ein
 * Absatz, eine Liste. Die endet ihn und bleibt stehen.
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
 * Die Runden aus dem Abschnitt „Gespraech", aelteste zuerst. Gibt es den
 * Abschnitt nicht, ist die Liste leer — das ist ein Ergebnis, kein Fehler.
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

/** Die letzten Runden als Prompt-Vorgeschichte, aelteste zuerst. */
export function dialogHistory(
  body: string,
  turns: number,
): { role: DialogRole; content: string }[] {
  /* `slice(-0)` waere die ganze Liste — deshalb der ausdrueckliche Fall. */
  if (turns <= 0) return [];
  return parseDialog(body)
    .slice(-turns)
    .map((turn) => ({ role: turn.role, content: turn.text }));
}

export interface AppendTurnOptions {
  docLanguage?: DocLanguage;
  /** Uhrzeit 'HH:MM'. Fehlt sie, kommt sie aus `now`. */
  at?: string;
  now?: DateLike;
}

/**
 * Eine Runde unter „Gespraech" anhaengen. Fehlt die Tagesdatei, wird sie angelegt:
 * ein Satz, der nirgendwo landet, waere der schlimmste Fall dieses Screens.
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
