---
id: 047
title: The day view reads in the order I write in
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. Comes straight from the user's feedback on the journal after using it: the day view
has all the right parts but not in the order the day is actually lived, and the field that should
carry the writing is not the field the eye lands on. Touches
[src/renderer/screens/journal/DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx) and
the slots [JournalScreen.tsx](../../src/renderer/screens/journal/JournalScreen.tsx) passes into
it. Sibling stories: [[048-the-field-i-write-in-is-visible-and-sends-when-i-say-so]] (the field's
look and its keys), [[049-one-button-closes-the-day]] (the close action this order places).

## Requirement

Opening a day should read top to bottom the way the day is written: what day it is, how I felt,
how much energy I had, an offer to be interviewed if I do not know where to start, then the one
big field I write into, then closing the day, then the facts that came out of it, and last the
conversation history.

Today the order is different (facts before the close, the close below the facts, the coach field
last but carrying a duplicate close button in the wide layout), and the day's own text field is
one section among several rather than the obvious place to write. The coaching conversation is
not being taken away — it moves to where it belongs: under the history it produces.

Concretely the order the user named:

1. Today (the day's header)
2. Mood
3. Energy
4. Interview
5. The free-text field to write into
6. Close the day
7. Facts
8. History

## Acceptance Criteria

- [ ] Opening any day in the app shows those eight parts in exactly that order, top to bottom.
- [ ] The day's own text field is visibly the primary place to write: it is the largest element
      on the screen, always editable, and needs no click into an edit mode first.
- [ ] The close action sits directly below the text field and above the facts — in both the wide
      and the narrow layout, and exactly once on the screen (no second copy in the coach field's
      footer).
- [ ] The coach field sits at the bottom, below the history, and its label says plainly that
      writing there talks to the coach rather than being the day's own entry.
- [ ] Nothing that exists today is lost: people/project chips, the loose-end rows, the legacy
      conversation fold, the file-open action and the stance switch are all still reachable.
- [ ] A close proposal, when one exists, still appears where the close action is — never below
      the facts it is about to write.
- [ ] `npm run seed && npm run shot` produces a screenshot of a seeded day showing the new order,
      and one of the narrow layout.

## Open Questions

- Q1: The people/project chips are not in the user's list. Proposal: keep them directly under the
  header (position 1b), since they describe the day rather than being written into it.
- Q2: The loose-end rows currently sit above the stream, inside the dialogue slot. Proposal: they
  travel with the history (position 8) — the day they were announced on is what the row
  already states.
- Q3: The legacy conversation fold (story 011's migration) has no place in the user's list.
  Proposal: it stays directly above the history, since that is what folding it produces.
- Q4: Does the interview offer stay a full-width action row, or does it become a smaller
  secondary action now that it sits between the energy row and the writing field?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
