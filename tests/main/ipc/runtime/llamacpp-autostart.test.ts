/* 034, D6: the auto-start guard. `'manual'` (the default) never probes status
 * at all; `'on-demand'` starts only when a provider is actually configured
 * for it and the engine is idle; and two concurrent callers under that same
 * condition trigger exactly one start — the acceptance line's own test.
 * Every seam is faked: no test here spawns a process or reads a real port.
 */

import { describe, expect, it, vi } from 'vitest';
import type { EnsureLlamaRunningDeps } from '../../../../src/main/ipc/runtime/llamacpp-autostart';
import {
  ensureLlamaRunning,
  llamaAutoStartHandlers,
} from '../../../../src/main/ipc/runtime/llamacpp-autostart';
import type { LocalRuntimeStatus, ProviderConfig } from '../../../../src/shared/types';
import type { Services } from '../../../../src/main/services';

function provider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  return {
    label: 'llama.cpp',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11435/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: [],
    createdAt: '2026-08-23T10:00:00.000Z',
    ...overrides,
  };
}

/** A settings fake carrying just enough of `Services` for this module: the
    auto-start mode (`snapshot`), the provider list (`vault`), and `patchApp`
    for the write-path test. No real settings file, no vault. */
function fakeServices(
  options: {
    mode?: 'manual' | 'on-demand';
    providers?: ProviderConfig[];
  } = {},
): Services {
  const patchApp = vi.fn(async () => ({}) as never);
  return {
    settings: {
      snapshot: () => ({
        app: { machine: { llamaAutoStart: options.mode ?? 'on-demand' } },
        vault: null,
      }),
      vault: () => (options.providers ? { providers: options.providers } : null),
      patchApp,
    },
  } as unknown as Services;
}

function status(value: LocalRuntimeStatus): { status: LocalRuntimeStatus } {
  return { status: value };
}

describe('ensureLlamaRunning', () => {
  it('never probes status or starts in manual mode (the default)', async () => {
    const getStatus = vi.fn();
    const start = vi.fn();
    const services = fakeServices({ mode: 'manual', providers: [provider({ id: 'llama-1' })] });

    await ensureLlamaRunning(services, { getStatus, start } as EnsureLlamaRunningDeps);

    expect(getStatus).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('does not start when the engine is absent', async () => {
    const start = vi.fn();
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });

    await ensureLlamaRunning(services, {
      getStatus: async () => status('absent'),
      start,
    });

    expect(start).not.toHaveBeenCalled();
  });

  it('does not start when the engine is already running, including a foreign one', async () => {
    const start = vi.fn();
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });

    await ensureLlamaRunning(services, {
      getStatus: async () => status('running'),
      start,
    });

    expect(start).not.toHaveBeenCalled();
  });

  it('does not start when no enabled llama.cpp-shaped provider is configured', async () => {
    const start = vi.fn();
    const services = fakeServices({ providers: [] });

    await ensureLlamaRunning(services, {
      getStatus: async () => status('installed-stopped'),
      start,
    });

    expect(start).not.toHaveBeenCalled();
  });

  it('does not start when the only llama.cpp-shaped provider is disabled', async () => {
    const start = vi.fn();
    const services = fakeServices({
      providers: [provider({ id: 'llama-1', enabled: false })],
    });

    await ensureLlamaRunning(services, {
      getStatus: async () => status('installed-stopped'),
      start,
    });

    expect(start).not.toHaveBeenCalled();
  });

  it('starts exactly once when on-demand, installed-stopped, and an enabled provider exists', async () => {
    const start = vi.fn(async () => undefined);
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });

    await ensureLlamaRunning(services, {
      getStatus: async () => status('installed-stopped'),
      start,
    });

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('never throws when the start attempt itself fails', async () => {
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });

    await expect(
      ensureLlamaRunning(services, {
        getStatus: async () => status('installed-stopped'),
        start: async () => {
          throw new Error('spawn llama-server ENOENT: /Users/someone/models/secret.gguf');
        },
      }),
    ).resolves.toBeUndefined();
  });

  it('logs the failed auto-start without the model path from the thrown error (034, D7)', async () => {
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await ensureLlamaRunning(services, {
      getStatus: async () => status('installed-stopped'),
      start: async () => {
        throw new Error('spawn llama-server ENOENT: /Users/someone/models/secret.gguf');
      },
    });

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0]?.[0];
    expect(logged).not.toContain('secret.gguf');
    expect(logged).not.toContain('/Users/someone');
    warn.mockRestore();
  });

  it('is single-flight: two concurrent calls that both find the engine idle start exactly once', async () => {
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });
    let releaseStart!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseStart = resolve;
    });
    const start = vi.fn(async () => {
      // Resolves only once both calls below have already been issued —
      // proving this exercises the overlap, not two calls that merely look
      // concurrent because neither has awaited yet.
      await gate;
    });
    let statusCalls = 0;
    const getStatus = vi.fn(async () => {
      statusCalls += 1;
      return status('installed-stopped');
    });

    const first = ensureLlamaRunning(services, { getStatus, start });
    const second = ensureLlamaRunning(services, { getStatus, start });
    releaseStart();
    await Promise.all([first, second]);

    expect(start).toHaveBeenCalledTimes(1);
    // The second call returned the first's in-flight promise before it ever
    // reached its own status probe.
    expect(statusCalls).toBe(1);
  });

  it('allows a later call to try again once the previous attempt has settled', async () => {
    const services = fakeServices({ providers: [provider({ id: 'llama-1' })] });
    const start = vi.fn(async () => undefined);
    const getStatus = vi.fn(async () => status('installed-stopped'));

    await ensureLlamaRunning(services, { getStatus, start });
    await ensureLlamaRunning(services, { getStatus, start });

    expect(start).toHaveBeenCalledTimes(2);
  });
});

describe('llamaAutoStartHandlers — llm:setLlamaAutoStart', () => {
  it('writes a valid mode into machine settings', async () => {
    const services = fakeServices();
    const handlers = llamaAutoStartHandlers(services);
    const handler = handlers['llm:setLlamaAutoStart'];
    if (!handler) throw new Error('handler not registered');

    await handler('on-demand');

    expect(services.settings.patchApp).toHaveBeenCalledWith({
      machine: { llamaAutoStart: 'on-demand' },
    });
  });

  it('rejects anything that is neither mode and writes nothing', async () => {
    const services = fakeServices();
    const handlers = llamaAutoStartHandlers(services);
    const handler = handlers['llm:setLlamaAutoStart'];
    if (!handler) throw new Error('handler not registered');

    await expect(handler('always' as never)).rejects.toMatchObject({ code: 'invalid' });
    expect(services.settings.patchApp).not.toHaveBeenCalled();
  });
});
