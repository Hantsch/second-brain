---
sprint: S13
status: in-progress # planned | in-progress | done
branch: sprint/S13
milestone: M15 — The day is one text field
---

# Sprint S13 — The day is one text field

## Goal

The journal's day view reads top to bottom in the order the day is actually written, the field to
write into is visibly the place to write and only files what the user clicks to file, and the day
ends through exactly one action. At the end, a day can be written and closed without anyone having
to work out which of two buttons ends it or which keypress just sent something.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 047 — The day view reads in the order I write in
- [ ] 048 — The field I write in is visible, and sends when I say so
- [ ] 049 — One button closes the day

## Notes

First part of M15, cut from the user's feedback after really using the journal
(2026-09-03). Three of the ten feedback points are deliberately not in this sprint and go into
M15's second part: re-indexing a day that was added to after closing, correcting the close
summary instead of only deselecting items, and the date picker's year/month drill-down.

Two feedback points were taken off the plan entirely at the cut: the medication tracker (the user
postponed it until the idea is riper) and the data-import merge rule (the import it refers to does
not exist yet — the source has to be named before it can be cut).

Order matters: 047 moves the sections and decides where the close action sits, so 049 changes a
button whose place is already settled. 048 sits in the middle because it touches the two fields
047 has just moved, but nothing 049 needs.

All three stories touch `src/renderer/screens/journal/` and the shared `ChatComposer`. They must
be built in order, not in parallel — S08's lesson about unscoped `git restore`/`git clean` in
build agents applies here more than usual, since three stories in a row edit the same files.
