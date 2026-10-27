/* The recommendation path re-detects this machine on its own — it does not
   reuse `llm:scanMachine`'s result. Story 028 (D3) therefore has to thread the
   manual VRAM override through `scanCapacityVerdict()` as well, and that is
   exactly the wiring nothing on screen would reveal if it were missing: the
   models tab would keep showing recommendations built on the pre-override
   ceiling, with no error and no empty state to notice.

   Everything external is pinned: `node:os` supplies fixed machine facts (a
   platform with no GPU probe, so nothing is ever spawned), and the catalogue
   is a two-entry fixture instead of the live one, so no test touches the
   network. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as NodeOs from 'node:os';
import type * as CoreLlm from '@core/llm';
import type { CatalogueEntry } from '@core/llm';
import type { ProviderConfig, RecommendationSet } from '@shared/types';

/* Hoisted with the `vi.mock` factories below, which need these values before
   the modules under test are imported. */
const fx = vi.hoisted(() => {
  /** 96 GB of RAM and 8 cores — the machine 028's D2 verdict fixtures use, so
   *  VRAM is the only fact an override can move here. */
  const TOTAL_RAM_MB = 98_304;

  function localEntry(id: string, paramsB: number) {
    return {
      id,
      providerKind: 'openai-compatible' as const,
      paramsB,
      // A disk footprint is what makes an entry local-capable, and only
      // local-capable entries get measured against the machine's ceiling.
      sizeOnDiskGb: paramsB * 0.6,
      quantisation: null,
      priceInPerMTok: null,
      priceOutPerMTok: null,
      dataPolicy: 'no-training' as const,
      policySource: 'local model — never leaves the machine',
      policyReadAt: '2026-08-01',
    };
  }

  /* 7B fits under either ceiling; 34B only fits while VRAM is unknown and the
     verdict falls back to the far roomier 96 GB RAM estimate. */
  return {
    TOTAL_RAM_MB,
    SMALL: localEntry('ollama/small-model:7b', 7),
    LARGE: localEntry('ollama/large-model:34b', 34),
  };
});

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  safeStorage: { isEncryptionAvailable: () => false },
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof NodeOs>();
  return {
    ...actual,
    default: actual,
    totalmem: () => fx.TOTAL_RAM_MB * 1024 * 1024,
    cpus: () => Array.from({ length: 8 }) as ReturnType<typeof actual.cpus>,
    // No GPU probe exists for this platform, so detection answers
    // 'unsupported-platform' without spawning a process.
    platform: () => 'freebsd' as ReturnType<typeof actual.platform>,
    arch: () => 'x64' as ReturnType<typeof actual.arch>,
  };
});

vi.mock('@core/llm', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreLlm>();
  return {
    ...actual,
    /* The only thing replaced: the live catalogue would hit the network.
       `recommendModels`, `judgeCapacity` and `applyVramOverride` all stay
       real — they are what this test is actually exercising. */
    loadCatalogueWithLiveData: () =>
      Promise.resolve({
        generatedAt: '2026-08-01',
        entries: [fx.SMALL, fx.LARGE] as CatalogueEntry[],
        stale: false,
      }),
  };
});

/* The auto-start guard is the unit under test in the second suite below, not
   a collaborator to exercise: the real one would probe ports and settings. */
vi.mock('../../src/main/ipc/runtime/llamacpp-autostart', () => ({
  ensureLlamaRunning: vi.fn(async () => undefined),
}));

const { createGateway, createLlmBridge } = await import('../../src/main/llm-bridge');
const { ensureLlamaRunning } = await import('../../src/main/ipc/runtime/llamacpp-autostart');

type Services = Parameters<typeof createLlmBridge>[0];

/** Only what `buildRecommendations` reads: no vault (so no cloud provider is
 *  configured) and the machine-local override. */
