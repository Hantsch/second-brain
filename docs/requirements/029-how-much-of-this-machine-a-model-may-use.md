---
id: 029
title: I say how much of this machine a model may use
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019a-machine-scan]] and [[019b-model-recommendations]]. Builds on
[[028-i-fill-in-what-the-scan-missed]] — a budget over a VRAM figure the app does not know is a
percentage of nothing. Nothing here needs an LLM, a provider or a key.

## Requirement

The sizing heuristic plans as if the whole machine were mine to spend. It is not: while a local
model runs I still have a browser, an editor and an agent session open, and a model chosen
against 100% of the box makes the machine unusable while it answers.

I want one number in the settings — the share of this machine's resources the app may plan with
— and everything that picks a model has to size against that number instead of against the raw
hardware. At 60% on a machine with 32 GB of RAM and 16 GB of VRAM, the app plans with 19.2 GB
and 9.6 GB and recommends accordingly. Turning the number down has to visibly change what the
app suggests, or the setting is decoration.

It should be honest about what it is: a planning number for _choosing_ a model, not a throttle
on a running one. The app does not control how much memory Ollama actually takes once a model is
loaded, and it must not pretend it does.

## Acceptance Criteria

- [ ] One setting, in percent, reachable in the UI, with a documented default, changeable at any
      time without a restart.
- [ ] The setting lives on the machine, not in the vault — the same vault opened on a weaker
      machine does not carry a budget from the stronger one.
- [ ] The machine card's verdict is computed against the budget and says so: both the real figure
      and the planned one are visible ("16 GB VRAM · planning with 12.8 GB at 80%").
- [ ] The model recommendation (019b) picks its target under the same budget. Lowering the
      percentage far enough visibly changes the recommended local model for at least one task.
- [ ] When nothing fits under the chosen budget any more, the app says exactly that — no local
      model fits at this share — instead of recommending something that will not run.
- [ ] The existing headroom constants in `src/core/llm/capacity.ts` (OS reserve, VRAM/KV-cache
      headroom, the CPU-only penalty) keep working, and the combination is documented: it must be
      obvious from the code what 100% means and that it is still not "all of it".
- [ ] Cloud models are unaffected — the budget is about what runs on this machine.
- [ ] The setting's own text says what it does and does not do: it sizes the recommendation, it
      does not limit a running model.
- [ ] No hardcoded string in the renderer; `de*.ts` and `en*.ts` both carry every new key.
- [ ] Unit-tested: the verdict at 100 / 80 / 50 / 10 percent over the same fixture machine, a
      budget so low that `tiersThatFit` is empty, and a recommendation that changes target when
      the budget changes. The existing 019a/019b tests keep passing.

## Open Questions

- **Q1 — What does the percentage apply to?** Memory only (RAM and VRAM), or CPU cores as well?
  Cores behave differently: a runtime's thread count is a real setting, but this app never starts
  the runtime, so a core budget would influence the verdict without anything acting on it.
- **Q2 — Where does the budget sit relative to the existing reserves?** Budget applied to the
  total and _then_ the OS reserve subtracted, or the reserve first and the budget on what is
  left? This decides what 100% means and whether the default changes today's behaviour.
- **Q3 — One number or two?** A single global percentage, or separate budgets for RAM and VRAM
  (a machine can have plenty of one and little of the other).
- **Q4 — What is the default?** A default that changes what the app recommends today is a
  behaviour change for an accepted milestone; 100% keeps everything as it is and makes the
  feature opt-in.
- **Q5 — Where does it live in the UI?** Next to the machine card in Settings → Models, where
  its effect is visible, or in the behaviour settings with the other thresholds.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
