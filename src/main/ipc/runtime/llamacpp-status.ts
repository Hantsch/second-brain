/* llama.cpp's status (033, D7) — the third of the three `LocalRuntimeStatus`
 * values, `'running'`, that D6's `llamacpp-install.ts` could not yet answer
 * on its own. D6 already knows whether the binary is on disk (`status`
 * called that "absent" or "installed-stopped"); this module adds the one
 * fact D6 doesn't have: is a server actually answering on the port
 * `llm:startLocalRuntime` starts it on (D9's fixed `--port 8080`, this
 * story's Decision "minimal start belongs to this story").
 *
 * Mirrors `llm-detect.ts`'s `probeOllamaEndpoint`: a short-timeout probe
 * against the OpenAI-compatible `/v1/models` endpoint, never throwing — a
 * closed port, a timeout, or an unexpected response all just mean "not
 * running yet", the same way an absent binary means "not installed yet".
 * There is no llama.cpp entry in `PROVIDER_PRESETS` before D9, so the address
 * is the one fixed constant this file owns rather than reading a preset that
 * doesn't exist yet.
 */

import type { FetchLike } from '@core/llm';
import type { LocalRuntimeStatus } from '@shared/types';

/** The port `llm:startLocalRuntime`'s llama.cpp case (D9) starts
    `llama-server` on — fixed and conservative per the story's Decisions,
    not a user setting in this story. */
export const LLAMACPP_SERVER_PORT = 8080;

/** The OpenAI-compatible base URL a running `llama-server` answers on. */
export function llamaCppServerBaseUrl(): string {
  return `http://127.0.0.1:${LLAMACPP_SERVER_PORT}`;
}

/** How long the reachability probe waits before treating a silent host as
    "not running" — short enough not to stall a settings screen, the same
    reasoning `llm-detect.ts`'s `DETECT_TIMEOUT_MS` uses. */
export const LLAMACPP_PROBE_TIMEOUT_MS = 1500;

export interface LlamaCppStatusDeps {
  /** Required, deliberately: this module never falls back to the real global
      `fetch` on its own. `llamacpp-install.ts` only passes a probe at all
      once it has a `fetchImpl` to give it (wired explicitly in
      `register-all.ts` for production); a caller that supplies none gets
      `detectLlamaCppStatus`'s presence-only answer instead — never a stray
      network attempt from an unconfigured default. */
  fetchImpl: FetchLike;
  timeoutMs?: number;
}

/** `fetch` with a timeout — without one, a silent host would hang the probe
    instead of answering "not running". */
function timedFetch(fetchImpl: FetchLike, timeoutMs: number): FetchLike {
  return (url, init) =>
    fetchImpl(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Is a llama.cpp server answering right now? Any failure — closed port,
    timeout, non-2xx, a host that isn't llama.cpp at all — degrades to
    "not reachable", never a thrown error. */
async function probeLlamaCppServer(deps: LlamaCppStatusDeps): Promise<boolean> {
  const fetchImpl = timedFetch(deps.fetchImpl, deps.timeoutMs ?? LLAMACPP_PROBE_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${llamaCppServerBaseUrl()}/v1/models`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

/** Builds the probe `detectLlamaCppStatus` calls, closing over `deps` — kept
    separate from that function so a caller that has no `fetchImpl` to give
    can pass no probe at all rather than reaching for a default this module
    doesn't offer. */
export function llamaCppServerProbe(deps: LlamaCppStatusDeps): () => Promise<boolean> {
  return () => probeLlamaCppServer(deps);
}

/**
 * Binary presence (the caller's own fact — `llamacpp-install.ts` already
 * knows it from `engine-fs.ts`) plus an optional reachability probe →
 * one of the three `LocalRuntimeStatus` values. An absent binary is reported
 * without probing the server at all: a port that happens to answer for some
 * unrelated reason must never be read as "llama.cpp is running" when the
 * engine isn't even installed. No `probe` at all (rather than a default one)
 * answers `'installed-stopped'` for an installed binary — the same honest,
 * presence-only answer this runtime gave before this module existed.
 */
export async function detectLlamaCppStatus(
  binaryInstalled: boolean,
  probe?: () => Promise<boolean>,
): Promise<LocalRuntimeStatus> {
  if (!binaryInstalled) return 'absent';
  if (!probe) return 'installed-stopped';
  return (await probe()) ? 'running' : 'installed-stopped';
}
