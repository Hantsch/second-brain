---
id: 100
title: e2e absence checks wait on a signal; the quit test gets its own spec
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

The maintainer wants every e2e check that something did not happen to wait on an observable
signal, not on a fixed delay, so that a late event cannot pass as an absent one, and wants the
quit test to stand alone instead of depending on running last in a shared app. A fixed-delay
absence check turns green exactly when the guarded behaviour is broken but slow, which is the
failure the security-relevant file:// check exists to catch.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F05, F07): 3 `waitForTimeout`
calls exist in `tests/e2e`: `navigation-guard.spec.ts:27` (300 ms, after a `file:///etc/passwd`
navigation, then `:31` asserts the URL is unchanged), `start-minimized.spec.ts:34` (500 ms, then
asserts the window is hidden) and `update-check-disabled.spec.ts:20` (4000 ms). That is 4.8 s of
serial wall time on one worker (`playwright.config.ts:18`), 4 s of it in one spec. A navigation
that only takes effect after 300 ms passes the guard test. `tray.spec.ts:133-146` holds a quit
test that says "Must stay last" because it ends the app every test above shares; it awaits
`waitForEvent('close')` (`:144`), bounded only by the 120 s test timeout. The header comment at
`tray.spec.ts:9` still says the quit lifecycle is out of scope, and `docs/ROADMAP.md:69` cites
`tray.spec.ts:134`.

## Acceptance Criteria

- [ ] **AC1** — `tests/e2e/navigation-guard.spec.ts` contains no `waitForTimeout`, and its
      absence check awaits a signal (for example the `will-navigate` event being cancelled, or a
      sentinel round-trip after the navigation attempt), not a clock.
- [ ] **AC2** — Seeding a defect that lets the `file://` navigation through (removing the
      navigation guard in `src/main`) turns the navigation-guard spec red, on a machine where the
      navigation takes longer than 300 ms.
- [ ] **AC3** — `tests/e2e/update-check-disabled.spec.ts` contains no `waitForTimeout`, and the
      spec finishes without a 4 s sleep; it asserts on a main-side flag or counter that the
      startup check was skipped.
- [ ] **AC4** — Seeding a defect that makes the startup update check run while disabled turns the
      update-check-disabled spec red.
- [ ] **AC5** — The quit test (formerly `tray.spec.ts:133-146`) lives in its own spec file under
      `tests/e2e/` with its own `specId`, and `tray.spec.ts` no longer contains a test that ends
      the app.
- [ ] **AC6** — `tray.spec.ts` passes when its tests run in any order
      (`npx playwright test tests/e2e/tray.spec.ts --repeat-each=1 --fully-parallel` or equivalent
      exits 0), and no comment in it says a test must stay last.
- [ ] **AC7** — The header comment of `tray.spec.ts` (formerly `:9`) no longer states that the
      close/hide/quit lifecycle is out of scope.
- [ ] **AC8** — `docs/ROADMAP.md` contains no citation of `tray.spec.ts:134` (the follow-up line
      is removed at the sprint cut; this story owns it).
- [ ] **AC9** — `grep -rn "waitForTimeout" tests/e2e` returns nothing, or each remaining hit
      (start-minimized, if left) carries a same-line reason and is named in the Decisions section.
- [ ] **AC10** — No file under `tests/` defines a generic absence helper, and no `timeout:` value
      in `playwright.config.ts`, `vitest.config.ts` or `tests/setup.ts` is larger than before.
- [ ] **AC11** — `npx playwright test tests/e2e/navigation-guard.spec.ts
tests/e2e/update-check-disabled.spec.ts tests/e2e/tray.spec.ts` and the new quit spec exit 0.

## Open Questions

All answered (refine, 2026-10-28), see `## Decisions (Sprint)`:

- [x] Which signal for navigation-guard? → the main-process `will-navigate` event, read through
      `app.evaluate` (`defaultPrevented`).
- [x] update-check-disabled: existing or new main-side value? → existing: the `UpdateState` that
      `update:check` / `update:state` return; no new field, no test hook.
- [x] start-minimized: fix or keep? → keep the 500 ms wait, with a same-line reason.
- [x] Does 100 need 097? → no, it runs independently.
- [x] Roadmap: record the observed quit-test failure output? → no; the roadmap has no
      `tray.spec.ts:134` line left, and the new spec is enough.

