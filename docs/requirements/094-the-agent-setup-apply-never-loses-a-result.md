---
id: 094
title: The agent setup apply never loses a result and never downgrades
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Two edges of the setup apply from story [[084]] that the S20 review left open
([S20 review](../sprints/S20/review.md)):

- A managed file the user edited and that carries a **newer** template version than this Gaston (written
  by a newer Gaston, then opened with an older one) shows as `modified` and is an opt-in. Ticking it
  overwrites it with the older template — a downgrade, after the undo copy is taken.
- A hard write error in the middle of an apply throws away the per-file results of the files already
  written and skips the manifest. The marker fallback recovers the state on the next read, but the user
  sees an error and no record of what was written.

## Acceptance Criteria

<Sketch for refine — rewrite as numbered, observable criteria.>

- [ ] **AC1** — A managed file with a newer template version than the shipped one is listed as "newer"
      in the plan, cannot be ticked for overwrite, and is byte-identical after an apply.
- [ ] **AC2** — When writing one file fails, the apply result lists every file written before it, names
      the failed file with the reason, and the manifest records the files that were written.
- [ ] **AC3** — After a partial apply, the Agent tab shows the real state (some current, one failed)
      and a second apply completes the rest.

## Open Questions

- **Q1 — Newer and edited.** Is a downgrade ever wanted (an explicit "restore Gaston's version")? If so
  it is its own action, not a ticked box.

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
