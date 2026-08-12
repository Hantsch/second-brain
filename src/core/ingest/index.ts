/**
 * Oeffentliche Oberflaeche des Aufnehmens. Andere Module importieren von hier, nicht
 * aus den Einzeldateien.
 *
 * Der Weg einer Quelle, in dieser Reihenfolge:
 *   `SourceIngestor`  eine Quellenart → ein Ordner bzw. eine Datei unter `raw/`
 *   `raw`             wohin sie darf und was im Protokoll `.ingest.json` steht
 *   `IngestQueue`     mehrere Auftraege, begrenzt parallel, abbrechbar
 *   `ytdlp`           das Binary finden und — nur auf Wunsch — holen
 *
 * Der Verdichtungsschritt (`core/wiki`) wird der Queue **hereingegeben**. Dieses
 * Modul kennt ihn nicht; es weiss nur, dass eine Rohquelle danach verdichtet werden
 * kann — und sagt ehrlich `awaiting-llm`, wenn nicht.
 */

export {
  DEFAULT_LANGUAGES,
  IngestError,
  throwIfCancelled,
  type FetchLike,
  type IngestContext,
  type IngestFileStat,
  type IngestFileSystem,
  type IngestNote,
  type IngestNoteCode,
  type IngestOutcome,
  type IngestProgressEvent,
  type IngestProgressFn,
  type IngestStore,
  type InnertubeFactory,
  type InnertubeInfoSource,
  type ProcessOptions,
  type ProcessResult,
  type ProcessRunner,
  type SourceIngestor,
  type YoutubeOptions,
} from './types';

export {
  freeRawPath,
  isoStamp,
  logPathFor,
  patchIngestLog,
  readIngestLog,
  writeIngestLog,
  type IngestLogRecord,
} from './raw';

export {
  compact,
  escapeTableCell,
  formatCount,
  formatDuration,
  formatTimecode,
  markdownDoc,
} from './markdown';

export {
  dropElements,
  extractTitle,
  htmlToArticle,
  htmlToMarkdown,
  pickMainContent,
  stripComments,
  type HtmlArticle,
} from './html';

export { createTextIngestor, titleForText } from './text';
export {
  MAX_TEXT_BYTES,
  TEXT_FILE,
  createFileIngestor,
  handlingFor,
  looksLikePath,
  titleFromFileName,
  titleFromMarkdown,
  type FileHandling,
} from './file';
export {
  FETCH_TIMEOUT_MS,
  MAX_BYTES,
  createUrlIngestor,
  fetchPage,
  isHttpUrl,
  readLimited,
  titleFromUrl,
  type FetchedPage,
} from './url';

export {
  DEFAULT_CONCURRENCY,
  IngestQueue,
  type AddJobInput,
  type CondenseInput,
  type CondenseResult,
  type CondenseStep,
  type IngestQueueDeps,
} from './queue';
export { TERMINAL_STAGES, copyJob, createJob, describeFailure, jobLabel } from './job';

export {
  assetName,
  installYtdlp,
  managedBinaryPath,
  probeVersion,
  resolveYtdlp,
  type InstallOptions,
  type InstallProgress,
  type Platform,
  type YtdlpDeps,
  type YtdlpStatus,
} from './ytdlp';

export { nodeFileSystem, nodeProcessRunner } from './node-adapters';

// ── YouTube ────────────────────────────────────────────────────────────────────

export { buildProviders, createYoutubeIngestor } from './youtube/ingestor';
export {
  harvestVideo,
  type Harvest,
  type TranscriptResult,
  type YoutubeProvider,
} from './youtube/pipeline';
export {
  createYtDlpProvider,
  extractError,
  findSubtitleFile,
  mapInfo,
} from './youtube/provider-ytdlp';
export {
  createInnertubeProvider,
  extractChapters,
  extractSegments,
} from './youtube/provider-innertube';
export { innertubeClient } from './youtube/innertube-client';
export {
  isVideoId,
  parseVideoId,
  parseVideoIds,
  timestampUrl,
  watchUrl,
} from './youtube/video-url';
export {
  baseTag,
  bestForLanguage,
  chooseSubtitleTrack,
  expandPreferred,
  usableTracks,
  type SubtitleKind,
  type SubtitleTrack,
} from './youtube/subtitles';
export {
  countWords,
  dedupeCues,
  normalizeCueList,
  parseJson3,
  parseSrt,
  parseSubtitles,
  parseVtt,
  type Cue,
} from './youtube/cues';
export { stripNonSpeech, stripNonSpeechCues } from './youtube/non-speech';
export {
  buildParagraphs,
  buildTimestampedLines,
  renderProseTranscript,
  renderTimestampedTranscript,
  splitByChapters,
  type TranscriptContext,
} from './youtube/transcript';
export { normalizeChapters, parseChaptersFromDescription, type Chapter } from './youtube/chapters';
export {
  CORE_FIELDS,
  METADATA_FIELDS,
  extractLinks,
  mergeMetadata,
  missingCoreFields,
  normalizeMetadata,
  parseIsoDuration,
  type MergedMetadata,
  type MetadataPart,
  type RawVideoMetadata,
  type VideoMetadata,
} from './youtube/metadata';
export {
  YOUTUBE_FILES,
  renderMetadataMarkdown,
  writeYoutubeSource,
  type TranscriptInfo,
} from './youtube/writer';

// ── Alle Ingestoren auf einmal ─────────────────────────────────────────────────

import { createFileIngestor } from './file';
import { createTextIngestor } from './text';
import { createUrlIngestor } from './url';
import type { SourceIngestor } from './types';
import { createYoutubeIngestor } from './youtube/ingestor';

/**
 * Die vier Ingestoren in Erkennungsreihenfolge: YouTube vor URL (eine watch-URL ist
 * beides), Datei vor Text (ein Pfad ist auch Text). Wer `kind` schon kennt, waehlt
 * direkt — `canHandle` ist fuer den Fall, dass der Nutzer nur etwas eingeworfen hat.
 */
export function allIngestors(): SourceIngestor[] {
  return [createYoutubeIngestor(), createUrlIngestor(), createFileIngestor(), createTextIngestor()];
}
