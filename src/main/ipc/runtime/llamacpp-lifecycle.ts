/* llama.cpp's dedicated lifecycle module (034, D2 + D3): what the app knows
 * about its engine (status, start plan) and what it owns of it (the tracked
 * process, and stopping it again). Where `llamacpp-status.ts` (033) probed a
 * single fixed port and `llamacpp-start.ts` started with fixed, conservative
 * flags, this module works over the configurable range Decisions Q3 names
 * (11435–11444) and derives the start values from this machine instead of a
 * constant. The spawn itself is `llamacpp-engine-start.ts` (D3), which is the
 * only caller of `trackOwnedEngine` — that direction is deliberate: ownership
 * state lives *here*, next to the status read that interprets it, and nothing
 * imports back the other way.
 *
 * `getLlamaEngineStatus` adds the one fact `llm:localRuntimeStatus` doesn't
 * carry: `ownedByApp` (Decisions, Q6 — a foreign runtime is shown as running
 * but never stopped). A port that answers without a tracked process behind it
 * is honestly reported as not owned, and `stopLlamaEngine` refuses to touch
 * it — the app does not act on a process the user owns.
 *
 * `getLlamaStartPlan` plugs the currently installed `.gguf` file and the
 * current machine facts / resource budget / advanced overrides into D1's pure
 * `planLlamaStart`. It reads the *remembered* machine scan (the same cache
 * `machine-scan.ts` itself reads from) rather than probing the GPU again —
 * this module has no detection code of its own, by design: guardrail 5 keeps
 * shelling out to platform tools out of every corner that would otherwise
 * duplicate it.
 */

import * as os from 'node:os';
import * as path from 'node:path';
import { app } from 'electron';
import { applyVramOverride } from '@core/llm';
import type { FetchLike } from '@core/llm';
import { parseParamsB } from '@core/llm/hf/params';
import { planLlamaStart } from '@core/llm/llama-args';
import { isValidLlamaOverrideValue } from '@shared/llm/llama-overrides';
import {
  DEFAULT_RESOURCE_BUDGET_PERCENT,
  isValidResourceBudgetPercent,
} from '@shared/llm/resource-budget';
import type {
  LlamaOverrides,
  LlamaStartPlan,
  LocalRuntimeStatus,
  MachineFacts,
} from '@shared/types';
import type { HandlerMap } from '../registry';
import { defineHandlers, fail } from '../registry';
import type { Services } from '../../services';
import { createMachineScanCache } from '../../machine-scan-cache';
import type { EngineFs } from './engine-fs';
import { nodeEngineFs } from './engine-fs';
import type { LlamaChildProcess } from './llamacpp-spawn';
import { signalChild } from './llamacpp-spawn';
import { firstReachableLlamaCppPort, LLAMACPP_PROBE_TIMEOUT_MS } from './llamacpp-status';
import { engineBinaryPath, engineTargetDir, ggufModelDir } from './paths';

/** Where the engine lands regardless of build variant — the same value as
    `llamacpp-install.ts`'s own constant, duplicated here for the same reason
    033 already duplicates it between install and status: each module's test
    seam stays independent of the others. */
const ENGINE_TARGET_SUBDIR = 'runtimes/llamacpp';

/** Where an installed engine binary sits — one definition for the status read
    here and the spawn in `llamacpp-engine-start.ts`, so the file that is
    checked for existence is always the file that gets started. */
export function llamaEngineBinaryPath(userDataDir: string, platform: string): string {
  return engineBinaryPath(engineTargetDir(userDataDir, ENGINE_TARGET_SUBDIR), platform);
}

/** How long `stopLlamaEngine` gives a `SIGTERM`'d engine to exit on its own
    before it escalates to `SIGKILL`. Generous compared to the start-side
    grace periods on purpose: llama-server frees GPU memory on the way out,
    and a hard kill that skips that is the worse outcome of the two — but a
    stop that never completes would be worse still. */
const STOP_GRACE_MS = 2_000;

/** How often the graceful window is re-checked. */
const STOP_POLL_INTERVAL_MS = 25;

