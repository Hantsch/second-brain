---
id: 021
title: A maintenance run I can see, stop and continue
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

Right now, as I write this, I believe a maintenance run is going — but I am not sure. That
is the whole problem in one sentence. The vault is small today and it will only get bigger;
a run that takes minutes and tells me nothing about itself is a run I will stop starting.

Three things I want from a run: **see where it is**, **stop it and continue later**, and
**check only a part** when I do not have time for everything.

### 1. I cannot tell whether a run is going

There is a progress bar ([RunBar.tsx](../../src/renderer/screens/garden/RunBar.tsx)), and it
is fine — but I only ever see it under conditions I cannot control:

- It lives **only on the maintenance screen**. I start the run, walk over to the journal,
  and the app is silent. Nothing anywhere says "still checking".
- Its state comes from an **event subscription that starts empty**
  ([gardener.ts:168](../../src/renderer/lib/queries/gardener.ts#L168)). Open the maintenance
  screen while a run is going and the screen shows the old report, no bar, no hint — until
  the next event happens to arrive.
- The run **on opening the vault** (`gardener.runOnOpen`) reports no progress at all: the
  autorun calls the run without a progress callback
  ([gardener-autorun.ts:104](../../src/main/gardener-autorun.ts#L104)). So the one run I did
  not start myself is the one I can see the least. If I then press "check now", I get
  "there is already a maintenance run going"
  ([gardener.ts:191](../../src/main/ipc/gardener.ts#L191)) — which is the first time anyone
  tells me.

Main even knows the answer already and nobody can ask it: `gardenerRunning()`
([gardener.ts:65](../../src/main/ipc/gardener.ts#L65)) exists and has no channel and no
caller.

### 2. The bar does not say how far I am

Even when I do see it, it lies about the shape of the work. `total` is the ten mechanical
checks plus at most two model stages
([gardener-deps.ts:179](../../src/main/ipc/gardener-deps.ts#L179)). The ten checks are
milliseconds — so the bar jumps to ~83% instantly and then stands still for however long the
model needs, on one opaque step. The number moves fastest where nothing costs anything and
freezes where everything does. What is left to do is exactly what the bar cannot show.

### 3. Stopping loses the work; there is no continuing

"Cancel" aborts and nothing is kept — the report is written only after the whole run
finishes ([gardener.ts:204](../../src/main/ipc/gardener.ts#L204)). So a run I interrupt after
two minutes of model work costs me those two minutes. That makes cancel a punishment and
makes me sit and wait instead. I want the opposite: stop it, keep what was already found,
and continue where it left off when I have time again.

### 4. I cannot check only a part

`gardener:run` takes nothing but `{ useLlm }`
([ipc.ts:701](../../src/shared/ipc.ts#L701)). It is all checks over the whole vault or
nothing. But my findings are already grouped by kind and by module on the screen
([filter.ts](../../src/renderer/screens/garden/filter.ts)) — that is the same shape I would
want to check in: "just this module", "just the mechanical checks, no model", "just the
duplicates". A part-run is also the honest answer to a long run: less work, not a faster
guess.

None of this may bend the existing guardrails: the run stays fully usable without a model, a
partial run must never be presented as a full one, and a health score computed over a part of
the vault must say so instead of quietly replacing the number for the whole.

## Acceptance Criteria

- [ ] At any moment I can tell whether a maintenance run is going, from **any** screen — not
      only from the maintenance screen, and not only if I was watching when it started.
- [ ] Opening the maintenance screen **during** a run shows the running state right away,
      without waiting for the next progress event.
- [ ] The run started on opening the vault is as visible as one I start myself.
- [ ] The progress display reflects the real cost of the work: the long model stage is not
      one opaque step, and the display does not sit at a near-finished percentage for most
      of the run.
- [ ] While a run is going, the display names what is left, not only what is done.
- [ ] I can stop a run and the findings already computed are kept — stopping does not throw
      the run away.
- [ ] After stopping I can continue, and continuing does not redo the parts that were
      already finished.
- [ ] A stopped or partial run is labelled as such wherever its result is shown (findings
      list, health score, dashboard tile) — no partial run appears as a complete check.
- [ ] I can start a run over a part: at least one scope narrower than "everything", chosen
      from the vocabulary the screen already uses (kind, module, with/without model).
- [ ] Without a model configured, all of the above still works, and the display says what a
      model stage would have added instead of pretending to run one.
- [ ] Two runs still cannot overlap, and the message about that is not the first thing that
      tells me a run was going.

## Open Questions

<!-- From the requester; to be resolved in refine. -->

1. **Split or one story?** This carries three capabilities (visible state, resumable run,
   part-run). 019 was cut into 019a–d for less. Suggest a split unless the plan stays under
   the usual deliverable count.
2. **What does "continue" mean for a model stage that was cut mid-request?** Repeat that one
   stage, or resume only at stage granularity (checks done, model stage restarted)? The
   cheapest honest answer is probably stage granularity — decide it explicitly, do not leave
   it to the implementation.
3. **Where does a paused run live?** `.secondbrain/gardener.json` already holds the run
   ([gardener-state.ts](../../src/main/gardener-state.ts)); a partial run plus "what is still
   missing" would go in the same file. It is deletable by contract — a lost pause must
   degrade to "not checked yet", not to a wrong report.
4. **How granular does model-stage progress get?** Real sub-progress needs the gateway to
   report something; if it cannot, an honest "the model is reading, this can take a while"
   with elapsed time may be the truthful maximum. Do not invent a percentage.
5. **Is the health score for a part-run computed at all?** Suggest: not recomputed, the
   previous score stands with a note — a score over one module is not this vault's health.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
