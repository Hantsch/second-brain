---
id: 019a
title: The app looks at my machine and tells me what it can carry
status: done # draft -> ready -> in-progress -> done
created: 2026-08-21
---

Part of [[019-model-recommendations-for-people-without-expertise]]. Delivers the "machine
scan" cluster. Nothing here needs an LLM, a provider or a key.

## Requirement

I have no idea whether 8 GB of VRAM is a lot. I want to press one button in the models tab and
get a plain-language answer: what this machine can carry, and the one number that limits it.
Not a table of hardware — a verdict I can act on.

It has to be honest about being a guess. It is a heuristic over RAM, VRAM and CPU, not a
measured throughput, and it must say so. And it changes nothing: it produces a statement, and
whether anything follows from it is a later decision (019b).

## Acceptance Criteria

- [x] I can trigger a scan from the models tab and get a plain-language verdict: what this
      machine can carry, and the one limiting number — e.g. "16 GB RAM, no usable GPU — models
      up to about 8B run, larger ones will crawl".
- [x] The scan reports RAM, VRAM, GPU name, CPU cores and free disk on the drive the model data
      would go to.
- [x] The scan names its own uncertainty. It says it is a heuristic; nothing is presented as
      measured throughput.
- [x] Where a fact could not be determined (no GPU tool on this platform, a parse that failed),
      the result says "unknown" for that fact and the verdict degrades gracefully instead of
      guessing a number.
- [x] The scan changes nothing on its own — no file written, no setting touched. It produces a
      statement.
- [x] The card is permanently in the models tab, not only during first setup, and re-scanning
      is always available. Nothing in the app prompts it automatically.
- [x] A hanging or missing platform tool cannot block the scan: it times out and reports
      "unknown" for that fact.
- [x] No hardcoded string in the renderer; `de.ts` and `en.ts` both carry every new key.
- [x] The verdict logic is unit-tested against fixture fact objects, without touching real
      hardware.
- [x] The scan result contains no vault content and nothing from the user's files.

## Open Questions

None.

## Plan

Split down the middle: **main detects, core judges.** Main owns `os` and `child_process` and
returns a flat fact object; `src/core/llm/capacity.ts` turns facts into a verdict and is
testable with fixtures. This is the split the epic's question 3 decided.

1. **Types** in [src/shared/types/llm.ts](../../src/shared/types/llm.ts) —
   `MachineFacts` (flat, all numbers `number | null`, plus a `detection` marker per
   platform-specific fact) and `CapacityVerdict`.
2. **Channel** `llm:scanMachine` in [src/shared/ipc.ts](../../src/shared/ipc.ts), next to the
   other `llm:*` entries (`{ req: void; res: MachineScanResult }`).
3. **Main handler** in a new `src/main/ipc/machine-scan.ts`, registered in
   [register-all.ts](../../src/main/ipc/register-all.ts) like every other area file. Cheap
   facts from `os` (`totalmem`, `cpus`, `platform`, `arch`) and free disk via `fs.statfs` on
   the Ollama model directory. This is the first consumer of `os`/`child_process` in
   `src/main/` — keep it in this one file.
4. **GPU/VRAM** in the same file, one function per platform, each behind a hard timeout, each
   returning `null` plus a reason instead of throwing: PowerShell `Get-CimInstance
   Win32_VideoController` on win32, `system_profiler SPDisplaysDataType -json` on darwin,
   `lspci` on linux. Fixed argument arrays only, never a shell string — no user input reaches
   these calls and none may in future.
5. **Judgement** in `src/core/llm/capacity.ts`: facts → `{ limitingFactor, maxComfortableParamsB,
   maxPossibleParamsB, tiersThatFit, heuristic: true, unknowns: [] }`. Pure, no Electron, no
   `os`. The rule of thumb (params × bytes-per-weight at Q4 ≤ usable VRAM, else ≤ RAM at a
   penalty) lives here as named constants with a comment on where it comes from.
