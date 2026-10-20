/* The runtime registry (033, D5): the dispatch itself, over a fake installer.
 *
 * The Ollama behaviour behind these channels is covered by
 * `tests/main/ipc/ollama-{install,pull,runtime}.test.ts` — unchanged, which is
 * the point of this deliverable. What is new here is the layer above them:
 *
 *   - each channel reaches the implementation registered for the `runtime` it
 *     was asked for, and echoes that `runtime` back where the contract says so;
 *   - a `RuntimeId` nobody registered is a typed `invalid` refusal on every one
 *     of the seven channels — never an exception that reaches Electron, and
 *     never a made-up answer;
 *   - `llm:cancelPull`, the one channel without a `runtime` in its request,
 *     asks every registered runtime.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeRegistry,
  installChannelHandlers,
  lifecycleChannelHandlers,
  pullChannelHandlers,
} from '../../../../src/main/ipc/runtime/registry';
import type { RuntimeInstaller } from '../../../../src/main/ipc/runtime/types';
import type { HandlerMap } from '../../../../src/main/ipc/registry';
import type { RuntimePlan } from '../../../../src/shared/types';

/* `../registry` imports `ipcMain`; nothing here registers anything, but the
   module graph pulls it in. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
}));

const PLAN: RuntimePlan = {
  canInstall: true,
  blockedReason: null,
  downloadMb: 42,
  installerPath: 'C:\\Temp\\Setup.exe',
  modelDirHint: 'C:\\models',
};

function fakeInstaller(): { installer: RuntimeInstaller; calls: string[] } {
  const calls: string[] = [];
  const installer: RuntimeInstaller = {
    id: 'ollama',
    status: async () => {
      calls.push('status');
      return 'running';
    },
    plan: async () => {
      calls.push('plan');
      return PLAN;
    },
    download: async () => {
      calls.push('download');
      return { downloadId: 'd1' };
    },
    cancel: async (downloadId) => {
      calls.push(`cancel:${downloadId}`);
    },
    openInstaller: async () => {
      calls.push('openInstaller');
      return { opened: true };
    },
    start: async () => {
      calls.push('start');
      return { started: true, status: 'running' };
    },
    pull: async (modelId) => {
      calls.push(`pull:${modelId}`);
      return { pullId: 'p1' };
    },
    cancelPull: async (pullId) => {
      calls.push(`cancelPull:${pullId}`);
    },
  };
  return { installer, calls };
}

function handlersFor(installer: RuntimeInstaller): HandlerMap {
  const registry = createRuntimeRegistry([installer]);
  return {
    ...installChannelHandlers(registry),
    ...lifecycleChannelHandlers(registry),
    ...pullChannelHandlers(registry),
  };
}

describe('the registry dispatches to the registered runtime', () => {
  it('reaches every method and echoes the runtime where the contract carries it', async () => {
    const fake = fakeInstaller();
    const handlers = handlersFor(fake.installer);

    expect(await handlers['llm:localRuntimeStatus']?.({ runtime: 'ollama' })).toEqual({
      runtime: 'ollama',
      status: 'running',
    });
    expect(await handlers['llm:runtimeInstallPlan']?.({ runtime: 'ollama' })).toEqual({
      ...PLAN,
      runtime: 'ollama',
    });
    expect(await handlers['llm:downloadRuntime']?.({ runtime: 'ollama' })).toEqual({
      downloadId: 'd1',
    });
    expect(await handlers['llm:openRuntimeInstaller']?.({ runtime: 'ollama' })).toEqual({
      opened: true,
    });
    expect(await handlers['llm:startLocalRuntime']?.({ runtime: 'ollama' })).toEqual({
      runtime: 'ollama',
      started: true,
      status: 'running',
    });
    expect(await handlers['llm:pullModel']?.({ runtime: 'ollama', modelId: 'qwen3:8b' })).toEqual({
      pullId: 'p1',
    });
    await handlers['llm:cancelRuntimeDownload']?.({ runtime: 'ollama', downloadId: 'd1' });
    await handlers['llm:cancelPull']?.({ pullId: 'p1' });

    expect(fake.calls).toEqual([
      'status',
      'plan',
      'download',
      'openInstaller',
      'start',
      'pull:qwen3:8b',
      'cancel:d1',
      'cancelPull:p1',
    ]);
  });
});

describe('an unregistered runtime', () => {
  it('is refused with a typed invalid error on every channel that names one', async () => {
    // llama.cpp is not registered until 033's D6/D7/D9 build it — until then
    // asking for it must be an honest refusal, not an invented status.
    const handlers = handlersFor(fakeInstaller().installer);
    const requests = [
      handlers['llm:localRuntimeStatus']?.({ runtime: 'llamacpp' }),
      handlers['llm:runtimeInstallPlan']?.({ runtime: 'llamacpp' }),
      handlers['llm:downloadRuntime']?.({ runtime: 'llamacpp' }),
      handlers['llm:cancelRuntimeDownload']?.({ runtime: 'llamacpp', downloadId: 'd1' }),
      handlers['llm:openRuntimeInstaller']?.({ runtime: 'llamacpp' }),
      handlers['llm:startLocalRuntime']?.({ runtime: 'llamacpp' }),
      handlers['llm:pullModel']?.({ runtime: 'llamacpp', modelId: 'qwen3:8b' }),
    ];

    for (const request of requests) {
      await expect(request).rejects.toMatchObject({ code: 'invalid' });
    }
  });

  it('does not reach the registered runtime at all', async () => {
    const fake = fakeInstaller();
    const handlers = handlersFor(fake.installer);
    await expect(
      handlers['llm:runtimeInstallPlan']?.({ runtime: 'llamacpp' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(fake.calls).toEqual([]);
  });
});
