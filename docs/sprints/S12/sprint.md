---
sprint: S12
status: in-progress # planned | in-progress | done
branch: sprint/S12
milestone: M14 — A project gathers itself
---

# Sprint S12 — A project gathers itself

## Goal

A project can be condensed into one file the same way an area already can (M12): the run reads
state, notes, todos/waiting-on, agent sessions and journal mentions and writes _state_, _next
step_, _waiting on_ and _learned_; the Project knowledge tab shows the diff, accepts it
hash-guarded or rejects it with a reason; and Maintenance says when a project's condensation is
due or missing. At the end, "what do I know about this project" has the same one-file answer that
areas got in M12.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 044 — A project can be condensed into one file
- [x] 045 — I see what a project's condensation changes before it's written
- [ ] 046 — Maintenance says a project's condensation is due

## Notes

**Why the project level, not the module level.** Both were open in
[concepts/condensed-layer.md](../../concepts/condensed-layer.md) after M12. The module level
replaces the existing `wiki/overview.md` ingest mechanism (CND-2, CND-35, CND-36) — a rip-out of
`updateOverview()` that changes behaviour on every existing vault. The project level is additive
only: a new sibling file, in a tab ([systems/navigation.md](../../systems/navigation.md)) already
reserved for it, with no existing mechanism to retire. Chosen as the lower-risk second level.

**No fourth "link" story.** M12 needed 036 to teach day-close about `areas:` before the area run
could read journal content at all. The project level needs no equivalent — `mentions()`
(`src/core/overview/status.ts`) already finds journal entries naming a project, and agent-session
linking already exists. Three stories, not four.

**Cut without a live acceptance of M12.** M4, M6, M9, M10, M11 and M12 are all still "built,
acceptance pending" — the roadmap's own stated rule was to gate the next condensed-layer level on
M12's acceptance. Cut anyway, by direct user decision at the 2026-09-02 `/roadmap plan`: no time
for the walkthroughs right now, more features preferred, corrections to be filed as new stories if
the walkthroughs later find something wrong. Named risk: M4/M6/M9/M10/M11 add write paths into the
real vault that have only been exercised by fake-provider tests and short demo-vault smoke runs,
not a full walkthrough against real data — building more on top doesn't create that risk, it just
doesn't reduce it either.

**Six open questions carried into refine**, none resolved at the cut (see each story's `## Open
Questions`): whether `condense-project` is sensitive like `condense-area` (044-Q1), the agent-
session citation form (044-Q2, concept's O6 — first story that actually needs it), the size cap
and input bounds for a project artifact (044-Q3/Q4, concept's O1/O3), contradictions handling
(044-Q5), whether project gets a delete affordance this sprint or later (045-Q1), and the IPC
channel shape now that a second level exists (045-Q2 — also the concept's own §7 reversal-trigger
question: does the second implementation turn out to differ from the area's only in heading
strings?).
