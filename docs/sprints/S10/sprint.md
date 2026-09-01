---
sprint: S10
status: in-progress # planned | in-progress | done
branch: sprint/10
milestone: M12 — An area gathers itself
---

# Sprint S10 — An area gathers itself

## Goal

The condensed layer gets its first real instance. An area stops being a folder that collects and
becomes a thing that says what it knows: a day entry names the areas it touched, an area can be
condensed into one machine-written file with _state_, _patterns_ and _open_, and that file is only
ever written after I have read the diff — including what it deleted.

At the end, `Notes → <an area>` leads from "there is material here" to one page of prose with
source paths under every section, and maintenance says when it has gone stale. Nothing condenses
on its own, nothing is written unread, and without a model the area says so instead of guessing.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 036 — A day says which areas it belongs to
- [ ] 037 — An area can be condensed into one file
- [ ] 038 — I see what a condensation changes before it is written
- [ ] 039 — Maintenance says a condensation is due

## Notes

**Why area and not module or project.** Chosen by the user at the 2026-09-01 `/roadmap plan`
against project (greenfield, tab reserved) and module (replaces the existing bullet mechanism).
The cost of that choice is in the sprint: the journal→area link does not exist yet (story 036 has
to build it first) and the artifact's file name collides with VAULT-FORMAT.md's no-dots rule
(037-Q2). The benefit is that no existing artifact has to be migrated — `wiki/overview.md` and
CND-35/36 stay untouched, and the module level keeps working as it does today.

**One level, not three.** M12 is deliberately the area level only. CND-2, CND-17 (agent-session
citation) and CND-35/36 (retiring the ingest's overview append) belong to the module and project
levels and are out of scope. The concept's reversal trigger for per-level sections (§7) is
evaluated when the _second_ level is built, not here.

**The architectural calls of this sprint** sit in 037's open questions and should be settled in
the clarification round before refine: the artifact's `type:` (O2), its file name (O7), the size
cap (O1) and the input bounds (O3). Q5 (a run rewriting the human's own hand edit, O8) is the one
that can turn into a guardrail-2 problem if it is answered late.

**Deliberately not in this sprint:** the `format:check`-never-green-on-Windows carve-out (CRLF vs.
prettier's LF), still open from S07 and still blocking `npm run handoff`, and the maintenance
progress bar lost on navigation. Both stay in the roadmap's "Open / unprioritised" table. M9 was
the carve-out milestone two sprints ago; these two are a separate small sprint, not a rider on a
concept-heavy one.

**Carried in from S09:** story 034 is still `in-progress` (built, live acceptance pending on the
test user's laptop). It is not part of this sprint and must not be touched by it.
