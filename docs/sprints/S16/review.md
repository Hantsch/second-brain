# Sprint S16 review — The entrance tells the truth, and the gate never sleeps

## Overview

Goal: `npm run verify` runs on every push and pull request, so no red test and no unformatted
file can ride along for a sprint again; and the knowledge pillar's entrance stops producing
hollow pages — a digestion completes whole or leaves no trace, a video without a transcript is
a visible honest state, and a fetched page that yields nothing says so.

| Story | Status | Commit |
| --- | --- | --- |
| 065 — The gate runs on every push | done | `065: gate npm run verify on every push, advisory ui-smoke lane` |
| 050 — A digestion completes whole or leaves no trace | done | `050: digestion completes whole or leaves no trace` |
| 051 — A video without a transcript is an honest failure | done | `051: a video without a transcript is an honest failure` |
| 064 — A fetched page that yields nothing says so | done | `064: a fetched page that yields nothing says so` |

All four stories built in the planned order (065 first, then 050 → 051 → 064), no story
blocked. No user clarification round was needed — all four stories' `## Open Questions`
sections were empty at refine time.

## Implemented stories

**065 — The gate runs on every push.** Prettier pinned to exact `3.9.6` and one `npm run
format` pass landed first (241 files) so the gate's first run is not red on day one. A required
`.github/workflows/verify.yml` (push + pull_request, `windows-latest`, cached `npm ci` → `npm
run verify`, no secrets) and an advisory `.github/workflows/ui-smoke.yml` (seed → build → shot,
`continue-on-error`) were added, plus a static wiring test suite and a README paragraph.

**050 — A digestion completes whole or leaves no trace.** `ingestSource`'s write phase now runs
through a `WikiTransaction` that rolls back everything on any throw; a retry re-enters an
existing undigested source page for the same raw path instead of minting a `…-2` duplicate;
writes are serialized per module (`withModuleLock`) so two concurrent digestions both complete
without losing a chronicle entry; a clamped chunk-merge states the cut on the source page; quit
mid-run reuses `WorkRegistry`/`QuitDuringRunDialog` unchanged; and `describeFailure` gives every
failure a closed, known reason code — the mechanism 051 and 064 both build on.

**051 — A video without a transcript is an honest failure.** The queue gained a `no-content`
terminal stage, checked before "no model configured", so a transcript-less video never becomes
a hollow condensed page. `RawSource.blocked` surfaces the reason on the source row and to the
gardener; an explicit, user-triggered "digest from description" action (never automatic, per
guardrail 2) lets the user opt in per source.

**064 — A fetched page that yields nothing says so.** The fetcher now sends a truthful
User-Agent; extraction under a content-length threshold reuses 051's `no-content` terminal
state instead of writing a hollow wiki source; `ingest:start` gained a `force` flag for an
explicit "Ingest again" that always lands on a new dated raw file, never overwriting the
original.

## Findings & decisions

- **Reuse held across all three ingest stories.** 051 extended 050's failure-reason mechanism
  instead of adding a parallel one; 064 reused 051's `no-content` terminal state and
  `SourceBlockReason` shape instead of inventing a second. No story needed a third mechanism.
- **`describeFailure` was tightened during 050's review** to read `code` off a closed known set,
  so an unrecognized error code (e.g. a raw OS errno) falls back to `unknown` instead of leaking
  an untranslated string to the renderer.
- **064's review caught a real hollow-page loophole**: a raw source already marked `no-content`
  could still be manually re-condensed into a real, citable wiki page, because the manual
  re-condense path re-read the whole raw file instead of honouring the recorded verdict. Fixed
  before the story closed.
- **Two files are now over CLAUDE.md's ~300-line soft limit**: `src/core/wiki/ingest.ts` (435+
  lines) and `src/main/ipc/ingest.ts` (530+ lines), both grown by 050's five deliverables.
  Reviewed as still single-responsibility internally; a split is a candidate follow-up, not done
  in this sprint.
- **050's module lock covers two write segments** (source-page write, then finish-phase) with
  the model call left unlocked between them, rather than only the narrower set of files named in
  the story's Notes — needed because `freeSlug` picks its slug via `store.exists`, which two
  concurrent runs into the same module would otherwise race. Reviewed and judged safe.
- **Two narrower gaps left undone, documented rather than fixed** (050): `WikiTransaction.
  rollback()` runs outside the module lock, so a failing digestion's own catalog/chronicle
  entries can dangle one level below what AC1 tests if a concurrent sibling has already advanced
  past it; `findSourcePageForRaw`'s idempotent retry can only see pages the derived index already
  knows about, so a retry immediately after a hard kill can still mint a `…-2` in a narrow
  window. Both flagged for a follow-up story rather than fixed here.

## Blocked / open

None. All four stories completed; nothing needs a user decision.

## Acceptance

Acceptance is the test suite (per `.claude/ai-scrum.md`); every criterion below is proven by a
named, passing test.

**065**
- AC1–AC4, D1's prettier-pin guard → `tests/scripts/ci-gate.test.ts` (20/20).
- Manual residue: AC1/AC5's real GitHub Actions run and AC4's cold/warm runtime numbers are
  only observable once `sprint/S16` is pushed — an external-service gap, not a test gap.

**050**
- AC1 → `tests/core/wiki/transaction.test.ts`, `tests/core/wiki/ingest.test.ts`.
- AC2 → `tests/core/wiki/concurrency.test.ts`.
- AC3 → `tests/e2e/quit-during-digestion.spec.ts` (real e2e, through the built app).
- AC4 → `tests/core/wiki/summarize.test.ts`, `tests/core/wiki/prompts.test.ts`,
  `tests/core/condense/notice.test.ts`.
- AC5 → `tests/core/wiki/summarize.test.ts`, `tests/main/ingest-ipc.test.ts`. Manual residue: no
  e2e assertion on the moving bar's actual percentage — the e2e fake provider answers instantly;
  the same S14/S15 harness limit sprint.md already names.
- AC6/AC7 → `tests/core/ingest/queue.test.ts`, `tests/core/wiki/ingest.test.ts`.

**051**
- AC1–AC6 → unit/renderer/main tests plus `tests/e2e/source-no-transcript.spec.ts` (real e2e,
  4/4). Named gap: AC1's terminal state itself is not e2e-reachable without live network (no
  transcript can be fetched offline); AC5's e2e proof covers the structural guarantee rather than
  one specific pre-existing hollow artifact, since the seed vault carries none. Both gaps were
  named at refine, not discovered late.

**064**
- AC1–AC5 → `tests/core/ingest/url.test.ts`, `tests/core/ingest/queue.test.ts`,
  `tests/core/ingest/existing.test.ts`, `tests/main/ingest-ipc.test.ts`,
  `tests/main/fetch-fixture-seam.test.ts`, plus `tests/e2e/url-no-content.spec.ts` (real e2e,
  2/2). No manual residue.

Summary: every acceptance criterion across all four stories is proven by a named test; three
criteria (065's AC1/AC4/AC5) carry manual residue for the reason above (an external CI service,
unobservable before the branch is pushed) and two criteria (050's AC5, 051's AC1/AC5) are named,
harness-shaped gaps that were called out at refine rather than found late. Nothing here blocks a
story or the sprint.
