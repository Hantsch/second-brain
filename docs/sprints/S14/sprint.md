---
sprint: S14
status: planned # planned | in-progress | done
branch: # set by /sprint
milestone: M15 — The day is one text field
---

# Sprint S14 — A closed day and a loose end both tell the truth

## Goal

A closed journal day stays closed only until you actually write into it again — and says so when
it reopens. A loose end's resolution is visible on the day it was raised on, not only on whichever
later day happened to answer it, and a forward-looking mention becomes visible before its day
arrives instead of only after it's been missed. A Settings dead-end for a sensitive task explains
itself and points at the way out, instead of going silent.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 068 — Adding to a closed day reopens it
- [ ] 069 — A day shows how its own loose ends were answered
- [ ] 070 — A future mention becomes visible before its day arrives
- [ ] 067 — A sensitive task's recommendation explains a dead end

## Notes

Cut 2026-09-07 directly from three fresh bug reports the user gave in one batch, each investigated
before cutting rather than taken at face value:

- 068 is M15's own, previously-named "second part" item ("re-indexing a day that was added to after
  it was closed") — the only one of that named trio cut this sprint. The close-summary correction
  and the date picker's year/month drill-down (the other two second-part items) are **not** in this
  sprint; they need their own cut.
- 069 and 070 both came out of one confusing moment the user described (a follow-up answered on the
  wrong day, a meeting that was never recorded on its own day) but turned out to need two different
  mechanisms — read-time visibility of an existing answer (069) vs. write-time detection of a new
  forward-looking mention (070) — so they were split into two stories rather than one that would
  have quietly widened past its own acceptance criteria.
- 067 is a Settings/LLM-routing papercut, not a journal story, and doesn't belong to M15's own scope
  — it rides along in this sprint because it came out of the same feedback batch and is small
  (presentation fix, no threshold change). Ordered last since it touches entirely different files
  (`src/renderer/screens/settings/`, `src/core/llm/`) than 068–070 (`src/core/journal/`,
  `src/main/ipc/journal*.ts`, `src/renderer/screens/journal/`) and has no dependency on them.
- 068, 069 and 070 all touch the journal's write/read paths in overlapping files
  (`src/main/ipc/journal.ts`, `src/core/journal/`) — build them in the listed order, not in
  parallel, per the S08 git-safety lesson for build agents (no unscoped `git restore`/`git clean`).
- All four stories are `status: draft` with open questions still unresolved — `/sprint 14`'s
  clarification round decides them before build starts, per the ai-scrum profile's
  `ac-tests-required: true`.
