/**
 * Video-ID aus allem, was ein Nutzer plausibel einwirft: watch-URLs, youtu.be,
 * /shorts/, /embed/, /live/, music.youtube.com, oder die nackte 11-stellige ID.
 *
 * Portiert aus `../yougrab/src/shared/video-url.js`. Die Pruefung gegen
 * `[A-Za-z0-9_-]{11}` ist nicht Kosmetik: aus der ID wird ein Ordnername unter
 * `raw/youtube/`, und dort darf nichts landen, was der Nutzer diktiert hat.
 */

const ID_RE = /^[A-Za-z0-9_-]{11}$/;

const PATH_PREFIXES = ['shorts', 'embed', 'live', 'v', 'e'];

const HOST_SUFFIXES = ['youtube.com', 'youtube-nocookie.com', 'youtu.be'];

export function isVideoId(value: unknown): value is string {
  return typeof value === 'string' && ID_RE.test(value);
}

function hostMatches(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Die 11-stellige Video-ID, oder null wenn nichts Brauchbares drinsteht. */
export function parseVideoId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (raw.length === 0) return null;
  if (isVideoId(raw)) return raw;

  // Ohne Schema kommt der URL-Konstruktor nicht klar ('youtube.com/watch?v=..').
  const candidates = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? [raw] : [`https://${raw}`, raw];

  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (!hostMatches(url.hostname)) continue;

    const query = url.searchParams.get('v');
    if (isVideoId(query)) return query;

    const segments = url.pathname.split('/').filter((part) => part.length > 0);
    if (segments.length === 0) continue;

    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'youtu.be' && isVideoId(segments[0])) return segments[0];

    const first = (segments[0] ?? '').toLowerCase();
    if (PATH_PREFIXES.includes(first) && isVideoId(segments[1])) return segments[1] ?? null;

    // Letzte Chance: irgendein Segment sieht wie eine ID aus.
    const guess = segments.find((segment) => isVideoId(segment));
    if (guess !== undefined) return guess;
  }

  // Verstuemmelte Eingaben wie 'v=dQw4w9WgXcQ' oder ein Satz mit ID darin.
  const inline = /(?:v=|vi=|\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(raw);
  return inline === null ? null : (inline[1] ?? null);
}

/**
 * Einen Freitext-Block in eindeutige Video-IDs zerlegen. Die Eingabereihenfolge
 * bleibt, und was nicht erkannt wurde, verschwindet nicht still.
 */
export function parseVideoIds(text: string): { ids: string[]; unresolved: string[] } {
  const ids: string[] = [];
  const seen = new Set<string>();
  const unresolved: string[] = [];

  for (const token of String(text ?? '')
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)) {
    const id = parseVideoId(token);
    if (id === null) {
      unresolved.push(token);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ids, unresolved };
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Deep-Link auf eine Sekunde im Video — die Grundlage zitierfaehiger Zeilen. */
export function timestampUrl(videoId: string, seconds: number): string {
  return `https://youtu.be/${videoId}?t=${Math.max(0, Math.floor(seconds))}`;
}