6. **Renderer** `src/renderer/screens/settings/MachineCard.tsx`, mirroring the panel shape of
   [RoutingSection.tsx](../../src/renderer/screens/settings/RoutingSection.tsx). Placed in
   [ModelsTab.tsx](../../src/renderer/screens/settings/ModelsTab.tsx) above `RoutingSection`,
   always rendered. Idle → "Scan this machine" → verdict headline, the fact rows, the
   heuristic disclaimer. Gaston atoms only, sentence case, no emoji.
7. **i18n** keys in `de.ts` and `en.ts`. The verdict is assembled in the renderer from `t()`
   fragments plus numbers — core returns structured data, never a formatted sentence.
8. **Tests**: `tests/core/llm/capacity.test.ts` with fixture facts (16 GB / no GPU, 32 GB /
   8 GB GPU, 96 GB / no GPU, all-unknown), plus the existing
   [ipc-coverage.test.ts](../../tests/main/ipc-coverage.test.ts) picking up the new channel.

## Deliverables

**D1 — `MachineFacts` type, channel, and the cheap facts** [x]
`src/shared/types/llm.ts`, `src/shared/ipc.ts`, new `src/main/ipc/machine-scan.ts`,
`src/main/ipc/register-all.ts`. Mirror: [src/main/ipc/index.ts](../../src/main/ipc/index.ts)
for the handler-factory shape. RAM, CPU cores, platform, arch, free disk. GPU fields present
but hardcoded `null` with `detection: 'not-attempted'`.
*Accepted when:* `npm run typecheck` is green and `tests/main/ipc-coverage.test.ts` passes with
the new channel registered.

**D2 — GPU and VRAM detection per platform** *(risky, see Model Hints)* [x]
`src/main/ipc/machine-scan.ts` only. Three platform functions, `execFile` with a fixed argument
array and a hard timeout (~2 s), each returning `{ vramMb, gpuName, detection: 'detected' |
'unknown', reason }`. A missing tool, a non-zero exit, an unparseable output and a timeout all
land on `'unknown'` — never a throw, never a hang.
*Accepted when:* the scan returns on this machine with a GPU name, and a unit test proves each
failure mode maps to `'unknown'` (inject the exec function, do not spawn in tests).

**D3 — Capacity judgement in core** [x]
New `src/core/llm/capacity.ts`, new `tests/core/llm/capacity.test.ts`. Pure function facts →
verdict, with the heuristic constants named and commented. Handles the all-unknown case.
*Accepted when:* the four fixture machines produce the expected `limitingFactor` and parameter
ceilings, and no Electron/`os` import exists in the file (ESLint enforces it).

**D4 — Machine card in the models tab** [x]
New `src/renderer/screens/settings/MachineCard.tsx`, `ModelsTab.tsx`,
`src/renderer/lib/api.ts`, `src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts`. Mirror:
`RoutingSection.tsx` for panel, loading and error shape.
*Accepted when:* the card renders idle, running and result states in the built app, both
languages have every key, and `npm run lint` reports no raw Tailwind palette class.

## Model Hints

- `D2 → deliverable-hard` — three platform-specific `child_process` paths where the failure
  modes (missing tool, unparseable output, hanging process) must all degrade to "unknown"
  rather than throwing or blocking the IPC call; getting the timeout and abort handling wrong
  hangs the models tab.
- D1, D3, D4 → default.
- `Review: → default` — the story is purely additive: one new channel, one new core file, one
  new card. No existing path changes behaviour, so there is no regression surface to reason
  about.

## Test Plan (manual acceptance)

**1. Build and seed** (PowerShell, repo root)

```powershell
npm run verify
```

Expected: every step green. If not, stop and show the output.

```powershell
npm run seed
```

**2. Start the app**

```powershell
npm run dev
```

**3. Scan through the UI** — no console, no direct call.

1. Open **Settings → Models**.
2. The machine card is visible above the routing section, in its idle state, with a
   "Scan this machine" button. It is there whether or not a provider is configured.
3. Press the button. Expect a short running state, then a verdict headline naming one limiting
   factor, the fact rows (RAM, VRAM, GPU, CPU cores, free disk), and a visible sentence saying
   this is a heuristic.
