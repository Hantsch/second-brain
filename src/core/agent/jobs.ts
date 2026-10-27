/* LLM tasks routed to the agent travel through the vault as files: Gaston writes a job to
 * `.secondbrain/agent/jobs/<id>.json`, the agent's `gaston-jobs` skill writes the answer to
 * `.secondbrain/agent/results/<id>.json`. The id is derived from the request itself, so
 * triggering the same task on the same input finds the same job instead of queueing a second
 * one — and, once the agent has answered, finds its result. */

import { join } from 'node:path';
import type { ChatTurn, CompletionRequest, TaskKind } from '../../shared/types';
import { AGENT_DIRS } from '../../shared/types/agent-setup';
import { readTextOrNull, statOrNull, writeFileAtomic } from '../vault/fs-io';
import { sha256 } from '../vault/hash';

export { AGENT_JOB_VERSION } from '../../shared/types/agent-setup';

export interface AgentJob {
  version: number;
  id: string;
  kind: 'llm-task';
  task: TaskKind;
  createdAt: string;
  messages: ChatTurn[];
  /** Set when the answer has to be JSON against this schema. */
  schema?: Record<string, unknown>;
}

export type AgentJobResult =
  { status: 'done'; text: string } | { status: 'failed' | 'skipped'; reason: string };

export interface AgentJobStore {
  /** The agent's answer to a job, or `null` while there is none (or it is unreadable). */
  result(id: string): Promise<AgentJobResult | null>;
  /** Files the job unless a job with its id already exists. */
  file(job: AgentJob): Promise<void>;
}

/** `<task>-<hash>`: readable in a directory listing, stable for identical requests. */
export function agentJobId(req: Pick<CompletionRequest, 'task' | 'messages' | 'schema'>): string {
  const hash = sha256(JSON.stringify([req.task, req.messages, req.schema ?? null]));
  return `${req.task}-${hash.slice(0, 16)}`;
}

/**
 * A result file is the agent's writing — it is checked, not trusted. Anything that does not
 * match the documented shape counts as no result yet, so a half-written file never becomes an
 * answer.
 */
export function parseAgentJobResult(raw: string): AgentJobResult | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { status, text, reason } = value as Record<string, unknown>;
  if (status === 'done') {
    if (typeof text === 'string') return { status, text };
    // Structured tasks may get the JSON object itself instead of a string.
    if (typeof text === 'object' && text !== null) return { status, text: JSON.stringify(text) };
    return null;
  }
  if (status === 'failed' || status === 'skipped') {
    return { status, reason: typeof reason === 'string' ? reason : '' };
  }
  return null;
}

export function createFsAgentJobStore(vaultRoot: string): AgentJobStore {
  const jobPath = (id: string): string => join(vaultRoot, AGENT_DIRS.jobs, `${id}.json`);
  const resultPath = (id: string): string => join(vaultRoot, AGENT_DIRS.results, `${id}.json`);
  return {
    result: async (id) => {
      const raw = await readTextOrNull(resultPath(id));
      return raw === null ? null : parseAgentJobResult(raw);
    },
    file: async (job) => {
      if (await statOrNull(jobPath(job.id))) return;
      await writeFileAtomic(jobPath(job.id), `${JSON.stringify(job, null, 2)}\n`);
    },
  };
}
