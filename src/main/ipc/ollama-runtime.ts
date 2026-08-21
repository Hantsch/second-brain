/* Opening the installer and starting the runtime (019c, D3).
 *
 * Split out of `ollama-install.ts` rather than added to it: that file
 * already carries D2's whole download machinery at ~280 lines, and both
 * D3 channels plus their comments would have pushed it well past CLAUDE.md's
 * ~300-line soft limit. This file picks up exactly where D2 leaves off — the
 * installer has landed on disk; this is "open it" and, once Ollama is
 * actually installed, "start it" without a terminal.
 *
 * Two different "never throw into the IPC boundary" habits, one per channel:
 * - `llm:openRuntimeInstaller` calls `shell.openPath`, which itself never
 *   throws — it resolves to `''` on success, a human-readable OS string on
 *   failure. It only ever opens the path the `InstallerPathTracker` from
 *   `ollama-install.ts` recorded when a download last completed cleanly; it
 *   never trusts a path the renderer might supply (electron-arch: never
 *   trust a renderer-supplied filesystem path).
 * - `llm:startLocalRuntime` spawns `ollama serve` detached and unref'd so it
 *   keeps running once this call returns, then polls
 *   `detectOllamaRuntimeStatus` (D1, `llm-detect.ts`) — reused, not
 *   duplicated — until it reports `'running'` or a short timeout elapses. A
 *   missing binary (`ENOENT`, e.g. a race with an uninstall) is reported as
 *   `started: false, reason: 'spawn-failed'`, never thrown.
 */

import { spawn } from 'node:child_process';
import { shell } from 'electron';
import type { LocalRuntimeStatus } from '@shared/types';
import type { InstallerPathTracker } from './ollama-install';
import { detectOllamaRuntimeStatus } from './llm-detect';
import type { RuntimeStatusOptions } from './llm-detect';
import type { HandlerMap } from './registry';
import { defineHandlers } from './registry';
import type { Services } from '../services';

/** The slice of `child_process.spawn` this file needs — injectable so no
    test ever spawns a real process. Fixed arguments only, `shell` left at
    its default `false`. */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: { readonly detached: true; readonly stdio: 'ignore'; readonly windowsHide: true },
) => SpawnedProcess;

/** The slice of Node's `ChildProcess` this file touches. */
export interface SpawnedProcess {
  unref(): void;
  once(event: 'error', listener: (error: NodeJS.ErrnoException) => void): void;
}

/** The real `spawn`. `shell: false` is the default; stated explicitly so
    nobody "fixes" this into a shell string later. */
const nodeSpawn: SpawnFn = (file, args, options) => spawn(file, args, { ...options, shell: false });

/** Ceiling on how long `llm:startLocalRuntime` waits for the server to come
    up before it gives up and reports `'timeout'` — long enough for Ollama to
    open its port, short enough that a genuinely dead start doesn't hang the
    settings screen. */
const START_TIMEOUT_MS = 5_000;

/** How often the status is re-checked while waiting for `'running'`. */
const START_POLL_INTERVAL_MS = 300;

/** How long `llm:startLocalRuntime` waits for `spawn`'s `'error'` event
    before assuming the process started fine — `ENOENT` et al. arrive within
    a tick or two, well under this. */
const SPAWN_ERROR_GRACE_MS = 200;

/**
 * `spawn` reports a failure to even start (`ENOENT`, wrong permissions, …)
 * asynchronously via the child's `'error'` event, never by throwing — so
 * this waits a short grace period for that event before assuming the
 * process is on its way to becoming a real server.
 */
function awaitSpawnError(child: SpawnedProcess, graceMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    timer.unref();
    child.once('error', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls `probeFn` until it reports `'running'` or `timeoutMs` has elapsed
    since this call started, whichever comes first. Always resolves with the
    last observed status — never rejects. */
async function pollUntilRunning(
  probeFn: () => Promise<LocalRuntimeStatus>,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<LocalRuntimeStatus> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await probeFn();
    if (status === 'running' || Date.now() >= deadline) return status;
    await wait(pollIntervalMs);
  }
}

/** Test seam: production spawns the real process and probes the real
    endpoint via `detectOllamaRuntimeStatus`; tests inject every one of these,
    so no test ever starts a process or touches the network. */
export interface OllamaRuntimeDeps {
  spawnFn?: SpawnFn;
  /** Defaults to `detectOllamaRuntimeStatus` with `statusOptions` — override
      directly in a test instead when a whole fake sequence is easier to
      express than fake fetch/execFile plumbing. */
  probeFn?: () => Promise<LocalRuntimeStatus>;
  statusOptions?: RuntimeStatusOptions;
  timeoutMs?: number;
  pollIntervalMs?: number;
  spawnErrorGraceMs?: number;
}

/** `llm:openRuntimeInstaller` / `llm:startLocalRuntime` — the two D3
    channels. `installerPathTracker` must be the same instance
    `ollamaInstallHandlers` was built with (`register-all.ts` creates it once
    and hands it to both), otherwise this always sees "nothing downloaded
    yet". */
export function ollamaRuntimeHandlers(
  services: Services,
  installerPathTracker: InstallerPathTracker,
  deps: OllamaRuntimeDeps = {},
): HandlerMap {
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const probeFn = deps.probeFn ?? (() => detectOllamaRuntimeStatus(deps.statusOptions));
  const timeoutMs = deps.timeoutMs ?? START_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? START_POLL_INTERVAL_MS;
  const spawnErrorGraceMs = deps.spawnErrorGraceMs ?? SPAWN_ERROR_GRACE_MS;

  return defineHandlers({
    'llm:openRuntimeInstaller': async () => {
      void services;
      const path = installerPathTracker.get();
      if (path === null) return { opened: false, reason: 'no-installer-downloaded' };
      const error = await shell.openPath(path);
      return error === '' ? { opened: true } : { opened: false, reason: error };
    },

    'llm:startLocalRuntime': async () => {
      void services;
      const child = spawnFn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      const failedToSpawn = await awaitSpawnError(child, spawnErrorGraceMs);
      if (failedToSpawn) {
        return { started: false, status: 'absent' as LocalRuntimeStatus, reason: 'spawn-failed' };
      }
      child.unref();

      const status = await pollUntilRunning(probeFn, timeoutMs, pollIntervalMs);
      return status === 'running'
        ? { started: true, status }
        : { started: false, status, reason: 'timeout' as const };
    },
  });
}
