---
id: 034
title: The engine starts with settings that fit this machine
status: in-progress # draft -> ready -> in-progress -> done
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

- [x] The engine can be started and stopped from `Settings → Models`, and the card shows which
      of the three states it is in (not installed / installed and stopped / running) without a
      manual refresh.
- [x] The values the app starts with are derived from the machine facts (detected plus
      hand-entered, per 028) and the resource budget (029) — not from constants that ignore the
      machine.
- [x] The chosen values are visible before and after the start, with one sentence per value
      saying what it traded away ("28 of 33 layers on the GPU — the rest runs on the CPU because
      9.6 GB of planned VRAM does not hold more").
- [x] The derivation is pure and lives in core: same facts and same budget in, same values out,
      no filesystem and no process. Spawning stays in main.
- [x] A failed start names a cause the user can act on — port already in use, model file missing,
      engine binary missing, out of memory — and never a raw error string from the process.
- [x] Stopping the engine leaves no orphaned process, and closing the app stops what the app
      started.
- [x] With the engine stopped, every screen still works and the affected tasks report the honest
      "no model configured" state (guardrail 1). No dead screen, no hang.
- [x] Nothing about the engine's state or its command line is written into the vault, and no file
      path from the model directory appears in a log line (guardrail 6).
- [x] No hardcoded string in the renderer; every new key in both `de*.ts` and `en*.ts`, German
      quotes as `„…“`.
- [x] Unit-tested: the derivation over at least four fixture machines (no GPU / small GPU /
      large GPU / GPU reported as `null`) and at two budget settings, plus each named start
      failure. No test starts a real process.

## Decisions (Sprint)

- **(User)** Q2 — auto-start: user-configurable, default is button-press only. Refine adds the
  setting (where it lives, e.g. `AppSettings.machine` or a models-tab toggle) and wires "on
  first task that needs it" as the alternative mode, since the default stays manual.
- **(User)** Q4 — nothing fits even on CPU: start with a small context and warn it will be slow,
  rather than refusing. Refine defines the honest warning copy and where the floor sits (a
  context size below which even this is not attempted).
- **Q2 (where it lives)** — the mode is machine-local: `AppSettings.machine.llamaAutoStart:
'manual' | 'on-demand'`, default `'manual'`, with a toggle in the llama.cpp card. Reason: it sits
  next to the other machine-local knobs (`machine.vramOverrideMb`, `machine.resourceBudgetPercent`)
  and must never travel with the vault.
- **Q4 (floor + copy)** — context ladder 8192 → 4096 → 2048, floor `MIN_CONTEXT_TOKENS = 2048`; if
  even weights plus a 2048 context exceed the planned memory the engine is still started at the
  floor with a `slow` warning ("Runs on the CPU with a 2048-token context — answers will take
  minutes on this machine."). Reason: the user chose "start and warn" over refusing, so the floor
  is the value we start at, not a refusal threshold.
- **Q1 — yes, but behind an "advanced" disclosure.** Two optional numbers,
  `machine.llamaOverrides.{gpuLayers,contextTokens}` (`null` = derived), shown collapsed in the
  card next to the derived values, and an override is labelled as such. Reason: the author needs
  the knob, and a collapsed row that always shows what it deviates from is not a foot-gun for the
  target user.
- **Q3 — a configurable default port, next free port on collision, baseUrl written back.**
  Default `11435` (deliberately adjacent to Ollama's 11434, not llama-server's crowded 8080); main
  probes 11435–11444 and takes the first free one, then updates the llama.cpp provider's
  `baseUrl` to `http://127.0.0.1:<port>/v1`. Reason: keeps a user-started `llama-server` on 8080
  untouched and keeps the port visible and editable where the user already edits baseUrls.
- **Q5 — stop is never refused, and this story adds no request tracking.** Stopping sends
  SIGTERM; in-flight requests fail through the gateway's existing mapping to the honest
  `unreachable` state, and the stop button carries a note that a running request will fail.
  Reason: `src/core/llm/abort.ts` owns caller-initiated aborts, not process death — a second
  ownership layer would be new state with no acceptance criterion behind it.
- **Q6 — a foreign runtime is shown as running but never stopped.** The status carries
  `ownedByApp: boolean`; when the port answers and the app did not spawn it, the card says so and
  the stop button is disabled with that sentence. Reason: guardrail 2 — the app does not act on a
  process the user owns; and "closing the app stops what the app started" already requires
  ownership tracking.
- **Engine and model paths come from 033 through an interface.** 034 consumes
  `LlamaInstallLocator { engineBinaryPath(): string | null; installedModels(): LlamaModelFile[] }`;
  where the files actually live stays 033's open question. Reason: guardrail 4 — 034 must not
  hardcode a layout that 033 has not decided yet.
- **Total layer count is an input, estimated only as a fallback.** `LlamaModelFile.totalLayers`
  is used when 033's catalog knows it; otherwise a landmark table `paramsB → layers` in core fills
  it in and the plan marks the value `estimated`. Reason: reading GGUF headers is filesystem work
  and would break the "derivation is pure" criterion.
- **Manual start and on-demand auto-start share one single-flight guard.** A clean review found
  that `startLlamaEngine` had no in-flight guard of its own, so a user pressing "start" while
  `ensureLlamaRunning()` (D6) was mid-spawn for a background task could produce two spawned
  processes, with the first handle silently dropped and unreachable by both the stop button and
  the `will-quit` hook — a direct violation of "no orphaned process" (AC6). Fixed by making
  `startLlamaEngine` itself the single point of truth (module-level in-flight promise); both the
  manual IPC handler and `ensureLlamaRunning()` now converge on it. `trackOwnedEngine` also no
  longer silently drops a live predecessor — it stops it first.
- **Route-gated auto-start.** The same review found `withAutoStart` (D6) awaited
  `ensureLlamaRunning()` on every LLM call regardless of which provider the task actually routed
  to, which could add up to 20s to an unrelated Anthropic/OpenAI request. Fixed to only await the
  guard when the resolved route is the llama.cpp provider.
- **Dead-child poll short-circuit and crash-safe quit hook.** Two smaller robustness fixes from
  the same review: the start poll now notices a child that exited before the port ever answered
  and returns `'spawn-failed'` immediately instead of waiting out the full timeout; and
  `will-quit` now stops an app-owned engine even if an earlier, unrelated cleanup step in the same
  handler throws (previously the engine stop was last and could be skipped).
- **Synchronous spawn failures are redacted like async ones.** A raw `spawn`/`path.join` throw
  outside the async error path could have logged an unredacted `Error` (message/stack containing
  the model path) to the console. Now caught and routed through the same `safeLlamaLogLine`
  redaction and `'spawn-failed'` classification as every other spawn failure.
- **Two low-severity items from the fix-verification pass, left as-is.** (1) The predecessor kill
  in `trackOwnedEngine` uses SIGTERM+SIGKILL back-to-back with no grace window, unlike the normal
  stop path's 2s grace — only reachable if the single-flight invariant above is ever broken, so
  the cost is a leaked GPU allocation in a path that should not occur. (2) The "never throws"
  contract on the main start function is still not fully true for a few pre-existing internal
  calls (`fs.exists`, `firstGgufModel`, `getLlamaStartPlan`, the port probe) that predate this fix
  and were out of scope for it. Neither blocks the acceptance criteria; both are candidates for a
  future hardening pass, not this story.

## Open Questions

~~**Q1 — May I override the numbers by hand?**~~ answered → Decisions (Sprint)
~~**Q2 — Does the engine start automatically?**~~ answered → Decisions (Sprint)
~~**Q3 — Which port, and what if it is taken?**~~ answered → Decisions (Sprint)
~~**Q4 — What happens when nothing fits, even entirely on the CPU?**~~ answered → Decisions (Sprint)
~~**Q5 — May the engine be stopped while a request is in flight?**~~ answered → Decisions (Sprint)
~~**Q6 — Does this story also govern a runtime the app did not start?**~~ answered → Decisions (Sprint)

## Plan

Three layers, in this order: pure derivation in core → process supervision in main → one card in
the models tab. Nothing here re-implements sizing math: the planned-memory figures come from
`judgeCapacity` (`src/core/llm/capacity.ts`), which already applies the fixed reserves and then
029's budget percent.

1. **Core (`src/core/llm/llama-args.ts`, new).** `planLlamaStart({ facts, budgetPercent, model,
overrides })` → `LlamaStartPlan`. Calls `judgeCapacity` for `plannedVramMb`/`plannedRamMb`, then:
   - `gpuLayers = clamp(floor((plannedVramMb − kvCacheMb) / (fileSizeMb / totalLayers)), 0, totalLayers)`
   - `contextTokens`: highest rung of 8192/4096/2048 whose KV cache fits; floor 2048.
   - `threads = clamp(round(cpuCores × budget%), 1, max(1, cpuCores − 1))`; `cpuCores === null` → 4.
     Every value is a `{ value, source: 'derived' | 'manual' | 'floor' | 'fallback', reason }` record;
     `reason` is a **code plus numbers**, never a sentence (guardrail 7). Plus `warnings: ('cpu-only'
| 'slow-floor-context' | 'facts-unknown')[]` and `argv: string[]` (the flags, no paths).
2. **Shared contract.** Types in `src/shared/types/llm.ts`; channels in `src/shared/ipc.ts`:
   `llama:status` (`{ state: 'absent' | 'installed-stopped' | 'running'; ownedByApp; port | null }`),
   `llama:startPlan`, `llama:start`, `llama:stop`. Settings fields in
   `src/shared/types/settings.ts` (`machine.llamaAutoStart`, `machine.llamaOverrides`).
3. **Main (`src/main/ipc/llama-runtime.ts`, new).** Mirrors `ollama-runtime.ts`'s injectable
   `SpawnFn` seam and its poll-until-running loop, but keeps the handle (**not** detached/unref'd):
   port probe → spawn engine binary with `argv` + `--model <path> --port <n>` → poll → write the
   provider `baseUrl`. Stop = SIGTERM then SIGKILL after a grace period; `will-quit` in
   `src/main/index.ts` stops what we started. Failures are classified, never passed through raw.
4. **Renderer.** `src/renderer/screens/settings/LlamaEngineCard.tsx`, mounted in `ModelsTab.tsx`,
   mirroring `LocalRuntimeCard.tsx`; query hooks in `src/renderer/lib/queries/llm.ts` with the
   status query invalidated by the start/stop mutations (no manual refresh); keys in
   `de-settings-runtime.ts` / `en-settings-runtime.ts`.

## Deliverables

- **D1 — the derivation, pure.** `src/core/llm/llama-args.ts` (new) + the plan/value/reason types
  in `src/shared/types/llm.ts` + the `paramsB → layers` landmark table. Mirrors
  `src/core/llm/capacity.ts` in structure and comment style and reuses `judgeCapacity` rather than
  re-deriving planned memory. Tests: `tests/core/llm/llama-args.test.ts` (mirror
  `tests/core/llm/capacity.test.ts`) over four fixture machines — no GPU, small GPU, large GPU,
  `vramMb: null` with `gpuDetection: 'unknown'` — at two budgets (50/100), plus the floor case.
  Accepted when: same input → same output, no `node:fs`/`node:child_process` import in the module.
- **D2 — contract + status, read-only.** `src/shared/ipc.ts` (4 channels), `src/shared/types/llm.ts`,
  `src/shared/types/settings.ts`, `src/main/ipc/llama-runtime.ts` (status + `startPlan` only),
  `src/main/ipc/register-all.ts`, `src/preload/` allowlist if it is not derived. Includes the
  `LlamaInstallLocator` seam and foreign-runtime detection (`ownedByApp: false`). Follows
  `/typed-ipc`. Tests: `tests/main/ipc/llama-runtime.test.ts` — status for all three states plus
  the adopted-foreign case; `startPlan` returns D1's plan for injected facts.
- **D3 — start, stop, lifecycle.** Same main file: port probe over 11435–11444, spawn via the
  injected `SpawnFn`, poll-until-running, tracked handle, SIGTERM/SIGKILL stop, `will-quit` hook in
  `src/main/index.ts`, and the `baseUrl` write-back through the existing `llm:updateProvider` path.
  Accepted when: start-failure classification returns `'port-in-use' | 'model-missing' |
'binary-missing' | 'out-of-memory' | 'timeout' | 'spawn-failed'` and never a process string; stop
  leaves no handle; a test asserts the quit hook stops an app-started engine and leaves a foreign
  one alone. No test spawns a real process.
- **D4 — the card.** `src/renderer/screens/settings/LlamaEngineCard.tsx` (new, mirror
  `LocalRuntimeCard.tsx`), `ModelsTab.tsx`, `src/renderer/lib/queries/llm.ts`,
  `de-settings-runtime.ts` + `en-settings-runtime.ts`. Shows the three states without a manual
  refresh, the planned values with one sentence each (composed from D1's reason codes), the
  slow-context warning, the classified failure sentence, and the stop-cancels-requests note.
  Tokens only, sentence case, no emoji. Accepted when: a renderer test renders all three states and
  an i18n parity test finds no missing key in either language.
- **D5 — advanced override row.** `machine.llamaOverrides` handling in D1's `overrides` argument
  (already typed there), the collapsed disclosure in `LlamaEngineCard.tsx`, the settings write path,
  i18n keys. Accepted when: an entered value shows as `manual` next to the derived one, clearing it
  returns to `derived`.
- **D6 — auto-start mode.** `machine.llamaAutoStart` toggle in the card plus a single-flight
  `ensureLlamaRunning()` guard in main's LLM request path that fires only in `'on-demand'` mode and
  only when status is `installed-stopped`. Accepted when: default `'manual'` starts nothing, and a
  test shows two concurrent tasks trigger exactly one start.
- **D7 — privacy and stopped-state guarantees.** A redaction helper for the engine's argv/model path
  in whatever logging main does here, plus tests: no model path or command line reaches a log line,
  nothing engine-related is written into the vault, and with the engine stopped an LLM task returns
  the `LlmUnavailable` `'unreachable'` state (guardrail 1) instead of hanging — including a request
  in flight when stop is pressed.

## Model Hints

- `D1 → deliverable-hard` — the arithmetic has to stay consistent with `capacity.ts`'s reserve-then-
  budget order across a 4×2 fixture matrix; getting the layer/KV-cache interplay wrong is a silent
  wrong-number bug no other test would catch.
- `D3 → deliverable-hard` — tracked child processes plus a new `will-quit` hook sit next to 019c's
  deliberately detached `ollama serve`; an orphaned or wrongly killed process is a real regression
  risk in shared lifecycle code.
- D2, D4, D5, D6, D7 → default tier.
- `Review: → story-review-hard` — process lifecycle and two guardrails (1 and 6) at once; a leaked
  model path or an orphan process is exactly what a cheap review misses.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app, open `Settings → Models`. The llama.cpp card shows "not
   installed" (no engine present yet) — no console command used.
2. With an engine and a model installed via 033, the card shows "installed, stopped" and lists the
   values it would start with, each with its one-sentence reason.
3. Press "start engine". The state flips to "running" without pressing refresh, and the values
   shown afterwards match the ones shown before.
4. Press "stop engine". State returns to "installed, stopped"; check in the task manager that no
   `llama-server` survives. Open the journal chat — it reports "no model configured", no hang.
5. Start the engine, then quit the app. No `llama-server` process remains.
6. Start a `llama-server` by hand on 11435, then re-check the card: it says the app did not start
   this engine and the stop button is disabled.
7. Expand "advanced", type a context of 2048, confirm the card labels it as entered by hand, clear
   it, confirm it returns to the derived value.

## Done

**Summary.** A prior session had already implemented D1-D7 in full (pure llama.cpp start-plan
derivation in core, status/lifecycle/spawn in main, the engine card + advanced overrides +
auto-start toggle in the renderer, and log redaction), committed under `a4ecd1d`
("prettier run and parts of 31") — but never verified the tree against a fresh review, and
`docs/sprints/S09/progress.md` wrongly implied the work had been lost. This session audited the
actual code against every Acceptance Criterion and every D's "Accepted when" clause (all PASS,
see progress.md), then ran a clean `story-review-hard` review, which found one real blocker: a
race between manual engine start and the D6 on-demand auto-start guard that could double-spawn
`llama-server` and orphan the first process. Four related issues came out of the same review
(unredacted spawn-throw error, auto-start guard firing regardless of route, dead-child poll not
short-circuiting, `will-quit` not crash-safe against earlier cleanup throwing, stale renderer
plan after a budget/VRAM change). All five were fixed in one pass, re-verified, and a second
clean review confirmed PASS with two low-severity, non-blocking notes (documented under
`## Decisions (Sprint)`).

**Commit message.** `034: the engine starts with settings that fit this machine`

**Verification.**

- `npm run typecheck`, `npm run lint`, `npm run format:check` — clean.
- `npm test` — 220 test files, 3160 tests, all passing (includes new tests added by the review-fix
  cycle for the single-flight guard, route-gated auto-start, dead-child short-circuit,
  crash-safe quit hook, and query invalidation).
- `npm run build` — succeeds.
- `npm run seed && npm run shot` — 64 screenshots, no console errors; `Settings → Models` renders
  the machine card and both local-runtime cards (Ollama, llama.cpp) correctly for the
  "not installed" state, which is genuine on this machine (no llama.cpp binary/model present).
- Clean code review (`story-review-hard`), two passes: first FAIL (one confirmed blocker + four
  related findings, all fixed), second PASS.

**Open point — live smoke is partial.** This environment has no llama.cpp engine binary or GGUF
model installed, so steps 2-7 of `## Test Plan (manual acceptance)` (installed/stopped → running
→ stopped, foreign-runtime detection, quit-orphan check, advanced overrides against a real
process) cannot be driven end-to-end here — only step 1 (the honest "not installed" state) and
the renderer/unit/integration test coverage for the rest could be exercised headlessly. This
matches the story's own anticipated outcome: acceptance of the start/stop/quit/foreign-runtime
behavior against a genuine process needs a machine with the engine actually installed. Status is
therefore left `in-progress` ("built, acceptance pending") rather than `done`, and the story stays
in `docs/requirements/` (not moved to `done/`) until a user with a real llama.cpp install runs
Test Plan steps 2-7.
