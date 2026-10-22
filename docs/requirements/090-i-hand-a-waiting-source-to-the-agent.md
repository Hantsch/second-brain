---
id: 090
title: I hand a waiting source to the agent
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

A source in `awaiting-llm` (`src/core/ingest/queue.ts`) waits for a model the user may not have,
or one too weak to condense it well. The user can hand it to the agent instead — explicitly, per
source; nothing reaches the agent without a click (concept §10, AGT-12 to AGT-14).

The click writes one job file under `.secondbrain/`. The job-queue skill ([[084]]) works it: the
agent writes the source page under `wiki/sources/` and a result file. Gaston validates the result
before doing any bookkeeping — `sourcePage` and `modules` in `.ingest.json`, the `index.md` and
`log.md` check — exactly as after a digestion. The agent never writes `.ingest.json`.

The Tasks screen shows a handed-over job and its outcome like any other task; job files make it
survive a restart, which today's session-only work queue does not. This story builds the job and
result format and the validation the other job kinds ([[091]], [[092]]) reuse.

## Acceptance Criteria

- [ ] **AC1** — A source in `awaiting-llm` offers "Hand to agent" in Sources and in the Tasks
      screen; one click writes exactly one job file, and a second click on the same source writes
      none.
- [ ] **AC2** — No job file exists for a source the user did not hand over.
- [ ] **AC3** — A handed-over source shows as "with the agent" in the Tasks screen, also after a
      restart.
- [ ] **AC4** — After a valid result, `.ingest.json` carries `sourcePage` and `modules` as after a
      digestion, and the source leaves `awaiting-llm`.
- [ ] **AC5** — A result that fails validation (page missing, invalid frontmatter, page outside a
      module's wiki, `.ingest.json` touched) shows the job as failed with the reason and changes
      no bookkeeping.
- [ ] **AC6** — A result the agent marked failed or skipped shows that reason in the Tasks screen.
- [ ] **AC7** — The installed job-queue skill describes the condense-source kind and the result
      format; the template test pins it.

## Open Questions

- **Q1 — Formats** (concept O3): job and result frontmatter, file naming, retention of finished
  jobs.
- **Q2 — Withdrawing.** Can the user take a handed-over job back (and the source return to
  `awaiting-llm`), or does it stay until the agent answers?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
