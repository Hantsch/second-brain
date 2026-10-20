/**
 * Small text tools for addresses — used by several core modules.
 *
 * `hostOf` used to exist three times in the core (filing, LLM HTTP, URL
 * ingest), each time slightly different. A copy that drifts apart is a bug
 * that only surfaces in an error message the user sees — hence one
 * implementation.
 */

/**
 * The host of a link: without scheme, without `www.`, lowercased, with port.
 *
 * Deliberately just the host: it ends up in reasoning and error messages,
 * and a query parameter could carry a key (guardrail 6).
 *
 * `fallback` applies when nothing host-like is in there. Without `fallback`,
 * the input is returned as-is — it's then the best thing there is to say.
 */
export function hostOf(url: string, fallback?: string): string {
  const text = (url ?? '').trim();
  try {
    return new URL(text).host.replace(/^www\./i, '').toLowerCase();
  } catch {
    if (fallback !== undefined) return fallback;
    // Without a scheme it's not a URL for `new URL`, but often a host anyway.
    const match = /^\/*(?:www\.)?([^/\s?#]+)/i.exec(text);
    return match?.[1]?.toLowerCase() ?? text;
  }
}
