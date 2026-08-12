/**
 * Die Warteschlange des Aufnehmens.
 *
 * Bewusst einfach gehalten: eine Liste von Auftraegen, ein Pump-Loop, pro laufendem
 * Auftrag ein `AbortController`. Die Wahrheit ueber den Zustand liegt hier; die
 * Oberflaeche spiegelt sie nur (`event:ingest-progress`).
 *
 * Zwei Dinge sind hier Absicht:
 * - **Der Verdichtungsschritt kommt herein.** Diese Datei importiert `core/wiki`
 *   nicht; sie weiss nur, dass nach der Rohquelle etwas passieren *kann*. Fehlt der
 *   Schritt oder fehlt das Modell, endet der Auftrag als `awaiting-llm`: die
 *   Rohquelle liegt, die Verdichtung ist offen — und niemand behauptet etwas anderes.
 * - **Wiederholen legt keine zweite Rohquelle an.** Das Ergebnis des ersten Laufs
 *   bleibt am Auftrag haengen; ein `retry` setzt hinter der Rohquelle wieder an.
 */

import { copyJob, createJob, describeFailure, TERMINAL_STAGES } from './job';
import type { AddJobInput } from './job';
import { patchIngestLog } from './raw';
import { IngestError, throwIfCancelled } from './types';
import type {
  IngestContext,
  IngestOutcome,
  IngestProgressEvent,
  IngestStore,
  SourceIngestor,
} from './types';
import type { IngestJob, IngestKind } from '@shared/types';

export type { AddJobInput };

export const DEFAULT_CONCURRENCY = 2;

export interface CondenseInput {
  job: IngestJob;
  outcome: IngestOutcome;
  signal?: AbortSignal;
  onProgress?: (event: IngestProgressEvent) => void;
}

export interface CondenseResult {
  /** Geschriebene bzw. geaenderte Wiki-Seiten, vault-relativ. */
  pages: string[];
  /** Slug der angelegten Source-Seite. */
  sourcePage?: string | null;
  /** Module, zu denen verdichtet wurde. */
  modules?: string[];
}

/** Der Verdichtungsschritt — injiziert, damit die Queue `core/wiki` nicht kennt. */
export type CondenseStep = (input: CondenseInput) => Promise<CondenseResult>;

export interface IngestQueueDeps {
  store: IngestStore;
  ingestors: readonly SourceIngestor[];
  /** Umgebung je Auftrag: fetch, Prozessaufruf, Dateisystem, Sprachen, yt-dlp. */
  environment?: () => Omit<IngestContext, 'store' | 'onProgress' | 'signal' | 'module'>;
  condense?: CondenseStep;
  /** Steht ein Modell fuer die Verdichtung? Falsch heisst `awaiting-llm`. */
  llmAvailable?: () => boolean;
  concurrency?: () => number;
  onUpdate?: (job: IngestJob) => void;
  now?: () => Date;
  newId?: () => string;
}

interface Entry {
  job: IngestJob;
  controller: AbortController | null;
  /** Ergebnis des Rohquellen-Schritts, falls er schon lief. */
  outcome: IngestOutcome | null;
}

export class IngestQueue {
  private readonly deps: IngestQueueDeps;
  private readonly entries: Entry[] = [];
  private sequence = 0;

  constructor(deps: IngestQueueDeps) {
    this.deps = deps;
  }

  /** Einen Auftrag anhaengen und den Pump-Loop antreiben. */
  add(input: AddJobInput): IngestJob {
    this.sequence += 1;
    const id = this.deps.newId?.() ?? `ingest-${this.sequence}`;
    const job = createJob(id, input, this.stamp());
    this.entries.push({ job, controller: null, outcome: null });
    this.emit(job);
    this.pump();
    return copyJob(job);
  }

