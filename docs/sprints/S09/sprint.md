---
sprint: S09
status: in-progress # planned | in-progress | done
branch: sprint/09
milestone: M11 — A local engine for a machine that is not mine
---

# Sprint S09 — A small model, an engine that installs itself, and a start I can see

## Goal

A machine without a strong graphics card gets a local model it can actually run, and getting
there costs no terminal. The catalogue learns the 1B–4B class and the recommendation stops
pretending a 1B and an 8B are the same thing; llama.cpp becomes a runtime the app fetches and
sets up the way it already does Ollama; and starting it happens from the settings screen with
layer count, context size and thread count derived from this machine rather than invented.

At the end, `Settings → Models` on a weak laptop leads from "nothing configured" to a running
local model without leaving the app, and the card says which numbers it chose and what they cost.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 035 — The machine card remembers, and speaks plainly
- [x] 032 — A model that fits a weak machine
- [x] 033 — llama.cpp is a runtime the app can install
- [ ] 034 — The engine starts with settings that fit this machine

## Notes

**Why this sprint.** Raised by the user on 2026-08-23 out of a plain observation: the model
provider setup only really manages Ollama, and the first test user will not have strong hardware.
Cut as its own milestone after S08 rather than folded into it — 028 and 029 rewrite exactly the
two files this sprint builds on (`src/core/llm/capacity.ts` and the recommendation path), so
running the two lines in parallel would mean two sprints editing one heuristic.

**Why this order.**

- **035 first, because everything else edits the same two places.** It is the smallest story of
  the four and the only one that is pure repair: it makes the machine card persist its scan, take
  GB instead of MB, and drop the parameter vocabulary. It splits the 493-line
  `MachineCard.tsx` into `src/renderer/screens/settings/machine/` and touches
  `src/core/llm/capacity.ts` — the file 032 changes next and 034 reads. Doing it first means the
  three engine stories land on the split card instead of merging against it, and the first test
  user sees a card that does not forget on the very same day the small-model recommendation
  arrives.
- **032 second, and useful alone.** It is the only story of the three that needs no new runtime and
  no new process: it changes what the app suggests. If the sprint stops after it, the first test
  user still gets a recommendation that fits their laptop — through Ollama, which is already
  managed. Everything after it is about control, not about being usable at all.
- **033 second.** There is no point installing an engine before there is something small and
  sensible to run in it. This is also the largest story: 019c's install/pull/status code is about
  700 lines across three files in `src/main/ipc/` plus `runtime-plan.ts` in core, and Q6 asks
  whether it gets extracted behind an interface or duplicated.
- **034 last.** Nothing to start before 033 lands, and its derivation reads the facts 028 makes
  enterable and the budget 029 introduces. It is also the story most likely to need a second
  pass, so it sits where a carry-over hurts least.

**Depends on S08.** 035 is a direct follow-up to 019a/028/029 and assumes all three are accepted
— it rewrites the file they live in. 034 computes from `MachineFacts` including hand-entered values (028) and from
the resource budget (029). If S08 is not accepted when this sprint starts, 034 either waits or
degrades to the detected facts only — that is a decision for the clarification round, not a
silent fallback.

**Open questions: seventeen across the three stories.** The ones an agent must not decide alone:

- **032-Q1** (which models go into the catalogue) is what the first test user sees on day one.
- **032-Q2** (a fourth `ModelTier` or a finer signal inside `cheap`) touches routing, the
  suggestions and the settings UI. It is a type change in `@shared/types`, not a local edit.
- **033-Q1** (which engine build) and **033-Q3** (where model files come from) decide the size of
  the story: a curated pin is small, a Hugging Face search is its own sprint.
- **033-Q5** (does Ollama stay the recommended default) — with two managed local runtimes the app
  needs an opinion, or it has handed back the decision it exists to take away.
- **033-Q6** (extract an interface or add parallel channels) is the architectural call of the
  sprint.
- **034-Q2** (does the engine start automatically) and **034-Q4** (what happens when nothing fits
  even on the CPU) are the two the target user will meet first.

**Already decided by the user on 2026-08-23**, not to be reopened:

- **AirLLM is out.** Evaluated at the source: it keeps one layer on the GPU at a time and is
  explicitly disk-loading bound, needs Python and PyTorch inside an Electron bundle, and exposes
  no OpenAI-compatible server. It trades speed for model size; this milestone needs the opposite.
- **Ollama stays.** llama.cpp is a second managed runtime for the machines where it is the better
  one, not a replacement — and Ollama is llama.cpp underneath, so this is about exposed knobs
  (GPU offload, context size, quantisation choice), not about a different engine.
- **Nothing about the engine goes into the vault.** Binaries and model files live in a place the
  app owns; a vault on a USB stick stays a folder of Markdown.

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true. 035 is fully
acceptable on the author's machine — restart, slider, GB field, keyboard — and is refined (`ready`)
with its plan in the story file. 032 is
acceptable in the running app against a fixture-weak verdict. 033 and 034 have the same problem
019c had: their real acceptance needs a machine where the engine is genuinely absent, and the
author's machine is not that. Expect at least one of them to end as "built, acceptance pending"
until it runs on the test user's laptop — which is also what story 031 in S08 exists to make
possible.

**Milestone.** M11 is created by this sprint. The condensed layer stays the standing candidate in
"Open / unprioritised" and is deferred a third time; the two S07 carve-outs (`format:check` never
green on Windows, the maintenance progress bar lost on navigation) stay in the open list.
