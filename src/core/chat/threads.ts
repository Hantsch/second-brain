/**
 * Gespraeche aufbewahren: ein Gespraech, eine Datei.
 *
 * Der Ablauf einer Frage ist der Grund fuer den Aufbau hier. Die Frage des Nutzers
 * wird **sofort** geschrieben, die Antwort erst am Ende des Streams. Stirbt die App
 * mitten im Stream, steht die Frage noch da — verloren ist dann eine Antwort, die
 * ohnehin nicht fertig war. Umgekehrt (erst am Ende alles schreiben) waere die
 * Frage weg, und der Nutzer muesste sie sich noch einmal ausdenken.
 *
 * Zwei Schreibvorgaenge am selben Gespraech duerfen sich nicht ueberholen: wer
 * waehrend eines laufenden Streams die naechste Frage stellt, wuerde sonst die
 * Antwort davor ueberschreiben (lesen, lesen, schreiben, schreiben). Deshalb
 * laeuft je Kennung eine Kette.
 */

import { INTERNAL_DIRS } from '@shared/types';
import type { ChatMessage, ChatThread } from '@shared/types';
import { chatPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import {
  assertThreadId,
  byRecency,
  newMessageId,
  newThreadId,
  parseThread,
  serializeThread,
  threadMatches,
  titleFromQuestion,
} from './serialize';
import { ChatError } from './types';
import type { ChatArchiveOptions, ChatStore, CreateThreadInput, ListThreadsOptions } from './types';

/** So viele Gespraeche liefert die Liste. Aeltere sind ueber die Suche erreichbar. */
export const DEFAULT_THREAD_LIMIT = 50;

/**
 * So viele Dateien liest ein Listenlauf hoechstens. Die Kennung traegt Datum und
 * Minute, deshalb ist die Sortierung nach Dateinamen schon chronologisch: gelesen
 * werden die neuesten, und selbst ein Vault mit Tausenden Gespraechen bleibt
 * schnell.
 */
export const MAX_SCANNED_THREADS = 500;

/** So viele frühere Runden gehen als Vorgeschichte in einen Prompt. */
export const HISTORY_TURNS = 6;

function isoOf(value: DateLike): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return new Date(value).toISOString();
}

/**
 * Die Vorgeschichte eines Gespraechs fuer den Prompt: die letzten Runden, aelteste
 * zuerst. Nachrichten ohne Text fallen weg — ein leerer Turn kostet nur Tokens.
 */
export function historyOf(
  thread: ChatThread | null,
  turns = HISTORY_TURNS,
): { role: 'user' | 'assistant'; content: string }[] {
  if (thread === null) return [];
  return thread.messages
    .filter((message) => message.content.trim().length > 0)
    .slice(-Math.max(0, turns))
    .map((message) => ({ role: message.role, content: message.content }));
}

/** Die Ablage der Gespraeche. Eine Instanz je offenem Vault. */
export class ChatArchive {
  private readonly store: ChatStore;
  private readonly clock: () => DateLike;
  private readonly random: () => number;
  /** Laufende Schreibvorgaenge je Kennung — sie laufen hintereinander, nicht parallel. */
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(store: ChatStore, options: ChatArchiveOptions = {}) {
    this.store = store;
    this.clock = options.now ?? ((): Date => new Date());
    this.random = options.random ?? Math.random;
  }

  /** Eine neue Nachrichten-Kennung. Sie ist zugleich die Marke des Streams. */
  nextMessageId(): string {
    return newMessageId(this.clock(), this.random);
  }

  /**
   * Die neuesten Gespraeche. `query` sucht in Titel und Nachrichten — so bleibt
   * auch erreichbar, was aus den letzten fuenfzig herausgefallen ist.
   */
  async list(options: ListThreadsOptions = {}): Promise<ChatThread[]> {
    const limit = Math.max(1, options.limit ?? DEFAULT_THREAD_LIMIT);
    const paths: string[] = [];
    for await (const entry of this.store.walk({
      dir: INTERNAL_DIRS.chats,
      ext: '.json',
      includeInternal: true,
    })) {
      paths.push(entry.path);
    }
    /* Absteigend nach Dateinamen: die Kennung beginnt mit Datum und Minute. */
    paths.sort((a, b) => b.localeCompare(a));

    const threads: ChatThread[] = [];
    for (const path of paths.slice(0, MAX_SCANNED_THREADS)) {
      const thread = parseThread(await this.store.readText(path));
      if (thread === null) continue;
      if (options.kind !== undefined && thread.kind !== options.kind) continue;
      if (options.query !== undefined && !threadMatches(thread, options.query)) continue;
      threads.push(thread);
    }
    return threads.sort(byRecency).slice(0, limit);
  }

