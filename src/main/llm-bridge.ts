/* The bridge to the core's LLM layer.

   The set of providers and the routing live in the vault settings, the keys
   in the machine's key store. `ProviderRegistry` and `RoutingGateway` are
   built fresh from this state on every call — that way there is no second
   source of truth that could go stale. */

import { readFileSync } from 'node:fs';
import { createFsAgentJobStore } from '@core/agent/jobs';
import {
  FakeProvider,
  LlmUnavailableError,
  PROVIDER_PRESETS,
  ProviderRegistry,
  RoutingGateway,
  TASK_DEFINITIONS,
  createProviderFactory,
  loadCatalogueWithLiveData,
  recommendModels,
  suggestRouting,
} from '@core/llm';
import type { FakeProviderOptions, KeyStore as CoreKeyStore, ProviderFactory } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import { isAgentRoute } from '@shared/types';
import type { LlmUnavailable, ProviderConfig, RecommendationSet, TaskKind } from '@shared/types';
import type { LlmBridge } from './contracts';
import { scanCapacityVerdict } from './ipc/machine-scan';
import { ensureLlamaRunning } from './ipc/runtime/llamacpp-autostart';
import { looksLikeLlamaCppProvider } from './ipc/runtime/llamacpp-provider-port';
import { providerKeyId } from './secrets';
import type { KeyStore } from './secrets';
import type { Services } from './services';

/**
 * `SB_E2E_FAKE_PROVIDER` — path to a JSON file describing the `fake` provider's
 * behaviour for this run: `{ replies?, latencyMs?, failEverything? }`, the same
 * shape `FakeProviderOptions` accepts (minus `errors`/`models`/`chunkSize`/
 * `usage`/`probeOk`, which no e2e spec needs so far). Same env family as
 * `SB_E2E_STAGE_DELAY_MS` (`ipc/gardener-run.ts`) and `SB_VAULT`: set by the
 * e2e fixtures, never by the app.
 *
 * Read once, when this module loads — not per call: the file describes how
 * the process was started, and re-reading it mid-session would let a spec's
 * later, unrelated call see a script written for an earlier one. Anything
 * that isn't a readable file with valid JSON — unset env var, missing file,
 * bad JSON — is read as "no fake-provider config" and never throws: a
 * mistyped or absent variable must not be able to keep the app from starting,
 * since this same code path runs for every non-e2e user too.
 */
function fakeProviderOptionsFromEnv(): FakeProviderOptions | undefined {
  const path = process.env['SB_E2E_FAKE_PROVIDER'];
  if (!path) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { replies, latencyMs, failEverything } = parsed as Record<string, unknown>;
    return {
      ...(isRecordOfStrings(replies) ? { replies } : {}),
      ...(typeof latencyMs === 'number' ? { latencyMs } : {}),
      ...(typeof failEverything === 'string' ? { failEverything } : {}),
    };
  } catch {
    return undefined;
  }
}

function isRecordOfStrings(value: unknown): value is Record<TaskKind, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  );
}

const FAKE_PROVIDER_OPTIONS = fakeProviderOptionsFromEnv();

/**
 * The default factory (`createProviderFactory`) for every provider kind
 * except `fake`, whose one instance this run needs is built with whatever
 * `SB_E2E_FAKE_PROVIDER` configured (or the same bare `new FakeProvider()` as
 * always, when the env var is unset). An e2e-only seam (073, D1) — this
 * wrapper stays local to `llm-bridge.ts` and never touches
 * `core/llm/factory.ts`, which non-e2e code paths (and their tests) share.
 */
function createGatewayProviderFactory(): ProviderFactory {
  const defaultFactory = createProviderFactory();
  return (config, apiKey) =>
    config.kind === 'fake'
      ? new FakeProvider(FAKE_PROVIDER_OPTIONS ?? {})
      : defaultFactory(config, apiKey);
}

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
  return withAutoStart(routingGatewayOf(services), services);
}

function routingGatewayOf(services: Services): RoutingGateway {
  const settings = services.settings.vault();
  const root = services.vaultRoot();
  return new RoutingGateway({
    ...(root ? { agentJobs: createFsAgentJobStore(root) } : {}),
    routing: settings?.routing ?? { tasks: {}, defaults: {} },
    providers: providersOf(services),
    keys: coreKeys(services.keys),
    createProvider: createGatewayProviderFactory(),
  });
}

