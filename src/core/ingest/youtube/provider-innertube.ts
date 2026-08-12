/**
 * Provider 2: youtubei.js (Innertube). Spricht dieselbe interne Schnittstelle wie
 * der YouTube-Player — ohne Binary, ohne Schluessel. Portiert aus
 * `../yougrab/src/main/providers/innertube-provider.js`.
 *
 * Liefert Metadaten *und* Transcript und ist damit das Sicherheitsnetz, falls yt-dlp
 * fehlt. Alle Zugriffe defensiv: die Objektstruktur wandert zwischen Major-Versionen
 * (in v17 ist `microformat` verschwunden, Datum und Kapitel liegen jetzt in
 * `primary_info` bzw. `player_overlays`). Jedes Feld wird daher aus mehreren
 * moeglichen Pfaden gelesen.
 *
 * Der Client kommt als Fabrik herein (`InnertubeFactory`) — dieser Provider laedt
 * nichts selbst, damit Tests ohne Netz laufen.
 */

import type { InnertubeFactory } from '../types';
import { normalizeCueList } from './cues';
import type { RawVideoMetadata } from './metadata';
import type { TranscriptResult, YoutubeProvider } from './pipeline';
import { chooseSubtitleTrack } from './subtitles';

type Bag = Record<string, unknown>;

function bag(value: unknown): Bag {
  return value !== null && typeof value === 'object' ? (value as Bag) : {};
}

/** Erster Wert, der nicht leer ist. */
function firstValue(...values: unknown[]): unknown {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    return value;
  }
  return null;
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Der Innertube-Client laeuft auf en-US, das Datum kommt daher als 'Oct 5, 2017'
 * oder 'Premiered Oct 5, 2017'.
 */
export function parsePublishedText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const source = typeof value === 'object' ? (bag(value)['text'] ?? '') : value;
  const text = String(source).trim();
  if (text.length === 0) return null;

  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso !== null) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const named = /([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(text);
  if (named !== null) {
    const month = MONTHS[(named[1] ?? '').slice(0, 3).toLowerCase()];
    if (month !== undefined) {
      return `${named[3]}-${String(month).padStart(2, '0')}-${String(named[2]).padStart(2, '0')}`;
    }
  }
  return null;
}

/** Nur akzeptieren, was wirklich wie ein Datum aussieht. */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (iso !== null) return iso[1] ?? null;
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact !== null) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return parsePublishedText(text);
}

export function pickThumbnail(basicInfo: Bag): string | null {
  const list = Array.isArray(basicInfo['thumbnail']) ? (basicInfo['thumbnail'] as Bag[]) : [];
  if (list.length === 0) return null;
  const best = [...list].sort((a, b) => (Number(b['width']) || 0) - (Number(a['width']) || 0))[0];
  const url = best === undefined ? null : best['url'];
  return typeof url === 'string' && url.length > 0 ? url : null;
}

/**
 * Kapitel liegen in der Player-Bar, nicht in den Metadaten:
 * `player_overlays.decorated_player_bar.player_bar.markers_map` enthaelt mehrere
 * Marker-Saetze (Kapitel, Quiz, Annotationen) — gebraucht wird DESCRIPTION_CHAPTERS.
 */
export function extractChapters(info: unknown): { start: number; title: string }[] {
  const barSource = bag(bag(bag(info)['player_overlays'])['decorated_player_bar'])['player_bar'];
  const markers = bag(barSource)['markers_map'];
  if (markers === null || markers === undefined) return [];

  const list = Array.isArray(markers) ? (markers as Bag[]) : [bag(markers)];
  const entry = list.find((item) => bag(item)['marker_key'] === 'DESCRIPTION_CHAPTERS') ?? list[0];
  const chapters = bag(bag(entry)['value'])['chapters'];
  if (!Array.isArray(chapters)) return [];

  const out: { start: number; title: string }[] = [];
  for (const raw of chapters as Bag[]) {
    const chapter = bag(raw);
    // Explizit gegen null pruefen: Number(null) waere 0 und damit ein Kapitel ohne
    // Zeitangabe faelschlich bei Sekunde 0.
    const rawMillis = firstValue(
      chapter['time_range_start_millis'],
      chapter['start_millis'],
      chapter['start_ms'],
    );
    if (rawMillis === null) continue;
    const millis = Number(rawMillis);
    if (!Number.isFinite(millis) || millis < 0) continue;
    // `title` ist meist ein {text}-Objekt; nur ein echter String taugt als Fallback,
    // sonst landet '[object Object]' im Kapitelnamen.
    const titleRaw = chapter['title'];
    const title = String(
      (typeof titleRaw === 'object' && titleRaw !== null ? bag(titleRaw)['text'] : titleRaw) ?? '',
    ).trim();
    if (title.length === 0) continue;
    out.push({ start: millis / 1000, title });
  }
  return out;
}

