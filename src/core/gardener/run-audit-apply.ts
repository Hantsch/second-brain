/** Books an audit that arrived after its run was stored — the agent's answer to a
 * hand-over — into that stored run (story 091). */

import type { AuditResult } from './audit';
import { sortFindings } from './report';
import type { StoredGardener, StoredRun } from './run-record';
import { inScope, isRunComplete, narrowedScope } from './run-scope';

/**
 * Has someone interpreted this run? The `audit` field says so directly, `null`
 * included: a new run's `usedLlm` also turns true from the loose-ends stage alone,
 * so it cannot answer this. A run stored before the field existed has only
 * `usedLlm`, which was set exactly when the audit's model answered — so that reads
 * as audited.
 */
export function hasAudit(run: StoredRun): boolean {
  return run.audit !== undefined ? run.audit !== null : run.usedLlm;
}

function withStage<T extends string>(list: readonly T[] | undefined, entry: T): T[] {
  const current = list ?? [];
  return current.includes(entry) ? [...current] : [...current, entry];
}

/**
 * The stored run with an agent's audit laid into it.
 *
 * A rejected candidate leaves `findings` but stays in `consideredIds`: the
 * rejection says "don't show it", not "the vault condition is gone", and only
 * the second may end a "fine as is" or a snooze (`run-merge#outlivesRun`). The
 * previous findings are folded into `consideredIds` explicitly because a run
 * stored without that field falls back to its findings — and those just lost
 * the rejected ids.
 *
 * `ranAt`, `plan`, `scope` and `healthAsOf` are not touched, and `'audit'` only
 * joins `completed` where that does not change `isRunComplete`: booking an
 * interpretation re-derives nothing, so it must not turn a stopped run into one
 * that computes its own health or would prune decisions on its next save.
 *
 * `checkedKinds` gains `'contradiction'` only where the run recorded a list; an
 * absent list already reads as "everything the scope named was looked at".
 */
export function applyAgentAudit(run: StoredRun, audit: AuditResult, at: string): StoredRun {
  const rejected = new Set(audit.rejected);
  const scope = narrowedScope(run.scope);
  const kept = run.findings.filter((finding) => !rejected.has(finding.id));
  const known = new Set(kept.map((finding) => finding.id));
  const added = audit.contradictions.filter(
    (finding) => !known.has(finding.id) && (scope === undefined || inScope(finding, scope)),
  );

  const completed = withStage(run.completed, 'audit');
  const keepsCompleteness = isRunComplete({ ...run, completed }) === isRunComplete(run);

  return {
    ...run,
    usedLlm: true,
    findings: sortFindings([...kept, ...added]),
    consideredIds: [
      ...new Set([
        ...(run.consideredIds ?? []),
        ...run.findings.map((finding) => finding.id),
        ...audit.contradictions.map((finding) => finding.id),
      ]),
    ],
    advice: [...audit.advice],
    completed: keepsCompleteness ? completed : run.completed,
    ...(run.checkedKinds === undefined
      ? {}
      : { checkedKinds: withStage(run.checkedKinds, 'contradiction') }),
    audit: { by: 'agent', at },
  };
}

/**
 * The state after booking an agent audit into the run it was asked about, or
 * `null` when that run is no longer the stored one — an audit of a replaced run
 * says nothing about the current one. Every other part of the state, the user's
 * "fine as is" and snoozes above all, is carried over untouched: unlike a new
 * run (`applySavedRun`), an audit never ends a decision.
 */
export function bookAgentAudit(
  data: StoredGardener,
  ranAt: string,
  audit: AuditResult,
  at: string,
): StoredGardener | null {
  if (data.run === null || data.run.ranAt !== ranAt) return null;
  return { ...data, run: applyAgentAudit(data.run, audit, at) };
}
