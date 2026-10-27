/* The vault-level CLAUDE.md: the rules Claude Code reads when it is started inside a
 * vault. Paths come from the shared constants so the text cannot drift from the folders
 * Gaston actually reads. Mirrored in docs/agent-setup/vault-claude.md. */

import { AGENT_DIRS, AGENT_SKILLS } from '../../../shared/types/agent-setup';
import type { SetupTemplate } from '../setup-types';

export const VAULT_CLAUDE_TEMPLATE: SetupTemplate = {
  id: 'vault-claude',
  path: 'CLAUDE.md',
  version: 2,
  format: 'markdown',
  body: `# This vault

This folder is a Gaston vault: Markdown files with YAML frontmatter, nothing else. It holds
a person's notes, projects and knowledge modules. You work on it with the files alone; Gaston
reads the same files and picks up your changes.

## Layers

Knowledge modules follow three layers:

1. \`raw/\` holds the sources. It is immutable: you read it, you never change it.
2. \`modules/<slug>/wiki/\` is the wiki. You maintain it.
3. \`modules/<slug>/AGENTS.md\` is the schema for that module: its conventions and workflows.
   Read it before you touch a module.

## What you may write directly

The only direct write target is \`modules/<slug>/wiki/\`.

- Every direct change gets one entry in that module's \`wiki/log.md\`: the skill, the pages
  touched and the reason.
- Keep \`wiki/index.md\` in sync with the pages in the wiki.

Not directly writable, even inside a module:

- \`wiki/overview.md\` is the condensed artifact. It changes only through a proposal.
- \`modules/gaston-help/\` belongs to Gaston and is read-only by convention. Read it to learn
  how Gaston works.

## Everything else is a proposal

Changes to \`module.md\`, \`AGENTS.md\`, \`projects/\`, \`areas/\` and \`inbox/\` are proposals.
Write them to \`${AGENT_DIRS.proposals}/\` with \`/${AGENT_SKILLS.propose}\`. The person confirms
them in Gaston; nothing is applied silently.

## Never

- Read \`journal/\`, \`.secondbrain/index/\` or \`.secondbrain/chats/\` (the derived index and the chats
  hold journal text).
- Write \`raw/\`, \`CLAUDE.md\`, \`.claude/\` or \`.ingest.json\` files.
- Write anything in \`.secondbrain/\` except \`results/\` and \`proposals/\` under
  \`.secondbrain/agent/\`.

Searches and listings name a folder (\`modules/\`, \`projects/\`, \`areas/\`, \`inbox/\`,
\`.secondbrain/agent/\`). A search, recursive listing or glob that would reach \`journal/\` or the
derived index is blocked, and so is a shell write to \`raw/\`, \`.claude/\` or \`CLAUDE.md\`.

## Jobs, results and reports

Jobs are read from \`${AGENT_DIRS.jobs}/\`. Each result goes into \`${AGENT_DIRS.results}/\`
under the job's file name. Gaston's hook writes one report per skill run to \`runs/\`; the agent
never writes there.

## Skills

- \`/${AGENT_SKILLS.jobs}\` works through the open jobs.
- \`/${AGENT_SKILLS.curate} <slug>\` curates one module's wiki.
- \`/${AGENT_SKILLS.propose}\` writes a proposal.

Each module's \`AGENTS.md\` describes its own workflows. \`modules/gaston-help/\` explains the
app and these rules in more detail.
`,
};
