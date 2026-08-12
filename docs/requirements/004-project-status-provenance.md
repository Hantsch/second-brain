---
id: 004
title: Where the project status and next step come from
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I look at a project and I cannot tell where its status came from. Did I set it? Did
the app derive it from agent sessions? Is it just the default from the day the
project was created, three weeks stale?

The same for `next_step` — the one line that is supposed to carry my re-entry after a
break. If I do not know whether it is mine, suggested, or leftover, I cannot trust
it. And a next step I do not trust is worse than an empty one, because it stops me
from writing a real one.

The app already knows enough to answer this: the status dropdown writes it, the
`project-status` task suggests it, filing a dump can change it, and the file records
when it last changed. That knowledge just is not shown.

## Acceptance Criteria

- [ ] The project detail view states, for the status, where it comes from and how
      old it is — set by me, accepted from a suggestion, or written by filing —
      with the date.
- [ ] The same for `next_step`.
- [ ] Nothing is invented. If the file does not record where a value came from, the
      screen says only what it actually knows (e.g. "last changed on …") and does
      not guess an author.
- [ ] A stale next step is visible as stale: if the project has been worked on since
      the next step was written (file changes or agent sessions), the screen says so.
      This is the maintenance finding "project without a next step", made visible at
      the place where I can fix it.
- [ ] Accepting a suggestion records that it was a suggestion, so the provenance is
      still right the next time I look.
- [ ] Whatever gets recorded is recorded in the file, not in the index — the index
      stays derivable and deletable.
- [ ] The frontmatter addition is documented in
      [VAULT-FORMAT.md](../VAULT-FORMAT.md), is optional, and a project file without
      it stays valid.
- [ ] Works without a configured model.

## Open Questions

- Where does provenance live? New optional frontmatter keys (e.g.
  `next_step_set: {at, by}`), or derived from `log.md` / the file's history? The
  first is explicit but adds keys; the second invents nothing but can only answer
  "when", not "by whom".
- "Worked on since" — is that file mtime, indexed changes, agent sessions, or all
  three? Sessions only exist for linked projects.

## Plan

<Filled by `/ai-scrum:refine 004`.>

## Deliverables

<Filled by `/ai-scrum:refine 004`.>

## Model Hints

<Filled by `/ai-scrum:refine 004`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 004`.>

## Done

<Filled by `/ai-scrum:build 004`.>
