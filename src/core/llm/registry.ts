/* Provider management without Electron: create, change, delete, test, fetch
   models — and suggest a sensible routing from what's available.

   Keys run exclusively through the injected `KeyStore`. This file only ever
   sees a key in order to pass it on to a provider; it never exposes it
   externally. */

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
  /** Placed immediately into the `KeyStore`, never into the configuration. */
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
  /** Time source, so tests can pin down `createdAt`. */
  now?: () => Date;
  /** ID source, so tests get stable IDs. */
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

  /** All providers, as a copy — no one accidentally mutates the underlying list. */
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
   * Changes a provider. `apiKey === ''` deletes the key, `undefined`
   * leaves it untouched — this way the UI can leave fields empty.
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

  /** Connection test: latency, model count, error as text. Updates the model list. */
  async probe(id: string): Promise<ProviderConfig> {
    const config = this.require(id);
    const provider = this.providerFor(config);
    const probe = await provider.probe();
    if (probe.ok) {
      try {
        config.models = await provider.listModels();
      } catch {
        // Models stay as they were — the test itself did succeed after all.
      }
    }
    config.probe = probe;
    config.hasKey = this.keys.get(id) !== null;
    return { ...config };
  }

  /** Queries and remembers models. Throws if the provider doesn't respond. */
  async listModels(id: string): Promise<string[]> {
    const config = this.require(id);
    const models = await this.providerFor(config).listModels();
    config.models = models;
    return [...models];
  }

  /** Is the key missing for a provider that needs one? */
  missingKey(id: string): boolean {
    const config = this.require(id);
    return needsApiKey(config) && this.keys.get(id) === null;
  }

  /** Provider instance with key — for internal use only. */
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
 * Assigns an available model to every task:
 * - sensitive tasks preferably to local providers,
 * - otherwise as close as possible to the recommended performance tier.
 * If there are no models, an empty routing comes back — the app stays usable.
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
