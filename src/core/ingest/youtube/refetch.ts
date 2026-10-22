/**
 * Fetching a YouTube source again, in place — the one exception to "a raw source is
 * never rewritten" (docs/VAULT-FORMAT.md).
 *
 * It only applies to a source whose first fetch came back without a transcript and
 * that nothing has been condensed from yet. Then no citation rests on its payload:
 * the folder is a placeholder for the video, not a fixed point. Typical cause: the
 * first run had no yt-dlp and the fallback provider was turned away by YouTube.
 *
 * Two rules keep it safe:
 * - **Nothing is written unless a transcript arrives.** A second empty fetch leaves
 *   the folder as it was; the job ends `no-content` with the fresh reason.
 * - **Nothing is replaced without a copy.** Every payload file goes to the trash as
 *   a snapshot first — a transcript the user pasted into the placeholder survives.
 */

import { readIngestLog } from '../raw';
import type { IngestLogRecord } from '../raw';
import { IngestError } from '../types';
import type { IngestNote, IngestOutcome, IngestStore } from '../types';
import { isTranscriptAvailable, YOUTUBE_FILES } from './writer';

/** Why a source can't be fetched again — a code, the caller words it. */
export type RefetchRefusal = 'not-youtube' | 'condensed' | 'has-transcript';

/** The files a fetch writes. `sources/` and `.ingest.json` are not payload. */
const PAYLOAD_FILES = [
  YOUTUBE_FILES.metadataMd,
  YOUTUBE_FILES.metadataJson,
  YOUTUBE_FILES.transcript,
  YOUTUBE_FILES.transcriptTimestamped,
] as const;

export function refetchRefusal(log: IngestLogRecord): RefetchRefusal | null {
  if (log.kind !== 'youtube') return 'not-youtube';
  if (typeof log.sourcePage === 'string' && log.sourcePage.length > 0) return 'condensed';
  if (isTranscriptAvailable(log['transcript'])) return 'has-transcript';
  return null;
}

/**
 * The log of a source that may be fetched again. Checked a second time when the job
 * actually runs: a condensation may have finished between the click and the run.
 */
export async function refetchableLog(store: IngestStore, dir: string): Promise<IngestLogRecord> {
  const log = await readIngestLog(store, dir);
  if (log === null) throw new IngestError('not-found', `Kein Protokoll zu ${dir}.`);
  const refusal = refetchRefusal(log);
  if (refusal !== null) {
    throw new IngestError('invalid', `${dir} kann nicht erneut abgerufen werden.`, {
      detail: refusal,
    });
  }
  if (store.snapshot === undefined) {
    throw new IngestError('invalid', 'Ohne Papierkorb wird keine Rohquelle ersetzt.');
  }
  return log;
}

/** Copy every payload file that exists into the trash before it gets replaced. */
export async function snapshotPayload(store: IngestStore, dir: string): Promise<void> {
  const snapshot = store.snapshot;
  if (snapshot === undefined) {
    throw new IngestError('invalid', 'Ohne Papierkorb wird keine Rohquelle ersetzt.');
  }
  for (const file of PAYLOAD_FILES) await snapshot.call(store, `${dir}/${file}`);
}

/** The untouched source as the outcome of a refetch that found no transcript again. */
export function keptOutcome(
  dir: string,
  log: IngestLogRecord,
  notes: readonly IngestNote[],
): IngestOutcome {
  return {
    kind: 'youtube',
    rawPath: dir,
    title: log.title,
    text: '',
    origin: log.origin,
    provenance: log.provenance,
    notes: [...notes],
  };
}
