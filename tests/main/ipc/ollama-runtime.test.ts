/* Opening the installer and starting the runtime (019c, D3) — through a
 * fake `shell.openPath`, a fake `spawn`, and a fake status probe, never a
 * real process, a real path, or the real network.
 *
 * Checked:
 *   - `llm:openRuntimeInstaller` opens the path the tracker last recorded,
 *     and reports failure/no-installer without throwing.
 *   - `llm:startLocalRuntime` reports success once the probe flips to
 *     `'running'`, times out cleanly if it never does, and reports
 *     `'spawn-failed'` for an `ENOENT` from `spawn` — never a thrown error.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OllamaRuntimeDeps,
  SpawnedProcess,
  SpawnFn,
} from '../../../src/main/ipc/ollama-runtime';
import { ollamaRuntimeHandlers } from '../../../src/main/ipc/ollama-runtime';
import { createInstallerPathTracker } from '../../../src/main/ipc/ollama-install';
import type { InstallerPathTracker } from '../../../src/main/ipc/ollama-install';
import type { Services } from '../../../src/main/services';
import type { LocalRuntimeStatus } from '../../../src/shared/types';

const openPathMock = vi.fn<(path: string) => Promise<string>>();

vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  shell: { openPath: (path: string) => openPathMock(path) },
}));

beforeEach(() => {
  openPathMock.mockReset();
});

function fakeServices(): Services {
  // Neither channel touches the vault, settings, or events.
  return {} as unknown as Services;
}

/** A fake `spawn`: resolves normally, or fires the child's `'error'` event
    shortly after — exactly how a real `ENOENT` from `spawn` behaves (it
    never throws synchronously). */
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
        const error = Object.assign(new Error('spawn ollama ENOENT'), { code: 'ENOENT' });
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

/** A probe that reports a fixed sequence of statuses, holding the last
    entry once exhausted — so a test can express "stays stopped forever". */
function sequenceProbe(sequence: LocalRuntimeStatus[]): () => Promise<LocalRuntimeStatus> {
  let index = 0;
  return async () => {
    const status = sequence[Math.min(index, sequence.length - 1)] ?? 'absent';
    index += 1;
    return status;
  };
}

/** Fast timings throughout: real `setTimeout` waits are exercised, but kept
    small so the test suite doesn't pay for the production 5s ceiling. */
const FAST_TIMINGS: Pick<OllamaRuntimeDeps, 'timeoutMs' | 'pollIntervalMs' | 'spawnErrorGraceMs'> =
  {
    timeoutMs: 40,
    pollIntervalMs: 2,
    spawnErrorGraceMs: 5,
  };

describe('llm:openRuntimeInstaller', () => {
  it('opens the path the tracker recorded and reports success', async () => {
    openPathMock.mockResolvedValueOnce('');
    const tracker = createInstallerPathTracker();
    tracker.set('C:\\Temp\\OllamaSetup.exe');
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker);

    const result = await handlers['llm:openRuntimeInstaller']?.(undefined);

    expect(openPathMock).toHaveBeenCalledWith('C:\\Temp\\OllamaSetup.exe');
    expect(result).toEqual({ opened: true });
  });

  it('carries the OS failure string through as reason, without throwing', async () => {
    openPathMock.mockResolvedValueOnce('no application is associated with this file');
    const tracker = createInstallerPathTracker();
    tracker.set('C:\\Temp\\OllamaSetup.exe');
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker);

    const result = await handlers['llm:openRuntimeInstaller']?.(undefined);

    expect(result).toEqual({
      opened: false,
      reason: 'no application is associated with this file',
    });
  });

  it('reports no-installer-downloaded instead of opening anything when nothing has completed', async () => {
    const tracker = createInstallerPathTracker();
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker);

    const result = await handlers['llm:openRuntimeInstaller']?.(undefined);

    expect(openPathMock).not.toHaveBeenCalled();
    expect(result).toEqual({ opened: false, reason: 'no-installer-downloaded' });
  });
});

describe('llm:startLocalRuntime — success', () => {
  it('spawns detached, unrefs, and reports running once the probe flips', async () => {
    const spawn = fakeSpawn();
    const probeFn = sequenceProbe(['installed-stopped', 'installed-stopped', 'running']);
    const tracker: InstallerPathTracker = createInstallerPathTracker();
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker, {
      ...FAST_TIMINGS,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    const result = await handlers['llm:startLocalRuntime']?.(undefined);

    expect(spawn.calls).toEqual([{ file: 'ollama', args: ['serve'] }]);
    expect(spawn.unrefed).toEqual([true]);
    expect(result).toEqual({ started: true, status: 'running' });
  });
});

describe('llm:startLocalRuntime — timeout', () => {
  it('reports the last observed status with reason timeout when it never comes up', async () => {
    const spawn = fakeSpawn();
    const probeFn = sequenceProbe(['installed-stopped']);
    const tracker = createInstallerPathTracker();
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker, {
      ...FAST_TIMINGS,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    const result = await handlers['llm:startLocalRuntime']?.(undefined);

    expect(result).toEqual({ started: false, status: 'installed-stopped', reason: 'timeout' });
  });
});

describe('llm:startLocalRuntime — spawn failure', () => {
  it('reports spawn-failed for an ENOENT instead of throwing or polling', async () => {
    const spawn = fakeSpawn({ enoent: true });
    const probeFn = vi.fn(sequenceProbe(['running']));
    const tracker = createInstallerPathTracker();
    const handlers = ollamaRuntimeHandlers(fakeServices(), tracker, {
      ...FAST_TIMINGS,
      spawnFn: spawn.spawnFn,
      probeFn,
    });

    const result = await handlers['llm:startLocalRuntime']?.(undefined);

    expect(result).toEqual({ started: false, status: 'absent', reason: 'spawn-failed' });
    expect(spawn.unrefed).toEqual([]); // never unref'd a process that failed to start
    expect(probeFn).not.toHaveBeenCalled();
  });
});
