---
id: 071
title: Work in flight is one queue
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The app does work on the user's behalf: it condenses an area or a project, closes a day,
imports a source, runs maintenance. From the user's own report (2026-09-07): "every time I
condense something or close a day I assume that creates a task which then runs — but I can
barely see it." Today that assumption is only half true. The maintenance run has one owner
(`src/main/gardener-run-state.ts`) and stays visible everywhere; a condensation and a day's
close are plain awaited mutations in the renderer (`useCondenseRun`, `journal:close`), so the
run exists only inside the component that started it. Navigate away and the work becomes
invisible, and its result lands nowhere the user can reach.

Before anything can be shown, there has to be one thing that knows the truth: what is
running, what is waiting, what has just finished, and how it ended. This story builds that
truth and nothing else — the rail entry and the screen are story 072, the two runs the user
named are story 073, maintenance and imports are story 074.

Two shapes already exist and must be generalised, not copied: `GardenerRunHandle`
(one owner, publish-and-emit, `finish()` in a `finally`) and `IngestJob`
(`src/shared/types/knowledge.ts:194` — id, kind, stage, progress, message, error,
startedAt, finishedAt, result references).

## Acceptance Criteria

- [ ] **AC1** — A started long run appears in one queryable list with its kind, the subject it
      addresses (area/project slug, date, source label), its state
      (`queued` | `running` | `done` | `failed` | `cancelled`), progress, `startedAt` and
      `finishedAt`.
- [ ] **AC2** — At most one model-bound task runs at a time. A second request is enqueued and
      reports its position in the queue instead of starting a parallel run.
- [ ] **AC3** — A queued task starts by itself as soon as the running one ends — whether that
      one finished, failed or was cancelled.
- [ ] **AC4** — Every state change is emitted over one channel, and the current list is also
      readable on demand, so a renderer that connects late sees exactly the same state as one
      that was there from the start.
- [ ] **AC5** — A failed task keeps a one-sentence reason, is visible as failed, and never
      blocks the lane for the tasks behind it.
- [ ] **AC6** — Closing the vault or quitting the app cancels the running task and clears the
      queue: nothing keeps computing over a closed vault, and no task is left in `running`
      forever.
- [ ] **AC7** — A finished task stays readable for the rest of the session with its outcome,
      and the retained list is capped, so a long session cannot grow it without bound.
- [ ] **AC8** — No task record carries vault content beyond the subject it names — no journal
      text, no note body, in the record or in any log line (CLAUDE.md guardrail 6).

## Open Questions

- Does the queue survive an app restart (persisted under `.secondbrain/`) or is it
  session-only? Recommendation: session-only — the index is derived and so is this; a task
  that was interrupted by a quit is restarted by the user, not resurrected half-done.
- Do fast, mechanical runs (an index refresh, a heuristic-only close without a model) enter
  the queue at all, or bypass the single lane? Recommendation: they enter the list (so the
  list is the whole truth) but do not take the model lane.
- Does the registry live in `src/core/` (pure, testable, Electron-free) with main only wiring
  events, or wholly in `src/main/` like `gardener-run-state.ts`? Recommendation: the queue
  logic in core, the wiring in main — the state machine is exactly the kind of thing
  CLAUDE.md wants testable without Electron.
- Is `event:ingest-progress` replaced by the new channel or kept alongside for story 074?

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
