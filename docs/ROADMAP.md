# Roadmap

**The** one source of status and planning: where we stand, what comes next, what is not planned
at all yet. As of: 2026-08-14.

Rules (so this document does not drift):

- **Milestone granularity.** Story truth lives in the requirements folder (open = flat folder,
  finished = `done/INDEX.md`); sprint detail in the sprints folder. This file links, it does not
  duplicate.
- **Concepts are timeless** (what/why) — when/status lives **only** here.
- **Defined write moments:** end of `/ai-scrum:sprint` (phase 3), end of `/ai-scrum:concept`,
  and the `/ai-scrum:roadmap` ritual (sync check + sprint cut). "Accepted" is marked by the
  user only.

---

## Phase overview

| Phase                | Goal                                                                                                       | Status            |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| 1 — Usable every day | Every capability exists; now the app has to be legible — obvious paths, nothing written that stays unread. | ▶ **in progress** |

Phase 2 is deliberately not defined. It gets cut once phase 1 has been used for a while and
the gaps are known from use, not from guessing.

---

## Current phase: 1 — Usable every day

The feature surface is complete: all rail screens are built and every channel in
`IPC_CHANNELS` is really implemented ([README, "Status"](../README.md)). What is missing is not
capability but legibility — eleven flat rail entries, a write path into `areas/` that no screen
reads, and screens for things that are actions rather than places.

Way of working: every milestone ends in an increment that can be driven through the real UI.
Between milestones: playtest, review, steering by the user. Stories are cut only once the
previous milestone is accepted, so scope does not balloon up front.

### M1 — Navigation: places, actions, systems — ▶ in progress

Concept: [concepts/navigation.md](concepts/navigation.md).

The rail goes from eleven flat entries to seven, and the distinction between **place**,
**action** and **system** becomes structurally visible. Sources moves inside Knowledge, agent
sessions move inside Projects, capture and ask lose their rail entries and become overlays, and
`areas/` finally gets a screen that reads it — which is also what turns the inbox into a filter
instead of a duty.

Sprints:

- [sprints/S01/sprint.md](sprints/S01/sprint.md) — the rail becomes places (002, 007, 008), `planned`
- [sprints/S02/sprint.md](sprints/S02/sprint.md) — notes get a home (005, 006), `planned`

Gaps/notes:

- **Nobody owns the wholesale rail renumber.** Story 002 defers it ("the rail is renumbered
  wholesale by the later navigation stories"), but no story's acceptance criteria claim it. After
  S01 the rail is correct but its digit hotkeys have holes. To be picked up in `/refine 006` as an
  explicit deliverable, or promoted to its own story before S02 starts.
- **Story 001 shipped without a sprint.** It sits in `done/` with `· — ·` instead of a sprint id.
  Not worth backfilling; noted so the gap in the sprint history is not read as a lost sprint.
- Acceptance of M1 is the user's call — no milestone here is ticked by a session.

### M2 — Projects answer where I left off — planned

Stories 003 (notes and waiting-on, editable in place), 004 (where the status and next step come
from), 013 (favourite projects and an order that matches how I work). No concept behind them;
the stories are detailed enough to cut from directly.

Depends on M1: story 008 moves a Sessions tab into this same screen, so doing this first would
mean touching the project detail twice.

### M3 — The journal becomes one thing — planned

Stories 011 (one entry instead of day and conversation), 012 (the interview, for when the field
is empty), 009 (filter for days that are not finished), 010 (a calendar on top of the days). No
concept behind them.

Independent of everything else — [concepts/navigation.md](concepts/navigation.md) explicitly
leaves the journal untouched, so this milestone can be pulled forward at any point without
rework.

### M4 — A finding can be acted on — planned

Stories 014 (the run reports findings, not results), 017 (a finding says how it ends), 016
(orphan page — I pick the target), 015 (resolve a near-duplicate). Cut straight from the
stories, by decision on 2026-08-14 — no concept.

Note: 015, 016 and 017 add new **write** paths into the vault (merging pages, inserting links,
recording a verdict). The AI-proposes/human-confirms guardrail and the hash-guarded write are
the load-bearing part of this milestone, not the screens.

The order of M2 / M3 / M4 is not fixed. It is confirmed at the next `/ai-scrum:roadmap plan`,
once M1 has been used.

---

## Open / unprioritised

| Topic                                           | State                                                                     | Next step                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Project knowledge condensed from agent sessions | Named as out of scope in [concepts/navigation.md](concepts/navigation.md) | `/ai-scrum:concept` — what gets condensed, when, and how it is confirmed |
| German docs migrated to English                 | Decided in `.claude/ai-scrum.md`; `docs/*.md` are still German            | Own story once it stops being cosmetic                                   |
| Phase 2                                         | Not defined                                                               | Cut after phase 1 has been used                                          |
