---
id: 034
title: The engine starts with settings that fit this machine
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Depends on [[033-llama-cpp-is-a-runtime-the-app-can-install]] (there is nothing to start before
that lands) and on [[028-i-fill-in-what-the-scan-missed]] plus
[[029-how-much-of-this-machine-a-model-may-use]] — the numbers this story computes from are the
numbers those two stories make trustworthy. This is the story that makes the whole line pay off
on weak hardware.

## Requirement

An installed engine that I have to start from a terminal with flags I have to invent is not
installed as far as I am concerned. And the flags are the point: on a machine with a small GPU,
how many layers go to the GPU and how large the context is decide whether a model answers in
three seconds or in three minutes — or whether it starts at all.

I want to start and stop the local engine from the settings screen, and I want the app to choose
those numbers for me out of what it already knows about this machine: the detected and
hand-entered facts from the machine scan, and the share of the box I said it may plan with. I
want to see which values it chose and read one plain sentence about why, because that is the
difference between a setting I trust and a black box. And when a start fails, I want to be told
what to change instead of a stack trace.

It has to be honest about its limits: the app picks the numbers at start time, it does not
manage memory while the model runs. And the app must stay fully usable with the engine stopped —
stopping it is not breaking the app.

## Acceptance Criteria

- [ ] The engine can be started and stopped from `Settings → Models`, and the card shows which
      of the three states it is in (not installed / installed and stopped / running) without a
      manual refresh.
- [ ] The values the app starts with are derived from the machine facts (detected plus
      hand-entered, per 028) and the resource budget (029) — not from constants that ignore the
      machine.
- [ ] The chosen values are visible before and after the start, with one sentence per value
      saying what it traded away ("28 of 33 layers on the GPU — the rest runs on the CPU because
      9.6 GB of planned VRAM does not hold more").
- [ ] The derivation is pure and lives in core: same facts and same budget in, same values out,
      no filesystem and no process. Spawning stays in main.
- [ ] A failed start names a cause the user can act on — port already in use, model file missing,
      engine binary missing, out of memory — and never a raw error string from the process.
- [ ] Stopping the engine leaves no orphaned process, and closing the app stops what the app
      started.
- [ ] With the engine stopped, every screen still works and the affected tasks report the honest
      "no model configured" state (guardrail 1). No dead screen, no hang.
- [ ] Nothing about the engine's state or its command line is written into the vault, and no file
      path from the model directory appears in a log line (guardrail 6).
- [ ] No hardcoded string in the renderer; every new key in both `de*.ts` and `en*.ts`, German
      quotes as `„…“`.
- [ ] Unit-tested: the derivation over at least four fixture machines (no GPU / small GPU /
      large GPU / GPU reported as `null`) and at two budget settings, plus each named start
      failure. No test starts a real process.

## Open Questions

- **Q1 — May I override the numbers by hand?** An advanced row that lets the layer count and
  context be typed in is useful for the author and a foot-gun for the target user. Show it
  always, hide it behind a toggle, or not at all?
- **Q2 — Does the engine start automatically?** On app start, on the first task that needs it, or
  only when I press the button? Automatic is what a non-technical user expects; it also means the
  app takes gigabytes of RAM on a machine that has little of it, before anyone asked for a model.
- **Q3 — Which port, and what if it is taken?** A fixed port collides with a `llama-server` the
  user started themselves; a chosen-at-random port has to be threaded into the provider's
  `baseUrl`, which the user can see and edit.
- **Q4 — What happens when nothing fits, even entirely on the CPU?** Refuse to start with an
  explanation, or start with a small context and say it will be slow? This is the case the first
  test user is most likely to hit.
- **Q5 — May the engine be stopped while a request is in flight?** Refuse, warn, or cancel the
  request. The abort path in `src/core/llm/abort.ts` exists; whether it is the right owner here is
  the question.
- **Q6 — Does this story also govern a runtime the app did not start?** If the user has their own
  `llama-server` running on the same port, the card can either adopt it as "running" and refuse
  to stop it, or ignore it entirely.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
