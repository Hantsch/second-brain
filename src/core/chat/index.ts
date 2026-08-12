/**
 * Oeffentliche Oberflaeche der Gespraechs-Ablage. Andere Module importieren von
 * hier, nicht aus den Einzeldateien.
 *
 *   `threads`    ChatArchive: auflisten, lesen, anlegen, anhaengen, umbenennen, loeschen
 *   `serialize`  Datei ↔ Gespraech, Kennungen, Titel aus der ersten Frage
 */

export {
  ChatArchive,
  DEFAULT_THREAD_LIMIT,
  HISTORY_TURNS,
  MAX_SCANNED_THREADS,
  historyOf,
} from './threads';
export {
  MAX_TITLE_CHARS,
  THREAD_FORMAT_VERSION,
  assertThreadId,
  byRecency,
  newMessageId,
  newThreadId,
  parseThread,
  serializeThread,
  threadMatches,
  titleFromQuestion,
} from './serialize';
export {
  ChatError,
  type ChatArchiveOptions,
  type ChatEntry,
  type ChatStore,
  type ChatWalkOptions,
  type CreateThreadInput,
  type ListThreadsOptions,
  type StoredThread,
} from './types';
