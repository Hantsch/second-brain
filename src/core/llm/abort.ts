/* Abbruch als Zustand, nicht als Fehlerfall: der Nutzer darf jede LLM-Aufgabe
   sofort stoppen. Ein Abbruch ist nie ein Retry-Grund. */

/** Fehler mit `name = 'AbortError'` — dieselbe Form, die `fetch` wirft. */
export function createAbortError(message = 'Abgebrochen.'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/** Wirft sofort, wenn schon abgebrochen wurde — bevor irgendetwas Arbeit kostet. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbortError();
}
