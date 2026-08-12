/* Detection of local LLM runtimes.

   A user who doesn't have a model yet shouldn't have to guess whether one
   is already running on their machine. So the settings screen queries the
   addresses of the local presets (Ollama, LM Studio) once: if `/models`
   answers, the runtime is running — and the UI can get concrete ("3 models
   found").

   Deliberately no side effect: nothing gets created or saved here. Adopting
   it as a provider remains its own, confirmed step.

   A short timeout is part of the design: a closed port answers instantly,
   while a silent host would otherwise stall the settings screen for
   seconds. */

import { OpenAiCompatibleProvider, PROVIDER_PRESETS } from '@core/llm';
import type { FetchLike } from '@core/llm';
import type { IpcResponse } from '@shared/ipc';
import type { ProviderConfig } from '@shared/types';

export type LocalRuntime = IpcResponse<'llm:detectLocal'>[number];

/** Waiting longer wouldn't be appropriate for an onboarding hint. */
export const DETECT_TIMEOUT_MS = 1500;

export interface DetectOptions {
  /** Injectable, so tests never hit the network. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** `fetch` with a timeout — without it, a silent host would hang the request. */
function timedFetch(timeoutMs: number): FetchLike {
  return (url, init) =>
    fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Address comparison ignoring a trailing slash and case. */
function sameEndpoint(one: string, other: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();
  return normalize(one) === normalize(other);
}

/**
 * Checks every local preset. If an address doesn't answer, that's not an
 * error but the answer "not running here" — the UI then directs the user
 * onward.
 */
export async function detectLocalRuntimes(
  providers: readonly ProviderConfig[],
  options: DetectOptions = {},
): Promise<LocalRuntime[]> {
  const fetchImpl = options.fetchImpl ?? timedFetch(options.timeoutMs ?? DETECT_TIMEOUT_MS);
  const local = PROVIDER_PRESETS.filter((preset) => preset.local);

  return Promise.all(
    local.map(async (preset) => {
      const runtime = new OpenAiCompatibleProvider({ baseUrl: preset.baseUrl, fetchImpl });
      let models: string[] = [];
      let running = false;
      try {
        models = await runtime.listModels();
        running = true;
      } catch {
        /* Closed port, timeout, unexpected response: they all mean the same
           thing here — nothing we can use is running at this address. */
      }
      return {
        presetId: preset.id,
        label: preset.label,
        baseUrl: preset.baseUrl,
        running,
        models,
        configured: providers.some((provider) => sameEndpoint(provider.baseUrl, preset.baseUrl)),
      };
    }),
  );
}
