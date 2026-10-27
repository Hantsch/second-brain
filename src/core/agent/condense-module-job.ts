/* Handing a module's overview condensation to the agent and turning its answer into the
   proposal an in-app run would have made. The job records the pages handed over and the hash
   of `overview.md` in its fields and lists the pages by path in its body: page content stays
   in the vault. Settling books nothing in the vault — the proposal waits for the human
   (story 092). */

import { moduleOverviewPath } from '@core/condense';
import type { IndexedDoc } from '@core/index/types';
import { AGENT_DIRS, type AgentJobFile, type DocLanguage } from '@shared/types';
import { agentJobId } from './job-files';
import { condenseModuleJobPayload, validateCondenseModuleResult } from './job-condense-module';
import type { AgentJobDeps, Settler } from './settler';

const LANGUAGE_NAMES: Record<DocLanguage, string> = { de: 'German', en: 'English' };

export interface CondenseModuleHandOver {
  slug: string;
  /** The module's title, shown as the job's label. */
  title: string;
  docs: readonly IndexedDoc[];
}

function instructions(
  id: string,
  slug: string,
  inputs: readonly string[],
  language: DocLanguage,
): string {
  return [
    '# Condense a module overview',
    '',
    `Module: \`${slug}\``,
    `Write in: ${LANGUAGE_NAMES[language]}`,
    '',
    'Read these pages and nothing else. They are the only pages your answer may cite:',
    '',
    ...inputs.map((path) => `- \`${path}\``),
    '',
    `Do not change any file under \`modules/${slug}/\`: Gaston turns your answer into a proposal`,
    'that the human accepts or rejects.',
    '',
    `Write \`${AGENT_DIRS.results}/${id}.md\` with the frontmatter \`status: done\` and, as its body,`,
    'one fenced json block with three sections. Each section has the prose `text` and the',
    '`sources`, the paths of the listed pages it rests on. A section with text cites at least one',
    'page; an empty section has empty `text` and no sources.',
    '',
    '```json',
    '{',
    '  "decided": { "text": "What the pages settle.", "sources": ["<path>"] },',
    '  "open": { "text": "What they leave open.", "sources": ["<path>"] },',
    '  "contradictions": { "text": "", "sources": [] }',
    '}',
    '```',
    '',
    'If you cannot, write `status: failed` or `status: skipped` with a `reason` instead.',
    '',
  ].join('\n');
}

export async function fileCondenseModuleJob(
  deps: Pick<AgentJobDeps, 'store' | 'jobs' | 'now' | 'docLanguage'>,
  input: CondenseModuleHandOver,
): Promise<{ status: 'filed' | 'exists'; job: AgentJobFile }> {
  const overview = await deps.store.readText(moduleOverviewPath(input.slug));
  const payload = condenseModuleJobPayload(input.docs, input.slug, overview ?? undefined);
  const language = deps.docLanguage ?? 'de';
  const now = (deps.now ?? (() => new Date()))();
  const id = agentJobId('condense-module', input.slug, now);
  const job: AgentJobFile = {
    version: 1,
    id,
    kind: 'condense-module',
    createdAt: now.toISOString(),
    subject: input.slug,
    fields: {
      module: input.slug,
      title: input.title,
      language,
      inputs: payload.inputs,
      baseHash: payload.baseHash,
    },
    body: instructions(id, input.slug, payload.inputs, language),
  };
  const status = await deps.jobs.file(job);
  if (status === 'filed') return { status, job };
  const open = (await deps.jobs.open()).find(
    (other) => other.kind === job.kind && other.subject === job.subject,
  );
  return { status, job: open ?? job };
}

/** Whether the module's condensation is with the agent right now. */
export async function condenseModuleIsOpen(
  deps: Pick<AgentJobDeps, 'jobs'>,
  slug: string,
): Promise<boolean> {
  return (await deps.jobs.open()).some(
    (job) => job.kind === 'condense-module' && job.subject === slug,
  );
}

const INVALID_JOB =
  'The job file does not record the pages and the overview it was handed over with.';

function recordedPayload(job: AgentJobFile) {
  const { inputs, baseHash } = job.fields;
  const pages =
    Array.isArray(inputs) && inputs.every((path) => typeof path === 'string')
      ? (inputs as string[])
      : null;
  const hash = typeof baseHash === 'string' || baseHash === null ? baseHash : undefined;
  return pages === null || hash === undefined
    ? null
    : { slug: job.subject, inputs: pages, baseHash: hash };
}

export const settleCondenseModule: Settler = async (deps, job, result) => {
  const refuse = (text: string) => ({
    ok: false as const,
    reason: { code: 'condense-module-invalid', text },
  });
  const payload = recordedPayload(job);
  const settle = deps.condenseModule;
  if (payload === null || settle === undefined) return refuse(INVALID_JOB);

  const existing = await deps.store.readText(moduleOverviewPath(payload.slug));
  const check = validateCondenseModuleResult({
    job: payload,
    resultBody: result.body,
    docs: settle.docs(),
    existing: existing ?? undefined,
    docLanguage: deps.docLanguage ?? 'de',
    now: (deps.now ?? (() => new Date()))(),
  });
  if (check.kind === 'failed') return refuse(check.reason);
  settle.propose(job, check.proposal);
  return { ok: true };
};
