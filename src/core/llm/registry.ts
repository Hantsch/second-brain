/* Provider-Verwaltung ohne Electron: anlegen, ändern, löschen, testen, Modelle
   holen — und aus dem Vorhandenen ein sinnvolles Routing vorschlagen.

   Schlüssel laufen ausschließlich über den injizierten `KeyStore`. Diese Datei
   sieht einen Schlüssel nur, um ihn an einen Provider weiterzugeben; sie gibt ihn
   niemals nach außen. */

import type { ProviderConfig, ProviderKind, Routing, TaskDefinition } from '@shared/types';
import { createProviderFactory, type ProviderFactory } from './factory';
import { needsApiKey } from './presets';
import { TASK_DEFINITIONS } from './tasks';
import { TIER_ORDER, collectCandidates, pickCandidate } from './tiers';
import type { FetchLike, KeyStore, LlmProvider } from './types';

export { classifyModelTier } from './tiers';

export interface NewProviderInput {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Wird sofort in den `KeyStore` gelegt, nie in die Konfiguration. */
  apiKey?: string;
  local?: boolean;
  models?: string[];
  enabled?: boolean;
}

export interface ProviderRegistryOptions {
  providers?: readonly ProviderConfig[];
  keys: KeyStore;
  fetchImpl?: FetchLike;
  createProvider?: ProviderFactory;
  /** Zeitquelle, damit Tests `createdAt` festnageln können. */
  now?: () => Date;
  /** ID-Quelle, damit Tests stabile IDs bekommen. */
  createId?: (input: NewProviderInput) => string;
}

export class ProviderRegistry {
  private providers: ProviderConfig[];
  private readonly keys: KeyStore;
  private readonly factory: ProviderFactory;
  private readonly now: () => Date;
  private readonly createId: (input: NewProviderInput) => string;

  constructor(options: ProviderRegistryOptions) {
    this.providers = (options.providers ?? []).map((config) => ({ ...config }));
    this.keys = options.keys;
    this.factory =
      options.createProvider ??
      createProviderFactory(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {});
    this.now = options.now ?? ((): Date => new Date());
    this.createId = options.createId ?? defaultId;
  }

  /** Alle Provider, als Kopie — niemand ändert den Bestand aus Versehen. */
  list(): ProviderConfig[] {
    return this.providers.map((config) => ({ ...config }));
  }

  get(id: string): ProviderConfig | null {
    const found = this.providers.find((config) => config.id === id);
    return found ? { ...found } : null;
  }

  add(input: NewProviderInput): ProviderConfig {
    const id = uniqueId(this.createId(input), this.providers);
    if (input.apiKey) this.keys.set(id, input.apiKey);
    const config: ProviderConfig = {
      id,
      label: input.label,
      kind: input.kind,
      baseUrl: input.baseUrl,
      hasKey: this.keys.get(id) !== null,
      local: input.local ?? false,
      enabled: input.enabled ?? true,
      models: input.models ? [...input.models] : [],
      createdAt: this.now().toISOString(),
    };
    this.providers.push(config);
    return { ...config };
  }

  /**
   * Ändert einen Provider. `apiKey === ''` löscht den Schlüssel, `undefined`
   * lässt ihn unberührt — so kann die Oberfläche Felder leer lassen.
   */
  update(id: string, patch: Partial<Omit<ProviderConfig, 'id'>>, apiKey?: string): ProviderConfig {
    const config = this.require(id);
    if (apiKey !== undefined) {
      if (apiKey === '') this.keys.remove(id);
      else this.keys.set(id, apiKey);
    }
    Object.assign(config, patch, { id });
    if (patch.models) config.models = [...patch.models];
    config.hasKey = this.keys.get(id) !== null;
    return { ...config };
  }

  remove(id: string): void {
    this.providers = this.providers.filter((config) => config.id !== id);
    this.keys.remove(id);
  }

  /** Verbindungstest: Latenz, Modellzahl, Fehler als Text. Aktualisiert die Modell-Liste. */
  async probe(id: string): Promise<ProviderConfig> {
    const config = this.require(id);
    const provider = this.providerFor(config);
    const probe = await provider.probe();
    if (probe.ok) {
      try {
        config.models = await provider.listModels();
      } catch {
        // Modelle bleiben, wie sie waren — der Test selbst hat ja funktioniert.
      }
    }
    config.probe = probe;
    config.hasKey = this.keys.get(id) !== null;
    return { ...config };
  }

  /** Modelle abfragen und merken. Wirft, wenn der Provider nicht antwortet. */
  async listModels(id: string): Promise<string[]> {
    const config = this.require(id);
    const models = await this.providerFor(config).listModels();
    config.models = models;
    return [...models];
  }

  /** Fehlt für einen Provider, der einen braucht, der Schlüssel? */
  missingKey(id: string): boolean {
    const config = this.require(id);
    return needsApiKey(config) && this.keys.get(id) === null;
  }

  /** Provider-Instanz mit Schlüssel — nur für den internen Gebrauch. */
  providerFor(config: ProviderConfig): LlmProvider {
    return this.factory(config, this.keys.get(config.id));
  }

  private require(id: string): ProviderConfig {
    const found = this.providers.find((config) => config.id === id);
    if (!found) throw new Error(`Unbekannter Provider: ${id}`);
    return found;
  }
}

/**
 * Weist jeder Aufgabe ein vorhandenes Modell zu:
 * - sensible Aufgaben bevorzugt an lokale Provider,
 * - sonst so nah wie möglich an der empfohlenen Leistungsklasse.
 * Gibt es keine Modelle, kommt ein leeres Routing zurück — die App bleibt benutzbar.
 */
export function suggestRouting(
  providers: readonly ProviderConfig[],
  tasks: readonly TaskDefinition[] = TASK_DEFINITIONS,
): Routing {
  const candidates = collectCandidates(providers);
  const routing: Routing = { tasks: {}, defaults: {} };
  if (candidates.length === 0) return routing;

  for (const task of tasks) {
    const pick = pickCandidate(candidates, task.suggested, { sensitive: task.sensitive });
    if (pick) routing.tasks[task.kind] = { providerId: pick.providerId, model: pick.model };
  }

  for (const tier of TIER_ORDER) {
    const pick = pickCandidate(candidates, tier, { sensitive: false });
    if (pick) routing.defaults[tier] = { providerId: pick.providerId, model: pick.model };
  }

  return routing;
}

function defaultId(input: NewProviderInput): string {
  const slug =
    input.label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || input.kind;
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

function uniqueId(candidate: string, existing: readonly ProviderConfig[]): string {
  let id = candidate;
  let counter = 2;
  while (existing.some((config) => config.id === id)) {
    id = `${candidate}-${counter}`;
    counter += 1;
  }
  return id;
}
