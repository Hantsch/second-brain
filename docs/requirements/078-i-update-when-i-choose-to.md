---
id: 078
title: I update when I choose to
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

[[077]] knows an update exists; the user has to be able to see that and act on it — or not. An app
that updates itself behind the user's back interrupts a capture or a running import, and an app
that only mentions it in a settings tab nobody opens is one nobody updates. The middle is a single,
calm control in the app shell ([AppShell.tsx](../../src/renderer/components/AppShell.tsx)), visible
from every screen, that appears only when there is something to update and says what it is.

The user decides both _whether_ and _when_. On the installed build, choosing to update downloads the
release and then waits — Gaston restarts into the new version only on a second, deliberate
confirmation. On the portable build there is nothing to install in place: the same control opens
the release page in the system browser instead. Dismissing leaves Gaston running exactly as before;
nothing nags again in the same session.

One hard rule: Gaston never restarts itself out from under work the user can see — a task in the
shared queue (maintenance, imports, ingests) or an LLM response being written.

Reference: `../q2-launcher` story 098 (`src/main/services/update/service.ts`, `PendingUpdate.tsx`).

## Acceptance Criteria

- [ ] **AC1** — When [[077]]'s state says an update is available, an update control appears in the
      app shell; when no update is available it is not there at all.
- [ ] **AC2** — The control names the available version before the user commits to anything, and
      offers a way to see what changed ([[079]]'s notes).
- [ ] **AC3** — On the installed build, starting the update downloads the release with visible
      progress, and Gaston stays fully usable while it downloads.
- [ ] **AC4** — A running download can be cancelled; the installed app stays untouched.
- [ ] **AC5** — Nothing is installed and nothing restarts until the user confirms a second time,
      after the download has finished.
- [ ] **AC6** — Dismissing the update leaves Gaston running unchanged and does not show the prompt
      again in the same session; the update stays reachable from About ([[079]]).
- [ ] **AC7** — Install-and-restart is refused, with a readable reason, while a queued task is
      running or an LLM response is streaming — it does not abort either.
- [ ] **AC8** — A failed download (offline, checksum mismatch) leaves the installed app untouched
      and says why, with the update still offerable afterwards.
- [ ] **AC9** — On the portable build the control does not download anything; it opens the
      release's page in the system browser through the existing `shell:openExternal` path.
- [ ] **AC10** — After a successful restart Gaston runs the new version and the update control is
      gone (automated half; the real restart is manual residue).

## Open Questions

## Decisions (Sprint)

Planned against [[077]]'s stated intent (its refine runs concurrently). Wherever this story says
"077's service / state type / channel prefix / hook", the build uses 077's real, committed names;
the names below are placeholders for that layout, not a second one.

### Contract and main

- **This story extends 077's update service, state type and channel domain** instead of adding a
  second update module — one truth about "is there an update" (reference: Q2 098, same rule).
- **One derived `phase`** (`idle | checking | available | downloading | downloaded | error`) is the
  only field the control reads — so the control can never contradict 077's check `status`.
- **New channels** `update:download`, `update:cancelDownload`, `update:installAndRestart`,
  `update:dismiss` (or 077's prefix), all void input, all answered as an outcome with an error key —
  main sends keys, never prose, so both UI languages work (guardrail 7).
- **The restart guard is authoritative in main** (`installAndRestart` refuses with
  `update.error.taskRunning` / `update.error.llmStreaming` / `update.error.notReady`); the renderer
  only mirrors it — a disabled button must never be the only thing between work and a restart.
- **"A queued task is running" means `getWorkQueue(services).list().some(state === 'running')`** —
  the exact check `close-guard.ts` already uses; queued-but-not-started tasks do not block, because
  close-guard already treats them as safely droppable. Gardener runs are covered: they register a
  `gardener` task on the same queue.
- **That check is extracted into one helper** (`hasRunningTask` in `src/main/work-queue.ts`) and
  close-guard switches to it — a second inline copy would be the duplication refine must prevent.
- **"An LLM response is streaming" gets a module-level registry in `src/main/ipc/llm-stream.ts`**
  (`isAnyLlmStreaming()`): today each `llmStreams()` call site owns a private map, so nothing can
  answer the question globally. Model pulls and llama.cpp installs are not covered — AC7 names
  queued tasks and LLM responses, and those two are neither.
- **`autoInstallOnAppQuit = false`**, enforced in the service — left at electron-updater's default,
  a downloaded update installs on the next ordinary quit and AC5's second confirmation means nothing.
- **The download is not a work-queue task** — it would trip AC7's own "a queued task is running"
  guard and make install-and-restart refuse itself; its progress lives in the update state.
- **A failed or cancelled download falls back to `available` carrying the reason** (`offline`,
  `checksum`, `cancelled`, `unknown`) — nothing on disk changed, so the update stays offerable (AC8).
- **Dismissal is in-memory in main** (`dismissed`, reset on app start), never persisted — a renderer
  reload must not resurrect the prompt, and a decision scoped to one session must not outlive it.
- **Dismissal hides the shell control for the session** (unlike Q2, which kept the button) — AC6
  says the prompt is not shown again and names About ([[079]]) as the way back.
- **Portable: `update:download` is refused (`update.error.notInstallable`)** and the control opens
  the release page instead — the portable exe has nothing to install in place (AC9).
- **The release page URL is derived in main** from one constant (`Hantsch/second-brain`, matching
  076's publish config) plus the version: `https://github.com/Hantsch/second-brain/releases/tag/v<version>`,
  carried in the state as `releaseUrl` — the renderer never builds URLs and opens it through the
  existing `shell:openExternal` (its http/https allowlist already admits it).
- **Install goes through the normal quit path** — `quitAndInstall` triggers `before-quit`, so
  close-guard marks the quit as under way and close-to-tray does not swallow it; if a task starts in
  the gap between guard and quit, close-guard's existing veto dialog is the second safety net.

### Renderer

- **The control sits in the title bar, left of the capture button** — the title bar is on every
  screen (AppShell) and is where app-level, not screen-level, actions live; the rail foot is
  navigation.
- **The control is a compact sentence-case button naming the version** ("Update 0.4.0") — AC2
  wants the version visible before any commitment, and an icon alone would not say it.
- **It opens the existing `Dialog` atom, not a new popover primitive** — Gaston has no popover
  atom, and a dialog already brings focus trap, Escape and focus return.
- **One reusable `UpdateAction` component** renders exactly one primary action per phase (download →
  progress + cancel → restart and install → refusal/error reason; portable: open release page) — so
  [[079]]'s About reuses it instead of building a second one (sprint note: 079 reuses 078's action).
- **The second confirmation is the "Restart and install" button that only exists in `downloaded`**
  — the first click downloads, the second, separate click after completion installs (AC5); no
  extra confirm dialog on top.
- **"What changed" navigates to Settings → About** ([[079]]'s surface) — 079 owns notes rendering;
  the dialog is not a document viewer.
- **A shared `ProgressBar` atom is extracted** from the two hand-rolled `role="progressbar"`
  copies (RunStrip, TaskRow) before the update control adds a third.
- **No new `verify:ui` screen**: the harness runs demo mode, where 077 forbids checks, so the
  control cannot appear there; the dialog is the already-audited `Dialog` atom, and accessible
  names are asserted in the renderer test.

### Verification

- **An env seam `SB_E2E_UPDATE_FIXTURE`** (mirroring `SB_E2E_FETCH_FIXTURE`) swaps the network
  half of the update backend (check, download, `quitAndInstall`) for a fake that reads a JSON file
  **on every call** — the spec rewrites the file between steps; every transition and both refusals
  run through the real service. It also overrides 077's "unpackaged / demo → no check" gate and
  the distribution. If 077 already adds such a seam, this story extends it instead.
- **AC10's real restart is manual residue** — proving the relaunch needs a packaged NSIS install and
  a published release; 077 disables the updater in the unpackaged build every test drives.

## Plan

[[077]] holds the knowledge (version, notes, distribution, manual check). This story adds the act:
staged actions in main behind a restart guard, a title-bar control that drives them, and an offline
fake backend so the whole flow is provable end to end.

1. **Restart blocker (D1, main).** `hasRunningTask(services)` extracted into `work-queue.ts` (close-guard
   uses it), a global `isAnyLlmStreaming()` in `llm-stream.ts`, and `restartBlocker(services)`
   returning `'taskRunning' | 'llmStreaming' | null`.
2. **Staged actions (D2, main + contract).** 077's state gains `phase`, `progress`, `dismissed`,
   `downloadError`, `releaseUrl`; 077's service gains `startDownload` / `cancelDownload` /
   `installAndRestart` / `dismiss` over an `UpdateBackend` seam (electron-updater adapter:
   `downloadUpdate` with cancellation, `quitAndInstall`, `autoInstallOnAppQuit = false`). Four
   channels in `src/shared/ipc.ts`, handlers in 077's IPC file, state pushed via 077's event.
3. **E2E seam (D3, main + fixture).** `SB_E2E_UPDATE_FIXTURE` fake backend + `updateFixture` option
   in `tests/e2e/fixtures/app.ts`.
4. **ProgressBar atom (D4, renderer, no behaviour change).** Extract from RunStrip / TaskRow.
5. **Update control (D5, renderer).** `UpdateAction` + `UpdateControl` (title-bar button + Dialog),
   api wrappers, `de-update.ts` / `en-update.ts`.
6. **E2E proof (D6).** `update-installed.spec.ts` and `update-portable.spec.ts`.

Order: D1 → D2 → D3 → D4 → D5 → D6 (D4 is independent and may run any time before D5).

## Deliverables

- **D1 — Restart blocker (main).** In `src/main/work-queue.ts` add `hasRunningTask(services):
boolean` = `getWorkQueue(services).list().some((t) => t.state === 'running')` and switch the
  inline copy in `src/main/close-guard.ts` (~L130) to it (behaviour unchanged). In
  `src/main/ipc/llm-stream.ts` add a module-level `Set<string>` of active message ids, filled in
  `begin` and emptied in `end` (alongside the existing per-instance `running` map), exported as
  `isAnyLlmStreaming(): boolean` — needed because chat (`ipc/chat.ts:104`) and journal
  (`ipc/journal.ts:218`) each own a private `llmStreams()` instance. New
  `src/main/update/restart-blocker.ts` (or inside 077's update directory) exporting
  `restartBlocker(services): 'taskRunning' | 'llmStreaming' | null`, task check first. Tests:
  `tests/main/restart-blocker.test.ts` › "a running task blocks the restart", › "a streaming LLM
  response blocks the restart", › "a queued-but-not-running task does not block", › "nothing
  running means no blocker"; existing `tests/main/close-guard.test.ts` stays green unchanged.
- **D2 — Staged update actions and the restart guard (main + contract).** Extend 077's shared
  update state type with `phase: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' |
'error'` (derived in one function from 077's `status` + download stage), `progress: { ratio:
number | null; bytesDone: number; bytesTotal: number | null } | null`, `dismissed: boolean`,
  `downloadError: string | null` (an i18n key), `releaseUrl: string | null`. Extend 077's update
  service with: `startDownload()` (only from `available`; refuses `update.error.notInstallable` on
  the portable build; progress pushed through 077's state event), `cancelDownload()` (aborts via
  electron-updater's `CancellationToken`, lands in `available` with `downloadError
update.error.download.cancelled`), `installAndRestart()` (refuses `update.error.notReady` unless
  `downloaded`, then `restartBlocker(services)` from D1 → `update.error.taskRunning` /
  `update.error.llmStreaming`; never cancels or aborts anything; only then `backend.quitAndInstall()`),
  `dismiss()` (in-memory `dismissed = true`, reset on start). Download failures map to
  `update.error.download.offline | checksum | cancelled | unknown` and return to `available`.
  `releaseUrl` = `https://github.com/Hantsch/second-brain/releases/tag/v<version>` from one constant.
  `UpdateBackend` interface (`download(signal, onProgress)`, `quitAndInstall()`,
  `autoInstallOnAppQuit`) with the electron-updater adapter next to 077's checker; the service sets
  `autoInstallOnAppQuit = false` on construction and before each download. Make sure
  `quitAndInstall` reaches `before-quit` so `close-guard.ts`'s `quitting` flag stops close-to-tray
  from hiding the window instead of quitting. Contract: four void channels in `src/shared/ipc.ts`
  (+ `IPC_CHANNELS`), handlers in 077's `src/main/ipc/update.ts` (or equivalent), registered in
  `register-all.ts`; `tests/main/ipc-coverage.test.ts` must stay green. Mirror the guard-then-error
  shape of `../q2-launcher/src/main/services/update/service.ts` `installAndRestart` (L699).
  Tests in `tests/main/update-actions.test.ts` with a fake backend: › "download reports progress
  and ends in downloaded", › "cancel returns to available and installs nothing", › "a failed
  download returns to available with its reason", › "install is refused before the download
  finished", › "install is refused while a task runs or an LLM streams and cancels neither", ›
  "a downloaded update does not install itself on quit" (`autoInstallOnAppQuit === false`), ›
  "download is refused on the portable build", › "dismiss is session-only".
- **D3 — Offline update fixture (main + e2e fixture).** New `src/main/update/update-e2e-fixture.ts`
  (mirror `src/main/ipc/fetch-e2e-fixture.ts`): env `SB_E2E_UPDATE_FIXTURE` names a JSON file `{
distribution: 'installed' | 'portable', latest: { version, notes } | null, download: { ticks,
tickMs, outcome: 'ok' | 'offline' | 'checksum' } }`, **re-read on every check and download
  call**; provides a fake checker + fake `UpdateBackend` for 077's service, marks the service
  supported despite unpackaged/demo, honours the abort signal per tick, and records
  `quitAndInstall` calls on `globalThis.sbUpdateInstallCalls` (readable via `app.evaluate`). Unset
  = zero behaviour change, never throws. Wire it where 077 constructs the service. Add
  `updateFixture?: object` to `tests/e2e/fixtures/app.ts` `AppOptions` (write the JSON into the
  spec's temp dir, pass the env like the fetch fixture). If 077 already ships an update seam, extend
  that instead of adding this file. Test: `tests/main/update-fixture-seam.test.ts` (mirror
  `fetch-fixture-seam.test.ts`) › "unset means the real backend", › "the file is re-read per call".
- **D4 — `ProgressBar` atom (renderer, no behaviour change).** New
  `src/renderer/atoms/ProgressBar.tsx` (track + fill span, `role="progressbar"`, `aria-label`,
  `aria-valuenow/min/max`, optional `className`s so callers keep their CSS; `value: null` =
  indeterminate, no `aria-valuenow`), styled only via existing tokens. Replace the hand-rolled
  copies in `src/renderer/components/RunStrip.tsx` (~L148) and
  `src/renderer/screens/tasks/TaskRow.tsx` (~L103) keeping their class names and DOM. Test:
  `tests/renderer/atoms/ProgressBar.test.tsx` › "renders value and accessible name", ›
  "indeterminate omits aria-valuenow"; existing RunStrip/TaskRow tests stay green.
- **D5 — Title-bar update control (renderer).** New `src/renderer/components/update/UpdateAction.tsx`
  (props: the update state; exactly one primary action per phase — `available`: "Download update"
  (installed) or "Open release page" (portable, `api.shell.openExternal(state.releaseUrl)`);
  `downloading`: `ProgressBar` (D4) + "Cancel"; `downloaded`: "Restart and install"; a refusal or
  `downloadError` key rendered as a readable reason under the action; exported for [[079]]'s
  About) and `src/renderer/components/update/UpdateControl.tsx` (renders nothing unless `phase` is
  `available | downloading | downloaded` and not `dismissed`; a small `Button` "Update <version>"
  with `data-testid="update-control"`, opening the `Dialog` atom with the version, a "What changed"
  link to Settings → About, `UpdateAction`, and a "Not now" that calls dismiss). Insert in
  `src/renderer/components/TitleBar.tsx` left of the capture button, `sb-no-drag`. Typed wrappers
  in `src/renderer/lib/api.ts` (+ `src/renderer/lib/mock-bridge.ts` entries); state via 077's
  renderer hook. New `src/renderer/i18n/de-update.ts` / `en-update.ts` (`update.*`, incl. every
  `update.error.*` key from D2; German with „…“), registered in `de.ts` / `en.ts`. Tokens and
  atoms only, sentence case, one accent. Test: `tests/renderer/update-control.test.tsx` › "no
  control when idle or dismissed", › "the control names the version", › "one primary action per
  phase", › "a refusal shows its reason", › "portable opens the release page and downloads
  nothing", › "every update.error key has a translation in both languages".
- **D6 — End-to-end proof.** New `tests/e2e/update-installed.spec.ts` (`updateFixture`
  installed, `SB_E2E_TASKS_FIXTURE` for a running task, fake provider with high `latencyMs` for a
  streaming ask; mirror `tests/e2e/quit-during-run.spec.ts` for task handling and
  `tests/e2e/reader.spec.ts:151` for `app.evaluate` recorders) and
  `tests/e2e/update-portable.spec.ts` (`updateFixture` portable; stub `shell.openExternal` via
  `app.evaluate` and assert the URL). Test names exactly as in `## Acceptance Tests`.

## Model Hints

- D2 → `deliverable-hard` — this is the only code path that can quit Gaston and overwrite its own
  installation: the guard must read the work queue and the LLM stream registry without cancelling
  either, a missed `autoInstallOnAppQuit = false` silently installs on the next ordinary quit
  (past AC5), and `quitAndInstall` has to pass close-guard / close-to-tray without being swallowed
  or vetoed into a hidden window.
- D1, D3, D4, D5, D6 → default.
- Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/update-installed.spec.ts` › "no control while up to date; the control
  appears once an update is available" (D6); unit `tests/renderer/update-control.test.tsx` › "no
  control when idle or dismissed" (D5).
- AC2 → e2e `tests/e2e/update-installed.spec.ts` › "the control names the version and links to
  what changed" (D6); unit `tests/renderer/update-control.test.tsx` › "the control names the
  version" (D5).
- AC3 → e2e `tests/e2e/update-installed.spec.ts` › "the download shows progress and Gaston stays
  usable" (D6) — progress advances while the spec navigates to another screen and back.
- AC4 → e2e `tests/e2e/update-installed.spec.ts` › "a running download can be cancelled and
  installs nothing" (D6); unit `tests/main/update-actions.test.ts` › "cancel returns to available
  and installs nothing" (D2).
- AC5 → e2e `tests/e2e/update-installed.spec.ts` › "a finished download installs nothing until
  the second confirmation" (D6) — `sbUpdateInstallCalls` empty after download, one entry after
  "Restart and install"; unit `tests/main/update-actions.test.ts` › "install is refused before the
  download finished" and › "a downloaded update does not install itself on quit" (D2).
- AC6 → e2e `tests/e2e/update-installed.spec.ts` › "dismissing hides the prompt for the session"
  (D6) — dismiss, reload the renderer, control absent, nothing installed; unit
  `tests/main/update-actions.test.ts` › "dismiss is session-only" (D2). "Reachable from About" is
  [[079]] AC2's test.
- AC7 → e2e `tests/e2e/update-installed.spec.ts` › "install is refused while a task runs or an LLM
  response streams" (D6) — reason visible, the IPC error key asserted, task and stream still
  running afterwards; unit `tests/main/update-actions.test.ts` › "install is refused while a task
  runs or an LLM streams and cancels neither" (D2) and `tests/main/restart-blocker.test.ts` (D1).
- AC8 → e2e `tests/e2e/update-installed.spec.ts` › "a failed download says why and stays
  offerable" (D6) — `offline` and `checksum` outcomes, then a successful retry; unit
  `tests/main/update-actions.test.ts` › "a failed download returns to available with its reason"
  (D2).
- AC9 → e2e `tests/e2e/update-portable.spec.ts` › "the portable build opens the release page and
  downloads nothing" (D6); unit `tests/main/update-actions.test.ts` › "download is refused on the
  portable build" (D2), `tests/renderer/update-control.test.tsx` › "portable opens the release
  page and downloads nothing" (D5).
- AC10 → e2e `tests/e2e/update-installed.spec.ts` › "once the running version is the latest, the
  control is gone" (D6) — fixture rewritten to the running version, manual check via 077's channel,
  control absent. **manual residue:** that the restart really relaunches into the new build needs a
  packaged NSIS install plus a published GitHub release, and 077 disables the updater in the
  unpackaged build every test drives — walked once by hand against 076's first release.

## Done
