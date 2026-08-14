---
sprint: S02
status: planned # planned | in-progress | done
branch: # set by /sprint
milestone: M1 — Navigation: places, actions, systems
---

# Sprint S02 — Notes get a home

## Goal

`areas/` stops being a write path with no read path. A rail entry **Notes** shows the areas and
their entries, lets a thought be written without picking a target first, and the old inbox
becomes the "unfiled" filter on it — so filing turns from a duty into an offer. At the end the
rail stands at the seven entries of [the concept](../../concepts/navigation.md), and M1 is
complete.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 005 — Notes — a home for the areas
- [ ] 006 — Inbox becomes the "unfiled" filter in Notes

## Notes

**Why only two stories.** 005 is the one genuinely new screen in the whole milestone, and the
only story in M1 that needs a read path that does not exist yet: nothing in `src/core/index/`
derives areas or their notes today. 006 then moves the entire filing workspace — two columns,
four actions, ten-second undo, path-bound selection, a documented keyboard map — onto that new
screen without losing any of it. Either one alone is a sprint's worth of care.

**006 hard-depends on 005**, stated in the story. Strict build order.

**The load-bearing rule is "no loss".** 006's acceptance criteria are almost entirely a list of
things that must survive the move. The selection hanging off the path rather than the position,
and undo covering "leave it" too, are the two that a passing test suite is least likely to
notice breaking.

**Both languages, and the empty state.** 005 adds a whole screen: every label through `t()` in
`de` and `en`, and an empty state that says what belongs in here — the concept forbids adding a
new emptiness.

**Rail renumber.** Notes is the last entry to arrive, so this sprint is where the rail's digit
hotkeys get their final, wholesale numbering. Nobody owns it yet — see the M1 gap note in
[../../ROADMAP.md](../../ROADMAP.md). Resolve it in `/ai-scrum:refine 006` as an explicit
deliverable, or cut it as its own story before this sprint starts.

**Open questions to resolve in the clarification round** (from the story files):

- 005 — where does a note with no chosen target land: a default area, a new area per note, or
  the inbox with a proposal? The story argues for a default area.
- 005 — are areas visible as groups on this screen, or is it one flat stream with the area as a
  quiet label?
- 005 — does an area need its own detail view, like a project?
- 005 — the rule, in one sentence on screen, that tells a note apart from a journal day entry.
- 006 — after filing, does the dump vanish from Notes, or stay visible as "filed into
  <project>" with a link?
- 006 — one shared layout for Notes and the unfiled workspace, or does the filter switch the
  screen into the two-column workspace?

**Acceptance.** Both stories are user-facing: real UI path plus
`npm run seed && npm run shot` before done. Additionally mandatory here, per CLAUDE.md, because
005 introduces a write path: the file round-trip test (write → edit externally → re-read) and
the conflict test (stale hash fails instead of overwriting).
