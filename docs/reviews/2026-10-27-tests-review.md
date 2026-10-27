# Tests review, 2026-10-27

Commit `a590fda` on `dev`, tree clean. Scope: tests and tooling only. 3 reviewers (lanes and gates,
suite value, runtime and flakiness), 21 raw findings, 14 merged, all 14 verified (28 agents). Story
drafts: **096-102**. Read the story map to act, the findings table as evidence.

## Verdict

**Good first.** The suite enforces most of the `test-gates` rules mechanically: an ESLint rule bans
elapsed-time assertions, the 4 `*.perf.test.ts` files are excluded from `npm test` by config and run
advisory only, timeouts are central, retries are 0 with the reason written down
(playwright.config.ts:24-27), the time zone is pinned, every workflow reads `.nvmrc` and
`tests/scripts/ci-gate.test.ts:129-149` enforces it, and no test is skipped or quarantined. All four
mandatory tests exist (stale-hash conflict, no-evidence answers, index rebuild, no-model in 17 files).
344 `.test.ts` + 63 `.test.tsx` + 53 `.spec.ts` files, none unclaimed by a config.

**Structural causes.**

1. **The lane map does not exist.** CLAUDE.md:205 points to a `## Test lanes` table that is not
   there, so /release-prep and /test-review have no command list and no budget (F04, F08, F01).
2. **Nothing starts the packaged app before it is published.** release.yml re-runs `npm run verify`;
   the 53 e2e specs (7,395 lines) run in no CI workflow (F01, F12, F05, F07).
3. **CI narrowed without a recorded reason.** Commit e042b80 removed the `push` trigger, so story 065
   AC1 no longer holds and dev work gets its first CI signal at the dev-to-main PR (F02).
4. **Real time leaks into the blocking lane.** A real file watcher with 150 ms appends, 19 sleeps in
   13 files, one elapsed-time bound, 39 PowerShell-spawning hook cases (F03, F13, F06).
5. **Drift in the records.** Roadmap flake lines are stale after 5b39956 (F09); config-text pins,
   `engines`, and prompt-cap tests mirror their sources (F10, F11, F14).

**Before everything else:** F01. A broken package can reach installed copies through the updater
feed while a flaky unit test can block a release. Mitigation that exists: /sprint runs the full e2e
locally once per sprint, not in CI and not on the packaged build.

## Story map

| #   | Story                                                                           | Findings      | Prio                                         | Effort | After |
| --- | ------------------------------------------------------------------------------- | ------------- | -------------------------------------------- | ------ | ----- |
| 096 | Lane map in CLAUDE.md and a guard that every test file has a lane               | F04           | P1 (prerequisite of 097, 098; judge said P2) | S      | -     |
| 097 | The release starts the built app before it publishes                            | F01, F12      | P1                                           | M      | 096   |
| 098 | CI runs on dev and the PR lane reports its minutes                              | F02, F08      | P2                                           | S      | 096   |
| 099 | The blocking lane stops waiting on real time                                    | F03, F13      | P2                                           | M      | -     |
| 100 | e2e absence checks wait on a signal; the quit test gets its own spec            | F05, F07      | P3                                           | S      | 097   |
| 101 | Hook tests keep one cheap case per hook in the PR lane; eol test fails honestly | F06           | P3                                           | S      | 096   |
| 102 | Test and config drift drive-bys                                                 | F10, F11, F14 | P3                                           | S      | -     |

Suggested sprints, each demonstrable alone:

- **Sprint A (P1):** 096, 097. Demo: a release run that launches the built app, `## Test lanes` in
  CLAUDE.md, a red guard test on a stray test file.
- **Sprint B (P2):** 098, 099. Demo: a push to dev runs CI with a minutes line in the summary; the
  watcher test passes under an injected clock.
- **Opportunistic (P3):** 100, 101, 102 with the next edit of the same files.

## Test lanes

Decided lane map and moves: `2026-10-27-work/4-lanes.md`, in short:

| Lane         | Runs                                                                      | Budget               | Blocks  |
| ------------ | ------------------------------------------------------------------------- | -------------------- | ------- |
| pr           | `npm run verify`                                                          | 6 min median (aim 4) | yes     |
| release      | build + `npm run test:smoke` (5 specs)                                    | 6 min                | yes     |
| release-prep | `npm test` + `npm run test:e2e` + `npm run test:perf` + `npm run package` | none, recorded       | by hand |
| perf         | `npm run test:perf`                                                       | warns only           | no      |
| ui-smoke     | `npm run shot`                                                            | advisory             | no      |

