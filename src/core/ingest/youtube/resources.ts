/** Resource report for workflows, models, files, and repositories mentioned by a video. */

import { isAbortError } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import type {
  SourceResourceLink,
  SourceResourceMention,
  SourceResourceReport,
} from '@shared/types';
import type { IngestStore } from '../types';
import { YOUTUBE_FILES } from './writer';

const CHUNK_CHARS = 24_000;
const CHUNK_OVERLAP = 600;
const MAX_CHUNKS = 8;

export const RESOURCE_REPORT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['resources'],
  properties: {
    resources: {
      type: 'array',
      maxItems: 30,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'mention', 'location', 'timestamp', 'linkUrls'],
        properties: {
          name: { type: 'string' },
          mention: { type: 'string' },
          location: { type: 'string', enum: ['video', 'description'] },
          timestamp: { type: ['string', 'null'] },
          linkUrls: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

interface YoutubeResourceContext {
  description: string;
  links: SourceResourceLink[];
  transcript: string;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function linksFrom(value: unknown): SourceResourceLink[] {
  if (!Array.isArray(value)) return [];
  const found: SourceResourceLink[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const url = asText(record['url']);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    found.push({ url, label: asText(record['context']) ?? asText(record['label']) });
  }
  return found;
}

async function contextFrom(store: IngestStore, rawPath: string): Promise<YoutubeResourceContext> {
  const raw = await store.readText(`${rawPath}/${YOUTUBE_FILES.metadataJson}`);
  let metadata: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metadata = parsed as Record<string, unknown>;
    }
  } catch {
    metadata = {};
  }
  const timestamped = await store.readText(`${rawPath}/${YOUTUBE_FILES.transcriptTimestamped}`);
  const prose = await store.readText(`${rawPath}/${YOUTUBE_FILES.transcript}`);
  return {
    description: asText(metadata['description']) ?? '',
    links: linksFrom(metadata['links']),
    transcript: timestamped ?? prose ?? '',
  };
}

/** Honest fallback for an uncondensed or legacy source: links, without inferred mentions. */
export async function youtubeResourceFallback(
  store: IngestStore,
  rawPath: string,
  generatedAt: string,
): Promise<SourceResourceReport> {
  const context = await contextFrom(store, rawPath);
  return {
    generatedAt,
    analyzedWithModel: false,
    model: null,
    resources: [],
    descriptionLinks: context.links,
  };
}

function chunks(text: string): string[] {
  const normalized = text.trim();
  if (normalized.length === 0) return [''];
  const out: string[] = [];
  for (
    let offset = 0;
    offset < normalized.length && out.length < MAX_CHUNKS;
    offset += CHUNK_CHARS - CHUNK_OVERLAP
  ) {
    out.push(normalized.slice(offset, offset + CHUNK_CHARS));
  }
  return out;
}

function prompt(context: YoutubeResourceContext, transcript: string): string {
  const links = context.links
    .map((link) => `- ${link.label === null ? '' : `${link.label}: `}${link.url}`)
    .join('\n');
  return [
    'Find downloadable or reusable resources explicitly mentioned in this YouTube video.',
    'Resources include workflows, JSON files, templates, code repositories, models, checkpoints, datasets, documents, and project files.',
    'Do not list sponsors, social profiles, generic tools, or products unless the video says a concrete resource can be obtained there.',
    'Do not invent a URL. linkUrls may contain only exact URLs from the supplied description links.',
    'Use location "video" for transcript evidence and "description" for description evidence.',
    'Keep mention short and factual. Use a timestamp only when one is present in the transcript line.',
    '',
    'Description:',
    context.description || '(empty)',
    '',
    'Description links:',
    links || '(none)',
    '',
    'Transcript excerpt:',
    transcript || '(empty)',
  ].join('\n');
}

function mentionsFrom(
  text: string,
  allowed: Map<string, SourceResourceLink>,
): SourceResourceMention[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
  const resources = (parsed as Record<string, unknown>)['resources'];
  if (!Array.isArray(resources)) return [];
  const result: SourceResourceMention[] = [];
  for (const item of resources) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const name = asText(record['name']);
    const mention = asText(record['mention']);
    const location = record['location'];
    if (name === null || mention === null || (location !== 'video' && location !== 'description')) {
      continue;
    }
    const linked = Array.isArray(record['linkUrls'])
      ? record['linkUrls']
          .map((url) => (typeof url === 'string' ? allowed.get(url) : undefined))
          .filter((link): link is SourceResourceLink => link !== undefined)
      : [];
    result.push({
      name,
      mention,
      location,
      timestamp: asText(record['timestamp']),
      links: linked,
    });
  }
  return result;
}

function mergeMentions(items: readonly SourceResourceMention[]): SourceResourceMention[] {
  const merged = new Map<string, SourceResourceMention>();
  for (const item of items) {
    const key = `${item.name.toLowerCase()}|${item.timestamp ?? ''}|${item.location}`;
    const known = merged.get(key);
    if (known === undefined) {
      merged.set(key, item);
      continue;
    }
    const urls = new Set(known.links.map((link) => link.url));
    merged.set(key, {
      ...known,
      links: [...known.links, ...item.links.filter((link) => !urls.has(link.url))],
    });
  }
  return [...merged.values()];
}

export interface AnalyzeYoutubeResourcesOptions {
  store: IngestStore;
  gateway: LlmGateway;
  rawPath: string;
  signal?: AbortSignal;
  now?: () => Date;
}

/** Model-backed check. A provider failure leaves the safe description-link fallback intact. */
export async function analyzeYoutubeResources(
  options: AnalyzeYoutubeResourcesOptions,
): Promise<SourceResourceReport> {
  const generatedAt = (options.now?.() ?? new Date()).toISOString();
  const context = await contextFrom(options.store, options.rawPath);
  const fallback: SourceResourceReport = {
    generatedAt,
    analyzedWithModel: false,
    model: null,
    resources: [],
    descriptionLinks: context.links,
  };
  if (!options.gateway.isAvailable('summarize-source')) return fallback;

  const allowed = new Map(context.links.map((link) => [link.url, link]));
  const found: SourceResourceMention[] = [];
  let model: string | null = null;
  try {
    for (const chunk of chunks(context.transcript)) {
      const result = await options.gateway.complete({
        task: 'summarize-source',
        messages: [{ role: 'user', content: prompt(context, chunk) }],
        schema: RESOURCE_REPORT_SCHEMA,
        maxTokens: 1800,
        temperature: 0,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      model = `${result.model.providerId}/${result.model.model}`;
      found.push(...mentionsFrom(result.text, allowed));
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    return fallback;
  }
  return {
    ...fallback,
    analyzedWithModel: true,
    model,
    resources: mergeMentions(found),
  };
}
