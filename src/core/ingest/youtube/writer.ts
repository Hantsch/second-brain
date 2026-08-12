/**
 * Der Ordner einer YouTube-Quelle. Aufbau wie in `../yougrab`, damit ein Vault von
 * dort und einer von hier gleich aussehen:
 *
 * ```
 * raw/youtube/<video-id>/
 *   metadata.md                 Frontmatter + Kurzuebersicht + volle Description
 *   metadata.json               dieselben Felder maschinenlesbar, mit Provenienz
 *   transcript.md               Prosa nach Kapiteln — die Datei fuer die Verdichtung
 *   transcript.timestamped.md   eine Zeile pro Satz mit Deep-Link
 *   sources/                    leer; nur wenn die Description etwas verlinkt
 *   .ingest.json                Protokoll nach docs/VAULT-FORMAT.md
 * ```
 */

import {
  escapeTableCell,
  formatCount,
  formatDuration,
  formatTimecode,
  markdownDoc,
} from '../markdown';
import { writeIngestLog } from '../raw';
import type { IngestNote, IngestStore } from '../types';
import { normalizeChapters } from './chapters';
import { countWords } from './cues';
import type { Harvest } from './pipeline';
import { renderProseTranscript, renderTimestampedTranscript } from './transcript';
import { watchUrl } from './video-url';

export const YOUTUBE_FILES = {
  metadataMd: 'metadata.md',
  metadataJson: 'metadata.json',
  transcript: 'transcript.md',
  transcriptTimestamped: 'transcript.timestamped.md',
  sources: 'sources',
} as const;

export interface TranscriptInfo {
  available: boolean;
  language: string | null;
  kind: string | null;
  provider: string | null;
  wordCount: number | null;
  cueCount: number | null;
}

export interface WriteYoutubeOptions {
  store: IngestStore;
  /** Zielordner, vault-relativ (`raw/youtube/<id>`). */
  dir: string;
  harvest: Harvest;
  ingestedAt: string;
  module?: string | null;
  notes?: readonly IngestNote[];
}

export interface WriteYoutubeResult {
  dir: string;
  files: string[];
  transcript: TranscriptInfo;
  /** Der Text, den die Verdichtung liest — das Prosa-Transcript. */
  text: string;
  title: string;
}

/** `metadata.md`: Frontmatter, Kurzuebersicht, volle Description, Kapitel, Links. */
export function renderMetadataMarkdown(
  harvest: Harvest,
  info: { transcript: TranscriptInfo; ingestedAt: string; sourcesFolder: boolean },
): string {
  const { metadata, links, providers } = harvest;
  const chapters = normalizeChapters(metadata.chapters, metadata.duration);
  const videoUrl = metadata.url ?? (metadata.videoId === null ? null : watchUrl(metadata.videoId));

  const lines: string[] = [`# ${metadata.title ?? metadata.videoId ?? 'Video'}`, ''];

  if (metadata.channel !== null) {
    lines.push(
      metadata.channelUrl === null
        ? `- **Kanal:** ${metadata.channel}`
        : `- **Kanal:** [${metadata.channel}](${metadata.channelUrl})`,
    );
  }
  if (metadata.uploadDate !== null) lines.push(`- **Veroeffentlicht:** ${metadata.uploadDate}`);
  const duration = formatDuration(metadata.duration);
  if (duration !== null) lines.push(`- **Dauer:** ${duration}`);
  if (metadata.viewCount !== null) lines.push(`- **Aufrufe:** ${formatCount(metadata.viewCount)}`);
  if (videoUrl !== null) lines.push(`- **Video:** ${videoUrl}`);
  if (info.transcript.available) {
    const detail = [info.transcript.language, info.transcript.kind].filter(Boolean).join(', ');
    lines.push(`- **Transcript:** \`transcript.md\`${detail.length > 0 ? ` (${detail})` : ''}`);
  } else {
    lines.push('- **Transcript:** nicht verfuegbar');
  }

  lines.push('', '## Description', '');
  lines.push(metadata.description === null ? '_Keine Description._' : metadata.description.trim());

  if (chapters.length > 0) {
    lines.push('', '## Kapitel', '', '| Zeit | Kapitel |', '| --- | --- |');
    for (const chapter of chapters) {
      lines.push(`| \`${formatTimecode(chapter.start)}\` | ${escapeTableCell(chapter.title)} |`);
    }
  }

  if (links.length > 0) {
    lines.push('', '## Links in der Description', '');
    for (const link of links) {
      lines.push(link.context.length > 0 ? `- ${link.context}: <${link.url}>` : `- <${link.url}>`);
    }
    if (info.sourcesFolder) {
      lines.push('', 'Der Ordner `sources/` ist angelegt und leer — dort liegen die manuell');
      lines.push('nachgetragenen Quellen.');
    }
  }

  return markdownDoc(
    {
      doc_type: 'video-metadata',
      video_id: metadata.videoId,
      title: metadata.title,
      channel: metadata.channel,
      channel_id: metadata.channelId,
      channel_url: metadata.channelUrl,
      url: videoUrl,
      published: metadata.uploadDate,
      published_at: metadata.publishedAt,
      duration_seconds: metadata.duration,
      duration,
      view_count: metadata.viewCount,
      like_count: metadata.likeCount,
      comment_count: metadata.commentCount,
      language: metadata.language,
      thumbnail: metadata.thumbnail,
      is_live: metadata.isLive,
      age_limit: metadata.ageLimit,
      tags: metadata.tags,
      categories: metadata.categories,
      chapter_count: chapters.length > 0 ? chapters.length : null,
      link_count: links.length > 0 ? links.length : null,
      transcript_available: info.transcript.available,
      transcript_language: info.transcript.language,
      transcript_kind: info.transcript.kind,
      transcript_provider: info.transcript.provider,
      transcript_word_count: info.transcript.wordCount,
      metadata_providers: providers,
      fetched_at: info.ingestedAt,
    },
    lines,
  );
}

