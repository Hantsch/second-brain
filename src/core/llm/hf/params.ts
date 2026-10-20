/* Parameter count parsed out of the GGUF filename, not fetched — the same
   reasoning as `./quant.ts`: the filename is the only source that needs no
   extra request, and 033 persists no metadata catalog to ask instead. Pure,
   no I/O. Feeds `LlamaModelFile.paramsB` (034, D2) when the caller has
   nothing better, which `llama-args.ts`'s `estimateTotalLayers` then turns
   into a layer count. */

/**
 * Matches the community naming convention for parameter counts: a number
 * (optionally with a decimal point) directly followed by `b`/`B`, e.g. `7b`,
 * `1.5B`, `13b`. `\b` boundaries on both sides stop it from matching inside
 * an unrelated run of digits/letters (a quantisation token never ends in a
 * bare `b`, so this does not collide with `parseQuantisation`).
 */
const PARAMS_PATTERN = /\b(\d+(?:\.\d+)?)b\b/i;

/**
 * Extracts the parameter count in billions from a GGUF filename, e.g.
 * `llama-3-8b-instruct-q4_k_m.gguf` → `8`, `qwen2.5-1.5b-instruct.gguf` →
 * `1.5`. Returns `null` (not a throw) when the filename carries no
 * recognisable token — an unparseable name is an honest "unknown", not a bug.
 */
export function parseParamsB(filename: string): number | null {
  const match = PARAMS_PATTERN.exec(filename);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
