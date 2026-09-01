---
id: 036
title: A day says which areas it belongs to
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). First of four — the area condensation cannot read
day entries until the link between a day and an area exists. Concept:
[[../concepts/condensed-layer]] (CND-32, CND-33, CND-34).

## Requirement

A day entry today records people, projects, mood, energy and tags — but never says which of my
areas it touched. So the day I spent thinking about "health" or "finances" is invisible from
the area itself: the Notes screen shows me the area's own notes and todos and nothing of what I
actually wrote that week.

When I close a day, the app should propose which areas the entry belongs to, the same way it
already proposes projects and people — as a proposal I confirm, not as something it writes
behind my back. Once confirmed, the area knows its days, and I can see from the area which days
spoke to it.

Search-based matching at read time was rejected in the concept interview: I want an explicit,
confirmed key in the day's frontmatter, not a guess re-made on every read.

## Acceptance Criteria

- [ ] Closing a day proposes `areas` alongside the fields it proposes today, with only areas
      that actually exist in the vault offered — no invented slugs.
- [ ] The proposal is visible in the close dialog and can be changed or emptied before I accept;
      nothing is written until I accept.
- [ ] Accepting writes `areas: [<slug>]` into the day's frontmatter, hash-guarded, without
      touching any other frontmatter key or the body.
- [ ] Rejecting or closing the dialog writes nothing.
- [ ] Without a configured model, the close still works and the areas field is honestly empty
      rather than absent or broken.
- [ ] An area can name its days: given a slug, the app can list the day entries carrying it.
- [ ] Days written before this story (no `areas` key) stay valid and readable.
- [ ] All new UI strings exist in `de` and `en`.

## Open Questions

- Q1 — Should the close dialog also let me pick an area the model did not propose, or is this
  release accept/remove only? (Adding a picker is a different control than the existing chips.)
- Q2 — Where does "the days of this area" become visible in this story — inside the area on the
  Notes screen, or is that deliberately left to story 038's screen work?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
