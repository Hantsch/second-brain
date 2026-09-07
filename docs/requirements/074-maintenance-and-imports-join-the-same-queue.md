---
id: 074
title: Maintenance and imports join the same queue
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

Decided with the user at the cut (2026-09-07): every long run belongs in one list, not two
mechanisms for the same problem. The maintenance run already has its own owner
(`src/main/gardener-run-state.ts`, plus `gardener:runStatus`, `gardener-autorun.ts` and
`close-guard.ts` around it) and an import already has its own job shape
(`IngestJob` / `event:ingest-progress`). Both migrate onto story 071's registry, so "is
something running" has exactly one answer — the same reason `gardener-run-state.ts` was
created in the first place, applied one level up.

This is a migration story, not a feature: nothing the user can do today may stop working.

## Acceptance Criteria

- [ ] **AC1** — A maintenance run appears as a task in the queue, with its stage-weighted
      progress (`src/core/gardener/progress.ts`) unchanged — the bar still weights the model
      stages as it does today.
- [ ] **AC2** — An import (YouTube, PDF, URL) appears as a task with its existing stages and
      messages; every consumer of the old progress path either keeps working or is migrated in
      this story, with none left reading a channel nobody feeds.
- [ ] **AC3** — Two maintenance runs still cannot overlap over one vault: the second is
      refused or queued, and there is no path (channel or autostart) that starts one behind
      the registry's back.
- [ ] **AC4** — The quit/close guard still asks before killing a running maintenance run, and
      now asks for a running condensation or import too, instead of dropping them silently.
- [ ] **AC5** — `gardener:runStatus` and the autostart read the registry; a test proves there
      is no second source of "a run is going".
- [ ] **AC6** — The existing gardener run and `RunStrip` test suites stay green without being
      weakened, and the e2e cross-screen check from story 042 still passes.

## Open Questions

- Is `event:gardener-progress` kept as a narrow view onto the registry (cheapest for
  `RunStrip` and `QuitDuringRunDialog`), or removed in favour of the new channel?
- Do imports take the same single model lane as condensations, or their own — a transcript
  fetch is network-bound, not model-bound?
- Does the vault-close cancel path stay in `gardener-run-state.ts`'s shape (`'shutdown'` keeps
  nothing, `'user'` keeps partial results) for every kind of task?

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
