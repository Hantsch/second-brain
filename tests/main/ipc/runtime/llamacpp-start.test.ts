/* Starting the llama.cpp engine (033, D9) — through a fake `spawn`, a fake
 * status probe and a fake `EngineFs`, never a real process, a real binary, or
 * the real network. Mirrors `tests/main/ipc/ollama-runtime.test.ts`'s
 * `llm:startLocalRuntime` cases: success once the probe flips to `'running'`,
 * a clean timeout when it never does, and `'spawn-failed'` for an `ENOENT`
 * from `spawn` — plus the two llama.cpp-specific "not even ready to try"
 * cases Ollama doesn't have: no binary installed, and a binary with no
 * `.gguf` file to point it at.
 */

import { describe, expect, it } from 'vitest';
import type { LlamaCppStartDeps } from '../../../../src/main/ipc/runtime/llamacpp-start';
import { createLlamaCppStartPart } from '../../../../src/main/ipc/runtime/llamacpp-start';
import type { SpawnedProcess, SpawnFn } from '../../../../src/main/ipc/ollama-runtime';
import type { EngineFs } from '../../../../src/main/ipc/runtime/engine-fs';
import type { LocalRuntimeStatus } from '../../../../src/shared/types';

const USER_DATA = 'C:\\fake\\userData';
const ENGINE_DIR = 'C:\\fake\\userData\\runtimes\\llamacpp';
const MODEL_DIR = 'C:\\fake\\userData\\models\\gguf';

/** A fake `EngineFs` that only ever has to answer `exists` and `list` for
    `start` — the other methods belong to install/pull and are never called
    from this path, so they throw if they somehow were. */
function fakeEngineFs(options: { binaryExists?: boolean; modelFiles?: string[] }): EngineFs {
  const modelFiles = options.modelFiles ?? [];
  const unreachable = (): never => {
    throw new Error('not expected to be called by start()');
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
  };
}

/** Same shape as `ollama-runtime.test.ts`'s `fakeSpawn`: resolves normally,
    or fires the child's `'error'` event shortly after — exactly how a real
    `ENOENT` from `spawn` behaves (it never throws synchronously). */
function fakeSpawn(options: { enoent?: boolean } = {}): {
  spawnFn: SpawnFn;
  calls: { file: string; args: readonly string[] }[];
  unrefed: boolean[];
} {
  const calls: { file: string; args: readonly string[] }[] = [];
  const unrefed: boolean[] = [];
  const spawnFn: SpawnFn = (file, args) => {
    calls.push({ file, args });
    let errorListener: ((error: NodeJS.ErrnoException) => void) | null = null;
    if (options.enoent) {
      queueMicrotask(() => {
        const error = Object.assign(new Error('spawn llama-server ENOENT'), { code: 'ENOENT' });
        errorListener?.(error);
      });
    }
    const child: SpawnedProcess = {
      unref: () => unrefed.push(true),
      once: (event, listener) => {
        if (event === 'error') errorListener = listener;
      },
    };
    return child;
  };
  return { spawnFn, calls, unrefed };
}

/** A probe that reports a fixed sequence of statuses, holding the last entry
    once exhausted — so a test can express "stays stopped forever". */
function sequenceProbe(sequence: LocalRuntimeStatus[]): () => Promise<LocalRuntimeStatus> {
  let index = 0;
  return async () => {
    const status = sequence[Math.min(index, sequence.length - 1)] ?? 'absent';
    index += 1;
    return status;
  };
}

/** Fast timings throughout — the production 5s ceiling would make this suite
    slow for no reason. */
const FAST_TIMINGS: Pick<LlamaCppStartDeps, 'timeoutMs' | 'pollIntervalMs' | 'spawnErrorGraceMs'> =
  {
    timeoutMs: 40,
    pollIntervalMs: 2,
    spawnErrorGraceMs: 5,
  };

