/* Erkennen, was der Nutzer eingeworfen hat: YouTube, Webseite, Dateipfad, Text.

   Die Erkennung ist **sichtbar** — der Eingang sagt, was er verstanden hat, bevor
   etwas passiert. Sie muss deshalb hier laufen, im Renderer, ohne einen Aufruf
   in den Hauptprozess: die Antwort steht beim Tippen da, nicht danach.

   Der Kern entscheidet dieselbe Frage noch einmal (`allIngestors()` in
   Erkennungsreihenfolge). Diese Fassung ist die knappe Vorschau davon: sie prüft
   nur die Form, nie das Netz. Was hier YouTube heißt, heißt es dort auch —
   dieselben Wirtsnamen, dieselbe 11-stellige Kennung. */

import type { IngestKind } from '@shared/types';

/** Wirtsnamen, hinter denen ein YouTube-Video steckt. */
const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

/** Pfadanfänge, die eine Video-Kennung tragen. */
const YOUTUBE_PREFIXES = ['shorts', 'embed', 'live', 'v', 'e'];

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function isVideoId(value: string | null | undefined): boolean {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return YOUTUBE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Steckt in der Eingabe ein YouTube-Video? Nur die Form, keine Abfrage. */
export function looksLikeYoutube(input: string): boolean {
  const raw = input.trim();
  if (raw.length === 0 || raw.includes('\n')) return false;
  const candidates = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? [raw] : [`https://${raw}`];
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (!hostMatches(url.hostname)) continue;
    if (isVideoId(url.searchParams.get('v'))) return true;
    const segments = url.pathname.split('/').filter((part) => part.length > 0);
    const first = (segments[0] ?? '').toLowerCase();
    if (isVideoId(segments[0]) && !YOUTUBE_PREFIXES.includes(first)) return true;
    if (YOUTUBE_PREFIXES.includes(first) && isVideoId(segments[1])) return true;
    if (segments.some((segment) => isVideoId(segment))) return true;
  }
  return false;
}

export function isHttpUrl(input: string): boolean {
  const raw = input.trim();
  if (raw.includes('\n') || /\s/.test(raw)) return false;
  return /^https?:\/\/\S+$/i.test(raw);
}

/** Sieht die Eingabe wie ein Dateipfad aus (und nicht wie eine URL)? */
export function looksLikePath(input: string): boolean {
  const raw = input.trim();
  if (raw.length === 0 || raw.includes('\n')) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return false;
  return /^([a-z]:[\\/]|\\\\|\/|\.\.?[\\/])/i.test(raw) || /[\\/]/.test(raw);
}

/**
 * Was ist das? `null` heißt: noch nichts eingegeben — dann wird nichts behauptet.
 * Reihenfolge wie im Kern: YouTube vor URL (eine watch-URL ist beides), Datei vor
 * Text (ein Pfad ist auch Text).
 */
export function detectKind(input: string): IngestKind | null {
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (looksLikeYoutube(raw)) return 'youtube';
  if (isHttpUrl(raw)) return 'url';
  if (looksLikePath(raw)) return 'file';
  return 'text';
}