function fakeServices(vramOverrideMb: number | null): Services {
  return {
    settings: {
      vault: () => null,
      snapshot: () => ({ app: { machine: { vramOverrideMb } }, vault: null }),
    },
    keys: { get: () => null, set: () => undefined, remove: () => undefined },
  } as unknown as Services;
}

/** Every catalogue id the recommendation set still offers, in any position. */
function offeredModels(set: RecommendationSet): string[] {
  const ids = set.tasks.flatMap((task) => [
    ...(task.pick ? [task.pick.model] : []),
    ...task.alternatives.map((alternative) => alternative.model),
  ]);
  return [...new Set(ids)].sort();
}

async function recommend(vramOverrideMb: number | null): Promise<string[]> {
  return offeredModels(await createLlmBridge(fakeServices(vramOverrideMb)).recommendModels());
}

describe('buildRecommendations sees the manual VRAM override', () => {
  it('offers both models while VRAM is unknown and RAM sets the ceiling', async () => {
    const offered = await recommend(null);

    expect(offered).toContain(fx.SMALL.id);
    expect(offered).toContain(fx.LARGE.id);
  });

  it('re-judges every model against an entered 16384 MB instead of the RAM ceiling', async () => {
    /* The assertion this deliverable exists for: the number never went
       through `llm:scanMachine` here — it only sits in the settings — and the
       recommendation path still has to pick it up. Without the override
       threaded through `scanCapacityVerdict`, this set would be identical to
       the one above. */
    const offered = await recommend(16384);

    expect(offered).toContain(fx.SMALL.id);
    expect(offered).not.toContain(fx.LARGE.id);
  });

  it('goes back to the previous set once the override is cleared', async () => {
    const withOverride = await recommend(16384);
    const cleared = await recommend(null);

    expect(cleared).toContain(fx.LARGE.id);
    expect(withOverride).not.toEqual(cleared);
  });
});

/* 034, D6: the on-demand guard belongs to the local engine, so it may only
   delay a call that is actually routed to it. Awaiting it on every dispatch
   put up to `START_TIMEOUT_MS` (20 s) in front of a request headed for a
   cloud provider that has no use for a llama-server at all. */
describe('withAutoStart waits only for a call routed to llama.cpp', () => {
  const TASK = 'title-tags';

  function providerConfig(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
    return {
      label: 'provider',
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

  const LLAMACPP = providerConfig({ id: 'llama-1', label: 'llama.cpp' });
  /* Kind `'fake'` stands in for any non-local route: it needs no key and
     never touches the network, so the dispatch below resolves without one. */
  const CLOUD = providerConfig({
    id: 'cloud-1',
    label: 'Cloud',
    kind: 'fake',
    local: false,
    baseUrl: 'https://api.example.com',
  });

  function routedTo(provider: ProviderConfig): Services {
    return {
      settings: {
        vault: () => ({
          providers: [provider],
          routing: { tasks: { [TASK]: { providerId: provider.id, model: 'm' } }, defaults: {} },
        }),
        snapshot: () => ({ app: { machine: { llamaAutoStart: 'on-demand' } }, vault: null }),
      },
      keys: { get: () => 'key', set: () => undefined, remove: () => undefined },
      vaultRoot: () => null,
    } as unknown as Services;
  }

  async function dispatch(provider: ProviderConfig): Promise<void> {
    vi.mocked(ensureLlamaRunning).mockClear();
    await createGateway(routedTo(provider)).complete({
      task: TASK,
      messages: [{ role: 'user', content: 'x' }],
      maxTokens: 8,
    });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not wait when the task is routed to a provider that is not the engine', async () => {
    await dispatch(CLOUD);

    expect(ensureLlamaRunning).not.toHaveBeenCalled();
  });

  it('waits when the task is routed to the llama.cpp provider', async () => {
    // The only stub needed: the dispatch itself would otherwise open a socket
    // to 127.0.0.1. No test here talks to a real engine.
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    }));

    await dispatch(LLAMACPP);

    expect(ensureLlamaRunning).toHaveBeenCalledTimes(1);
  });
});
