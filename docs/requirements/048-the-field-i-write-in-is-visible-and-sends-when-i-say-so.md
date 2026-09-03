---
id: 048
title: The field I write in is visible, and sends when I say so
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. Two of the user's feedback points about the same thing — the text fields in the
journal: they do not stand out from the page, and a keypress can file an entry the user was still
writing. Touches [DayText.tsx](../../src/renderer/screens/journal/DayText.tsx),
[CoachComposer.tsx](../../src/renderer/screens/journal/CoachComposer.tsx) and the shared
[ChatComposer.tsx](../../src/renderer/components/ChatComposer.tsx). Read
`src/renderer/styles/gaston/README.md` first — the contrast comes from tokens, not from a
hand-picked colour. Sibling: [[047-the-day-view-reads-in-the-order-i-write-in]].

## Requirement

I have to be able to see where I am supposed to write, and I decide when something is filed.

Today both journal fields sit on the page with almost no surface of their own, so the writing
area is not visibly a writing area. And in the coach field, `Shift+Enter` (and `Ctrl+Enter`)
files the entry — which means a stray keypress in the middle of a thought sends it. Enter should
do what it does in every editor: break the line. Filing happens when I click "Sagen".

## Acceptance Criteria

- [ ] The day's text field and the coach field both sit on a surface that is clearly
      distinguishable from the page background, with a visible border and focus state, built only
      from Gaston tokens — no raw Tailwind palette class, no hex value.
- [ ] Contrast and focus visibility hold in the app's real theme and are recorded (the
      `npm run shot` accessibility report shows no new finding on the journal screen).
- [ ] In the coach field, `Enter` inserts a line break. So does `Shift+Enter`. So does
      `Ctrl/Cmd+Enter`. Nothing but the "Sagen" button files the entry.
- [ ] The hint below the coach field states what actually happens now — no line still promising
      a key that submits.
- [ ] The button stays reachable without a mouse: it is in the field's tab order, and the story
      says in one sentence how a keyboard-only user files an entry.
- [ ] The change is confined to the journal: the Ask screen and every other `ChatComposer` user
      keep submitting on `Enter` exactly as before, pinned by a test.
- [ ] A test covers that a keypress in the journal's coach field files nothing.

## Open Questions

- Q1: The day's own text field currently saves on `Ctrl+Enter` (with a visible `Ctrl Enter` hint)
  and is a save, not a send. Does that shortcut stay? Proposal: it stays — it saves the user's
  own text rather than sending anything to a model, and the hint already names it honestly.
- Q2: `ChatComposer` needs a third `submitKey` state ("nothing submits"). Proposal: extend the
  existing union with `'none'` rather than adding a second flag, so one prop keeps deciding
  key behaviour and hint text together.
- Q3: How much surface? Proposal: the existing input/field token surface used elsewhere in the
  app, not a new one — the fields should look like Gaston fields, just actually visible.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
