/* What may be changed in a project's frontmatter — and in what form.

   Two rules from docs/VAULT-FORMAT.md are embedded here:

   1. **Unknown fields are preserved.** The store merges (`composeContent`),
      so only the patch is validated here, never the existing frontmatter
      rewritten from scratch.
   2. **What the app doesn't know, it doesn't write.** An unknown field in the
      patch is an error, not a silent omission: otherwise the UI would report
      success for something that didn't happen.

   `type`, `slug`, and `scope` are not changeable — they're embedded in the
   file path. Changing the scope means moving a file; that's a separate
   operation, not a frontmatter change. */

import type { ProjectFrontmatter, WaitingOn } from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { fail } from './errors';

/* `status_set` and `next_step_set` are deliberately absent: the app stamps them
   itself when it writes the paired field, so a caller sending them lands in the
   "unknown field" branch below — which is the honest answer, because `by` is not
   the caller's to claim. */
/** Fields that `projects:patch` is allowed to write. */
const WRITABLE = [
  'title',
  'status',
  'priority',
  'favorite',
  'started',
  'deadline',
  'next_step',
  'waiting_on',
  'modules',
  'repos',
  'tags',
] as const;

/** Fields that exist but not via this path. */
const LOCKED: readonly string[] = ['type', 'slug', 'scope', 'created', 'updated'];

const MAX_TEXT = 300;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function invalid(field: string, reason: string): never {
  throw fail('invalid', `${field}: ${reason}`);
}

function asText(field: string, value: unknown, max = MAX_TEXT): string {
  if (typeof value !== 'string') invalid(field, 'erwartet Text');
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0) invalid(field, 'darf nicht leer sein');
  return text.slice(0, max);
}

function asDay(field: string, value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!DAY.test(text)) invalid(field, 'erwartet ein Datum YYYY-MM-DD');
  return text;
}

function asList(field: string, value: unknown): string[] {
  if (!Array.isArray(value)) invalid(field, 'erwartet eine Liste');
  return value.map((entry, at) => asText(`${field}[${at}]`, entry));
}

/**
 * A `waiting_on` entry. Unknown fields of an entry are preserved — within the
 * list too the rule holds: whatever the user wrote survives.
 */
function asWaiting(field: string, value: unknown): WaitingOn & Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(field, 'erwartet einen Eintrag mit who und what');
  }
  const record = value as Record<string, unknown>;
  const entry: WaitingOn & Record<string, unknown> = {
    ...record,
    who: asText(`${field}.who`, record['who'], 120),
    what: typeof record['what'] === 'string' ? asText(`${field}.what`, record['what']) : '',
    since: asDay(`${field}.since`, record['since']),
  };
  if (record['due'] !== undefined && record['due'] !== null) {
    entry.due = asDay(`${field}.due`, record['due']);
  }
  if (record['resolved'] !== undefined) entry.resolved = record['resolved'] === true;
  return entry;
}

function asPriority(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number)) invalid('priority', 'erwartet eine Zahl von 1 bis 5');
  const whole = Math.trunc(number);
  if (whole < 1 || whole > 5) invalid('priority', 'liegt zwischen 1 und 5');
  return whole;
}

/**
 * The validated patch, ready for `VaultStore.write`. `null` as a value
 * explicitly means "clear the field"; `undefined` never occurs here.
 */
export function checkProjectPatch(patch: Partial<ProjectFrontmatter>): Record<string, unknown> {
  if (patch === null || typeof patch !== 'object') throw fail('invalid', 'patch: erwartet Felder');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (LOCKED.includes(key)) {
      throw fail('invalid', `${key} steht im Dateipfad und lässt sich hier nicht ändern`);
    }
    if (!(WRITABLE as readonly string[]).includes(key)) {
      throw fail('invalid', `unbekanntes Projektfeld: ${key}`);
    }
    if (key === 'status') {
      if (!PROJECT_STATUSES.includes(value as ProjectFrontmatter['status'])) {
        invalid('status', `erwartet einen der Werte ${PROJECT_STATUSES.join(', ')}`);
      }
      out[key] = value;
      continue;
    }
    if (key === 'priority') {
      out[key] = value === null ? null : asPriority(value);
      continue;
    }
    if (key === 'favorite') {
      if (value !== true && value !== false) invalid('favorite', 'erwartet true oder false');
      out[key] = value;
      continue;
    }
    if (key === 'started' || key === 'deadline') {
      out[key] = value === null ? null : asDay(key, value);
      continue;
    }
    if (key === 'title') {
      out[key] = asText('title', value);
      continue;
    }
    if (key === 'next_step') {
      out[key] = value === null ? null : asText('next_step', value);
      continue;
    }
    if (key === 'waiting_on') {
      if (!Array.isArray(value)) invalid('waiting_on', 'erwartet eine Liste');
      out[key] = value.map((entry, at) => asWaiting(`waiting_on[${at}]`, entry));
      continue;
    }
    out[key] = asList(key, value);
  }
  if (Object.keys(out).length === 0) throw fail('invalid', 'patch: kein Feld angegeben');
  return out;
}

/**
 * Mark a single waiting-on entry as resolved. All other entries go back into
 * the file verbatim — including ones the app can't interpret.
 */
export function resolveWaitingEntry(raw: unknown, index: number): unknown[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw fail('not-found', 'dieses Projekt wartet auf niemanden');
  }
  if (!Number.isInteger(index) || index < 0 || index >= raw.length) {
    throw fail('not-found', `es gibt keinen Warte-auf-Eintrag ${index}`);
  }
  const target = raw[index];
  if (target === null || typeof target !== 'object' || Array.isArray(target)) {
    throw fail('invalid', `Warte-auf-Eintrag ${index} ist kein Eintrag`);
  }
  return raw.map((entry, at) =>
    at === index ? { ...(target as Record<string, unknown>), resolved: true } : entry,
  );
}
