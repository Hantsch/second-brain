/* Erkennung lokaler LLM-Runtimes.

   Der Nutzer, der noch kein Modell hat, soll nicht raten müssen, ob auf seinem
   Rechner schon eines läuft. Deshalb fragt die Einstellung die Adressen der
   lokalen Vorlagen (Ollama, LM Studio) einmal ab: antwortet `/models`, läuft die
   Runtime — und die Oberfläche kann konkret werden („3 Modelle gefunden").

   Bewusst keine Nebenwirkung: hier wird nichts angelegt und nichts gespeichert.
   Das Übernehmen als Provider bleibt ein eigener, bestätigter Schritt.

   Ein kurzer Zeitrahmen ist Teil der Sache: ein geschlossener Port antwortet
   sofort, ein stiller Host würde die Einstellung sonst sekundenlang aufhalten. */

import { OpenAiCompatibleProvider, PROVIDER_PRESETS } from '@core/llm';
import type { FetchLike } from '@core/llm';
import type { IpcResponse } from '@shared/ipc';
import type { ProviderConfig } from '@shared/types';

export type LocalRuntime = IpcResponse<'llm:detectLocal'>[number];

/** Länger warten wäre für einen Einstiegshinweis nicht angemessen. */
export const DETECT_TIMEOUT_MS = 1500;

export interface DetectOptions {
  /** Injizierbar, damit Tests nie ins Netz gehen. */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

/** `fetch` mit Zeitgrenze — ohne sie hängt ein stiller Host die Abfrage auf. */
function timedFetch(timeoutMs: number): FetchLike {
  return (url, init) =>
    fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) });
}

/** Adressvergleich ohne Schrägstrich am Ende und ohne Groß-/Kleinschreibung. */
function sameEndpoint(one: string, other: string): boolean {
  const normalize = (value: string): string => value.trim().replace(/\/+$/, '').toLowerCase();
  return normalize(one) === normalize(other);
}

/**
 * Prüft jede lokale Vorlage. Antwortet eine Adresse nicht, ist das kein Fehler,
 * sondern die Antwort „läuft hier nicht" — die Oberfläche leitet dann an.
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
        /* Geschlossener Port, Zeitüberschreitung, fremde Antwort: alles heißt
           hier dasselbe — auf dieser Adresse läuft nichts, was wir benutzen. */
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
