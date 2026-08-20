---
id: 018
title: Day close — a proposal I can check, not a dialog that hides the day
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-20
---

## Requirement

Closing a day opens `CloseDialog`, which covers the day text with the proposal (todos,
tags, mood, projects it found). While it's open I can't see what I actually wrote, so I
have nothing to check the proposal against — I can't tell whether "2 projects, mood"
actually matches my day.

If I cancel the dialog to go re-read the day first, the whole close run — including the
model extraction — has to start over. Verifying costs a full re-run.

I want the day-close run to leave its result as a **proposal on the day itself**, next to
the text it was computed from, not as a dialog blocking it. From there I decide: apply it,
run it again, or discard it — with the day always visible while I decide.

## Acceptance Criteria

- [ ] Running day-close does not cover the day's text. The proposal and the day are
      visible at the same time, so I can check a finding against the text it came from
      without closing anything first.
- [ ] The proposal states what it found (todos, waiting-on, people, projects,
      mood/tags) and whether it used a model or the heuristic fallback — same content
      as today's dialog, just not modal.
- [ ] The proposal stays in place if I look at something else first (scroll the day,
      switch tabs within the day) and come back — I don't lose it just by looking away
      to verify it.
- [ ] From the proposal I can apply it (writes exactly as today's "apply" does),
      discard it (nothing is written, the proposal is gone), or run it again
      (a fresh close that replaces the current proposal, not a merge of two).
- [ ] Works without a model exactly as before — this changes where the result is shown
      and how long it survives, not how it's produced.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
