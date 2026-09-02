---
id: 045
title: I see what a project's condensation changes before it's written
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). Depends on
[[044-a-project-can-be-condensed-into-one-file]] for the run and the write helper. Mirrors
[[038-i-see-what-a-condensation-changes-before-it-is-written]] for the project level. Concept:
[[../concepts/condensed-layer]] (CND-18 through CND-23, CND-37 through CND-40).

## Requirement

The **Project knowledge** tab — already reserved in [[../systems/navigation]] — is where a
project's condensation is triggered and read. Nothing writes itself: I start the run from inside
the project, I see the diff between what is there now and what the run proposes before anything
changes, and I decide.

Accepting writes the new artifact, hash-guarded against the version the diff was built from, with
an undo copy kept. Rejecting requires a reason — not a bare dismissal — and that reason becomes a
directive the next run reads and never overwrites. Without a model configured for this task, the
tab says so plainly and writes nothing.

## Acceptance Criteria

- [ ] The Project knowledge tab shows a diff (old vs. proposed new) before any write, with
      removals as visible as additions and each section's source lines included.
- [ ] Accepting writes hash-guarded against the hash the proposal was built from; a stale hash
      reports a conflict instead of merging, and an accepted write leaves an undo copy in
      `.secondbrain/trash/`.
- [ ] Rejecting requires a reason; the artifact is left untouched and the reason is appended to
      the artifact's directives section, read by the next run and never rewritten by it.
- [ ] Triggering the run, reading the diff, accepting, rejecting-with-reason and the no-model
      state are all drivable through the real UI.
- [ ] Without a model configured for `condense-project`, the tab states this plainly, names the
      task kind, and links to the setting; nothing is written.
- [ ] All new UI strings exist in German and English.

## Open Questions

- Q1 — Does the project level also get a delete affordance for its condensed artifact, mirroring
  story 043's `condense:delete` for areas — or is delete deferred until a third level exists and
  the pattern can be shared?
- Q2 — Own IPC channel group (e.g. `condense:project:*`) mirroring the area's, or should 043's
  channel shape be generalised across levels now that a second level exists? Ties into the
  concept's §7 reversal trigger: is per-level machinery still justified once a second
  implementation exists, or does it turn out to be three copies of one thing?

## Plan

<Leave empty. Filled by `/refine 045`.>

## Deliverables

<Leave empty. Filled by `/refine 045`.>

## Model Hints

<Leave empty. Filled by `/refine 045`.>

## Test Plan (manual acceptance)

<Leave empty. Filled by `/refine 045`.>

## Done

<Leave empty. Filled by `/build 045`.>
