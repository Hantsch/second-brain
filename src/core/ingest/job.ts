/**
 * Ein Auftrag der Warteschlange: anlegen, kopieren, Fehler benennen.
 *
 * Getrennt von `queue.ts`, weil das zwei Verantwortungen sind: hier steht, wie ein
 * `IngestJob` aussieht und was ein Fehler daran macht — dort, wann etwas laeuft.
 */

import { IngestError } from './types';
import type { IngestKind, IngestJob, IngestStage } from '@shared/types';

/** Stufen, bei denen nichts mehr laeuft. */
export const TERMINAL_STAGES: ReadonlySet<IngestStage> = new Set<IngestStage>([
  'done',
  'error',
  'awaiting-llm',
]);

/** Laenge der Bezeichnung eines Auftrags in der Liste. */
const LABEL_CHARS = 80;

export interface AddJobInput {
  kind: IngestKind;
  input: string;
  module?: string | null;
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
  };
}

/** Kopie ohne gemeinsame Liste — niemand ausserhalb aendert einen laufenden Auftrag. */
export function copyJob(job: IngestJob): IngestJob {
  return { ...job, touchedPages: [...job.touchedPages] };
}

/**
 * Fehler in Code und Text zerlegen. Der Code entspricht `IpcError.code` und wird in
 * `IngestJob.error` gelegt; die Oberflaeche formuliert daraus den Satz und zeigt den
 * technischen Text nur hinter „Details anzeigen".
 */
export function describeFailure(error: unknown): { code: string; message: string } {
  if (error instanceof IngestError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: 'unknown', message: error.message };
  return { code: 'unknown', message: String(error) };
}
