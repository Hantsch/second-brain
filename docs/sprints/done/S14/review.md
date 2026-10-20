# Sprint S14 review — A closed day and a loose end both tell the truth

## Overview

**Goal:** A closed journal day stays closed only until you actually write into it again — and
says so when it reopens. A loose end's resolution is visible on the day it was raised on, not
only on whichever later day happened to answer it, and a forward-looking mention becomes visible
before its day arrives instead of only after it's been missed. A Settings dead-end for a
sensitive task explains itself and points at the way out.

| Story                                                         | Status | Commit                                                                               |
| ------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| 068 — Adding to a closed day reopens it                       | done   | `18ed74e` — 068: adding to a closed day reopens it                                   |
| 069 — A day shows how its own loose ends were answered        | done   | `7350d6e` — 069: a day shows how its own loose ends were answered                    |
| 070 — A future mention becomes visible before its day arrives | done   | `949c919` — 070: a future mention becomes visible before its day arrives             |
| 067 — A sensitive task's recommendation explains a dead end   | done   | `b990fb4` — 067: sensitive task's dead-end recommendation points at the manual table |

All four stories are `done`. No blocked stories.

## Implemented stories

**068 — Adding to a closed day reopens it.** Every content write path in
`src/main/ipc/journal.ts` (append, setDay, setMood, answerLooseEnd, interviewAnswer, coach —
success and `onFailure`) now clears a closed day's `closed` field via the new hash-guarded
`reopenIfClosed()` in `src/core/journal/reopen.ts`, tells the user via a toast
(`toast.journalReopened`), and hands back the post-reopen hash so the next save never false-
conflicts. `setDay`/`setMood` are change-guarded so a no-op save leaves a closed day closed.

**069 — A day shows how its own loose ends were answered.** A loose end now shows, on the day it
was raised on, how and where it was answered — read-time only, no write path touches the
announcing day. Built by extracting a shared `announcementsOf()` scan and a verdict-returning
`resolutionCheck()` out of the former boolean `isAnswered`, and a new pure `dayLooseEnds()` that
`journal:get` composes into open ∪ resolved. Indicator placement: inline next to the loose-end
row (user decision).

**070 — A future mention becomes visible before its day arrives.** A day's own text naming a
concrete future day/event now becomes an "upcoming mention" immediately, shown in a dedicated
dashboard tile and as a calendar badge (both, per user decision), kept visibly separate from
today's loose ends (per user decision). Hands over into the existing loose-end lifecycle with the
same reminder id once the target day is reached.

**067 — A sensitive task's recommendation explains a dead end.** When Settings' guided
recommendation has nothing to propose (`pick === null`), the row now shows a concrete next step
("Assign manually") that focuses the matching routing row, instead of ending in a bare sentence.
The manual routing table gained a non-blocking inline warning when a sensitive task is assigned a
model that would not pass the sensitivity filter — the table itself stays permissive. Presentation
-only, as decided: no threshold, filter, or write path was touched.

## Findings & decisions

- **067/068/069/070 all shipped clean** on first clean-agent review pass except one file-format
  fix in 067 (CRLF from a delegate agent, fixed during verification) and two stale-comment fixes
  in 069 (found and fixed during review, not deferred).
- **068's hash-chain discipline** (Model Hint `deliverable-hard`) held: the reopen write's hash
  correctly replaces the write's own response hash across all six paths, so no false `conflict`
  on the next save.
- **069's read-time design decision** (resolution derived from the vault, degrading to "open" on
  read failure rather than claiming a wrong answer) is worth carrying forward as the default
  pattern for any future read-time derived-state feature — it fails safe.
- **070 caught a drifted seed fixture**: `scripts/seed/internal.mjs`'s `DASHBOARD_TILES` list was
  already missing the pre-existing `loose-ends` tile before this story added `upcoming-mentions`
  — fixed in passing, worth a follow-up sweep of seed/fixture drift generally.
