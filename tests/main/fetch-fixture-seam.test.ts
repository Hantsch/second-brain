/* The `SB_E2E_FETCH_FIXTURE` seam (064, D6): `environment()` (`ipc/ingest.ts`)
   picks `fetchFixtureFor() ?? fetch`, so without the variable a job must get
   the real global `fetch`, unchanged from before this seam existed. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const FETCH_FIXTURE_ENV = 'SB_E2E_FETCH_FIXTURE';

describe('the fetch-fixture seam (SB_E2E_FETCH_FIXTURE)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sb-fetch-fixture-'));
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('without the env var no fixture fetch is wired', async () => {
    vi.stubEnv(FETCH_FIXTURE_ENV, undefined);
    const { fetchFixtureFor } = await import('../../src/main/ipc/fetch-e2e-fixture');

    expect(fetchFixtureFor()).toBeUndefined();
  });

  it('set, but the manifest file is missing: reads as no fixture instead of throwing', async () => {
    vi.stubEnv(FETCH_FIXTURE_ENV, join(tempDir, 'does-not-exist.json'));
    const { fetchFixtureFor } = await import('../../src/main/ipc/fetch-e2e-fixture');

    expect(fetchFixtureFor()).toBeUndefined();
  });

  it('set, with a matching manifest: the fixture answers the scripted URL offline', async () => {
    const pageFile = join(tempDir, 'page.html');
    await writeFile(pageFile, '<html><body><h1>Fixture page</h1></body></html>', 'utf8');
    const manifestFile = join(tempDir, 'manifest.json');
    await writeFile(
      manifestFile,
      JSON.stringify({
        responses: [
          {
            url: 'https://example.test/page',
            file: 'page.html',
            contentType: 'text/html; charset=utf-8',
            status: 200,
          },
        ],
      }),
      'utf8',
    );
    vi.stubEnv(FETCH_FIXTURE_ENV, manifestFile);
    const { fetchFixtureFor } = await import('../../src/main/ipc/fetch-e2e-fixture');

    const fetchImpl = fetchFixtureFor();
    expect(fetchImpl).toBeDefined();
    const response = await fetchImpl!('https://example.test/page');
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toContain('Fixture page');
  });

  it('set, with an unscripted URL: answers 404 instead of throwing', async () => {
    const manifestFile = join(tempDir, 'manifest.json');
    await writeFile(manifestFile, JSON.stringify({ responses: [] }), 'utf8');
    vi.stubEnv(FETCH_FIXTURE_ENV, manifestFile);
    const { fetchFixtureFor } = await import('../../src/main/ipc/fetch-e2e-fixture');

    const fetchImpl = fetchFixtureFor();
    const response = await fetchImpl!('https://example.test/unscripted');
    expect(response.ok).toBe(false);
    expect(response.status).toBe(404);
  });
});