function describeTranscript(harvest: Harvest): TranscriptInfo {
  const cues = harvest.transcript?.cues ?? [];
  const words = cues.reduce((total, cue) => total + countWords(cue.text), 0);
  return {
    available: cues.length > 0,
    language: harvest.transcript?.language ?? null,
    kind: harvest.transcript?.kind ?? null,
    provider: harvest.transcript?.provider ?? null,
    wordCount: cues.length > 0 ? words : null,
    cueCount: cues.length > 0 ? cues.length : null,
  };
}

/** Den Ordner schreiben. Das Protokoll kommt zuletzt — es ist die Quittung. */
export async function writeYoutubeSource(
  options: WriteYoutubeOptions,
): Promise<WriteYoutubeResult> {
  const { store, dir, harvest, ingestedAt } = options;
  const transcript = describeTranscript(harvest);
  const cues = harvest.transcript?.cues ?? [];
  const files: string[] = [];

  await store.mkdir(dir);

  const sourcesFolder = harvest.links.length > 0;
  if (sourcesFolder) await store.mkdir(`${dir}/${YOUTUBE_FILES.sources}`);

  await store.writeText(
    `${dir}/${YOUTUBE_FILES.metadataMd}`,
    renderMetadataMarkdown(harvest, { transcript, ingestedAt, sourcesFolder }),
  );
  files.push(YOUTUBE_FILES.metadataMd);

  const payload = {
    ...harvest.metadata,
    links: harvest.links,
    transcript,
    providers: harvest.providers,
    provenance: harvest.provenance,
    fetchedAt: ingestedAt,
  };
  await store.writeText(
    `${dir}/${YOUTUBE_FILES.metadataJson}`,
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  files.push(YOUTUBE_FILES.metadataJson);

  const context = {
    videoId: harvest.metadata.videoId ?? '',
    title: harvest.metadata.title,
    channel: harvest.metadata.channel,
    duration: harvest.metadata.duration,
    chapters: harvest.metadata.chapters,
    language: transcript.language,
    kind: transcript.kind,
    provider: transcript.provider,
  };

  const prose = renderProseTranscript(cues, context);
  await store.writeText(`${dir}/${YOUTUBE_FILES.transcript}`, prose);
  files.push(YOUTUBE_FILES.transcript);

  if (cues.length > 0) {
    await store.writeText(
      `${dir}/${YOUTUBE_FILES.transcriptTimestamped}`,
      renderTimestampedTranscript(cues, context),
    );
    files.push(YOUTUBE_FILES.transcriptTimestamped);
  }

  const title = harvest.metadata.title ?? harvest.metadata.videoId ?? 'Video';
  const notes = [...(options.notes ?? []), ...harvest.notes];
  await writeIngestLog(store, dir, {
    kind: 'youtube',
    origin: harvest.metadata.url ?? watchUrl(harvest.metadata.videoId ?? ''),
    ingestedAt,
    title,
    sourcePage: null,
    modules: options.module === null || options.module === undefined ? [] : [options.module],
    provenance: {
      metadata: harvest.providers[0] ?? 'unbekannt',
      ...(transcript.provider === null ? {} : { transcript: transcript.provider }),
    },
    notes,
    providers: harvest.providers,
    transcript,
    ...(harvest.failures.length > 0 ? { failures: harvest.failures } : {}),
  });
  files.push('.ingest.json');

  return { dir, files, transcript, text: prose, title };
}
