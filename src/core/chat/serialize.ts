/**
 * Ein Gespraech von und zu JSON.
 *
 * Gelesen wird tolerant, geschrieben streng. Eine kaputte Datei unter
 * `.secondbrain/chats/` darf die Liste nicht mitnehmen: sie faellt weg (`null`),
 * und alle anderen Gespraeche bleiben erreichbar. Geschrieben wird dagegen nur die
 * gepruefte Form — sonst wandert Unrat in die Datei und kommt beim naechsten Lesen
 * als „kaputt" zurueck.
 */

import type { Citation, ChatKind, ChatMessage, ChatThread } from '@shared/types';
import { excerpt } from '@core/vault/doc';
import { isoDay, minuteStamp } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { ChatError } from './types';
import type { StoredThread } from './types';

/** Format der Datei. Steigt, wenn sich die Form aendert. */
export const THREAD_FORMAT_VERSION = 1;

/** So lang wird ein Titel, der aus der ersten Frage gebildet wurde. */
export const MAX_TITLE_CHARS = 60;

const KINDS: readonly ChatKind[] = ['ask', 'journal', 'module'];

/* Kennungen tragen Datum und Minute — damit sortiert der Dateiname chronologisch
   und die Liste muss nicht jede Datei lesen, um die neuesten zu finden. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RANDOM_CHARS = 4;

function token(random: () => number): string {
  let out = '';
  for (let index = 0; index < RANDOM_CHARS; index += 1) {
    out += Math.floor(random() * 36).toString(36);
  }
  return out;
}

/** Kennung eines Gespraechs: `c-2026-08-10-1432-a1b2`. */
export function newThreadId(
  now: DateLike = new Date(),
  random: () => number = Math.random,
): string {
  return `c-${minuteStamp(now)}-${token(random)}`;
}

/** Kennung einer Nachricht: `m-2026-08-10-1432-a1b2`. */
export function newMessageId(
  now: DateLike = new Date(),
  random: () => number = Math.random,
): string {
  return `m-${minuteStamp(now)}-${token(random)}`;
}

/**
 * Wache fuer Kennungen. Sie werden zu Dateinamen — ein Wert von aussen darf
 * hier keinen Pfad bauen koennen.
 */
export function assertThreadId(id: string): string {
  const value = (id ?? '').trim().toLowerCase();
  if (!ID_PATTERN.test(value)) {
    throw new ChatError('invalid', `"${id}" ist keine Gespraechs-Kennung.`);
  }
  return value;
}

/**
 * Titel aus der ersten Frage. Er wird gekuerzt, aber nie umformuliert: der Nutzer
 * muss sein Gespraech in der Liste wiedererkennen.
 */
export function titleFromQuestion(question: string): string {
  const title = excerpt(question ?? '', MAX_TITLE_CHARS);
  return title.length > 0 ? title : isoDay();
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function citationsOf(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  const citations: Citation[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    const path = textOf(raw['path']);
    if (path === null) continue;
    citations.push({
      path,
      title: textOf(raw['title']) ?? path,
      quote: typeof raw['quote'] === 'string' ? raw['quote'] : '',
      line: typeof raw['line'] === 'number' ? raw['line'] : null,
    });
  }
  return citations;
}

function messageOf(value: unknown, index: number): ChatMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const role = raw['role'] === 'assistant' ? 'assistant' : raw['role'] === 'user' ? 'user' : null;
  if (role === null) return null;
  const content = typeof raw['content'] === 'string' ? raw['content'] : null;
  if (content === null) return null;
  const citations = citationsOf(raw['citations']);
  const model = textOf(raw['model']);
  return {
    id: textOf(raw['id']) ?? `m-${index}`,
    role,
    content,
    at: textOf(raw['at']) ?? '',
    ...(citations.length === 0 ? {} : { citations }),
    ...(model === null ? {} : { model }),
    ...(raw['unsupported'] === true ? { unsupported: true } : {}),
  };
}

/**
 * Eine Gespraechsdatei lesen. `null` heisst: das ist kein brauchbares Gespraech —
 * kaputtes JSON, fremde Datei, kein Titel, keine Kennung.
 */
export function parseThread(content: string | null): ChatThread | null {
  if (content === null || content.trim().length === 0) return null;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    raw = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const id = textOf(raw['id']);
  if (id === null || !ID_PATTERN.test(id)) return null;
  const kind = KINDS.find((candidate) => candidate === raw['kind']);
  if (kind === undefined) return null;

  const messages: ChatMessage[] = [];
  if (Array.isArray(raw['messages'])) {
    raw['messages'].forEach((entry, index) => {
      const message = messageOf(entry, index);
      if (message !== null) messages.push(message);
    });
  }
  const created = textOf(raw['created']) ?? messages[0]?.at ?? '';
  return {
    id,
    kind,
    title: textOf(raw['title']) ?? titleFromQuestion(messages[0]?.content ?? id),
    created,
    updated: textOf(raw['updated']) ?? created,
    messages,
    context: textOf(raw['context']),
  };
}

/** Ein Gespraech als Dateiinhalt. Eingerueckt, damit ein Mensch es lesen kann. */
export function serializeThread(thread: ChatThread): string {
  const stored: StoredThread = { version: THREAD_FORMAT_VERSION, ...thread };
  return `${JSON.stringify(stored, null, 2)}\n`;
}

/** Passt dieses Gespraech zur Suche? Titel und jeder Nachrichtentext zaehlen. */
export function threadMatches(thread: ChatThread, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  if (thread.title.toLowerCase().includes(needle)) return true;
  return thread.messages.some((message) => message.content.toLowerCase().includes(needle));
}

/** Neuestes zuerst. Gleichstand entscheidet die Kennung, damit die Reihenfolge steht. */
export function byRecency(a: ChatThread, b: ChatThread): number {
  if (a.updated !== b.updated) return a.updated < b.updated ? 1 : -1;
  return b.id.localeCompare(a.id);
}
