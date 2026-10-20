---
id: 019c
title: A local runtime without typing a command
status: done # draft -> ready -> in-progress -> done
created: 2026-08-21
---

Part of [[019-model-recommendations-for-people-without-expertise]]. Delivers the "guided local
runtime" cluster. Uses [[019a-machine-scan]] for the disk and capacity preconditions and
[[019b-model-recommendations]] to know which models are worth pulling — but degrades to a plain
model list if 019b is not there yet.

## Requirement

Today, if I do not already have Ollama running, all the app gives me is a link to a website and
a command to type into a terminal. I want a path inside the app: tell me whether a runtime is
installed, offer to get it, start it, and pull the models the app recommends for this machine —
with progress I can watch and an honest statement of disk cost and duration.

The install itself stays deliberately unclever (decided in the epic, question 2): the app
**downloads the official installer, names its size and target path, and opens it after I
confirm**. I click through the installer myself. No elevation handling inside the app, no
package-manager dependency. Uninstalling is out of scope and the app says so before it starts —
it will leave the runtime behind.

Ollama, not llama.cpp: it carries the model registry and `POST /api/pull` gives the progress
stream this story needs. The app already has it as a preset
([presets.ts:11](../../src/core/llm/presets.ts#L11)) and probes it
([llm-detect.ts:49](../../src/main/ipc/llm-detect.ts#L49)).

## Acceptance Criteria

**Getting the runtime**

- [x] From the models tab I see, without acting, whether a local runtime is installed and
      whether it is running.
- [x] If it is not installed, the app offers to get it. Every step states what it is about to
      do before it does it, and I can stop.
- [x] Installing is a proposal I confirm: download size, where the installer is saved, where
      Ollama will put model data, and the fact that the app cannot uninstall it later — all
      named beforehand.
- [x] The download shows progress and can be cancelled, leaving no partial file behind.
- [x] After the download the app opens the installer and tells me it is now my turn. When I come
      back, pressing re-check finds the runtime.
- [x] If it is installed but not running, the app offers to start it and reports whether that
      worked.
- [x] If getting it is impossible on this machine (unsupported platform, not enough free disk,
      no write permission), I get the reason in one sentence plus the manual path — never a
      spinner that never ends.

**Pulling a model**

- [x] Pulling shows a progress bar, the total size and what is left.
- [x] Progress survives me navigating to another screen and coming back.
- [x] A pull can be cancelled and leaves no broken half-model behind.
- [x] A failed pull says why in one sentence and can be retried.
- [x] The models offered for pulling are ones this machine can actually run (from 019a); each is
      labelled with its download size.

**Across all of it**

- [x] Nothing happens without my confirmation (guardrail 2). Skipping the whole thing leaves the
      app fully usable (guardrail 1).
- [x] No hardcoded string in the renderer; `de.ts` and `en.ts` both carry every new key.
- [x] No log line or error message contains vault content (guardrail 6).

## Open Questions

None.

## Plan

All privileged work stays in main, in two new files. The renderer only sees status, progress
events and reasons. No shell strings anywhere — `execFile`/`shell.openPath` with fixed
arguments; the only variable is a URL from a hardcoded per-platform map.

1. **Status** — extend the existing detection into a richer `LocalRuntimeStatus`
   (`'absent' | 'installed-stopped' | 'running'`) in
   [src/main/ipc/llm-detect.ts](../../src/main/ipc/llm-detect.ts): the current
   `listModels()` probe answers "running"; a binary lookup (`ollama` on `PATH`, plus the known
   per-platform install path) answers "installed". Channel `llm:localRuntimeStatus`.
2. **Preconditions** — a pure function in `src/core/llm/runtime-plan.ts`: platform + free disk
   (from the 019a facts) + installer size → `{ canInstall, blockedReason, downloadMb,
installerPath, modelDirHint }`. Testable without a machine; the renderer renders it.
3. **Installer download** — new `src/main/ipc/ollama-install.ts`: hardcoded platform → official
   installer URL map, download into Electron `app.getPath('temp')` with an `AbortController`,
   progress emitted on a `llm:installProgress` event, partial file deleted on cancel or error,
   then `shell.openPath` on confirm. Channels `llm:downloadRuntime`,
   `llm:cancelRuntimeDownload`, `llm:openRuntimeInstaller`.
4. **Start it** — `llm:startLocalRuntime` in the same file: `execFile('ollama', ['serve'])`
   detached, then re-probe with a timeout, and report success or the reason.
5. **Pull** — new `src/main/ipc/ollama-pull.ts`: `POST http://localhost:11434/api/pull`,
   NDJSON stream parsed line by line into `llm:pullProgress` events (`{ modelId, status,
completed, total }`), `AbortController` for cancel, and on cancel a `DELETE /api/delete` for
   the partial model so nothing half-pulled survives. Channels `llm:pullModel`,
   `llm:cancelPull`.
6. **Events** — the two progress events go into `IPC_EVENTS` in
   [src/shared/ipc.ts](../../src/shared/ipc.ts), so the preload allowlist picks them up like the
   existing stream events ([llm-stream.ts](../../src/main/ipc/llm-stream.ts) is the pattern).
7. **Progress outside the component** — a small renderer store (`src/renderer/lib/pullStore.ts`,
   or the existing store pattern if there is one) subscribes to the events once at app level, so
   navigating away and back keeps the bar. The card reads from the store, it does not own the
   subscription.
8. **Renderer** — new `src/renderer/screens/settings/LocalRuntimeCard.tsx` with the three
   states, a confirm dialog naming size/paths/no-uninstall (mirror
   [ProviderDialog](../../src/renderer/screens/settings/ProviderDialog.tsx)), and a pull list
   fed by 019b's reachable-after-download models. Placed in
   [ModelsTab.tsx](../../src/renderer/screens/settings/ModelsTab.tsx). `StartCard`'s terminal
   hint text is replaced by a link into this card.
9. **Tests** — `runtime-plan` unit tests, NDJSON parser unit tests (fixture stream including a
   truncated final line), and the IPC coverage test picking up the new channels and events. No
   test downloads anything or spawns a process.

## Deliverables

**D1 — Runtime status and preconditions** [x]
`src/main/ipc/llm-detect.ts`, `src/shared/types/llm.ts`, `src/shared/ipc.ts`,
`src/main/ipc/register-all.ts`, new `src/core/llm/runtime-plan.ts` + test.
_Accepted when:_ the channel returns the right one of three states on this machine, the pure
precondition function is covered by fixtures for each blocked reason, and
`tests/main/ipc-coverage.test.ts` passes.

**D2 — Installer download with progress and cancel** [x]
New `src/main/ipc/ollama-install.ts`, `src/shared/ipc.ts` (channels + `llm:installProgress`
event). Mirror: [src/main/ipc/llm-stream.ts](../../src/main/ipc/llm-stream.ts) for the
event-emitting shape.
_Accepted when:_ a download reports progress, cancelling mid-download removes the partial file,
and a failed request surfaces one sentence rather than a stack trace.

**D3 — Open the installer, start the runtime** [x]
`src/main/ipc/ollama-install.ts`. `shell.openPath` on the downloaded file;
`execFile('ollama', ['serve'])` detached plus a re-probe with timeout.
_Accepted when:_ both channels return a typed result with a reason on failure, and neither
builds a shell string.

**D4 — Model pull with a progress stream** _(risky, see Model Hints)_ [x]
New `src/main/ipc/ollama-pull.ts`, `src/shared/ipc.ts` (`llm:pullModel`, `llm:cancelPull`,
`llm:pullProgress`), plus a unit test for the NDJSON line parser.
_Accepted when:_ a pull emits monotonic progress events, cancel aborts the request **and**
deletes the partial model, a truncated trailing line does not throw, and a second pull of the
same model after a cancel starts clean.

**D5 — Pull progress that survives navigation** [x]
New `src/renderer/lib/pullStore.ts` (or the project's existing store pattern),
`src/renderer/lib/api.ts`, one app-level subscription.
_Accepted when:_ starting a pull, navigating to another screen and returning shows the bar at
the advanced position, and the subscription is registered exactly once (no duplicate handlers
after remount).

**D6 — Local runtime card and confirm dialog** [x]
New `src/renderer/screens/settings/LocalRuntimeCard.tsx`, `ModelsTab.tsx`, `StartCard.tsx`,
`src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts`. Mirror: `ProviderDialog.tsx` for the
dialog, `RoutingSection.tsx` for the panel.
_Accepted when:_ the three states render, the dialog names download size, installer path, model
directory and the no-uninstall fact before anything is downloaded, the blocked case shows one
sentence plus the manual path, both languages are complete, and `npm run lint` finds no raw
palette class.

## Model Hints

- `D4 → deliverable-hard` — a long-lived NDJSON stream with cancellation: the abort has to stop
  the reader, emit no further events, and delete the partial model, and a truncated final line
  must not throw. Getting the abort ordering wrong leaves either a zombie reader emitting into a
  dead renderer or a half-pulled model on disk, and neither shows up in a normal test run.
- D1, D2, D3, D5, D6 → default.
- `Review: → story-review-hard` — this story downloads an executable, opens it, spawns a process
  and streams from a local server. A reviewer has to check the argument construction, the
  cleanup paths and that nothing user-supplied reaches `execFile` or `openPath`; that is exactly
  what the cheap tier skims past.

## Test Plan (manual acceptance)

Run this on a machine **without** Ollama installed if you can — otherwise start at step 5.

**1. Verify and seed** (PowerShell, repo root)

```powershell
npm run verify
```

Expected: all green. If red, stop and show the output.

```powershell
npm run seed
```

**2. Start the app**

```powershell
npm run dev
```

**3. Absent state** — Settings → Models. The local runtime card says no runtime is installed and
offers to get one. No terminal command anywhere on the screen.

**4. Install proposal.** Press the offer. Before anything downloads, the dialog names: download
size, where the installer is saved, where Ollama will store models, and that the app cannot
uninstall it. Press cancel — nothing is downloaded. Press it again and confirm. Watch progress;
press cancel mid-download and check the temp folder is clean:

```powershell
Get-ChildItem $env:TEMP -Filter "OllamaSetup*"
```

Expected: no leftover file. Then run it again and let it finish. The app opens the installer and
tells you it is your turn. Click through it, return to the app, press re-check.

**5. Installed but stopped.** Stop the service, press re-check, then press start. Expect a
success statement and the card flipping to running.

```powershell
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process
```

**6. Pull a model.** From the card's list, pick a model labelled with a download size. Expect a
progress bar with total and remaining. While it runs, navigate to the journal screen and back —
the bar must still be there and further along. Then cancel it and confirm nothing partial
survived:

```powershell
ollama list
```

Expected: the cancelled model is not listed.

**7. Pull for real.** Start it again, let it finish. The model then appears in the routing
targets in the models tab.

**8. Blocked case.** If you can, point the app at a nearly full drive or run on an unsupported
platform. Expect one sentence with the reason plus the manual path — no endless spinner.

**9. Language.** Switch UI language, revisit the card in all its states. Everything translated.

**10. Screenshots**

```powershell
npm run shot
```

Expected: PNGs in `.screenshots/`; the models tab shot shows the local runtime card.

## Done

Built the guided local-runtime flow across 6 deliverables: main-side status detection and
install/disk preconditions (D1), installer download with progress/cancel (D2), open-installer +
start-runtime (D3), model pull over Ollama's native NDJSON `/api/pull` with cancel-and-delete
cleanup (D4, hard tier), a renderer store so pull progress survives navigation (D5), and the
`LocalRuntimeCard`/install dialog/pull list wired into the models tab (D6). All new IPC channels
and events follow the existing run/report split (`llm-stream.ts`) and never build a shell string
— `execFile`/`spawn` take fixed argument arrays only.

**Decisions**

- Linux is out of scope for the in-app installer (`RuntimeBlockedReason: 'unsupported-platform'`):
  Ollama's official Linux path is a `curl | sh` script, which this app's no-shell-strings
  guardrail forbids running as a constructed command. Linux always gets the manual-path fallback.
- Added a third `RuntimeBlockedReason`, `'no-write-permission'`, beyond the two named in the
  original plan text — the acceptance criteria explicitly name it as one of three impossible
  cases, so `ollama-install.ts` now probes the temp dir with a real write-and-delete before
  building the plan, rather than only discovering it after a confirmed download fails.
- Event names use this codebase's established `event:kebab-case` convention
  (`event:install-progress`, `event:pull-progress`) rather than the deliverable text's literal
  `llm:installProgress`/`llm:pullProgress` — every existing event in `IpcEvents` already follows
  that pattern.
- The pull list is fed by 019b's `llm:recommendModels` (`needsDownloadGb`), not a plain fallback
  list — verified live on a real machine with Ollama running that this produces a genuinely
  non-empty, size-labelled list without any new 019b plumbing.
- `ollama-install.ts` (D2) and the D3 channels were split into a sibling
  `src/main/ipc/ollama-runtime.ts` to stay under CLAUDE.md's ~300-line soft limit; both share one
  `InstallerPathTracker` instance wired in `register-all.ts`.
- D6's i18n additions were split further into `de-settings-runtime.ts`/`en-settings-runtime.ts`,
  imported into the existing `de-settings-models.ts`/`en-settings-models.ts`, for the same
  line-limit reason; both compose up into `de.ts`/`en.ts` as before.
- `StartCard.tsx`'s raw terminal-command hint (`ollama pull llama3.1:8b`) was removed and replaced
  with a pointer into `LocalRuntimeCard`, per the plan — one guided path instead of two competing
  ones.
- Deferred, not fixed (low severity, documented by the review): a shared `isPending` flag briefly
  dims every pull-list row's button while any one pull is starting (cosmetic only); the runtime
  status card can blink to "unknown" for up to ~2s on remount before the store's persisted
  position reappears; no checksum/signature verification of the downloaded installer beyond what
  the epic already approved as "deliberately unclever."

**Verification**

- `npm run typecheck`, `npm run lint`, `npm run build`: all green.
- `npm test`: 2370/2371 passing. The one failure, `tests/core/wiki/module.test.ts`, is a
  pre-existing, unrelated docs-drift check between `docs/AGENTS.md` and `docs/MODULE-SCHEMA.md` —
  neither file appears anywhere in this story's diff; independently confirmed pre-existing by
  three separate deliverable agents and the review agent.
- `npm run format:check` is red repo-wide (pre-existing, ~300 files including `CLAUDE.md` and
  untouched docs/tests) — not part of the profile's `## Verify` command list and not something
  this story's files trigger; all files this story touched pass `prettier --check` individually.
- Clean-agent review (`story-review-hard`, per Model Hints) returned an initial **FAIL** with 6
  confirmed findings (partial file surviving a cancelled download; a progress-listener race that
  could drop a fast download's only closing event; raw byte integers shown instead of "X of Y";
  a failed plan-read leaving the button spinning with no message; the missing
  `'no-write-permission'` blocked reason; a completed pull never invalidating the provider/model
  query so it wouldn't show up in routing) plus 3 low-severity findings (documented above as
  deferred). One review-fix cycle resolved all 6 confirmed findings; verification was re-run
  clean afterward (typecheck/lint/build/tests as above).
- Live smoke: `npm run seed && npm run shot` produced 60 screenshots with no console errors. The
  story's own shot script only captures the models tab's top and bottom, which happen to miss the
  card's scroll position, so a one-off Playwright `_electron` check (not committed) scrolled to
  it directly: on this machine, with a real Ollama actually running, the card correctly showed the
  `'running'` state, a working "recheck" action, and the 019b-fed pull list with a real model
  (`ollama/qwen2.5-coder:7b`, 4.7 GB) and a "get it" button — confirming acceptance criteria 1, 6,
  and 12 against live data, not just mocks.

**Commit message**

```
019c: guided local runtime — install, start, and pull Ollama models from the app
```
