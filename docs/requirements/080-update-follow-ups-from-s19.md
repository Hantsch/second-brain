---
id: 080
title: Update and release follow-ups from S19
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-20
---

## Requirement

Small gaps the S19 reviews left open. Each is real but decision-free; refine decides which are worth a story.

- Release runner: the post-push `gh` recovery hint prints paths that vanish with the CI runner; `electronBuilderCli` is duplicated from `scripts/handoff.mjs`; the `currentVersion` regex in `plan.mjs` is unanchored.
- Update service: electron-updater starts the installer one tick before `app.quit()` fires, so a task starting in that tick is vetoed by close-guard mid-install; a download re-checks and may fetch a newer version than announced; a timed-out check keeps running underneath; a manual-check IPC rejection has no UI; `service.ts` is ~320 lines (soft limit 300); three hand-rolled progress bars remain besides the new `ProgressBar` atom; `formatDateTime` resembles `HealthCard` `stamp()`.
- Tests: `start()`/will-quit wiring and the real `isSupported` gate in `services.ts` are not asserted directly. `tests/renderer/journal.test.tsx` ("bricht mit Enter, Shift+Enter und Ctrl+Enter nur die Zeile um") timed out once under full-suite load and passed alone.

## Acceptance Criteria

<To be written in refine.>

## Open Questions

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints
