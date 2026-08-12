---
id: 005
title: Notes — a home for the areas
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I want a place for thoughts that belong neither to a project nor to a day. Random
notes, speak your mind — the stuff that has no home and therefore currently does not
get written down at all.

That place half exists already, and only in one direction: the vault has `areas/`
("ongoing responsibilities without an end"), and "note into an area" is a valid
filing target. But **no screen reads it.** Anything filed into an area is written and
then invisible in the app forever. That is a write path without a read path, and it
means the app can decide to put my thought somewhere I can never look at it.

So: a rail entry **Notes** that shows the areas and their notes, and lets me write
one directly, without picking a folder first.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [ ] A rail entry "Notes" (de: "Notizen") shows the areas from `areas/` with their
      dated note entries, newest first.
- [ ] I can write a note and save it without choosing a target first. Nothing about
      the flow asks me for structure — that is the app's job (principle 1 in
      [CONCEPT.md](../CONCEPT.md)).
- [ ] I can move a note into a specific area afterwards, and I can create an area.
- [ ] Notes written here are indistinguishable in the file from notes the filing path
      writes into an area — same section, same dated format.
- [ ] Todos inside an area (`## Todos`) are visible and behave like project todos:
      check off, edit, and they count towards the todo tiles on Today.
- [ ] External edits are picked up: a note added in Obsidian shows up here.
- [ ] Writes are hash-guarded — a stale hash yields `conflict`, not an overwrite.
- [ ] The empty state says what belongs in here and offers the first step, rather
      than being blank.
- [ ] Everything on this screen works without a configured model.
- [ ] Search finds notes in areas, and a citation can point at one.

## Open Questions

- Where does a note with no chosen target land? A default area (e.g. `areas/notes.md`),
  a new area per note, or the inbox with a proposal like every other dump? A default
  area is the only option that keeps "dumping costs nothing" without also creating an
  inbox item I then have to file.
- Are areas a visible concept on this screen (grouped by area, with area names), or
  is it one flat stream of notes with the area as a quiet label? Flat is simpler to
  use; grouped matches what the vault actually is.
- Does an area need its own detail view (like a project), or is a section on the
  Notes screen enough?
- Overlap with the journal: a thought I have today could go into the day entry
  instead. What is the rule that tells them apart, in one sentence, on screen?

## Plan

<Filled by `/ai-scrum:refine 005`.>

## Deliverables

<Filled by `/ai-scrum:refine 005`.>

## Model Hints

<Filled by `/ai-scrum:refine 005`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 005`.>

## Done

<Filled by `/ai-scrum:build 005`.>
