/* The three Gaston skills Claude Code reads from .claude/skills/. Folder names and agent
 * directories come from the shared constants so the text cannot drift from the folders Gaston
 * reads. Mirrored in docs/agent-setup/skill-gaston-<name>.md. */

import { AGENT_DIRS, AGENT_JOB_VERSION, AGENT_SKILLS } from '../../../shared/types/agent-setup';
import type { SetupTemplate } from '../setup-types';

export const SKILL_GASTON_JOBS_TEMPLATE: SetupTemplate = {
  id: `skill-${AGENT_SKILLS.jobs}`,
  path: `.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`,
  version: 3,
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
5. Gaston's hook writes the run report when the turn ends; never write to
   \`${AGENT_DIRS.runs}/\` yourself.

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
  version: 2,
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
4. Gaston's hook writes the run report when the turn ends; never write to
   \`${AGENT_DIRS.runs}/\` yourself.

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
`,
};

export const SKILL_GASTON_PROPOSE_TEMPLATE: SetupTemplate = {
  id: `skill-${AGENT_SKILLS.propose}`,
  path: `.claude/skills/${AGENT_SKILLS.propose}/SKILL.md`,
  version: 3,
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
2. Compute the sha256 of the target exactly as you read it.
3. Write one file per change to \`${AGENT_DIRS.proposals}/\`, named
   \`<YYYYMMDD-HHMMSS>-<short-slug>.md\` (for example \`20261027-091200-fix-todo-dates.md\`).
   Never bundle several changes into one file.
4. Gaston's hook writes the run report when the turn ends; never write to
   \`${AGENT_DIRS.runs}/\` yourself.

## Proposal file

A proposal is a Markdown file directly in \`${AGENT_DIRS.proposals}/\`: frontmatter, then the
new content.

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| \`gaston\`    | always \`proposal\`                                                  |
| \`version\`   | always \`1\`                                                         |
| \`kind\`      | \`edit\` or \`filing\`                                                 |
| \`target\`    | the file the proposal is about, relative to the vault root         |
| \`base_hash\` | the sha256 of the target exactly as you read it: 64 hex characters |
| \`run\`       | the start time of this run, as an ISO timestamp                    |
| \`reason\`    | why the change is right, with the sources it rests on              |

A \`filing\` proposal adds \`file_into\`, the existing project, area or module file the text goes
into, and optionally \`section\`, the section of that file it belongs under.

Everything after the closing \`---\` line is the content, taken verbatim. For \`edit\` it is the
target's whole new content, not a patch. For \`filing\` it is the text to file into \`file_into\`.

Double-quote every frontmatter value that contains a colon or \` #\`, or that starts with a
special character such as \`[\`, \`{\`, \`*\`, \`&\`, \`!\`, \`%\`, \`@\` or a backtick. This matters most
for \`reason\` and \`run\`. An unquoted \`a: b\` makes the whole proposal unreadable, and an
unquoted \` # …\` silently cuts the value off there.

### Edit

\`\`\`markdown
---
gaston: proposal
version: 1
kind: edit
target: projects/website-relaunch/project.md
base_hash: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
run: 2026-10-27T09:12:00.000Z
reason: "Launch moved: now 14 November, per Anna's 26 October note."
---

(the whole new content of projects/website-relaunch/project.md)
\`\`\`

An \`edit\` target must already exist. A new file never comes in through an \`edit\`.

### Filing

\`\`\`markdown
---
gaston: proposal
version: 1
kind: filing
target: inbox/2026-10-26-call-notes.md
base_hash: 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae
run: 2026-10-27T09:12:00.000Z
reason: The call was about the relaunch and names two open decisions.
file_into: projects/website-relaunch/project.md
section: Notes
---

(the text to file into projects/website-relaunch/project.md)
\`\`\`

A \`filing\` target is a dump under \`inbox/\`. New files only come in by filing: file the text
into an existing file instead of creating a new one.

## Never

- Target \`journal/\`, \`raw/\`, \`.secondbrain/\`, \`.claude/\` or \`CLAUDE.md\`.
- Target an \`.ingest.json\` file.
- Write the target itself. Only the proposal file is written.
- Propose a change you cannot justify from the vault.
`,
};
