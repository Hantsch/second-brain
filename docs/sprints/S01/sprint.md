---
sprint: S01
status: planned # planned | in-progress | done
branch: # set by /sprint
milestone: M1 — Navigation: places, actions, system
---

# Sprint S01 — Knowledge, Notes, and the end of the inbox

## Goal

The rail stops lying about what the app is. Sources moves inside Knowledge, so the way knowledge
gets in is visible instead of explained. `areas/` gets its first read path: a Notes screen for
the thoughts that belong neither to a project nor to a day. And the inbox stops being a place
with a duty — it becomes the "unfiled" filter on Notes, which is what makes filing an offer
rather than a chore.

Demonstrable at the end: eleven rail entries are nine, a note written in the app and a note
written by the filing path are the same thing in the file, and every old deep link
(`#/sources`, `#/inbox`, `#/modules?m=…`) still lands correctly.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [ ] 002 — Knowledge absorbs sources
- [ ] 005 — Notes: a home for the areas
- [ ] 006 — Inbox becomes the "unfiled" filter in Notes

## Notes

Order is deliberate: 002 is already refined (`status: ready`, plan and deliverables in the file)
and is the self-contained one — a tab merge, a rename, redirects. 005 is the weight of this
sprint, a new screen plus the core read path for `areas/`. 006 depends on 005 and cannot start
before the Notes screen exists.

Constraints that apply to all three, from [concepts/navigation.md](../../concepts/navigation.md):

- Renaming stops at the UI. No vault path, frontmatter key, type name or IPC channel is renamed.
- No dead links. Routes that leave the rail redirect to their new home, query string preserved.
- Both languages, every label through `t()`, `de` and `en`.
- No new emptiness — a place that can be empty says what belongs in it and how to get it there.

005 and 006 are still `draft`; `/ai-scrum:sprint` resolves their Open Questions in the
clarification round before refining them.
