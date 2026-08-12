/**
 * Provider 1: yt-dlp. Die belastbarste Quelle — Metadaten inklusive Kapitelmarken
 * und Zugriff auf manuelle wie auto-generierte Untertitel. Portiert aus
 * `../yougrab/src/main/providers/ytdlp-provider.js`.
 *
 * Zwei Aufrufe pro Video: `--dump-single-json` fuer die Metadaten (daraus wissen wir
 * auch, welche Spuren es gibt), danach ein gezielter Download **einer** Spur. Ein
 * Aufruf mit `--sub-langs all` wuerde hunderte maschinelle Uebersetzungen ziehen.
 *
 * Binary-Pfad, Prozessaufruf und Dateisystem kommen herein — dieser Provider
 * startet nichts selbst.
 */

import { IngestError } from '../types';
import type { IngestFileSystem, ProcessRunner } from '../types';
import { parseSubtitles } from './cues';
import type { RawVideoMetadata } from './metadata';
import { chooseSubtitleTrack } from './subtitles';
import type { TranscriptResult, YoutubeProvider } from './pipeline';
import { watchUrl } from './video-url';

/** Bevorzugte Untertitelformate, in dieser Reihenfolge. */
const SUBTITLE_EXTENSIONS = ['json3', 'vtt', 'srt', 'srv3', 'srv2', 'srv1', 'ttml'];

const INFO_TIMEOUT_MS = 120_000;
const SUBTITLE_TIMEOUT_MS = 180_000;

export interface YtDlpProviderOptions {
  binary: string;
  run: ProcessRunner;
  fs: IngestFileSystem;
  languages?: readonly string[];
  /** Zusaetzliche Argumente des Nutzers (Cookies, Proxy). */
  extraArgs?: readonly string[];
  signal?: AbortSignal;
  onNote?: (message: string) => void;
}

/** Letzte inhaltsvolle Fehlerzeile von yt-dlp — der Rest ist Rauschen. */
export function extractError(stderr: string): string {
  const lines = String(stderr ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^WARNING:/i.test(line));
  const errorLine = [...lines].reverse().find((line) => /^ERROR:/i.test(line));
  const chosen = errorLine ?? lines[lines.length - 1] ?? 'yt-dlp ist fehlgeschlagen';
  return chosen.replace(/^ERROR:\s*/i, '');
}

function unixToIso(timestamp: unknown): string | null {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/** Der `-J`-Dump von yt-dlp, so weit wir ihn anfassen. */
interface YtDlpInfo {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  channel?: unknown;
  uploader?: unknown;
  channel_id?: unknown;
  uploader_id?: unknown;
  channel_url?: unknown;
  uploader_url?: unknown;
  timestamp?: unknown;
  release_timestamp?: unknown;
  upload_date?: unknown;
  duration?: unknown;
  view_count?: unknown;
  like_count?: unknown;
  comment_count?: unknown;
  language?: unknown;
  thumbnail?: unknown;
  tags?: unknown;
  categories?: unknown;
  chapters?: unknown;
  is_live?: unknown;
  live_status?: unknown;
  age_limit?: unknown;
  subtitles?: Record<string, unknown>;
  automatic_captions?: Record<string, unknown>;
}

/** yt-dlp-Dump auf das gemeinsame flache Schema abbilden. */
export function mapInfo(info: YtDlpInfo): RawVideoMetadata {
  return {
    videoId: info.id,
    title: info.title,
    description: info.description,
    channel: info.channel ?? info.uploader,
    channelId: info.channel_id ?? info.uploader_id,
    channelUrl: info.channel_url ?? info.uploader_url,
    publishedAt: unixToIso(info.timestamp ?? info.release_timestamp),
    uploadDate: info.upload_date,
    duration: info.duration,
    viewCount: info.view_count,
    likeCount: info.like_count,
    commentCount: info.comment_count,
    language: info.language,
    thumbnail: info.thumbnail,
    tags: info.tags,
    categories: info.categories,
    chapters: info.chapters,
    isLive: typeof info.is_live === 'boolean' ? info.is_live : info.live_status === 'is_live',
    ageLimit: info.age_limit,
  };
}

export interface SubtitleFile {
  path: string;
  extension: string;
  language: string | null;
}

/**
 * Die geschriebene Untertiteldatei im Temp-Verzeichnis finden. Der Name ist
 * `<id>.<lang>.<ext>`, aber `<lang>` kann von der Anfrage abweichen (yt-dlp
 * normalisiert Sprachcodes) — deshalb wird nach Endung gesucht, nicht nach Namen.
 */
export async function findSubtitleFile(
  fs: IngestFileSystem,
  dir: string,
  videoId: string,
): Promise<SubtitleFile | null> {
  const entries = await fs.readDir(dir).catch(() => [] as string[]);
  const matches: SubtitleFile[] = [];
  for (const name of entries) {
    const parts = name.split('.');
    const extension = (parts.pop() ?? '').toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(extension)) continue;
    const language = parts.length > 1 ? (parts.pop() ?? null) : null;
    const base = parts.join('.');
    if (videoId.length > 0 && base.length > 0 && base !== videoId) continue;
    matches.push({ path: fs.join(dir, name), extension, language });
  }
  if (matches.length === 0) return null;
  matches.sort(
    (a, b) => SUBTITLE_EXTENSIONS.indexOf(a.extension) - SUBTITLE_EXTENSIONS.indexOf(b.extension),
  );
  return matches[0] ?? null;
}

