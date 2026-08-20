# Roadmap

**The** one source of status and planning: where we stand, what comes next, what is not planned
at all yet. As of: 2026-08-20.

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

### M1 — Navigation: places, actions, systems — accepted

Concept: [systems/navigation.md](systems/navigation.md) (moved from `concepts/` — fully built).

The rail went from eleven flat entries to seven, and the distinction between **place**,
**action** and **system** is now structurally visible. Sources moved inside Knowledge, agent
sessions moved inside Projects, capture and ask lost their rail entries and became overlays, and
`areas/` finally has a screen that reads it — which is also what turned the inbox into a filter
instead of a duty. All five stories are done; the milestone's target picture is fully built and
accepted by the user on 2026-08-19.

Sprints:

- [sprints/done/S01/sprint.md](sprints/done/S01/sprint.md) — the rail becomes places (002,
  007, 008), `done` — accepted
  ([review](sprints/done/S01/review.md) · [testplan](sprints/done/S01/testplan.md))
- [sprints/done/S02/sprint.md](sprints/done/S02/sprint.md) — notes get a home (005, 006),
  `done` — accepted
  ([review](sprints/done/S02/review.md) · [testplan](sprints/done/S02/testplan.md))

The rail now stands at its final seven entries: Dashboard, Projects, Journal, Knowledge, Notes,
Maintenance, Settings — digits 1–7, system entries separated at the foot. Sources sits under
Knowledge, agent sessions under Projects, capture and ask are shell overlays, `areas/` reads
into Notes, and the old inbox is the "unfiled" filter on it.

Gaps/notes:

- **`tests/core/wiki/module.test.ts` is red and predates S01.** `MODULE_SCHEMA_TEMPLATE` in
  `src/core/wiki/module.ts` drifted from `docs/MODULE-SCHEMA.md` when the doc was migrated to
  English (commit `e8959d1`). Left untouched through both sprints because resyncing it changes
  the module schema template written into the user's vault — a content decision, not a
  navigation one. Still needs an owner: decide which side is authoritative.
- **`capture-proposal.ts` hardcodes the German filing section name** regardless of the vault's
  document language (`docs.documents` setting). Surfaced by S02's story 005, which built a
  tolerant heading match for its own areas-specific write path but deliberately did not extend
  the general filing path. Worth its own story once English-language vaults are common.
- **`scripts/seed/internal.mjs` pins `claudeProjectsDir` for the demo vault but not Codex**, so
  screenshot runs read the real `~/.codex/sessions`. Pre-existing from story 001, surfaced by 008
  because the Sessions tab now reads both CLIs.
- **Story 001 shipped without a sprint.** It sits in `done/` with `· — ·` instead of a sprint id.
  Not worth backfilling; noted so the gap in the sprint history is not read as a lost sprint.
- **M1 accepted by the user on 2026-08-19**, both sprints' test plans walked end to end:
  [sprints/S01/testplan.md](sprints/S01/testplan.md),
  [sprints/S02/testplan.md](sprints/S02/testplan.md).

### M2 — Projects answer where I left off — accepted

Stories 003 (notes and waiting-on, editable in place), 004 (where the status and next step come
from), 013 (favourite projects and an order that matches how I work). No concept behind them;
the stories are detailed enough to cut from directly.

Depended on M1: story 008 moved a Sessions tab into this same screen, so M1 went first to avoid
touching the project detail twice. M1 is accepted; M2's target picture is fully built and
accepted by the user on 2026-08-19, [sprints/done/S03/testplan.md](sprints/done/S03/testplan.md)
walked end to end.

Sprints:

- [sprints/done/S03/sprint.md](sprints/done/S03/sprint.md) — where I left off (003, 004, 013),
  `done` ([review](sprints/done/S03/review.md) · [testplan](sprints/done/S03/testplan.md))

Gaps/notes:

