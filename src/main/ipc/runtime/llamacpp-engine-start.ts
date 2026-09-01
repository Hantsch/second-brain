/* Starting the llama.cpp engine (034, D3) — the replacement for 033's
 * `llamacpp-start.ts`, whose own header already named this the change it was
 * waiting for: the flags are no longer the fixed `-ngl 0 -c 4096` pair but
 * D1's machine-derived plan, and the port is no longer the fixed 8080 but the
 * first free one in the range Decisions Q3 names.
 *
 * The shape is still `ollama-runtime.ts`'s — an injectable spawn seam, a short
 * grace period for the asynchronous spawn error, then a poll until the server
 * answers — with three differences that all come from the same fact: this app
 * *owns* this process (`llamacpp-spawn.ts` explains the seam).
 *
 * 1. **Nothing is spawned that cannot be stopped again.** The port is probed
 *    before the spawn, never after; everything that is spawned is tracked
 *    before the readiness poll starts, so even a start that reports a failure
 *    leaves a process the card and the quit hook can still end — an orphan is
 *    a process nobody holds a handle to, and no branch here produces one. And
 *    a start while an engine of ours is already tracked never becomes a
 *    second server whose predecessor's handle is overwritten — nor does a
 *    start that arrives *while another start is still running*, which is what
 *    the single-flight guard on `startLlamaEngine` is for.
 * 2. **Failures are classified, never passed through** (AC 5). The four causes
 *    the user can act on come from what is *known* — no binary, no model, no
 *    free port — or, where only the process knows, from a substring match on
 *    its captured stderr. That buffer never leaves this module: no log line,
 *    no IPC response, no vault (guardrail 6). Neither does the model path or
 *    the argv.
 * 3. **The port is written back** into the llama.cpp provider afterwards
 *    (`llamacpp-provider-port.ts`), best-effort: a start is not undone by a
 *    settings write that found nothing to update.
 */

import * as path from 'node:path';
import type { FetchLike } from '@core/llm';
import type { Services } from '../../services';
import type { LlamaLifecycleDeps } from './llamacpp-lifecycle';
import {
  firstGgufModel,
  getLlamaStartPlan,
  llamaEngineBinaryPath,
  ownedEngine,
  resolveLifecycleDeps,
  stopLlamaEngine,
  trackOwnedEngine,
} from './llamacpp-lifecycle';
import { safeLlamaLogLine } from './llamacpp-log-safety';
import { adoptLlamaProviderPort } from './llamacpp-provider-port';
import type { LlamaChildProcess, LlamaSpawnFn } from './llamacpp-spawn';
import { nodeLlamaSpawn } from './llamacpp-spawn';
import { LLAMA_PORT_RANGE_END, LLAMA_PORT_RANGE_START, probeLlamaCppPort } from './llamacpp-status';
import { ggufModelDir } from './paths';
import type { RuntimeInstallerPart, RuntimeStartOutcome } from './types';

/** The readiness ceiling, four times `ollama-runtime.ts`'s: Ollama's server
    is up as soon as its port opens, while `llama-server` reads a multi-
    gigabyte model off disk first, and 5 seconds would report `'timeout'` for
    a start that is merely slow on exactly the weak hardware this story is
    for. A start that outlasts even this reports `'timeout'` honestly — the
    app could not confirm the engine came up — and leaves it tracked. */
const START_TIMEOUT_MS = 20_000;
const START_POLL_INTERVAL_MS = 300;
const SPAWN_ERROR_GRACE_MS = 200;

/** How much of the engine's stderr is kept for classification. A few
    kilobytes: the allocator and bind failures below announce themselves in
    the first lines, and an unbounded buffer would grow with every token the
    server logs for as long as it runs. */
const STDERR_BUFFER_LIMIT = 4_000;

/** What a failed llama.cpp start says about itself. Substrings, matched case-
    insensitively against the captured stderr — llama.cpp, ggml and the CUDA
    allocator each word it differently, and the wording changes between
    releases, so this is a best-effort classification: an unrecognised failure
    stays the generic `'spawn-failed'`/`'timeout'` rather than being guessed
    into a cause the user would act on for nothing. */
