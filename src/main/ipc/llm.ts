/* LLM management: create and maintain providers, route tasks to models.
   The provider list travels with the vault, the keys stay on the machine.
   Anything that needs the network (probe, model list, test run) requires an
   attached gateway and reports `llm-unavailable` otherwise.

   Two rules enforced here:
   - A key never leaves this process. It comes in (`apiKey`), goes into the
     key store, and afterward is only ever visible as `hasKey`. That's why
     every change is applied field by field, not merged as an object.
   - `llm:suggestRouting` suggests and writes nothing. The suggestion is only
     applied via `llm:setRoute`/`llm:setDefault` — the AI suggests, the human
     confirms. */

import { randomUUID } from 'node:crypto';
import { PROVIDER_PRESETS, TASK_DEFINITIONS } from '@core/llm';
import { AGENT_ROUTE, isAgentRoute } from '@shared/types';
import type { ProviderConfig, ProviderKind, Routing, VaultSettings } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { detectLocalRuntimes } from './llm-detect';
import type { Services } from '../services';
import { providerKeyId as keyId } from '../secrets';

/** Only real connections; `fake` belongs to tests and demo mode, not the UI. */
const KINDS: readonly ProviderKind[] = ['anthropic', 'openai-compatible'];

function requireVaultSettings(services: Services): VaultSettings {
  const settings = services.settings.vault();
  if (!settings) throw fail('no-vault', 'kein Vault geöffnet');
  return settings;
}

function findProvider(settings: VaultSettings, id: string): ProviderConfig {
  const found = settings.providers.find((provider) => provider.id === id);
  if (!found) throw fail('not-found', 'dieser Provider ist nicht eingerichtet');
  return found;
}

/** Validate address: only http and https, no trailing slash. */
function cleanBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw fail('invalid', 'die Adresse ist keine gültige URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw fail('invalid', 'die Adresse muss mit http oder https beginnen');
  }
  return trimmed;
}

function cleanKind(kind: ProviderKind): ProviderKind {
  if (!KINDS.includes(kind)) throw fail('invalid', 'diese Art von Zugang gibt es nicht');
  return kind;
}

function cleanLabel(raw: string): string {
  const label = raw.trim();
  if (!label) throw fail('invalid', 'der Name fehlt');
  return label.slice(0, 60);
}

/**
 * Applies exactly the fields from a change that the user is allowed to
 * modify. `hasKey`, `id`, `createdAt`, and `probe` are findings of the app,
 * not input — this way no key can travel into the vault file through this
 * channel either.
 */
function applyPatch(
  existing: ProviderConfig,
  patch: Partial<Omit<ProviderConfig, 'id'>>,
): ProviderConfig {
  const next: ProviderConfig = { ...existing };
  if (patch.label !== undefined) next.label = cleanLabel(patch.label);
  if (patch.kind !== undefined) next.kind = cleanKind(patch.kind);
  if (patch.baseUrl !== undefined) next.baseUrl = cleanBaseUrl(patch.baseUrl);
  if (patch.local !== undefined) next.local = patch.local === true;
  if (patch.enabled !== undefined) next.enabled = patch.enabled === true;
  if (patch.models !== undefined) next.models = [...patch.models];
  return next;
}

/** Sets or removes a key; reports if it won't survive a restart. */
async function applyKey(services: Services, providerId: string, apiKey: string): Promise<boolean> {
  if (!apiKey) {
    await services.keys.remove(keyId(providerId));
    return false;
  }
  const result = await services.keys.set(keyId(providerId), apiKey);
  if (!result.persisted) {
    services.sendEvent('event:toast', { kind: 'warn', message: 'toast.keyNotPersisted' });
  }
  return true;
}

