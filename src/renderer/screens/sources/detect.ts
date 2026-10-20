/* Detecting what the user dropped in: YouTube, web page, file path, text.

   The detection is **visible** — the inbox states what it understood before
   anything happens. That's why it has to run here, in the renderer, without a
   call into the main process: the answer appears while typing, not after.

   The core decides the same question again (`allIngestors()` in detection
   order). This version is the concise preview of that: it only checks the
   shape, never the network. What's called YouTube here is called that there
   too — same host names, same 11-character ID. */

import type { IngestKind } from '@shared/types';

/** Host names behind which a YouTube video may be hiding. */
const YOUTUBE_HOSTS = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

/** Path prefixes that carry a video ID. */
const YOUTUBE_PREFIXES = ['shorts', 'embed', 'live', 'v', 'e'];

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function isVideoId(value: string | null | undefined): boolean {
  return typeof value === 'string' && VIDEO_ID.test(value);
}

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return YOUTUBE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Does the input contain a YouTube video? Only the shape, never a network query. */
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

/** Does the input look like a file path (and not like a URL)? */
export function looksLikePath(input: string): boolean {
  const raw = input.trim();
  if (raw.length === 0 || raw.includes('\n')) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return false;
  return /^([a-z]:[\\/]|\\\\|\/|\.\.?[\\/])/i.test(raw) || /[\\/]/.test(raw);
}

/**
 * What is this? `null` means: nothing entered yet — in that case nothing is
 * asserted. Order matches the core: YouTube before URL (a watch URL is both),
 * file before text (a path is also text).
 */
export function detectKind(input: string): IngestKind | null {
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (looksLikeYoutube(raw)) return 'youtube';
  if (isHttpUrl(raw)) return 'url';
  if (looksLikePath(raw)) return 'file';
  return 'text';
}
