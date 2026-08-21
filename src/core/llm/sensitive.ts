/* The sensitive-task rule (019b D5). A task marked `sensitive` in `tasks.ts`
   reads the user's journal, dumps and extracted todos. Such a task may only
   ever be routed to a target that does not train on that content.

   This module is the single place where that decision is made. It is pure —
   no Electron, no I/O, no network — and it never throws: "nothing qualifies"
   is a correct answer for a sensitive task, not an error.

   Direction of failure matters more than anything else here. A refusal that
   should have been an allow costs the user a recommendation, which the UI can
   explain. An allow that should have been a refusal silently ships personal
   text to a training pipeline, and nothing downstream would catch it. So
   every check below is written to require positive evidence: unless we can
   point at "runs on this machine" or at a read policy that says
   `no-training`, the answer is no.

   Like `reachability.ts`, this module writes no UI copy (guardrail 7):
   refusals are closed reason codes, the renderer turns them into sentences. */

import type { CatalogueEntry } from './catalogue';
import type { ProviderConfig, TaskKind } from '@shared/types';
import { taskDefinition } from './tasks';

/** The provider facts this rule needs: only whether it runs on this machine. */
export type SensitiveProviderFacts = Pick<ProviderConfig, 'local'>;

/**
 * Why a target was refused for a sensitive task. Closed set, no sentences:
 * - `'trains-on-input'` — the read policy says the provider trains on
 *   submitted content.
 * - `'policy-unknown'` — no policy was read, or the value read is not one we
 *   recognise. Deliberately identical in effect to `'trains-on-input'`: an
 *   unread policy is not a permission.
 * - `'policy-unattributed'` — the policy claims `no-training`, but the entry
 *   carries no source or no read date, so the app could not show *which*
 *   policy it read and *when* (an acceptance criterion of this story). A
 *   claim we cannot attribute is worth no more than an unknown one.
 */
export type SensitiveRefusalReason = 'trains-on-input' | 'policy-unknown' | 'policy-unattributed';

/** The provenance shown next to a sensitive recommendation: the policy that
 *  was read and the date it was read on — not a bare claim. Copied off the
 *  catalogue entry unchanged; this module never invents or reformats it. */
export interface SensitivePolicyInfo {
  policySource: string;
  policyReadAt: string;
}

/** Verdict on one target. `allowed: true` carries the provenance the caller
 *  must display; `allowed: false` carries a reason code it can explain. */
export type SensitiveJudgement =
  | { allowed: true; local: boolean; policy: SensitivePolicyInfo }
  | { allowed: false; reason: SensitiveRefusalReason };

/** A catalogue entry paired with the provider it would run through. The
 *  provider may be absent (a local weight that is simply installed has no
 *  provider row of its own yet) — absent means "not *proven* local", which is
 *  the safe reading, never "assume local". */
export interface SensitiveCandidate {
  entry: CatalogueEntry;
  provider?: SensitiveProviderFacts | null;
}

/** Whether the given task reads personal content. Delegates to `tasks.ts` on
 *  purpose: the list of sensitive kinds exists exactly once, so it cannot
 *  drift out of sync with this rule. */
export function isSensitiveTask(kind: TaskKind): boolean {
  return taskDefinition(kind).sensitive;
}

/**
 * Runs on this machine? Only an explicit `local === true` counts.
 *
 * Strict comparison, not truthiness, and not "provider is missing, so
 * probably a local weight": provider rows reach the core from settings JSON
 * across the IPC boundary, where the compiler's guarantees end. A truthy
 * string, a `1`, or a missing field must all read as "not proven local"
 * rather than as permission to send the user's journal somewhere.
 */
function runsOnThisMachine(provider: SensitiveProviderFacts | null | undefined): boolean {
  return provider?.local === true;
}

/** A policy claim is only usable if we can say where it came from and when we
 *  read it. Both fields are plain strings from the catalogue; an empty one
 *  means the curator never filled it in. */
function hasAttributedPolicy(entry: CatalogueEntry): boolean {
  return entry.policySource.trim().length > 0 && entry.policyReadAt.trim().length > 0;
}

/** The provenance to display, taken verbatim off the entry. Local entries go
 *  through the same path: the catalogue gives them a `policySource` too ("local
 *  model — never leaves the machine"), so there is no separate local-only
 *  shape to keep in sync. */
