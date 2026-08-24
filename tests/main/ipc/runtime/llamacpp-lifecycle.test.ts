/* 034, D2 + D3: llama.cpp's lifecycle module — status across all three
 * `LocalRuntimeStatus` states plus the "adopted-foreign" case (Decisions, Q6),
 * the start plan's plumbing (the actual arithmetic is D1's own
 * `tests/core/llm/llama-args.test.ts`), and D3's start/stop/quit lifecycle:
 * every named start failure, ownership, and the guarantee that a foreign
 * engine is never signalled. Every seam is faked: no test here touches a real
 * disk, a real process, or the network — no test spawns anything.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlamaLifecycleDeps } from '../../../../src/main/ipc/runtime/llamacpp-lifecycle';
import {
  getLlamaEngineStatus,
  getLlamaStartPlan,
  llamaEngineBinaryPath,
  setLlamaOverrides,
  setOwnedPort,
  stopLlamaEngine,
  stopOwnedLlamaEngineOnQuit,
} from '../../../../src/main/ipc/runtime/llamacpp-lifecycle';
import type { LlamaStartDeps } from '../../../../src/main/ipc/runtime/llamacpp-engine-start';
import { startLlamaEngine } from '../../../../src/main/ipc/runtime/llamacpp-engine-start';
import type {
  LlamaChildProcess,
  LlamaSpawnFn,
} from '../../../../src/main/ipc/runtime/llamacpp-spawn';
import { LLAMA_PORT_RANGE_START } from '../../../../src/main/ipc/runtime/llamacpp-status';
import type { EngineFs } from '../../../../src/main/ipc/runtime/engine-fs';
import type { FetchLike } from '../../../../src/core/llm';
import type { LlamaOverrides, MachineFacts } from '../../../../src/shared/types';
import type { Services } from '../../../../src/main/services';

const USER_DATA = 'C:\\fake\\userData';
const MODEL_DIR = 'C:\\fake\\userData\\models\\gguf';

/** A fake `EngineFs` that only ever has to answer `exists`, `list` and `size`
    — the other methods belong to install/pull and are never called from this
    module, so they throw if they somehow were. */
function fakeEngineFs(options: {
  binaryExists?: boolean;
  modelFiles?: string[];
  sizesBytes?: Record<string, number>;
}): EngineFs {
  const modelFiles = options.modelFiles ?? [];
  const unreachable = (): never => {
    throw new Error('not expected to be called by the lifecycle reads');
  };
  return {
    createSink: unreachable,
    mkdir: unreachable,
    rename: unreachable,
    removeDir: unreachable,
    writable: unreachable,
    chmod: unreachable,
    exists: async () => options.binaryExists ?? true,
    list: async (dir) => {
      if (dir !== MODEL_DIR) return [];
      return modelFiles.map((name) => ({ name, isDirectory: false }));
    },
    size: async (target) => options.sizesBytes?.[target] ?? null,
  };
}

/** A `fetch` fake that answers `ok` on exactly the ports in the given set —
    never a real request. The set is read per call, so a test can open a port
    "while the engine starts" by adding it from the spawn fake. */
function fakeFetchOnPorts(openPorts: Set<number>): FetchLike {
  return async (url) => {
    const match = /:(\d+)\//.exec(String(url));
    const port = match?.[1] ? Number(match[1]) : -1;
    return { ok: openPorts.has(port) } as unknown as Response;
  };
}

/** The single-port shorthand the status tests read best with. */
function fakeFetchOnPort(okPort: number | null): FetchLike {
  return fakeFetchOnPorts(new Set(okPort === null ? [] : [okPort]));
}

interface FakeSpawn {
  spawnFn: LlamaSpawnFn;
  calls: { file: string; args: readonly string[] }[];
  /** Every signal the tracked child was sent, in order — this is what "no
      foreign process is ever touched" is asserted on. */
  signals: string[];
}

/**
 * A fake `spawn` that never starts anything. It reproduces the three things
 * the real one does asynchronously: stderr arriving on the pipe, the `'error'`
 * event a failed spawn fires instead of throwing, and the `'exit'` event a
 * signalled process fires — unless `ignoresSignals` makes it the wedged
 * process the `SIGKILL` escalation exists for.
 */
