---
sprint: S07
status: planned # planned | in-progress | done
branch: # set by /sprint
milestone: M9 — The gate is green and the small things are right
---

# Sprint S07 — The gate is green and the small things are right

## Goal

`npm test` is fully green for the first time since M1, no screenshot run reads real session data,
German text closes its quotes, filing writes headings in the vault's own language, and the
maintenance run state is a set of files a reader can hold in their head. Nothing new — the
backlog of things every previous sprint had to say "pre-existing, unrelated" about is gone.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 023 — The module schema says one thing, not two
- [ ] 025 — A screenshot run never reads my real session data
- [ ] 024 — Filing writes headings in my document language
- [ ] 026 — German text closes its quotes, and three journal papercuts
- [ ] 027 — The maintenance run state stops being one big file

## Notes

**Why this sprint at all.** Chosen by the user on 2026-08-22 over cutting the condensed layer
(M9 candidate, concept written, still unprioritised). Every gap in it was already documented in
the roadmap under M1–M8 as "pre-existing, needs an owner" — this sprint gives them one. None of
the five is a new capability; four of the five are visible to the user anyway.

**Why this order.**

- **023 first** because it is the only story that changes what "done" means for the four after
  it. Until the byte-exact `MODULE_SCHEMA_TEMPLATE` check passes, every story in this sprint has
  to report `npm test` as "one pre-existing failure", which is exactly the carve-out this sprint
  is supposed to remove. It also touches nothing any other story touches.
- **025 second** because it changes what a screenshot run reads, and stories 024 and 026 both
  need a live smoke run for acceptance. Fixing the seed first means those runs are clean.
- **024 and 026 in the middle** — both user-facing, both need `npm run seed && npm run shot`
  (P1 and P2 apply). Independent of each other: 024 is core write paths, 026 is renderer strings
  plus two renderer files.
- **027 last** deliberately. It is the largest diff, it touches the most bug-prone state in the
  app, and it must not be interleaved with anything that could be blamed for a regression in it.
  If the sprint has to be cut short, this is the story to drop — it is the only one with no
  user-visible effect.

**All five stories are `draft`, not `ready`.** Each carries 3 open questions that are real
decisions, not formalities:

- 023-Q1 (doc or code authoritative) changes what gets written into real vaults from then on.
- 024-Q1 (which write paths are in scope) and 024-Q3 (which section-name pairs) set the size of
  the story; 024-Q2 asks what a language switch owes an existing vault.
- 026-Q1 (`„…”` vs `«…»` vs straight) is a one-time convention decision for the whole German
  catalogue.
- 027-Q2 (does any of this move to `src/core/`) is an architecture question, not a refactor
  detail.

`/sprint S07` puts these to the user in its clarification round. **023-Q1, 024-Q2, 026-Q1 and
027-Q2 must not be resolved by an agent** — they are content or architecture decisions.

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true. 024 and 026 are
user-facing and need a real path through the running app before they may be called done. 023, 025
and 027 have no UI of their own: 023 is exempt (engine + docs), 025 is the screenshot harness
itself, and 027's acceptance is that the existing 021 tests still pass plus one live run through
the maintenance screen to confirm nothing moved.

**Milestone.** M9 is created by this sprint. The condensed layer stays in
"Open / unprioritised" and remains the strongest candidate for M10 — this sprint deliberately
does not touch it.

**Note on 026's scope.** Story 022's Done section recorded the quote defect as "two i18n
strings". That count was wrong: it is 98 occurrences across 13 files, and the correct form
appears zero times. The story is written to the real number. Do not narrow it back to two
strings on the strength of the older note.
