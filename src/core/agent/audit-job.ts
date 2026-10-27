/* Handing a maintenance run to the agent for interpretation, and booking what it answers.
   The agent reads the vault itself, so the job carries finding ids and paths, never page
   content. Its answer passes the same hard check as a model's (`checkAuditAnswer`), but the
   policy differs: a model's bad entries are dropped, the agent's whole result fails (story 091). */

import {
  AUDIT_CANDIDATE_KINDS,
  auditPages,
  checkAuditAnswer,
  type AuditResult,
  type GardenerContext,
  type StoredRun,
} from '@core/gardener';
import { MAX_ADVICE } from '@core/llm';
import type { AgentJobFile } from '@shared/types';
import { agentJobId } from './job-files';
import type { AgentDoneResult, AgentRefusal, SettleOutcome, Settler } from './settler';

export type AuditRefusalCode = 'not-available' | 'run-replaced' | 'invalid-answer';

function refusal(code: AuditRefusalCode, text: string): { ok: false; reason: AgentRefusal } {
  return { ok: false, reason: { code, text } };
}

export type AuditCheck = { ok: true; audit: AuditResult } | { ok: false; reason: AgentRefusal };

function candidateIdsOf(run: StoredRun): string[] {
  return run.findings
    .filter((finding) => AUDIT_CANDIDATE_KINDS.includes(finding.kind))
    .map((finding) => finding.id);
}

function auditInstructions(id: string, run: StoredRun): string {
  return [
    `Interpret the maintenance run \`${run.ranAt}\` the way the model audit of the gardener does.`,
    '',
    "The frontmatter of this job lists the run's `findings` (id, kind, title, paths), the",
    '`candidateIds` you may judge, and the wiki `pages` the findings touch. Read those pages in',
    'the vault yourself. Do not change any file other than the result.',
    '',
    `When you are done, write the result for job \`${id}\` with \`status: done\` and these`,
    'frontmatter fields; every field is optional and a missing one counts as an empty list:',
    '',
    '- `contradictions`: a list of `pathA`, `pathB` and `note` (one sentence on what conflicts).',
    '  Both paths are vault paths of two different wiki pages that exist.',
    '- `confirmed`: finding ids from `candidateIds` that you confirm.',
    '- `rejected`: finding ids from `candidateIds` that you reject as false alarms.',
    `- \`advice\`: a list of at most ${MAX_ADVICE} short sentences for the human.`,
    '',
    'Use ids only from this job and paths only from the vault. A single wrong path or id fails',
    'the whole result. Write `status: failed` or `status: skipped` with a reason if you could',
    'not interpret the run.',
  ].join('\n');
}

/**
 * The job for a stored run, or `null` when there is no page to interpret: a model audit
 * makes no call then either. Filing it (and the duplicate rule) is the caller's.
 */
export function buildAuditJob(
  ctx: GardenerContext,
  run: StoredRun,
  now: Date = new Date(),
): AgentJobFile | null {
  const pages = auditPages(ctx, run.findings);
  if (pages.length === 0) return null;
  const id = agentJobId('gardener-audit', run.ranAt, now);
  return {
    version: 1,
    id,
    kind: 'gardener-audit',
    createdAt: now.toISOString(),
    subject: run.ranAt,
    fields: {
      ranAt: run.ranAt,
      findings: run.findings.map((finding) => ({
        id: finding.id,
        kind: finding.kind,
        title: finding.title,
        paths: finding.paths,
      })),
      candidateIds: candidateIdsOf(run),
      pages: pages.map((page) => page.path),
    },
    body: auditInstructions(id, run),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The audit the answer amounts to, or the reason it does not: any violation fails it. */
export function validateAuditResult(
  ctx: GardenerContext,
  job: AgentJobFile,
  run: StoredRun,
  answer: unknown,
): AuditCheck {
  const jobRun = job.fields['ranAt'];
  if ((typeof jobRun === 'string' ? jobRun : job.subject) !== run.ranAt) {
    return refusal('run-replaced', 'The maintenance run was replaced after the hand-over.');
  }
  if (!isRecord(answer)) {
    return refusal('invalid-answer', 'The result is not in the shape of an audit answer.');
  }
  const { violations, ...parts } = checkAuditAnswer(ctx, answer, candidateIdsOf(run));
  const first = violations[0];
  if (first !== undefined) {
    const more = violations.length > 1 ? ` (and ${violations.length - 1} more)` : '';
    return refusal('invalid-answer', `\`${first.ref}\` ${first.reason}${more}.`);
  }
  return { ok: true, audit: { usedLlm: true, ...parts, model: null } };
}

function answerOf(result: AgentDoneResult): Record<string, unknown> {
  const { contradictions, confirmed, rejected, advice } = result.fields;
  return { contradictions, confirmed, rejected, advice };
}

export const settleGardenerAudit: Settler = async (deps, job, result): Promise<SettleOutcome> => {
  const gardener = deps.gardenerAudit;
  if (gardener === undefined) {
    return refusal('not-available', 'This Gaston has no maintenance state to book an audit into.');
  }
  const run = await gardener.storedRun();
  if (run === null) {
    return refusal('run-replaced', 'There is no maintenance run to book the audit into.');
  }
  const check = validateAuditResult(await gardener.checkContext(), job, run, answerOf(result));
  if (!check.ok) return check;
  await gardener.book(check.audit, (deps.now ?? (() => new Date()))().toISOString());
  return { ok: true };
};
