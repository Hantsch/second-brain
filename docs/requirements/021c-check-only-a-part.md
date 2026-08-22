---
id: 021c
title: I can check only a part
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

Part of [[021-maintenance-i-can-see-stop-and-continue]]. Delivers the "check only a part"
cluster. **Depends on [[021a-a-run-i-can-see]]** for the stage model, and shares the
"partial run" labelling with [[021b-stop-and-continue]] — whichever lands first owns it.

## Requirement

`gardener:run` takes nothing but `{ useLlm }` ([ipc.ts:701](../../src/shared/ipc.ts#L701)). It
is all checks over the whole vault, or nothing. When I do not have time for everything, my only
option is to not check at all.

But the findings on the screen are already grouped by kind and by module
([filter.ts](../../src/renderer/screens/garden/filter.ts)) — that is exactly the shape I would
want to check in: "just this module", "just the mechanical checks, no model", "just the
duplicates". The scope vocabulary already exists in the UI; the run just cannot accept it.

A part-run is the honest answer to a long run: less work, not a faster guess. So it must say
what it did not look at, and it must not overwrite what a full run knew.

Resolved in refine of the parent, do not re-litigate: **the health score is not recomputed for a
part-run.** The last complete score stands with its date; the part-run's findings are shown next
to it. A score over one module is not this vault's health.

## Acceptance Criteria

- [ ] I can start a run over a part, from the maintenance screen, with at least one scope
      narrower than "everything" — taken from the vocabulary the screen already uses (kind,
      module, with/without model).
- [ ] The result of a part-run says which scope it covered and, by implication, what it did not
      look at.
- [ ] A part-run does not replace or invalidate findings outside its scope — what a previous
      full run found elsewhere is still there afterwards.
- [ ] The health score after a part-run is the last **complete** one, with its date, not a number
      derived from the part.
- [ ] The dashboard tile does not present a part-run as the vault's current health check.
- [ ] Without a model configured, a part-run works and the display names what a model stage would
      have added instead of pretending to run one.
- [ ] Two runs still cannot overlap — a part-run is a run.
- [ ] No hardcoded string in the renderer; `de-garden.ts` and `en-garden.ts` both carry every new
      key.

## Open Questions

<!-- To be filled by /refine 021c. Likely candidates: which scope dimensions ship first
     (module is a free-form vault slug, kind is a closed enum); how a scoped run merges into
     the single `StoredRun` in .secondbrain/gardener.json without losing out-of-scope
     findings. -->

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
