/**
 * Der Vertrag der Gespraechs-Ablage.
 *
 * Ein Gespraech ist eine Datei: `.secondbrain/chats/<id>.json`. Das ist der
 * ableitbare Teil des Vaults — geht er verloren, ist kein Wissen verloren, nur die
 * Erkundung. Genau deshalb liegt er als JSON und nicht als Markdown: er ist kein
 * Dokument, das jemand in Obsidian pflegt (docs/VAULT-FORMAT.md).
 *
 * Der Store kommt als schmale Sicht herein, damit der Kern ohne Dateisystem
 * testbar bleibt. `FsVaultStore`, `MemoryVaultStore` und die Sicht der Shell
 * (`VaultStoreLike`) erfuellen ihn strukturell.
 */

import type { ChatKind, ChatMessage, ChatThread, WriteResult } from '@shared/types';
import type { DateLike } from '@core/vault/paths';

/** Was der Kern beim Durchlaufen eines Ordners braucht: den Pfad. */
export interface ChatEntry {
  path: string;
}

export interface ChatWalkOptions {
  dir?: string;
  /** Nur Dateien mit dieser Endung, inklusive Punkt. */
  ext?: string;
  /**
   * `.secondbrain/` mitdurchlaufen. Ohne das findet kein Store die Gespraeche —
   * sie liegen ausdruecklich im ableitbaren Teil.
   */
  includeInternal?: boolean;
}

/** Untermenge von `VaultStore`, die die Gespraechs-Ablage braucht. */
export interface ChatStore {
  readText(path: string): Promise<string | null>;
  /** Atomar (tmp + rename) — ein Absturz beim Schreiben darf keine halbe Datei lassen. */
  writeText(path: string, content: string): Promise<WriteResult>;
  exists(path: string): Promise<boolean>;
  /** Nach `.secondbrain/trash/` verschieben und die Marke zurueckgeben. */
  delete(path: string): Promise<{ path: string; undoToken: string }>;
  walk(options?: ChatWalkOptions): AsyncIterable<ChatEntry>;
}

export interface CreateThreadInput {
  kind: ChatKind;
  /** Titel; fehlt er, bildet ihn die erste Frage. */
  title?: string;
  /** Bei `module` der Modul-Slug, bei `journal` das Datum. */
  context?: string | null;
  /** Erste Nachricht, gleich mit angelegt. */
  first?: ChatMessage;
  /** Kennung vorgeben — Tests tun das, damit nichts wuerfelt. */
  id?: string;
}

export interface ListThreadsOptions {
  kind?: ChatKind;
  /** Sucht in Titel und Nachrichtentext. Damit sind auch aeltere Gespraeche erreichbar. */
  query?: string;
  limit?: number;
}

export interface ChatArchiveOptions {
  /** Das „jetzt". Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: () => DateLike;
  /** Zufall fuer Kennungen. Tests ersetzen ihn. */
  random?: () => number;
}

/** Ein Gespraech, wie es auf der Platte liegt. `version` erlaubt spaetere Formate. */
export interface StoredThread extends ChatThread {
  version: number;
}

/** Fehler der Gespraechs-Ablage. `code` entspricht `IpcError.code`. */
export class ChatError extends Error {
  readonly code: 'not-found' | 'invalid';

  constructor(code: 'not-found' | 'invalid', message: string) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
  }
}