function fakeSpawn(
  options: {
    onSpawn?: () => void;
    stderr?: string;
    failToSpawn?: boolean;
    ignoresSignals?: boolean;
  } = {},
): FakeSpawn {
  const calls: { file: string; args: readonly string[] }[] = [];
  const signals: string[] = [];
  const spawnFn: LlamaSpawnFn = (file, args) => {
    calls.push({ file, args });
    let onError: ((...args: unknown[]) => void) | null = null;
    let onExit: ((...args: unknown[]) => void) | null = null;
    let onData: ((chunk: unknown) => void) | null = null;
    const child: LlamaChildProcess = {
      stderr: {
        on: (_event, listener) => {
          onData = listener;
        },
      },
      once: (event, listener) => {
        if (event === 'error') onError = listener;
        else onExit = listener;
      },
      kill: (signal) => {
        signals.push(signal);
        if (!options.ignoresSignals) queueMicrotask(() => onExit?.());
        return true;
      },
    };
    queueMicrotask(() => {
      if (options.stderr !== undefined) onData?.(options.stderr);
      if (options.failToSpawn) {
        onError?.(Object.assign(new Error('spawn llama-server ENOENT'), { code: 'ENOENT' }));
      }
      options.onSpawn?.();
    });
    return child;
  };
  return { spawnFn, calls, signals };
}

/** Fast timings throughout — the production ceilings would make this suite
    slow for no reason. */
const FAST_TIMINGS: Pick<
  LlamaStartDeps,
  'startTimeoutMs' | 'pollIntervalMs' | 'spawnErrorGraceMs' | 'stopGraceMs'
> = {
  startTimeoutMs: 40,
  pollIntervalMs: 2,
  spawnErrorGraceMs: 5,
  stopGraceMs: 10,
};

const FAST_STOP = { graceMs: 10, pollIntervalMs: 1 };

function facts(overrides: Partial<MachineFacts> = {}): MachineFacts {
  return {
    totalRamMb: null,
    cpuCores: null,
    platform: 'win32',
    arch: 'x64',
    freeDiskMb: null,
    vramMb: null,
    gpuName: null,
    gpuDetection: 'not-attempted',
    ...overrides,
  };
}

// Ownership is module state, so a test that starts something must not leak it
// into the next one — `stopLlamaEngine` is the same path production uses and
// clears both the handle and the port.
afterEach(async () => {
  await stopLlamaEngine(FAST_STOP);
  setOwnedPort(null);
});

describe('getLlamaEngineStatus', () => {
  it('reports absent without probing any port when the binary is missing', async () => {
    let probed = false;
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ binaryExists: false }),
      fetchImpl: async () => {
        probed = true;
        return { ok: true } as unknown as Response;
      },
    };

    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'absent',
      ownedByApp: false,
      port: null,
    });
    expect(probed).toBe(false);
  });

  it('reports installed-stopped without probing when no fetchImpl is given', async () => {
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ binaryExists: true }),
    };

    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'installed-stopped',
      ownedByApp: false,
      port: null,
    });
  });

  it('reports installed-stopped when the binary exists but no port in range answers', async () => {
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ binaryExists: true }),
      fetchImpl: fakeFetchOnPort(null),
    };

    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'installed-stopped',
      ownedByApp: false,
      port: null,
    });
  });

  it('reports running with ownedByApp false for a port the app never started (adopted-foreign)', async () => {
    // Nothing has been started via the app at this point in the build (D3
    // adds `start()`), so this is the only way `running` is reachable here —
    // and reporting it as not owned is the correct, honest answer.
    const answeringPort = LLAMA_PORT_RANGE_START + 2;
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ binaryExists: true }),
      fetchImpl: fakeFetchOnPort(answeringPort),
    };

    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'running',
      ownedByApp: false,
      port: answeringPort,
    });
  });

  it('reports ownedByApp true once the module has recorded that port as its own', async () => {
    const answeringPort = LLAMA_PORT_RANGE_START;
    setOwnedPort(answeringPort);
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ binaryExists: true }),
      fetchImpl: fakeFetchOnPort(answeringPort),
    };

    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'running',
      ownedByApp: true,
      port: answeringPort,
    });
  });
});

describe('getLlamaStartPlan', () => {
  it('returns null when no .gguf file is installed', async () => {
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({ modelFiles: [] }),
    };

    expect(await getLlamaStartPlan(deps)).toBeNull();
  });

  it('picks the lexicographically first .gguf file and plans threads from the injected facts and budget', async () => {
    const modelPath = `${MODEL_DIR}\\alpha.gguf`;
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({
        modelFiles: ['zeta-7b.gguf', 'alpha.gguf'],
        sizesBytes: { [modelPath]: 4800 * 1024 * 1024 },
      }),
      readSettings: () => ({
        resourceBudgetPercent: 50,
        llamaOverrides: { gpuLayers: null, contextTokens: null },
      }),
      readFacts: async () => facts({ cpuCores: 8 }),
    };

    const plan = await getLlamaStartPlan(deps);

    expect(plan).not.toBeNull();
    // Threads only depend on facts + budget, so this alone proves both were
    // read and passed through to D1's `planLlamaStart` — the arithmetic
    // itself is D1's own test's job.
    expect(plan?.threads).toEqual({ value: 4, source: 'derived', reason: 'threads-budget:4/8' });
  });

  it('passes the hand-entered overrides through to the plan untouched', async () => {
    const modelPath = `${MODEL_DIR}\\model-7b.gguf`;
    const deps: LlamaLifecycleDeps = {
      userDataDir: USER_DATA,
      fs: fakeEngineFs({
        modelFiles: ['model-7b.gguf'],
        sizesBytes: { [modelPath]: 4800 * 1024 * 1024 },
      }),
      readSettings: () => ({
        resourceBudgetPercent: 100,
        llamaOverrides: { gpuLayers: 5, contextTokens: 2048 },
      }),
      readFacts: async () => facts(),
    };

    const plan = await getLlamaStartPlan(deps);

    // `paramsB` parses to 7 from the filename, landing on the 32-layer
    // landmark — `:estimated` in the reason says so, exactly as D1 documents.
    expect(plan?.gpuLayers).toEqual({
      value: 5,
      source: 'manual',
      reason: 'manual:5/32:estimated',
    });
    expect(plan?.contextTokens).toEqual({ value: 2048, source: 'manual', reason: 'manual:2048' });
  });
});

/** A settings fake carrying just enough of `SettingsService` for D5's
    overrides — `snapshot()` reads the current value, `patchApp` writes it,
    mutating the same closure so a plan read right after `setLlamaOverrides`
    observes it (the same round trip `machine-scan.test.ts`'s own
    `fakeServices` gives the VRAM override and the resource budget). */
function fakeLlamaOverrideServices(
  initial: LlamaOverrides = { gpuLayers: null, contextTokens: null },
): Services {
  let current = initial;
  return {
    settings: {
      snapshot: () => ({ app: { machine: { llamaOverrides: current } }, vault: null }),
      patchApp: vi.fn(async (patch: { machine?: { llamaOverrides?: LlamaOverrides } }) => {
        if (patch.machine?.llamaOverrides !== undefined) {
          current = patch.machine.llamaOverrides;
        }
        return {} as never;
      }),
      patchVault: vi.fn(),
      setVaultSection: vi.fn(),
    },
  } as unknown as Services;
}

