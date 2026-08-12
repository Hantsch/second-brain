/** Rehydrate the small `IngestOutcome` needed to condense a raw source again. */

import type { IngestKind } from '@shared/types';
import { TEXT_FILE } from './file';
import { readIngestLog } from './raw';
import { IngestError } from './types';
import type { IngestOutcome, IngestStore } from './types';
import { YOUTUBE_FILES } from './youtube/writer';

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

async function readableText(
  store: IngestStore,
  path: string,
  kind: IngestKind,
  file: unknown,
): Promise<string> {
  if (kind === 'youtube')
    return (await store.readText(`${path}/${YOUTUBE_FILES.transcript}`)) ?? '';
  if (kind === 'url') return (await store.readText(path)) ?? '';
  const derived = await store.readText(`${path}/${TEXT_FILE}`);
  if (derived !== null) return derived;
  return typeof file === 'string' ? ((await store.readText(`${path}/${file}`)) ?? '') : '';
}

export async function loadExistingOutcome(
  store: IngestStore,
  rawPath: string,
): Promise<IngestOutcome> {
  const log = await readIngestLog(store, rawPath);
  if (log === null) throw new IngestError('not-found', `Kein Protokoll zu ${rawPath}.`);
  const kind = kindOf(log.kind);
  if (kind === null) throw new IngestError('invalid', `Quellenart von ${rawPath} ist unbekannt.`);
  const text = await readableText(store, rawPath, kind, log['file']);
  return {
    kind,
    rawPath,
    title: log.title,
    text,
    origin: log.origin,
    provenance: log.provenance,
    notes: notesOf(log.notes),
  };
}
