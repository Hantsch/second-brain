/* Die Brücke zur LLM-Schicht des Kerns.

   Der Bestand an Providern und das Routing liegen in den Vault-Einstellungen,
   die Schlüssel im Schlüsselspeicher der Maschine. `ProviderRegistry` und
   `RoutingGateway` werden pro Aufruf frisch aus diesem Zustand gebaut — so gibt
   es keine zweite Wahrheit, die veralten könnte. */

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

/** Der Kern erwartet einen synchronen Schlüsselspeicher; das Schreiben läuft im Hintergrund. */
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
 * Das Gateway für eine Aufgabe — die eine Stelle, an der es gebaut wird.
 *
 * Pro Aufruf frisch: Routing, Provider und Schlüssel liegen in den
 * Einstellungen und ändern sich, während die App läuft. Wer hier zwischenspeichert,
 * schickt eine Aufgabe an ein Modell, das der Nutzer gerade abgeschaltet hat.
 * Ohne Vault gibt es kein Routing — dann meldet der Aufruf `llm-unavailable`,
 * statt still nichts zu tun.
 */
export function createGateway(services: Services): LlmGateway {
  const settings = services.settings.vault();
  return new RoutingGateway({
    routing: settings?.routing ?? { tasks: {}, defaults: {} },
    providers: providersOf(services),
    keys: coreKeys(services.keys),
  });
}

/** Schreibt eine geprüfte Provider-Fassung zurück in die Vault-Einstellungen. */
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

/** Ein kurzer, echter Aufruf: läuft die Route, und wie lange dauert sie? */
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
