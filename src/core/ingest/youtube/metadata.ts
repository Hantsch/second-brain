/**
 * Normalisierung und feldweiser Merge der Video-Metadaten. Portiert aus
 * `../yougrab/src/shared/metadata.js`.
 *
 * Jeder Provider liefert ein Teilergebnis im gleichen flachen Schema.
 * `mergeMetadata` legt sie in Prioritaetsreihenfolge uebereinander: pro Feld gewinnt
 * der erste Provider, der etwas Nicht-Leeres geliefert hat. Damit ergaenzen sich die
 * Quellen, statt dass eine gewinnt und ihre Luecken bleiben. `provenance` haelt fest,
 * welches Feld woher kam — Herkunft erhalten ist Teil des Vertrags.
 */

import { normalizeChapters } from './chapters';
import type { Chapter } from './chapters';
import { watchUrl } from './video-url';

/** Reihenfolge bestimmt auch die Reihenfolge in `metadata.json`. */
export const METADATA_FIELDS = [
  'videoId',
  'title',
  'description',
  'channel',
  'channelId',
  'channelUrl',
  'publishedAt',
  'uploadDate',
  'duration',
  'viewCount',
  'likeCount',
  'commentCount',
  'language',
  'thumbnail',
  'tags',
  'categories',
  'chapters',
  'isLive',
  'ageLimit',
] as const;

export type MetadataField = (typeof METADATA_FIELDS)[number];

/** Felder, ohne die der Datensatz fuer eine Verdichtung wenig Wert hat. */
export const CORE_FIELDS: readonly MetadataField[] = [
  'title',
  'description',
  'channel',
  'duration',
];

/** Was ein Provider liefern darf — alles optional, alles wird geprueft. */
export interface RawVideoMetadata {
  videoId?: unknown;
  title?: unknown;
  description?: unknown;
  channel?: unknown;
  channelId?: unknown;
  channelUrl?: unknown;
  publishedAt?: unknown;
  uploadDate?: unknown;
  duration?: unknown;
  durationIso?: unknown;
  viewCount?: unknown;
  likeCount?: unknown;
  commentCount?: unknown;
  language?: unknown;
  thumbnail?: unknown;
  tags?: unknown;
  categories?: unknown;
  chapters?: unknown;
  isLive?: unknown;
  ageLimit?: unknown;
}

export interface VideoMetadata {
  videoId: string | null;
  title: string | null;
  description: string | null;
  channel: string | null;
  channelId: string | null;
  channelUrl: string | null;
  publishedAt: string | null;
  uploadDate: string | null;
  duration: number | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  language: string | null;
  thumbnail: string | null;
  tags: string[];
  categories: string[];
  chapters: Chapter[];
  isLive: boolean | null;
  ageLimit: number | null;
  /** Abgeleitet, nicht von einem Provider: die watch-URL. */
  url: string | null;
}

export interface MetadataPart {
  provider: string;
  data: RawVideoMetadata;
}

export interface MergedMetadata {
  metadata: VideoMetadata;
  /** Feld → Provider, der es geliefert hat. */
  provenance: Record<string, string>;
  /** Provider, die etwas beigetragen haben, in Reihenfolge. */
  providers: string[];
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return !Number.isFinite(value);
  return false;
}

function text(value: unknown): string | null {
  return isEmpty(value) ? null : String(value).trim();
}

