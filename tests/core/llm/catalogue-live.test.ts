import { describe, expect, it } from 'vitest';
import { loadCatalogue, loadCatalogueWithLiveData } from '@core/llm';
import type { FetchLike } from '@core/llm';

/** Builds a `Response`-shaped stub good enough for `response.ok`/`.json()`. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

/** Every catalogue id under test follows OpenRouter's "author/slug" shape. */
const KNOWN_ID = 'anthropic/claude-haiku-4-5';

function endpointsUrlFor(id: string): string {
  const [author, slug] = id.split('/');
  return `https://openrouter.ai/api/v1/models/${author}/${slug}/endpoints`;
}

// Each test picks a `now()` far apart from the others (>> any cacheTtlMs used)
// so the module-level cache from a previous test in this file can never be
// mistaken for a live hit — every call below is a deliberate cache miss
// unless a test says otherwise.

describe('loadCatalogueWithLiveData', () => {
  it('prefers live prices and policy over the bundled catalogue', async () => {
    const bundled = loadCatalogue();
    const bundledEntry = bundled.entries.find((e) => e.id === KNOWN_ID);
    expect(bundledEntry).toBeDefined();

    const fetchImpl: FetchLike = async (url) => {
      if (url === 'https://openrouter.ai/api/v1/models') {
        return jsonResponse({
          data: [{ id: KNOWN_ID, pricing: { prompt: '0.000002', completion: '0.00001' } }],
        });
      }
      if (url === endpointsUrlFor(KNOWN_ID)) {
        return jsonResponse({ data: { endpoints: [{ data_policy: { training: true } }] } });
      }
      return jsonResponse({ data: [] });
    };

    const result = await loadCatalogueWithLiveData({
      fetchImpl,
      now: () => new Date(100_000_000),
    });

    expect(result.stale).toBe(false);
    const merged = result.entries.find((e) => e.id === KNOWN_ID);
    expect(merged?.priceInPerMTok).toBe(2);
    expect(merged?.priceOutPerMTok).toBe(10);
    expect(merged?.dataPolicy).toBe('trains');
    // Sanity: the live values actually differ from the bundled ones, so this
    // test would fail if the merge silently kept the bundled data instead.
    expect(merged?.priceInPerMTok).not.toBe(bundledEntry?.priceInPerMTok);
    expect(merged?.dataPolicy).not.toBe(bundledEntry?.dataPolicy);
    // A live-upgraded policy must not keep the bundled source/date paired
    // with the new claim — `sensitive.ts` and the renderer show these two
    // fields verbatim as "which policy it read and when", so a stale
    // source/date next to a fresh `dataPolicy` would misattribute the claim.
    expect(merged?.policySource).not.toBe(bundledEntry?.policySource);
    expect(merged?.policySource).toContain('openrouter.ai');
    expect(merged?.policyReadAt).toBe(new Date(100_000_000).toISOString());
  });

  it('falls back to the bundled catalogue with stale:true when the fetch fails', async () => {
    const bundled = loadCatalogue();
    const fetchImpl: FetchLike = async () => {
      throw new Error('network unreachable');
    };

    const result = await loadCatalogueWithLiveData({
      fetchImpl,
      now: () => new Date(200_000_000),
    });

    expect(result.stale).toBe(true);
    expect(result.entries).toEqual(bundled.entries);
  });

  it('falls back with stale:true when the models endpoint responds non-OK', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({}, false, 503);

    const result = await loadCatalogueWithLiveData({
      fetchImpl,
      now: () => new Date(300_000_000),
    });

    expect(result.stale).toBe(true);
  });

  it('a partial live response only overwrites the fields it carries', async () => {
    const bundled = loadCatalogue();
    const bundledEntry = bundled.entries.find((e) => e.id === KNOWN_ID);
    expect(bundledEntry?.dataPolicy).toBeDefined();

    const fetchImpl: FetchLike = async (url) => {
      if (url === 'https://openrouter.ai/api/v1/models') {
        // Only the input price is reported — no completion price, no policy.
        return jsonResponse({ data: [{ id: KNOWN_ID, pricing: { prompt: '0.000003' } }] });
      }
      if (url === endpointsUrlFor(KNOWN_ID)) {
        // Unexpected/empty shape: "unable to determine" per fetchOpenRouterEndpointPolicy.
        return jsonResponse({ data: { endpoints: [] } });
      }
      return jsonResponse({ data: [] });
    };

    const result = await loadCatalogueWithLiveData({
      fetchImpl,
      now: () => new Date(400_000_000),
    });

    expect(result.stale).toBe(false);
    const merged = result.entries.find((e) => e.id === KNOWN_ID);
    expect(merged?.priceInPerMTok).toBe(3);
    // Untouched bundled fields: output price, policy, its source, and read date.
    expect(merged?.priceOutPerMTok).toBe(bundledEntry?.priceOutPerMTok);
    expect(merged?.dataPolicy).toBe(bundledEntry?.dataPolicy);
    expect(merged?.policySource).toBe(bundledEntry?.policySource);
    expect(merged?.policyReadAt).toBe(bundledEntry?.policyReadAt);
  });

  it('reuses the cached merge within the TTL instead of fetching again', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async (url) => {
      calls += 1;
      if (url === 'https://openrouter.ai/api/v1/models') {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ data: { endpoints: [] } });
    };
    let clock = 500_000_000; // far past any earlier test's `now`, well outside a 60s TTL
    const now = () => new Date(clock);

    await loadCatalogueWithLiveData({ fetchImpl, now, cacheTtlMs: 60_000 });
    const callsAfterFirst = calls;
    expect(callsAfterFirst).toBeGreaterThan(0);

    clock += 1_000; // still within the 60s TTL of the fetch that just happened
    await loadCatalogueWithLiveData({ fetchImpl, now, cacheTtlMs: 60_000 });

    expect(calls).toBe(callsAfterFirst);
  });
});
