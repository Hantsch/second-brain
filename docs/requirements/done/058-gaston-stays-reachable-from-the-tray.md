---
id: 058
title: Gaston stays reachable from the tray
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
risk: high # sprint.md: changes the app's own close/quit lifecycle; every close/quit test must stay green
---

From the 2026-09-03 architecture review ([finding 3.5](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: no `Tray` is constructed anywhere in `src/main` (only comments reference one);
the app quits when the main window closes (`src/main/index.ts:89`, `:122`), taking the global
hotkey (`src/main/hotkey.ts:22`) and the hourly reminder notifier
(`src/main/reminder-notify.ts:126`) with it; `startMinimized: true` hides the window with no
tray and no `show()` in the second-instance handler (`src/main/window.ts:65`,
`src/main/index.ts:93`) — an unreachable app; `docs/ARCHITECTURE.md:16` claims a tray exists;
M13's close-during-run dialog has no live path without one (roadmap gap note).

## Requirement

The concept's first principle is that dumping costs nothing — a hotkey, a field, Enter, "even
when the app isn't in the foreground". But today the app is strictly foreground: closing the
window quits it, and with it die the global quick-capture hotkey and the reminder notifier. A
deadline that falls due in the evening is announced whenever I happen to open the app again,
not when it is due. The half of the app that is supposed to work in the background only exists
while the window is open.

Gaston should live in the tray: closing the window keeps it running — hotkey, reminders,
quick capture all stay alive — and the tray brings the window back. Quitting for real is an
explicit action. This also gives the `startMinimized` setting a legitimate meaning instead of
a soft-lock, gives M13's close-during-a-maintenance-run door its missing live path, and makes
ARCHITECTURE.md's tray claim true instead of drift.

## Acceptance Criteria

- [x] A tray icon exists; its menu offers at least: open Gaston, quick capture, quit.
- [x] Closing the main window keeps the app running in the tray (configurable; the behavior is
      stated where it is configured). Quit from the tray or an explicit menu action really
      quits, through the existing close-guard.
- [x] The global quick-capture hotkey works while the main window is closed.
- [x] The reminder notifier keeps running while the main window is closed; clicking a
      notification opens the window on the dashboard.
- [x] `startMinimized` starts into the tray and is reachable from it; a second app start shows
      the window. The setting is either exposed in the settings UI or removed — no dormant
      toggle.
- [x] ARCHITECTURE.md's description matches reality after this story.
- [x] The M13 close-during-run warning is reachable through the tray quit path and covered by a
      test.

## Open Questions

None. Every detail decision is recorded under `## Decisions (Sprint)`.

## Decisions (Sprint)

- **D-a — New app-level setting `closeToTray: boolean`, default `true`.** Reason: the
  requirement says Gaston "should live in the tray", and it is a per-machine window behaviour, so
  it belongs in `AppSettings` (userData) next to `startMinimized`, not in the vault.
- **D-b — The tray icon always exists while the app runs, independent of `closeToTray`.**
  Reason: AC1 is unconditional, and `startMinimized` needs a way back even when close-to-tray is
  off.
- **D-c — Hiding to the tray is not a close, so it never asks the M13 question.** Closing the
  window with close-to-tray on hides it and leaves a running task running; only a real quit
  (tray "Quit", or a window close with close-to-tray off) goes through the close-guard's veto.
  Reason: the M13 warning exists because a close _kills_ the run, and a hide kills nothing.
- **D-d — The hide/close decision lives inside `close-guard.ts`'s one window `close` listener**,
  injected as an optional policy (`attachCloseGuard(services, window, { hideInsteadOfClose })`),
  not in a second listener. Reason: two `close` listeners would both run, and the guard would
  veto and prompt on a close the other listener already turned into a hide — the order-dependent
  bug this story is most likely to ship.
- **D-e — Quit intent is an explicit flag owned by the close-guard**, set when a `before-quit`
  gets through the guard un-vetoed (and on Windows `session-end`), reset in `attachCloseGuard`
  like `confirmed`. Reason: the window must close, not hide, once a quit is authorised, and a
  flag set _before_ the guard decides would survive a cancelled quit and turn the next ×
  into a real quit.
- **D-f — Hide only when a tray actually exists.** The hide policy is
  `closeToTray && trayAlive()`, and `startMinimized` falls back to showing the window when no
  tray could be created. Reason: hiding with no tray to come back through is exactly the
  soft-lock finding 3.5 describes.
- **D-g — One `showMainWindow(services)` helper** (`restore` if minimized, `show`, `focus`),
  used by the tray, `second-instance`, `activate`, `window:show` and the reminder click. Reason:
  the same three lines exist in three places today and `second-instance` lacks `show()` — reuse
  instead of a fourth copy (CLAUDE.md).
- **D-h — Tray menu: "Open Gaston", "Quick capture", separator, "Quit Gaston"; left click opens
  the window.** The quick-capture item calls the very function the global hotkey calls. Reason:
  AC1's minimum set, and one quick-capture trigger path instead of two.
- **D-i — Tray labels live in `src/main/messages.ts` and follow `settings.uiLanguage()`**, rebuilt
  on settings change; the icon follows `customization.appIcon`. Reason: the tray is main-process
  text with no renderer behind it — the case `messages.ts` already exists for (like the reminder
  notification).
- **D-j — Both switches ("Keep running in the tray when the window closes", "Start in the
  tray") go into a new panel on the Customization tab**, saved via `settings:setApp`, each with a
  hint that states the behaviour. Reason: Customization is the tab that already edits app-level
  settings through `setApp` and renders without a vault; Behavior is vault-scoped and shows an
  empty state without one. This exposes `startMinimized` instead of removing it (AC5).
- **D-k — The two existing close-door e2e specs pin `closeToTray: false`.**
  `quit-during-run.spec.ts` and `quit-during-digestion.spec.ts` keep proving the window-close
  door, which still exists exactly when close-to-tray is off; the tray door gets its own spec.
  Reason: with the new default, a window close is a hide (D-c), so the specs would otherwise
  test a path that no longer asks — pinning is not weakening, it names the configuration the
  asserted behaviour belongs to.
- **D-l — E2E reaches the tray through an env-gated handle** (`SB_E2E_TRAY=1` publishes the real
  `Tray` and its current `Menu` on a typed `globalThis` slot; menu items carry stable ids
  `open` / `quick-capture` / `quit`). Specs call the real `MenuItem.click()` / `tray.emit('click')`
  via `app.evaluate`. Reason: Playwright cannot click the OS notification area; this mirrors the
  existing `SB_E2E_*` seams and drives the same handlers a real click runs.
- **D-m — A second app start is proven by spawning the real Electron binary** with the same
  `--user-data-dir` (the single-instance lock is per userData) and waiting for it to exit.
  Reason: `_electron.launch` expects a window from the child, which a refused second instance
  never opens.
- **D-n — AC6 gets a drift test** that reads `docs/ARCHITECTURE.md` and asserts the tray/close
  lifecycle it describes names files and a setting that exist. Reason: this AC exists because the
  doc drifted once; a test is what keeps it from drifting again.
- **D-o — Residue.** A physical press of the global chord and a click on a real Windows toast
  are manual residue; everything behind them (hotkey still registered while hidden, the callback
  path, the click handler on a hidden window) is automated. Reason: Playwright's `_electron`
  cannot inject OS-level global key chords or click Action Center toasts, and synthesising them
  would drive the developer's real desktop.
- **D-p — Build after 057.** 057 edits `src/main/window.ts`'s `attachNavigationGuards`
  (~line 118–130); this story only touches `window.ts`'s icon helper (lines 18–31, 69–79) and
  `ready-to-show` (lines 63–66). Reason: disjoint hunks, but the same file — sprint.md already
  orders 057 first, and 058 must start from 057's reviewed state.

## Plan

Order: setting + harness options → tray module → lifecycle (the risky part) → start-minimized /
second instance → reminder click → settings UI → docs.

1. **Setting.** `closeToTray` in `AppSettings` (`src/shared/types/settings.ts:157`), default
   `true` (`src/main/settings-defaults.ts:32`), validated in `sanitizeAppPatch`
   (`src/main/ipc/settings-validate.ts:270`), mocked in `src/renderer/lib/mock-settings.ts:85`.
   Old files pick up the default via `deepMerge` (`src/main/settings.ts:48`) — no version bump.
   E2E harness: `prepareUserData` accepts `closeToTray` / `startMinimized`; the fixture exposes
   both as worker options and always sets `SB_E2E_TRAY=1`.
2. **Tray.** New `src/main/tray.ts`: `createAppTray(services)` → `Tray` with the app icon
   (helper moved from `window.ts` to new `src/main/app-icon.ts`), tooltip `APP_NAME`, menu from a
   pure `trayMenuTemplate(language, actions)`; left click = open; rebuild on settings change.
   `index.ts` holds the reference at module scope (a GC'd `Tray` vanishes) and destroys it in
   `will-quit`. Quick capture: `triggerQuickCapture(services)` exported from `hotkey.ts`, used by
   the hotkey callback and the tray.
3. **Lifecycle (D-c/D-d/D-e/D-f).** `close-guard.ts`: optional `hideInsteadOfClose` policy
   checked first in the `close` listener (unless quitting → `preventDefault` + `hide`, no veto,
   no prompt); `guard()` reports whether it vetoed; `before-quit` sets `quitting` only when not
   vetoed; `session-end` sets it too. `index.ts` passes
   `() => settings.app().closeToTray && tray alive`, and `activate` shows an existing window.
   New `src/main/show-main-window.ts`; `ipc/window.ts#window:show` uses it.
4. **Start minimized / second instance.** `second-instance` → `showMainWindow`. `window.ts:65`
   shows the window when `startMinimized` is on but no tray exists (`createMainWindow` takes a
   `canStartHidden` flag from `index.ts`; the tray is created before the window).
5. **Reminder click.** `reminder-notify.ts#openDashboard` uses `showMainWindow`; new unit test.
6. **Settings UI.** New `src/renderer/screens/settings/TrayPanel.tsx` (two `Switch` atoms,
   hints) rendered in `CustomizationTab.tsx`; keys in `i18n/en.ts` + `de.ts` („…“ quotes).
   `npm run seed` + `npm run shot` for the Customization tab.
7. **Docs.** `docs/ARCHITECTURE.md` gets a short "Window, tray and quit" section; drift test.

Not in scope: an in-app "Quit" menu entry (the tray is the explicit quit action AC2 names), macOS
dock menu, autostart with Windows, a tray badge for due reminders.

## Deliverables

- [x] **D1 — the `closeToTray` setting and the harness options.** `src/shared/types/settings.ts`,
      `src/main/settings-defaults.ts`, `src/main/ipc/settings-validate.ts`,
      `src/renderer/lib/mock-settings.ts`, `scripts/lib/app-harness.mjs` (`prepareUserData`
      options), `tests/e2e/fixtures/app.ts` (worker options `closeToTray` default `true`,
      `startMinimized` default `false`; `SB_E2E_TRAY=1` always), `tests/e2e/quit-during-run.spec.ts`
      and `tests/e2e/quit-during-digestion.spec.ts` (`test.use({ closeToTray: false })`, D-k, with
      a one-line why). Mirror: `startMinimized` at the same four source lines; `stageDelayMs` for
      the fixture option. Plus its test in `tests/main/settings-ipc.test.ts` (the
      `settings:setApp` suite): › "settings:setApp stores a boolean closeToTray and refuses
      anything else". `tests/e2e/README.md` names the two new options.
      _Acceptance:_ `npm test` green; the two pinned specs still pass unchanged otherwise.
- [x] **D2 — the tray.** `src/main/tray.ts` (new), `src/main/app-icon.ts` (new — `appIconPath`
      and `ICON_FILES` moved out of `src/main/window.ts`, which then imports it),
      `src/main/messages.ts` (`trayLabels(language)`; extend the header comment's list of
      justified spots), `src/main/hotkey.ts` (export `triggerQuickCapture`), `src/main/index.ts`
      (create after `bootstrap()`, module-scope reference, `destroy()` in `will-quit`'s `try`).
      E2E handle per D-l, typed, only when `SB_E2E_TRAY === '1'`. Mirror: the notifier's
      `onChange` rebuild in `reminder-notify.ts:120`; `SB_E2E_STAGE_DELAY_MS` in
      `ipc/gardener-run.ts:30` for the env gate. Plus its tests: unit `tests/main/tray.test.ts`
      (template ids + labels in `en` and `de`, quit item calls `app.quit`, quick-capture item
      calls `triggerQuickCapture`) and e2e `tests/e2e/tray.spec.ts` (AC1 and the quick-capture
      item opening the quick-capture window). `tests/main/will-quit.test.ts` stays green (its
      electron mock already stubs `Tray`/`Menu`/`nativeImage`).
- [x] **D3 — close hides, quit quits, the guard still asks.** `src/main/close-guard.ts`,
      `src/main/index.ts` (policy, `activate`), `src/main/show-main-window.ts` (new),
      `src/main/ipc/window.ts` (`window:show` via the helper). Plus its tests: new cases in
      `tests/main/close-guard.test.ts` (existing cases untouched — the policy is optional and
      defaults to "never hide"), extra tests in `tests/e2e/tray.spec.ts`, new
      `tests/e2e/tray-quit-during-run.spec.ts` (mirror `tests/e2e/quit-during-run.spec.ts`,
      `stageDelayMs: 300`). In a spec that quits the app, trigger the click inside
      `setTimeout(…, 0)` in `app.evaluate` so the evaluate returns before the process dies, then
      `await app.app.waitForEvent('close')`; the quit test is the spec file's last test.
- [x] **D4 — start in the tray, second start shows.** `src/main/window.ts` (lines 63–66 only:
      `canStartHidden` parameter), `src/main/index.ts` (`second-instance` → `showMainWindow`; tray
      created before the window), `tests/e2e/fixtures/app.ts` (a `launchSecondInstance()` helper:
      spawn `require('electron')` with `out/main/index.cjs` and the same `--user-data-dir` and
      env, resolve on exit, per D-m), `tests/e2e/start-minimized.spec.ts` (new,
      `startMinimized: true`), `tests/main/start-hidden.test.ts` (new; pure
      `shouldStartHidden`). Do not touch `attachNavigationGuards` (057's hunk).
- [x] **D5 — a reminder click reaches a hidden window.** `src/main/reminder-notify.ts`
      (`openDashboard` via `showMainWindow`), `tests/main/reminder-notify.test.ts` (new; fake
      `Notifier` from `NotifierOptions`, fake timers, a services stub whose window is hidden).
      Mirror: the stub style in `tests/main/close-guard.test.ts:75`.
- [x] **D6 — the switches in Settings.** `src/renderer/screens/settings/TrayPanel.tsx` (new,
      `Switch` atom + `Panel`, saves via `api.settings.setApp`), `CustomizationTab.tsx` (render
      it), `src/renderer/i18n/en.ts` + `de.ts`, `tests/renderer/settings.test.tsx` (new case),
      `tests/e2e/close-to-tray-off.spec.ts` (new). Mirror: the `overview.notifications` switch in
      `BehaviorTab.tsx:144` for label + hint; `CustomizationTab`'s own `save` mutation. Read
      `src/renderer/styles/gaston/README.md` first; `npm run seed` + `npm run shot`.
- [x] **D7 — ARCHITECTURE.md tells the truth.** `docs/ARCHITECTURE.md` (a short section under
      the diagram: tray module, close-to-tray setting, quit through the close-guard, where the
      M13 prompt fires), `tests/main/architecture-doc.test.ts` (new, D-n).

## Model Hints

- `D3 → deliverable-hard` — it changes what a window `close` means inside the one module whose
  invariant is "one veto per shutdown, no veto without an answer": the hide branch, the quit flag
  and the `before-quit` → `close` → `closed` re-entry (see `close-guard.ts:48-66`) must agree, or
  the app either cannot be quit or quits on ×, and every existing close/quit test is on that path.
- D1, D2, D4, D5, D6, D7 → default. Each is local with a file to mirror; D4's second-instance
  spawn is test plumbing, and the lifecycle it relies on is D3's.
- Review: → `story-review-hard` — the diff rewires the app's own lifecycle (close, hide, quit,
  second instance, session end) across `index.ts` and `close-guard.ts`; a reviewer must reason
  about event ordering, not just read the diff.

## Test Plan (manual acceptance)

### Acceptance tests

- AC1 (tray icon, menu: open, quick capture, quit) → e2e `tests/e2e/tray.spec.ts` › "the tray
  menu offers open Gaston, quick capture and quit"; unit `tests/main/tray.test.ts` › "has stable
  ids in order: open, quick-capture, separator, quit", › "labels in English" and › "labels in
  German" (D2).
- AC2 (close keeps running; configurable, stated where configured; quit really quits through the
  guard) →
  - e2e `tests/e2e/tray.spec.ts` › "closing the window keeps Gaston running in the tray, and the
    tray brings it back" (D3);
  - e2e `tests/e2e/close-to-tray-off.spec.ts` › "with keep-in-tray switched off in settings,
    closing the window quits the app" — also asserts the switch's hint text (D6);
  - e2e `tests/e2e/tray.spec.ts` › "quit from the tray ends the app" (D3, last test);
  - unit `tests/main/close-guard.test.ts` › "a close-to-tray close hides the window and vetoes
    nothing" and › "once a quit got through the guard, the window closes instead of hiding"
    and › "a cancelled quit leaves the next close a hide, not a quit" (D3);
  - renderer `tests/renderer/settings.test.tsx` › "speichert beide Tray-Schalter auf App-Ebene"
    (D6; German, matching this test file's language).
- AC3 (hotkey works while the window is closed) → e2e `tests/e2e/tray.spec.ts` › "with the
  window in the tray the quick-capture hotkey stays registered and quick capture still opens"
  (asserts `globalShortcut.isRegistered(<configured chord>)` after the hide, then drives the
  shared `triggerQuickCapture` path via the tray item) (D2/D3). **Manual residue:** the physical
  key chord reaching Windows — Playwright's `_electron` cannot inject OS-level global shortcuts,
  and doing so would drive the developer's real desktop.
- AC4 (notifier keeps running; click opens the window on the dashboard) → unit
  `tests/main/reminder-notify.test.ts` › "the hourly check keeps firing while the window is
  hidden to the tray" and › "the hourly check keeps firing while the window is gone" (an
  `it.each`, proving `check()` never reads window state), plus › "a notification click shows a
  hidden window and routes it to the dashboard" (D5). **Manual residue:** clicking a real Windows
  toast in Action Center — not reachable from Playwright; the handler it calls is the one the
  unit test drives.
- AC5 (startMinimized starts into the tray, reachable; second start shows; setting exposed) →
  e2e `tests/e2e/start-minimized.spec.ts` › "with start in the tray the window stays hidden until
  the tray opens it, and a second app start shows it" (one test, in steps — D4); e2e
  `tests/e2e/close-to-tray-off.spec.ts` › "both tray switches are in settings, each stating its
  behaviour" (D6). The no-tray fallback (D-f) is proven two ways: the pure D4 unit case
  `tests/main/start-hidden.test.ts` › "without a tray the window is never started hidden"
  (`shouldStartHidden(startMinimized, canStartHidden)`, no `BrowserWindow` needed), and — added in
  review-fix, after the first review reproduced a throwing `Tray` constructor killing `start()`
  entirely and making this fallback unreachable in practice — `tests/main/start-without-tray.test.ts`
  › "a throwing Tray constructor still opens a window that never starts hidden", which lets
  `start()` run for real with a `Tray` that throws and asserts a window still opens with
  `canStartHidden: false`.
- AC6 (ARCHITECTURE.md matches reality) → unit `tests/main/architecture-doc.test.ts` ›
  "ARCHITECTURE.md describes the tray lifecycle src/main actually wires" (D7).
- AC7 (M13 close-during-run warning reachable through the tray quit path, tested) → e2e
  `tests/e2e/tray-quit-during-run.spec.ts` › "quitting from the tray during a maintenance run
  surfaces the hidden window and asks first; cancelling keeps app, run and window" (D3); unit
  `tests/main/close-guard.test.ts` › "a tray quit with a run going vetoes once and shows the
  hidden window" (D3).

Existing suites that must stay green unchanged in their assertions: `tests/main/close-guard.test.ts`
(all prior cases), `tests/main/will-quit.test.ts`, `tests/e2e/quit-during-run.spec.ts`,
`tests/e2e/quit-during-digestion.spec.ts` (configuration pinned per D-k),
`tests/renderer/quit-during-run-dialog.test.tsx`.

## Done

Gaston now has a real system tray (open, quick capture, quit) that outlives the main window.
Closing the window hides it to the tray instead of quitting whenever `closeToTray` is on and a
tray exists; a real quit (tray "Quit", or a window close with `closeToTray` off) still goes
through the existing close-guard veto, so the M13 "still running" prompt fires exactly as before,
now reachable through the tray too. `startMinimized` starts the app hidden in the tray when one
exists (falling back to a normal, visible start otherwise — the finding-3.5 soft-lock this story
was written to close), and a second app start shows the running instance's window. Both settings
are exposed in Settings → Customization with a hint each. `ARCHITECTURE.md` documents the new
lifecycle and a test keeps it honest.

Commit message:

```
058: Gaston stays reachable from the tray
```

### Verification

- `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check` — all green for
  every file this story touches (a handful of pre-existing, unrelated files elsewhere in the repo
  — `.claude/commands/*.md`, other stories' `done/*.md`, `docs/sprints/done/S16/review.md` — already
  fail `format:check` on `main` and are out of scope).
- `npm test` (full suite, run several times across this story's build and review-fix passes): the
  only reproducible failure in any run is `tests/renderer/quick-capture.test.tsx`
  (`TypeError: window.localStorage.clear is not a function`), which fails identically in complete
  isolation with zero other files loaded and has zero diff against this story (`git diff`/`git
status` show it untouched) — pre-existing, unrelated, out of scope. Every other failure seen
  across repeated full-suite runs was a different, non-reproducible set of files each time
  (axe-core timeouts, IPC timeouts under load) — resource contention on this machine when running
  ~4000 tests, not a regression; each of those files passes cleanly on its own or in a small batch.
  All of this story's own test files pass together cleanly and repeatably (156/156 in the final
  targeted run: `tests/main/close-guard.test.ts`, `tray.test.ts`, `start-hidden.test.ts`,
  `start-without-tray.test.ts`, `reminder-notify.test.ts`, `architecture-doc.test.ts`,
  `will-quit.test.ts`, `settings-ipc.test.ts`, `tests/scripts/e2e-wiring.test.ts`,
  `tests/renderer/settings.test.tsx`).
- `npm run test:e2e` (full suite, several runs): a handful of unrelated specs elsewhere flaked once
  each with a generic Playwright "evaluate: Resulting promise was garbage collected" error under
  load and passed cleanly on immediate retry in isolation — confirmed unrelated (untouched files,
  same fixture plumbing every other passing spec also uses). Every 058 spec passes, repeatably:
  `tests/e2e/tray.spec.ts` (5), `tests/e2e/tray-quit-during-run.spec.ts` (1),
  `tests/e2e/start-minimized.spec.ts` (1, in steps), `tests/e2e/close-to-tray-off.spec.ts` (2); the
  two pinned pre-existing specs (`quit-during-run.spec.ts`, `quit-during-digestion.spec.ts`,
  `closeToTray: false` per D-k) stay green unchanged.
- **Acceptance criteria → tests, as verified**: see the updated `### Acceptance tests` above (test
  names corrected to match what was actually written, e.g. the AC5 e2e coverage turned out to be
  one test in steps rather than two, and AC4's "keeps firing while hidden" is an `it.each` with two
  cases). Every criterion has a passing automated test; the two manual residues (AC3's physical key
  chord, AC4's real Windows toast click) are declared with their reasons and block nothing.
- **Review**: two full-story review rounds plus one narrow verification round, all `story-review-hard`
  tier (risk: high). Round 1: FAIL, 9 findings (5 confirmed substantive, 3 minor doc/comment
  issues, 1 accepted-as-is). Round 2 (after fixing round 1): FAIL, found the round-1 fix for the
  hidden-start `maximize()` bug had introduced a narrower regression (the saved "maximized" setting
  got silently overwritten once the window was hidden and never shown before closing), plus one test
  that didn't reach the code path it claimed to. Round 3 (after fixing both): **PASS**, with one
  low-severity, explicitly-accepted residual limitation (see Decisions below).

### Decisions

- **A window that starts hidden and is later reopened from the tray still loses its "maximized"
  flag once it closes again**, until the user re-maximizes it by hand. The fix for the
  `maximize()`-shows-a-hidden-window bug (Electron's own documented side effect) only preserves the
  saved value across a hide/close that the window was _never_ shown for at all; once it has been
  shown at least once (via the tray, `activate`, or otherwise), its real, unmaximized `isMaximized()`
  state is trusted again and persisted normally — a window that starts hidden always starts
  unmaximized, so "shown, then closed again" saves `false` regardless of what was saved before.
  Reason: fully preserving a maximized preference across an arbitrary number of hidden-start cycles
  would mean either re-maximizing (which shows the window, the exact bug being fixed) or inventing a
  second, deferred-maximize mechanism no other window state in this app has — disproportionate to a
  cosmetic, session-scoped preference (window size/position, not vault data) that the user corrects
  with one click if it bothers them. Flagged in review round 3 and accepted; not pursued further.
- **`close-guard.ts`'s `quitting = true` inside the confirmed-retry callback (next to `app.quit()`)
  is left in, even though it is currently unreachable-as-distinct from `confirmed`** — by the time
  that retry ever runs (only via `letThrough`, reached from `confirmClose()` or the dead-man
  timeout, both of which set `confirmed = true` immediately before calling it), `confirmed` already
  guarantees the same outcome. Left as explicit, defensive code (matching the module's own
  paranoid, invariant-driven style) rather than removed or given a test that could only assert the
  absence of an observable difference. Flagged in review round 1, accepted in round 2.
- D1/D2 (setting + harness options, the tray module) were completed and verified in an earlier,
  infrastructure-interrupted session; this session resumed from D3 and additionally ticked their
  deliverable checkboxes in this file, which had been left unticked despite being done.
