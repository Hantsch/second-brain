/* 034, D3: writing the started engine's port back into the llama.cpp provider
 * (Decisions, Q3). The rule under test is "only an unambiguous match" — the
 * app rewrites one address it is sure about, and otherwise does nothing at
 * all. Every write goes through a fake settings access; no vault is touched.
 */

import { describe, expect, it } from 'vitest';
import type { ProviderSettingsAccess } from '../../../../src/main/ipc/runtime/llamacpp-provider-port';
import { adoptLlamaProviderPort } from '../../../../src/main/ipc/runtime/llamacpp-provider-port';
import type { ProviderConfig, VaultSettings } from '../../../../src/shared/types';

function provider(overrides: Partial<ProviderConfig> & { id: string }): ProviderConfig {
  return {
    label: 'llama.cpp',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:8080/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: [],
    createdAt: '2026-08-23T10:00:00.000Z',
    ...overrides,
  };
}

/** A settings seam that records what would have been written. `vault: null`
    is the "no vault open" case — providers live in the vault, so there is
    nothing to write to then. */
function fakeSettings(providers: ProviderConfig[] | null): {
  settings: ProviderSettingsAccess;
  written: ProviderConfig[][];
} {
  const written: ProviderConfig[][] = [];
  const vault = providers === null ? null : ({ providers } as unknown as VaultSettings);
  return {
    written,
    settings: {
      vault: () => vault,
      setVaultSection: async (_key, value) => {
        written.push(value);
      },
    },
  };
}

describe('adoptLlamaProviderPort', () => {
  it('points the one llama.cpp provider at the port the engine started on', async () => {
    const { settings, written } = fakeSettings([
      provider({ id: 'llama-1', baseUrl: 'http://127.0.0.1:8080/v1' }),
      provider({
        id: 'anthropic-1',
        kind: 'anthropic',
        local: false,
        baseUrl: 'https://api.anthropic.com',
      }),
    ]);

    expect(await adoptLlamaProviderPort(settings, 11437)).toBe('updated');
    expect(written).toHaveLength(1);
    expect(written[0]?.map((entry) => entry.baseUrl)).toEqual([
      'http://127.0.0.1:11437/v1',
      'https://api.anthropic.com',
    ]);
  });

  it('recognises an address already inside the range and moves it', async () => {
    const { settings, written } = fakeSettings([
      provider({ id: 'llama-1', baseUrl: 'http://localhost:11435/v1' }),
    ]);

    expect(await adoptLlamaProviderPort(settings, 11436)).toBe('updated');
    expect(written[0]?.[0]?.baseUrl).toBe('http://127.0.0.1:11436/v1');
  });

  it('writes nothing when the address is already right', async () => {
    const { settings, written } = fakeSettings([
      provider({ id: 'llama-1', baseUrl: 'http://127.0.0.1:11435/v1' }),
    ]);

    expect(await adoptLlamaProviderPort(settings, 11435)).toBe('skipped');
    expect(written).toEqual([]);
  });

  it('leaves a provider that does not look like llama.cpp alone', async () => {
    const { settings, written } = fakeSettings([
      // Ollama's own port, and a remote provider — neither is this engine.
      provider({ id: 'ollama-1', baseUrl: 'http://localhost:11434/v1' }),
      provider({ id: 'remote-1', local: false, baseUrl: 'http://192.168.0.5:11435/v1' }),
    ]);

    expect(await adoptLlamaProviderPort(settings, 11435)).toBe('skipped');
    expect(written).toEqual([]);
  });

  it('does not pick between two candidates', async () => {
    const { settings, written } = fakeSettings([
      provider({ id: 'llama-1', baseUrl: 'http://127.0.0.1:8080/v1' }),
      provider({ id: 'llama-2', baseUrl: 'http://127.0.0.1:11440/v1' }),
    ]);

    expect(await adoptLlamaProviderPort(settings, 11435)).toBe('skipped');
    expect(written).toEqual([]);
  });

  it('skips silently when no vault is open, so a start still works', async () => {
    const { settings, written } = fakeSettings(null);

    expect(await adoptLlamaProviderPort(settings, 11435)).toBe('skipped');
    expect(await adoptLlamaProviderPort(undefined, 11435)).toBe('skipped');
    expect(written).toEqual([]);
  });

  it('changes nothing but baseUrl on the patched provider — no engine state or path enters the vault (034, D7)', async () => {
    const original = provider({
      id: 'llama-1',
      baseUrl: 'http://127.0.0.1:8080/v1',
      label: 'llama.cpp lokal',
      models: ['model-7b'],
    });
    const { settings, written } = fakeSettings([original]);

    expect(await adoptLlamaProviderPort(settings, 11438)).toBe('updated');

    const patched = written[0]?.[0];
    expect(patched).toEqual({ ...original, baseUrl: 'http://127.0.0.1:11438/v1' });
    // Every other field is the exact same reference or value as before — a
    // second, independent check that the diff really is baseUrl alone.
    for (const key of Object.keys(original) as (keyof typeof original)[]) {
      if (key === 'baseUrl') continue;
      expect(patched?.[key]).toEqual(original[key]);
    }
    // The new value is a bare loopback URL: no path segment, no argv, no
    // engine-internal detail — just host and port.
    expect(patched?.baseUrl).toBe('http://127.0.0.1:11438/v1');
    expect(patched?.baseUrl).not.toMatch(/[\\]|\.gguf|--|-ngl|-m\b/);
  });
});