export function createYtDlpProvider(options: YtDlpProviderOptions): YoutubeProvider {
  const { binary, run, fs, signal } = options;
  const cache = new Map<string, YtDlpInfo>();

  const baseArgs = (): string[] => {
    const args = ['--no-playlist', '--no-warnings', '--ignore-config'];
    for (const extra of options.extraArgs ?? []) {
      const value = String(extra).trim();
      if (value.length > 0) args.push(value);
    }
    return args;
  };

  const call = (
    args: string[],
    timeoutMs: number,
  ): Promise<{ code: number; stdout: string; stderr: string }> =>
    run(binary, args, signal === undefined ? { timeoutMs } : { timeoutMs, signal });

  /** `-J`-Dump, pro Video nur einmal: Metadaten und Spurenliste kommen daraus. */
  async function dumpInfo(videoId: string): Promise<YtDlpInfo> {
    const known = cache.get(videoId);
    if (known !== undefined) return known;

    const result = await call(
      [...baseArgs(), '--skip-download', '--dump-single-json', watchUrl(videoId)],
      INFO_TIMEOUT_MS,
    );
    if (result.code !== 0) throw new IngestError('io', extractError(result.stderr));

    let info: YtDlpInfo;
    try {
      info = JSON.parse(result.stdout) as YtDlpInfo;
    } catch {
      throw new IngestError('io', 'yt-dlp hat kein gueltiges JSON geliefert.');
    }
    cache.set(videoId, info);
    return info;
  }

  return {
    name: 'yt-dlp',

    async metadata(videoId: string): Promise<RawVideoMetadata> {
      return mapInfo(await dumpInfo(videoId));
    },

    async transcript(videoId: string): Promise<TranscriptResult | null> {
      const info = await dumpInfo(videoId);
      const track = chooseSubtitleTrack({
        manual: Object.keys(info.subtitles ?? {}),
        auto: Object.keys(info.automatic_captions ?? {}),
        preferred: options.languages,
        original: typeof info.language === 'string' ? info.language : null,
      });
      if (track === null) return null;
      options.onNote?.(`${track.lang} (${track.kind})`);

      const dir = await fs.tempDir('sb-ingest-');
      try {
        const result = await call(
          [
            ...baseArgs(),
            '--skip-download',
            '--write-subs',
            '--write-auto-subs',
            '--sub-langs',
            track.lang,
            '--sub-format',
            'json3/vtt/srt/best',
            '-o',
            fs.join(dir, '%(id)s.%(ext)s'),
            watchUrl(videoId),
          ],
          SUBTITLE_TIMEOUT_MS,
        );
        if (result.code !== 0) throw new IngestError('io', extractError(result.stderr));

        const file = await findSubtitleFile(fs, dir, videoId);
        if (file === null) return null;
        const content = await fs.readText(file.path);
        if (content === null) return null;
        const cues = parseSubtitles(content, file.extension);
        if (cues.length === 0) return null;

        return {
          cues,
          language: file.language ?? track.lang,
          kind: track.kind,
          format: file.extension,
        };
      } finally {
        await fs.remove(dir).catch(() => undefined);
      }
    },
  };
}
