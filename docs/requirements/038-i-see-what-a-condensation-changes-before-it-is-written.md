---
id: 038
title: I see what a condensation changes before it is written
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The confirmation path — the load-bearing half of
guardrail 2 for a write path that may _delete_. Depends on
[[037-an-area-can-be-condensed-into-one-file]]. Concept: [[../concepts/condensed-layer]]
(CND-18, 19, 20, 21, 22, 23, 37, 39, 40).

## Requirement

A condensation run may shorten and delete. That makes it the write path in this app I trust the
least on sight, so I want to see it before it happens — in the area itself, not in a maintenance
list, because confirming prose about an area without the area in front of me is exactly the
situation where I click through.

From inside an area in Notes I should be able to trigger the condensation, then read the old
against the new, with what was removed as visible as what was added. If I accept, it is written
— and if I edited the file in the meantime, the app tells me that instead of overwriting my edit,
and there is an undo copy so an accepted run is never final.

If I reject, I say why in a sentence. That sentence is not thrown away: it is appended to a
directives section inside the artifact that every later run reads as an instruction and never
rewrites. That is how the thing learns what I do not want in there — and it is the only history
kept, because a log nobody reads is ballast.

## Acceptance Criteria

- [ ] Inside an area on the Notes screen I can trigger a condensation and see that one is running.
- [ ] The proposal is shown as a diff, old against new, before anything is written; removals are
      as visible as additions, and the per-section source lines are part of the diff.
- [ ] Accepting writes hash-guarded against the hash the proposal was built from; a stale hash
      discards the proposal as a conflict with a clear message, and never merges.
- [ ] Every accepted write leaves an undo copy in `.secondbrain/trash/`.
- [ ] Rejecting requires a reason — a bare dismiss is not offered — and writes nothing to the
      artifact body.
- [ ] The reason is appended to the artifact's directives section, and a later run reads it as an
      instruction and never writes into that section.
- [ ] With no model configured for `condense-area`, the area states this, names the task kind and
      links to the setting, instead of offering a dead trigger.
- [ ] An existing artifact is readable in the area without a model.
- [ ] Every path — trigger, diff, accept, reject-with-reason, conflict, no-model — is drivable
      through the real UI and covered by the manual test plan.
- [ ] All UI strings exist in `de` and `en`; German quotes use `„…“`. Gaston atoms and tokens
      only, no ad-hoc markup, no raw Tailwind palette.

## Open Questions

- Q1 — What granularity does the diff have: whole artifact, or per section with a per-section
  accept? The concept's reversal trigger for the size cap turns on exactly this ("a diff that
  touches every section at once stops being reviewable").
- Q2 — Where does the trigger live inside the area — a tab next to notes and todos, an inline
  panel, or an overlay? The concept fixes only "inside the area".
- Q3 — Can the artifact be deleted from the UI, given the concept says it is regenerable without
  loss except for the directives?
- Q4 — May a condensed artifact be cited as evidence when answering a question, or must the
  answer always go down to the primary source? Concept open point O9 — touches guardrail 3.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
