/**
 * Ein Auftrag der Warteschlange: anlegen, kopieren, Fehler benennen.
 *
 * Getrennt von `queue.ts`, weil das zwei Verantwortungen sind: hier steht, wie ein
 * `IngestJob` aussieht und was ein Fehler daran macht — dort, wann etwas laeuft.
 */

import type { IngestKind, IngestJob, IngestStage } from '@shared/types';
import type { IngestError } from './types';
import type { WikiError } from '@core/wiki/types';

/** Stufen, bei denen nichts mehr laeuft. */
export const TERMINAL_STAGES: ReadonlySet<IngestStage> = new Set<IngestStage>([
  'done',
  'error',
  'duplicate',
  'awaiting-llm',
  'no-content',
]);

/** Laenge der Bezeichnung eines Auftrags in der Liste. */
const LABEL_CHARS = 80;

export interface AddJobInput {
  kind: IngestKind;
  input: string;
  module?: string | null;
  /** What to build the page from, for `addExisting`. Undefined behaves as `'transcript'`. */
  basis?: 'transcript' | 'metadata';
}

/** Kurzform der Eingabe fuer die Liste — eine Zeile, ohne Umbrueche. */
export function jobLabel(input: string): string {
  const text = input.replace(/\s+/g, ' ').trim();
  return text.length <= LABEL_CHARS ? text : `${text.slice(0, LABEL_CHARS - 1)}…`;
}

/** Ein frischer Auftrag: wartend, ohne Fortschritt, ohne Fehler. */
export function createJob(id: string, input: AddJobInput, startedAt: string): IngestJob {
  return {
    id,
    kind: input.kind,
    input: input.input,
    label: jobLabel(input.input),
    module: input.module ?? null,
    stage: 'queued',
    progress: 0,
    message: null,
    error: null,
    startedAt,
    finishedAt: null,
    rawPath: null,
    touchedPages: [],
    basis: input.basis,
  };
}

/** Kopie ohne gemeinsame Liste — niemand ausserhalb aendert einen laufenden Auftrag. */
export function copyJob(job: IngestJob): IngestJob {
  return { ...job, touchedPages: [...job.touchedPages] };
}

/**
 * Die Codes, die `IngestError` und `WikiError` tatsaechlich vergeben — die
 * einzigen, fuer die `error.code.*` in beiden Sprachen einen Satz hat
 * (tests/renderer/i18n.test.ts). Ein `errno` wie `ENOSPC` oder `EACCES` von
 * einem ungewrappten Dateisystemfehler ist kein Mitglied dieser Menge: ohne
 * diese Schranke wuerde `describeFailure` ihn ungeprueft durchreichen, und die
 * Oberflaeche zeigt dann den rohen, unuebersetzten Key statt eines Satzes.
 */
type KnownErrorCode = IngestError['code'] | WikiError['code'];
const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<KnownErrorCode>([
  'invalid',
  'not-found',
  'io',
  'cancelled',
  'unknown',
  'conflict',
]);

/**
 * Ein Fehler mit einem `code`, wie ihn `IngestError`, `WikiError` und jeder
 * kuenftige Fehlertyp mit demselben `IpcError.code`-Vertrag traegt. Strukturell
 * geprueft (duck-typed), nicht per `instanceof` — 051 und 064 bringen eigene
 * Fehlerklassen mit, die hier ohne Aenderung an dieser Funktion durchgereicht
 * werden sollen. Beschraenkt auf `KNOWN_ERROR_CODES`: ein `code`, den keine
 * dieser Klassen vergibt (ein roher `errno` zum Beispiel), zaehlt hier nicht als
 * benannter Fehler und faellt auf `unknown` zurueck (Story 050, D8).
 */
function hasErrorCode(error: unknown): error is { code: KnownErrorCode; message: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    KNOWN_ERROR_CODES.has((error as { code: string }).code)
  );
}

/**
 * Fehler in Code und Text zerlegen. Der Code entspricht `IpcError.code` und wird in
 * `IngestJob.error` gelegt; die Oberflaeche formuliert daraus den Satz und zeigt den
 * technischen Text nur hinter „Details anzeigen".
 */
export function describeFailure(error: unknown): { code: string; message: string } {
  if (hasErrorCode(error)) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'unknown', message: error.message };
  return { code: 'unknown', message: String(error) };
}