const OUT_OF_MEMORY_MARKERS = [
  'failed to allocate',
  'out of memory',
  'cudamalloc failed',
  'insufficient memory',
  'unable to allocate',
];

/** A port the pre-flight probe found "free" can still be held by something
    that simply doesn't answer `/v1/models` — a non-HTTP listener, or a
    llama-server still starting up. The bind failure is the honest signal for
    that, and it maps to the same cause the pre-flight scan reports. */
const PORT_IN_USE_MARKERS = ['address already in use', 'failed to bind', 'bind: '];

function contains(haystack: string, needles: readonly string[]): boolean {
  const text = haystack.toLowerCase();
  return needles.some((needle) => text.includes(needle));
}

/** The one part of a failure the user gets to see is this classification —
    never the text it was derived from. */
function classifyStderr(stderr: string): 'out-of-memory' | 'port-in-use' | null {
  if (contains(stderr, OUT_OF_MEMORY_MARKERS)) return 'out-of-memory';
  if (contains(stderr, PORT_IN_USE_MARKERS)) return 'port-in-use';
  return null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `spawn` reports a failure to even start (`ENOENT`, wrong permissions, …)
    asynchronously via the child's `'error'` event, never by throwing — the
    same short grace period `ollama-runtime.ts` waits before assuming the
    process is on its way to becoming a real server. */
function awaitSpawnError(child: LlamaChildProcess, graceMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    timer.unref();
    child.once('error', () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/** Spawns the engine and starts collecting its stderr immediately — the
    evidence a failure is classified from has to be captured before the
    failure happens. */
function spawnEngine(
  spawnFn: LlamaSpawnFn,
  binaryPath: string,
  argv: readonly string[],
): { child: LlamaChildProcess; stderr: () => string } {
  const child = spawnFn(binaryPath, argv, {
    detached: false,
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true,
  });
  let captured = '';
  child.stderr?.on('data', (chunk) => {
    if (captured.length >= STDERR_BUFFER_LIMIT) return;
    captured = (captured + String(chunk)).slice(0, STDERR_BUFFER_LIMIT);
  });
  return { child, stderr: () => captured };
}

/**
 * First port in the range that does *not* answer — the mirror of
 * `firstReachableLlamaCppPort`. Probing before spawning is what turns "the
 * port is taken" into a cause the user can act on instead of a server that
 * dies silently on a bind error.
 */
export async function firstFreePort(
  fetchImpl: FetchLike,
  timeoutMs?: number,
): Promise<number | null> {
  for (let port = LLAMA_PORT_RANGE_START; port <= LLAMA_PORT_RANGE_END; port += 1) {
    if (!(await probeLlamaCppPort(fetchImpl, port, timeoutMs))) return port;
  }
  return null;
}

/**
 * Polls until the engine answers on its own port, the child dies, or the
 * ceiling is reached. `hasExited` is the reason this is not a pure HTTP loop:
 * a process that crashed a second after the spawn error grace period would
 * otherwise be waited out for the full `START_TIMEOUT_MS` and then reported as
 * a `'timeout'` — twenty seconds of nothing, and the wrong cause at the end
 * of it.
 */
async function pollUntilReachable(
  fetchImpl: FetchLike,
  port: number,
  probeTimeoutMs: number,
  timeoutMs: number,
  pollIntervalMs: number,
  hasExited: () => boolean,
): Promise<'reachable' | 'died' | 'timeout'> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await probeLlamaCppPort(fetchImpl, port, probeTimeoutMs)) return 'reachable';
    if (hasExited()) return 'died';
    if (Date.now() >= deadline) return 'timeout';
    await wait(pollIntervalMs);
  }
}

export interface LlamaStartDeps extends LlamaLifecycleDeps {
  spawnFn?: LlamaSpawnFn;
  /** Ceiling for the readiness poll, not for a single probe — the per-probe
      timeout is `LlamaLifecycleDeps.timeoutMs`. */
  startTimeoutMs?: number;
  pollIntervalMs?: number;
  spawnErrorGraceMs?: number;
  /** How long the cleanup of a start that never came up waits before the hard
      signal; passed straight to `stopLlamaEngine`. */
  stopGraceMs?: number;
  /** The `baseUrl` write-back (Decisions, Q3). Production hands in the vault
      settings via `createLlamaLifecycleStartPart`; a caller with no settings
      to write to simply doesn't, and the start is unaffected. */
  adoptPort?: (port: number) => Promise<unknown>;
}

