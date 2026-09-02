---
id: 046
title: Maintenance says a project's condensation is due
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). Depends on
[[044-a-project-can-be-condensed-into-one-file]] for the `condensed` `DocType` and the project
artifact's path. Mirrors [[039-maintenance-says-a-condensation-is-due]] for the project level.
Concept: [[../concepts/condensed-layer]] (CND-7, CND-8, CND-24 through CND-27).

## Requirement

A project's condensation should never surprise me by being silently stale, and it should never
nag either. Maintenance should notice, deterministically and without a model, when a project's
inputs have moved on since its artifact was last written — or when a project has inputs but has
never been condensed at all — and say so as an informational finding, not a warning. Opening the
finding takes me to the project's knowledge tab; nothing is written by the check itself.

## Acceptance Criteria

- [ ] A new deterministic check reports "condensation due" for a project whose newest input is
      newer than its artifact's `condensed_at`, and "condensation missing" for a project that has
      inputs but no artifact at all.
- [ ] The check runs without a model, and its severity is informational — an un-condensed
      project is not reported as an error.
- [ ] Its fix action writes nothing; it opens the project's knowledge tab.
- [ ] The maintenance screen names a due or missing project condensation distinctly from other
      finding kinds.
- [ ] The project's condensed artifact is exempt from the orphan and near-duplicate checks.
- [ ] The artifact is a normal indexed document: searchable and type-filterable.

## Open Questions

- Q1 — Where does the due-ness finding surface beyond Maintenance — only there, or also as a
  badge on the project overview (mirroring story 004's "possibly outdated" badge on project
  status)?

## Plan

<Leave empty. Filled by `/refine 046`.>

## Deliverables

<Leave empty. Filled by `/refine 046`.>

## Model Hints

<Leave empty. Filled by `/refine 046`.>

## Test Plan (manual acceptance)

<Leave empty. Filled by `/refine 046`.>

## Done

<Leave empty. Filled by `/build 046`.>
