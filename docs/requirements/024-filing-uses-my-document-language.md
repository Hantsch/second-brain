---
id: 024
title: Filing writes headings in my document language
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

I can set the language of my documents separately from the language of the interface
(`languages.documents`). The filing path ignores it. When a dump is filed onto a project or an
area, the section it appends to is called **`Notizen`** — hardcoded
([filing.ts:24](../../src/core/capture/filing.ts#L24),
[actions.ts:26](../../src/core/capture/actions.ts#L26)) — no matter what my vault is written in.

For an English vault that means my project file ends up with two notes sections: the `## Notes`
I wrote and the `## Notizen` the app added. Two sections for one thing, in two languages, in a
file I own. Every later note lands in whichever one the app finds, and I have to clean it up by
hand.

The machinery for this already exists and works: `src/core/vault/sections.ts` and
`src/core/areas/sections.ts` match headings folded, so "Notizen" and "Notes" already count as
the same section on the paths that use them — the note composer from story 003 and the areas
write path from story 005 both do. The general filing path was deliberately left out of both
stories (recorded as a gap under M1 and M2 in the roadmap). This story closes it.

It must not break the vault I already have. A file that carries `## Notizen` today keeps it —
the app appends to the section that is there and does not rename or migrate anything.

## Acceptance Criteria

- [ ] With `languages.documents: en`, filing a dump onto a project or an area that has no notes
      section yet creates `## Notes`, not `## Notizen`.
- [ ] With `languages.documents: de` it creates `## Notizen`, as today.
- [ ] Filing onto a file that already has a notes section appends to **that** section, whichever
      language it is written in, and never creates a second one.
- [ ] My existing files are not rewritten, renamed or migrated by this change — the only writes
      are the appends I trigger.
- [ ] The filing preview shows the heading it is going to write, so I see it before I confirm.
- [ ] Works without a model configured — filing is a heuristic path and stays one.

## Open Questions

1. **Which write paths are in scope?** `filing.ts` and `capture-proposal.ts` are named in the
   roadmap gaps. Are there others that hardcode a section name (todos, sources, journal)?
   Scope should be "every filing write path", but the list needs to be established first.
2. **What happens when the setting changes after files exist?** A vault filed in German whose
   `languages.documents` flips to `en` will have German sections and new English ones. Do we
   accept that (folded matching finds the old one anyway), or does the setting change need to
   offer something?
3. **Is `Notes`/`Notizen` the only pair**, or do other section names (`Quellen`/`Sources`,
   `Offene Punkte`/`Open points`) need the same treatment in the same story?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