## Decisions (Sprint)

- navigation-guard signal: a `will-navigate` listener added through `app.evaluate` after the
  production guard, reporting the event's `defaultPrevented` (typed in Electron 41's
  `Electron.Event`). That is the guard's own decision, so it does not depend on how long the
  navigation takes, and the spec adds no production hook.
- update-check-disabled signal: the spec awaits an `update:check` round-trip through the bridge.
  That call goes through the same `isSupported` gate in `check()` (`src/main/update/service.ts:206`)
  as the startup timer, and the spec asserts on the main-side `UpdateState` it returns plus
  `update:state` (`supported: false`, `disabledReason: 'unpackaged'`, `status: 'idle'`,
  `lastCheckedAt: null`). This is a production value, not a test hook. The existing fake-timer unit
  test (`tests/main/update/service.test.ts` › "no check runs, automatic or manual, when the build is
  unpackaged or in demo mode") proves that the 3 s timer itself skips. Waiting for the real timer
  inside e2e would need either a clock or a new hook.
- AC4's seeded defect is removing that gate in `check()`. The e2e round-trip then runs the real
  checker, so `lastCheckedAt` is set and the network guard trips, and the unit test turns red as well.
- start-minimized keeps its `waitForTimeout(500)` with a same-line reason. No production-path
  signal says the `ready-to-show` show decision has been made (counting listeners would rely on
  internals), and the review's judge gave only navigation-guard security weight.
- 100 does not depend on 097. It edits only e2e specs and `tests/e2e/fixtures/tray.ts`, and
  096's guard picks up the new `tests/e2e/tray-quit.spec.ts` through Playwright's own `testMatch`.
- The roadmap does not record the observed quit-test failure output. `docs/ROADMAP.md` no longer
  cites `tray.spec.ts:134` (removed at the sprint cut), and the refuter advised against hunting the
  race. Moving the test into its own spec removes the ordering dependency.
- "Any order" for `tray.spec.ts`: Playwright cannot shuffle and only one Electron app may run at a
  time, so order independence is built in. Every test sets up its own window state, and none
  relies on a window another test opened or hid. Build proves it by running the file in order, each
  test alone (`-g`), and once with `--repeat-each=2`.

## Plan

Only e2e specs and one e2e fixture change. No production code, no config, and no timeout changes.
navigation-guard goes first because it is the security-relevant one.

1. `navigation-guard.spec.ts`: before the `file://` attempt, `app.app.evaluate` attaches a one-shot
   `will-navigate` listener to the main window's webContents (`app.mainWindowId`). It stores a
   promise of `{ url, prevented: event.defaultPrevented }` on `globalThis`. The spec triggers the
   navigation, awaits that promise through a second `evaluate`, and asserts `prevented === true` for
   the `file:///etc/passwd` URL. The 300 ms wait goes. The steps "URL unchanged" and "still usable"
   stay. A one-off mutation run (guard's `preventDefault` disabled) must turn it red.
2. `update-check-disabled.spec.ts`: replace the 4 s step with `window.sb.invoke('update:check')`
   and `window.sb.invoke('update:state')`, asserting the disabled `UpdateState`. A one-off mutation
   run (gate at `service.ts:206` removed) must turn it red.
3. Quit test → new `tests/e2e/tray-quit.spec.ts` (`specId: 'tray-quit'`), unchanged in substance.
   In `tray.spec.ts`: drop the quit test and the "must stay last" and "order matters" comments, and
   rewrite the header comment. Make "the quick-capture menu item opens…" order-independent: hide
   any quick-capture window, click, then poll for a visible one instead of `waitForEvent('window')`,
   which hangs when the window already exists. The hide and the visibility poll then exist twice,
   so they move into `tests/e2e/fixtures/tray.ts`.
4. `start-minimized.spec.ts:34`: add a same-line reason. Then run the grep and diff checks for
   AC8–AC10.

Order: D1 → D2 → D3 → D4. All Ds are independent files; only D3 touches the fixture.

## Deliverables

<Leave empty. Filled by `/refine <id>`: small pieces, each with its own acceptance
(scrum-like) and the files it touches. `/build` implements them in order, in one go.
Every acceptance criterion above must be covered by at least one deliverable **and** by the
test named for it in `## Acceptance Tests` — the test is part of the deliverable that
implements the behaviour, never a clean-up afterwards. Refine checks both before
`status: ready`, build refuses to start without them.>

- [ ] D1 — **navigation-guard waits on the guard's decision.** File:
      `tests/e2e/navigation-guard.spec.ts` only. In step "navigating to an arbitrary file:// path is
      blocked", remove `page.waitForTimeout(300)` and its comment. Before
      `page.evaluate("location.href = 'file:///etc/passwd'")`, call `app.app.evaluate`. It gets the
      main window via `BrowserWindow.fromId(app.mainWindowId)`; `tests/e2e/fixtures/tray.ts` shows
      that pattern, including the throw when the id is undefined. On that window's `webContents` it
      sets `globalThis.__navAttempt = new Promise(resolve => wc.once('will-navigate', (event, url)
      => resolve({ url, prevented: event.defaultPrevented })))`. Use `once`/`on`, never
      `prependListener`: the listener must run **after** the production guard
      (`src/main/navigation.ts:72`) so it reads that guard's decision. After the trigger, a second
      `app.app.evaluate` returns `await globalThis.__navAttempt`. Assert
      `url === 'file:///etc/passwd'` and `prevented === true`. Type the global locally in the
      evaluate, as `fixtures/tray.ts` types `__SB_E2E_TRAY__`. Do not build a reusable helper. Keep
      the test name and the two later steps (URL unchanged, rail still usable; keep the comment about
      Chromium's stalled loading state). Acceptance: the spec passes and contains no
      `waitForTimeout`. Then do one **seeded-defect run**: in `src/main/navigation.ts`, change
      `attachNavigationGuards`'s `will-navigate` handler to `return` before `event.preventDefault()`,
      run `npx playwright test tests/e2e/navigation-guard.spec.ts` (needs `npm run build` first),
      confirm it is red on `prevented`, then revert the file with a scoped
      `git checkout -- src/main/navigation.ts`. Record the red line in `## Done`.
- [ ] D2 — **update-check-disabled asserts on main-side state, without a sleep.** File:
      `tests/e2e/update-check-disabled.spec.ts` only. Replace the step "it still says so past the
      point a startup check would fire" (the 4 s `waitForTimeout`) with a step "a check through the
      same gate as the startup check leaves the state untouched". It runs
      `await page.evaluate("window.sb.invoke('update:check')")` (as in
      `tests/e2e/about-release-notes.spec.ts:132`) and `window.sb.invoke('update:state')`. Assert
      that both returned objects match `{ supported: false, disabledReason: 'unpackaged', status:
      'idle', lastCheckedAt: null, update: null }`, then re-assert the panel text. Update the header
      comment: the startup timer itself is proven by the unit test
      `tests/main/update/service.test.ts` › "no check runs, automatic or manual, when the build is
      unpackaged or in demo mode". This spec proves the built app's gate. Leave that unit test
      unchanged. Acceptance: the spec passes with no `waitForTimeout`. Then do one
      **seeded-defect run**: delete the line `if (!options.isSupported().supported) return
      compose();` in `src/main/update/service.ts` `check()`, rebuild, and run the spec. Confirm red
      (`lastCheckedAt` set and/or the network guard). Then run `npx vitest run
      tests/main/update/service.test.ts` and confirm red. Revert with a scoped
      `git checkout -- src/main/update/service.ts` and record both in `## Done`.
- [ ] D3 — **The quit test stands alone; tray.spec runs in any order.** Files:
      `tests/e2e/tray-quit.spec.ts` (new), `tests/e2e/tray.spec.ts`,
      `tests/e2e/fixtures/tray.ts`. (a) Move the test "quit from the tray ends the app"
      (`tray.spec.ts:133-146`) verbatim into `tray-quit.spec.ts`, with `test.use({ specId:
      'tray-quit' })`. The fixture enforces specId = file name. Default options, no `hotkey`.
      Add a short header comment saying why it has its own app. (b) In `tray.spec.ts`, delete
      that test, the `/* Must stay last … */` comment, and the "Order matters from here on … the
      last one quits it" sentences (`:59-62`). Rewrite the header comment (`:9-11`) so it no longer
      calls the close/hide/quit lifecycle out of scope: this file covers menu, quick capture and
      close-to-tray, and quit lives in `tray-quit.spec.ts`. (c) Add two helpers to
      `fixtures/tray.ts` and have both tests use them: `hideQuickCapture(app)`, which hides every
      window whose URL includes `quick-capture`, and `quickCaptureVisible(app): Promise<boolean>`,
      taken from `tray.spec.ts:108-112` and `:122-128`. (d) Make "the quick-capture menu item
      opens the quick-capture window" order-independent. It calls `hideQuickCapture`, clicks the
      item as it does now, and then `expect.poll(() => quickCaptureVisible(app)).toBe(true)` instead
      of `waitForEvent('window')`. A window that already exists is shown, not re-created, so that
      wait would hang. Keep the test names. Acceptance: `npx playwright test
      tests/e2e/tray.spec.ts tests/e2e/tray-quit.spec.ts` exits 0; each of the four
      `tray.spec.ts` tests passes alone (`-g "<name>"`); `npx playwright test
      tests/e2e/tray.spec.ts --repeat-each=2` exits 0. Record all of them in `## Done`.
- [ ] D4 — **start-minimized reason and the closing checks.** File:
      `tests/e2e/start-minimized.spec.ts` (one line). Give `await app.page.waitForTimeout(500);` a
      same-line reason, for example `// no production signal marks the ready-to-show decision;
      not security-relevant (story 100)`. Keep it on one line under prettier (shorten if needed).
      Then run and record in `## Done`: `grep -rn "waitForTimeout" tests/e2e` (only that line);
      `grep -n "tray.spec.ts:134" docs/ROADMAP.md` (nothing); `git diff --stat --
      playwright.config.ts vitest.config.ts tests/setup.ts` (empty); and a search showing no new
      exported absence/"never happens" helper under `tests/`.

## Model Hints

All Ds default tier. D1 is security-relevant but small, and its risk (a listener that cannot
see the guard's verdict) is caught by the mandatory seeded-defect run.

Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/navigation-guard.spec.ts` › "a file:// navigation attempt leaves the app on
  its own page" (D1)
- AC2 → the same e2e test, run red once against the seeded defect in D1 (guard's
  `preventDefault` skipped). Proven independent of navigation duration by construction: it asserts
  the guard's `defaultPrevented`, not elapsed time.
- AC3 → e2e `tests/e2e/update-check-disabled.spec.ts` › "an unpackaged demo build never checks and
  says so" (D2); startup timer: unit `tests/main/update/service.test.ts` › "no check runs, automatic
  or manual, when the build is unpackaged or in demo mode" (existing)
- AC4 → the same two tests, both run red once against the seeded defect in D2 (gate in `check()`
  removed)
- AC5 → e2e `tests/e2e/tray-quit.spec.ts` › "quit from the tray ends the app" (D3)
- AC6 → e2e `tests/e2e/tray.spec.ts` (all four tests), run in file order, each alone with `-g`, and
  with `--repeat-each=2` (D3); no "must stay last" comment (`grep -n "stay last"
  tests/e2e/tray.spec.ts` empty)
- AC7 → check in D3: the header of `tests/e2e/tray.spec.ts` no longer says the lifecycle is out of
  scope (`grep -n "out of scope" tests/e2e/tray.spec.ts` empty)
- AC8 → check in D4: `grep -n "tray.spec.ts:134" docs/ROADMAP.md` empty (already true at the cut)
- AC9 → check in D4: `grep -rn "waitForTimeout" tests/e2e` returns only the start-minimized line
  with its same-line reason (named in Decisions)
- AC10 → check in D4: no diff in `playwright.config.ts`, `vitest.config.ts` and `tests/setup.ts`;
  no generic absence helper added under `tests/`
- AC11 → e2e run `npx playwright test tests/e2e/navigation-guard.spec.ts
  tests/e2e/update-check-disabled.spec.ts tests/e2e/tray.spec.ts tests/e2e/tray-quit.spec.ts`
  exits 0 (D1–D3)

## Done

<Leave empty. Filled by `/build <id>` after implementation:

- Short summary (2–5 lines): what was done.
- Commit message (1–2 lines, keywords are enough).
- Verification: build/test/lint result + review outcome; open points/blockers, if any.>