/**
 * The engine process this app started and is still tracking. `exited` is kept
 * next to the handle rather than asked of it: Node reports the exit once, as
 * an event, and both the stop sequence and the quit hook need to know it
 * afterwards.
 */
interface TrackedEngine {
  readonly child: LlamaChildProcess;
  exited: boolean;
}

/**
 * Module-level "did the app start what is currently answering" state — the
 * port and, since D3, the handle behind it. Deliberately module state rather
 * than something threaded through every call: ownership is a fact about the
 * process this app is running, not about any one status read of it.
 *
 * The invariant both fields serve: `ownedPort` names a port only for as long
 * as a process of ours actually holds it. The moment that process exits — by
 * our signal, by a crash, or because the user killed it — both are cleared,
 * so a *foreign* server that later takes the same port can never be reported
 * as `ownedByApp` (Decisions, Q6) or be stopped by us.
 */
let ownedPort: number | null = null;
let ownedEngineState: TrackedEngine | null = null;

/** Test seam to simulate "the app already started something" without a real
    process. Setting a port alone leaves no handle behind, which is exactly
    the foreign case `stopLlamaEngine` must refuse to act on. */
export function setOwnedPort(port: number | null): void {
  ownedPort = port;
}

/**
 * Records the spawned engine as this app's own. Called from
 * `llamacpp-engine-start.ts` and nowhere else. The `'exit'` listener is the
 * other half of the invariant above: ownership dies with the process, whether
 * or not anyone asked it to.
 */
export function trackOwnedEngine(child: LlamaChildProcess, port: number): void {
  const tracked: TrackedEngine = { child, exited: false };
  child.once('exit', () => {
    tracked.exited = true;
    if (ownedEngineState === tracked) {
      ownedEngineState = null;
      ownedPort = null;
    }
  });
  ownedEngineState = tracked;
  ownedPort = port;
}

/** The engine this app started and that is still alive, or `null`. What
    `startLlamaEngine` checks before spawning a second one — two servers where
    one is tracked is exactly how an orphan is made. */
