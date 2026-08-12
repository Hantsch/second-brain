/* Errors that cross IPC always take the shape `IpcError`.
   Principle: the renderer builds its wording from the `code`, not from the
   message. Unknown errors therefore get a fixed, content-free message — no
   stack trace, no file content, no key ever leaves the main process. */

import type { IpcError } from '@shared/ipc';

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

/** An error with an IPC code. Handlers throw exclusively this type. */
export class IpcFailure extends Error implements IpcError {
  readonly code: IpcError['code'];
  readonly detail?: unknown;

  constructor(code: IpcError['code'], message: string, detail?: unknown) {
    super(message);
    this.name = 'IpcFailure';
    this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export function fail(code: IpcError['code'], message: string, detail?: unknown): IpcFailure {
  return new IpcFailure(code, message, detail);
}

export function noVault(): IpcFailure {
  return new IpcFailure('no-vault', 'kein Vault geöffnet');
}

function errnoToCode(code: string): IpcError['code'] | null {
  if (code === 'ENOENT') return 'not-found';
  if (code === 'EACCES' || code === 'EPERM' || code === 'EISDIR' || code === 'EBUSY') return 'io';
  return null;
}

/** Translates whatever a handler throws into an `IpcError`. */
export function toIpcError(error: unknown): IpcError {
  if (error instanceof IpcFailure) {
    return error.detail === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, detail: error.detail };
  }
  if (isIpcErrorShape(error)) {
    return error.detail === undefined
      ? { code: error.code, message: error.message }
      : { code: error.code, message: error.message, detail: error.detail };
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') return { code: 'cancelled', message: 'abgebrochen' };
    const errno = (error as { code?: unknown }).code;
    const mapped = typeof errno === 'string' ? errnoToCode(errno) : null;
    if (mapped)
      return {
        code: mapped,
        message: mapped === 'not-found' ? 'nicht gefunden' : 'Dateizugriff fehlgeschlagen',
      };
  }
  return { code: 'unknown', message: 'unerwarteter Fehler' };
}

function isIpcErrorShape(value: unknown): value is IpcError {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { code?: unknown; message?: unknown };
  return (
    typeof candidate.message === 'string' &&
    typeof candidate.code === 'string' &&
    (CODES as readonly string[]).includes(candidate.code)
  );
}