- **067's e2e harness limit**: the no-model e2e vault's local models always satisfy
  `condense-area`'s capacity + sensitivity policy, so a `pick === null` state (the dead-end this
  story fixes) cannot be reproduced through the real Electron surface today. AC1 is instead proven
  by a renderer test against the real component tree. This is a **gap in the e2e harness**, not a
  shortcut — see Acceptance section below and the roadmap Gaps/notes.
- **067's AC2 persistence half** (assignment via the manual table is saved and used on the next
  run) is pre-existing, already-tested behaviour of `llm:setRoute`; the new e2e can only assert
  the select is present, enabled, and unfiltered — not drive a full assignment, because the
  harness vault offers no model options to pick from.
- Build order (068 → 069 → 070, then 067 independently) held with no cross-story conflicts;
  069 built directly on 068's committed state and 070 built directly on 069's `announcementsOf()`
  extraction, as planned.

## Blocked / open

None. All four stories completed without a user-blocking question during build.

## Acceptance

Acceptance is the test suite (per `.claude/ai-scrum.md`). Per-criterion mapping:

**068 — Adding to a closed day reopens it**

- AC1 (a real write reopens the day) → unit `tests/core/journal/reopen.test.ts` + main
  `tests/main/journal-ipc.test.ts` (one case per write path)
- AC2 (visible without navigating away) → e2e `tests/e2e/journal-reopen.spec.ts`
- AC3 (explicit feedback) → e2e `journal-reopen.spec.ts` + main `journal-ipc.test.ts`
- AC4 (no-op save doesn't reopen) → main `journal-ipc.test.ts` + e2e `journal-reopen.spec.ts`
- No manual residue.

**069 — A day shows how its own loose ends were answered**

- AC1 (day shows how it was answered) → core `tests/core/journal/loose-end-resolution.test.ts` +
  e2e `tests/e2e/journal-loose-end-resolution.spec.ts`
- AC2 (derived at read time, no write to the announcing day) → core test + review confirmation
- AC3 (unanswered loose end still shows open) → core test + e2e spec
- No manual residue.

**070 — A future mention becomes visible before its day arrives**

- AC1 (upcoming item visible before its day) → core `tests/core/journal/upcoming-mentions.test.ts`
  - e2e `tests/e2e/upcoming-mention.spec.ts`
- AC2 (continues into the existing loose-end lifecycle, same id) → core test (id-equality
  assertion) + `tests/core/overview/reminders.test.ts`
- AC3 (works with no model configured) → core test (heuristic-only path) + e2e run
- No manual residue.

**067 — A sensitive task's recommendation explains a dead end**

- AC1 (dead-end row shows a next step) → renderer `tests/renderer/routing-dead-end.test.tsx`.
  **Gap:** the planned e2e half could not be added — the harness's local models always pass
  `condense-area`'s filter, so `pick === null` is unreachable through the real surface today.
  Covered one level below the real surface (renderer test on the real component), not by a
  manual step. See roadmap Gaps/notes.
- AC2 (manual table remains the way out, works and persists) → unit `tests/core/llm/sensitive.test.ts`
  - renderer `tests/renderer/routing-table.test.tsx` + e2e assertion that the select exists,
    is enabled, and is unfiltered. **Gap:** the persistence half itself is pre-existing behaviour,
    not newly driven by e2e in this story — the same harness limitation (no model options in the
    e2e vault) applies.
- AC3 (unchanged `llm-unavailable` → Models tab link) → e2e `tests/e2e/settings-models-dead-end.spec.ts`
- No manual residue (both gaps above are harness-surface gaps, not human-walked steps).

**Summary:** every acceptance criterion across all four stories is proven by an automated test.
Two criteria in story 067 (AC1, and AC2's e2e half) are proven one level below the real e2e
surface because the current no-model e2e harness cannot reproduce a `pick === null` state for
`condense-area` — a harness gap, tracked below, not a manual residue and not blocking.

No `testplan.md` was written — no criterion in this sprint was marked `manual residue`.