describe('setLlamaOverrides', () => {
  const modelPath = `${MODEL_DIR}\\model-7b.gguf`;
  const planDeps: LlamaLifecycleDeps = {
    userDataDir: USER_DATA,
    fs: fakeEngineFs({
      modelFiles: ['model-7b.gguf'],
      sizesBytes: { [modelPath]: 4800 * 1024 * 1024 },
    }),
    readFacts: async () => facts(),
  };

  /** The overrides these tests exercise are those `getLlamaStartPlan` would
      otherwise read off `services.settings` — `readSettings` here overrides
      that seam with the same `services` fake, so the plan returned by
      `setLlamaOverrides` reads back the value it just wrote, exactly as
      production does (both go through the same `services`). */
  function depsFor(services: Services): LlamaLifecycleDeps {
    return {
      ...planDeps,
      readSettings: () => ({
        resourceBudgetPercent: 100,
        llamaOverrides: services.settings.snapshot().app.machine.llamaOverrides,
      }),
    };
  }

  it('writes one field and leaves the sibling override untouched', async () => {
    const services = fakeLlamaOverrideServices({ gpuLayers: null, contextTokens: 4096 });

    const plan = await setLlamaOverrides(services, { gpuLayers: 5 }, depsFor(services));

    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { llamaOverrides: { gpuLayers: 5, contextTokens: 4096 } },
    });
    expect(plan?.gpuLayers).toEqual({
      value: 5,
      source: 'manual',
      reason: 'manual:5/32:estimated',
    });
    expect(plan?.contextTokens).toEqual({ value: 4096, source: 'manual', reason: 'manual:4096' });
  });

  it('clears a field with null and the plan falls back to derived', async () => {
    const services = fakeLlamaOverrideServices({ gpuLayers: 5, contextTokens: null });

    const plan = await setLlamaOverrides(services, { gpuLayers: null }, depsFor(services));

    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { llamaOverrides: { gpuLayers: null, contextTokens: null } },
    });
    expect(plan?.gpuLayers.source).not.toBe('manual');
  });

  it('rejects a negative value and persists nothing', async () => {
    const services = fakeLlamaOverrideServices();

    await expect(
      setLlamaOverrides(services, { gpuLayers: -1 }, depsFor(services)),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });

  it('rejects a fractional value and persists nothing', async () => {
    const services = fakeLlamaOverrideServices();

    await expect(
      setLlamaOverrides(services, { contextTokens: 12.5 }, depsFor(services)),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });
});

const MODEL_FILE = 'model-7b.Q4_K_M.gguf';
const MODEL_PATH = `${MODEL_DIR}\\${MODEL_FILE}`;
const ALL_PORTS_BUSY = new Set(
  Array.from({ length: 10 }, (_, index) => LLAMA_PORT_RANGE_START + index),
);

/** An installed engine with one model file, planned against a known machine —
    the starting point every D3 case varies one thing of. */
function startDeps(overrides: Partial<LlamaStartDeps> = {}): LlamaStartDeps {
  return {
    ...FAST_TIMINGS,
    platform: 'win32',
    userDataDir: USER_DATA,
    fs: fakeEngineFs({
      binaryExists: true,
      modelFiles: [MODEL_FILE],
      sizesBytes: { [MODEL_PATH]: 4800 * 1024 * 1024 },
    }),
    readSettings: () => ({
      resourceBudgetPercent: 100,
      llamaOverrides: { gpuLayers: null, contextTokens: null },
    }),
    readFacts: async () => facts({ cpuCores: 8, totalRamMb: 16384 }),
    ...overrides,
  };
}

describe('startLlamaEngine — refuses before it spawns', () => {
  it('names the missing binary and never spawns', async () => {
    const spawn = fakeSpawn();
    const deps = startDeps({
      fs: fakeEngineFs({ binaryExists: false, modelFiles: [MODEL_FILE] }),
      fetchImpl: fakeFetchOnPort(null),
      spawnFn: spawn.spawnFn,
    });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'absent',
      reason: 'binary-missing',
    });
    expect(spawn.calls).toEqual([]);
  });

  it('names the missing model file and never spawns', async () => {
    const spawn = fakeSpawn();
    const deps = startDeps({
      fs: fakeEngineFs({ binaryExists: true, modelFiles: [] }),
      fetchImpl: fakeFetchOnPort(null),
      spawnFn: spawn.spawnFn,
    });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'model-missing',
    });
    expect(spawn.calls).toEqual([]);
  });

  it('names port-in-use when every port in the range already answers, without spawning', async () => {
    const spawn = fakeSpawn();
    const deps = startDeps({
      fetchImpl: fakeFetchOnPorts(ALL_PORTS_BUSY),
      spawnFn: spawn.spawnFn,
    });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'port-in-use',
    });
    expect(spawn.calls).toEqual([]);
  });
});

