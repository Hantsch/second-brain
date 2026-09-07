/**
 * Holds the RESULT of a finished work task (story 073) — the condensation
 * proposal or day-close suggestion a "run I walk away from" produced.
 *
 * Kept separate from the task record itself (`src/core/work/registry.ts`):
 * `WorkTask` only ever carries `hasResult: boolean`, never this payload, so
 * listing tasks never has to serialize a whole proposal. This store is the
 * other half — purely the payload, keyed by task id, with no knowledge of
 * IPC, Electron, or the tasks screen.
 *
 * Accept/reject handlers resolve a result by kind + subject ref as well as by
 * task id (`bySubject`), so a renderer that only knows "the condensation for
 * this project" can look one up without also having to track the task id —
 * the mark can't be forgotten because there's no other way in.
 *
 * Marking a result `accepted`/`rejected` keeps the record — so a caller can
 * still ask "was this marked, and how" via `status` — but drops the payload
 * itself: once marked, `get`/`bySubject` return null, the same way a filed
 * dump keeps its receipt in `inbox/` without holding a second copy of the
 * content it filed.
 */

import type { TaskResult } from '@shared/types';

export type TaskOutcome = 'accepted' | 'rejected';

interface Entry {
  subject: { ref: string };
  kind: TaskResult['kind'];
  /** Set to `null` once `mark()` is called — the payload does not outlive the mark. */
  result: TaskResult | null;
  outcome: TaskOutcome | null;
}

/** Results kept for history; the oldest one is dropped past this — same order
 * of magnitude as `WorkRegistry`'s 50-most-recent-finished retention (071). */
const RETENTION = 50;

export class TaskResultStore {
  /** Insertion order is what eviction and `bySubject` both rely on — a plain
   * `Map` preserves it, and re-`put`ting an existing id keeps its position. */
  private readonly entries = new Map<string, Entry>();

  /** Store a finished task's result, keyed by task id and its subject ref. */
  put(id: string, result: TaskResult, subject: { ref: string }): void {
    this.entries.set(id, { subject, kind: result.kind, result, outcome: null });
    this.retain();
  }

  /** The result for this task id, or null if there is none or it was cleared/marked. */
  get(id: string): TaskResult | null {
    return this.entries.get(id)?.result ?? null;
  }

  /** The most recently `put` result for this kind + subject ref, or null. */
  bySubject(kind: TaskResult['kind'], ref: string): TaskResult | null {
    let mostRecent: Entry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.kind === kind && entry.subject.ref === ref) mostRecent = entry;
    }
    return mostRecent?.result ?? null;
  }

  /**
   * Mark a result accepted or rejected. The record stays (so `status` can
   * still answer "was this marked, and how") but the payload is dropped —
   * `get`/`bySubject` return null for it from now on.
   */
  mark(id: string, outcome: TaskOutcome): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    entry.result = null;
    entry.outcome = outcome;
  }

  /**
   * `mark`, resolved by kind + subject ref instead of by task id — for the
   * accept/reject handlers, which only ever know which unit the user decided
   * about, never which task once proposed it. Marks the most recently `put`
   * entry for that subject, the same one `bySubject` reads. A subject with
   * nothing stored is a no-op: deciding about a proposal that was never
   * queued (or whose result has already been marked) is a normal case, not a
   * failure the decision itself should be refused over.
   */
  markBySubject(kind: TaskResult['kind'], ref: string, outcome: TaskOutcome): void {
    let mostRecent: Entry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.kind === kind && entry.subject.ref === ref) mostRecent = entry;
    }
    if (mostRecent === null) return;
    mostRecent.result = null;
    mostRecent.outcome = outcome;
  }

  /** Whether — and how — a result was marked; null if not marked (or not found). */
  status(id: string): TaskOutcome | null {
    return this.entries.get(id)?.outcome ?? null;
  }

  /** Empty the store outright — called when the vault closes (guardrail 6):
   * no vault content survives after the vault is no longer open. */
  clear(): void {
    this.entries.clear();
  }

  /** Keep only the `RETENTION` most recent entries; oldest dropped first. */
  private retain(): void {
    while (this.entries.size > RETENTION) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}
