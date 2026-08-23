---
id: 032
title: A model that fits a weak machine
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019b-model-recommendations]] and [[029-how-much-of-this-machine-a-model-may-use]].
The first story of the local-engine line, and the only one of the three that needs no new runtime:
it changes what the app _suggests_, not how it runs anything.

## Requirement

The bundled catalogue knows two local models, a 7B and an 8B, both around 5 GB on disk. That was
enough while the only machine in play was the author's. The app is about to be handed to a user
whose laptop has no discrete GPU, and on that machine the recommendation has exactly two moves:
suggest something that will crawl, or say nothing local fits.

I want the app to be able to name a local model that actually runs on a weak machine — the 1B to
4B class that exists precisely for this — and I want it to be honest about the consequence:
a small model is fine for titling a dump or pulling todos out of a paragraph, and it is not fine
for writing a wiki page. Where a task is beyond what this machine can carry, the app should say
so and point at the alternative (a cloud model for that one task, or nothing), rather than
routing the task to a model that will produce mush.

The tier heuristic gets in the way of this today: `classifyModelTier` puts everything up to 8B
into `cheap`, so a 1B model and an 8B model are indistinguishable to the recommendation. That is
the distinction this story needs.

## Acceptance Criteria

- [ ] The bundled catalogue carries local entries below 7B, with real `paramsB`,
      `sizeOnDiskGb` and `quantisation` values, sourced the same hand-curated way the existing
      entries are and dated in the same `policyReadAt` fashion.
- [ ] On a fixture machine of the weak class (no VRAM detected, 8 GB RAM, 4 cores), the
      recommendation names at least one local model per non-excluded task instead of falling
      through to "nothing fits".
- [ ] The recommendation distinguishes a very small model from a mid-sized one — a 1B and an 8B
      no longer land in the same bucket, and the code says how the boundary was chosen.
- [ ] For a task whose quality demand the machine cannot meet, the app states that in the
      recommendation row: which task, why, and what the honest options are. It does not silently
      recommend the biggest thing that fits.
- [ ] `Settings → Models` lets the whole set be adopted in one action, as today — the new rows
      behave like the existing ones, with no separate flow.
- [ ] The sensitive-task rule from 019b still wins: `journal-chat` and `classify-dump` are never
      recommended to a cloud provider just because the local model is small.
- [ ] The recommendation stays a proposal — nothing is routed until the user confirms
      (`llm:setRoute` / `llm:setDefault`), per guardrail 2.
- [ ] No hardcoded string in the renderer; every new key exists in both `de*.ts` and `en*.ts`,
      German quotes as `„…“`.
- [ ] Unit-tested: the weak fixture machine end to end (scan facts → verdict → recommendation),
      the tier boundary at its edges, and a task that is reported as beyond this machine. The
      existing 019a/019b/029 tests keep passing unedited.

## Open Questions

- **Q1 — Which models go into the catalogue?** Naming concrete models is a product decision, not
  an implementation detail: a 3B–4B general model, a ~1B model for `title-tags`, and whether a
  small coder model belongs there at all. Candidates exist in several families and the choice
  shapes what the first test user sees on day one.
- **Q2 — A fourth tier, or a finer signal inside `cheap`?** `ModelTier` is `cheap | balanced |
strong` and is used across routing, suggestions and the settings UI. Adding a tier touches all
  of them; keeping three and sizing by `paramsB` inside `cheap` is smaller but leaves the tier
  name lying.
- **Q3 — What does "this task is beyond this machine" mean concretely?** A per-task minimum
  parameter size in `TASK_DEFINITIONS`, or a judgement derived from the existing `suggested`
  tier plus the capacity verdict? The first is explicit and needs numbers nobody has measured;
  the second reuses what is there and is vaguer.
- **Q4 — Does the catalogue stay hand-curated?** 019b's D1 deliberately left live merging for
  later. Adding a handful of entries by hand is consistent; a fetch is a different story.
- **Q5 — Does a weak machine change the _default_ model too**, or only the per-task routes? The
  default is what an unrouted task falls back to, so leaving it pointed at an 8B model would
  undo half of this.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
