/**
 * Eine Webseite aufnehmen: holen, Inhalt herausschaelen, als Markdown unter
 * `raw/web/<datum>-<slug>.md` ablegen.
 *
 * Vier Vorsichtsmassnahmen, weil das Netz nicht mitspielt:
 * - **Timeout** (Standard 30 s) — ein haengender Abruf blockiert sonst die Queue.
 * - **Groessenlimit** 5 MB, gezaehlt beim Lesen; danach wird abgeschnitten und der
 *   Nutzer erfaehrt es (`content-truncated`).
 * - **Content-Type-Pruefung**: nur Text wird ausgelesen. Ein PDF oder ein Bild wird
 *   ehrlich abgelehnt, statt Binaermuell zu verdichten.
 * - **Redirects** folgt `fetch` selbst (`redirect: 'follow'`); die Endadresse wird
 *   als Herkunft protokolliert, nicht die eingegebene.
 */

import { hostOf as hostOfUrl } from '@core/text/url';
import { slugify } from '@core/vault/paths';
import { htmlToArticle } from './html';
import { markdownDoc } from './markdown';
import { freeRawPath, isoStamp, writeIngestLog } from './raw';
import { IngestError, throwIfCancelled } from './types';
import type { IngestContext, IngestNote, IngestOutcome, SourceIngestor } from './types';

/** Groessenlimit einer abgerufenen Seite. */
export const MAX_BYTES = 5 * 1024 * 1024;

export const FETCH_TIMEOUT_MS = 30_000;

const TEXT_TYPES = [
  'text/html',
  'application/xhtml',
  'text/plain',
  'text/markdown',
  'application/json',
];

/** Sieht die Eingabe wie eine http(s)-Adresse aus? */
export function isHttpUrl(input: string): boolean {
  const raw = String(input ?? '').trim();
  if (!/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    return url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Titel aus der Adresse, wenn die Seite keinen nennt: der letzte sprechende Teil. */
export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname
      .split('/')
      .filter((part) => part.length > 0)
      .pop();
    if (last === undefined) return parsed.hostname;
    return decodeURIComponent(last)
      .replace(/\.[a-z0-9]{1,5}$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  } catch {
    return url;
  }
}

function contentTypeOf(response: Response): string {
  return (response.headers.get('content-type') ?? '').toLowerCase();
}

/**
 * Antwortrumpf als Text lesen, hoechstens `MAX_BYTES`. Ohne Stream (Test-Fakes
 * liefern gern nur `text()`) wird der Text nachtraeglich gekappt.
 */
export async function readLimited(
  response: Response,
  limit = MAX_BYTES,
): Promise<{ text: string; truncated: boolean }> {
  const body = response.body as ReadableStream<Uint8Array> | null | undefined;
  if (body === null || body === undefined || typeof body.getReader !== 'function') {
    const text = await response.text();
    return text.length > limit
      ? { text: text.slice(0, limit), truncated: true }
      : { text, truncated: false };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done === true) break;
    if (value === undefined) continue;
    chunks.push(value);
    size += value.byteLength;
    if (size >= limit) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder('utf-8').decode(merged), truncated };
}

export interface FetchedPage {
  /** Endadresse nach allen Weiterleitungen. */
  url: string;
  title: string;
  markdown: string;
  contentType: string;
  notes: IngestNote[];
}

/** Seite holen und in Markdown verwandeln — ohne den Vault anzufassen. */
export async function fetchPage(input: string, ctx: IngestContext): Promise<FetchedPage> {
  const fetchImpl = ctx.fetchImpl;
  if (fetchImpl === undefined) {
    throw new IngestError('invalid', 'Kein fetch eingerichtet.');
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), FETCH_TIMEOUT_MS);
  const onOuterAbort = (): void => timeout.abort();
  ctx.signal?.addEventListener('abort', onOuterAbort, { once: true });

  let response: Response;
  try {
    response = await fetchImpl(input, {
      redirect: 'follow',
      signal: timeout.signal,
      headers: { accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
    });
  } catch (error) {
    throwIfCancelled(ctx.signal);
    throw new IngestError('io', `Die Adresse war nicht erreichbar: ${hostOf(input)}.`, {
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    ctx.signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    throw new IngestError('io', `${hostOf(input)} antwortete mit HTTP ${response.status}.`);
  }

  const contentType = contentTypeOf(response);
  const url = response.url !== undefined && response.url.length > 0 ? response.url : input;
  if (contentType.length > 0 && !TEXT_TYPES.some((type) => contentType.includes(type))) {
    throw new IngestError('invalid', 'Die Adresse liefert keinen Text.', { detail: contentType });
  }

  const { text, truncated } = await readLimited(response);
  const notes: IngestNote[] = truncated ? [{ code: 'content-truncated' }] : [];
  const looksLikeHtml =
    contentType.includes('html') || /<html[\s>]|<body[\s>]|<article[\s>]/i.test(text);

  const article = looksLikeHtml ? htmlToArticle(text) : { title: null, markdown: text.trim() };
  const title = article.title ?? titleFromUrl(url);
  return {
    url,
    title: title.length > 0 ? title : url,
    markdown: article.markdown,
    contentType,
    notes,
  };
}

function hostOf(url: string): string {
  return hostOfUrl(url, 'die Adresse');
}

export function createUrlIngestor(): SourceIngestor {
  return {
    kind: 'url',

    canHandle(input: string): boolean {
      return isHttpUrl(input);
    },

    async ingest(input: string, ctx: IngestContext): Promise<IngestOutcome> {
      const address = String(input ?? '').trim();
      if (!isHttpUrl(address)) {
        throw new IngestError('invalid', 'Das ist keine Web-Adresse.', { detail: address });
      }
      throwIfCancelled(ctx.signal);
      ctx.onProgress?.({ stage: 'fetching', progress: 0.2, message: null });

      const page = await fetchPage(address, ctx);
      throwIfCancelled(ctx.signal);
      ctx.onProgress?.({ stage: 'writing-raw', progress: 0.7, message: null });

      const now = ctx.now ?? new Date();
      const ingestedAt = isoStamp(now);
      const target = await freeRawPath(ctx.store, 'url', slugify(page.title), now);

      const content = markdownDoc(
        {
          doc_type: 'web',
          title: page.title,
          origin: page.url,
          fetched_at: ingestedAt,
          content_type: page.contentType.split(';')[0] ?? null,
        },
        [`# ${page.title}`, '', page.markdown],
      );
      await ctx.store.writeText(target, content);

      await writeIngestLog(ctx.store, target, {
        kind: 'url',
        origin: page.url,
        ingestedAt,
        title: page.title,
        sourcePage: null,
        modules: ctx.module === null || ctx.module === undefined ? [] : [ctx.module],
        provenance: { content: 'fetch', metadata: 'fetch' },
        notes: page.notes,
      });

      return {
        kind: 'url',
        rawPath: target,
        title: page.title,
        text: page.markdown,
        origin: page.url,
        provenance: { content: 'fetch', metadata: 'fetch' },
        notes: page.notes,
      };
    },
  };
}