function policyInfo(entry: CatalogueEntry): SensitivePolicyInfo {
  return { policySource: entry.policySource, policyReadAt: entry.policyReadAt };
}

/**
 * The rule, in one place. Judges whether `entry` may be recommended for a
 * task marked `sensitive: true`.
 *
 * Two — and only two — ways to qualify:
 *
 * 1. The provider runs on this machine. Then the content never leaves it, so
 *    no data policy can apply to it and the entry's own `dataPolicy` is
 *    irrelevant: a local model with `dataPolicy: 'unknown'` still qualifies.
 * 2. The read policy of a remote endpoint is exactly `'no-training'`, and we
 *    can attribute that reading to a source and a date.
 *
 * Everything else is refused, with no special cases: `'trains'` and
 * `'unknown'` are the same answer here, and so is any value that is neither
 * (the catalogue can be merged with live provider data at runtime, so an
 * unexpected string is possible and must fail closed rather than fall through
 * to an allow).
 *
 * Never throws.
 */
export function judgeForSensitiveTask(
  entry: CatalogueEntry,
  provider?: SensitiveProviderFacts | null,
): SensitiveJudgement {
  // (1) Local: nothing leaves the machine, so there is nothing to train on.
  if (runsOnThisMachine(provider)) {
    return { allowed: true, local: true, policy: policyInfo(entry) };
  }

  // (2) Remote: the *only* accepted value. Written as an allow-list rather
  // than as a list of things to reject, so a new or unexpected policy value
  // lands on the refusal side by construction.
  if (entry.dataPolicy === 'no-training') {
    if (!hasAttributedPolicy(entry)) {
      return { allowed: false, reason: 'policy-unattributed' };
    }
    return { allowed: true, local: false, policy: policyInfo(entry) };
  }

  // Everything else. `'trains'` gets its own code only so the UI can be
  // precise; it is not treated differently from `'unknown'` in any way.
  return {
    allowed: false,
    reason: entry.dataPolicy === 'trains' ? 'trains-on-input' : 'policy-unknown',
  };
}

/**
 * Whether `entry` may be recommended for a sensitive task. Thin boolean view
 * of `judgeForSensitiveTask` — it deliberately holds no logic of its own, so
 * the predicate and the reason codes can never disagree.
 */
export function isAllowedForSensitiveTask(
  entry: CatalogueEntry,
  provider?: SensitiveProviderFacts | null,
): boolean {
  return judgeForSensitiveTask(entry, provider).allowed;
}

/** A candidate that survived the rule, plus the provenance it was judged on. */
export type AllowedSensitiveCandidate<T> = T & {
  policy: SensitivePolicyInfo;
  /** Whether it qualified by running locally (true) or by its read policy. */
  local: boolean;
};

/**
 * Filters candidates for a sensitive task down to those the rule allows,
 * carrying each survivor's policy source and read date along so the caller
 * can show which policy it read and when — instead of asserting privacy.
 *
 * An empty result is the correct answer when nothing qualifies; the caller
 * must then leave the task unrouted rather than relax the rule. Never throws.
 */
export function filterForSensitiveTask<T extends SensitiveCandidate>(
  candidates: readonly T[],
): AllowedSensitiveCandidate<T>[] {
  const allowed: AllowedSensitiveCandidate<T>[] = [];
  for (const candidate of candidates) {
    const judgement = judgeForSensitiveTask(candidate.entry, candidate.provider);
    if (judgement.allowed) {
      allowed.push({ ...candidate, policy: judgement.policy, local: judgement.local });
    }
  }
  return allowed;
}

/** Why each refused candidate was refused, for the "nothing qualifies"
 *  explanation. Pairs with `filterForSensitiveTask`: together they account for
 *  every candidate exactly once. */
export function refusalsForSensitiveTask<T extends SensitiveCandidate>(
  candidates: readonly T[],
): { candidate: T; reason: SensitiveRefusalReason }[] {
  const refused: { candidate: T; reason: SensitiveRefusalReason }[] = [];
  for (const candidate of candidates) {
    const judgement = judgeForSensitiveTask(candidate.entry, candidate.provider);
    if (!judgement.allowed) refused.push({ candidate, reason: judgement.reason });
  }
  return refused;
}
