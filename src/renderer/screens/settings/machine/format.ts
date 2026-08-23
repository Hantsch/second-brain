/* Shared display helpers for the machine card's sections (035, D7). Split out
   of the single `MachineCard.tsx` because `MachineFactsList`, `VramRow` and
   the shell all need the same MB→display conversion and the same budgeted-
   figure note — duplicating them per section would let the two edges (GB
   presentation vs. MB storage) drift apart. */

import type { UiLanguage } from '@shared/types';
import type { Vars } from '../../../i18n';
import { formatBytes, formatNumber, locale } from '../../../lib/format';

/** MB facts render through the same compact unit convention as file sizes. */
export function mb(value: number | null, language: UiLanguage): string | null {
  return value === null ? null : formatBytes(value * 1024 * 1024, language);
}

/**
 * GB display for `VramRow`'s detected/manual/conflict figures (035 review
 * F2). Below 1 GB this defers to `mb()` unchanged (still shows KB/MB, e.g.
 * the 256 MB override floor). At 1 GB and above, `mb()`'s `formatBytes` rule
 * rounds to a whole number once the value hits double digits — 12800 MB
 * (12.5 GB) would read "13 GB" — so this formats GB values with up to two
 * fraction digits instead. `minimumFractionDigits: 0` still strips a
 * trailing zero, so a whole number of GB reads "16 GB", never "16.0 GB".
 */
export function vramGb(value: number | null, language: UiLanguage): string | null {
  if (value === null) return null;
  if (value < 1024) return mb(value, language);
  const formatted = new Intl.NumberFormat(locale(language), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value / 1024);
  return `${formatted} GB`;
}

/**
 * The budgeted figure for a RAM/VRAM row (029, D4): `undefined` whenever the
 * verdict never computed one (the underlying raw fact is unknown, or the
 * verdict itself is `unknown`) — in that case the row says nothing about
 * planning rather than inventing a number. Always reads `plannedRamMb`/
 * `plannedVramMb` straight off the verdict, per the story's decision: the
 * budgeted figure already has the fixed reserve subtracted first, so
 * recomputing raw × percent here would silently disagree with it.
 */
export function plannedNote(
  t: (key: string, vars?: Vars) => string,
  language: UiLanguage,
  plannedMb: number | undefined,
  budgetPercent: number | undefined,
): string | null {
  if (plannedMb === undefined || budgetPercent === undefined) return null;
  const planned = mb(Math.round(plannedMb), language);
  if (planned === null) return null;
  return t('settings.machine.budget.planned', { planned, percent: budgetPercent });
}

/** MB → GB for the editable field's draft value (035, D3), formatted through
    the same locale-aware separator as every other number on this card
    (035 review F4) — German gets a comma (`12,5`), English a period
    (`12.5`); `parseVramOverrideGb` accepts both back. Trailing zeros still
    drop (16384 → 16, 12800 → 12,5 / 12.5). */
export function mbToGbDraft(mb: number, language: UiLanguage): string {
  return formatNumber(mb / 1024, language);
}

/** The card's "nicht zu ermitteln" list resolves each unknown fact's key to
    its label — shared between the shell (renders the list) and whatever key
    the verdict names. */
export const UNKNOWN_FACT_KEY: Record<string, string> = {
  ram: 'settings.machine.fact.ram',
  vram: 'settings.machine.fact.vram',
  cpu: 'settings.machine.fact.cpu',
};
