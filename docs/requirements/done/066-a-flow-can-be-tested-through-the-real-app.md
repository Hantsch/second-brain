---
id: 066
title: A flow can be tested through the real app
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

Cut on 2026-09-07, when the manual acceptance backlog
([reviews/2026-09-03-acceptance-todo.md](../reviews/2026-09-03-acceptance-todo.md)) was dropped
and acceptance became the test each criterion is mapped to. This story is what that backlog
turned into: the one test level the project does not have. Related: [[065-the-gate-runs-on-every-push]]
(its optional second lane is this suite's natural CI home).

## Requirement

Every acceptance criterion now has to be provable by an automated test, and criteria about
things the user _does_ have to be proven through the real surface. The project cannot do that
today. `npm run shot` and `npm run a11y` drive the built app through Playwright's `_electron`
and prove that screens render and are accessibility-clean — but nothing drives a **flow** and
asserts an outcome. So the properties the retired walk-throughs existed for are all covered one
level down, by renderer and main-process tests against fakes:

- write paths with an undo (015/016/043: discard a page and restore it byte-for-byte, insert a
  link and take exactly that line back out, delete an artifact and find it in
  `.secondbrain/trash/`),
- behaviour that spans screens (042: a run that stays visible across navigation, stopped from
  another screen, a close warning mid-run),
- a proposal a human has to accept before anything is written (036/037/038/049), which is
  guardrail 2 of this project and currently has no end-to-end proof at all.

I want a harness that can start the built app against a disposable vault, click through a flow,
and assert what ended up in the files — so that `ui-acceptance-required: true` in
`.claude/ai-scrum.md` means something instead of producing a gap note on every story.

It has to be a normal part of the gate (`e2e` in the ai-scrum profile, a lane in `verify`), it
must never touch my real vault or my keys, and it must not need a model: the no-model path is
the one every flow has to survive anyway.

## Acceptance Criteria

- [x] **AC1** — `npm run test:e2e` starts the built app, runs a suite of flow specs against a
      disposable vault, and exits non-zero on a failed assertion. No screenshot is part of the
      verdict — a PNG cannot fail a criterion.
- [x] **AC2** — The suite reuses the existing harness (`scripts/lib/app-harness.mjs`) rather
      than starting the app a second way: same env scrubbing, same seeded fixture mechanism, so
      a spec can never read the author's real vault, real `~/.claude` sessions or stored keys.
- [x] **AC3** — A spec can assert against the vault on disk after a flow (a file exists, a body
      line was written, a file moved to `.secondbrain/trash/`), not only against the DOM.
- [x] **AC4** — At least one spec proves a proposal-then-accept flow end to end (guardrail 2):
      nothing is written before the accept, and exactly the previewed change is written after.
- [x] **AC5** — At least one spec proves a cross-screen property that no unit test can reach —
      concretely 042: a maintenance run started on one screen is still visible on another, and
      can be stopped from there. It needs a fixture that holds a run open long enough without a
      model configured.
- [x] **AC6** — At least one spec proves an undo round trip on a real write path (015 or 043):
      act, find the file in `.secondbrain/trash/`, undo, and compare the restored file
      byte-for-byte with the original.
- [x] **AC7** — Every spec runs green with **no model configured** and calls no network. A spec
      that needs a model is either driven by the fake provider or does not exist.
- [x] **AC8** — `e2e: npm run test:e2e` is set in `.claude/ai-scrum.md`, so `/build` runs it as
      the acceptance gate for user-facing criteria; the README's development section names it
      next to `verify` and `verify:ui`.
- [x] **AC9** — A single spec's failure output names the flow, the step and the expectation in a
      form that is readable without opening the spec. A suite nobody can debug gets skipped, and
      a skipped acceptance gate is worse than none.
- [x] **AC10** — Runtime is bounded and recorded: the whole suite has a stated budget in the
      Done section, and a spec that needs a slow stage says why.

## Open Questions

All four resolved with the user on 2026-09-07 — the recommendations were taken:

- **Scope of the first suite:** floor only. AC4/AC5/AC6 are the three flows; backfilling the
  retired backlog (M4, M12/M14) becomes its own story per milestone once the shape is known.
- **Runner:** `@playwright/test` alongside vitest. Trace/retry/reporter carry AC9; the cost is a
  second runner and a `playwright.config.ts`. Today only bare `playwright ^1.62.1` is installed.
- **Disposable vault:** a temp vault per spec, seeded through the same code
  (`ensureDemoVault(tmpDir)` already shells out to `scripts/seed-vault.mjs --out`). AC3/AC6 write,
  and shared state between writing specs is a flake generator.
- **Selector stability:** the renderer carries **no** `data-testid` at all. Specs pin the UI
  language to `en` (`prepareUserData` already writes `uiLanguage`) and select via `getByRole` plus
  the English label. No production markup is touched for selectors.
- **CI:** the suite is built here, the lane is wired in [[065-the-gate-runs-on-every-push]] —
  otherwise both stories touch `.github/`.

One decision was made during refinement and is called out for objection: **AC5 needs a seam that
does not exist.** Without a model the gardener stage plan collapses to a single `checks` stage
(`src/core/gardener/progress.ts:42-48`) that finishes near-instantly, so a run cannot be observed
across a navigation. Padding the demo vault until the run is slow is machine-dependent and flaky.
D4 therefore adds an env-gated delay (`SB_E2E_STAGE_DELAY_MS`) in the same family as the existing
`SB_VAULT` / `SB_DEMO`, inert unless set.

## Plan

Build one new test lane — `@playwright/test` over the _existing_ `scripts/lib/app-harness.mjs` —
and prove it with the three flows the retired walk-throughs existed for.

1. **Runner + fixture (D1).** `playwright.config.ts` at the repo root: `testDir: tests/e2e`,
   `workers: 1` (the harness owns one Electron instance and one userData dir), `forbidOnly`,
   `globalTimeout` as the AC10 budget, `list` reporter, `trace: 'on-first-retry'`. A `test.extend`
   fixture in `tests/e2e/fixtures/app.ts` does exactly what `scripts/a11y.mjs:264-274` does —
   `ensureBuild()` → `ensureDemoVault(tmp)` → `prepareUserData(tmp/userdata, { vault, uiLanguage: 'en' })`
   → `launchApp()` — but into `os.tmpdir()` per spec file, and tears both down after. It must not
   contain its own `_electron.launch`; that is the point of AC2. vitest keeps `*.test.ts`,
   Playwright takes `*.spec.ts`, so the two runners cannot collide.
2. **Disk assertions (D2).** `tests/e2e/fixtures/vault.ts`: `readNote(rel)`, `frontmatter(rel)`,
   `exists(rel)`, `trashEntries()`, `snapshot(rel)` — thin `fs` wrappers over the temp vault root,
   with failure messages that name the path. Every spec step goes through
   `test.step('<flow> — <step>')` so a failure reads flow / step / expectation without opening the
   spec (AC9).
3. **The three flows (D3, D5, D6).** Day close 049 is the only proposal flow that works without a
   model (`src/core/journal/facts.ts:232` falls back to `heuristicFacts`), so it carries AC4.
   Gardener run 042 carries AC5 once D4 exists. Discard-page 015 is fully heuristic and the demo
   vault already seeds a near-duplicate pair for it (`scripts/seed/module-methodik.mjs:9-16`), so it
   carries AC6.
4. **Wiring (D7).** `test:e2e` script, `e2e:` in `.claude/ai-scrum.md`, README development section,
   measured runtime into `## Done`. `verify` stays as it is — the e2e lane is its own command, run
   by `/build` as the acceptance gate.

Order: D1 → D2 → (D3 ‖ D4) → D5 → D6 → D7. D4 is independent of D2/D3 and can run in parallel.

## Deliverables

- **D1 — the runner and the app fixture.** `@playwright/test` as a devDependency,
  `playwright.config.ts` (root), `tests/e2e/fixtures/app.ts`, `tests/e2e/smoke.spec.ts`,
  `package.json` (`test:e2e`), `.gitignore` (`test-results/`, `playwright-report/`).
  Mirror `scripts/a11y.mjs:264-274` for the launch sequence — the same four harness imports, no
  second launch path. The fixture seeds into `os.tmpdir()`, pins `uiLanguage: 'en'`, configures
  **no** provider and passes no key env through.
  _Accept:_ `npm run test:e2e` starts the app against a temp vault, the smoke spec asserts the app
  reports that temp path (not the author's vault), and a deliberately failed assertion exits
  non-zero.
- **D2 — vault-on-disk assertions plus step naming.** `tests/e2e/fixtures/vault.ts` (extends
  `tests/e2e/fixtures/app.ts`) and a short `tests/e2e/README.md` holding the `test.step` convention.
  _Accept:_ the smoke spec asserts one seeded file's frontmatter through the helper; a failing
  helper assertion prints path and expectation.
- **D3 — spec: proposal then accept (049).** `tests/e2e/journal-close.spec.ts`. Opens a seeded day
  entry, triggers close, asserts the proposal is on screen **and the day file is unchanged on
  disk**, accepts, then asserts `closed: <date>` in the frontmatter and the todo block in the body —
  exactly what the preview showed. Screens: `src/renderer/screens/journal/DayEntry.tsx`,
  `src/renderer/screens/journal/CloseProposal.tsx`.
  _Accept:_ green with no model configured; the pre-accept disk assertion is a real assertion, not a
  comment.
- **D4 — the run-duration seam.** `src/main/ipc/gardener-run.ts` plus its unit test in
  `tests/main/gardener-run-delay.test.ts`. Reads `SB_E2E_STAGE_DELAY_MS` once; when set to a
  positive integer it awaits that many ms between checks, honouring the existing `AbortSignal`.
  Unset → behaviour identical to today. Same env family as `src/main/index.ts:56` (`SB_VAULT`) and
  `src/main/ipc/app.ts:14` (`SB_DEMO`).
  _Accept:_ the unit test proves unset = no delay, and that cancel still aborts promptly with the
  delay set.
- **D5 — spec: a run survives a screen change (042).** `tests/e2e/gardener-run-cross-screen.spec.ts`.
  Starts a run in `src/renderer/screens/garden/GardenScreen.tsx`, navigates to another screen,
  asserts `src/renderer/components/RunStrip.tsx` (`role="status"` / `role="progressbar"`) is still
  there and progressing, cancels from there, asserts the run ends. Uses D4's delay.
  _Accept:_ green with no model, and no fixed `waitForTimeout` used as the synchronisation
  mechanism.
- **D6 — spec: undo round trip (015).** `tests/e2e/discard-undo.spec.ts`. Byte-snapshots the seeded
  near-duplicate page, discards it via `src/renderer/components/DiscardPageAction.tsx`, asserts it is
  gone from the vault and present under `.secondbrain/trash/<token>/`, undoes, and compares
  byte-for-byte with the snapshot.
  _Accept:_ the comparison is on bytes, not on parsed frontmatter.
- **D7 — the gate wiring and the guard test.** `.claude/ai-scrum.md` (`e2e: npm run test:e2e`, plus
  the comments that still say the harness is missing), `README.md` development section,
  `package.json`, `tests/scripts/e2e-wiring.test.ts` (vitest). The guard test is a static check over
  the config, the fixture and the profile — it is what keeps AC2/AC7/AC8/AC9/AC10 from silently
  rotting.
  _Accept:_ `npm run verify` green, guard test green, measured suite runtime written into `## Done`.

## Model Hints

- **D1 → deliverable-hard** — everything else builds on it: Electron under a _second_ runner on
  Windows, with a per-spec temp vault whose lifecycle must not leak into the author's vault or into
  the next spec. Wrong here and D3/D5/D6 all inherit flakes that look like product bugs.
- **D4 → deliverable-hard** — it edits the live gardener run lifecycle
  (`src/main/ipc/gardener-run.ts`) around an existing `AbortSignal`; a seam that changes ordering or
  cancel latency is a regression in shipped story 042 behaviour, and the unset path has to stay
  identical.
- D2, D3, D5, D6, D7 → default tier. New files against a pattern D1 has already established, or
  pure config and docs wiring.
- **Review: → story-review-hard** — the story adds a production env seam in the main process plus a
  whole new acceptance gate. A cheap review waves through exactly the two things this story must not
  ship: a test hook that alters non-test behaviour, and an e2e lane whose specs pass without
  asserting anything.

## Acceptance Tests

- AC1 → e2e `tests/e2e/smoke.spec.ts` › "the built app starts against a disposable vault", plus unit
  `tests/scripts/e2e-wiring.test.ts` › "test:e2e is wired and the config fails on an empty or focused
  run" (asserts `forbidOnly` and that no lenient-exit flag is set; the non-zero exit on a failed
  assertion is the runner's own contract). No screenshot is asserted anywhere.
- AC2 → unit `tests/scripts/e2e-wiring.test.ts` › "the e2e fixture launches through app-harness"
  (the fixture imports `ensureBuild`/`ensureDemoVault`/`prepareUserData`/`launchApp` from
  `scripts/lib/app-harness.mjs` and contains no own `_electron.launch`), plus e2e
  `tests/e2e/smoke.spec.ts` › "the app under test reads the temp vault, not the real one".
- AC3 → e2e `tests/e2e/journal-close.spec.ts` › "the accepted change is on disk, not only in the
  DOM" (D2's helpers assert frontmatter and body against the file).
- AC4 → e2e `tests/e2e/journal-close.spec.ts` › "nothing is written before accept, exactly the
  preview after".
- AC5 → e2e `tests/e2e/gardener-run-cross-screen.spec.ts` › "a run started in the garden stays
  visible on another screen and can be stopped there", plus unit
  `tests/main/gardener-run-delay.test.ts` `describe('the maintenance run duration seam')` ›
  the `it.each(...)` "awaits no timer between checks when the seam is %s — the run is the run it
  always was" (proves unset/invalid = no delay) and "holds the checks stage for the delay it was
  given — and lets cancel through at once" (proves cancel stays prompt with the delay set).
- AC6 → e2e `tests/e2e/discard-undo.spec.ts` › "a discarded page comes back byte-for-byte".
- AC7 → every spec in `tests/e2e/*.spec.ts` shares the one `app` fixture, so all seven specs
  (smoke, journal-close ×2, gardener-run-cross-screen, discard-undo ×1) running green **is** "every
  flow of the suite works with no model configured" — there is no separate flow to cover, so no
  dedicated `no-model.spec.ts` was added; a spec repeating that guarantee once more would assert
  nothing new. The no-model half is proven statically by unit `tests/scripts/e2e-wiring.test.ts` ›
  "the e2e fixture configures no provider and passes no key env" (checks `tests/e2e/fixtures/app.ts`
  passes `withoutKeyEnv: true` and never sets a `providers:` key). The "calls no network" half is
  proven at runtime, not just argued: `tests/e2e/fixtures/app.ts`'s `noNetworkCalls` auto-fixture
  listens on every window's `request` events for the lifetime of each test and asserts the captured
  list is empty (allow-listing only `file://`/`about:blank`/`devtools://`, the schemes the built app
  itself uses to load its own renderer) — so every spec fails immediately if it ever reaches the
  network, without needing a dedicated spec of its own. Statically guarded by
  `tests/scripts/e2e-wiring.test.ts` › "the e2e fixture asserts no network calls happen".
- AC8 → unit `tests/scripts/e2e-wiring.test.ts` › "the profile sets e2e: npm run test:e2e and the
  README names it".
- AC9 → unit `tests/scripts/e2e-wiring.test.ts` › "every spec names its steps" (static check that
  each `tests/e2e/*.spec.ts` wraps its actions in `test.step` and that the `list` reporter is
  configured). The convention itself lives in `tests/e2e/README.md` (D2).
- AC10 → unit `tests/scripts/e2e-wiring.test.ts` › "the config sets a suite-wide time budget"
  (`globalTimeout` present), and D7 writes the measured runtime into `## Done`. That turns the budget
  into something that fails rather than a sentence nobody re-reads.

**Coverage:** AC1→D1, AC2→D1, AC3→D2+D3, AC4→D3, AC5→D4+D5, AC6→D6, AC7→D1+D3/D5/D6, AC8→D7,
AC9→D2+D7, AC10→D1+D7. No manual residue — every criterion has a test.

**Note on the gate order:** this story _is_ the `e2e` command. Its own user-facing criteria
(AC4/AC5/AC6) are proven through the real surface because D1 lands first — the harness deliverable
the profile's comment asks for. Nothing here is mapped a level down.

## Done

Built the missing e2e lane: `@playwright/test` over the existing `scripts/lib/app-harness.mjs`
(no second launch path), a temp-vault-per-spec-file fixture with disk-assertion helpers, and
three flow specs proving guardrail 2 (proposal-then-accept), a cross-screen property (042), and
an undo round trip (015) — each against a disposable, no-model, no-network vault. Added the
`SB_E2E_STAGE_DELAY_MS` seam (inert unless set) so the near-instant no-model gardener run can be
observed across a navigation. Wired `e2e: npm run test:e2e` into the ai-scrum profile and README,
guarded by a static wiring test so AC2/AC7/AC8/AC9/AC10 don't silently rot.

**Commit message:**

```
066: e2e flow suite over the app harness
```

**Verification:**

- `npm run format:check` — the story's own files are clean; repo-wide 240 pre-existing
  CRLF-warning files are untouched and predate this story (confirmed via `git stash`).
- `npm run lint`, `npm run typecheck`, `npm run build` — green.
- `npm test` — 253 files / 3592 tests green (incl. `tests/main/gardener-run-delay.test.ts` and
  `tests/scripts/e2e-wiring.test.ts`).
- `npm run test:e2e` — 7/7 green, **8.5s wall-clock** against a 10-minute `globalTimeout`
  (`playwright.config.ts`) — well inside budget; no spec needed a slow stage beyond D4's
  deliberate, small `SB_E2E_STAGE_DELAY_MS` (300ms/check) in the cross-screen spec.
- Code review (story-review-hard, clean agent): first pass FAIL on two real gaps, both fixed and
  re-verified green:
  - AC10 — `## Done` was empty; filled here.
  - AC7 — "calls no network" was argued, not tested; added a runtime `noNetworkCalls`
    auto-fixture in `tests/e2e/fixtures/app.ts` that fails any spec making a request outside
    `file://`/`about:blank`/`devtools://`, statically guarded in `tests/scripts/e2e-wiring.test.ts`.
    Also fixed on the same pass: the AC9 step-naming guard now checks every `test()` individually
    (not "at least one step in the file"); a loosened assertion in
    `tests/main/gardener-run-delay.test.ts` tightened to `toBe(true)`; two stale/incorrect
    AC→test-name pointers in this file's `## Acceptance Tests` corrected to the real test titles;
    one overclaiming test comment in `smoke.spec.ts` corrected. All fixes were mechanical
    (doc/assertion precision, no design disagreement); the full verification above is the re-run
    that covers them.

**AC → test mapping, as verified:** all ten criteria (AC1–AC10) pass via the tests named in
`## Acceptance Tests` above, verified in this run. No manual residue — every criterion has an
automated test.

**Open points:** none. The repo-wide `format:check` CRLF noise (240 files) is a pre-existing
issue unrelated to this story and outside its scope.