- **A `.gitignore` bug excluded `src/core/vault/` from git entirely, since S01.** The rule
  `vault/` (meant to keep the user's real vault data out of the repo) was unanchored and
  matched any directory named `vault` anywhere in the tree, including the core vault module.
  Fixed in a standalone commit on the S03 branch (`af519ef`): anchored to `/vault/`, module
  added. Confirmed missing from both `main` and `dev` before the fix — needs the S03 branch
  merged to actually land the core module in history.
- **Filing still hardcodes the German `Notizen` heading** (`src/core/capture/filing.ts`);
  only the new note-composer write path from story 003 is heading-alias aware. A project using
  `## Notes` can end up with a second, German-headed section if a dump is filed onto it. Same
  family as the S01/S02 gap about `capture-proposal.ts` hardcoding the German section name —
  worth one story once English-language vaults are common.
- **The "last worked on" marker (013) is computed over the filtered list**, not globally — under
  a narrowed scope filter it marks the most recent project within that scope. Intentional and
  tested, not a defect.
- **List-level star writes (013) have no error surface**, unlike the detail star. Matches an
  existing pattern on the same screen for other list-level patches; not a regression.

### M3 — The journal becomes one thing — built, acceptance pending

Stories 011 (one entry instead of day and conversation), 012 (the interview, for when the field
is empty), 009 (filter for days that are not finished), 010 (a calendar on top of the days). No
concept behind them.

Independent of everything else — [systems/navigation.md](systems/navigation.md) explicitly
leaves the journal untouched at the rail level; 011 supersedes only the line about the journal's
*inner* structure staying untouched.

The `## Day`/`## Conversation` split is gone for new writing: one field, a stance next to it
(listen/tips/analyse, chosen per write and not persisted), the app's answers interleaved inline
as blockquote turns. An interview overlay covers a fixed five-topic backbone for the days the
field stays empty. The day list gets a "not finished" filter (`closed` is now a real vault
frontmatter field) with a rail badge, and a collapsible month calendar sits above the list
showing entry/mood/unfinished markers. All four stories done; end-to-end acceptance through the
real UI is the user's next step,
[sprints/S04/testplan.md](sprints/S04/testplan.md).

Sprints:

- [sprints/S04/sprint.md](sprints/S04/sprint.md) — the journal becomes one thing (011, 012,
  009, 010), `done`
  ([review](sprints/S04/review.md) · [testplan](sprints/S04/testplan.md))

Gaps/notes:

- **Legacy `## Day`/`## Conversation` days are not migrated automatically.** They keep rendering
  and stay editable; folding one into the new interleaved stream is one explicit, hash-guarded,
  per-day action (011). The vault can carry both formats indefinitely.
- **Stance is not persisted anywhere** — chosen per write/ask, by the user's own decision; a
  day's file carries no record of which stance produced which answer.
- **012's interview overlay does not show the day's existing text as context**, though the
  story's own decisions named it — it fell outside the deliverable that shipped it and was
  accepted as a gap rather than fixed in-sprint.
- **010 leaves two pre-existing inline locale ternaries unmigrated** to the `locale()` helper it
  introduced (`DayList.tsx`, `DayEntry.tsx`) — out of that story's scope, worth folding in
  whenever those files are next touched.
- **`tests/core/wiki/module.test.ts` is still red**, confirmed pre-existing and unrelated on
  every story's build in this sprint (see the M1 gap above — still needs an owner).

### M4 — A finding can be acted on — planned

Stories 014 (the run reports findings, not results), 017 (a finding says how it ends), 016
(orphan page — I pick the target), 015 (resolve a near-duplicate). Cut straight from the
stories, by decision on 2026-08-14 — no concept.

Note: 015, 016 and 017 add new **write** paths into the vault (merging pages, inserting links,
recording a verdict). The AI-proposes/human-confirms guardrail and the hash-guarded write are
the load-bearing part of this milestone, not the screens.

M3 was chosen next at the 2026-08-19 `/ai-scrum:roadmap plan`, now that M2 is accepted. M4
follows after M3.

---

## Open / unprioritised

| Topic                                                         | State                                                                                                                                                                                                                                              | Next step                                                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Condensed layer (module / project / area)                     | Concept written 2026-08-18: [concepts/condensed-layer.md](concepts/condensed-layer.md). Supersedes the earlier "project knowledge from agent sessions" entry — that is now one of four project inputs. 40 requirements, 11 open points, no stories | `/ai-scrum:roadmap plan` — prioritise against M2/M3/M4; depends on story 005 and the Project knowledge tab from 008 |
| MCP interface for projects, knowledge and the condensed layer | Named as an outlook in [concepts/condensed-layer.md](concepts/condensed-layer.md) §14, deliberately without requirements                                                                                                                           | Own `/ai-scrum:concept` once the condensed artifacts exist                                                          |
| German docs migrated to English                               | Decided in `.claude/ai-scrum.md`; `docs/*.md` are still German                                                                                                                                                                                     | Own story once it stops being cosmetic                                                                              |
| Phase 2                                                       | Not defined                                                                                                                                                                                                                                        | Cut after phase 1 has been used                                                                                     |
