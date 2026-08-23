---
id: 033
title: llama.cpp is a runtime the app can install
status: done # draft -> ready -> in-progress -> done
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

- [x] llama.cpp appears as a local provider in `Settings → Models` alongside Ollama and LM
      Studio, with a hint that says what it is for (control over GPU offload and context on weak
      hardware) — not just a URL to fill in by hand.
- [x] The runtime channels serve both runtimes rather than one: status, install plan, download,
      cancel and open-installer all take or report which runtime they mean, and the existing
      Ollama flow behaves exactly as it does today.
- [x] The engine can be fetched from inside the app with visible progress and a working cancel.
      A cancelled or failed fetch leaves no partial engine that a later status call reports as
      installed.
- [x] A model file can be fetched from inside the app with visible progress and a working cancel,
      reusing the existing pull progress shape rather than a second one.
- [x] Before either fetch, the free-disk fact the machine scan already gathers is checked, and a
      fetch that would not fit is refused with the number named — no download that fills the
      disk.
- [x] Engine and model files live outside the vault, in a place the app owns. A vault on a USB
      stick carries no binaries, per the portability rule.
- [x] No shell string is constructed to install anything (019c's guardrail). Where a platform
      offers no path that satisfies this, the app says the platform is unsupported and why —
      the same honest dead end 019c has for Linux.
- [ ] The provider works end to end once installed: `llm:probe` succeeds, `llm:models` lists what
      is there, and one real task runs against it. **Not live-verified** — needs a real download
      from GitHub/Hugging Face and a real `llama-server` process on real hardware; see Done.
- [x] The app is fully usable with none of this installed — the guardrail-1 "no model configured"
      state is unchanged.
- [x] No hardcoded string in the renderer; every new key in both `de*.ts` and `en*.ts`, German
      quotes as `„…“`.
- [x] Unit-tested: the install plan per platform and per runtime, the blocked reasons, a
      refused-for-disk-space fetch, and a cancelled fetch leaving no installed state. No test
      reaches the network.

## Decisions (Sprint)

- **(User)** Q1 — engine build: picked from the GPU scan (CUDA/ROCm/Vulkan/CPU), not a single
  everywhere-build. Refine must define the fallback when the scan cannot identify the GPU
  confidently.
- **(User)** Q3 — model source: a search against Hugging Face, not a curated pin. Note: the
  story spec itself flags this as "a much bigger story and may need a token" — refine should
  size this honestly and split further if needed, rather than compressing it to fit the sprint.
- **(User)** Q5 — Ollama stays the recommended default runtime for now; llama.cpp is the
  explicit-choice option for GPU-offload/context control. The user wants to keep experimenting
  with what is most user-friendly here, so this may change in a later sprint.
- **(User)** Q6 — extract a shared interface both runtimes implement (per guardrail 4, project's
  own rule), not a parallel channel set.

### Taken in refine (not user decisions)

- **Q2 — storage:** engine under `<userData>/runtimes/llamacpp/`, model files under
  `<userData>/models/gguf/`; no user-chosen folder in this story. Reason: one write path the app
  owns satisfies the portability rule with no new settings surface, validation or migration —
  a relocatable models folder is a separate story if the first test user asks for it.
- **Q2b — disk fact:** free space is measured on the volume that holds `userData` (reusing
  `detectFreeDiskMb()` with that path), not `~/.ollama/models`. Reason: the check must measure the
  disk actually written to.
- **Q4 — platforms:** all three (`win32`, `darwin`, `linux`). Reason: llama.cpp ships plain ZIP
  archives, so there is no installer to launch and no shell string anywhere — the reason 019c had
  to exclude Linux does not exist here. `blockedReason: 'unsupported-platform'` stays reachable for
  unknown platform/arch pairs that have no asset.
- **Q1-fallback — build choice when the scan is unsure:** vendor is classified by a pure function
  over `gpuName` (NVIDIA/GeForce/RTX/Quadro/Tesla → cuda, AMD/Radeon → vulkan, Intel/Arc/Iris →
  vulkan, Apple M → the macOS build). `gpuDetection: 'unknown'` **with** a GPU name → vulkan;
  no GPU found or the scan failed entirely → cpu. Reason: vulkan is the one accelerated build that
  runs on any vendor, cpu is the only build that cannot fail for a missing driver. The derived
  choice is shown as a preselected, overridable select in the install dialog (guardrail 2 — the
  app proposes, the user confirms).
- **Engine source:** a pinned llama.cpp release build tag in a curated descriptor constant
  (dated like the catalogue's `policyReadAt`), not a live query of the GitHub releases API.
  Reason: reproducible, unit-testable without network, and bumping it is a one-line change.
- **CUDA companion archive:** the Windows CUDA build needs its `cudart-*` archive too; the
  descriptor carries an `extraArchives` list and the download sums both sizes into one progress.
  Reason: keeps a real platform quirk as data instead of a special case in the download loop.
- **Extraction:** streaming, pure-JS unzip from disk (`extract-zip`/yauzl — no native module, no
  shell), into a staging directory that is renamed into place only on success; POSIX builds get an
  explicit `chmod +x`. Reason: archives are hundreds of MB, so an in-memory unzip is not an option,
  and staging-then-rename is what makes "cancel leaves no installed engine" true by construction.
- **Hugging Face access:** anonymous only — no token, no secret storage in this story. Search via
  `GET /api/models?search=…&filter=gguf`, file list and sizes via `/api/models/{id}/tree/main`,
  download via `/resolve/main/{file}`. A gated or 401 repository gets an honest "this repository
  needs access on huggingface.co" message. Reason: public GGUF repos cover the target case; a token
  adds a secrets surface for no gain yet.
- **Quantisation:** parsed out of the GGUF filename (`Q4_K_M`, `Q8_0`, …) by a pure function and
  shown per file. Reason: quantisation choice is the whole point of this runtime, and the filename
  is the only source that needs no extra request.
- **Minimal start belongs to this story:** AC 7 ("probe succeeds, one real task runs") cannot be
  met without a running server, so `llm:startLocalRuntime` gains the llamacpp case with fixed
  conservative flags (`--port 8080 -m <file> -ngl 0 -c 4096`). [[034]] replaces exactly that flag
  derivation with the machine-derived one and owns the states/failure-cause/stop UI. Reason: it is
  the smallest addition that makes 033 acceptable on its own without pre-empting 034.
- **Progress channels:** the engine fetch reuses `event:install-progress`, the model file download
  reuses `event:pull-progress` (AC 4). No third progress shape.
- **Shape of the shared abstraction:** pure part in `src/core/llm/runtime/` (runtime descriptors,
  plan, build selection — no Electron), imperative part in `src/main/ipc/runtime/` as a
  `RuntimeInstaller` interface (`status`, `plan`, `download`, `cancel`, `openInstaller`, `start`)
  with an `ollama` and a `llamacpp` implementation behind a registry keyed by `RuntimeId`. Reason:
  guardrail 5 forbids fs/process in core, so the interface has to be cut along that line.
- **Recommendation untouched:** the llama.cpp preset is offered but never auto-recommended
  (Ollama stays the default per user Q5), so `recommend.ts` is out of scope for this story.

## Open Questions

~~**Q1 — Which build of the engine, and who picks it?**~~ answered → Decisions (Sprint)
~~**Q2 — Where do the engine and the models live?**~~ answered → Decisions (Sprint)
~~**Q3 — Where do model files come from?**~~ answered → Decisions (Sprint)
~~**Q4 — Which platforms?**~~ answered → Decisions (Sprint)
~~**Q5 — Does Ollama stay the recommended default?**~~ answered → Decisions (Sprint)
~~**Q6 — What is the shared abstraction, concretely?**~~ answered → Decisions (Sprint)

## Plan

Three layers, in that order: pure core first (descriptors, build choice, HF parsing), then the
IPC contract, then main's two installers, then the renderer.

1. **Core, pure.** New `src/core/llm/runtime/`: `descriptors.ts` (per-runtime + per-platform asset
   table with the pinned llama.cpp build tag, sizes, `extraArchives`, target subdirectory),
   `plan.ts` (generalised `planRuntimeDownload` for engine _and_ model files — platform, free disk,
   size, writability → plan or `blockedReason`), `engine-build.ts` (`gpuName` + `gpuDetection` +
   platform/arch → build id, with the fallback ladder above). `runtime-plan.ts` stays as a thin
   Ollama-shaped wrapper so `tests/core/llm/runtime-plan.test.ts` passes unedited.
2. **Core, Hugging Face.** New `src/core/llm/hf/`: query building, response parsing (models,
   file tree with sizes), GGUF filtering, `quant.ts` filename → quantisation, download URL. Pure,
   over the injected `FetchLike` from `core/llm/http.ts`. Never called from core itself.
3. **Contract.** `src/shared/ipc.ts` + `src/shared/types/llm.ts`: `RuntimeId = 'ollama' |
'llamacpp'` on `llm:localRuntimeStatus`, `llm:runtimeInstallPlan`, `llm:downloadRuntime`,
   `llm:cancelRuntimeDownload`, `llm:openRuntimeInstaller`, `llm:startLocalRuntime`,
   `llm:pullModel`; one new channel `llm:searchModelFiles`. Channel _names_ are unchanged, so the
   preload allowlist only grows by one. `api.ts` + `mock-bridge.ts` follow.
4. **Main, shared installer.** `src/main/ipc/runtime/types.ts` + `registry.ts` define
   `RuntimeInstaller`; the three existing `ollama-*.ts` files become the `ollama` implementation
   with no behaviour change (their tests are the regression net).
5. **Main, llamacpp.** Install (download archive(s) → staging dir → streaming unzip → chmod →
   rename), status (does the binary exist and answer), model download (HF file → `models/gguf/`,
   `event:pull-progress`), HF search handler, minimal start. Cancel and failure delete the staging
   dir before the closing event, so `status` never reports a half-written engine as installed.
6. **Renderer.** `LocalRuntimeCard` becomes per-runtime and `ModelsTab` renders one per registered
   runtime; the install dialog gains the build select; a new panel does HF search → pick file →
   download with the existing progress rendering. All strings via `t()` in
   `{de,en}-settings-runtime.ts`.

Order matters: 1–2 are independent and can run in parallel; 3 gates 4–6.

## Deliverables

- [x] **D1 — Runtime descriptors + generalised plan (core).** `src/core/llm/runtime/descriptors.ts`,
      `runtime/plan.ts`, `src/core/llm/runtime-plan.ts` (wrapper), `src/shared/types/llm.ts`
      (`RuntimeId`, `EngineBuildId`, `RuntimeDownloadPlan`), `src/core/llm/index.ts`,
      `tests/core/llm/runtime/plan.test.ts`. Mirror: `src/core/llm/runtime-plan.ts` (pure, never
      throws, platform passed as data). **Acceptance:** plan per platform × runtime × engine/model,
      the three `blockedReason` values, `freeDiskMb === null` does not block, a model download larger
      than free disk is refused with the number in the result; existing
      `tests/core/llm/runtime-plan.test.ts` green **unedited**.
- [x] **D2 — Engine build selection from the GPU scan (core).** `src/core/llm/runtime/engine-build.ts`,
      `src/shared/types/llm.ts`, `tests/core/llm/runtime/engine-build.test.ts`. **Acceptance:**
      fixtures for NVIDIA / AMD / Intel / Apple / no GPU / `gpuDetection: 'unknown'` with a name /
      scan failed, on win32+darwin+linux; every case yields a build that exists in D1's asset table
      (assert against the table, not a literal), and the "why" string is derivable.
- [x] **D3 — Hugging Face search + file parsing (core).** `src/core/llm/hf/search.ts`,
      `src/core/llm/hf/quant.ts`, `src/core/llm/hf/types.ts`, `src/shared/types/llm.ts`,
      `tests/core/llm/hf/*.test.ts`. Mirror: `src/core/llm/http.ts` (injected `FetchLike`, host-
      sanitised errors). **Acceptance:** fake-fetch fixtures for a search hit, an empty result, a repo
      with mixed `.gguf`/other files, a 401/gated repo and a network error; quantisation parsed from
      ≥6 real filename shapes plus one unparseable; **no test touches the network**.
- [x] **D4 — IPC contract carries the runtime.** `src/shared/ipc.ts`, `src/shared/types/llm.ts`,
      `src/renderer/lib/api.ts`, `src/renderer/lib/mock-bridge.ts`, the IPC coverage test.
      **Acceptance:** the seven channels take/report `RuntimeId`, `llm:searchModelFiles` exists and is
      in the preload allowlist, coverage test and both `tsc` projects green.
- [x] **D5 — `RuntimeInstaller` interface + Ollama adapter (main).** `src/main/ipc/runtime/types.ts`,
      `runtime/registry.ts`, `src/main/ipc/ollama-install.ts`, `ollama-runtime.ts`, `ollama-pull.ts`,
      `src/main/ipc/register-all.ts`. **Acceptance:** every runtime channel dispatches via the registry,
      an unknown `RuntimeId` is rejected with a typed error (never a crash), and
      `tests/main/ipc/ollama-{install,pull,runtime}.test.ts` pass **unedited** apart from the added
      `runtime: 'ollama'` field. → **deliverable-hard**
- [x] **D6 — llama.cpp engine fetch (main).** `src/main/ipc/runtime/llamacpp-install.ts`,
      `runtime/unzip.ts`, `runtime/paths.ts`, `package.json` (+`extract-zip`),
      `tests/main/ipc/runtime/llamacpp-install.test.ts`. Mirror: `src/main/ipc/ollama-install.ts`
      (streamed fetch, per-MB throttled `event:install-progress`, `AbortController` map).
      **Acceptance:** archive + `extraArchives` downloaded as one progress; extraction into a staging
      dir, renamed on success only; cancel and failure remove the staging dir so a following `status`
      reports `absent`; POSIX build gets the exec bit; no shell string anywhere in the path.
      → **deliverable-hard**
- [x] **D7 — llama.cpp status + model file download (main).** `src/main/ipc/runtime/llamacpp-status.ts`,
      `runtime/llamacpp-pull.ts`, `tests/main/ipc/runtime/llamacpp-pull.test.ts`. Mirror:
      `src/main/ipc/ollama-pull.ts`. **Acceptance:** the three status values derived from binary +
      reachable server; a file download reports through `event:pull-progress` with the existing shape;
      a download that exceeds free disk is refused before the first byte with the MB named; cancel
      deletes the partial `.gguf`.
- [x] **D8 — HF search handler (main).** `src/main/ipc/runtime/hf-search.ts`,
      `src/main/ipc/register-all.ts`, `tests/main/ipc/runtime/hf-search.test.ts`. **Acceptance:**
      `llm:searchModelFiles` returns D3's result over an injected fetch; a network failure and a gated
      repo return an honest typed reason instead of throwing; no vault path or user content in any log
      line (guardrail 6).
- [x] **D9 — llama.cpp provider preset + minimal start (main/core).** `src/core/llm/presets.ts`,
      `src/main/ipc/runtime/llamacpp-start.ts`, `src/renderer/i18n/{de,en}-settings-models.ts`
      (`llm.preset.llamacpp.hint`), `tests/core/llm/presets.test.ts`,
      `tests/main/ipc/runtime/llamacpp-start.test.ts`. Mirror: `src/main/ipc/ollama-runtime.ts`
      (injectable `SpawnFn`, detached+unref, poll for readiness). **Acceptance:** the preset appears in
      `llm:presets` as `local`, `canListModels`, `baseUrl http://127.0.0.1:8080/v1`; start spawns with
      argv (never a shell string) and reports a typed failure; no test starts a real process.
- [x] **D10 — Runtime cards, one per runtime (renderer).** `src/renderer/screens/settings/
LocalRuntimeCard.tsx`, `LocalRuntimeInstallDialog.tsx`, `ModelsTab.tsx`,
      `src/renderer/lib/queries/llm.ts`, `src/renderer/i18n/{de,en}-settings-runtime.ts`.
      **Acceptance:** Ollama and llama.cpp each get a card with its own status and hint (llama.cpp's
      says what it is for: GPU offload and context control on weak hardware); the install dialog shows
      the preselected build with a one-line reason and lets it be changed; blocked plans render their
      reason; every string via `t()`, present in both languages, German with `„…“`.
- [x] **D11 — Model search and download panel (renderer).** `src/renderer/screens/settings/
LlamaCppModelPanel.tsx`, `LocalRuntimePullList.tsx` (reuse of its progress row),
      `src/renderer/lib/queries/llm.ts`, `src/renderer/i18n/{de,en}-settings-runtime.ts`.
      **Acceptance:** search field → results with repo, file, size and quantisation → download with
      progress and a working cancel; empty result, gated repo and offline each show their own honest
      state; a refused-for-disk-space download names the number; sentence case, no emoji, tokens only.

### AC coverage

1. llama.cpp in the provider list with a purpose hint → D9 (preset), D10 (card + hint).
2. Channels serve both runtimes, Ollama unchanged → D4 (contract), D5 (registry + adapter).
3. Engine fetch with progress and cancel, no partial install → D6 (+ D1 plan, D7 status).
4. Model fetch reusing the pull progress shape → D7, D11.
5. Free-disk check before either fetch → D1 (judgement), D6/D7 (enforcement), D11 (message).
6. Engine and models outside the vault, in app-owned dirs → D6 `runtime/paths.ts`, D7.
7. No shell string; honest unsupported-platform → D1 (`unsupported-platform`), D6, D9.
8. Works end to end (`llm:probe`, `llm:models`, one real task) → D9 (preset + start), test plan.
9. Fully usable with none of it installed → D10 (absent state), regression tests of D5.
10. No hardcoded renderer string, both languages, `„…“` → D10, D11.
11. Unit tests: plan per platform/runtime, blocked reasons, disk refusal, cancel leaves nothing →
    D1, D2, D6, D7 (and D3 for the network-free HF tests).

## Model Hints

- D5 → **deliverable-hard** — it re-cuts ~700 lines of working Ollama install/pull/status code
  behind a new interface while three existing test files must keep passing unedited; a silent
  behaviour change here breaks the only local runtime users have today.
- D6 → **deliverable-hard** — the "cancel or failure leaves nothing a later status call calls
  installed" invariant spans download, multi-archive sequencing, streaming extraction and a
  staging-dir rename, and a leak there is exactly the bug the AC names.
- All other Ds → default tier.
- Review: → **story-review-hard** — the largest story of the sprint, four layers, a new runtime
  dependency and two guardrails (no shell string, nothing in the vault) that only a reading of the
  whole diff can confirm.

## Test Plan (manual acceptance)

Real acceptance needs a machine where llama.cpp is genuinely absent; on the author's machine steps
1–6 are still checkable (the engine directory can be deleted to reset).

1. `npm run seed && npm run dev`. Open `Settings → Models`. **Expect:** two local runtime cards,
   Ollama and llama.cpp; the llama.cpp card says it is absent and what it is for.
2. Click install on the llama.cpp card. **Expect:** a dialog naming the download size, the target
   directory, and the preselected build with one sentence of reasoning; the build can be changed.
3. Start the download, then cancel it midway. **Expect:** progress moves, cancel returns the card
   to "not installed", and `<userData>/runtimes/llamacpp/` holds no leftover staging directory.
4. Run the download to the end. **Expect:** the card reports installed and names the build.
5. In the model panel, search for `qwen2.5 1.5b gguf`. **Expect:** results with repository, file
   name, size and quantisation; picking a file shows its size before the download starts.
6. Download one small file; cancel a second one midway. **Expect:** progress in the known shape;
   the cancelled file is gone from `<userData>/models/gguf/`; a file larger than the free disk is
   refused with the number named.
7. Start the runtime from the card, then probe the llama.cpp provider and load its models.
   **Expect:** probe green, the downloaded file listed, and one real task (e.g. a dump
   classification) answered by it.
8. Switch UI language to German and walk steps 1–2 again. **Expect:** no English leftovers, no raw
   keys, quotes as `„…“`.
9. Reset (delete the engine directory), restart the app, open every screen. **Expect:** no dead
   screen, the honest "no model configured" state where a task needs a model.

## Done

**Summary.** llama.cpp is now a second local runtime, side by side with Ollama, behind a shared
`RuntimeInstaller` interface. Both runtimes' cards, install dialog (with an overridable,
GPU-scan-preselected build and a translated one-line reason), status, engine fetch, and cancel
all go through the same seven IPC channels plus one new one (`llm:searchModelFiles`). The engine
fetch streams the release archive(s) into a staging directory and only renames it into place on
full success — cancel or failure always leaves `status` reporting `absent`. A model panel searches
Hugging Face anonymously, shows repo/file/size/quantisation, and downloads through the existing
pull-progress shape with a free-disk refusal that names the actual MB figure. Ollama's own three
test files pass unedited apart from the added `runtime: 'ollama'` field.

**Decisions made during implementation (beyond the story's own Decisions section):**
- The engine-build "why" reasoning is a structured `EngineBuildReason` discriminated union
  (`shared/types/llm.ts`), not a composed English sentence — core hands over facts (`gpuName`,
  confidence, requested/actual build), and `LocalRuntimeInstallDialog.tsx`'s `buildReasonText()`
  composes the translated sentence via `t()`. An English sentence rendered as-is inside the German
  dialog would have been the same CLAUDE.md guardrail-7 violation with the languages swapped; the
  first implementation attempt did exactly that and was corrected before review.
- `llm:runtimeInstallPlan` and `llm:downloadRuntime` both gained an optional `buildId` field so the
  install dialog's build select is a real override end to end (re-plans against the chosen build,
  downloads that build), not a cosmetic label next to numbers that still describe the
  GPU-scan-preselected one. An override this platform has no asset for falls back to the derived
  choice rather than producing a broken plan.
- The curated `LLAMACPP_RELEASE_TAG` and asset file names were verified against the real
  `ggml-org/llama.cpp` GitHub releases during the review-fix cycle (pin bumped to `b10603`); macOS
  and Linux ship `.tar.gz`, not `.zip` — a pure-JS `tar` extractor (`untar.ts`) was added alongside
  the existing `extract-zip` path, dispatched per archive's `archiveFormat`. The asset table also
  gained an `arch` dimension (`x64`/`arm64`) for Windows and macOS, since Intel vs. Apple Silicon
  and x64 vs. arm64 Windows genuinely ship different archives — the original single-entry-per-platform
  design would have handed an Apple Silicon Mac an Intel binary.
- A completed engine download now invalidates the runtime-status query when the install dialog
  observes `event:install-progress`'s `done` chunk, so the card reflects "installed" without
  requiring a manual "Erneut prüfen" click — this only matters for llama.cpp (Ollama's own download
  produces an installer, not a finished install) but is harmless for both.
- Known, deliberately deferred limitation: the runtime card does not name *which build* was
  installed after the fact (only `absent`/`installed-stopped`/`running`) — `LocalRuntimeStatus`
  carries no build field, and adding one needs a stored metadata marker next to the engine binary.
  Not required by any of the 11 acceptance criteria; left for a follow-up story if it turns out to
  matter to a real user.

**Verification:**
- `npm run format:check` — red repo-wide on ~550 pre-existing CRLF/LF files (known, unrelated);
  every file this story touched passes `prettier --check` individually.
- `npm run lint` — clean, repo-wide.
- `npm run typecheck` — clean, both `tsconfig.node.json` and `tsconfig.web.json`.
- `npm test` — 213 files / 3061 tests green, including the extended Ollama regression suite,
  every new core/main/renderer test, and the i18n coverage test.
- `npm run build` — green (confirms the new `tar`/`extract-zip` dependencies externalize
  correctly for electron-vite).
- `npm run seed && npm run shot` — 64 screenshots, no console errors. A separate manual Playwright
  `_electron` walkthrough (not part of the repo's screenshot set) confirmed live: both runtime
  cards render with independent status and their own hint; the llama.cpp card's absent state and
  "Jetzt holen" button; the install dialog shows the preselected CUDA build with the translated
  German reason sentence (`„NVIDIA GeForce RTX 4070“ erkannt — verwendet den CUDA (NVIDIA-GPU)-Build.`)
  and the corrected download size.
- Code review (`story-review-hard`): first pass **FAIL** — 9 findings (build-select/blocked-plan/
  status-refresh bugs in the install dialog, a stale code comment, an invented release pin and
  asset names, and no architecture dimension in the asset table). One review-fix cycle, dispatched
  as two parallel agents (renderer dialog fixes; core/main asset-table + arch + tar.gz support,
  verified against the real GitHub releases API). Re-verification after the fix cycle: all gates
  green again (see above); the review's finding 8 (card doesn't name the installed build) was
  accepted as a documented, deferred limitation rather than fixed.
- **Not live-verified: AC 8 (`llm:probe` succeeds, `llm:models` lists what is there, one real task
  runs).** This needs a real multi-hundred-MB download from GitHub, a real Hugging Face model file,
  and a real `llama-server` process answering a real request — outside what this build session can
  responsibly automate (network volume, disk, and no real GPU in this environment). Status is left
  `in-progress`; the story's own Test Plan steps 5–9 already anticipate this and are the manual
  acceptance path.

**Commit message:** `033: llama.cpp is a runtime the app can install`

**Changed files:** `src/core/llm/{index,presets,runtime-plan}.ts`; `src/core/llm/runtime/{descriptors,plan,engine-build}.ts` (new); `src/core/llm/hf/{search,quant,types}.ts` (new); `src/shared/{ipc,types/llm}.ts`; `src/renderer/lib/{api,mock-bridge,pullStore}.ts`; `src/renderer/lib/queries/{llm,keys,hf-search}.ts`; `src/renderer/screens/settings/{LocalRuntimeCard,LocalRuntimeInstallDialog,LocalRuntimePullList,ModelsTab,LlamaCppModelPanel}.tsx`; `src/renderer/i18n/{de,en}-settings-{models,runtime}.ts`; `src/main/ipc/{llm-detect,machine-scan,ollama-install,ollama-pull,ollama-runtime,register-all}.ts`; `src/main/ipc/runtime/{types,registry,llamacpp-install,llamacpp-fetch,llamacpp-pull,llamacpp-status,llamacpp-start,hf-search,paths,engine-fs,unzip,untar}.ts` (new dir); `package.json`/`package-lock.json` (+`extract-zip`, +`tar`); plus the corresponding new/updated test files under `tests/core/llm/`, `tests/main/ipc/` and `tests/renderer/`.
