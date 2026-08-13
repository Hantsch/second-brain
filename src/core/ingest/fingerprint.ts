/** Stable identities used to stop the same source before it is written twice. */

import { sha256 } from '@core/vault/hash';
import type { IngestKind } from '@shared/types';
import { parseVideoId } from './youtube/video-url';

function canonicalUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|si)$/i.test(key)) url.searchParams.delete(key);
    }
    const rendered = url.toString();
    return rendered.endsWith('/') && url.pathname === '/'
      ? rendered.slice(0, -1)
      : rendered.replace(/\/$/, '');
  } catch {
    return input.trim();
  }
}

function canonicalFilePath(input: string): string {
  const normalized = input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
}

/** Identity from the user's original input; it contains no source contents. */
export function sourceFingerprint(kind: IngestKind, input: string): string {
  const raw = String(input ?? '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (kind === 'youtube') {
    const videoId = parseVideoId(raw);
    return `youtube:${videoId ?? canonicalUrl(raw)}`;
  }
  if (kind === 'url') return `url:${canonicalUrl(raw)}`;
  if (kind === 'file') return `file:${canonicalFilePath(raw)}`;
  return `text:${sha256(raw)}`;
}

/** Legacy logs did not store a fingerprint; origin still identifies URL and file sources. */
export function legacyFingerprint(kind: unknown, origin: unknown): string | null {
  if (typeof origin !== 'string') return null;
  if (kind !== 'youtube' && kind !== 'url' && kind !== 'file') return null;
  return sourceFingerprint(kind, origin);
}

/** Identity of a raw source as its protocol records it, legacy logs included. */
export function logFingerprint(log: Record<string, unknown>): string | null {
  const stored = log['fingerprint'];
  if (typeof stored === 'string' && stored.length > 0) return stored;
  return legacyFingerprint(log['kind'], log['origin']);
}
