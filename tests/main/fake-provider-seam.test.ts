/* The `SB_E2E_FAKE_PROVIDER` seam (073, D1): `createGateway`
   (`src/main/llm-bridge.ts`) passes a `createProvider` factory to
   `RoutingGateway` whose `'fake'` branch builds `FakeProvider` from whatever
   this env var's file describes — `replies`/`latencyMs`/`failEverything` — or
   a bare `FakeProvider()` when the var is unset, exactly as
   `src/core/llm/factory.ts`'s own `'fake'` branch always has.

   The option is read once, at module load (mirrors `STAGE_DELAY_MS` in
   `src/main/ipc/gardener-run.ts`), so each case here needs a fresh module
   graph: `vi.resetModules()` plus a dynamic `import()` of `llm-bridge`, the
   same pattern `tests/main/gardener-run-delay.test.ts` uses for its own
   module-level env constant. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@shared/types';

/* No windows and no encryption in the test — the same stub
   `tests/main/llm-bridge.test.ts` and `tests/main/gardener-run-delay.test.ts`
   already use for the main process. */
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  app: { getVersion: () => '0.0.0-test', getPath: () => '' },
  safeStorage: { isEncryptionAvailable: () => false },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
}));

const FAKE_PROVIDER_ENV = 'SB_E2E_FAKE_PROVIDER';
const TASK = 'title-tags';

function fakeProviderConfig(): ProviderConfig {
  return {
    id: 'fake-1',
    label: 'Fake',
    kind: 'fake',
    baseUrl: '',
    hasKey: false,
    local: true,
    enabled: true,
    models: ['fake-model'],
    createdAt: '2026-08-23T10:00:00.000Z',
  };
}

/** Only what `createGateway` reads: a vault with one `fake` provider, routed
 *  for `TASK`, and a key store `needsApiKey` never has to consult (`'fake'`
 *  never needs a key). */
function fakeServices(provider: ProviderConfig): unknown {
  return {
    settings: {
      vault: () => ({
        providers: [provider],
        routing: {
          tasks: { [TASK]: { providerId: provider.id, model: provider.models[0] } },
          defaults: {},
        },
      }),
      snapshot: () => ({ app: { machine: {} }, vault: null }),
    },
    keys: { get: () => null, set: () => undefined, remove: () => undefined },
  };
}

/** Imports `createGateway` fresh, after `envValue` was put into (or removed
 *  from) the environment — so the module-level `FAKE_PROVIDER_OPTIONS` const
 *  it builds at load time reflects exactly this case. */
async function loadCreateGateway(envValue: string | undefined) {
  vi.stubEnv(FAKE_PROVIDER_ENV, envValue);
  vi.resetModules();
  const { createGateway } = await import('../../src/main/llm-bridge');
  return createGateway as (services: unknown) => {
    complete: (req: {
      task: string;
      messages: { role: 'user'; content: string }[];
      maxTokens?: number;
    }) => Promise<{ text: string; latencyMs: number }>;
  };
}

describe('the fake-provider seam (SB_E2E_FAKE_PROVIDER)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-fake-provider-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("unset: a `kind: 'fake'` provider still gets a bare FakeProvider(), unchanged from today", async () => {
    const createGateway = await loadCreateGateway(undefined);
    const provider = fakeProviderConfig();

    const result = await createGateway(fakeServices(provider)).complete({
      task: TASK,
      messages: [{ role: 'user', content: 'hello there' }],
      maxTokens: 16,
    });

    // `FakeProvider`'s own default reply (`src/core/llm/providers/fake.ts`,
    // `defaultReply`) when constructed with no options at all.
    expect(result.text).toBe('[fake:title-tags] hello there');
  });

  it('set, with replies + latencyMs: the routed call answers scripted and offline', async () => {
    const file = join(tempDir, 'fake-provider.json');
    await writeFile(
      file,
      JSON.stringify({
        replies: { [TASK]: 'scripted answer, no network involved' },
        latencyMs: 40,
      }),
      'utf8',
    );

    const createGateway = await loadCreateGateway(file);
    const provider = fakeProviderConfig();

    const result = await createGateway(fakeServices(provider)).complete({
      task: TASK,
      messages: [{ role: 'user', content: 'hello there' }],
      maxTokens: 16,
    });

    expect(result.text).toBe('scripted answer, no network involved');
    // `latencyMs` measures the gateway's own clock around the call
    // (`RoutingGateway.run`), so a real wait inside `FakeProvider.run` has to
    // show up here — proof the parsed option actually reached the instance,
    // not just that JSON.parse succeeded.
    expect(result.latencyMs).toBeGreaterThanOrEqual(40);
  });

  it('set, with failEverything: the routed call fails instead of silently succeeding', async () => {
    const file = join(tempDir, 'fake-provider.json');
    await writeFile(file, JSON.stringify({ failEverything: 'scripted outage' }), 'utf8');

    const createGateway = await loadCreateGateway(file);
    const provider = fakeProviderConfig();

    await expect(
      createGateway(fakeServices(provider)).complete({
        task: TASK,
        messages: [{ role: 'user', content: 'hello there' }],
        maxTokens: 16,
      }),
    ).rejects.toThrow();
  });

  it('set, but the file is missing: reads as no config instead of throwing at module load', async () => {
    const createGateway = await loadCreateGateway(join(tempDir, 'does-not-exist.json'));
    const provider = fakeProviderConfig();

    const result = await createGateway(fakeServices(provider)).complete({
      task: TASK,
      messages: [{ role: 'user', content: 'hello there' }],
      maxTokens: 16,
    });

    expect(result.text).toBe('[fake:title-tags] hello there');
  });
});
