/* The Markdown jobs Gaston hands the agent and the results it gets back. Jobs are Gaston's
   alone to write: the agent only reads `jobs/` and answers in `results/`. A result that is
   still being written must not look like an answer, so an unparseable one counts as none. */

import { join } from 'node:path';
import {
  movePath,
  readDirEntries,
  readTextOrNull,
  removePath,
  statOrNull,
  writeFileAtomic,
} from '@core/vault/fs-io';
import { parse, serialize, type Frontmatter } from '@core/vault/frontmatter';
import { sha256 } from '@core/vault/hash';
import {
  AGENT_DIRS,
  AGENT_JOB_VERSION,
  type AgentJobFile,
  type AgentJobKind,
  type AgentJobOutcome,
  type AgentResultFile,
} from '@shared/types';

export const AGENT_JOB_FORMAT = 'agent-job';
export const FINISHED_JOB_DAYS = 30;

const DONE_DIR = 'done';
const RESULT_SUFFIX = '.result.md';
const DAY_MS = 24 * 60 * 60 * 1000;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const OUTCOMES: readonly string[] = ['done', 'failed', 'skipped', 'withdrawn'];
const JOB_RESERVED = ['gaston', 'version', 'id', 'kind', 'created', 'subject'];
const RESULT_RESERVED = ['job', 'status', 'reason'];
const DONE_RESERVED = ['outcome', 'reason', 'finished'];

/** A finished job as Gaston recorded it in `jobs/done/`. */
export interface FinishedAgentJob {
  job: AgentJobFile;
  outcome: AgentJobOutcome;
  reason: string | null;
  finishedAt: string;
}

export type AgentResultRead = AgentResultFile | { invalid: string } | null;

/** `<kind>-<YYYYMMDDTHHmmss>-<first 8 hex of sha256(subject)>`, time in UTC. */
export function agentJobId(kind: AgentJobKind, subject: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15);
  return `${kind}-${stamp}-${sha256(subject).slice(0, 8)}`;
}

function omit(fields: Frontmatter, keys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !keys.includes(key)));
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseJob(raw: string): AgentJobFile | null {
  const parsed = parse(raw);
  const fm = parsed.frontmatter;
  if (!parsed.hadFrontmatter || parsed.warning !== undefined) return null;
  if (fm.gaston !== AGENT_JOB_FORMAT || fm.version !== AGENT_JOB_VERSION) return null;
  const id = text(fm.id);
  const kind = text(fm.kind);
  const createdAt = text(fm.created);
  const subject = text(fm.subject);
  if (id === null || kind === null || createdAt === null || subject === null) return null;
  return {
    version: AGENT_JOB_VERSION,
    id,
    kind: kind as AgentJobKind,
    createdAt,
    subject,
    fields: omit(fm, [...JOB_RESERVED, ...DONE_RESERVED]),
    body: parsed.body.replace(/^\n/, ''),
  };
}

function serializeJob(job: AgentJobFile, extra: Frontmatter = {}): string {
  return serialize(
    {
      gaston: AGENT_JOB_FORMAT,
      version: job.version,
      id: job.id,
      kind: job.kind,
      created: job.createdAt,
      subject: job.subject,
      ...omit(job.fields, JOB_RESERVED),
      ...extra,
    },
    job.body,
  );
}

function parseResult(raw: string): AgentResultRead {
  const parsed = parse(raw);
  // Frontmatter that does not parse yet is an unfinished write, not a wrong answer.
  if (!parsed.hadFrontmatter || parsed.warning !== undefined) return null;
  const status = parsed.frontmatter.status;
  if (status === undefined) return { invalid: 'The status is missing' };
  if (status !== 'done' && status !== 'failed' && status !== 'skipped') {
    return { invalid: 'The status is not done, failed or skipped' };
  }
  if (status === 'done') {
    return {
      status,
      fields: omit(parsed.frontmatter, RESULT_RESERVED),
      body: parsed.body.replace(/^\n/, ''),
    };
  }
  const reason = text(parsed.frontmatter.reason);
  if (reason === null) return { invalid: `The reason is missing for status ${status}` };
  return { status, reason };
}

