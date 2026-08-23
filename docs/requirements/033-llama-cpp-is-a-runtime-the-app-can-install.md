---
id: 033
title: llama.cpp is a runtime the app can install
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Follow-up to [[019c-guided-local-runtime]]. Builds on
[[032-a-model-that-fits-a-weak-machine]] — a second runtime is only worth having once there is
something small and sensible to run in it. Paired with
[[034-the-engine-starts-with-settings-that-fit-this-machine]], which starts what this story
installs.

## Requirement

The only local runtime the app can set up for me is Ollama. Ollama is llama.cpp underneath, so
this is not about a better engine — it is about the knobs Ollama does not expose. On a machine
without a strong GPU the decisive settings are how many layers go to the GPU, how large the
context is, and which quantisation of a model I take. `llama-server` exposes all three; Ollama
decides them for me.

Reaching llama.cpp today means: find the right release asset on GitHub, unpack it, find a GGUF
file on Hugging Face, guess a command line, and then point the app's "own OpenAI-compatible URL"
preset at it. That is a path for the author of this app and for nobody else. The user I am about
to hand this to will not do it, and should not have to.

I want llama.cpp to be a runtime the app sets up the same way it sets up Ollama: named in the
list, one guided action to get the engine onto the machine, one guided action to get a model
next to it, visible progress, and a cancel that leaves nothing half-written. Ollama stays — this
is a second option for the machines where it is the better one, not a replacement.

## Acceptance Criteria

- [ ] llama.cpp appears as a local provider in `Settings → Models` alongside Ollama and LM
      Studio, with a hint that says what it is for (control over GPU offload and context on weak
      hardware) — not just a URL to fill in by hand.
- [ ] The runtime channels serve both runtimes rather than one: status, install plan, download,
      cancel and open-installer all take or report which runtime they mean, and the existing
      Ollama flow behaves exactly as it does today.
- [ ] The engine can be fetched from inside the app with visible progress and a working cancel.
      A cancelled or failed fetch leaves no partial engine that a later status call reports as
      installed.
- [ ] A model file can be fetched from inside the app with visible progress and a working cancel,
      reusing the existing pull progress shape rather than a second one.
- [ ] Before either fetch, the free-disk fact the machine scan already gathers is checked, and a
      fetch that would not fit is refused with the number named — no download that fills the
      disk.
- [ ] Engine and model files live outside the vault, in a place the app owns. A vault on a USB
      stick carries no binaries, per the portability rule.
- [ ] No shell string is constructed to install anything (019c's guardrail). Where a platform
      offers no path that satisfies this, the app says the platform is unsupported and why —
      the same honest dead end 019c has for Linux.
- [ ] The provider works end to end once installed: `llm:probe` succeeds, `llm:models` lists what
      is there, and one real task runs against it.
- [ ] The app is fully usable with none of this installed — the guardrail-1 "no model configured"
      state is unchanged.
- [ ] No hardcoded string in the renderer; every new key in both `de*.ts` and `en*.ts`, German
      quotes as `„…“`.
- [ ] Unit-tested: the install plan per platform and per runtime, the blocked reasons, a
      refused-for-disk-space fetch, and a cancelled fetch leaving no installed state. No test
      reaches the network.

## Open Questions

- **Q1 — Which build of the engine, and who picks it?** llama.cpp ships separate assets for
  CPU-only, CUDA, Vulkan and ROCm. The machine scan knows the GPU name well enough to guess
  sometimes and not always. Does the app pick from the scan, ask, or only ever take the
  CPU/Vulkan build that runs everywhere?
- **Q2 — Where do the engine and the models live?** Under `userData` next to settings and keys,
  or in a user-chosen folder (models are gigabytes and may want to sit on a different drive)?
  019c reads `~/.ollama/models` only to measure free space; this story actually writes.
- **Q3 — Where do model files come from?** A direct download from a curated pin (repo + file
  name + hash, hand-maintained like the catalogue), or a search against Hugging Face? A pin is
  honest and small; a search is a much bigger story and may need a token.
- **Q4 — Which platforms?** 019c is Windows-and-macOS by necessity. A downloaded archive plus a
  binary has no installer to run, so Linux might be reachable here where it was not there —
  worth deciding rather than inheriting.
- **Q5 — Does Ollama stay the recommended default?** Two managed local runtimes means the app has
  to have an opinion about which one a given machine should get, or it has moved the decision it
  was supposed to take away.
- **Q6 — What is the shared abstraction, concretely?** 019c's install/pull/status code is roughly
  700 lines across three files in `src/main/ipc/`, plus `runtime-plan.ts` in core. Does this
  story extract an interface both runtimes implement, or add a parallel set of channels? The
  first is the project's own rule; the second is a smaller diff.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
