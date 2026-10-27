---
id: 091
title: I hand a module or a gardener run to the agent
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Two more job kinds on the format from [[090]] (concept §10, AGT-12, AGT-15):

- **Curate module** — at a module in Knowledge and in the Agent tab. The agent changes the wiki
  layer directly (with `log.md`), writes proposals ([[088]]) for the rest, and the run report
  ([[089]]) says what it did. Gaston has nothing to book.
- **Gardener audit** — at a gardener run without an audit, in Maintenance. The agent writes its
  interpretation per finding; Gaston validates it with the same hard check against the index as
  `src/core/gardener/audit.ts` and stores it in `gardener.json` like a model audit.

The curator skill's checklist is decided here (concept O11): at least filing, links, index
completeness and contradictions.

## Acceptance Criteria

- [ ] **AC1** — A module in Knowledge offers "Hand to agent"; one click writes exactly one
      curate-module job.
- [ ] **AC2** — A gardener run without an audit offers "Hand to agent" in Maintenance; one click
      writes exactly one gardener-audit job.
- [ ] **AC3** — A finished curate job shows as done in the Tasks screen with the number of pages
      changed and proposals written, taken from its run report.
- [ ] **AC4** — A valid audit result passes the `audit.ts` check, is stored in `gardener.json`, and
      Maintenance shows it like a model audit.
- [ ] **AC5** — An audit result naming a path not in the index or a finding not in the run shows
      the job as failed with the reason, and `gardener.json` is unchanged.
- [ ] **AC6** — The installed curator skill lists its checklist (filing, links, index completeness,
      contradictions); the template test pins it.

## Open Questions

- ~~**Q1 — The curator checklist** (concept O11): anything beyond the four named points?~~ answered → Decisions (Sprint)
- ~~**Q2 — Help module.** Is "Hand to agent" offered on the help module ([[086]]), or hidden because Gaston overwrites its pages?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Curator checklist: only the four points the story names.
- **(User)** Help module: "Hand to agent" is hidden on it.

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
