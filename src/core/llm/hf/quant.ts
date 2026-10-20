/* Quantisation is parsed out of the GGUF filename, not fetched (Decisions:
   "Quantisation") — the filename is the only source that needs no extra
   request, and it is the whole point of this runtime (choosing GPU offload +
   context needs knowing which quant a file is). Pure, no I/O. */

/**
 * Matches the community naming conventions actually used in GGUF uploads:
 * `Q<n>_K`, `Q<n>_K_<S|M|L>`, `Q<n>_<digit>` (llama.cpp's `k-quants` and
 * legacy quants), `IQ<n>_<suffix>` (the newer "importance quant" family), and
 * the unquantised float formats `F16`/`F32`/`BF16` that still show up as a
 * baseline upload next to the quantised ones.
 *
 * Case-insensitive: filenames vary between `Q4_K_M` and `q4_k_m`. `\b` word
 * boundaries stop it from matching inside an unrelated run of digits/letters.
 */
const QUANT_PATTERN = /\b(IQ[1-4]_[A-Z0-9]+|Q[2-8](?:_K(?:_[SML])?|_\d)?|BF16|F16|F32)\b/i;

/**
 * Extracts the quantisation token from a GGUF filename, e.g.
 * `qwen2.5-1.5b-instruct-q4_k_m.gguf` → `"Q4_K_M"`. Returns `undefined` (not
 * a throw) when the filename carries no recognisable token — an unparseable
 * name is an honest "unknown", not a bug.
 */
export function parseQuantisation(filename: string): string | undefined {
  const match = QUANT_PATTERN.exec(filename);
  const token = match?.[1];
  return token ? token.toUpperCase() : undefined;
}
