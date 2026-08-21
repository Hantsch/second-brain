/* Is a base URL OpenRouter's? Two places need the same answer: the factory
   (which adds the attribution header) and the OpenAI-compatible provider
   (which adds the per-request no-training constraint for sensitive tasks).

   One implementation on purpose: a second, slightly different copy would
   drift, and the drift would show up as a privacy guarantee that quietly
   stopped applying — the same reason `hostOf` in `@core/text/url` exists once. */

const OPENROUTER_HOST = 'openrouter.ai';

/**
 * True only for `openrouter.ai` and its subdomains — never for a host that
 * merely ends in those characters (`notopenrouter.ai`), so no other provider
 * gets an OpenRouter-only body field it doesn't understand.
 *
 * A malformed base URL is `false` rather than a thrown error: this check sits
 * in the path of every provider call.
 */
export function isOpenRouterBaseUrl(baseUrl: string): boolean {
  const host = hostnameOf(baseUrl);
  if (host === null) return false;
  return host === OPENROUTER_HOST || host.endsWith(`.${OPENROUTER_HOST}`);
}

function hostnameOf(baseUrl: string): string | null {
  const text = (baseUrl ?? '').trim();
  if (text.length === 0) return null;
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    // A hand-typed base URL may omit the scheme ("openrouter.ai/api/v1").
    // Such a URL can't be fetched, but guessing `https` here keeps the answer
    // the same as for the fully written form instead of silently dropping the
    // enforcement for a typo.
    try {
      return new URL(`https://${text}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
