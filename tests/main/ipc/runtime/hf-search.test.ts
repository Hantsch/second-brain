/* `llm:searchModelFiles` (033, D8) — through an injected fake `fetch`, never
 * the real network.
 *
 * Checked, per the deliverable's acceptance criteria:
 *   - a `search` step returns D3's `HfModelSearchOutcome`, tagged `step: 'search'`;
 *   - a `files` step returns D3's `HfFileListOutcome`, tagged `step: 'files'`;
 *   - a network failure comes back as `reason: 'network-error'`, not a thrown
 *     error reaching the IPC boundary;
 *   - a gated repository (401/403) comes back as `reason: 'gated'`;
 *   - no log line — success or failure — ever contains the raw query string
 *     or a full request URL (guardrail 6: no user content in a log line).
 */

import { describe, expect, it, vi } from 'vitest';
import { hfSearchHandlers } from '../../../../src/main/ipc/runtime/hf-search';
import type { FetchLike } from '../../../../src/core/llm';
import type { Services } from '../../../../src/main/services';

/* The registry this handler map is built through imports `ipcMain`; the
   handler itself never touches it, but the module graph does. */
vi.mock('electron', () => ({
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  app: { getPath: () => '/never-used' },
}));

const fakeServices = {} as unknown as Services;

interface ResponseSpec {
  status?: number;
  body?: unknown;
  throws?: boolean;
}

/** A fake `fetch` that records every URL it was called with, so a test can
    assert on what request was made without ever making one. */
function scriptedFetch(spec: ResponseSpec): { fetchImpl: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(String(url));
    if (spec.throws) throw new Error('ECONNREFUSED');
    const status = spec.status ?? 200;
    return {
      ok: status < 400,
      status,
      json: async () => spec.body ?? [],
    } as unknown as Response;
  };
  return { fetchImpl, calls };
}

function handlerFor(spec: ResponseSpec) {
  const fetch = scriptedFetch(spec);
  const handlers = hfSearchHandlers(fakeServices, { fetchImpl: fetch.fetchImpl });
  const handler = handlers['llm:searchModelFiles'];
  if (!handler) throw new Error('llm:searchModelFiles not registered');
  return { handler, calls: fetch.calls };
}

describe('hf-search — search step', () => {
  it('returns D3’s result, tagged with the step', async () => {
    const { handler } = handlerFor({
      body: [{ id: 'unsloth/qwen2.5-1.5b-gguf', downloads: 10, likes: 2, tags: ['gguf'] }],
    });

    const response = await handler({ step: 'search', query: 'qwen' });

    expect(response).toEqual({
      step: 'search',
      ok: true,
      results: [{ id: 'unsloth/qwen2.5-1.5b-gguf', downloads: 10, likes: 2, tags: ['gguf'] }],
    });
  });

  it('surfaces a network failure as an honest reason instead of throwing', async () => {
    const { handler } = handlerFor({ throws: true });

    const response = await handler({ step: 'search', query: 'qwen' });

    expect(response).toEqual({ step: 'search', ok: false, reason: 'network-error' });
  });

  it('surfaces a gated repository (401) as its own honest reason', async () => {
    const { handler } = handlerFor({ status: 401 });

    const response = await handler({ step: 'search', query: 'qwen' });

    expect(response).toEqual({ step: 'search', ok: false, reason: 'gated' });
  });
});

describe('hf-search — files step', () => {
  it('returns D3’s file list, tagged with the step', async () => {
    const { handler, calls } = handlerFor({
      body: [{ type: 'file', path: 'Q4_K_M/model.Q4_K_M.gguf', size: 42 }],
    });

    const response = await handler({ step: 'files', modelId: 'unsloth/qwen2.5-1.5b-gguf' });

    expect(response.step).toBe('files');
    expect(response).toMatchObject({ ok: true });
    expect(calls[0]).toContain('unsloth/qwen2.5-1.5b-gguf');
  });

  it('surfaces a network failure as an honest reason instead of throwing', async () => {
    const { handler } = handlerFor({ throws: true });

    const response = await handler({ step: 'files', modelId: 'unsloth/qwen2.5-1.5b-gguf' });

    expect(response).toEqual({ step: 'files', ok: false, reason: 'network-error' });
  });

  it('surfaces a gated repository (403) as its own honest reason', async () => {
    const { handler } = handlerFor({ status: 403 });

    const response = await handler({ step: 'files', modelId: 'unsloth/qwen2.5-1.5b-gguf' });

    expect(response).toEqual({ step: 'files', ok: false, reason: 'gated' });
  });
});

describe('hf-search — guardrail 6, no user content in a log line', () => {
  it('never logs the query or a full URL, on success or on any failure path', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const secretQuery = 'my-very-specific-search-query-should-never-be-logged';

      await handlerFor({
        body: [{ id: 'a/b', downloads: null, likes: null, tags: [] }],
      }).handler({ step: 'search', query: secretQuery });
      await handlerFor({ throws: true }).handler({ step: 'search', query: secretQuery });
      await handlerFor({ status: 401 }).handler({ step: 'search', query: secretQuery });
      await handlerFor({ status: 403 }).handler({
        step: 'files',
        modelId: 'gated/repo-id',
      });

      const allLoggedText = [...consoleSpy.mock.calls, ...warnSpy.mock.calls]
        .flat()
        .map((arg) => String(arg))
        .join('\n');

      expect(allLoggedText).not.toContain(secretQuery);
      expect(allLoggedText).not.toContain('huggingface.co');
    } finally {
      consoleSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
