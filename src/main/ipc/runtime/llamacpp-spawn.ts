/* The `child_process.spawn` seam for llama.cpp's engine (034, D3).
 *
 * Deliberately *not* `ollama-runtime.ts`'s `SpawnFn`/`SpawnedProcess`, and
 * that file's contract stays exactly as it is: Ollama's server is spawned
 * detached and unref'd on purpose (019c) — this app never stops it, so the
 * only capabilities that type needs are `unref()` and the `'error'` event.
 * llama.cpp's engine is the opposite case: this app starts it, owns it, stops
 * it again from the settings screen and on quit (AC 6), so the handle has to
 * survive the call and be signallable. Hence the two extra capabilities here —
 * `kill` and the `'exit'` event — and the deliberate absence of `unref`.
 *
 * Three properties this seam enforces by typing, not by convention:
 *
 * - **`detached: false`.** Stated explicitly rather than left to the default,
 *   because the neighbouring Ollama call passes `detached: true` and the two
 *   must never be "harmonised" by someone reading them side by side.
 * - **argv, never a shell string.** `shell: false` is the default; also stated.
 * - **stderr is piped.** Not for logging — nothing from it is ever written to
 *   a log line or surfaced to the user (guardrail 6) — but so a failed start
 *   can be classified into one of the causes AC 5 names (`out-of-memory`,
 *   `port-in-use`) instead of a raw process string.
 */

import { spawn } from 'node:child_process';

/** The slice of Node's `ChildProcess` this runtime touches. `once` takes the
    two events in one signature (Node's own catch-all overload satisfies it);
    neither listener's arguments are read, only the fact that it fired. */
export interface LlamaChildProcess {
  /** `null` only if the process was spawned without a piped stderr — this
      module never does, but Node's type says it can be, and a missing stderr
      simply means "no evidence to classify a failure with". */
  readonly stderr: { on(event: 'data', listener: (chunk: unknown) => void): void } | null;
  once(event: 'error' | 'exit', listener: (...args: unknown[]) => void): void;
  kill(signal: 'SIGTERM' | 'SIGKILL'): boolean;
}

export type LlamaSpawnFn = (
  file: string,
  args: readonly string[],
  options: {
    readonly detached: false;
    readonly stdio: readonly ['ignore', 'ignore', 'pipe'];
    readonly windowsHide: true;
  },
) => LlamaChildProcess;

/** The real `spawn`. `shell: false` is the default; stated explicitly so
    nobody "fixes" this into a shell string later — same reasoning as
    `ollama-runtime.ts`'s own `nodeSpawn`. */
export const nodeLlamaSpawn: LlamaSpawnFn = (file, args, options) =>
  spawn(file, [...args], {
    detached: options.detached,
    stdio: [...options.stdio],
    windowsHide: options.windowsHide,
    shell: false,
  });

/**
 * Sends a signal and swallows the failure. A process that has already exited
 * (`ESRCH`) or one this process may no longer signal is not an error worth
 * propagating into an IPC response: the outcome the caller asked for — "this
 * process is not running any more" — already holds. Node guards a reaped
 * child internally, so this can never reach a foreign process that inherited
 * the pid.
 */
export function signalChild(child: LlamaChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
  try {
    child.kill(signal);
  } catch {
    /* already gone — see above */
  }
}
