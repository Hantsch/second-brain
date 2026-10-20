---
sprint: S15
status: done # planned | in-progress | done
branch: sprint/S15
milestone: M16 — Work in flight is visible, and what it proposes is correctable
---

# Sprint S15 — Work in flight has a place, and a proposal can be corrected

## Goal

At the end of this sprint the app has one queue for every long run and one place that shows
it: a rail entry above maintenance with a live list of what runs, what waits and what just
finished — including a way back to the result of a run the user walked away from. And the
day's close stops being all-or-nothing: every proposed line and every field can be corrected
before it is accepted.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 071 — Work in flight is one queue
- [x] 072 — Tasks have a place above maintenance
- [x] 073 — A run I walk away from still has its result
- [x] 074 — Maintenance and imports join the same queue
- [x] 075 — A close proposal can be corrected, not just pruned

## Notes

Cut 2026-09-07 from two fresh user reports after real use: background work that is assumed to
exist but is barely visible, and a close proposal that can only be discarded, not corrected.

- **Strict order for 071 → 074.** 071 builds the registry, 072 the surface, 073 moves the two
  runs the user named onto it, 074 migrates the two that already have their own mechanism.
  074 is the riskiest story of the sprint: it touches `gardener-run-state.ts`,
  `gardener-autorun.ts`, `close-guard.ts` and the ingest progress path, all of which are
  covered by existing tests that must stay green without being weakened.
- **075 is independent** of 071–074 and touches only
  `src/renderer/screens/journal/CloseProposal.tsx`, `src/renderer/lib/close-proposal.ts` and
  the applyClose path. It could be built first if the queue stories run long.
- **Reuse, do not copy** (CLAUDE.md): `GardenerRunHandle` (one owner, publish-and-emit,
  `finish()` in a `finally`) and `IngestJob` (`src/shared/types/knowledge.ts:194`) are the two
  existing shapes 071 generalises. The chips-plus-picker row from story 036 is the pattern 075
  follows for its per-item fields.
- The S08 git-safety rule applies as usual: no unscoped `git restore` / `git clean` in build
  agents.