describe('startLlamaEngine — success', () => {
  it('spawns the derived argv on the first free port and takes ownership of it', async () => {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({ onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START) });
    const adopted: number[] = [];
    const deps = startDeps({
      fetchImpl: fakeFetchOnPorts(openPorts),
      spawnFn: spawn.spawnFn,
      adoptPort: async (port) => {
        adopted.push(port);
      },
    });

    const result = await startLlamaEngine(deps);

    expect(result).toEqual({ started: true, status: 'running' });
    expect(spawn.calls).toHaveLength(1);
    const call = spawn.calls[0];
    if (!call) throw new Error('unreachable — length asserted above');
    expect(call.file).toBe(llamaEngineBinaryPath(USER_DATA, 'win32'));
    // The flags come from D1's plan verbatim; only the model path and the
    // port are added here, and both are argv tokens, never a shell string.
    const plan = await getLlamaStartPlan(deps);
    expect(call.args).toEqual([
      ...(plan?.argv ?? []),
      '--port',
      String(LLAMA_PORT_RANGE_START),
      '-m',
      MODEL_PATH,
    ]);
    expect(adopted).toEqual([LLAMA_PORT_RANGE_START]);
    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'running',
      ownedByApp: true,
      port: LLAMA_PORT_RANGE_START,
    });
  });

  it('logs a failed baseUrl write-back without the model path (034, D7), and still reports running', async () => {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({ onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START) });
    const deps = startDeps({
      fetchImpl: fakeFetchOnPorts(openPorts),
      spawnFn: spawn.spawnFn,
      adoptPort: async () => {
        throw new Error(`cannot reach settings for ${MODEL_PATH}`);
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await startLlamaEngine(deps);

    expect(result).toEqual({ started: true, status: 'running' });
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0]?.[0];
    expect(logged).not.toContain(MODEL_FILE);
    expect(logged).not.toContain('\\');
    warn.mockRestore();
  });

  it('skips the second free port when the first is taken by someone else', async () => {
    const openPorts = new Set<number>([LLAMA_PORT_RANGE_START]);
    const spawn = fakeSpawn({ onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START + 1) });
    const deps = startDeps({ fetchImpl: fakeFetchOnPorts(openPorts), spawnFn: spawn.spawnFn });

    expect(await startLlamaEngine(deps)).toEqual({ started: true, status: 'running' });
    expect(spawn.calls[0]?.args).toContain(String(LLAMA_PORT_RANGE_START + 1));
  });

  it('answers a second start with the engine it already owns instead of spawning another', async () => {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({ onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START) });
    const deps = startDeps({ fetchImpl: fakeFetchOnPorts(openPorts), spawnFn: spawn.spawnFn });

    await startLlamaEngine(deps);
    expect(await startLlamaEngine(deps)).toEqual({ started: true, status: 'running' });
    // A second spawn would have overwritten the handle of the first — the one
    // way this module could leave a process nobody can stop any more.
    expect(spawn.calls).toHaveLength(1);
  });
});

describe('startLlamaEngine — classified failures', () => {
  it('reads an allocator failure as out-of-memory, never as the raw string', async () => {
    const spawn = fakeSpawn({
      failToSpawn: true,
      stderr: 'ggml_backend_cuda_buffer_type_alloc_buffer: cudaMalloc failed: out of memory\n',
    });
    const deps = startDeps({ fetchImpl: fakeFetchOnPort(null), spawnFn: spawn.spawnFn });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'out-of-memory',
    });
  });

  it('falls back to spawn-failed for a failure it cannot name', async () => {
    const spawn = fakeSpawn({
      failToSpawn: true,
      stderr: 'error while loading shared libraries: libcurl.so.4\n',
    });
    const deps = startDeps({ fetchImpl: fakeFetchOnPort(null), spawnFn: spawn.spawnFn });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'absent',
      reason: 'spawn-failed',
    });
  });

  it('reports timeout when the engine never answers — and keeps it stoppable', async () => {
    const spawn = fakeSpawn();
    const deps = startDeps({ fetchImpl: fakeFetchOnPort(null), spawnFn: spawn.spawnFn });

    expect(await startLlamaEngine(deps)).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'timeout',
    });
    // Not killed on the way out (a large model may still be loading), but
    // tracked — so it is stoppable, which is what keeps it from being an
    // orphan.
    expect(spawn.signals).toEqual([]);
    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: true });
    expect(spawn.signals).toEqual(['SIGTERM']);
  });
});

