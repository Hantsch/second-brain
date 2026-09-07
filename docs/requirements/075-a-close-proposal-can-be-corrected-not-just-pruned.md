---
id: 075
title: A close proposal can be corrected, not just pruned
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The user's second report (2026-09-07): "when I close a day and I don't agree with it, I can't
really correct it — I can only discard it, which is daft." This is also M15's own named
second-part item, deferred at the 2026-09-03 cut.

Today's close card (`src/renderer/screens/journal/CloseProposal.tsx`) can only prune: a
proposed todo is kept or dropped and its due date changed; people, projects and tags are
kept or dropped as a whole field; mood and energy can only be kept or thrown away, never set
to the right value; the todo's text, its target project, its scope and a waiting-on's person
cannot be touched at all. Areas are the one field that already works properly (chips plus a
picker, story 036) — that is the pattern to follow.

So a wrong proposal costs either a wrong entry or the whole close. The card has to become
editable: correcting one line must be cheaper than discarding everything and writing the day
by hand.

## Acceptance Criteria

- [ ] **AC1** — A proposed todo's text can be edited before accept, and the edited text is
      what gets written.
- [ ] **AC2** — A proposed todo's target can be changed before accept — from the day to a
      project or between projects — and it is written into the file the card names.
- [ ] **AC3** — A proposed todo's scope (work/private) can be changed before accept.
- [ ] **AC4** — A waiting-on entry's person and subject can both be corrected before accept.
- [ ] **AC5** — A todo the model missed can be added by hand, with text, due date, target and
      scope, and is written exactly like a proposed one.
- [ ] **AC6** — People, projects and tags are kept or dropped item by item, not all-or-nothing
      per field.
- [ ] **AC7** — Mood and energy can be set to a different value before accept, not only kept
      or dropped.
- [ ] **AC8** — Corrections survive leaving the journal and coming back before accept.
- [ ] **AC9** — Accept writes exactly what the card shows, still hash-guarded: a stale hash
      yields a conflict instead of overwriting an external edit.
- [ ] **AC10** — Discarding still leaves the day untouched, and a day with an empty proposal
      still closes (story 049's behaviour is not regressed).

## Open Questions

- Does an added or edited todo run through the same server-side validation as a proposed one
  (story 057's re-validation theme), and what happens to a text that is empty after trimming?
- Is the mood/energy correction the existing `MoodPicker` inline in the card, or a jump to the
  day's own fields, which already carry those values?
- Is editing inline per row, or does a row open a small editor? The card sits next to the day
  text on purpose (story 018) and must not grow into a dialog again.

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
