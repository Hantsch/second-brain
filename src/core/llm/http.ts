/* The HTTP foundation for both real providers. No SDK, just `fetch` —
   injected so tests never hit the network.

   Rule: error messages name the host and the status, never the key, and
   never the full response body unchecked. */

import { hostOf as hostOfUrl } from '@core/text/url';
import { sanitize } from './redact';
import { LlmHttpError, LlmNetworkError, isAbortError, type FetchLike } from './types';

export interface HttpContext {
  fetchImpl: FetchLike;
  /** This provider's key — stripped from every error text. */
  secret?: string | null;
}

/** Only the host, so no query parameter (and thus no key) ends up in the log. */
export function hostOf(url: string): string {
  return hostOfUrl(url, 'unbekanntem Host');
}

/** Base URL without a trailing slash, so `join` doesn't double up the separator. */
export function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Executes a request and throws `LlmHttpError` for anything outside 2xx
 * (with a status, so the gateway can decide whether to retry).
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

/** Read the response as JSON. A broken body is an error, but not a reason to retry. */
export async function requestJson<T>(url: string, init: RequestInit, ctx: HttpContext): Promise<T> {
  const response = await request(url, init, ctx);
  const text = await readTextSafely(response);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${hostOf(url)} lieferte keine JSON-Antwort.`);
  }
}

/** Error text for probing and logs — status plus (already sanitized) body. */
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
