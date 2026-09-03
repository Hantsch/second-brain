---
id: 049
title: One button closes the day
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. The user's feedback names the redundancy directly: "als abgeschlossen markieren" and
"Tag abschließen" both end the day, and it is not clear which one does what. Decided with the user
at the M15 cut (2026-09-03): one action. Touches the head actions in
[DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx),
[CloseProposal.tsx](../../src/renderer/screens/journal/CloseProposal.tsx) and the
`journal:setClosed` / `journal:close` / `journal:applyClose` channels in
[src/shared/ipc.ts](../../src/shared/ipc.ts). Follow-ups in M15's second part:
re-indexing a day that changed afterwards, and correcting the close summary.

## Requirement

There should be exactly one way to end a day, and it should be obvious what it does.

Today there are two: a manual switch in the header that only writes the `closed` field, and the
close-out below the text that runs the analysis, proposes facts, todos and frontmatter, and sets
the same field on accept. Two buttons for one intent, and the header one silently skips
everything the other does.

From now on: "Tag abschließen" is the one action. It runs the close-out, shows what it found, and
accepting it marks the day closed. Without a model configured the day can still be closed — it
just says honestly that nothing was extracted. Reopening a day stays possible; it is a correction,
not a main path.

## Acceptance Criteria

- [ ] The day header no longer offers a second "mark as finished" button as a primary action.
- [ ] "Tag abschließen" runs the close-out; accepting the proposal marks the day closed in the
      same write, and the day's badge shows it afterwards without a reload.
- [ ] Nothing is written before the user accepts (guardrail 2): running the close-out alone does
      not set `closed`, and discarding the proposal leaves the day exactly as it was — including
      still open.
- [ ] With no model configured, closing the day still works from the UI, states plainly that no
      facts or todos could be extracted, and sets `closed` once the user confirms — no dead end,
      no silent failure.
- [ ] A closed day can be reopened through the UI, and the story records where that action lives
      and why it is not a primary button.
- [ ] A day that is already closed does not offer a plain second close; the header states it is
      closed and on what date.
- [ ] The `journal:setClosed` channel keeps working (it is what reopen uses) and stays covered by
      a test; if the manual set-true path becomes unreachable from the UI, that is stated.
- [ ] `npm run seed && npm run shot` shows the single close action, a proposal, and a closed day's
      header.

## Open Questions

- Q1: Where does "reopen" live? Proposal: a ghost action next to the closed badge in the header —
  visible only on a closed day, so the header carries exactly one action either way.
- Q2: With no model configured, does the confirmation still go through the proposal panel (an
  empty proposal with an honest statement), or through a plain confirm dialog? Proposal: the
  panel — one path, one place where the day gets marked.
- Q3: Should closing also be reachable from the day list or the dashboard, or stays it inside the
  day? Proposal: inside the day only; anything else re-creates the redundancy this story
  removes.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
