/* Die HTTP-Grundlage beider echten Provider. Kein SDK, nur `fetch` —
   injiziert, damit Tests niemals ins Netz gehen.

   Regel: Fehlermeldungen nennen den Host und den Status, nie den Schlüssel und
   nie den vollen Antwortrumpf ungeprüft. */

import { hostOf as hostOfUrl } from '@core/text/url';
import { sanitize } from './redact';
import { LlmHttpError, LlmNetworkError, isAbortError, type FetchLike } from './types';

export interface HttpContext {
  fetchImpl: FetchLike;
  /** Schlüssel dieses Providers — wird aus jedem Fehlertext entfernt. */
  secret?: string | null;
}

/** Nur der Host, damit kein Query-Parameter (und damit kein Schlüssel) im Log landet. */
export function hostOf(url: string): string {
  return hostOfUrl(url, 'unbekanntem Host');
}

/** Basis-URL ohne Schrägstrich am Ende, damit `join` nicht doppelt trennt. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Führt eine Anfrage aus und wirft bei allem außer 2xx `LlmHttpError`
 * (mit Status, damit das Gateway über den Retry entscheiden kann).
 */
export async function request(url: string, init: RequestInit, ctx: HttpContext): Promise<Response> {
  let response: Response;
  try {
    response = await ctx.fetchImpl(url, init);
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new LlmNetworkError(`Verbindung zu ${hostOf(url)} fehlgeschlagen.`, { cause: error });
  }
  if (!response.ok) {
    const body = await readTextSafely(response);
    throw new LlmHttpError(
      response.status,
      `${hostOf(url)} antwortete mit HTTP ${response.status}.`,
      sanitize(body, ctx.secret),
    );
  }
  return response;
}

/** Antwort als JSON lesen. Ein kaputter Rumpf ist ein Fehler, aber kein Retry-Grund. */
export async function requestJson<T>(url: string, init: RequestInit, ctx: HttpContext): Promise<T> {
  const response = await request(url, init, ctx);
  const text = await readTextSafely(response);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${hostOf(url)} lieferte keine JSON-Antwort.`);
  }
}

/** Fehlertext für Probe und Logs — Status plus (bereits bereinigter) Rumpf. */
export function describeError(error: unknown): string {
  if (error instanceof LlmHttpError) return `${error.message} ${error.body ?? ''}`.trim();
  if (error instanceof Error) return error.message;
  return 'Unbekannter Fehler.';
}

async function readTextSafely(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