  /** Queue only the condensation phase for a raw source that is already in the vault. */
  addExisting(input: AddJobInput, outcome: IngestOutcome): IngestJob {
    this.sequence += 1;
    const id = this.deps.newId?.() ?? `ingest-${this.sequence}`;
    const job = createJob(id, input, this.stamp());
    job.rawPath = outcome.rawPath;
    this.entries.push({ job, controller: null, outcome });
    this.emit(job);
    this.pump();
    return copyJob(job);
  }

  /** Record a stopped duplicate import without touching or condensing the existing source. */
  addDuplicate(input: AddJobInput, rawPath: string): IngestJob {
    this.sequence += 1;
    const id = this.deps.newId?.() ?? `ingest-${this.sequence}`;
    const job = createJob(id, input, this.stamp());
    Object.assign(job, {
      stage: 'duplicate' as const,
      progress: 1,
      finishedAt: this.stamp(),
      rawPath,
      duplicateOf: rawPath,
    });
    this.entries.push({ job, controller: null, outcome: null });
    this.emit(job);
    return copyJob(job);
  }

  /** Alle Auftraege, juengster zuletzt — Kopien, nichts Lebendiges. */
  jobs(): IngestJob[] {
    return this.entries.map((entry) => copyJob(entry.job));
  }

  job(id: string): IngestJob | null {
    const entry = this.find(id);
    return entry === null ? null : copyJob(entry.job);
  }

  /**
   * Abbrechen. Ein wartender Auftrag wird sofort beendet, ein laufender ueber sein
   * Signal — der Kern prueft es zwischen allen Schritten.
   */
  cancel(id: string): boolean {
    const entry = this.find(id);
    if (entry === null || TERMINAL_STAGES.has(entry.job.stage)) return false;
    if (entry.controller !== null) {
      entry.controller.abort();
      return true;
    }
    this.fail(entry, new IngestError('cancelled', 'Aufnahme abgebrochen.'));
    this.pump();
    return true;
  }

  cancelAll(): void {
    for (const entry of [...this.entries]) {
      if (!TERMINAL_STAGES.has(entry.job.stage)) this.cancel(entry.job.id);
    }
  }

  /**
   * Wiederholen. Liegt die Rohquelle schon, setzt der Lauf hinter ihr an: eine
   * Rohquelle wird nie zweimal geschrieben.
   */
  retry(id: string): IngestJob {
    const entry = this.find(id);
    if (entry === null) throw new IngestError('not-found', `Kein Auftrag ${id}.`);
    if (entry.job.stage === 'duplicate') return copyJob(entry.job);
    if (!TERMINAL_STAGES.has(entry.job.stage)) return copyJob(entry.job);
    this.update(entry, {
      stage: 'queued',
      progress: 0,
      message: null,
      error: null,
      finishedAt: null,
      touchedPages: [],
    });
    this.pump();
    return copyJob(entry.job);
  }

