/**
 * Validation for the manually entered VRAM override (028): the number the
 * user types in on the machine card when detection can't read it (Windows'
 * 32-bit `AdapterRAM` lies above 4 GB, see 019a's Done section).
 *
 * Lives in `src/shared/` — like `ipc.ts` — rather than `src/core/`, because
 * `tsconfig.web.json` excludes `src/core` and the renderer needs to run the
 * exact same rule main does before a value ever reaches the IPC boundary.
 *
 * Mapping of rejected input to error key (six input classes, four keys —
 * see 028's D1 for the reasoning):
 * - empty (after trim)                    → 'empty'
 * - not parseable as a number              → 'not-a-number'
 * - fractional (not an integer)            → 'not-a-number' (not a whole MB figure)
 * - zero, negative, or below the floor     → 'not-positive' (not a plausible positive value)
 * - above the ceiling                      → 'too-large'
 */

/** 256 MB: the lowest VRAM figure any GPU worth detecting would report. */
export const VRAM_OVERRIDE_MIN_MB = 256;
/** 262144 MB = 256 GB: comfortably above any shipping consumer or datacenter card. */
export const VRAM_OVERRIDE_MAX_MB = 262144;

/* GB is purely the presentation unit the field shows and accepts (035, D3) —
   the stored value stays MB. Bounds are derived from the MB constants above
   rather than a second independent pair of numbers, so they can't drift. */
/** 0.25 GB, i.e. `VRAM_OVERRIDE_MIN_MB` expressed in GB. */
export const VRAM_OVERRIDE_MIN_GB = VRAM_OVERRIDE_MIN_MB / 1024;
/** 256 GB, i.e. `VRAM_OVERRIDE_MAX_MB` expressed in GB. */
export const VRAM_OVERRIDE_MAX_GB = VRAM_OVERRIDE_MAX_MB / 1024;

export type VramOverrideParseError = 'empty' | 'not-a-number' | 'not-positive' | 'too-large';

export type VramOverrideParseResult =
  { ok: true; valueMb: number } | { ok: false; error: VramOverrideParseError };

/** Parses and validates a VRAM override entered as text. Never throws. */
export function parseVramOverrideMb(raw: string): VramOverrideParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return { ok: false, error: 'not-a-number' };
  if (!Number.isInteger(parsed)) return { ok: false, error: 'not-a-number' };

  if (parsed < VRAM_OVERRIDE_MIN_MB) return { ok: false, error: 'not-positive' };
  if (parsed > VRAM_OVERRIDE_MAX_MB) return { ok: false, error: 'too-large' };

  return { ok: true, valueMb: parsed };
}

/**
 * Parses and validates a VRAM override entered as text in GB (035, D3): the
 * field's presentation unit, converted at its edge — the result is still MB,
 * the unit the rest of the app (and settings storage) speaks. Accepts both
 * `,` and `.` as the decimal separator (German and English keyboards alike).
 * Fractional input is expected here (e.g. `12,5`), unlike the whole-MB rule
 * `parseVramOverrideMb` applies, so there is no separate "not a whole
 * number" rejection — only "not parseable at all" produces `not-a-number`.
 */
export function parseVramOverrideGb(raw: string): VramOverrideParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: 'empty' };

  const normalized = trimmed.replace(',', '.');
  const parsedGb = Number(normalized);
  if (!Number.isFinite(parsedGb)) return { ok: false, error: 'not-a-number' };

  if (parsedGb < VRAM_OVERRIDE_MIN_GB) return { ok: false, error: 'not-positive' };
  if (parsedGb > VRAM_OVERRIDE_MAX_GB) return { ok: false, error: 'too-large' };

  return { ok: true, valueMb: Math.round(parsedGb * 1024) };
}

/** Pure numeric check for the same rule, for use at the IPC boundary in main. */
export function isValidVramOverrideMb(mb: number): boolean {
  return Number.isInteger(mb) && mb >= VRAM_OVERRIDE_MIN_MB && mb <= VRAM_OVERRIDE_MAX_MB;
}
