/* llama.cpp's minimal start (033, D9) — the one method D6/D7 deliberately
 * left out of `LlamaCppInstallPart`/`LlamaCppPullPart`: `llm:startLocalRuntime`
 * spawning `llama-server` with the fixed, conservative flags the story's
 * Decisions name (`--port 8080 -m <file> -ngl 0 -c 4096`). [[034]] replaces
 * exactly this flag derivation with the machine-derived one; this story only
 * needs AC 7 ("probe succeeds, one real task runs") to be reachable at all.
 *
 * Mirrors `ollama-runtime.ts`'s `start` closely on purpose: an injectable
 * `SpawnFn` (the same type — no shell string ever, `shell: false` stated
 * explicitly), detached + unref so the server outlives this call, and a poll
 * against the same reachability check `llamacpp-status.ts` already exposes
 * (`llamaCppServerProbe`) until it reports `'running'` or a timeout elapses.
 * The one difference from Ollama: there is no fixed binary name on `PATH` to
 * spawn — the engine's install location (`paths.ts`) and the model file it
 * is pointed at both have to be resolved first, and either being absent is a
 * typed `'spawn-failed'`, never a thrown error or a spawn with a missing
 * argument.
 *
 * The model file itself is not a setting yet (034's job): this file spawns
 * against whatever single `.gguf` file already sits in
 * `<userData>/models/gguf/` (D7's download target), picking the
 * lexicographically first name when more than one is present — a stable,
 * deterministic choice rather than a mtime race, and one a test can assert
 * on without touching the real filesystem clock.
 */

import { spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import type { LocalRuntimeStatus } from '@shared/types';
import type { SpawnFn, SpawnedProcess } from '../ollama-runtime';
import type { FetchFn } from '../ollama-install';
import type { EngineFs } from './engine-fs';
import { nodeEngineFs } from './engine-fs';
import { llamaCppServerProbe, LLAMACPP_SERVER_PORT } from './llamacpp-status';
import { engineBinaryPath, engineTargetDir, ggufModelDir } from './paths';
import type { RuntimeInstallerPart, RuntimeStartOutcome } from './types';

/** Where the engine lands regardless of build variant (`descriptors.ts`:
    every llama.cpp asset shares this `targetSubdir`) — the same fallback
    `llamacpp-install.ts` uses for a platform with no asset at all. */
const ENGINE_TARGET_SUBDIR = 'runtimes/llamacpp';

/** The real `spawn`. `shell: false` is the default; stated explicitly so
    nobody "fixes" this into a shell string later — same reasoning as
    `ollama-runtime.ts`'s own `nodeSpawn`. */
const nodeSpawn: SpawnFn = (file, args, options) => spawn(file, args, { ...options, shell: false });

/** Conservative, fixed flags per the story's Decision — no GPU offload, a
    modest context, the port `llamacpp-status.ts` already probes. 034 owns
    deriving these from the machine scan; this story only needs them to
    exist. Always an argv array, never a concatenated shell string. */
function llamaServerArgs(modelPath: string): readonly string[] {
  return ['--port', String(LLAMACPP_SERVER_PORT), '-m', modelPath, '-ngl', '0', '-c', '4096'];
}

/** Same ceiling and cadence as `ollama-runtime.ts`'s poll — long enough for
    the server to open its port, short enough not to stall the settings
    screen on a genuinely dead start. */
const START_TIMEOUT_MS = 5_000;
const START_POLL_INTERVAL_MS = 300;
const SPAWN_ERROR_GRACE_MS = 200;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `spawn` reports a failure to even start (`ENOENT`, wrong permissions, …)
    asynchronously via the child's `'error'` event, never by throwing — the
    same short grace period `ollama-runtime.ts` waits before assuming the
    process is on its way to becoming a real server. */
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

/** `llamaCppServerProbe` reports plain reachability (`boolean`); `start`'s own
    poll deals in `LocalRuntimeStatus` so it can share `pollUntilRunning` with
    a directly-injected status sequence (`deps.probeFn`) in tests. */
function toStatusProbe(reachable: () => Promise<boolean>): () => Promise<LocalRuntimeStatus> {
  return async () => ((await reachable()) ? 'running' : 'installed-stopped');
}

/** Polls `probeFn` until it reports `'running'` or `timeoutMs` has elapsed —
    always resolves with the last observed status, never rejects. */
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

/** The lexicographically first `.gguf` file in the model directory, or `null`
    when none is there yet — deterministic without reading file times. */
async function firstGgufModel(modelDir: string, fs: EngineFs): Promise<string | null> {
  const entries = await fs.list(modelDir);
  const names = entries
    .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => entry.name)
    .sort();
  return names.length > 0 ? (names[0] ?? null) : null;
}

/** Test seam: production reads the real platform, `userData`, spawns the real
    process via the real `child_process.spawn` and probes the real endpoint
    over the real `fetch`; tests inject every one, so no test ever spawns a
    process or touches the network. */
export interface LlamaCppStartDeps {
  platform?: string;
  userDataDir?: string;
  fs?: EngineFs;
  spawnFn?: SpawnFn;
  /** The reachability probe's `fetch` — required to actually probe, exactly
      like `llamacpp-status.ts`'s own `statusFetchImpl`: no silent default to
      the real network from an unconfigured caller. */
  fetchImpl?: FetchFn;
  /** Test seam for the whole poll, when a fake status sequence is easier to
      express than fake fetch plumbing. Overrides `fetchImpl`. */
  probeFn?: () => Promise<LocalRuntimeStatus>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  spawnErrorGraceMs?: number;
}

export type LlamaCppStartPart = RuntimeInstallerPart<'start'>;

export function createLlamaCppStartPart(deps: LlamaCppStartDeps = {}): LlamaCppStartPart {
  const platform = deps.platform ?? os.platform();
  const userDataDir = deps.userDataDir ?? app.getPath('userData');
  const fs = deps.fs ?? nodeEngineFs;
  const spawnFn = deps.spawnFn ?? nodeSpawn;
  const timeoutMs = deps.timeoutMs ?? START_TIMEOUT_MS;
  const pollIntervalMs = deps.pollIntervalMs ?? START_POLL_INTERVAL_MS;
  const spawnErrorGraceMs = deps.spawnErrorGraceMs ?? SPAWN_ERROR_GRACE_MS;
  const probeFn =
    deps.probeFn ??
    (deps.fetchImpl
      ? toStatusProbe(llamaCppServerProbe({ fetchImpl: deps.fetchImpl }))
      : async () => 'installed-stopped' as const);

  return {
    id: 'llamacpp',

    start: async (): Promise<RuntimeStartOutcome> => {
      const binaryPath = engineBinaryPath(
        engineTargetDir(userDataDir, ENGINE_TARGET_SUBDIR),
        platform,
      );
      if (!(await fs.exists(binaryPath))) {
        return { started: false, status: 'absent', reason: 'spawn-failed' };
      }

      const modelDir = ggufModelDir(userDataDir);
      const modelFile = await firstGgufModel(modelDir, fs);
      if (modelFile === null) {
        return { started: false, status: 'installed-stopped', reason: 'spawn-failed' };
      }
      const modelPath = path.join(modelDir, modelFile);

      const child = spawnFn(binaryPath, llamaServerArgs(modelPath), {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      const failedToSpawn = await awaitSpawnError(child, spawnErrorGraceMs);
      if (failedToSpawn) {
        return { started: false, status: 'absent', reason: 'spawn-failed' };
      }
      child.unref();

      const status = await pollUntilRunning(async () => probeFn(), timeoutMs, pollIntervalMs);
      return status === 'running'
        ? { started: true, status }
        : { started: false, status, reason: 'timeout' };
    },
  };
}