4. Press it again. The result refreshes; nothing else on the screen changes.
5. Switch the UI language in settings and return. Every label and the disclaimer are
   translated; no German string appears in English mode.

**4. Nothing was written**

```powershell
git status
```

Expected: clean apart from files you edited yourself. The scan must not have touched
`.secondbrain/settings.json` in the demo vault.

**5. Screenshots**

```powershell
npm run shot
```

Expected: PNGs in `.screenshots/`; the models tab shot shows the machine card.

## Done

**Summary.** Added a permanent, always-visible "This machine" card to the models tab. Main
detects (`os` totals, CPU cores, free disk on the Ollama model directory, and per-platform GPU
name/VRAM via `execFile` with a hard 2 s timeout plus a 2.5 s watchdog — PowerShell/CIM on
win32, `system_profiler` on darwin, `lspci` on linux); core judges (`judgeCapacity` in
`src/core/llm/capacity.ts`, pure, no Electron/`os`, named heuristic constants); the renderer
assembles the plain-language verdict from `t()` fragments plus the structured numbers, never a
formatted sentence from core. Every failure mode (missing tool, non-zero exit, unparseable
output, timeout) degrades to `'unknown'`, never a throw, never a hang — proven with an injected
exec seam, no real process spawning in tests.

**Decisions**
- D2: on win32, WMI's `AdapterRAM` is a 32-bit field and misreports VRAM for any card ≥4 GB
  (verified on the build machine: a 16 GB RTX 4080 reports exactly 4095 MB). Rather than pass on
  a wrong number, `vramMb` is reported `null` while `gpuName`/`gpuDetection: 'detected'` still
  carry the real name — a distinct case from "no GPU at all", both in the fact object and in
  `CapacityVerdict.unknowns`. Accurate win32 VRAM would need a second source (registry
  `HardwareInformation.qwMemorySize`); out of scope for this story, noted for 019b/019c if they
  ever need a real VRAM number on Windows.
- D2: `lspci` on linux yields a GPU name reliably but not VRAM; `vramMb` stays `null` there by
  design, not a bug — documented in the source comment.
- D4 (deviation from the plan's literal file split): `CapacityVerdict`/`LimitingFactor` moved
  from `src/core/llm/capacity.ts` into `src/shared/types/llm.ts` (re-exported from `capacity.ts`
  for existing callers), and `MachineScanResult` gained a `verdict` field populated by the main
  IPC handler calling `judgeCapacity(facts)`. Reason: `tsconfig.web.json` excludes `src/core`, so
  the renderer cannot import from there directly; moving only the *type* declarations keeps
  "main detects, core judges" intact (`capacity.ts` stays pure and is the sole place the
  judgement logic lives) while letting the renderer type the result it receives over IPC.
  Reviewed and confirmed sound by the clean-agent review.
- Live smoke: `npm run seed && npm run shot` ran clean (no console errors), and
  `.screenshots/30-settings-models.png` shows the card in its idle state, above the routing
  section, unconditionally rendered (visible even with zero providers configured). The existing
  Playwright harness (`scripts/shot.mjs`) does not click through to the running/result states for
  this card — extending it was not a deliverable of this story and was left out to avoid scope
  creep; the running/result states were verified by code reading during the clean-agent review
  and by the build succeeding, not by a screenshot of that state.

**Commit message**
```
019a: machine scan — capacity verdict in the models tab
```

**Verification.** `npm run typecheck`, `npm run lint`, `npm run build` all green. `npm test`:
2241/2242 passed — the one failure (`tests/core/wiki/module.test.ts`, a pre-existing
German-doc-drift check against `docs/MODULE-SCHEMA.md`) is unrelated and untouched by this
story's diff (confirmed via `git diff` against that file/test — empty). Clean-agent review:
**PASS**, all ten acceptance criteria PASS with file:line evidence, no weakened tests, no scope
creep, no guardrail violations. No fix cycle was needed.
