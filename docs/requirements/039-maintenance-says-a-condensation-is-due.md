---
id: 039
title: Maintenance says a condensation is due
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The pull side: nothing condenses on its own, so
something has to tell me it is worth doing. Depends on
[[037-an-area-can-be-condensed-into-one-file]] and
[[038-i-see-what-a-condensation-changes-before-it-is-written]]. Concept:
[[../concepts/condensed-layer]] (CND-7, 8, 12, 24, 25, 26, 27, 38).

## Requirement

The condensation is pulled, never pushed — I trigger it when I am in the area anyway. That only
works if something reminds me. The maintenance run should report, deterministically and without a
model, that an area's condensed file is older than the material it was written from, or that an
area has material and no condensed file at all.

It is not an error. Nothing in my vault is broken because I have not gathered an area yet, so it
is informational, not a warning, and the finding's way out is to open the area — it writes
nothing itself. Same shape as the existing "unprocessed source" finding, for the same reason:
condensing needs a model and a target, and that is not the maintenance run's job.

And the artifact has to stop tripping the checks that punish restatement: a synthesis restates its
own sources by design, so it must not be reported as a near-duplicate or as an orphan, exactly as
the module overview already is not.

## Acceptance Criteria

- [ ] A deterministic check reports a condensation as due when an input is newer than
      `condensed_at`, or when an area has inputs and no artifact.
- [ ] The check runs with no model configured and produces the same result.
- [ ] Its severity is informational, not a warning, and the health score treats it accordingly.
- [ ] The finding's exit opens the area; it writes nothing to the vault.
- [ ] The finding is reported in the maintenance surface and links to the area; the diff is never
      confirmed there.
- [ ] The check participates correctly in a scoped run (021c) and in stop/continue (021b).
- [ ] Artifacts are exempt from the orphan and near-duplicate checks.
- [ ] An artifact is a normal indexed document: findable in search, filterable by type, and not
      counted as a module page.
- [ ] No condensation starts without an explicit human action — no schedule, no threshold-triggered
      write, no background run.
- [ ] All new UI strings exist in `de` and `en`.

## Open Questions

- Q1 — Is "newer" file mtime, the indexed `updated` frontmatter, or the content hash? The vault's
  own rule is that files are the truth and external edits are detected by hash — mtime and
  frontmatter can disagree with it.
- Q2 — Should the check debounce, so that one typed word in a day entry does not immediately mark
  the area due again after a fresh condensation?
- Q3 — Does this milestone already add the module and project variants of the check, or is the
  check area-only until those levels exist?

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
