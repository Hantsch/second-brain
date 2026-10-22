---
id: 082
title: The ingest leaves the overview alone
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Once [[081]] makes `wiki/overview.md` the module's condensed artifact, the ingest must stop
appending to it (CND-35): two writers with two ideas of what the file is would undo each other.
Today `ingestSource()` calls `updateOverview()` when the model reports an `overviewChange`, and
`linkIntoOverview()` adds source links (`src/core/wiki/ingest.ts`).

Real vaults already carry bullet-list overviews. They must stay readable and be replaced by the
first condensation without losing anything (CND-36) — the trash copy is the safety net, the diff is
where the user sees what goes.

The module schema the app writes into every new module (`MODULE_SCHEMA_TEMPLATE`, mirrored in
`docs/MODULE-SCHEMA.md`) still tells any LLM to update `overview.md` on ingest. That instruction
has to change too, because the vault agent ([[084]]) reads it.

## Acceptance Criteria

- [ ] **AC1** — After a digestion, `wiki/overview.md` of the target module is byte-identical to
      before.
- [ ] **AC2** — The ingest prompt and reply schema no longer contain `overviewChange`; a reply that
      still carries it is accepted and the field ignored.
- [ ] **AC3** — A module with a bullet-list `overview.md` in the old format shows it in the module
      view and finds it through search as before.
- [ ] **AC4** — The first condensation of such a module shows the old bullets as removals in the
      diff; after accepting, `.secondbrain/trash/` holds the old file byte-identical.
- [ ] **AC5** — The module schema template and its `docs/` mirror describe `overview.md` as the
      condensed artifact that changes only through a confirmed condensation, not through an
      ingest.
- [ ] **AC6** — An existing module's `AGENTS.md` is not rewritten by this change.

## Open Questions

- **Q1 — Source links in the overview.** `linkIntoOverview()` adds a link per digested source.
  Drop it, move those links into `wiki/index.md`, or keep it as the one ingest write the artifact
  tolerates?
- **Q2 — Migration** (condensed-layer O10): is "the first condensation shows the old bullets as
  removals" enough, or does the user want a one-off migration?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