/**
 * The one start attempt that may be in flight at a time — module state, for
 * the same reason `llamacpp-lifecycle.ts`'s ownership is: it guards one
 * physical engine, not one call. The check inside `runStart` ("do we already
 * own one?") cannot do this on its own, because two callers that arrive
 * together both pass it before either has spawned anything: the manual
 * `llm:startLocalRuntime` press and `ensureLlamaRunning()`'s on-demand attempt
 * are exactly that pair, and the loser's handle would be dropped by
 * `trackOwnedEngine` — an untrackable server neither the stop button nor the
 * quit hook could ever reach.
 */
let startInFlight: Promise<RuntimeStartOutcome> | null = null;

/**
 * Starts the engine with D1's derived flags on the first free port, or names
 * one of the causes AC 5 lists. Never throws — every branch is a typed
 * `RuntimeStartOutcome`, the same contract Ollama's `start` keeps.
 *
 * Single-flight: a second call joins the attempt already running rather than
 * spawning a second server. The check-and-set is synchronous (before any
 * `await`), the same shape `llamacpp-autostart.ts`'s `ensureInFlight` uses —
 * that guard stays where it is and now sits one level above this one, since
 * it also skips the status probe a joined call has no use for.
 */
export function startLlamaEngine(deps: LlamaStartDeps = {}): Promise<RuntimeStartOutcome> {
  if (startInFlight) return startInFlight;
  startInFlight = runStart(deps).finally(() => {
    startInFlight = null;
  });
  return startInFlight;
}

