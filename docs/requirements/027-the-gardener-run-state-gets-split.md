---
id: 027
title: The maintenance run state stops being one big file
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

This story has no visible effect. It exists because the two files that carry the maintenance
run have grown past the point where the next change to them is safe:

- [src/main/gardener-state.ts](../../src/main/gardener-state.ts) — 788 lines
- [src/main/ipc/gardener.ts](../../src/main/ipc/gardener.ts) — 409 lines

The soft limit in CLAUDE.md is ~300. Both were already flagged as over it under M4, reviewed as
"still single-responsibility", and then grew further through M7 (021a progress ownership, 021b
stop/continue persistence, 021c scoped runs). Three of the four bugs a review found in 021b and
021c were in exactly this state handling — a partial run reporting a computed score, `closeVault()`
not cancelling, resume clearing a fixed finding, and a scope naming only an unmodeled kind
deleting prior findings. That is the signature of a file that holds more state than one reader
can keep in their head.

The reason this matters to me and not only to the code: the maintenance run is the one place in
the app that writes findings, freezes a health score and survives being stopped. When that state
is wrong, I lose findings — silently. The last two stories in that file each shipped a
silent-data-loss bug that review caught. I would rather the next one be harder to write.

Nothing about how a run behaves may change. This is a split, not a redesign.

## Acceptance Criteria

- [ ] A maintenance run behaves exactly as it does today: start, progress from any screen, stop
      and keep findings, continue, scope to a kind or module, autorun, cancel on vault close.
- [ ] No file involved is over the ~300-line soft limit afterwards, and each one can be named in
      a single sentence.
- [ ] The existing tests for 021a/021b/021c pass unchanged — they are the specification of the
      behaviour being preserved. No test is rewritten to fit a new structure.
- [ ] The IPC contract is untouched: same channels, same payloads, same events.
- [ ] What each new file owns is written down, so the next feature knows where it goes.

## Open Questions

1. **Where do the seams actually run?** Candidates: run lifecycle (start/stop/resume) · finding
   persistence and merge · health score and its freezing · progress weighting and events ·
   scope resolution. Needs to be established from the code, not assumed.
2. **Does any of this belong in `src/core/` instead of `src/main/`?** Some of it is plain state
   logic that knows nothing about Electron, and core is where logic is supposed to live —
   which would also make it directly testable without the main process.
3. **Is a behaviour-preservation guard needed before the split** (a characterisation test over
   the current run state transitions), or do the existing 021 tests cover enough?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
