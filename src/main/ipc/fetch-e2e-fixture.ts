/* Env-gated offline fetch seam for the e2e suite (064, D6).
 *
 * AC1-AC3 ("a fetched page that yields nothing says so", "a duplicate can be
 * ingested again") need a real `SourceIngestor` run against a real page — one
 * with too little text, and one with plenty. The suite's own `noNetworkCalls`
 * guard (`fixtures/app.ts`) forbids any real HTTP request, so there is no way
 * to drive that through the actual `ingest:start` → `fetchPage` path without a
 * substitute `fetch`.
 *
 * `SB_E2E_FETCH_FIXTURE` mirrors `SB_E2E_TASKS_FIXTURE`'s seam shape
 * (`tasks-e2e-fixture.ts`): a single env var, read with a guard that never
 * throws, unset means zero behaviour change — not even a file read, and
 * `environment()` (`ipc/ingest.ts`) keeps handing jobs the real global
 * `fetch`. Set, it names a JSON manifest file mapping request URLs to a canned
 * HTML body read from a local fixture file — no socket, no HTTP server, only
 * `readFileSync` and an in-memory `Response`.
 */

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { FetchLike } from '@core/ingest';

const ENV_VAR = 'SB_E2E_FETCH_FIXTURE';

/** One entry of the manifest: a fixed request URL and the file that answers it. */
export interface FetchFixtureResponse {
  url: string;
  /** Path to the fixture HTML file — absolute, or resolved against the manifest's own directory. */
  file: string;
  contentType?: string;
  status?: number;
}

export interface FetchFixtureManifest {
  responses: FetchFixtureResponse[];
}

/**
 * Reads and parses the manifest at `manifestPath`. `null` on any failure
 * (missing file, invalid JSON, wrong shape) rather than a throw — a broken
 * fixture must not take the whole job down with a stack trace nobody in a
 * real session would ever see; it simply behaves as "no fixture configured".
 */
function loadManifest(manifestPath: string): FetchFixtureManifest | null {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as FetchFixtureManifest).responses)
    ) {
      return null;
    }
    return parsed as FetchFixtureManifest;
  } catch {
    return null;
  }
}

function bodyFor(entry: FetchFixtureResponse, manifestDir: string): string {
  const file = isAbsolute(entry.file) ? entry.file : resolve(manifestDir, entry.file);
  return readFileSync(file, 'utf8');
}

/**
 * A `FetchLike` built from `SB_E2E_FETCH_FIXTURE`'s manifest, or `undefined`
 * when the variable is unset or the manifest can't be read — meaning "use the
 * real fetch". Read fresh on every call, the same choice `environment()`
 * makes for `ytdlpCache.path`: nothing here is cached across jobs.
 *
 * A request whose URL isn't in the manifest answers 404 rather than throwing
 * — the honest shape of "this fixture wasn't told about that URL", which
 * `fetchPage` (`core/ingest/url.ts`) already turns into an `io` error via
 * `!response.ok`.
 */
export function fetchFixtureFor(): FetchLike | undefined {
  const manifestPath = process.env[ENV_VAR];
  if (manifestPath === undefined || manifestPath.trim().length === 0) return undefined;
  const manifest = loadManifest(manifestPath);
  if (manifest === null) return undefined;
  const manifestDir = dirname(manifestPath);

  return async (url: string): Promise<Response> => {
    const entry = manifest.responses.find((candidate) => candidate.url === url);
    if (entry === undefined) {
      return new Response('', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const response = new Response(bodyFor(entry, manifestDir), {
      status: entry.status ?? 200,
      headers: { 'content-type': entry.contentType ?? 'text/html; charset=utf-8' },
    });
    // `Response.url` is read-only on the real class; the fixture's own
    // request URL is the honest value here, same trick `fakeFetch`
    // (`tests/core/ingest/fakes.ts`) uses for its own scripted responses.
    Object.defineProperty(response, 'url', { value: entry.url });
    return response;
  };
}
