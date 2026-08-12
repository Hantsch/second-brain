/**
 * Wahl der Untertitelspur. Portiert aus `../yougrab/src/shared/lang.js`.
 *
 * YouTube liefert je Video oft eine manuelle Spur plus dutzende automatische: die
 * ASR-Spur in der Originalsprache und maschinelle Uebersetzungen davon. Gewollt ist
 * in dieser Reihenfolge:
 *   1. bevorzugte Sprache aus den Einstellungen (`original` = Sprache des Videos),
 *   2. innerhalb einer Sprache manuell vor automatisch,
 *   3. ASR-Originalspur vor maschineller Uebersetzung.
 *
 * Praktisch heisst das: ein japanisches Video mit Standardeinstellung liefert die
 * japanische ASR-Spur, nicht die englische Auto-Uebersetzung davon.
 */

import { DEFAULT_LANGUAGES } from '../types';

export type SubtitleKind = 'manual' | 'auto' | 'unknown';

export interface SubtitleTrack {
  lang: string;
  kind: SubtitleKind;
}

export interface TrackChoiceInput {
  manual?: readonly string[];
  auto?: readonly string[];
  /** Wunschliste; `original` wird durch die Videosprache ersetzt. */
  preferred?: readonly string[];
  /** Sprache des Videos, falls bekannt. */
  original?: string | null;
}

/** Sprachbasis ohne Region: `en-US` → `en`, `de-orig` → `de`. */
export function baseTag(lang: string): string {
  return (
    String(lang ?? '')
      .toLowerCase()
      .split(/[-_]/)[0] ?? ''
  );
}

/** `live_chat` ist keine Untertitelspur, sondern das Chatprotokoll. */
export function usableTracks(langs: readonly string[] | undefined): string[] {
  return (langs ?? [])
    .map((lang) => String(lang ?? '').trim())
    .filter((lang) => lang.length > 0 && lang !== 'live_chat');
}

/** `original` in der Wunschliste durch die tatsaechliche Videosprache ersetzen. */
export function expandPreferred(
  preferred: readonly string[] | undefined,
  original: string | null,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of preferred ?? DEFAULT_LANGUAGES) {
    const value = String(entry ?? '').trim();
    if (value.length === 0) continue;
    const resolved = value.toLowerCase() === 'original' ? original : value;
    if (resolved === null || resolved === undefined || resolved.length === 0) continue;
    const key = resolved.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

/**
 * Beste Spur fuer eine Wunschsprache. Exakter Treffer gewinnt, danach der kuerzeste
 * Treffer derselben Sprachbasis (`en` vor `en-US`); eine `-orig`-Variante ist die
 * ASR-Originalspur und schlaegt gleich lange Alternativen.
 */
export function bestForLanguage(tracks: readonly string[], wanted: string): string | null {
  const wantedLower = String(wanted).toLowerCase();
  const exact = tracks.find((track) => track.toLowerCase() === wantedLower);
  if (exact !== undefined) return exact;

  const base = baseTag(wanted);
  const matches = tracks.filter((track) => baseTag(track) === base);
  if (matches.length === 0) return null;

  return (
    [...matches].sort((a, b) => {
      const origDelta =
        Number(b.toLowerCase().includes('orig')) - Number(a.toLowerCase().includes('orig'));
      if (origDelta !== 0) return origDelta;
      return a.length - b.length || a.localeCompare(b);
    })[0] ?? null
  );
}

/** Die zu holende Spur, oder null wenn das Video keine Untertitel hat. */
export function chooseSubtitleTrack(input: TrackChoiceInput): SubtitleTrack | null {
  const manual = usableTracks(input.manual);
  const auto = usableTracks(input.auto);
  const original =
    input.original === null || input.original === undefined || input.original.length === 0
      ? null
      : input.original;
  const preferred = expandPreferred(input.preferred, original);

  for (const wanted of preferred) {
    const manualHit = bestForLanguage(manual, wanted);
    if (manualHit !== null) return { lang: manualHit, kind: 'manual' };
    const autoHit = bestForLanguage(auto, wanted);
    if (autoHit !== null) return { lang: autoHit, kind: 'auto' };
  }

  // Nichts aus der Wunschliste: irgendein Transcript ist besser als keins.
  if (original !== null) {
    const manualHit = bestForLanguage(manual, original);
    if (manualHit !== null) return { lang: manualHit, kind: 'manual' };
    const autoHit = bestForLanguage(auto, original);
    if (autoHit !== null) return { lang: autoHit, kind: 'auto' };
  }
  if (manual.length > 0) return { lang: manual[0] ?? '', kind: 'manual' };
  if (auto.length > 0) return { lang: auto[0] ?? '', kind: 'auto' };
  return null;
}