function toNumber(value: unknown): number | null {
  if (isEmpty(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** `20240131` → `2024-01-31`. */
export function normalizeUploadDate(value: unknown): string | null {
  if (isEmpty(value)) return null;
  const raw = String(value).trim();
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (compact !== null) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return iso === null ? null : (iso[1] ?? null);
}

/** ISO-8601-Dauer (`PT1H2M3S`) → Sekunden. */
export function parseIsoDuration(value: unknown): number | null {
  if (isEmpty(value)) return null;
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(String(value));
  if (match === null) return null;
  const total =
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  return total > 0 ? Math.round(total) : null;
}

function toStringArray(value: unknown): string[] {
  if (isEmpty(value)) return [];
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const entry = String(item ?? '').trim();
    if (entry.length === 0 || seen.has(entry.toLowerCase())) continue;
    seen.add(entry.toLowerCase());
    out.push(entry);
  }
  return out;
}

/** Provider-Rohdaten auf das gemeinsame Schema bringen. */
export function normalizeMetadata(input: RawVideoMetadata | null | undefined): VideoMetadata {
  const raw = input ?? {};
  const channelId = text(raw.channelId);
  return {
    videoId: text(raw.videoId),
    title: text(raw.title),
    description: isEmpty(raw.description) ? null : String(raw.description).replace(/\r\n?/g, '\n'),
    channel: text(raw.channel),
    channelId,
    channelUrl:
      text(raw.channelUrl) ??
      (channelId === null ? null : `https://www.youtube.com/channel/${channelId}`),
    publishedAt: text(raw.publishedAt),
    uploadDate: normalizeUploadDate(raw.uploadDate ?? raw.publishedAt),
    duration: toNumber(raw.duration) ?? parseIsoDuration(raw.durationIso),
    viewCount: toNumber(raw.viewCount),
    likeCount: toNumber(raw.likeCount),
    commentCount: toNumber(raw.commentCount),
    language: text(raw.language),
    thumbnail: text(raw.thumbnail),
    tags: toStringArray(raw.tags),
    categories: toStringArray(raw.categories),
    chapters: normalizeChapters(raw.chapters, toNumber(raw.duration)),
    isLive: typeof raw.isLive === 'boolean' ? raw.isLive : null,
    ageLimit: toNumber(raw.ageLimit),
    url: null,
  };
}

function emptyMetadata(): VideoMetadata {
  return normalizeMetadata({});
}

/** Feldweiser Merge in Prioritaetsreihenfolge. */
export function mergeMetadata(parts: readonly MetadataPart[]): MergedMetadata {
  const merged = emptyMetadata();
  const provenance: Record<string, string> = {};
  const providers: string[] = [];
  const fields: Record<string, unknown> = merged as unknown as Record<string, unknown>;

  for (const part of parts) {
    const normalized = normalizeMetadata(part.data) as unknown as Record<string, unknown>;
    let contributed = false;
    for (const field of METADATA_FIELDS) {
      if (!isEmpty(fields[field])) continue;
      if (isEmpty(normalized[field])) continue;
      fields[field] = normalized[field];
      provenance[field] = part.provider;
      contributed = true;
    }
    if (contributed && !providers.includes(part.provider)) providers.push(part.provider);
  }

  merged.url = merged.videoId === null ? null : watchUrl(merged.videoId);
  return { metadata: merged, provenance, providers };
}

/** Welche Kernfelder fehlen? Leere Liste heisst: der Datensatz taugt. */
export function missingCoreFields(metadata: VideoMetadata): MetadataField[] {
  const fields = metadata as unknown as Record<string, unknown>;
  return CORE_FIELDS.filter((field) => isEmpty(fields[field]));
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'()[\]]+/gi;

export interface DescriptionLink {
  url: string;
  /** Die Zeile ohne die URL — meist der Titel der verlinkten Quelle. */
  context: string;
}

/** URLs aus der Description ziehen, mit der Zeile als Kontext. */
export function extractLinks(description: string | null): DescriptionLink[] {
  const raw = String(description ?? '');
  if (raw.trim().length === 0) return [];

  const found: DescriptionLink[] = [];
  const seen = new Set<string>();

  for (const line of raw.split('\n')) {
    const matches = line.match(URL_RE);
    if (matches === null) continue;
    for (const match of matches) {
      // Satzzeichen am Ende gehoeren meist zum Text, nicht zur URL.
      const url = match.replace(/[.,;:!?)\]}'"]+$/, '');
      if (url.length === 0 || seen.has(url)) continue;
      seen.add(url);
      const context = line
        .replace(URL_RE, '')
        .replace(/\s+/g, ' ')
        .replace(/^[-*•\s|:]+/, '')
        .replace(/[\s:\-–—|,]+$/, '')
        .trim();
      found.push({ url, context });
    }
  }
  return found;
}