  /** Ein Gespraech; `null`, wenn es die Datei nicht (mehr) gibt. */
  async get(id: string): Promise<ChatThread | null> {
    return parseThread(await this.store.readText(chatPath(assertThreadId(id))));
  }

  /** Wie `get`, aber ein fehlendes Gespraech ist ein Fehler. */
  async require(id: string): Promise<ChatThread> {
    const thread = await this.get(id);
    if (thread === null) throw new ChatError('not-found', `Gespraech "${id}" gibt es nicht.`);
    return thread;
  }

  /**
   * Ein Gespraech anlegen. Der Titel kommt aus der ersten Nachricht, wenn keiner
   * mitgegeben wurde — „Was weiss ich ueber Rollenkonzepte?" ist ein Titel, den man
   * in der Liste wiedererkennt, „Gespraech 7" nicht.
   */
  async create(input: CreateThreadInput): Promise<ChatThread> {
    const now = isoOf(this.clock());
    const id = assertThreadId(input.id ?? newThreadId(this.clock(), this.random));
    const messages = input.first === undefined ? [] : [input.first];
    const title = (input.title ?? '').trim();
    const thread: ChatThread = {
      id,
      kind: input.kind,
      title: title.length > 0 ? title : titleFromQuestion(input.first?.content ?? ''),
      created: now,
      updated: now,
      messages,
      context: input.context ?? null,
    };
    return this.write(thread);
  }

  /** Eine Nachricht anhaengen. Gibt es das Gespraech nicht, ist das ein Fehler. */
  async append(id: string, message: ChatMessage): Promise<ChatThread> {
    return this.queue(id, async () => {
      const thread = await this.require(id);
      /* Dieselbe Kennung zweimal waere ein Duplikat in der Ansicht: der letzte
         Stand gewinnt, damit ein Nachtrag zur Antwort sie ersetzt. */
      const kept = thread.messages.filter((entry) => entry.id !== message.id);
      return this.write({
        ...thread,
        title:
          thread.title.trim().length > 0 || message.role !== 'user'
            ? thread.title
            : titleFromQuestion(message.content),
        messages: [...kept, message],
        updated: isoOf(this.clock()),
      });
    });
  }

  /** Titel aendern. Ein leerer Titel wird abgewiesen — die Liste braucht ihn. */
  async rename(id: string, title: string): Promise<ChatThread> {
    const next = (title ?? '').trim();
    if (next.length === 0) throw new ChatError('invalid', 'Ein Gespraech braucht einen Titel.');
    return this.queue(id, async () => {
      const thread = await this.require(id);
      return this.write({ ...thread, title: next, updated: isoOf(this.clock()) });
    });
  }

  /**
   * Ein Gespraech loeschen. Es wandert in den Papierkorb des Vaults — auch das
   * Verwerfen einer Erkundung hat einen Rueckweg.
   */
  async remove(id: string): Promise<{ undoToken: string }> {
    return this.queue(id, async () => {
      const path = chatPath(assertThreadId(id));
      if (!(await this.store.exists(path))) {
        throw new ChatError('not-found', `Gespraech "${id}" gibt es nicht.`);
      }
      const result = await this.store.delete(path);
      return { undoToken: result.undoToken };
    });
  }

  private async write(thread: ChatThread): Promise<ChatThread> {
    await this.store.writeText(chatPath(thread.id), serializeThread(thread));
    return thread;
  }

  /**
   * Schreibvorgaenge derselben Kennung laufen hintereinander. Ein Fehlschlag haelt
   * die Kette nicht auf, und die Karte waechst nicht: der Eintrag verschwindet,
   * sobald sich nichts Neues mehr angehaengt hat.
   */
  private queue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const key = assertThreadId(id);
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task, task);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });
    return result;
  }
}