  /** Abgeschlossene Auftraege aus der Liste werfen; laufende bleiben. */
  clearFinished(): void {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry !== undefined && TERMINAL_STAGES.has(entry.job.stage))
        this.entries.splice(index, 1);
    }
  }

  private find(id: string): Entry | null {
    return this.entries.find((entry) => entry.job.id === id) ?? null;
  }

  private stamp(): string {
    return (this.deps.now?.() ?? new Date()).toISOString();
  }

  private emit(job: IngestJob): void {
    this.deps.onUpdate?.(copyJob(job));
  }

  private update(entry: Entry, patch: Partial<IngestJob>): void {
    Object.assign(entry.job, patch);
    this.emit(entry.job);
  }

  /** So viele Auftraege starten, wie die Parallelitaet erlaubt. */
  private pump(): void {
    const limit = Math.max(1, Number(this.deps.concurrency?.() ?? DEFAULT_CONCURRENCY) || 1);
    let running = this.entries.filter((entry) => entry.controller !== null).length;
    for (const entry of this.entries) {
      if (running >= limit) break;
      if (entry.job.stage !== 'queued' || entry.controller !== null) continue;
      running += 1;
      void this.run(entry);
    }
  }

  private ingestorFor(kind: IngestKind, input: string): SourceIngestor {
    const exact = this.deps.ingestors.find((candidate) => candidate.kind === kind);
    if (exact !== undefined) return exact;
    const guess = this.deps.ingestors.find((candidate) => candidate.canHandle(input));
    if (guess !== undefined) return guess;
    throw new IngestError('invalid', `Fuer ${kind} gibt es keinen Ingestor.`);
  }

  private async run(entry: Entry): Promise<void> {
    const controller = new AbortController();
    entry.controller = controller;
    this.update(entry, { stage: 'fetching', progress: 0, message: null, error: null });

    try {
      const outcome = entry.outcome ?? (await this.ingestRaw(entry, controller.signal));
      entry.outcome = outcome;
      // Auch ein Ingestor, der das Signal nicht selbst prueft, darf einen
      // abgebrochenen Auftrag nicht als Erfolg melden.
      throwIfCancelled(controller.signal);
      this.update(entry, { rawPath: outcome.rawPath, stage: 'writing-raw', progress: 0.8 });
      await this.condense(entry, outcome, controller.signal);
    } catch (error) {
      this.fail(entry, error);
    } finally {
      entry.controller = null;
      this.pump();
    }
  }

  private async ingestRaw(entry: Entry, signal: AbortSignal): Promise<IngestOutcome> {
    const ingestor = this.ingestorFor(entry.job.kind, entry.job.input);
    const environment = this.deps.environment?.() ?? {};
    const context: IngestContext = {
      ...environment,
      store: this.deps.store,
      module: entry.job.module,
      signal,
      onProgress: (event) => {
        this.update(entry, {
          stage: event.stage,
          progress: event.progress,
          message: event.message,
        });
      },
    };
    return ingestor.ingest(entry.job.input, context);
  }

  /** Verdichten, wenn es geht. Sonst ehrlich sagen, dass die Quelle liegt. */
  private async condense(entry: Entry, outcome: IngestOutcome, signal: AbortSignal): Promise<void> {
    const step = this.deps.condense;
    const available = this.deps.llmAvailable?.() ?? step !== undefined;
    if (step === undefined || !available || outcome.text.trim().length === 0) {
      this.update(entry, {
        stage: 'awaiting-llm',
        progress: 1,
        message: outcome.text.trim().length === 0 ? (outcome.notes[0]?.code ?? null) : null,
        finishedAt: this.stamp(),
      });
      return;
    }

    this.update(entry, { stage: 'summarizing', progress: 0.85, message: null });
    const result = await step({
      job: copyJob(entry.job),
      outcome,
      signal,
      onProgress: (event) => {
        this.update(entry, {
          stage: event.stage,
          progress: event.progress,
          message: event.message,
        });
      },
    });

    this.update(entry, { stage: 'wiki-update', progress: 0.95, touchedPages: [...result.pages] });
    await this.recordCondensed(outcome, result);
    this.update(entry, {
      stage: 'done',
      progress: 1,
      message: null,
      finishedAt: this.stamp(),
    });
  }

  /**
   * Im Protokoll nachtragen, dass verdichtet wurde. Ohne das koennte der Pflegelauf
   * eine verdichtete Quelle nie von einer unverdichteten unterscheiden.
   */
  private async recordCondensed(outcome: IngestOutcome, result: CondenseResult): Promise<void> {
    const patch: { sourcePage?: string | null; modules?: string[] } = {};
    if (result.sourcePage !== undefined) patch.sourcePage = result.sourcePage;
    if (result.modules !== undefined && result.modules.length > 0) patch.modules = result.modules;
    if (Object.keys(patch).length === 0) return;
    await patchIngestLog(this.deps.store, outcome.rawPath, patch).catch(() => undefined);
  }

  private fail(entry: Entry, error: unknown): void {
    const { code, message } = describeFailure(error);
    this.update(entry, {
      stage: 'error',
      progress: entry.job.progress,
      error: code,
      message,
      finishedAt: this.stamp(),
    });
  }
}