describe('stopLlamaEngine', () => {
  async function startedEngine(options: { ignoresSignals?: boolean } = {}): Promise<{
    spawn: FakeSpawn;
    deps: LlamaStartDeps;
  }> {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({
      ...options,
      onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START),
    });
    const deps = startDeps({ fetchImpl: fakeFetchOnPorts(openPorts), spawnFn: spawn.spawnFn });
    expect(await startLlamaEngine(deps)).toEqual({ started: true, status: 'running' });
    return { spawn, deps };
  }

  it('sends SIGTERM to the engine it started and gives up ownership of the port', async () => {
    const { spawn, deps } = await startedEngine();

    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: true });
    expect(spawn.signals).toEqual(['SIGTERM']);
    // The fake port keeps answering; what changed is that it is no longer
    // ours — a server still there afterwards is someone else's problem.
    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'running',
      ownedByApp: false,
      port: LLAMA_PORT_RANGE_START,
    });
  });

  it('escalates to SIGKILL when the engine ignores SIGTERM', async () => {
    const { spawn } = await startedEngine({ ignoresSignals: true });

    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: true });
    expect(spawn.signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('is a no-op, not a refusal, when there is nothing app-owned to stop', async () => {
    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: false });
    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: false });
  });

  it('resolves without waiting on a request that is still in flight against the engine (034, D7; Decisions Q5)', async () => {
    const { spawn } = await startedEngine();
    // Stands in for a caller's HTTP request to the engine that is still
    // outstanding when stop is pressed — deliberately never resolved during
    // this test. `stopLlamaEngine` sends a process signal; it does not read
    // from, write to, or await anything network-shaped, so a request that
    // never settles must not be able to keep it waiting either.
    const stillInFlight = new Promise<'a request, not a signal'>(() => {
      /* never settles on purpose */
    });

    const outcome = await Promise.race([
      stopLlamaEngine(FAST_STOP),
      stillInFlight.then(() => 'the in-flight request won the race' as const),
    ]);

    expect(outcome).toEqual({ stopped: true });
    expect(spawn.signals).toEqual(['SIGTERM']);
  });

  it('never touches a foreign engine — reachable, running, but not ours', async () => {
    const foreignPort = LLAMA_PORT_RANGE_START + 2;
    const spawn = fakeSpawn();
    const deps = startDeps({ fetchImpl: fakeFetchOnPort(foreignPort), spawnFn: spawn.spawnFn });
    const before = await getLlamaEngineStatus(deps);

    expect(await stopLlamaEngine(FAST_STOP)).toEqual({ stopped: false });

    expect(before).toEqual({ status: 'running', ownedByApp: false, port: foreignPort });
    expect(await getLlamaEngineStatus(deps)).toEqual(before);
    expect(spawn.calls).toEqual([]);
    expect(spawn.signals).toEqual([]);
  });
});

describe('stopOwnedLlamaEngineOnQuit', () => {
  it('stops an app-started engine on the way out', async () => {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({
      ignoresSignals: true,
      onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START),
    });
    const deps = startDeps({ fetchImpl: fakeFetchOnPorts(openPorts), spawnFn: spawn.spawnFn });
    await startLlamaEngine(deps);

    stopOwnedLlamaEngineOnQuit();

    // No timer can run between `will-quit` and process exit, so the graceful
    // window does not exist here — both signals go out at once.
    expect(spawn.signals).toEqual(['SIGTERM', 'SIGKILL']);
    expect(await getLlamaEngineStatus(deps)).toEqual({
      status: 'running',
      ownedByApp: false,
      port: LLAMA_PORT_RANGE_START,
    });
  });

  it('leaves a foreign engine alone', async () => {
    const openPorts = new Set<number>();
    const spawn = fakeSpawn({ onSpawn: () => openPorts.add(LLAMA_PORT_RANGE_START) });
    const deps = startDeps({ fetchImpl: fakeFetchOnPorts(openPorts), spawnFn: spawn.spawnFn });
    await startLlamaEngine(deps);
    await stopLlamaEngine(FAST_STOP);
    // From here on the server on that port is a foreign one as far as this
    // module is concerned: it is still answering, and nothing tracks it.
    expect(spawn.signals).toEqual(['SIGTERM']);

    stopOwnedLlamaEngineOnQuit();

    expect(spawn.signals).toEqual(['SIGTERM']);
    expect((await getLlamaEngineStatus(deps)).ownedByApp).toBe(false);
  });
});
