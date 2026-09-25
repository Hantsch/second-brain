/* Counterpart to `src/preload/ipc-error-wire.ts`.

   Across the contextBridge, an error object only survives as its message.
   The `IpcError` therefore travels as JSON inside it — here it gets
   unpacked again. Both sides must use the same prefix. */

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
  'too-large',
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

/** Builds the error that the mock bridge throws — same shape as from the preload. */
export function encodeIpcError(error: IpcError): Error {
  return new Error(`${IPC_ERROR_PREFIX}${JSON.stringify(error)}`);
}

/** Turns anything a call can throw into an `IpcError`. */
export function decodeIpcError(error: unknown): IpcError {
  if (isIpcError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  const start = message.indexOf(IPC_ERROR_PREFIX);
  if (start >= 0) {
    try {
      const parsed: unknown = JSON.parse(message.slice(start + IPC_ERROR_PREFIX.length));
      if (isIpcError(parsed)) return parsed;
    } catch {
      /* We treat broken JSON like an unknown error. */
    }
  }
  return { code: 'unknown', message: 'unerwarteter Fehler' };
}