/**
 * Why `task` cannot run right now — no route, a disabled provider, a missing
 * key — or `null` when it can. Same resolution as `createGateway`, so the
 * reason a handler reports is the reason the call would actually fail with.
 */
export function llmUnavailableReason(services: Services, task: TaskKind): LlmUnavailable | null {
  return routingGatewayOf(services).unavailable(task);
}

/**
 * Does *this* task's route point at the llama.cpp engine? The gateway's own
 * `routeFor` answers the routing half (explicit route → tier default →
 * nothing, provider present and enabled), and `looksLikeLlamaCppProvider` —
 * the same shape check `llamacpp-autostart.ts` uses, not a second heuristic —
 * answers the rest.
 *
 * Without this, a task routed to Anthropic would wait out an on-demand
 * llama.cpp start it has no use for: up to `START_TIMEOUT_MS` (20 s) added to
 * a request that was never going to touch the local engine.
 */
function routesToLlamaCpp(gateway: LlmGateway, services: Services, task: TaskKind): boolean {
  const ref = gateway.routeFor(task);
  if (!ref) return false;
  const provider = providersOf(services).find((candidate) => candidate.id === ref.providerId);
  return provider !== undefined && looksLikeLlamaCppProvider(provider);
}

/**
 * Wraps the real gateway so a call that actually dispatches to the llama.cpp
 * provider (`complete`, `stream`) first awaits `ensureLlamaRunning` (034,
 * D6) — a no-op unless `machine.llamaAutoStart` is `'on-demand'` and the
 * engine is installed but stopped. A call routed anywhere else does not wait
 * at all. `isAvailable`/`routeFor` pass straight through unwrapped: they only
 * answer a routing question, never a network call, so there is nothing for
 * them to wait on.
 *
 * A thin object, not a new class: every call site already goes through
 * `createGateway`, so this is the one place that needs to know the guard
 * exists at all.
 */
function withAutoStart(gateway: LlmGateway, services: Services): LlmGateway {
  const ensureIfLocal = async (task: TaskKind): Promise<void> => {
    if (routesToLlamaCpp(gateway, services, task)) await ensureLlamaRunning(services);
  };
  return {
    complete: async (req) => {
      await ensureIfLocal(req.task);
      return gateway.complete(req);
    },
    stream: async (req, onDelta) => {
      await ensureIfLocal(req.task);
      return gateway.stream(req, onDelta);
    },
    isAvailable: (task) => gateway.isAvailable(task),
    routeFor: (task) => gateway.routeFor(task),
  };
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

    recommendModels: () => buildRecommendations(services),

    testTask: (task: TaskKind) => runTestTask(services, task),
  };
}

/**
 * Assembles what `recommendModels` (`@core/llm`) needs: the live-enriched
 * catalogue, the configured providers, the local models already known to be
 * installed (from `ProviderConfig.models` — no extra `listModels()` round
 * trip here), and this machine's capacity verdict.
 */
async function buildRecommendations(services: Services): Promise<RecommendationSet> {
  const providers = providersOf(services);
  const [catalogue, verdict] = await Promise.all([
    loadCatalogueWithLiveData({}),
    scanCapacityVerdict(services),
  ]);
  // A disabled local runtime isn't actually reachable, so its models don't
  // count as "installed" here — otherwise an entry only present on a
  // switched-off runtime would be reported reachable when it can't
  // currently be called.
  const installedLocalModelIds = providers
    .filter((provider) => provider.local && provider.enabled)
    .flatMap((provider) => provider.models);
  return recommendModels(catalogue, providers, installedLocalModelIds, verdict);
}

/** A short, real call: does the route work, and how long does it take? */
async function runTestTask(
  services: Services,
  task: TaskKind,
): Promise<{ ok: boolean; latencyMs: number; sample: string; error?: string }> {
  if (!services.settings.vault()) return { ok: false, latencyMs: 0, sample: '', error: 'no-vault' };
  const gateway = createGateway(services);
  // There is no model to probe, and a test prompt must not land in the agent's job queue.
  if (isAgentRoute(gateway.routeFor(task))) {
    return { ok: false, latencyMs: 0, sample: '', error: 'agent-route' };
  }
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
