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

/** The `llm-unavailable` causes that get their own sentence — each one names a different fix. */
const LLM_REASONS: readonly string[] = [
  'no-route',
  'no-key',
  'provider-disabled',
  'agent-pending',
  'agent-failed',
];

/** Causes whose sentence names the provider — useless without its label. */
const NAMES_PROVIDER: readonly string[] = ['no-key', 'provider-disabled'];

/**
 * The cause behind an `llm-unavailable` error, when main sent one along
 * (`LlmUnavailable` in `detail`). `null` for every other error and for a
 * cause without its own sentence — those keep the generic wording.
 */
export function llmUnavailableCause(
  error: IpcError,
): { reason: string; task: string; provider: string; detail: string } | null {
  if (error.code !== 'llm-unavailable') return null;
  if (typeof error.detail !== 'object' || error.detail === null) return null;
  const detail = error.detail as {
    reason?: unknown;
    task?: unknown;
    provider?: unknown;
    detail?: unknown;
  };
  if (typeof detail.reason !== 'string' || !LLM_REASONS.includes(detail.reason)) return null;
  if (typeof detail.task !== 'string') return null;
  const provider = typeof detail.provider === 'string' ? detail.provider : '';
  // Without a provider name the key and disabled sentences would have a hole in them.
  if (NAMES_PROVIDER.includes(detail.reason) && provider.length === 0) return null;
  return {
    reason: detail.reason,
    task: detail.task,
    provider,
    detail: typeof detail.detail === 'string' ? detail.detail : '',
  };
}
