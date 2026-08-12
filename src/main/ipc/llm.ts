/* LLM-Verwaltung: Provider anlegen und pflegen, Aufgaben auf Modelle routen.
   Die Provider-Liste reist im Vault, die Schlüssel bleiben auf der Maschine.
   Alles, was das Netz braucht (Probe, Modell-Liste, Testlauf), verlangt ein
   angehängtes Gateway und meldet sonst `llm-unavailable`.

   Zwei Regeln, die hier durchgesetzt werden:
   - Ein Schlüssel verlässt diesen Prozess nie. Er kommt herein (`apiKey`), geht
     in den Schlüsselspeicher und ist danach nur noch als `hasKey` sichtbar.
     Deshalb wird jede Änderung feldweise übernommen, nicht als Objekt gemergt.
   - `llm:suggestRouting` schlägt vor und schreibt nichts. Übernommen wird der
     Vorschlag erst über `llm:setRoute`/`llm:setDefault` — die KI schlägt vor,
     der Mensch bestätigt. */

import { randomUUID } from 'node:crypto';
import { PROVIDER_PRESETS, TASK_DEFINITIONS } from '@core/llm';
import type { ProviderConfig, ProviderKind, Routing, VaultSettings } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { detectLocalRuntimes } from './llm-detect';
import type { Services } from '../services';
import { providerKeyId as keyId } from '../secrets';

/** Nur echte Anbindungen; `fake` gehört Tests und dem Demo-Modus, nicht der Oberfläche. */
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

/** Adresse prüfen: nur http und https, ohne Schrägstrich am Ende. */
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
 * Übernimmt aus einer Änderung genau die Felder, die der Nutzer ändern darf.
 * `hasKey`, `id`, `createdAt` und `probe` sind Befunde der App, keine Eingabe —
 * so kann über diesen Kanal auch kein Schlüssel in die Vault-Datei wandern.
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

/** Schlüssel setzen oder löschen; informiert, wenn er den Neustart nicht überlebt. */
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

    /* Ohne Vault gibt es keinen Provider-Bestand, aber die Frage „läuft hier
       schon etwas?" bleibt beantwortbar — das Onboarding darf sie stellen. */
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

    /* Nur der Vorschlag. Geschrieben wird er erst, wenn der Nutzer zustimmt. */
    'llm:suggestRouting': async () => {
      requireVaultSettings(services);
      return services.requireLlm().suggestRouting();
    },

    'llm:testTask': ({ task }) => services.requireLlm().testTask(task),
  });
}

/** Eine Route darf nur auf einen eingerichteten Provider zeigen. */
function requireRef(
  settings: VaultSettings,
  ref: { providerId: string; model: string },
): { providerId: string; model: string } {
  findProvider(settings, ref.providerId);
  const model = ref.model.trim();
  if (!model) throw fail('invalid', 'ohne Modellnamen gibt es keine Route');
  return { providerId: ref.providerId, model };
}

/** Nimmt einen gelöschten Provider aus dem Routing — sonst zeigen Routen ins Leere. */
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
