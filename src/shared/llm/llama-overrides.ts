/**
 * Validation for the advanced start-plan overrides (034, Decisions Q1):
 * `machine.llamaOverrides.gpuLayers` / `.contextTokens`, entered by hand
 * behind the llama.cpp card's "advanced" disclosure.
 *
 * Unlike the VRAM override (`vram-override.ts`) and the resource budget
 * (`resource-budget.ts`), there is deliberately no upper ceiling here:
 * `planLlamaStart`'s own `clamp` (`src/core/llm/llama-args.ts`) already keeps
 * a too-large hand-typed number from reaching `argv` — duplicating that
 * ceiling on this side of the IPC boundary would be a second guess that
 * could disagree with the first. The one thing worth rejecting before a
 * value ever reaches the write is one that isn't a plausible count at all:
 * empty, not a number, fractional, or negative.
 *
 * Lives in `src/shared/` rather than `src/core/`, like the other two
 * override-input modules, so the renderer can run the exact same rule main
 * does before a value ever crosses the IPC boundary.
 */

export type LlamaOverrideParseError = 'empty' | 'not-a-number' | 'negative';

export type LlamaOverrideParseResult =
  { ok: true; value: number } | { ok: false; error: LlamaOverrideParseError };

/** Parses a hand-typed layer count or context size. Never throws. */
export function parseLlamaOverrideInt(raw: string): LlamaOverrideParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { ok: false, error: 'not-a-number' };
  if (!Number.isInteger(parsed)) return { ok: false, error: 'not-a-number' };
  if (parsed < 0) return { ok: false, error: 'negative' };

  return { ok: true, value: parsed };
}

/** Pure numeric check for the same rule, for use at the IPC boundary in main. */
export function isValidLlamaOverrideValue(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}
