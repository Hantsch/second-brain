---
id: 073
title: A run I walk away from still has its result
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The two runs the user actually named — condensing an area or a project, and closing a day —
become tasks in story 071's queue, and their results stop being tied to the component that
started them. Today both are awaited mutations in the renderer
(`src/renderer/lib/queries/condense.ts:43`, `journal:close`): leaving the screen mid-run
means the proposal, once it arrives, has nowhere to land, and the user has to run the model
again to get it back. On a local model that is minutes of work thrown away.

Decided with the user at the cut (2026-09-07): the finished task itself holds the result and
offers a way to it — "view result" routes to the area's or project's knowledge tab, or to the
day, with the proposal open. Guardrail 2 stays intact: a proposal that arrived while the user
was elsewhere is still a proposal and is never written by itself.

## Acceptance Criteria

- [ ] **AC1** — Starting a condensation (area or project) creates a task visible in the queue,
      and the panel that started it shows the same state as the task list.
- [ ] **AC2** — Navigating to another screen while a condensation runs does not cancel it;
      returning to the panel shows the finished proposal instead of an empty panel or a
      restarted run.
- [ ] **AC3** — Starting a day's close creates a task with the same behaviour: leaving the
      journal and coming back shows the finished close proposal.
- [ ] **AC4** — A finished task offers "view result", which routes to the area/project
      knowledge tab resp. the day, with the proposal open.
- [ ] **AC5** — A proposal that completes while the user is on another screen writes nothing
      to the vault until it is accepted (CLAUDE.md guardrail 2).
- [ ] **AC6** — Requesting a second condensation while one runs shows that it is waiting, with
      its position — not a spinner that means nothing.
- [ ] **AC7** — With no model configured, no task is created and the existing honest "no
      model" state appears unchanged (CLAUDE.md guardrail 1).
- [ ] **AC8** — A condensation or close that fails states its reason where the run was started
      as well as in the task list; the panel does not stay stuck in a running state.

## Open Questions

- Where does a completed-but-unaccepted proposal live: extend the existing session store
  (`src/renderer/lib/close-proposal.ts`) and the condense query cache, or hang the payload on
  the task record in main? Recommendation: on the task record — the renderer store dies with
  a reload, and the user's complaint is precisely about results that do not survive.
- Does a task whose result was accepted (or rejected) drop out of the finished group, or stay
  with an "accepted" mark?
- Does the interview plan (`journal:interviewPlan`) belong in this story or ride along in 074?

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
