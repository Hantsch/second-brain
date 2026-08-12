/* The bridge to the core's LLM layer.

   The set of providers and the routing live in the vault settings, the keys
   in the machine's key store. `ProviderRegistry` and `RoutingGateway` are
   built fresh from this state on every call — that way there is no second
   source of truth that could go stale. */

import {
  LlmUnavailableError,
  PROVIDER_PRESETS,
  ProviderRegistry,
  RoutingGateway,
  TASK_DEFINITIONS,
  suggestRouting,
} from '@core/llm';
import type { KeyStore as CoreKeyStore } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import type { ProviderConfig, TaskKind } from '@shared/types';
import type { LlmBridge } from './contracts';
import { providerKeyId } from './secrets';
import type { KeyStore } from './secrets';
import type { Services } from './services';

/** The core expects a synchronous key store; the actual write happens in the background. */
function coreKeys(keys: KeyStore): CoreKeyStore {
  return {
    get: (providerId) => keys.get(providerKeyId(providerId)),
    set: (providerId, key) => void keys.set(providerKeyId(providerId), key),
    remove: (providerId) => void keys.remove(providerKeyId(providerId)),
  };
}

function providersOf(services: Services): ProviderConfig[] {
  return services.settings.vault()?.providers.map((provider) => ({ ...provider })) ?? [];
}

function registryOf(services: Services): ProviderRegistry {
  return new ProviderRegistry({ providers: providersOf(services), keys: coreKeys(services.keys) });
}

/**
 * The gateway for a task — the one place where it gets built.
 *
 * Fresh on every call: routing, providers, and keys live in the settings and
 * change while the app runs. Caching here would risk sending a task to a
 * model the user just disabled. Without a vault there is no routing — the
 * call then reports `llm-unavailable` instead of silently doing nothing.
 */
export function createGateway(services: Services): LlmGateway {
  const settings = services.settings.vault();
  return new RoutingGateway({
    routing: settings?.routing ?? { tasks: {}, defaults: {} },
    providers: providersOf(services),
    keys: coreKeys(services.keys),
  });
}

/** Writes a validated provider version back into the vault settings. */
async function persist(services: Services, updated: ProviderConfig): Promise<void> {
  const current = services.settings.vault();
  if (!current) return;
  await services.settings.setVaultSection(
    'providers',
    current.providers.map((provider) => (provider.id === updated.id ? updated : provider)),
  );
}

export function createLlmBridge(services: Services): LlmBridge {
  return {
    tasks: () => TASK_DEFINITIONS,
    presets: () => PROVIDER_PRESETS,

    probe: async (providerId) => {
      const updated = await registryOf(services).probe(providerId);
      await persist(services, updated);
      return updated;
    },

    models: async (providerId) => {
      const registry = registryOf(services);
      const models = await registry.listModels(providerId);
      const updated = registry.get(providerId);
      if (updated) await persist(services, { ...updated, models });
      return models;
    },

    suggestRouting: () => suggestRouting(providersOf(services)),

    testTask: (task: TaskKind) => runTestTask(services, task),
  };
}

/** A short, real call: does the route work, and how long does it take? */
async function runTestTask(
  services: Services,
  task: TaskKind,
): Promise<{ ok: boolean; latencyMs: number; sample: string; error?: string }> {
  if (!services.settings.vault()) return { ok: false, latencyMs: 0, sample: '', error: 'no-vault' };
  const gateway = createGateway(services);
  try {
    const result = await gateway.complete({
      task,
      messages: [{ role: 'user', content: 'Antworte mit genau dem Wort: ok' }],
      maxTokens: 16,
    });
    return { ok: true, latencyMs: result.latencyMs, sample: result.text.slice(0, 200) };
  } catch (error) {
    const reason = error instanceof LlmUnavailableError ? error.info.reason : 'error';
    return { ok: false, latencyMs: 0, sample: '', error: reason };
  }
}
