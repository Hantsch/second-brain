# This vault

This folder is a Gaston vault: Markdown files with YAML frontmatter, nothing else. It holds
a person's notes, projects and knowledge modules. You work on it with the files alone; Gaston
reads the same files and picks up your changes.

## Layers

Knowledge modules follow three layers:

1. `raw/` holds the sources. It is immutable: you read it, you never change it.
2. `modules/<slug>/wiki/` is the wiki. You maintain it.
3. `modules/<slug>/AGENTS.md` is the schema for that module: its conventions and workflows.
   Read it before you touch a module.

## What you may write directly

The only direct write target is `modules/<slug>/wiki/`.

- Every direct change gets one entry in that module's `wiki/log.md`: the skill, the pages
  touched and the reason.
- Keep `wiki/index.md` in sync with the pages in the wiki.

Not directly writable, even inside a module:

- `wiki/overview.md` is the condensed artifact. It changes only through a proposal.
- `modules/gaston-help/` belongs to Gaston and is read-only by convention. Read it to learn
  how Gaston works.

## Everything else is a proposal

Changes to `module.md`, `AGENTS.md`, `projects/`, `areas/` and `inbox/` are proposals.
Write them to `.secondbrain/agent/proposals/` with `/gaston-propose`. The person confirms
them in Gaston; nothing is applied silently.

## Never

- Read `journal/`.
- Write `raw/`, `CLAUDE.md`, `.claude/` or `.ingest.json` files.
- Write anything in `.secondbrain/` except `results/`, `proposals/` and `runs/` under
  `.secondbrain/agent/`.

## Jobs, results and reports

Jobs are read from `.secondbrain/agent/jobs/`. Each result goes into `.secondbrain/agent/results/`
under the job's file name. Every skill run ends with one report in `.secondbrain/agent/runs/`.

## Skills

- `/gaston-jobs` works through the open jobs.
- `/gaston-curate <slug>` curates one module's wiki.
- `/gaston-propose` writes a proposal.

Each module's `AGENTS.md` describes its own workflows. `modules/gaston-help/` explains the
app and these rules in more detail.
