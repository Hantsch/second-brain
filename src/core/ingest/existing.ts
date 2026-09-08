/** Rehydrate the small `IngestOutcome` needed to condense a raw source again. */

import type { IngestKind } from '@shared/types';
import { splitFrontmatterBlock } from '@core/vault/frontmatter';
import { TEXT_FILE } from './file';
import { readIngestLog } from './raw';
import { IngestError } from './types';
import type { IngestOutcome, IngestStore } from './types';
import { isTranscriptAvailable, YOUTUBE_FILES } from './youtube/writer';

/** Woraus `loadExistingOutcome` den Text liest. Vorgabe `'transcript'` — der
 * bisherige Weg bleibt damit byteidentisch. */
export type OutcomeBasis = 'transcript' | 'metadata';

function kindOf(value: unknown): IngestKind | null {
  return value === 'youtube' || value === 'file' || value === 'url' || value === 'text'
    ? value
    : null;
}

function notesOf(value: unknown): IngestOutcome['notes'] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is IngestOutcome['notes'][number] =>
          item !== null && typeof item === 'object' && typeof item.code === 'string',
      )
    : [];
}

/** `metadata.md` ohne Frontmatter — die explizite Grundlage, wenn es kein Transcript gibt. */
async function metadataText(store: IngestStore, path: string): Promise<string> {
  const raw = await store.readText(`${path}/${YOUTUBE_FILES.metadataMd}`);
  if (raw === null) return '';
  return splitFrontmatterBlock(raw).body.trim();
}

async function readableText(
  store: IngestStore,
  path: string,
  kind: IngestKind,
  file: unknown,
  transcript: unknown,
  basis: OutcomeBasis,
): Promise<string> {
  if (kind === 'youtube') {
    if (basis === 'metadata') return metadataText(store, path);
    if (!isTranscriptAvailable(transcript)) return '';
    return (await store.readText(`${path}/${YOUTUBE_FILES.transcript}`)) ?? '';
  }
  if (kind === 'url') return (await store.readText(path)) ?? '';
  const derived = await store.readText(`${path}/${TEXT_FILE}`);
  if (derived !== null) return derived;
  return typeof file === 'string' ? ((await store.readText(`${path}/${file}`)) ?? '') : '';
}

export async function loadExistingOutcome(
  store: IngestStore,
  rawPath: string,
  options: { basis?: OutcomeBasis } = {},
): Promise<IngestOutcome> {
  const log = await readIngestLog(store, rawPath);
  if (log === null) throw new IngestError('not-found', `Kein Protokoll zu ${rawPath}.`);
  const kind = kindOf(log.kind);
  if (kind === null) throw new IngestError('invalid', `Quellenart von ${rawPath} ist unbekannt.`);
  const basis = options.basis ?? 'transcript';
  const notes = notesOf(log.notes);
  let text = await readableText(store, rawPath, kind, log['file'], log['transcript'], basis);
  // A url source the original ingest already marked hollow (`no-content`) must stay hollow on a
  // manual re-condense too — the raw file's frontmatter+heading always read as non-empty text,
  // which would otherwise defeat queue.ts's emptiness check on this second pass.
  if (kind === 'url' && notes.some((note) => note.code === 'no-content')) text = '';
  return {
    kind,
    rawPath,
    title: log.title,
    text,
    origin: log.origin,
    provenance: log.provenance,
    notes,
  };
}
