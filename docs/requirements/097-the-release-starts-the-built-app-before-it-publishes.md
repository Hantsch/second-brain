---
id: 097
title: The release starts the built app before it publishes
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

As the maintainer, I want the release job to start the built app and walk the core journeys before
it publishes, so that a broken package never reaches installed copies through the updater feed,
and a flaky unit test is not the only thing standing between a commit and a release.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F01, F12): release.yml fires on
every push to main (:3-6); its only test step is `npm run verify` (:60-61), the command verify.yml
:38-39 already ran on the PR. runner.mjs:157 runs `npm run build` again, calls electron-builder
(:185-197) and the job publishes the GitHub release that is the updater feed (package.json:50-54,
src/main/update/backend.ts:36). A search for `smoke|launch|_electron|playwright` over release.yml
and scripts/lib/release/ finds nothing. The 53 e2e specs (7,395 lines) run in no workflow; no tag,
folder or script marks a smoke subset and package.json has no `test:smoke`. The only CI step that
drives Electron is `npm run shot` in ui-smoke.yml:14, which asserts no journey, and its upload
step (:36-40) has no `if: always()`, so a failing `shot` uploads nothing. Mitigation that exists:
/sprint runs the full e2e once locally per sprint (not in CI, not on the packaged build).

## Acceptance Criteria

- [ ] **AC1** — Exactly five spec files carry the smoke tag: smoke, search-keyboard, ask-citation-in-app, journal-close, task-no-model; `npx playwright test --list --grep @smoke` lists those five files and no other.
- [ ] **AC2** — `npm run test:smoke` exists in package.json and exits 0 on a built tree.
- [ ] **AC3** — release.yml runs `npm run test:smoke` as a step after the build and before the publish step.
- [ ] **AC4** — ci-gate.test.ts fails when that step is removed or moved after the publish step (seeded defect: delete the step from the workflow text).
- [ ] **AC5** — Seeded defect: a build whose main bundle throws on start makes `npm run test:smoke` exit non-zero.
- [ ] **AC6** — The smoke step is not made blocking until it has passed on 3 consecutive release-workflow runs; the run count is recorded in the Done section.
- [ ] **AC7** — ui-smoke.yml's artifact upload step has `if: always()`, asserted by ci-gate.test.ts.
- [ ] **AC8** — No workflow step makes an axe result a gate: a search for `a11y` in `.github/workflows/*.yml` finds no step that can fail the job.
- [ ] **AC9** — The CLAUDE.md `## Test lanes` release row names `npm run test:smoke` and matches release.yml.

## Open Questions

- ~~Run the smoke against the packaged app or against the electron-vite build?~~ Answered (User), see Decisions.
- ~~Replace release.yml's second `npm run verify` with build plus smoke?~~ Answered: keep verify, add the smoke, see Decisions.
- ~~Tag (`@smoke`) or folder (`tests/e2e/smoke/`)?~~ Answered: tag, see Decisions.
- ~~Should ui-smoke also run the axe half?~~ Answered: no, see Decisions.
- ~~Release time grows by the smoke run; accept until 098 measures?~~ Answered: yes, see Decisions.

## Decisions (Sprint)

- **(User)** Smoke target: the electron-vite build, using scripts/lib/app-harness.mjs as is.
- Keep release.yml's `npm run verify` step and add the smoke after it — branch protection on main is unconfirmed, so verify is the only proven gate before publish, and verify already produces the electron-vite build the smoke needs.
- Tag (`{ tag: '@smoke' }` on every test of the five files), not a folder — AC1 asks for a tag, and a folder would move five files and break paths cited in other stories and docs.
- ui-smoke.yml stays shot-only, no axe run — the judge ruled axe is not a gate, and AC8's guard keeps any future a11y step from failing a job; an advisory axe run is a separate story if wanted.
- Accept the longer release run until 098 measures it — 096's table carries "TBD (story 098)" for the release budget, so no number is invented here.
- The smoke step carries `continue-on-error: true` until three consecutive release runs pass (AC6); the release workflow only runs on push to main, so the count is gathered after the sprint and the switch to blocking is a follow-up edit.
- The seeded broken main (AC5) is injected through the harness's existing `extraEnv` option as `NODE_OPTIONS=--require <temp module that throws>` — this keeps app-harness.mjs as is (User decision) and needs no write into the shared `out/` build.
- The new workflow assertions go into tests/scripts/ci-gate.test.ts as AC4/AC7 name it; the file stays one responsibility (CI workflows are gates), so crossing the ~300-line soft limit is accepted rather than split mid-sprint while 098 edits the same file.
- The AC1 guard is a static scan in tests/scripts/e2e-wiring.test.ts (no Playwright spawn in `npm test`), matching that file's existing static-guard style; the `--list --grep @smoke` command is run once in /build and its output recorded in Done.