export function llmHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'llm:presets': () =>
      (services.llm()?.presets() ?? PROVIDER_PRESETS).map((preset) => ({ ...preset })),

    'llm:providers': () => requireVaultSettings(services).providers,

    'llm:addProvider': async ({ label, kind, baseUrl, apiKey, local }) => {
      const settings = requireVaultSettings(services);
      const provider: ProviderConfig = {
        id: randomUUID(),
        label: cleanLabel(label),
        kind: cleanKind(kind),
        baseUrl: cleanBaseUrl(baseUrl),
        hasKey: false,
        local: local === true,
        enabled: true,
        models: [],
        createdAt: new Date().toISOString(),
      };
      provider.hasKey = await applyKey(services, provider.id, apiKey?.trim() ?? '');
      await services.settings.setVaultSection('providers', [...settings.providers, provider]);
      return provider;
    },

    'llm:updateProvider': async ({ id, patch, apiKey }) => {
      const settings = requireVaultSettings(services);
      const existing = findProvider(settings, id);
      const updated = applyPatch(existing, patch);
      updated.hasKey =
        apiKey === undefined ? existing.hasKey : await applyKey(services, id, apiKey.trim());
      await services.settings.setVaultSection(
        'providers',
        settings.providers.map((provider) => (provider.id === id ? updated : provider)),
      );
      return updated;
    },

    'llm:removeProvider': async ({ id }) => {
      const settings = requireVaultSettings(services);
      findProvider(settings, id);
      await services.keys.remove(keyId(id));
      const routing = stripProvider(settings.routing, id);
      await services.settings.setVaultSection(
        'providers',
        settings.providers.filter((provider) => provider.id !== id),
      );
      await services.settings.setVaultSection('routing', routing);
    },

    'llm:probe': ({ id }) => {
      findProvider(requireVaultSettings(services), id);
      return services.requireLlm().probe(id);
    },

    'llm:models': ({ id }) => {
      findProvider(requireVaultSettings(services), id);
      return services.requireLlm().models(id);
    },

    /* Without a vault there's no provider set, but the question "is
       something already running here?" is still answerable — onboarding is
       allowed to ask it. */
    'llm:detectLocal': () => detectLocalRuntimes(services.settings.vault()?.providers ?? []),

    'llm:tasks': () => (services.llm()?.tasks() ?? TASK_DEFINITIONS).map((task) => ({ ...task })),

    'llm:routing': () => requireVaultSettings(services).routing,

    'llm:setRoute': async ({ task, ref }) => {
      const settings = requireVaultSettings(services);
      const tasks = { ...settings.routing.tasks };
      if (ref) tasks[task] = requireRef(settings, ref);
      else delete tasks[task];
      const next: Routing = { ...settings.routing, tasks };
      await services.settings.setVaultSection('routing', next);
      return next;
    },

    'llm:setDefault': async ({ tier, ref }) => {
      const settings = requireVaultSettings(services);
      const defaults = { ...settings.routing.defaults };
      if (ref) defaults[tier] = requireRef(settings, ref);
      else delete defaults[tier];
      const next: Routing = { ...settings.routing, defaults };
      await services.settings.setVaultSection('routing', next);
      return next;
    },

    /* Only the suggestion. It's written only once the user confirms it. */
    'llm:suggestRouting': async () => {
      requireVaultSettings(services);
      return services.requireLlm().suggestRouting();
    },

    'llm:testTask': ({ task }) => services.requireLlm().testTask(task),

    /* Only the recommendation. It's adopted only once the user confirms it
       via `llm:setRoute`/`llm:setDefault` — same rule as `llm:suggestRouting`. */
    'llm:recommendModels': async () => {
      requireVaultSettings(services);
      return services.requireLlm().recommendModels();
    },
  });
}

/** A route may only point to a configured provider. */
function requireRef(
  settings: VaultSettings,
  ref: { providerId: string; model: string },
): { providerId: string; model: string } {
  if (isAgentRoute(ref)) return { ...AGENT_ROUTE };
  findProvider(settings, ref.providerId);
  const model = ref.model.trim();
  if (!model) throw fail('invalid', 'ohne Modellnamen gibt es keine Route');
  return { providerId: ref.providerId, model };
}

/** Removes a deleted provider from the routing — otherwise routes point nowhere. */
function stripProvider(routing: Routing, providerId: string): Routing {
  const tasks: Routing['tasks'] = {};
  for (const [task, ref] of Object.entries(routing.tasks)) {
    if (ref && ref.providerId !== providerId) tasks[task as keyof Routing['tasks']] = ref;
  }
  const defaults: Routing['defaults'] = {};
  for (const [tier, ref] of Object.entries(routing.defaults)) {
    if (ref && ref.providerId !== providerId) defaults[tier as keyof Routing['defaults']] = ref;
  }
  return { tasks, defaults };
}
