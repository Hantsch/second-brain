# Sprint S23 review — Test lanes you can trust

## Overview

Goal: every test file belongs to a named lane, the release starts the built app, CI minutes are reported, the blocking lane stops waiting on real time. Committed directly on `dev` (user decision, no sprint branch).

| Story | Status  | Commit                                                                                    |
| ----- | ------- | ----------------------------------------------------------------------------------------- |
| 096   | done    | 2b2f00c — test lanes table in CLAUDE.md + guard                                           |
| 097   | blocked | 34e2f46 — WIP, D1 only (`@smoke` tags, `test:smoke`)                                      |
| 098   | done    | 8d6b922 — PR-only CI recorded as deviation, verify lane reports minutes vs 6 min budget   |
| 099   | done    | 5735587 — write-stability gate under fake timers, llamacpp probe counter                  |
| 100   | done    | b66b733 — e2e absence checks wait on a signal, quit test in its own spec                  |
| 101   | done    | bc16550 — hook cases split into PR-lane cheap case + shell lane, eol guard fails honestly |
| 102   | done    | 4c5907d — win-target / engines.node pinned by property, caps proven by content            |

## Implemented stories

- **096:** `## Test lanes` table in CLAUDE.md and `tests/scripts/test-lanes.test.ts`, which fails on a test file claimed by zero or more than one config.
- **098:** CI stays PR-to-main only (user decision), recorded as a `/test-gates` deviation; `verify.yml` reports the lane's minutes against a 6 min budget (`scripts/lib/lane-minutes.mjs`).
- **099:** `src/core/vault/write-stability.ts` replaces chokidar's `awaitWriteFinish` so the window runs under fake timers; the llamacpp test counts probes instead of reading the clock.
- **100:** navigation-guard and update-check specs assert a signal, not a sleep; the quit test is `tray-quit.spec.ts`.
- **101:** each hook keeps one cheap case in the PR lane; the rest run via `npm run test:shell`. The eol test fails instead of skipping when git is broken.
- **102:** build-config and prompt-cap tests assert properties; `engines.node` is `>=24` and pinned to `.nvmrc`.

## Findings & decisions

- **User decisions:** CI stays PR-only, no push trigger on dev, no pre-push hook (098). Smoke runs against the electron-vite build (097). Index-settle second cut out of scope (099). Undici shim kept (102). The sprint Notes line "098 fills 096's budget cell from a measurement" is obsolete: the cell holds the 6 min budget.
- **099 changed product code:** a small new gate in `src/core/vault/`, needed so the window can be tested with fake timers.
- **Unfixed minor review notes**, all recorded in the story Done sections and collected as one follow-up line in the roadmap: 098 (loose `toContain('6')`, `endedAtMs` unvalidated, CLI modes not run by hand), 099 (no test pins the `watch.ts` wiring, `statSize` rejection unhandled in the gate), 100 (raw `app.app.evaluate` in navigation-guard), 101 (file URL from a string root in `git-checkout.ts`), 102 (redundant assertion in the transcript test).
- Trail timestamps for 096 and 097 use a `YYYY-MM-DD HH:MM` format (shell-produced, monotonic), unlike the orchestrator's `HH:MM:SS`.

## Blocked / open

- **097, D2 plan gap.** Playwright 1.62.1 deletes `NODE_OPTIONS` in `_electron.launch`, so the planned broken-start injection never reaches Electron. Fixing it needs an optional `mainEntry` (or an `args` prefix) in `scripts/lib/app-harness.mjs`, which the "harness as is" decision ruled out. **Decision for the user:** allow the small harness seam (recommended: `mainEntry`), then `/refine 097` and rebuild D2–D5. D1 (tags and script) is done. The `Smoke` step in `release.yml`, the ui-smoke upload fix and the release row of the lane table are not started.

## Regression gate

`dev` @ 4c5907d: build green (0.15 min), `npm test` green (1.0 min, 4938 tests), `npm run test:e2e` green (3.6 min, 122 passed). `e2e-all` is `none`. No failures, nothing quarantined.

## Acceptance

Every criterion of 096 and 098–102 was proven by a named test or a one-time seeded-defect check recorded in the story's Done section. Manual residue: none for these stories. 097's criteria for D2–D5 are unproven; its AC6 (three green release runs before the smoke blocks) was always going to be a manual residue. No `testplan.md`: nothing here needs a human walk-through.

## Tier record

| Story | Ds  | hard | Review  | Cycles | Agents | Build min |
| ----- | --- | ---- | ------- | ------ | ------ | --------- |
| 096   | 2   | 0    | default | 0      | 5      | 4         |
| 097   | 2/5 | 1    | none    | 0      | 2      | 2         |
| 098   | 3   | 0    | default | 0      | 5      | 4         |
| 099   | 2   | 1    | default | 1      | 5      | 6         |
| 100   | 4   | 0    | default | 1      | 7      | 8         |
| 101   | 5   | 0    | default | 1      | 7      | 8         |
| 102   | 3   | 0    | default | 0      | 5      | 6         |
| Total | 21  | 2    |         | 3      | 36     | 38        |

No second-stage (hard) review ran this sprint, so there is nothing to compare against the default review.
