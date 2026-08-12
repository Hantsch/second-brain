/* Gegenstück zu `src/preload/ipc-error-wire.ts`.

   Über die contextBridge übersteht ein Fehlerobjekt nur seine Message. Der
   `IpcError` reist deshalb als JSON darin — hier wird er wieder ausgepackt.
   Beide Seiten müssen dasselbe Präfix benutzen. */

import type { IpcError } from '@shared/ipc';

export const IPC_ERROR_PREFIX = 'SB_IPC_ERROR:';

const CODES: readonly IpcError['code'][] = [
  'no-vault',
  'not-found',
  'conflict',
  'llm-unavailable',
  'invalid',
  'io',
  'cancelled',
  'unknown',
];

export function isIpcError(value: unknown): value is IpcError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (CODES as readonly string[]).includes(candidate.code)
  );
}

/** Baut den Fehler, den die Mock-Brücke wirft — gleiche Form wie aus dem Preload. */
export function encodeIpcError(error: IpcError): Error {
  return new Error(`${IPC_ERROR_PREFIX}${JSON.stringify(error)}`);
}

/** Macht aus allem, was ein Aufruf werfen kann, einen `IpcError`. */
export function decodeIpcError(error: unknown): IpcError {
  if (isIpcError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  const start = message.indexOf(IPC_ERROR_PREFIX);
  if (start >= 0) {
    try {
      const parsed: unknown = JSON.parse(message.slice(start + IPC_ERROR_PREFIX.length));
      if (isIpcError(parsed)) return parsed;
    } catch {
      /* Kaputtes JSON behandeln wir wie einen unbekannten Fehler. */
    }
  }
  return { code: 'unknown', message: 'unerwarteter Fehler' };
}
