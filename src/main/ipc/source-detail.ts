/** Reads source details and handles the deliberately mutable YouTube `sources/` folder. */

import { constants } from 'node:fs';
import { copyFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  analyzeYoutubeResources,
  legacyFingerprint,
  patchIngestLog,
  readIngestLog,
  sourceFingerprint,
  youtubeResourceFallback,
} from '@core/ingest';
import { assertSafeVaultPath, sanitizeSegment } from '@core/vault/paths';
import type {
  IngestKind,
  RawSource,
  SourceAttachment,
  SourceDetail,
  SourceResourceReport,
} from '@shared/types';
import { requireLists } from './lists';
import { fail } from './registry';
import { wikiStore } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { Services } from '../services';

function rawPathFromLog(path: string): string | null {
  if (path.endsWith('/.ingest.json')) return path.slice(0, -'/.ingest.json'.length);
  if (path.endsWith('.ingest.json')) return `${path.slice(0, -'.ingest.json'.length)}.md`;
  return null;
}

function asReport(value: unknown): SourceResourceReport | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record['generatedAt'] !== 'string' ||
    typeof record['analyzedWithModel'] !== 'boolean' ||
    !Array.isArray(record['resources']) ||
    !Array.isArray(record['descriptionLinks'])
  ) {
    return null;
  }
  return value as SourceResourceReport;
}

function rawKind(value: unknown, path: string): RawSource['kind'] {
  if (
    value === 'youtube' ||
    value === 'file' ||
    value === 'url' ||
    value === 'text' ||
    value === 'bundle'
  ) {
    return value;
  }
  return path.startsWith('raw/youtube/') ? 'youtube' : 'bundle';
}

async function sourceFor(services: Services, path: string): Promise<RawSource> {
  const safe = assertSafeVaultPath(path);
  const source = requireLists(services)
    .sources()
    .find((entry) => entry.path === safe);
  if (source !== undefined) return source;

  /* A finished job can beat the asynchronous index refresh. Its protocol is
     already durable, so the detail window can still open immediately. */
  const log = await readIngestLog(wikiStore(services), safe);
  if (log === null) throw fail('not-found', `keine Quelle: ${safe}`);
  return {
    path: safe,
    title: typeof log.title === 'string' ? log.title : (safe.split('/').pop() ?? safe),
    kind: rawKind(log.kind, safe),
    ingestedAt: typeof log.ingestedAt === 'string' ? log.ingestedAt : '',
    sourcePage: typeof log.sourcePage === 'string' ? log.sourcePage : null,
    origin: typeof log.origin === 'string' ? log.origin : null,
    bytes: 0,
    modules: Array.isArray(log.modules)
      ? log.modules.filter((entry): entry is string => typeof entry === 'string')
      : [],
  };
}

async function attachments(services: Services, source: RawSource): Promise<SourceAttachment[]> {
  if (source.kind !== 'youtube') return [];
  const dir = `${source.path}/sources`;
  const found: SourceAttachment[] = [];
  for await (const entry of services.requireStore().walk({
    dir,
    recursive: false,
    includeDirs: true,
  })) {
    found.push({
      name: entry.path.split('/').pop() ?? entry.path,
      path: entry.path,
      bytes: entry.dir ? null : entry.size,
      directory: entry.dir,
    });
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

export async function sourceDetail(services: Services, path: string): Promise<SourceDetail> {
  const source = await sourceFor(services, path);
  const log = await readIngestLog(wikiStore(services), source.path);
  let resourceReport = asReport(log?.['resourceReport']);
  if (resourceReport === null && source.kind === 'youtube') {
    resourceReport = await youtubeResourceFallback(
      wikiStore(services),
      source.path,
      log?.ingestedAt ?? source.ingestedAt,
    );
  }
  return { source, resourceReport, attachments: await attachments(services, source) };
}

/** Full resource analysis, persisted in the ingest protocol so it travels with the vault. */
export async function analyzeResourceDetail(
  services: Services,
  path: string,
  signal?: AbortSignal,
): Promise<SourceDetail> {
  const source = await sourceFor(services, path);
  if (source.kind !== 'youtube') throw fail('invalid', 'Ressourcenpruefung gilt nur fuer YouTube');
  const report = await analyzeYoutubeResources({
    store: wikiStore(services),
    gateway: createGateway(services),
    rawPath: source.path,
    ...(signal === undefined ? {} : { signal }),
  });
  await patchIngestLog(wikiStore(services), source.path, { resourceReport: report });
  return sourceDetail(services, source.path);
}

/** Scan protocols, including legacy ones, before a new queue entry can write anything. */
export async function findDuplicate(
  services: Services,
  kind: IngestKind,
  input: string,
): Promise<string | null> {
  const wanted = sourceFingerprint(kind, input);
  const store = services.requireStore();
  for await (const entry of store.walk({ dir: 'raw' })) {
    const rawPath = rawPathFromLog(entry.path);
    if (rawPath === null) continue;
    const text = await store.readText(entry.path);
    if (text === null) continue;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      const record = parsed as Record<string, unknown>;
      const fingerprint =
        typeof record['fingerprint'] === 'string'
          ? record['fingerprint']
          : legacyFingerprint(record['kind'], record['origin']);
      if (fingerprint === wanted) return rawPath;
    } catch {
      // A broken protocol remains visible in the index, but cannot prove a duplicate.
    }
  }
  return null;
}

async function youtubeSource(services: Services, path: string): Promise<RawSource> {
  const source = await sourceFor(services, path);
  if (source.kind !== 'youtube' || !source.path.startsWith('raw/youtube/')) {
    throw fail('invalid', 'Dateien koennen nur YouTube-Quellen ergaenzen');
  }
  return source;
}

async function availableTarget(dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    const candidate = suffix === 1 ? name : `${stem}-${suffix}${extension}`;
    try {
      await stat(join(dir, candidate));
    } catch {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${extension}`;
}

/** Copy selected files without ever overwriting a manually supplied attachment. */
export async function attachSourceFiles(
  services: Services,
  path: string,
  externalPaths: readonly string[],
): Promise<{ detail: SourceDetail; copied: string[] }> {
  const source = await youtubeSource(services, path);
  const relativeDir = `${source.path}/sources`;
  const store = services.requireStore();
  await wikiStore(services).mkdir(relativeDir);
  const absoluteDir = join(store.root, ...relativeDir.split('/'));
  const copied: string[] = [];
  for (const external of externalPaths) {
    const safeName = sanitizeSegment(basename(external));
    const targetName = await availableTarget(absoluteDir, safeName);
    await copyFile(external, join(absoluteDir, targetName), constants.COPYFILE_EXCL);
    copied.push(`${relativeDir}/${targetName}`);
  }
  return { detail: await sourceDetail(services, source.path), copied };
}