export function ownedEngine(): { port: number } | null {
  if (!ownedEngineState || ownedEngineState.exited || ownedPort === null) return null;
  return { port: ownedPort };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for the tracked process's `'exit'` — polled rather than awaited as an
    event, because the listener that flips the flag is already attached (and
    must stay the only one that clears ownership). */
async function awaitExit(tracked: TrackedEngine, graceMs: number, pollMs: number): Promise<void> {
  const deadline = Date.now() + graceMs;
  while (!tracked.exited && Date.now() < deadline) await wait(pollMs);
}

export interface LlamaStopDeps {
  graceMs?: number;
  pollIntervalMs?: number;
}

/**
 * Stops the engine *this app started* — `SIGTERM`, a short grace period, then
 * `SIGKILL` if it is still there (AC 6: stopping leaves no orphaned process).
 *
 * Never refused (Decisions, Q5), and never applied to a runtime the app does
 * not own (Q6): with no tracked process there is nothing of ours to stop, so
 * this reports `stopped: false` and touches nothing at all — not the port,
 * not whatever is answering on it. In-flight requests are not tracked here on
 * purpose; they fail through the gateway's existing `unreachable` mapping.
 */
export async function stopLlamaEngine(deps: LlamaStopDeps = {}): Promise<{ stopped: boolean }> {
  const tracked = ownedEngineState;
  if (!tracked) return { stopped: false };
  ownedEngineState = null;
  ownedPort = null;
  if (!tracked.exited) {
    signalChild(tracked.child, 'SIGTERM');
    await awaitExit(
      tracked,
      deps.graceMs ?? STOP_GRACE_MS,
      deps.pollIntervalMs ?? STOP_POLL_INTERVAL_MS,
    );
    if (!tracked.exited) signalChild(tracked.child, 'SIGKILL');
  }
  return { stopped: true };
}

/**
 * The `will-quit` half of AC 6 ("closing the app stops what the app
 * started"), called from `src/main/index.ts`. Synchronous best-effort, like
 * every other cleanup on that path: the app is already leaving, so no timer
 * between here and process exit would ever fire — which is why this does not
 * grant the graceful window `stopLlamaEngine` grants and escalates straight
 * away. The engine holds no unsaved state (weights are read-only, nothing is
 * persisted), so the cost of the hard signal is zero and the cost of skipping
 * it is a `llama-server` that outlives the app: this child is *not* detached,
 * and nothing else would ever reap it.
 *
 * A foreign engine is left running, exactly as Q6 requires — without a
 * tracked handle there is nothing here to signal.
 */
export function stopOwnedLlamaEngineOnQuit(): void {
  const tracked = ownedEngineState;
  ownedEngineState = null;
  ownedPort = null;
  if (!tracked || tracked.exited) return;
  signalChild(tracked.child, 'SIGTERM');
  signalChild(tracked.child, 'SIGKILL');
}

/** The lexicographically first `.gguf` file in the model directory, or `null`
    when none is there yet — deterministic without reading file times, and the
    same file `startLlamaEngine` points the engine at. */
export async function firstGgufModel(modelDir: string, fs: EngineFs): Promise<string | null> {
  const entries = await fs.list(modelDir);
  const names = entries
    .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.gguf'))
    .map((entry) => entry.name)
    .sort();
  return names.length > 0 ? (names[0] ?? null) : null;
}

/** A machine nobody has ever scanned — every fact honestly `null`/`not-
    attempted` rather than a guess, the same convention `MachineFacts` itself
    documents. What `getLlamaStartPlan` plans against when there is no
    remembered scan to read. */
const UNKNOWN_FACTS: MachineFacts = {
  totalRamMb: null,
  cpuCores: null,
  platform: null,
  arch: null,
  freeDiskMb: null,
  vramMb: null,
  gpuName: null,
  gpuDetection: 'not-attempted',
};

/** The settings this module plans against when nothing is injected: full
    budget, no hand-entered overrides — matches `CapacityVerdict.budgetPercent`
    's own "undefined means 100%, no reduction" convention. */
const DEFAULT_MACHINE_SETTINGS: LlamaLifecycleSettings = {
  resourceBudgetPercent: 100,
  llamaOverrides: { gpuLayers: null, contextTokens: null },
};

export interface LlamaLifecycleSettings {
  resourceBudgetPercent: number;
  llamaOverrides: LlamaOverrides;
}

/**
 * Test seam: production reads the real platform, `userData`, the real
 * filesystem and the real network, and the real settings/scan cache; tests
 * inject every one, so no test here ever touches a real disk, a real
 * process, or the real network.
 */
export interface LlamaLifecycleDeps {
  platform?: string;
  userDataDir?: string;
  fs?: EngineFs;
  /** Required to actually probe a port, exactly like `llamacpp-status.ts`'s
      own `fetchImpl`: no silent default to the real network from an
      unconfigured caller. Without one, status degrades to the honest
      presence-only answer (`'installed-stopped'`), never a stray request. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** The resource budget (029) and advanced overrides (Decisions, Q1) to plan
      against. Production reads them off `services.settings.snapshot().app
      .machine`, the same values `machine-scan.ts`'s `budgetOf` reads. */
  readSettings?: () => LlamaLifecycleSettings;
  /** The machine facts to plan against. Production reuses the remembered
      scan (`machine-scan.ts`'s cache) with the current VRAM override folded
      in — never a fresh GPU probe, this module has no detection code of its
      own. */
  readFacts?: () => Promise<MachineFacts>;
}

interface ResolvedDeps {
  platform: string;
  userDataDir: string;
  fs: EngineFs;
  fetchImpl: FetchLike | undefined;
  timeoutMs: number;
  readSettings: () => LlamaLifecycleSettings;
  readFacts: () => Promise<MachineFacts>;
}

export function resolveLifecycleDeps(deps: LlamaLifecycleDeps): ResolvedDeps {
  return {
    platform: deps.platform ?? os.platform(),
    userDataDir: deps.userDataDir ?? app.getPath('userData'),
    fs: deps.fs ?? nodeEngineFs,
    fetchImpl: deps.fetchImpl,
    timeoutMs: deps.timeoutMs ?? LLAMACPP_PROBE_TIMEOUT_MS,
    readSettings: deps.readSettings ?? (() => DEFAULT_MACHINE_SETTINGS),
    readFacts: deps.readFacts ?? (async () => UNKNOWN_FACTS),
  };
}

/**
 * Binary presence, then reachability across the port range, then ownership —
 * in that order, so an absent engine is never probed and a stopped one is
 * never reported as owned. Never throws: every branch is a `LocalRuntimeStatus`
 * value, the same contract `detectLlamaCppStatus` (033) already keeps.
 */
export async function getLlamaEngineStatus(
  deps: LlamaLifecycleDeps = {},
): Promise<{ status: LocalRuntimeStatus; ownedByApp: boolean; port: number | null }> {
  const { platform, userDataDir, fs, fetchImpl, timeoutMs } = resolveLifecycleDeps(deps);
  if (!(await fs.exists(llamaEngineBinaryPath(userDataDir, platform)))) {
    return { status: 'absent', ownedByApp: false, port: null };
  }
  if (!fetchImpl) {
    return { status: 'installed-stopped', ownedByApp: false, port: null };
  }
  const port = await firstReachableLlamaCppPort(fetchImpl, timeoutMs);
  if (port === null) {
    return { status: 'installed-stopped', ownedByApp: false, port: null };
  }
  // `ownedPort` is only set while a process of ours actually holds that port
  // (see the invariant above), so a port that answers without matching it is
  // someone else's server — reported as running, never as ours.
  return { status: 'running', ownedByApp: port === ownedPort, port };
}

/**
 * D1's `planLlamaStart` fed from the currently installed model file plus the
 * current facts/budget/overrides — `null` when no `.gguf` file is installed,
 * an honest "nothing to plan for" rather than a plan over a model that isn't
 * there.
 */
export async function getLlamaStartPlan(
  deps: LlamaLifecycleDeps = {},
): Promise<LlamaStartPlan | null> {
  const { userDataDir, fs, readSettings, readFacts } = resolveLifecycleDeps(deps);
  const modelDir = ggufModelDir(userDataDir);
  const fileName = await firstGgufModel(modelDir, fs);
  if (fileName === null) return null;

  const sizeBytes = (await fs.size?.(path.join(modelDir, fileName))) ?? null;
  // 0 (not `null`) on purpose: `LlamaModelFile.fileSizeMb` is a plain
  // `number`, and D1's own `resolveGpuLayers` already treats a size that
  // isn't usable (`<= 0`) as its `'unknown-size'` case — the honest fallback
  // already exists downstream, so this does not invent a second one.
  const fileSizeMb = sizeBytes !== null ? sizeBytes / (1024 * 1024) : 0;

  const { resourceBudgetPercent, llamaOverrides } = readSettings();
  const facts = await readFacts();

  return planLlamaStart({
    facts,
    budgetPercent: resourceBudgetPercent,
    model: {
      fileName,
      fileSizeMb,
      paramsB: parseParamsB(fileName),
      // 033 persists no metadata catalog to read a real count from; D1's own
      // landmark table fills this in from `paramsB` and marks the plan
      // `estimated` accordingly — duplicating that table here would be a
      // second guess sitting next to the one D1 already owns.
      totalLayers: null,
    },
    overrides: llamaOverrides,
  });
}

/** Validates one override field against the current stored value (034, D5):
    `undefined` in the request leaves it untouched, `null` clears it, and
    anything else must be a non-negative integer — `planLlamaStart`'s own
    clamp is the ceiling, not this check (see `shared/llm/llama-overrides.ts`). */
function resolveOverrideField(
  raw: number | null | undefined,
  current: number | null,
  field: string,
): number | null {
  if (raw === undefined) return current;
  if (raw === null) return null;
  if (!isValidLlamaOverrideValue(raw)) {
    throw fail('invalid', `${field} muss eine nicht negative ganze Zahl sein`);
  }
  return raw;
}

/**
 * Writes the advanced start-plan overrides (034, D5) — a single-field patch
 * per call, so setting one field never clobbers the sibling one — then
 * returns the plan freshly derived from the value just written, so the
 * card's readout updates in the same round trip a stop/start already gets,
 * without a follow-up `llm:llamaStartPlan` call. Machine-local, the same
 * write path `machine-scan.ts`'s two setters (`llm:setVramOverride`,
 * `llm:setResourceBudget`) already use.
 */
export async function setLlamaOverrides(
  services: Services,
  patch: Partial<LlamaOverrides>,
  deps: LlamaLifecycleDeps = {},
): Promise<LlamaStartPlan | null> {
  const current = services.settings.snapshot().app.machine.llamaOverrides;
  const next: LlamaOverrides = {
    gpuLayers: resolveOverrideField(patch.gpuLayers, current.gpuLayers, 'gpuLayers'),
    contextTokens: resolveOverrideField(
      patch.contextTokens,
      current.contextTokens,
      'contextTokens',
    ),
  };
  await services.settings.patchApp({ machine: { llamaOverrides: next } });
  return getLlamaStartPlan(deps);
}

/** The resource budget + advanced overrides straight off `AppSettings.machine`
    — the same settings object `machine-scan.ts`'s `budgetOf`/`vramOverrideOf`
    already read, not a new seam. A stored budget that isn't a valid
    percentage (a hand-edited settings file) falls back to the default rather
    than poisoning the plan with `NaN`. */
function readMachineSettings(services: Services): () => LlamaLifecycleSettings {
  return () => {
    const machine = services.settings.snapshot().app.machine;
    const resourceBudgetPercent = isValidResourceBudgetPercent(machine.resourceBudgetPercent)
      ? machine.resourceBudgetPercent
      : DEFAULT_RESOURCE_BUDGET_PERCENT;
    return { resourceBudgetPercent, llamaOverrides: machine.llamaOverrides };
  };
}

/** The remembered machine scan (never a fresh probe here) with the current
    VRAM override folded in — the same cache and the same merge step
    `machine-scan.ts`'s own handlers read, so a plan here can never disagree
    with what the machine card shows. No cache, or a machine never scanned,
    reads as `UNKNOWN_FACTS` — the honest "don't know" the plan already
    handles gracefully, not a live GPU probe this module has no code for. */
function readMachineFacts(services: Services): () => Promise<MachineFacts> {
  const cache = services.userDataDir ? createMachineScanCache(services.userDataDir) : null;
  return async () => {
    const cached = await cache?.read();
    const vramOverrideMb = services.settings.snapshot().app.machine.vramOverrideMb;
    return applyVramOverride(cached?.facts ?? UNKNOWN_FACTS, vramOverrideMb);
  };
}

/**
 * The production seam wiring: the real `fetch`, the real machine settings and
 * the remembered scan. Shared by the read handlers below and by the start part
 * in `llamacpp-engine-start.ts` (composed in `register-all.ts`), so the plan a
 * card shows and the plan an engine is actually started with can never come
 * from different inputs.
 */
export function productionLifecycleDeps(services: Services): LlamaLifecycleDeps {
  return {
    fetchImpl: fetch,
    readSettings: readMachineSettings(services),
    readFacts: readMachineFacts(services),
  };
}

/**
 * `llm:llamaEngineStatus` / `llm:llamaStartPlan` (034, D2) and
 * `llm:stopLlamaEngine` (D3) — direct handlers, not routed through the
 * `RuntimeInstaller` registry: all three are llama.cpp-specific with no Ollama
 * equivalent, so a per-runtime dispatch would only add a lookup none of them
 * needs. Stop in particular must *not* widen `RuntimeInstaller`: Ollama has no
 * stop and must not be made to implement one.
 *
 * `start` is the exception that does go through the registry — it shares
 * `llm:startLocalRuntime` with Ollama, and that channel already dispatches.
 */
export function llamaLifecycleHandlers(
  services: Services,
  extraDeps: LlamaLifecycleDeps = {},
): HandlerMap {
  const deps: LlamaLifecycleDeps = { ...productionLifecycleDeps(services), ...extraDeps };
  return defineHandlers({
    'llm:llamaEngineStatus': () => getLlamaEngineStatus(deps),
    'llm:llamaStartPlan': () => getLlamaStartPlan(deps),
    'llm:stopLlamaEngine': () => stopLlamaEngine(),
    'llm:setLlamaOverrides': (patch) => setLlamaOverrides(services, patch, deps),
  });
}
