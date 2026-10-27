---
name: gaston-curate
description: Curate one module's wiki, given the module slug as the argument. Use when asked to tidy, check or maintain a Gaston module.
---

# Curate a module wiki

The argument is the module slug. This skill maintains `modules/<slug>/wiki/` and nothing else
directly. A `curate-module` job from Gaston may start it too; then you write the job's result
file when you are done, as the `gaston-jobs` skill describes.

## Steps

1. Read the CLAUDE.md in the vault root, then `modules/<slug>/AGENTS.md`. The module schema
   decides how its wiki is organised; follow it over your own habits.
2. Work through the checklist below against the pages in `modules/<slug>/wiki/`.
3. Fix what you find directly in the wiki. Add exactly one entry to `modules/<slug>/wiki/log.md`
   for each change, naming the skill, the pages touched and the reason.
4. Gaston's hook writes the run report when the turn ends; never write to
   `.secondbrain/agent/runs/` yourself.

## Checklist

- Filing: every page sits in the folder and under the name the module schema asks for.
- Links: every link between pages resolves, and pages that belong together link to each other.
- Index completeness: `wiki/index.md` lists every page in the wiki, and lists nothing that no
  longer exists.
- Contradictions: pages that disagree are named in the log. Resolve them only where `raw/`
  settles the question; otherwise record the conflict instead of picking a side.

## Never

- Write `wiki/overview.md`. It changes only through a proposal.
- Write anything in `modules/gaston-help/`.
- Write `raw/`, `journal/` or any file outside `modules/<slug>/wiki/`.

Anything outside the wiki goes through `/gaston-propose`, which writes a proposal to
`.secondbrain/agent/proposals/` for the person to confirm.