## Plan

Smoke subset by tag, one npm script, one non-blocking step in release.yml between Verify (which
builds `out/`) and Release (which publishes). The existing e2e fixtures seed their own throwaway
vault, so the smoke step needs no seed step and no harness change.

1. Tag the five smoke specs and add `test:smoke` (D1). Static guard in e2e-wiring.test.ts.
2. Prove a main process that throws on start makes the harness launch fail, so every smoke spec
   (all of them use the `app` fixture → `launchApp`) and therefore `test:smoke` goes red (D2).
3. Wire the step into release.yml with `continue-on-error: true`; ci-gate asserts order
   Verify < smoke < Release on a pure helper, plus the helper rejects a seeded copy without the
   step or with it after Release (D3).
4. ui-smoke.yml upload `if: always()`; ci-gate asserts it and that no step mentioning `a11y` in
   any workflow can fail its job (helper + seeded in-memory step) (D4).
5. CLAUDE.md `## Test lanes` release row (created by 096) names `npm run test:smoke`; ci-gate
   asserts row and release.yml agree (D5).

Files: tests/e2e/{smoke,search-keyboard,ask-citation-in-app,journal-close,task-no-model}.spec.ts,
package.json, tests/scripts/e2e-wiring.test.ts, tests/e2e/harness-broken-main.spec.ts (new),
.github/workflows/release.yml, .github/workflows/ui-smoke.yml, tests/scripts/ci-gate.test.ts,
CLAUDE.md. Order D1 → D5; D3–D5 all touch ci-gate.test.ts, so run them sequentially.
Out of scope: making the step blocking (after 3 green release runs, AC6), packaged-app smoke, axe
in CI, release budget (098). No changelog entry (tests only).

## Deliverables

- [ ] D1 — **Smoke tag + script.** Add `{ tag: '@smoke' }` (Playwright ≥1.42 test-details
      argument: `test('title', { tag: '@smoke' }, async (...) => …)`) to **every** `test(...)` in
      exactly these five files: `tests/e2e/smoke.spec.ts`, `tests/e2e/search-keyboard.spec.ts`,
      `tests/e2e/ask-citation-in-app.spec.ts`, `tests/e2e/journal-close.spec.ts`,
      `tests/e2e/task-no-model.spec.ts`. No other spec gets the tag. Add
      `"test:smoke": "playwright test --grep @smoke"` to `package.json` scripts next to `test:e2e`.
      Test in `tests/scripts/e2e-wiring.test.ts` (static, mirror that file's existing describes —
      read files, assert content, launch nothing): "exactly the five smoke specs carry the @smoke
      tag and test:smoke selects them by it" — reads every `tests/e2e/*.spec.ts`, collects those
      whose source contains `'@smoke'`, asserts the set equals the five names above, and asserts
      `scripts['test:smoke']` is `playwright test --grep @smoke`. Acceptance: that test green;
      `npx playwright test --list --grep @smoke` lists only those five files (record the output
      in Done); `npm run build && npm run test:smoke` exits 0.
- [ ] D2 — **Seeded broken main fails the launch.** New spec `tests/e2e/harness-broken-main.spec.ts`
      (NOT tagged @smoke; does not use the `app` fixture). It writes a temp CommonJS module
      containing only `throw new Error('seeded defect: main throws on start')` into an
      `mkdtempSync(tmpdir())` directory, prepares a throwaway userData dir with
      `prepareUserData(dir, { vault: null, uiLanguage: 'en' })`, and calls
      `launchApp({ userDataDir, timeout: 20_000, extraEnv })` from `scripts/lib/app-harness.mjs`
      (unchanged — User decision), where `extraEnv.NODE_OPTIONS` is `--require "<modulePath>"`.
      Test "a main process that throws on start fails the launch": asserts `launchApp` rejects.
      It must prove the rejection comes from the seeded throw, not from an unrelated failure: also
      run a control in the same file — the identical call without `NODE_OPTIONS` resolves (then
      close the app) — so a harness that cannot launch at all does not pass as "defect
      detected". Clean up: if Electron stays alive behind an error dialog, the test kills its
      process and removes the temp dirs in `finally`. If Electron 41 ignores
      `NODE_OPTIONS --require` in the main process, stop and report — do not edit
      app-harness.mjs or write into `out/`. Use `test.step` (e2e-wiring requires a step on every
      test). Acceptance: `npx playwright test tests/e2e/harness-broken-main.spec.ts` green on a
      built tree.
