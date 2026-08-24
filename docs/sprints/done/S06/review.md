# Sprint S06 — Review

**Goal.** The models tab stops asking me to guess. It tells me what this machine can carry,
proposes one model per task in plain language and in money — never a target I can't reach,
never a training endpoint for a sensitive task — and gets me a working local runtime without a
terminal.

## Overview

| Story                        | Status | Commit                                                                                     |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| 019a — machine scan          | done   | `019a: machine scan — capacity verdict in the models tab`                                  |
| 019b — model recommendations | done   | `019b: recommend one model per task, with cost, download size and the sensitive-task rule` |
| 019c — guided local runtime  | done   | `019c: guided local runtime — install, start, and pull Ollama models from the app`         |

All three stories were already refined to `ready` before this sprint started; no clarification
round or refine pass was needed. Build ran in list order (019a → 019b → 019c), each on its own
review-fix cycle before commit.

## Implemented stories

**019a.** A permanent "This machine" card in the models tab. Main-process detection (RAM, CPU
cores, free disk, per-platform GPU/VRAM via `execFile` with a hard timeout) feeds a pure core
heuristic (`judgeCapacity`) that produces a plain-language verdict with one limiting factor.
Every failure mode degrades to `'unknown'`, never a hang. No fix cycle needed.

**019b.** A curated + live-enriched model catalogue, a reachability filter that reads 019a's
capacity verdict, a hard-gated sensitive-task rule (local or `no-training` only, `'unknown'`
refused), a ranking/cost engine, and per-request `data_collection: 'deny'` enforcement on
OpenRouter. A "Model recommendation" panel lets the user accept per row or all at once. Two
review-fix cycles, one of them closing a privacy-relevant reachability bug (see findings below).

**019c.** Status detection (absent/installed-stopped/running), a confirmed installer download
with progress and cancel, start-the-runtime, and a model pull over Ollama's native NDJSON
`/api/pull` with cancel-and-delete cleanup — all backed by a renderer store so progress survives
navigation. Pull candidates come from 019b's reachability data. One review-fix cycle closed 6
confirmed bugs.

## Findings & decisions

- **Privacy-critical bug, fixed (019b):** the reachability/recommend resolvers used to fall back
  to "any enabled provider of the right kind," so a configured local Ollama provider could satisfy
  reachability for an unrelated cloud, trains-on-input catalogue entry — because
  `providerKind: 'openai-compatible'` is shared between local and cloud, and the sensitive-task
  rule trusts `provider.local` as its only proof nothing leaves the machine. Fixed by requiring an
  exact `provider.local === wantsLocal` match, no fallback, in both `reachability.ts` and
  `recommend.ts`. Worth remembering for any future story that resolves a catalogue entry to a
  concrete provider: `providerKind` alone is not enough to prove locality.
- **Windows VRAM detection is unreliable (019a), by design, not a bug:** WMI's `AdapterRAM` is a
  32-bit field and misreports any card ≥4 GB (verified: a 16 GB RTX 4080 reports 4095 MB). The
  scan reports `vramMb: null` with `gpuName`/`detection: 'detected'` still populated rather than
  publish a wrong number. A real fix needs a second source (registry
  `HardwareInformation.qwMemorySize`) — noted here in case a later story needs accurate Windows
  VRAM.
- **Known, deferred limitation (019b):** a live OpenRouter policy lookup is applied to any
  catalogue entry whose id happens to parse as an `author/slug`, regardless of which concrete
  provider the user is actually routed through. Latent only against today's bundled catalogue.
  Fixing it properly means attributing policy per-provider-instance instead of per-catalogue-entry
  — a larger change than a review-fix cycle should absorb; flagged for a follow-up story rather
  than expanded scope.
- **Linux install is out of scope by design (019c):** Ollama's official Linux install path is
  `curl | sh`, which this app's no-shell-strings guardrail forbids constructing. Linux always
  falls back to the manual path — this is a guardrail consequence, not a gap to close later.
- **019d stays out of this sprint,** as planned: its open questions need subscription-terms
  reading and an `LlmGateway` architecture decision that no agent should resolve inside a build.
- **Pre-existing, unrelated test failure** (`tests/core/wiki/module.test.ts`, a docs-drift check
  against `docs/MODULE-SCHEMA.md`) surfaced in every story's `npm test` run and was independently
  confirmed untouched by this sprint's diff each time. Also pre-existing and out of scope:
  `npm run format:check` is red repo-wide (~300 files, including `CLAUDE.md` and untouched docs);
  every file this sprint touched passes `prettier --check` individually.

## Live acceptance note (P2)

019a's card was verified idle-state via screenshot; its running/result states were verified by
code reading during review, not by a screenshot, since extending `scripts/shot.mjs` to click
through was not a deliverable. 019b's interactive behaviour (fetch, accept, sensitive citations)
is covered by 32 renderer tests against the real component tree — no live Ollama/OpenRouter
credentials exist in this environment, so test-plan steps needing a configured provider are
manual acceptance for whoever has one. 019c was verified furthest: a real Ollama instance was
running on the build machine, so the card's `'running'` state and the 019b-fed pull list
(`ollama/qwen2.5-coder:7b`, 4.7 GB) were confirmed against live data, not just mocks.

All three stories are **built, live acceptance pending** for the steps above — not presented as
fully accepted. See `testplan.md` for the exact manual steps.

## Blocked / open

None. All three planned stories are done.
