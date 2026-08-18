# Roadmap

**The** one source of status and planning: where we stand, what comes next, what is not planned
at all yet. As of: 2026-08-18.

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

| Phase                                | Goal                                                                                                                                               | Status            |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 1 — The screens do what they promise | Every screen the app shows can actually be used: no write path without a read path, no finding without an exit, no place that is really an action. | ▶ **in progress** |
| 2 — Knowledge that condenses itself  | Project knowledge distilled from agent sessions and sources, confirmed by the human.                                                               | planned           |

---

## Current phase: 1 — The screens do what they promise

The app is broad already — eleven screens, the vault format, ingest, gardener, the LLM gateway
all exist. What it is not yet is _honest_: `areas/` is written to but never read, the gardener
names findings it offers no way out of, capture owns a place although it is an action, and the
project screen looks finished while "add a note" is missing. This phase closes those gaps rather
than adding surface.

Way of working: every milestone ends in an increment that can be driven through the running app.
Stories are cut only once the previous milestone is accepted, so scope does not balloon up front.
Story 001 (agent session browser) landed before this roadmap existed and is the baseline.

### M1 — Navigation: places, actions, system — ▶ in progress

The rail goes from eleven flat entries to five places plus a system foot. "Sources feeds
Knowledge" and "agent work belongs to a project" become structurally visible; `areas/` gets a
read path at last; capture and ask become actions in the shell instead of destinations.
Concept: [concepts/navigation.md](concepts/navigation.md).
Scope: stories 002, 005, 006, 007, 008.
Sprints:

- [S01 — Knowledge, Notes, and the end of the inbox](sprints/S01/sprint.md) — planned (002, 005, 006)
- S02 — capture and ask become actions, agent sessions move into projects (007, 008) — not cut yet

Gaps/notes:

- Renaming stops at the UI — the vault format, frontmatter keys, IPC channels and code
  identifiers keep their names. Only labels and routes change.
- Every route that leaves the rail needs a redirect that preserves its query string, or deep
  links from citations, gardener findings and the palette break.

### M2 — Projects answer "where did I leave off" — open

The project screen carries the app's first promise. Today it cannot take a note, cannot record
who I am waiting on, and cannot say where its status came from — so the one line meant to carry
my re-entry after a break is a line I do not trust. Plus: the handful of projects I actually
work on should not sit somewhere in a list of fifteen.
Scope: stories 003, 004, 013.
Depends on M1 — story 008 adds a sessions tab to the same screen; settle the structure first.

### M3 — The journal is one field — open

Writing a day should not start with deciding _where_ to write. One field, a stance that decides
what happens with it, an interview for the empty-page days, a calendar over the months, and a
filter for the days I started and never finished.
Scope: stories 009, 010, 011, 012.
Independent of M1 — the navigation concept leaves the journal untouched.

### M4 — A finding says how it ends — open

The maintenance run is precise and then stops: half the findings come without a fix, and the
only other way out is "looks fine", which is permanent. A near-duplicate can be compared but not
resolved; an orphan can be reported but only linked when the app is already sure. Every finding
needs an exit the human chooses.
Scope: stories 014, 015, 016, 017.

---

## Open / unprioritised

| Topic                                           | State                                                                                                        | Next step                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Project knowledge condensed from agent sessions | Named and deliberately deferred in [concepts/navigation.md](concepts/navigation.md) ("Not part of this")     | Own concept via `/ai-scrum:concept` — what gets condensed, when, from what, how the human confirms it |
| German docs under `docs/`                       | CONCEPT.md, ARCHITECTURE.md, VAULT-FORMAT.md, MODULE-SCHEMA.md still German; generated artifacts are English | Migration to English planned as separate work, not blocking any milestone                             |
| Dashboard tile system                           | Stays as it is; only the "unfiled" strip is added by story 006                                               | Revisit after M2, once projects carry real state                                                      |
