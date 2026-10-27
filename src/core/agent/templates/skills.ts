/* The three Gaston skills Claude Code reads from .claude/skills/. Folder names and agent
 * directories come from the shared constants so the text cannot drift from the folders Gaston
 * reads. Mirrored in docs/agent-setup/skill-gaston-<name>.md. */

import { AGENT_DIRS, AGENT_JOB_VERSION, AGENT_SKILLS } from '../../../shared/types/agent-setup';
import type { SetupTemplate } from '../setup-types';

export const SKILL_GASTON_JOBS_TEMPLATE: SetupTemplate = {
  id: `skill-${AGENT_SKILLS.jobs}`,
  path: `.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`,
  version: 2,
  format: 'markdown-frontmatter',
  body: `---
name: gaston-jobs
description: Work through the open Gaston jobs in ${AGENT_DIRS.jobs}/ and write one result per job. Use when asked to process Gaston jobs.
---

# Work the Gaston jobs

Gaston leaves jobs for you in \`${AGENT_DIRS.jobs}/\`. This skill works through them and
reports back through \`${AGENT_DIRS.results}/\`.

## Steps

1. Read the CLAUDE.md in the vault root first. Its rules apply to everything below.
2. List the files in \`${AGENT_DIRS.jobs}/\` and sort them oldest first.
3. Skip every job that already has a result with the same file name in
   \`${AGENT_DIRS.results}/\`.
4. For each remaining job, in that order, do the work the job asks for, then write exactly one
   result to \`${AGENT_DIRS.results}/\` under the job's file name.
5. End the run with one report in \`${AGENT_DIRS.runs}/\`.

## Job kinds

### \`llm-task\`

A task the user routed to you instead of a language model. The job is JSON:

\`\`\`json
{
  "version": ${AGENT_JOB_VERSION},
  "id": "classify-dump-1a2b3c4d5e6f7a8b",
  "kind": "llm-task",
  "task": "classify-dump",
  "createdAt": "2026-10-27T09:12:00.000Z",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "schema": { "type": "object" }
}
\`\`\`

Answer the conversation in \`messages\` as the assistant would: follow the system message, use
only what the messages contain, and do not change any vault file for it — Gaston turns your
answer into a proposal the user confirms. When \`schema\` is set, the answer must be JSON that
matches it.

## Result format

Every result is JSON with one status:

- \`{ "status": "done", "text": "<the answer>" }\` when the work is finished. For a job with a
  \`schema\`, \`text\` is the JSON answer, as a string or as the object itself.
- \`{ "status": "failed", "reason": "<why>" }\` when you tried and could not finish.
- \`{ "status": "skipped", "reason": "<why>" }\` when you chose not to do the job.

A job kind this skill does not describe gets \`skipped\` with the reason "unknown job kind".
Do not guess what such a job wants.

## Never

- Edit or delete a job file. Jobs belong to Gaston.
- Write \`.ingest.json\` files.
- Write a second result for a job, or a result under a different file name.
`,
};

export const SKILL_GASTON_CURATE_TEMPLATE: SetupTemplate = {
  id: `skill-${AGENT_SKILLS.curate}`,
  path: `.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`,
  version: 1,
  format: 'markdown-frontmatter',
  body: `---
name: gaston-curate
description: Curate one module's wiki, given the module slug as the argument. Use when asked to tidy, check or maintain a Gaston module.
---

# Curate a module wiki

The argument is the module slug. This skill maintains \`modules/<slug>/wiki/\` and nothing else
directly.

## Steps

1. Read the CLAUDE.md in the vault root, then \`modules/<slug>/AGENTS.md\`. The module schema
   decides how its wiki is organised; follow it over your own habits.
2. Work through the checklist below against the pages in \`modules/<slug>/wiki/\`.
3. Fix what you find directly in the wiki. Add exactly one entry to \`modules/<slug>/wiki/log.md\`
   for each change, naming the skill, the pages touched and the reason.
4. End the run with one report in \`${AGENT_DIRS.runs}/\`.

## Checklist

- Filing: every page sits in the folder and under the name the module schema asks for.
- Links: every link between pages resolves, and pages that belong together link to each other.
- Index completeness: \`wiki/index.md\` lists every page in the wiki, and lists nothing that no
  longer exists.
- Contradictions: pages that disagree are named in the log. Resolve them only where \`raw/\`
  settles the question; otherwise record the conflict instead of picking a side.

## Never

- Write \`wiki/overview.md\`. It changes only through a proposal.
- Write anything in \`modules/gaston-help/\`.
- Write \`raw/\`, \`journal/\` or any file outside \`modules/<slug>/wiki/\`.

Anything outside the wiki goes through \`/gaston-propose\`, which writes a proposal to
\`${AGENT_DIRS.proposals}/\` for the person to confirm.

The exact report format follows in later versions of this skill.
`,
};

export const SKILL_GASTON_PROPOSE_TEMPLATE: SetupTemplate = {
  id: `skill-${AGENT_SKILLS.propose}`,
  path: `.claude/skills/${AGENT_SKILLS.propose}/SKILL.md`,
  version: 1,
  format: 'markdown-frontmatter',
  body: `---
name: gaston-propose
description: Write a proposal for a change Gaston must confirm before it is applied. Use for any change outside a module wiki.
---

# Propose a change

A proposal is how you change anything you may not write directly. Gaston shows it to the
person, who accepts or rejects it. Nothing is applied silently.

## Steps

1. Read the CLAUDE.md in the vault root, and read the target file in full.
2. Compute the sha256 of the target exactly as you read it. If the target does not exist yet,
   say so instead of giving a hash.
3. Write one file per change to \`${AGENT_DIRS.proposals}/\`. Never bundle several changes
   into one file.
4. End the run with one report in \`${AGENT_DIRS.runs}/\`.

## What a proposal contains

- The target path, relative to the vault root.
- The new content, in full.
- The reasoning: why the change is right, with the sources it rests on.
- The sha256 of the target as you read it, so Gaston can tell if the file changed since.
- The run that wrote it.

## Never

- Target \`journal/\` or \`raw/\`.
- Write the target itself. Only the proposal file is written.
- Propose a change you cannot justify from the vault.

The exact proposal and report formats follow in later versions of this skill.
`,
};
