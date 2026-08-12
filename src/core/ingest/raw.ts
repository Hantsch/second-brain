/**
 * Der Ort unter `raw/` und das Protokoll `.ingest.json`.
 *
 * Zwei Regeln aus docs/VAULT-FORMAT.md bestimmen alles hier:
 * 1. **Eine Rohquelle wird nie ueberschrieben.** Sie ist der Fixpunkt, den Zitate
 *    belegen. Ist der Platz belegt, kommt ein neuer, datierter Nachbar dazu.
 * 2. **Jede Quelle traegt `.ingest.json`** — als Datei im Ordner, oder als
 *    Geschwisterdatei `<stamm>.ingest.json`, wo es keinen Ordner gibt.
 *
 * Das Protokoll ist Buchhaltung *ueber* die Quelle, nicht die Quelle selbst:
 * `sourcePage` und `modules` werden nachgetragen, sobald die Verdichtung gelaufen ist
 * — sonst koennte niemand je sehen, welche Quelle noch unverdichtet liegt.
 */

import { ingestLogPath, rawPath } from '@core/vault/paths';
import type { DateLike, RawKind } from '@core/vault/paths';
import type { IngestKind } from '@shared/types';
import { IngestError } from './types';
import type { IngestNote, IngestStore } from './types';

/** So viele Namensvarianten werden probiert, bevor ein Zeitstempel angehaengt wird. */
const MAX_ATTEMPTS = 50;

export interface IngestLogRecord {
  kind: IngestKind;
  origin: string;
  ingestedAt: string;
  title: string;
  /** Slug der Wiki-Source-Seite, sobald verdichtet wurde. */
  sourcePage: string | null;
  modules: string[];
  provenance: Record<string, string>;
  notes?: IngestNote[];
  /** Was zusaetzlich festzuhalten ist (Provider, Transcript-Kennzahlen). */
  [extra: string]: unknown;
}

/** ISO-Zeitstempel mit Zeitzone, wie VAULT-FORMAT.md es verlangt. */
export function isoStamp(now: DateLike = new Date()): string {
  const date = now instanceof Date ? now : new Date(now);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const pad = (value: number): string => String(Math.floor(Math.abs(value))).padStart(2, '0');
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
}

/** Pfad des Protokolls: im Ordner, oder als Geschwisterdatei neben `<stamm>.md`. */
export function logPathFor(rawTarget: string): string {
  if (rawTarget.endsWith('.md')) return `${rawTarget.slice(0, -3)}.ingest.json`;
  return ingestLogPath(rawTarget);
}

/**
 * Ein freier Platz unter `raw/`. Bei Kollision wird `-2`, `-3` … an den Slug
 * gehaengt — die vorhandene Quelle bleibt unberuehrt.
 */
export async function freeRawPath(
  store: IngestStore,
  kind: RawKind,
  slug: string,
  now: DateLike = new Date(),
): Promise<string> {
  const first = rawPath(kind, slug, now);
  if (!(await store.exists(logPathFor(first)))) return first;
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = rawPath(kind, `${slug}-${attempt}`, now);
    if (!(await store.exists(logPathFor(candidate)))) return candidate;
  }
  return rawPath(kind, `${slug}-${Date.now()}`, now);
}

/** Das Protokoll schreiben. Zwei Leerzeichen Einrueckung, damit es lesbar bleibt. */
export async function writeIngestLog(
  store: IngestStore,
  rawTarget: string,
  record: IngestLogRecord,
): Promise<string> {
  const path = logPathFor(rawTarget);
  await store.writeText(path, `${JSON.stringify(record, null, 2)}\n`);
  return path;
}

/** Das Protokoll lesen; `null`, wenn es keines gibt oder es unlesbar ist. */
export async function readIngestLog(
  store: IngestStore,
  rawTarget: string,
): Promise<IngestLogRecord | null> {
  const text = await store.readText(logPathFor(rawTarget));
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as IngestLogRecord;
  } catch {
    return null;
  }
}

/**
 * Felder im Protokoll nachtragen (`sourcePage`, `modules`). Nur das Protokoll wird
 * angefasst — die Quelldateien selbst bleiben, wie sie hereinkamen.
 */
export async function patchIngestLog(
  store: IngestStore,
  rawTarget: string,
  patch: Partial<IngestLogRecord>,
): Promise<IngestLogRecord> {
  const existing = await readIngestLog(store, rawTarget);
  if (existing === null) {
    throw new IngestError('not-found', `Kein Protokoll zu ${rawTarget}.`);
  }
  const merged: IngestLogRecord = { ...existing, ...patch };
  await writeIngestLog(store, rawTarget, merged);
  return merged;
}
