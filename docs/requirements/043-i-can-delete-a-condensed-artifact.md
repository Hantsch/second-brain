---
id: 043
title: I can delete a condensed artifact
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. Deliberately out of scope for M12 by user decision (038-Q3, 2026-09-01) and carried
in the roadmap since. Depends on [[037-an-area-can-be-condensed-into-one-file]] and
[[038-i-see-what-a-condensation-changes-before-it-is-written]]. Concept:
[[../concepts/condensed-layer]].

## Requirement

A condensation is regenerable from its sources — except for the directives section, which records
why I rejected earlier runs. That is why deleting one was called a convenience and left out of
M12. But it is now the one thing about an artifact I cannot do from inside the app: my exits are
to reject a proposal, which writes another directive, or to delete `areas/<slug>.condensed.md` in
Explorer behind the app's back and let the watcher find out afterwards.

I want the artifact gone when a condensation went somewhere I do not want it — the whole file, not
a correction on top of it. And I want it to behave like every other write in this app: it tells me
what disappears before it disappears, it has a way back, and it does not quietly take the one part
of the file that cannot be recomputed.

## Acceptance Criteria

- [ ] The area's condensed tab can delete an existing artifact. With no artifact there is no dead
      control.
- [ ] Before deleting, it says what goes — naming explicitly that the directives section is the
      part no later run can reproduce.
- [ ] The delete is undoable through the existing trash path (`.secondbrain/trash/`,
      `VaultStore.snapshot`), like 038's accept.
- [ ] It is hash-guarded: a stale hash reports a conflict instead of removing a file that changed
      since it was read.
- [ ] Afterwards the tab is honestly back in its "never condensed" state, and 039's
      `condensation-due` check reports the area as having material and no artifact.
- [ ] The index drops the document: it stops appearing in search and in the maintenance counts.
- [ ] A condensation run started after a delete does not silently resurrect the deleted
      directives.
- [ ] Deleting never touches the LLM gateway and works with no model configured.
- [ ] All new strings exist in `de` and `en`.

## Open Questions

- ~~Q1 — Do the directives survive the delete, or die with it?~~ answered → Decisions (Sprint)
- Q2 — Own channel (`condense:delete`, next to read/run/accept/reject) or a generic vault delete?
  The condense channels are their own group today, and 039 already showed the cost of one story
  reaching into another's contract. A detail for refine: the leaning is an own channel, because a
  generic delete would still need the hash guard and trash semantics wired per caller, and the
  artifact-specific consequences (directives, `condensation-due`) do not belong behind a generic
  door.
- ~~Q3 — Build it area-only, or generically for the levels not yet cut?~~
  answered → Decisions (Sprint)
- ~~Q4 — Plain confirm, or a Dialog with a typed reason like 038's reject?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding.

- **(User)** Q1 — **the delete takes everything, directives included.** Delete means start this
  area over; that is the honest reading of "the whole file, not a correction on top of it", and
  the undo copy in `.secondbrain/trash/` is the way back. Keeping directives was rejected because
  it would leave the app holding invisible state about an area the user believes they cleared —
  the kind of second truth this project keeps removing. The confirmation therefore has to name the
  directives as the part no later run can reproduce.
- **(User)** Q3 — **area-only.** The module and project levels are not cut, and the concept's §7
  reversal trigger is only evaluated when the second level lands, so their shape is genuinely
  unsettled. Generalise when there is a second real case, not against a guess.
- **(User)** Q4 — **a plain confirm that names what goes**, not a typed reason. The user has
  already decided against the artifact, so a reason is friction on the way out; and unlike 038's
  reject there is no later run to inform and — given Q1 — no directives section left for a reason
  to live in.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