- [ ] D3 — **Smoke step in release.yml + order guard.** In `.github/workflows/release.yml` add a
      step `- name: Smoke` with `run: npm run test:smoke` and `continue-on-error: true` (comment:
      why — non-blocking until three consecutive green release runs, story 097 AC6) directly
      after the `Verify` step (whose `npm run verify` ends with the electron-vite build) and
      before `Configure git identity` / `Release` (`node scripts/release.mjs`, which publishes).
      In `tests/scripts/ci-gate.test.ts` (reuse its existing `parse` from `yaml` and the
      `WorkflowStep`/`WorkflowJob` types; the file already reads release.yml at ~:240) add a pure
      helper `smokeOrderProblem(workflow): string | null` that finds the step whose `run` is
      `npm run verify`, the one whose `run` is `npm run test:smoke`, and the one whose `run`
      contains `scripts/release.mjs`, and returns a message unless verify < smoke < release.
      Tests: "release.yml runs the smoke after the build and before the publish" (helper on the
      real file → null); "the order guard rejects a release workflow without the smoke step or
      with it after the publish" (helper on two in-memory copies of the parsed real workflow:
      smoke step removed; smoke step moved after the Release step → both non-null); "the release
      smoke step does not block yet" (`continue-on-error: true` on that step). No `Date.now`/
      `performance.now` in the file (098 AC6).
- [ ] D4 — **ui-smoke upload always + no blocking a11y step.** In
      `.github/workflows/ui-smoke.yml` add `if: always()` to the `Upload screenshots` step. In
      `tests/scripts/ci-gate.test.ts`, inside the existing ui-smoke describe (~:174-207), extend
      or add "the screenshot upload runs even when the shot step fails" (`uploadStep.if` is
      `always()`). Add a pure helper `blockingA11ySteps(workflow): string[]` returning the names
      of steps whose `run` or `with` text mentions `a11y` and that neither the step nor its job
      marks `continue-on-error: true`; tests "no workflow step makes an axe result a gate"
      (helper over every `.github/workflows/*.yml` → empty) and "the a11y guard flags a blocking
      a11y step" (helper on an in-memory workflow with one `run: npm run a11y` step → its name).
- [ ] D5 — **Lane table release row.** In `CLAUDE.md` `## Test lanes` (table created by story
      096), make the `release` row's command cell name `npm run test:smoke` (keep 096's budget
      cell "TBD (story 098)"; note in the blocks cell that it is non-blocking until three green
      release runs). If the row is missing because 096 has not landed, stop and report. In
      `tests/scripts/ci-gate.test.ts` add "the lane table's release row names the smoke command
      release.yml runs": reads CLAUDE.md, takes the section after `## Test lanes`, finds the table
      row whose first cell is `release`, asserts it contains `npm run test:smoke`, and asserts a
      release.yml step runs exactly that command.

## Model Hints

- D2 → deliverable-hard: the proof is only honest if the rejection comes from the seeded throw — a
  `NODE_OPTIONS` that Electron ignores, breaks Playwright's own loader, or a launch that simply
  times out for another reason would pass a naive "rejects" assertion, and a main process stuck
  behind Electron's uncaught-exception dialog can leak a process into the next spec.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/scripts/e2e-wiring.test.ts` › "exactly the five smoke specs carry the @smoke
  tag and test:smoke selects them by it" (plus the `--list --grep @smoke` output recorded in Done)
- AC2 → e2e run `npm run test:smoke` on a built tree (runs the five tagged specs; exit 0), plus the
  script assertion in the AC1 test
- AC3 → unit `tests/scripts/ci-gate.test.ts` › "release.yml runs the smoke after the build and
  before the publish"
- AC4 → unit `tests/scripts/ci-gate.test.ts` › "the order guard rejects a release workflow without
  the smoke step or with it after the publish"
- AC5 → e2e `tests/e2e/harness-broken-main.spec.ts` › "a main process that throws on start fails
  the launch" (every smoke spec launches through the same `launchApp` via the `app` fixture, so
  the failure propagates to `test:smoke`'s exit code)
- AC6 → unit `tests/scripts/ci-gate.test.ts` › "the release smoke step does not block yet";
  **manual residue** for the run count: three consecutive release-workflow runs only happen on
  pushes to main on GitHub, after this sprint — the count goes into Done when observed.
- AC7 → unit `tests/scripts/ci-gate.test.ts` › "the screenshot upload runs even when the shot step
  fails"
- AC8 → unit `tests/scripts/ci-gate.test.ts` › "no workflow step makes an axe result a gate" and
  "the a11y guard flags a blocking a11y step"
- AC9 → unit `tests/scripts/ci-gate.test.ts` › "the lane table's release row names the smoke
  command release.yml runs"

## Done

<Leave empty. Filled by `/build <id>` after implementation:

- Short summary (2–5 lines): what was done.
- Commit message (1–2 lines, keywords are enough).
- Verification: build/test/lint result + review outcome; open points/blockers, if any.>
