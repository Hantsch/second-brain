import { describe, expect, it } from 'vitest';
import { listHfModelFiles, searchHfModels } from '@core/llm';
import { createFetchFake, jsonResponse, textResponse } from '../../../fakes/llm';

/* Fixtures for the Hugging Face search + file-list functions (033, D3).
   Anonymous access only: no token anywhere in these fixtures, matching the
   Decisions ("Hugging Face access") — a 401/403 must always read as
   `'gated'`, never "wrong key". No test here reaches the network; every
   response comes from the injected `FetchLike` fake already used across
   `tests/core/llm`. */

describe('searchHfModels', () => {
  it('returns parsed hits for a search that finds repositories', async () => {
    const http = createFetchFake([
      jsonResponse([
        { id: 'TheBloke/Qwen2.5-1.5B-Instruct-GGUF', downloads: 12345, likes: 42, tags: ['gguf'] },
      ]),
    ]);

    const result = await searchHfModels(http.fetch, 'qwen2.5 1.5b gguf');

    expect(result).toEqual({
      ok: true,
      results: [
        {
          id: 'TheBloke/Qwen2.5-1.5B-Instruct-GGUF',
          downloads: 12345,
          likes: 42,
          tags: ['gguf'],
        },
      ],
    });
    const [request] = http.calls;
    expect(request?.url).toBe(
      'https://huggingface.co/api/models?search=qwen2.5%201.5b%20gguf&filter=gguf',
    );
    expect(request?.method).toBe('GET');
  });

  it('reports a valid, empty result set as a normal success', async () => {
    const http = createFetchFake([jsonResponse([])]);

    const result = await searchHfModels(http.fetch, 'nothing-matches-this');

    expect(result).toEqual({ ok: true, results: [] });
  });

  it('fills missing downloads/likes/tags with null/empty rather than guessing', async () => {
    const http = createFetchFake([jsonResponse([{ id: 'author/repo' }])]);

    const result = await searchHfModels(http.fetch, 'repo');

    expect(result).toEqual({
      ok: true,
      results: [{ id: 'author/repo', downloads: null, likes: null, tags: [] }],
    });
  });

  it('reports a gated/401 repository as reason "gated", not a generic error', async () => {
    const http = createFetchFake([textResponse('Unauthorized', 401)]);

    const result = await searchHfModels(http.fetch, 'private-repo');

    expect(result).toEqual({ ok: false, reason: 'gated' });
  });

  it('reports a 403 the same way as a 401', async () => {
    const http = createFetchFake([textResponse('Forbidden', 403)]);

    const result = await searchHfModels(http.fetch, 'private-repo');

    expect(result).toEqual({ ok: false, reason: 'gated' });
  });

  it('reports a rejected fetch as "network-error", never a thrown exception', async () => {
    const fetchImpl = async () => {
      throw new Error('getaddrinfo ENOTFOUND huggingface.co');
    };

    const result = await searchHfModels(fetchImpl, 'anything');

    expect(result).toEqual({ ok: false, reason: 'network-error' });
  });

  it('reports an unexpected non-2xx response as "error"', async () => {
    const http = createFetchFake([textResponse('Internal Server Error', 500)]);

    const result = await searchHfModels(http.fetch, 'anything');

    expect(result).toEqual({ ok: false, reason: 'error' });
  });
});

describe('listHfModelFiles', () => {
  it('filters a mixed repository tree down to .gguf files only', async () => {
    const http = createFetchFake([
      jsonResponse([
        { type: 'file', path: 'README.md', size: 512 },
        { type: 'file', path: 'model-q4_k_m.gguf', size: 900_000_000 },
        { type: 'file', path: 'model.safetensors', size: 3_000_000_000 },
        { type: 'directory', path: 'subdir' },
        { type: 'file', path: 'model-q8_0.gguf', size: 1_500_000_000 },
      ]),
    ]);

    const result = await listHfModelFiles(http.fetch, 'TheBloke/Example-GGUF');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((f) => f.path)).toEqual(['model-q4_k_m.gguf', 'model-q8_0.gguf']);
    expect(result.files[0]).toEqual({
      path: 'model-q4_k_m.gguf',
      sizeBytes: 900_000_000,
      quantisation: 'Q4_K_M',
      downloadUrl: 'https://huggingface.co/TheBloke/Example-GGUF/resolve/main/model-q4_k_m.gguf',
    });
    const [request] = http.calls;
    expect(request?.url).toBe('https://huggingface.co/api/models/TheBloke/Example-GGUF/tree/main');
  });

  it('reports a repository with no files at all as a normal empty success', async () => {
    const http = createFetchFake([jsonResponse([])]);

    const result = await listHfModelFiles(http.fetch, 'author/empty-repo');

    expect(result).toEqual({ ok: true, files: [] });
  });

  it('reports a gated/401 repository as reason "gated"', async () => {
    const http = createFetchFake([textResponse('Unauthorized', 401)]);

    const result = await listHfModelFiles(http.fetch, 'author/private-repo');

    expect(result).toEqual({ ok: false, reason: 'gated' });
  });

  it('reports a rejected fetch as "network-error"', async () => {
    const fetchImpl = async () => {
      throw new Error('connect ECONNREFUSED');
    };

    const result = await listHfModelFiles(fetchImpl, 'author/repo');

    expect(result).toEqual({ ok: false, reason: 'network-error' });
  });
});
