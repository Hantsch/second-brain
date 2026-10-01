import { describe, expect, it, vi } from 'vitest';
import {
  FakeProvider,
  LlmHttpError,
  LlmUnavailableError,
  MemoryKeyStore,
  RoutingGateway,
  type KeyStore,
} from '@core/llm';
import type { CompletionRequest, ProviderConfig, Routing } from '@shared/types';
import { createFakeGateway, createEmptyGateway } from '../../fakes/llm';

function providerConfig(patch: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    id: 'cloud',
    label: 'Cloud',
    kind: 'openai-compatible',
    baseUrl: 'https://api.example.test/v1',
    hasKey: true,
    local: false,
    enabled: true,
    models: ['gpt-4o'],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...patch,
  };
}

interface Harness {
  gateway: RoutingGateway;
  provider: FakeProvider;
  sleeps: number[];
}

function harness(options: {
  routing: Routing;
  providers?: ProviderConfig[];
  keys?: KeyStore;
  provider?: FakeProvider;
  retries?: number;
  timeoutMs?: number;
}): Harness {
  const provider = options.provider ?? new FakeProvider({ fallback: 'ok' });
  const sleeps: number[] = [];
  const gateway = new RoutingGateway({
    routing: options.routing,
    providers: options.providers ?? [providerConfig()],
    keys: options.keys ?? new MemoryKeyStore({ cloud: 'sk-geheim-1234567890' }),
    createProvider: () => provider,
    ...(options.retries !== undefined ? { retries: options.retries } : {}),
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    backoffMs: (attempt) => attempt + 1,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { gateway, provider, sleeps };
}

const ask: CompletionRequest = {
  task: 'query-answer',
  messages: [{ role: 'user', content: 'Was?' }],
};

/** HTTP-Fehler wie ein Provider ihn wirft — `status` entscheidet über den Retry. */
function httpError(status: number, message = `HTTP ${status}`): LlmHttpError {
  return new LlmHttpError(status, message);
}

describe('RoutingGateway: Auflösung', () => {
  it('nimmt die ausdrückliche Route der Aufgabe', () => {
    const { gateway } = harness({
      routing: {
        tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
        defaults: { balanced: { providerId: 'cloud', model: 'anderes' } },
      },
    });
    expect(gateway.routeFor('query-answer')).toEqual({ providerId: 'cloud', model: 'gpt-4o' });
    expect(gateway.isAvailable('query-answer')).toBe(true);
  });

  it('fällt auf defaults der empfohlenen Klasse zurück', () => {
    // query-answer ist 'balanced', title-tags ist 'cheap' — jede Aufgabe zieht ihre Klasse.
    const { gateway } = harness({
      routing: {
        tasks: {},
        defaults: {
          balanced: { providerId: 'cloud', model: 'gpt-4o' },
          cheap: { providerId: 'cloud', model: 'gpt-4o-mini' },
        },
      },
    });
    expect(gateway.routeFor('query-answer')).toEqual({ providerId: 'cloud', model: 'gpt-4o' });
    expect(gateway.routeFor('title-tags')).toEqual({ providerId: 'cloud', model: 'gpt-4o-mini' });
  });

  it('meldet no-route, wenn weder Aufgabe noch Klasse belegt sind', async () => {
    const gateway = createEmptyGateway();
    expect(gateway.routeFor('query-answer')).toBeNull();
    expect(gateway.isAvailable('query-answer')).toBe(false);
    await expect(gateway.complete(ask)).rejects.toMatchObject({
      name: 'LlmUnavailableError',
      info: { reason: 'no-route', task: 'query-answer' },
    });
  });

  it('meldet no-route, wenn die Route auf einen entfernten Provider zeigt', async () => {
    const { gateway } = harness({
      routing: { tasks: { 'query-answer': { providerId: 'weg', model: 'x' } }, defaults: {} },
    });
    expect(gateway.routeFor('query-answer')).toBeNull();
    await expect(gateway.complete(ask)).rejects.toMatchObject({ info: { reason: 'no-route' } });
  });

  it('meldet provider-disabled bei abgeschaltetem Provider', async () => {
    const { gateway } = harness({
      routing: {
        tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
        defaults: {},
      },
      providers: [providerConfig({ enabled: false })],
    });
    expect(gateway.isAvailable('query-answer')).toBe(false);
    await expect(gateway.complete(ask)).rejects.toMatchObject({
      info: { reason: 'provider-disabled' },
    });
  });

  it('meldet no-key, wenn ein Cloud-Provider keinen Schlüssel hat', async () => {
    const { gateway } = harness({
      routing: {
        tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
        defaults: {},
      },
      keys: new MemoryKeyStore(),
    });
    await expect(gateway.complete(ask)).rejects.toMatchObject({ info: { reason: 'no-key' } });
  });

  it('nennt über unavailable() den Grund samt Provider statt nur false', () => {
    const route: Routing = {
      tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
      defaults: {},
    };
    const noKey = harness({ routing: route, keys: new MemoryKeyStore() }).gateway;
    expect(noKey.unavailable('query-answer')).toEqual({
      reason: 'no-key',
      task: 'query-answer',
      provider: 'Cloud',
    });
    const off = harness({ routing: route, providers: [providerConfig({ enabled: false })] });
    expect(off.gateway.unavailable('query-answer')).toMatchObject({
      reason: 'provider-disabled',
      provider: 'Cloud',
    });
    const none = harness({ routing: { tasks: {}, defaults: {} } }).gateway;
    expect(none.unavailable('query-answer')).toEqual({ reason: 'no-route', task: 'query-answer' });
    expect(harness({ routing: route }).gateway.unavailable('query-answer')).toBeNull();
  });

  it('nennt den Provider auch in der Fehlermeldung', () => {
    const error = new LlmUnavailableError({
      reason: 'no-key',
      task: 'query-answer',
      provider: 'OpenRouter',
    });
    expect(error.message).toBe('Für den zugeordneten Provider fehlt der Schlüssel (OpenRouter).');
  });

  it('verlangt für lokale Provider keinen Schlüssel', () => {
    const { gateway } = harness({
      routing: {
        tasks: { 'query-answer': { providerId: 'ollama', model: 'llama3.1:8b' } },
        defaults: {},
      },
      providers: [providerConfig({ id: 'ollama', local: true, hasKey: false })],
      keys: new MemoryKeyStore(),
    });
    expect(gateway.isAvailable('query-answer')).toBe(true);
  });

  it('nimmt nach update() das neue Routing', () => {
    const { gateway } = harness({ routing: { tasks: {}, defaults: {} } });
    expect(gateway.isAvailable('query-answer')).toBe(false);
    gateway.update({
      routing: {
        tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
        defaults: {},
      },
    });
    expect(gateway.isAvailable('query-answer')).toBe(true);
  });
});

describe('RoutingGateway: Ausführung', () => {
  it('gibt Text, Modell, Usage und Latenz zurück', async () => {
    const setup = createFakeGateway({
      fallback: 'Die Antwort.',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
    const result = await setup.gateway.complete(ask);
    expect(result.text).toBe('Die Antwort.');
    expect(result.model).toEqual({ providerId: 'fake-1', model: 'fake-small' });
    expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(setup.provider.lastCall('query-answer')?.model).toBe('fake-small');
  });

  it('streamt Deltas und liefert am Ende den ganzen Text', async () => {
    const setup = createFakeGateway({ fallback: 'abcdefghij', chunkSize: 4 });
    const deltas: string[] = [];
    const result = await setup.gateway.stream(ask, (delta) => deltas.push(delta));
    expect(deltas).toEqual(['abcd', 'efgh', 'ij']);
    expect(result.text).toBe('abcdefghij');
    expect(setup.provider.lastCall()?.streamed).toBe(true);
  });

  it('reicht Schema und Grenzwerte an den Provider durch', async () => {
    const setup = createFakeGateway({ fallback: '{}' });
    await setup.gateway.complete({
      task: 'title-tags',
      messages: [{ role: 'user', content: 'x' }],
      schema: { type: 'object' },
      maxTokens: 200,
      temperature: 0,
    });
    expect(setup.provider.lastCall('title-tags')?.schema).toEqual({ type: 'object' });
  });
});

describe('RoutingGateway: Retry', () => {
  function failingProvider(errors: unknown[]): FakeProvider {
    const provider = new FakeProvider({ fallback: 'endlich' });
    let index = 0;
    const original = provider.complete.bind(provider);
    vi.spyOn(provider, 'complete').mockImplementation(async (call) => {
      const error = errors[index];
      index += 1;
      if (error) throw error;
      return original(call);
    });
    return provider;
  }

  const route: Routing = {
    tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
    defaults: {},
  };

  it('wiederholt bei 429 und liefert danach das Ergebnis', async () => {
    const provider = failingProvider([httpError(429), httpError(503)]);
    const { gateway, sleeps } = harness({ routing: route, provider });
    const result = await gateway.complete(ask);
    expect(result.text).toBe('endlich');
    expect(sleeps).toEqual([1, 2]);
  });

  it('wiederholt bei Netzwerkfehlern', async () => {
    const provider = failingProvider([new TypeError('fetch failed')]);
    const { gateway, sleeps } = harness({ routing: route, provider });
    await expect(gateway.complete(ask)).resolves.toMatchObject({ text: 'endlich' });
    expect(sleeps).toHaveLength(1);
  });

  it('wiederholt nicht bei 400', async () => {
    const provider = failingProvider([httpError(400)]);
    const { gateway, sleeps } = harness({ routing: route, provider });
    await expect(gateway.complete(ask)).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(sleeps).toEqual([]);
  });

  it('gibt nach den erlaubten Versuchen auf und meldet unreachable', async () => {
    const provider = failingProvider([httpError(500), httpError(500), httpError(500)]);
    const { gateway, sleeps } = harness({ routing: route, provider });
    await expect(gateway.complete(ask)).rejects.toMatchObject({ info: { reason: 'unreachable' } });
    expect(sleeps).toHaveLength(2);
  });

  /* 034, D7: llama.cpp is just another `openai-compatible` provider to the
     gateway, so a `llama-server` that was killed (stop pressed, or the
     process died on its own) has to come through this same, generic
     mapping — the story adds no llama.cpp-specific error handling of its
     own (Decisions, Q5). A dead TCP listener surfaces to `fetch` as a
     `TypeError` with an `ECONNREFUSED`/`ECONNRESET`-shaped `code`, exactly
     what Node raises for a refused or reset loopback connection. */
  it('meldet einen abgebrochenen llama.cpp-Prozess als unreachable, nie als Hänger (034, D7)', async () => {
    const connectionGone = (): Error =>
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:11435'), {
        code: 'ECONNREFUSED',
      });
    const provider = failingProvider([connectionGone(), connectionGone(), connectionGone()]);
    const llamaRoute: Routing = {
      tasks: { 'query-answer': { providerId: 'llamacpp', model: 'local-model' } },
      defaults: {},
    };
    const llamaProvider = providerConfig({
      id: 'llamacpp',
      label: 'llama.cpp (lokal)',
      kind: 'openai-compatible',
      local: true,
      hasKey: false,
      baseUrl: 'http://127.0.0.1:11435/v1',
    });
    const { gateway, sleeps } = harness({
      routing: llamaRoute,
      providers: [llamaProvider],
      keys: new MemoryKeyStore(),
      provider,
    });

    const startedAt = Date.now();
    await expect(gateway.complete(ask)).rejects.toMatchObject({
      name: 'LlmUnavailableError',
      info: { reason: 'unreachable' },
    });
    // Bounded: the fake `sleep` never actually waits, and every attempt here
    // fails synchronously — a real hang would not finish within a test
    // timeout at all, let alone within one second of wall-clock time.
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(sleeps).toHaveLength(2);
  });

  it('deutet 401 als fehlenden Schlüssel', async () => {
    const provider = failingProvider([httpError(401)]);
    const { gateway } = harness({ routing: route, provider });
    await expect(gateway.complete(ask)).rejects.toMatchObject({ info: { reason: 'no-key' } });
  });

  it('wiederholt einen Stream nicht, wenn schon Text beim Aufrufer war', async () => {
    const provider = new FakeProvider({ fallback: 'egal' });
    vi.spyOn(provider, 'stream').mockImplementation(async (_call, onDelta) => {
      onDelta('Anf');
      throw httpError(503);
    });
    const { gateway, sleeps } = harness({ routing: route, provider });
    const deltas: string[] = [];
    await expect(gateway.stream(ask, (delta) => deltas.push(delta))).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(deltas).toEqual(['Anf']);
    expect(sleeps).toEqual([]);
  });
});

describe('RoutingGateway: Abbruch und Timeout', () => {
  const route: Routing = {
    tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
    defaults: {},
  };

  it('bricht sofort ab, wenn das Signal schon abgebrochen ist', async () => {
    const provider = new FakeProvider({ fallback: 'nie' });
    const { gateway } = harness({ routing: route, provider });
    const controller = new AbortController();
    controller.abort();
    await expect(gateway.complete({ ...ask, signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(provider.callCount).toBe(0);
  });

  it('bricht einen laufenden Aufruf ab, ohne zu wiederholen', async () => {
    const provider = new FakeProvider({ fallback: 'nie', latencyMs: 50 });
    const { gateway, sleeps } = harness({ routing: route, provider });
    const controller = new AbortController();
    const pending = gateway.complete({ ...ask, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(sleeps).toEqual([]);
    expect(provider.callCount).toBe(1);
  });

  it('meldet eine Zeitüberschreitung als unreachable', async () => {
    const provider = new FakeProvider({ fallback: 'zu spät', latencyMs: 40 });
    const { gateway } = harness({ routing: route, provider, timeoutMs: 5, retries: 0 });
    await expect(gateway.complete(ask)).rejects.toMatchObject({
      info: { reason: 'unreachable', detail: 'Zeitüberschreitung nach 5 ms.' },
    });
  });
});

describe('RoutingGateway: Schlüssel bleiben unsichtbar', () => {
  const key = 'sk-ant-super-geheim-abcdef123456';

  it('nennt den Schlüssel nicht, wenn der Dienst ihn in der Fehlerantwort spiegelt', async () => {
    const provider = new FakeProvider({});
    vi.spyOn(provider, 'complete').mockRejectedValue(
      httpError(400, `Ungültiger Schlüssel ${key} für dieses Modell.`),
    );
    const { gateway } = harness({
      routing: {
        tasks: { 'query-answer': { providerId: 'cloud', model: 'gpt-4o' } },
        defaults: {},
      },
      keys: new MemoryKeyStore({ cloud: key }),
      provider,
    });

    const error = await gateway.complete(ask).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmUnavailableError);
    const dump = `${(error as Error).message} ${JSON.stringify(error)} ${JSON.stringify((error as LlmUnavailableError).info)}`;
    expect(dump).not.toContain(key);
    expect(dump).not.toContain('super-geheim');
    expect(dump).toContain('***');
  });
});