async function runStart(deps: LlamaStartDeps): Promise<RuntimeStartOutcome> {
  const { platform, userDataDir, fs, fetchImpl, timeoutMs } = resolveLifecycleDeps(deps);

  // A second spawn while an engine of ours is tracked would take a second
  // port and overwrite the first one's handle — precisely how an untracked,
  // unstoppable engine is made. So: if ours answers, that *is* the answer; if
  // it doesn't (a start that timed out and was kept, see below), it is
  // stopped first, and only then is a new one spawned.
  const already = ownedEngine();
  if (already) {
    const stillAnswering = fetchImpl
      ? await probeLlamaCppPort(fetchImpl, already.port, timeoutMs)
      : true;
    if (stillAnswering) return { started: true, status: 'running' };
    await stopLlamaEngine({ graceMs: deps.stopGraceMs });
  }

  if (!(await fs.exists(llamaEngineBinaryPath(userDataDir, platform)))) {
    return { started: false, status: 'absent', reason: 'binary-missing' };
  }

  const modelDir = ggufModelDir(userDataDir);
  const modelFile = await firstGgufModel(modelDir, fs);
  if (modelFile === null) {
    return { started: false, status: 'installed-stopped', reason: 'model-missing' };
  }

  // Unreachable in production (`register-all.ts` wires the real `fetch`): a
  // caller with no probe could neither find a free port nor confirm the
  // engine came up, and spawning blind risks the very collision
  // `'port-in-use'` exists to prevent. So it refuses, generically — this is
  // an unconfigured caller, not a cause the user could act on.
  if (!fetchImpl) return { started: false, status: 'installed-stopped', reason: 'spawn-failed' };

  const port = await firstFreePort(fetchImpl, timeoutMs);
  if (port === null) {
    return { started: false, status: 'installed-stopped', reason: 'port-in-use' };
  }

  const plan = await getLlamaStartPlan(deps);
  // The model file was there a moment ago, so this is a race with a delete
  // rather than a state of its own — reported as the same honest cause.
  if (plan === null) {
    return { started: false, status: 'installed-stopped', reason: 'model-missing' };
  }

  // `spawn` reports almost every failure through the `'error'` event below,
  // but not all of them: a bad argument type, an unrepresentable path, or an
  // `EPERM` from the platform layer throws right here, synchronously. Outside
  // a `try` that error would escape this module's "never throws, always a
  // classified reason" contract — and `registry.ts` logs an unclassified
  // throw with `console.error(error)`, message and stack included, which for
  // a spawn error means the binary and model path in a log line (guardrail 6,
  // AC 8). Hence: same classification as any other spawn failure, and a
  // fixed, path-free note through `safeLlamaLogLine`.
  let engine: { child: LlamaChildProcess; stderr: () => string };
  try {
    // `plan.argv` carries only the derived flags; the model path and the port
    // are spawn-time concerns D1 deliberately keeps out of anything that
    // crosses IPC (guardrail 6).
    const argv = [...plan.argv, '--port', String(port), '-m', path.join(modelDir, modelFile)];
    const spawnFn = deps.spawnFn ?? nodeLlamaSpawn;
    engine = spawnEngine(spawnFn, llamaEngineBinaryPath(userDataDir, platform), argv);
  } catch {
    console.warn(safeLlamaLogLine('[llamacpp] die Engine konnte nicht gestartet werden'));
    return { started: false, status: 'absent', reason: 'spawn-failed' };
  }

  if (await awaitSpawnError(engine.child, deps.spawnErrorGraceMs ?? SPAWN_ERROR_GRACE_MS)) {
    // Nothing to track: a process that never started cannot be orphaned.
    const cause = classifyStderr(engine.stderr());
    return cause === null
      ? { started: false, status: 'absent', reason: 'spawn-failed' }
      : { started: false, status: 'installed-stopped', reason: cause };
  }

  // Owned from here on — before the poll, not after it, so a stop pressed
  // while the engine is still coming up reaches this process. The returned
  // probe is over this very child, so the poll below can tell "still loading"
  // from "already dead" without a second `'exit'` listener.
  const hasExited = trackOwnedEngine(engine.child, port);

  const outcome = await pollUntilReachable(
    fetchImpl,
    port,
    timeoutMs,
    deps.startTimeoutMs ?? START_TIMEOUT_MS,
    deps.pollIntervalMs ?? START_POLL_INTERVAL_MS,
    hasExited,
  );
  if (outcome === 'reachable') {
    await adoptPortQuietly(deps, port);
    return { started: true, status: 'running' };
  }

  // A process that died on its own has already cleared its own ownership
  // through the `'exit'` listener, so there is nothing left to track — and
  // `'spawn-failed'` is the honest generic cause for it, not `'timeout'`: the
  // ceiling was never reached.
  const cause = classifyStderr(engine.stderr());
  if (outcome === 'died') {
    return { started: false, status: 'installed-stopped', reason: cause ?? 'spawn-failed' };
  }

  // Deliberately *not* killed here. On the hardware this story is for, a
  // large model can still be loading when the ceiling is reached, and killing
  // it would make the engine look permanently unstartable on exactly the
  // machines that need it most. It stays tracked instead, so it is not an
  // orphan: the card can stop it, the quit hook stops it, and a later status
  // read reports it honestly once it does answer.
  return { started: false, status: 'installed-stopped', reason: cause ?? 'timeout' };
}

/** The write-back, best-effort in both directions: a missing hook is fine, and
    a failing one must not turn a running engine into a failed start. The warn
    carries no address, no path and no provider — only that it didn't happen.
    Passed through `safeLlamaLogLine` defensively (034, D7): the message is a
    bare string today, but a later edit that appends detail to it inherits
    the guarantee rather than having to reinstate it. */
async function adoptPortQuietly(deps: LlamaStartDeps, port: number): Promise<void> {
  try {
    await deps.adoptPort?.(port);
  } catch {
    console.warn(safeLlamaLogLine('[llamacpp] provider baseUrl konnte nicht aktualisiert werden'));
  }
}

/**
 * llama.cpp's `start` half of `RuntimeInstaller` — the part `register-all.ts`
 * composes into the runtime behind `llm:startLocalRuntime`, in place of 033's
 * `createLlamaCppStartPart`. `services` is only ever read lazily, inside the
 * write-back: the handler map is built before a vault is open.
 */
export function createLlamaLifecycleStartPart(
  services: Services,
  deps: LlamaStartDeps = {},
): RuntimeInstallerPart<'start'> {
  return {
    id: 'llamacpp',
    start: () =>
      startLlamaEngine({
        adoptPort: (port) => adoptLlamaProviderPort(services.settings, port),
        ...deps,
      }),
  };
}