export function createAgentJobFiles(vaultRoot: string, now: () => Date = () => new Date()) {
  const jobsDir = join(vaultRoot, AGENT_DIRS.jobs);
  const doneDir = join(jobsDir, DONE_DIR);
  const resultsDir = join(vaultRoot, AGENT_DIRS.results);

  const jobPath = (id: string) => join(jobsDir, `${id}.md`);
  const resultPath = (id: string) => join(resultsDir, `${id}.md`);
  const doneJobPath = (id: string) => join(doneDir, `${id}.md`);
  const doneResultPath = (id: string) => join(doneDir, `${id}${RESULT_SUFFIX}`);

  async function readJobs(dir: string, accept: (name: string) => boolean) {
    const entries = await readDirEntries(dir);
    const jobs: { job: AgentJobFile; raw: string }[] = [];
    for (const entry of entries) {
      if (entry.dir || !entry.name.endsWith('.md') || !accept(entry.name)) continue;
      const raw = await readTextOrNull(join(dir, entry.name));
      const job = raw === null ? null : parseJob(raw);
      if (raw !== null && job !== null) jobs.push({ job, raw });
    }
    return jobs;
  }

  async function open(): Promise<AgentJobFile[]> {
    const jobs = (await readJobs(jobsDir, () => true)).map((entry) => entry.job);
    return jobs.sort((a, b) =>
      a.createdAt === b.createdAt
        ? a.id.localeCompare(b.id)
        : a.createdAt.localeCompare(b.createdAt),
    );
  }

  async function file(job: AgentJobFile): Promise<'filed' | 'exists'> {
    if (!SAFE_ID.test(job.id)) throw new Error('The job id is not a file name');
    const duplicate = (await open()).some(
      (other) => other.kind === job.kind && other.subject === job.subject,
    );
    if (duplicate) return 'exists';
    await writeFileAtomic(jobPath(job.id), serializeJob(job));
    return 'filed';
  }

  async function result(id: string): Promise<AgentResultRead> {
    if (!SAFE_ID.test(id)) return null;
    const raw = await readTextOrNull(resultPath(id));
    return raw === null ? null : parseResult(raw);
  }

  /** Records the outcome in `done/` and removes the open job; a job that is gone is a no-op. */
  async function finish(
    id: string,
    outcome: AgentJobOutcome,
    reason: string | null,
  ): Promise<boolean> {
    if (!SAFE_ID.test(id)) return false;
    const raw = await readTextOrNull(jobPath(id));
    const job = raw === null ? null : parseJob(raw);
    if (job === null) return false;
    const extra: Frontmatter = { outcome, finished: now().toISOString() };
    if (reason !== null) extra.reason = reason;
    await writeFileAtomic(doneJobPath(id), serializeJob(job, extra));
    const answer = await readTextOrNull(resultPath(id));
    if (answer !== null) {
      await writeFileAtomic(doneResultPath(id), answer);
      await removePath(resultPath(id));
    }
    await removePath(jobPath(id));
    return true;
  }

  async function finished(): Promise<FinishedAgentJob[]> {
    const entries = await readJobs(doneDir, (name) => !name.endsWith(RESULT_SUFFIX));
    const out: FinishedAgentJob[] = [];
    for (const { job, raw } of entries) {
      const fm = parse(raw).frontmatter;
      const finishedAt = text(fm.finished);
      if (finishedAt === null || typeof fm.outcome !== 'string' || !OUTCOMES.includes(fm.outcome)) {
        continue;
      }
      out.push({
        job,
        outcome: fm.outcome as AgentJobOutcome,
        reason: text(fm.reason),
        finishedAt,
      });
    }
    return out.sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  }

  /** Deletes the finished jobs, and their results, that ended over 30 days ago. */
  async function prune(): Promise<number> {
    const cutoff = now().getTime() - FINISHED_JOB_DAYS * DAY_MS;
    let removed = 0;
    for (const entry of await finished()) {
      const at = Date.parse(entry.finishedAt);
      if (Number.isNaN(at) || at >= cutoff) continue;
      await removePath(doneJobPath(entry.job.id));
      await removePath(doneResultPath(entry.job.id));
      removed += 1;
    }
    return removed;
  }

  /** Ids of results whose job is no longer open: the agent answered after a withdraw or finish. */
  async function orphanResults(): Promise<string[]> {
    const ids: string[] = [];
    for (const entry of await readDirEntries(resultsDir)) {
      if (entry.dir || !entry.name.endsWith('.md')) continue;
      const id = entry.name.slice(0, -'.md'.length);
      if (SAFE_ID.test(id) && (await statOrNull(jobPath(id))) === null) ids.push(id);
    }
    return ids.sort();
  }

  /** Moves a late result next to the finished jobs, without touching any bookkeeping. */
  async function discardLateResult(id: string): Promise<void> {
    if (!SAFE_ID.test(id) || (await statOrNull(resultPath(id))) === null) return;
    await movePath(resultPath(id), doneResultPath(id));
  }

  return { file, open, result, finish, finished, prune, orphanResults, discardLateResult };
}

export type AgentJobFiles = ReturnType<typeof createAgentJobFiles>;