describe('llama.cpp start — success', () => {
  it('spawns argv (never a shell string), unrefs, and reports running once the probe flips', async () => {
    const spawn = fakeSpawn();
    const probeFn = sequenceProbe(['installed-stopped', 'installed-stopped', 'running']);
    const fs = fakeEngineFs({ binaryExists: true, modelFiles: ['model.Q4_K_M.gguf'] });
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'win32',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    const result = await part.start();

    expect(spawn.calls).toHaveLength(1);
    const call = spawn.calls[0]; // length asserted above, so this element exists
    if (!call) throw new Error('unreachable — length asserted above');
    expect(call.file).toBe(`${ENGINE_DIR}\\llama-server.exe`);
    // argv is an array of separate tokens — never a concatenated shell string.
    expect(Array.isArray(call.args)).toBe(true);
    expect(call.args).toEqual([
      '--port',
      '8080',
      '-m',
      `${MODEL_DIR}\\model.Q4_K_M.gguf`,
      '-ngl',
      '0',
      '-c',
      '4096',
    ]);
    expect(spawn.unrefed).toEqual([true]);
    expect(result).toEqual({ started: true, status: 'running' });
  });

  it('picks the lexicographically first .gguf file when more than one is present', async () => {
    const spawn = fakeSpawn();
    const probeFn = sequenceProbe(['running']);
    const fs = fakeEngineFs({
      binaryExists: true,
      modelFiles: ['zeta.gguf', 'alpha.gguf', 'not-a-model.txt'],
    });
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'linux',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    await part.start();

    const call = spawn.calls[0];
    if (!call) throw new Error('unreachable — spawn is asserted to have been called');
    // `path.join` uses this test runner's real separator (Windows), regardless
    // of the fake `platform` string handed in only to pick the binary suffix.
    expect(call.args).toContain(`${MODEL_DIR}\\alpha.gguf`);
  });
});

describe('llama.cpp start — not ready to try', () => {
  it('reports absent without spawning when the binary is not installed', async () => {
    const spawn = fakeSpawn();
    const fs = fakeEngineFs({ binaryExists: false, modelFiles: ['model.gguf'] });
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'win32',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn: sequenceProbe(['running']),
    });

    const result = await part.start();

    expect(spawn.calls).toEqual([]);
    expect(result).toEqual({ started: false, status: 'absent', reason: 'spawn-failed' });
  });

  it('reports installed-stopped without spawning when no .gguf file has been downloaded yet', async () => {
    const spawn = fakeSpawn();
    const fs = fakeEngineFs({ binaryExists: true, modelFiles: [] });
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'win32',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn: sequenceProbe(['running']),
    });

    const result = await part.start();

    expect(spawn.calls).toEqual([]);
    expect(result).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'spawn-failed',
    });
  });
});

describe('llama.cpp start — timeout', () => {
  it('reports the last observed status with reason timeout when it never comes up', async () => {
    const spawn = fakeSpawn();
    const fs = fakeEngineFs({ binaryExists: true, modelFiles: ['model.gguf'] });
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'win32',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn: sequenceProbe(['installed-stopped']),
    });

    const result = await part.start();

    expect(result).toEqual({
      started: false,
      status: 'installed-stopped',
      reason: 'timeout',
    });
  });
});

describe('llama.cpp start — spawn failure', () => {
  it('reports spawn-failed for an ENOENT instead of throwing or polling', async () => {
    const spawn = fakeSpawn({ enoent: true });
    const fs = fakeEngineFs({ binaryExists: true, modelFiles: ['model.gguf'] });
    let probed = false;
    const probeFn = async (): Promise<LocalRuntimeStatus> => {
      probed = true;
      return 'running';
    };
    const part = createLlamaCppStartPart({
      ...FAST_TIMINGS,
      platform: 'win32',
      userDataDir: USER_DATA,
      fs,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    const result = await part.start();

    expect(result).toEqual({ started: false, status: 'absent', reason: 'spawn-failed' });
    expect(spawn.unrefed).toEqual([]); // never unref'd a process that failed to start
    expect(probed).toBe(false);
  });
});