Moves: 5 e2e specs (smoke, search-keyboard, ask-citation-in-app, journal-close, task-no-model) to the
release lane (096/097); the other 48 to release-prep (096/097); hook-test heavy cases out of the PR
lane (101); watcher case rewritten (099); the quit test into its own spec (100). Minutes before and
after: not measured. No CI data and no earlier test-review exists; the only numbers are local, S22
review: build <1 min, `npm test` 1.7 min, e2e 3.5 min (before 5b39956). Story 098 adds the
measurement, then the budget cell in 096's table is filled from it. No move deletes coverage.

## Findings

Check: `refuter` = survived the refuter, `partly` = the refuter corrected it. All 14 were also
`judged` by a value judge.

| Id  | Sev (corrected)                   | Finding                                                                                         | Check   | Story    |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------- | ------- | -------- |
| F01 | high                              | Release publishes an app no test started; 53 e2e specs in no CI lane                            | refuter | 097, 096 |
| F02 | medium                            | No CI on `dev`; verify.yml PR-only since e042b80 (story 065 AC1 regressed)                      | refuter | 098      |
| F03 | medium                            | Real watcher (watch.test.ts:196-212) and 19 sleeps in 13 files in the blocking lane             | refuter | 099      |
| F04 | medium                            | No `## Test lanes` table; no guard that each test file has a lane                               | refuter | 096      |
| F05 | medium                            | 3 fixed `waitForTimeout` absence checks (300 ms, 500 ms, 4 s)                                   | refuter | 100      |
| F06 | low (skips) / medium (spawn cost) | 3 hook suites, 39 PowerShell-spawning cases at 120 s in the PR lane; eol test skips without git | partly  | 101      |
| F07 | medium                            | tray.spec.ts quit test must run last in a shared app                                            | refuter | 100      |
| F08 | low                               | Nothing checks PR-lane minutes against the budget (step durations exist in GitHub)              | partly  | 098      |
| F09 | low                               | Roadmap flake follow-ups stale after 5b39956 (ROADMAP.md:9, :68, :80)                           | refuter | -        |
| F10 | low                               | Config-text tests pin literals (win.target list, README sentence)                               | refuter | 102      |
| F11 | low                               | `engines.node` >=20.19 vs `.nvmrc` 24; undici shim only for Node <22.10                         | refuter | 102      |
| F12 | low                               | ui-smoke runs no axe pass; upload step lacks `if: always()`                                     | refuter | 097      |
| F13 | low                               | One elapsed-time assertion, llamacpp-lifecycle.test.ts:659                                      | refuter | 099      |
| F14 | low                               | 3 prompt-length caps repeat builder constants (jsonl.test.ts:158 is not one)                    | partly  | 102      |

**Left out on purpose:**

- **F09** has no story. It is doc-only (three ROADMAP.md lines); `/roadmap check` closes it after one
  `npm test` at HEAD. The claim that a release decision waits on that status line is overstated.
- **Dropped by the merge (no file:line):** overlapping e2e specs, fix-commit churn.
- **Not proposed:** a lint rule against sleeps (the elapsed-time rule exists; triage the hits first),
  a generic "absence helper", removing tsc-twice (optimise only after 098 measures), running all 53
  specs in CI.

## Method and limits

- **Dimensions:** lanes and gates, suite value, runtime and flakiness (3 sonnet reviewers); merge: 1
  opus; verify: 14 refuters + 14 value judges (sonnet); story writers (sonnet).
- **Time:** review 3 min (20:41-20:44), merge 10 min, verify batches 1 and 2 about 1 min each.
- **Unverified ids:** none.
- **Commit:** `a590fda`, branch `dev`, tree clean at start.
- **Not covered:** no suite was run and `gh` is not installed here, so CI medians, the 20 slowest
  tests and branch protection are unknown (treated as unprotected). tests/renderer (79 files) was
  read only by grep counts; tests/core/overview was not read in full. The merge agent corrected about
  a dozen reviewer line citations against the commit.