/** Transcript-Segmente aus der verschachtelten Antwort ziehen. */
export function extractSegments(
  transcriptResult: unknown,
): { start_ms: number; end_ms: number; text: string }[] {
  const body = bag(bag(bag(bag(transcriptResult)['transcript'])['content'])['body']);
  const segments = Array.isArray(body['initial_segments'])
    ? (body['initial_segments'] as Bag[])
    : [];

  const out: { start_ms: number; end_ms: number; text: string }[] = [];
  for (const raw of segments) {
    const segment = bag(raw);
    const snippet = segment['snippet'];
    // Section-Header haben kein `snippet` und fallen hier heraus.
    const text = firstValue(
      typeof snippet === 'object' && snippet !== null ? bag(snippet)['text'] : null,
      typeof snippet === 'string' ? snippet : null,
    );
    if (text === null) continue;
    out.push({
      start_ms: Number(segment['start_ms']) || 0,
      end_ms: Number(segment['end_ms']) || 0,
      text: String(text),
    });
  }
  return out;
}

export interface InnertubeProviderOptions {
  client: InnertubeFactory;
  languages?: readonly string[];
}

export function createInnertubeProvider(options: InnertubeProviderOptions): YoutubeProvider {
  const cache = new Map<string, unknown>();

  async function getInfo(videoId: string): Promise<unknown> {
    const known = cache.get(videoId);
    if (known !== undefined) return known;
    const client = await options.client();
    const info = await client.getInfo(videoId);
    cache.set(videoId, info);
    return info;
  }

  return {
    name: 'youtubei.js',

    async metadata(videoId: string): Promise<RawVideoMetadata> {
      const info = await getInfo(videoId);
      const root = bag(info);
      const basic = bag(root['basic_info']);
      const primary = bag(root['primary_info']);
      // In v17 nicht mehr vorhanden, in anderen Versionen moeglich.
      const microformat = bag(root['microformat']);
      const channel = bag(basic['channel']);

      const published = firstValue(
        parsePublishedText(primary['published']),
        normalizeDate(microformat['publish_date']),
        normalizeDate(microformat['upload_date']),
        normalizeDate(basic['start_timestamp']),
      );

      return {
        videoId: firstValue(basic['id'], videoId),
        title: firstValue(basic['title'], bag(primary['title'])['text']),
        description: firstValue(
          basic['short_description'],
          bag(bag(root['secondary_info'])['description'])['text'],
          bag(microformat['description'])['text'],
        ),
        channel: firstValue(channel['name'], basic['author']),
        channelId: firstValue(channel['id'], basic['channel_id']),
        channelUrl: firstValue(channel['url']),
        publishedAt: published,
        uploadDate: published,
        duration: firstValue(basic['duration']),
        viewCount: firstValue(basic['view_count'], bag(primary['view_count'])['view_count']),
        likeCount: firstValue(basic['like_count']),
        language: firstValue(microformat['default_language'], basic['language']),
        thumbnail: pickThumbnail(basic),
        tags: firstValue(basic['tags'], basic['keywords'], microformat['tags']),
        categories: typeof basic['category'] === 'string' ? [basic['category']] : [],
        chapters: extractChapters(info),
        isLive: typeof basic['is_live'] === 'boolean' ? basic['is_live'] : null,
        ageLimit: basic['is_family_safe'] === false ? 18 : null,
      };
    },

    async transcript(videoId: string): Promise<TranscriptResult | null> {
      const info = await getInfo(videoId);
      const root = bag(info);
      const load = root['getTranscript'];
      if (typeof load !== 'function') return null;

      let result: unknown = await (load as () => Promise<unknown>).call(info);
      if (result === null || result === undefined) return null;

      // Werden mehrere Sprachen angeboten, gezielt die bevorzugte holen.
      const available = Array.isArray(bag(result)['languages'])
        ? (bag(result)['languages'] as unknown[]).map(String)
        : [];
      const selected = bag(result)['selectedLanguage'];
      const select = bag(result)['selectLanguage'];
      if (available.length > 1 && typeof select === 'function') {
        const track = chooseSubtitleTrack({
          manual: available,
          preferred: options.languages,
          original:
            typeof bag(root['basic_info'])['language'] === 'string'
              ? String(bag(root['basic_info'])['language'])
              : null,
        });
        if (track !== null && track.lang !== selected) {
          try {
            result = await (select as (lang: string) => Promise<unknown>).call(result, track.lang);
          } catch {
            /* Sprachwahl abgelehnt: die vorgewaehlte Spur bleibt. */
          }
        }
      }

      const cues = normalizeCueList(extractSegments(result));
      if (cues.length === 0) return null;
      const language = bag(result)['selectedLanguage'] ?? selected ?? null;
      return {
        cues,
        language: language === null ? null : String(language),
        // Innertube unterscheidet nicht zwischen ASR und manuell.
        kind: 'unknown',
        format: 'innertube',
      };
    },
  };
}
