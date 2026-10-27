/* The help page about the agent: setup, protection, proposals. It states what the shipped
 * templates, the Agent screen and the Agent tab do, and the limits of the shell check as the guard script
 * implements them (docs/VAULT-FORMAT.md, "Protection", words the same limits). */

import type { HelpPageDef } from './types';

export const AGENT_PAGE: HelpPageDef = {
  slug: 'agent',
  tags: ['agent', 'einrichtung', 'schutz', 'vorschläge', 'befehle'],
  title: 'The agent: setup, protection and proposals',
  summary:
    'How Claude Code works on the vault: setup files, protection, wiki writes and proposals.',
  body: `# The agent: setup, protection and proposals

The agent is Claude Code. On the **Agent** screen (in the rail, below **Tasks**), **Open Claude
in the vault** opens a terminal with the vault as its working folder and plain \`claude\`
started, without a first prompt: pick the model and settings you want, then start a skill such
as \`/gaston-curate <module>\` yourself. The screen lists these commands and what each does.
Gaston only opens that terminal. The agent runs in
your own CLI session under your own login; Gaston never calls it, never passes it a key and
never uses your subscription. Gaston only looks whether the Claude Code CLI is on this
machine's PATH, and it does not install it. In a session the agent may curate the wiki layer of
a module and write proposals for everything else.

## The setup

In Settings, tab **Agent**, the panel **Agent setup** lists the files Gaston installs and their
status: current, outdated, missing, changed by you, from a newer Gaston, or yours. **Install**
(or **Update**) opens a plan that lists exactly what will be written; Gaston writes only that,
after you confirm. Install writes:

- \`CLAUDE.md\` in the vault root: the rules the agent reads when it starts in the vault.
- \`.claude/settings.json\`: the permission rules and hook registrations (see Protection).
- \`.claude/hooks/\`: the two hook scripts, \`gaston-shell-guard.ps1\` and \`gaston-wiki-check.ps1\`.
- \`.claude/skills/\`: three skills, \`gaston-jobs\`, \`gaston-curate\` and \`gaston-propose\`.
- \`.claude/gaston-manifest.json\`: records which template version and hash was written.
- The folders \`.secondbrain/agent/jobs/\`, \`results/\`, \`proposals/\` and \`runs/\`.
- This help module, \`modules/gaston-help/\`.

A file Gaston did not write is yours and stays untouched. A file you changed is shown as
"Changed by you"; Gaston overwrites it only when you confirm it in the plan, and a copy goes to
the trash first. A file that still matches what Gaston wrote is updated to a newer version
without asking.

## What the agent may write

The only direct write target is \`modules/<slug>/wiki/\`. Every direct change gets one entry in
that module's \`wiki/log.md\`: the skill, the pages touched and the reason. \`wiki/index.md\` stays
in sync with the pages. \`wiki/overview.md\` is the condensed artifact and changes only through a
proposal. This help module is read-only by convention: read it, do not rewrite it.

\`.secondbrain/agent/\` holds the hand-over folders between Gaston and the agent. Gaston creates
them on install. \`jobs/\` is where jobs for the agent would be handed over; this version of
Gaston does not write any job into it yet. The agent writes \`results/\` (one result per job,
under the job's file name), \`proposals/\` and \`runs/\` (one report per skill run).

## Proposals

Everything outside the wiki layer is a proposal. Changes to \`module.md\`, \`AGENTS.md\`,
\`projects/\`, \`areas/\` and \`inbox/\` are proposals, and so is every change to a module's
\`wiki/overview.md\`. The agent writes a proposal as a file into \`.secondbrain/agent/proposals/\`
with the \`/gaston-propose\` skill. Proposals are suggestions: the agent applies nothing itself.
You read the files and decide; Gaston has no screen yet to review or apply them.

## Protection

In Settings, tab **Agent**, the panel **Protection** shows per rule whether it is installed in
\`.claude/settings.json\` or missing, and lists deny rules you added yourself. With no setup it
says nothing protects the vault yet. The rules:

- **journal-read**: \`journal/\` can be neither read nor edited. \`.secondbrain/index/\` and
  \`.secondbrain/chats/\` cannot be read either, because the derived index stores every document
  body, journal entries included, and the chat sessions hold journal text.
- **raw-write**: \`raw/\` cannot be written.
- **setup-write**: \`CLAUDE.md\` and \`.claude/\` cannot be written.
- **overview-write**: \`modules/*/wiki/overview.md\` cannot be written.
- **internal-write**: the \`.secondbrain/*.json\` files and the internal folders \`index/\`,
  \`chats/\`, \`logs/\` and \`trash/\` cannot be written, nor can \`agent/jobs/\`. \`agent/results/\`
  and \`agent/proposals/\` stay writable, and \`agent/\` stays readable. Gaston's hook writes one
  report per skill run to \`agent/runs/\`; the agent never writes there, though no rule denies it.
- **pre-tool-guard**: a PreToolUse hook on the shell, read, search and write tools. It fails
  closed: if it errors, times out or cannot start, the tool call is blocked.
- **wiki-check**: a PostToolUse hook after a write or edit and a Stop hook. A wiki page under
  \`modules/<slug>/wiki/\` must carry the schema's frontmatter, and a module whose wiki changed
  in the session must have a new dated heading in its \`wiki/log.md\`. It reports to the agent
  and never blocks; it fails open, so an error in the check stays silent.

The hooks run on Windows PowerShell (\`powershell.exe\`).

## Limits of the shell check

The protection narrows what the agent does by accident; it is not a sandbox.

What the shell guard blocks:

- Reads of \`journal/\`, \`.secondbrain/index/\` and \`.secondbrain/chats/\` in shell commands,
  including a search, recursive listing or glob that would reach them from the vault root or
  from \`.secondbrain/\`.
- Shell writes to \`raw/\`, \`.claude/\` and \`CLAUDE.md\`: near those paths only read-only
  commands without an output redirect pass.
- Git commands that print file content or history (\`diff\`, \`show\`, \`blame\`, \`log -p\`, ...)
  are blocked unless a path after \`--\` scopes them away from the vault root, because git reads
  the whole repository whatever the working directory is.
- \`[char[]]\` and \`[System.Char[]]\` in a command, because they build a path from character
  codes. Legitimate uses such as \`Split([char[]]',')\` are blocked too.
- Every write under \`modules/gaston-help/\`, from the file tools and from the shell. Reads
  still pass; other modules' wiki stays writable.
- The file tools too: reading or searching the protected folders, and writing a file in the
  vault outside the wiki layer and the hand-over folders.

What it does not catch:

- Indirection gets past the guard: variables, command substitution, and scripts that open
  files themselves. This is a documented limit.
- \`disableAllHooks\` is honoured only in the vault's \`.claude/settings.json\` and
  \`settings.local.json\`, where the panel shows the rules as Off. One set in user-level or
  managed settings outside the vault is not seen.
- Shell writes are only guarded for \`raw/\`, \`.claude/\` and \`CLAUDE.md\`. A shell write to
  \`projects/\`, \`areas/\`, \`inbox/\` or \`.secondbrain/\` (apart from \`index/\` and \`chats/\`,
  which the guard blocks for any command that names them) is not checked.
- Glob can show journal file names (never content); the guard does not block that.
- On macOS and Linux there is no \`powershell.exe\`, so the guard cannot start and fails
  closed: every guarded tool call is blocked.
- A session started in a subfolder of the vault does not load the vault's rules.

## Asking about Gaston

This module is part of the vault, so a question to Gaston about how Gaston works is answered
from these pages, with the page path as citation. Ask in the ask overlay or the question tile
on the dashboard. If no page covers the question, Gaston says so.
`,
};
