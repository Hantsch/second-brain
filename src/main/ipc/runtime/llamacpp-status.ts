/* llama.cpp's reachability probe (033, D7; port range 034, D3) — the third of
 * the three `LocalRuntimeStatus` values, `'running'`, that `llamacpp-install.ts`
 * could not answer on its own. That file already knows whether the binary is on
 * disk ("absent" or "installed-stopped"); this module adds the one fact it
 * doesn't have: is a server actually answering on one of the ports the app
 * starts `llama-server` on?
 *
 * Until 034 that was the single fixed port 8080. Since 034 the app derives the
 * port from the range Decisions Q3 names (11435–11444, deliberately adjacent to
 * Ollama's 11434 rather than llama-server's crowded 8080), so this probe scans
 * that range instead — otherwise the generic `llm:localRuntimeStatus` would
 * report "installed, stopped" for an engine this app itself just started on,
 * say, 11437. The range constants live here, in the module without an Electron
 * import, and `llamacpp-lifecycle.ts`/`llamacpp-engine-start.ts` read them from
 * here, so there is exactly one definition of "which ports are ours".
 *
 * A user-started `llama-server` on 8080 is deliberately no longer reported as
 * running: it is not a process this app manages (Q6), and leaving 8080 out of
 * the scan is what keeps it untouched. The one place 8080 still matters is
 * `llamacpp-provider-port.ts`, which recognises it as a *previously adopted*
 * provider address worth rewriting.
 *
 * Mirrors `llm-detect.ts`'s `probeOllamaEndpoint`: a short-timeout probe
 * against the OpenAI-compatible `/v1/models` endpoint, never throwing — a
 * closed port, a timeout, or an unexpected response all just mean "not
 * running yet", the same way an absent binary means "not installed yet".
 */

import type { FetchLike } from '@core/llm';
import type { LocalRuntimeStatus } from '@shared/types';

/** The port range a start (034, D3) probes for a free port and every status
    read probes for a running one (Decisions, Q3). Inclusive on both ends. */
export const LLAMA_PORT_RANGE_START = 11435;
export const LLAMA_PORT_RANGE_END = 11444;

/** How long the reachability probe waits before treating a silent host as
    "not running" — short enough not to stall a settings screen, the same
    reasoning `llm-detect.ts`'s `DETECT_TIMEOUT_MS` uses. Per port: the scan
    below walks the range in order and stops at the first answer, so a machine
    with a running engine pays this at most once. */
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

/** Is a llama.cpp server answering on this port right now? Any failure —
    closed port, timeout, non-2xx, a host that isn't llama.cpp at all —
    degrades to "not reachable", never a thrown error. */
export async function probeLlamaCppPort(
  fetchImpl: FetchLike,
  port: number,
  timeoutMs: number = LLAMACPP_PROBE_TIMEOUT_MS,
): Promise<boolean> {
  const withTimeout = timedFetch(fetchImpl, timeoutMs);
  try {
    const response = await withTimeout(`http://127.0.0.1:${port}/v1/models`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}

/** First port in the range that answers, or `null` if none does. Probed in a
    fixed order, so two identical machines report the same port. */
export async function firstReachableLlamaCppPort(
  fetchImpl: FetchLike,
  timeoutMs?: number,
): Promise<number | null> {
  for (let port = LLAMA_PORT_RANGE_START; port <= LLAMA_PORT_RANGE_END; port += 1) {
    if (await probeLlamaCppPort(fetchImpl, port, timeoutMs)) return port;
  }
  return null;
}

/** Builds the probe `detectLlamaCppStatus` calls, closing over `deps` — kept
    separate from that function so a caller that has no `fetchImpl` to give
    can pass no probe at all rather than reaching for a default this module
    doesn't offer. */
export function llamaCppServerProbe(deps: LlamaCppStatusDeps): () => Promise<boolean> {
  return async () => (await firstReachableLlamaCppPort(deps.fetchImpl, deps.timeoutMs)) !== null;
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
