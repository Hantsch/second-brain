---
id: 098
title: CI stays PR-only, recorded as a deviation, and the PR lane reports its minutes
status: done # draft -> ready -> in-progress -> done
created: 2026-10-27
---

<!-- Filename kept stable (098-ci-runs-on-dev-...) for links; the title follows the sprint decision. -->

## Requirement

As the maintainer, I want the PR-only CI trigger written down as a deliberate deviation with its
reason, and I want the PR lane to say how long it took, so that nobody "fixes" the missing dev
trigger back in and a lane drifting past its budget shows up as a warning instead of staying green.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F02, F08): verify.yml:3-6,
perf.yml:6-10 and ui-smoke.yml:3-6 trigger only on `pull_request` into main. Story 065 AC1
(done/065-the-gate-runs-on-every-push.md:28) says "on every push and pull request"; commit e042b80
(2026-09-25) removed `push:` and CLAUDE.md records no reason. The user has now confirmed PR-only is
deliberate (see Decisions). ci-gate.test.ts:52-58 and :224-235 already pin PR-only triggers.
verify.yml runs one step, `npm run verify` (:38-39), with no duration output and no `::warning`.
GitHub records step durations, but nothing compares them to the 6 min (aim 4) PR-lane budget of
the test-gates rules.

## Acceptance Criteria

- [x] **AC1** — verify.yml, perf.yml and ui-smoke.yml get no `push` trigger: CI stays on pull requests into main. The existing ci-gate.test.ts tests "triggers only on pull_request targeting main" and "does not trigger on push to any branch" stay green and unedited.
- [x] **AC2** — CLAUDE.md `## House rules` carries a `/test-gates` deviations entry: CI runs only on pull requests into main (no push trigger on dev, no `.githooks/pre-push`), with the reason (saves runner minutes, no noise while working on dev; tests run at the PR, smoke tests at the release), naming verify.yml, ui-smoke.yml and perf.yml and that it supersedes story 065 AC1 (commit e042b80). A test proves the entry exists and that no `.githooks/pre-push` exists.
- [x] **AC3** — verify.yml's last step writes the PR lane's elapsed minutes and its budget into `$GITHUB_STEP_SUMMARY`, and runs also when `npm run verify` failed (not when cancelled).
- [x] **AC4** — When the lane ran longer than its budget, that step emits exactly one `::warning` naming minutes and budget; within budget (including exactly at it) it emits none. Being slow never fails the job. The budget is one named value, `LANE_BUDGET_MINUTES`, in verify.yml.
- [x] **AC5** — The CLAUDE.md `## Test lanes` pr row (from story 096) names where it runs as PRs into main, and its budget cell replaces "TBD (story 098)" with the same number as `LANE_BUDGET_MINUTES`; a test compares the two.
- [x] **AC6** — No wall-clock in the new tests: the minutes logic is a pure function with both timestamps injected as literals, and no test measures elapsed time with `Date.now` or `performance.now` (the ESLint gate-test rule stays green).

## Open Questions

- ~~Was PR-only a deliberate decision to save runner minutes?~~ Answered (User): yes, see Decisions.
- ~~A `pull_request` trigger on dev vs push?~~ Moot: no dev trigger at all.
- ~~A dev push followed by the dev-to-main PR runs verify twice?~~ Moot: no dev trigger at all.
- ~~Warn on one run's elapsed time, or on a median over recent runs?~~ Answered: one run, see Decisions.
- ~~tsc-twice removal stays out of scope?~~ Answered: yes, see Decisions.

## Decisions (Sprint)

- **(User)** Was PR-only CI deliberate: yes. CI runs only on PRs to main, never on pushes to dev (saves runner minutes, no noise while working on dev); tests run at the PR, smoke tests at the release. Do NOT add a push trigger on dev. Record a CLAUDE.md deviation row with this reason, keep the PR-lane minutes report, and add no pre-push hook. This overrides the sprint goal wording "CI runs on every push to dev"; refine adapts the story and ACs accordingly.
- The warning compares one run's elapsed time to the budget, because a median needs the GitHub API and a token, which the gate's "no secrets" guard (ci-gate.test.ts:99-116) rules out.
- The budget is 6 min (the test-gates PR-lane budget, aim 4), because no CI measurement exists yet; each PR run's summary now records the real minutes, and changing the number is a later, measured decision.
- The old AC5 (slowest vitest tests in the job summary) is dropped, because F08 asks only for minutes against the budget, and the per-step durations GitHub already shows are enough to start a diagnosis when the warning fires.
- The old AC7 condition "measured median once one dev push run exists" is dropped, because no dev push run will ever exist; the pr budget cell carries the budget the workflow enforces.
- Removing the second tsc run stays out of scope, because nothing has measured the lane over budget yet.
- The elapsed time is measured from a step right after setup-node to the report step, because the report script needs the checkout and the `.nvmrc` Node; the missing ~15 s of checkout and setup are noise against a 6 min budget.
- The minutes logic lives in `scripts/lib/lane-minutes.mjs` with a `.d.mts`, mirroring `handoff-check.mjs`, because a pure function is testable without a clock while the workflow only wires env vars.

## Plan

Prerequisite: story 096 has landed the `## Test lanes` table in CLAUDE.md (pr row budget "TBD (story 098)").

1. **D1 — pure minutes report.** `scripts/lib/lane-minutes.mjs` exports
   `laneReport({ startedAtMs, endedAtMs, budgetMinutes })` → `{ summary, warning }` and a CLI entry
   (`start` appends `LANE_STARTED_AT=<ms>` to `$GITHUB_ENV`; `report` reads `LANE_STARTED_AT`,
   `LANE_BUDGET_MINUTES`, now, appends the summary to `$GITHUB_STEP_SUMMARY`, prints the warning).
   Unit test with injected timestamps.
2. **D2 — wire it into verify.yml.** Job-level `env: LANE_BUDGET_MINUTES: 6`; a start step after
   setup-node; a last step with `if: ${{ !cancelled() }}` running the report. ci-gate.test.ts gets
   a describe asserting the wiring, plus the lane map's pr budget cell equals the workflow value.
   CLAUDE.md pr row budget cell updated.
3. **D3 — deviation entry.** CLAUDE.md `/test-gates` deviations list under `## House rules`, plus
   one ci-gate.test.ts test that the entry exists and `.githooks/pre-push` does not.

No trigger changes in any workflow. Order D1 → D2 → D3 (D3 independent).

## Deliverables

- [x] D1 — **Pure lane-minutes report with a CLI.** Create `scripts/lib/lane-minutes.mjs` and
      `scripts/lib/lane-minutes.d.mts` (mirror the shape of `scripts/lib/handoff-check.mjs` +
      `handoff-check.d.mts`: header comment saying why, pure functions, exact type declaration, no
      `any`). Export `laneReport({ startedAtMs, endedAtMs, budgetMinutes })` returning
      `{ summary: string, warning: string | null }`: `summary` is one Markdown line like
      `PR lane: 4.3 min of a 6 min budget` (minutes to one decimal); `warning` is `null` when elapsed
      ≤ budget, else one line starting `::warning title=PR lane over budget::` naming elapsed minutes
      and budget. A missing, non-numeric or non-positive `budgetMinutes` or `startedAtMs` throws an
      `Error` with a clear message (fails loudly, never reports a fake number). The CLI part runs only
      when the file is executed directly: `node scripts/lib/lane-minutes.mjs start` appends
      `LANE_STARTED_AT=<Date.now()>\n` to the file named by `GITHUB_ENV`; `... report` reads
      `LANE_STARTED_AT` and `LANE_BUDGET_MINUTES` from env, calls `laneReport` with `Date.now()`,
      appends `summary + '\n'` to `GITHUB_STEP_SUMMARY`, writes the warning (if any) to stdout via
      `process.stdout.write`, and exits 0. Test file
      `tests/scripts/lane-minutes.test.ts` (import like `tests/scripts/handoff-check.test.ts` does)
      with the tests "a run within budget writes the minutes and no warning", "a run over budget emits
      one ::warning naming the minutes and the budget", "a run exactly at the budget does not warn",
      "a missing or non-numeric budget fails loudly". All timestamps are literals; no `Date.now` or
      `performance.now` in the test file.
- [x] D2 — **verify.yml reports its minutes against one budget.** Edit
      `.github/workflows/verify.yml`: add `env: LANE_BUDGET_MINUTES: 6` on the `verify` job; add a
      step `name: Start lane clock`, `run: node scripts/lib/lane-minutes.mjs start` directly after
      the `actions/setup-node` step; add a last step `name: Report lane minutes`,
      `if: ${{ !cancelled() }}`, `run: node scripts/lib/lane-minutes.mjs report`. Do not touch the
      `on:` block, do not add `continue-on-error` or `|| true` (existing guards forbid them). Keep the
      `npm run verify` step exactly as is. In `tests/scripts/ci-gate.test.ts` add a describe "the PR
      lane reports its minutes against one budget" (reuse the existing `verifyWorkflow` /
      `verifySteps` parse at :32-50) with tests "verify.yml sets LANE_BUDGET_MINUTES once and reports
      after npm run verify" (job env holds a positive number; the start step precedes `npm ci`; the
      report step is the last step, runs `lane-minutes.mjs report`, and its `if` contains
      `!cancelled()`) and "the pr row of the lane map names the same budget as verify.yml" (read
      CLAUDE.md, find the `## Test lanes` table row whose first cell is `pr`, take the first number in
      its budget cell, expect it to equal `LANE_BUDGET_MINUTES`). For reading the table, reuse the
      lane-table reader story 096 wrote in `tests/scripts/` (grep for `Test lanes`); if it is not
      exported, export it from its file instead of writing a second parser. In `CLAUDE.md`, change
      only the pr row: budget cell from "TBD (story 098)" to `6 min (warns), aim 4`, and its
      where-it-runs cell reads verify.yml on PRs into main. Do not edit the existing tests at
      ci-gate.test.ts:52-59 and :224-232. Files: verify.yml, ci-gate.test.ts, CLAUDE.md (+ the 096
      reader file only if an export is needed).
- [x] D3 — **The PR-only decision is a recorded deviation.** In `CLAUDE.md` `## House rules`,
      after the `/ui-verify deviations:` list, add a `/test-gates deviations:` list with one bullet:
      CI runs only on pull requests into main — verify.yml, ui-smoke.yml and perf.yml have no `push`
      trigger, and there is no `.githooks/pre-push` — because it saves runner minutes and avoids noise
      while working on dev; tests run at the PR, smoke tests at the release. It supersedes story 065
      AC1 ("every push"), narrowed by commit e042b80. Keep the existing line style (backticked
      names, wrapped at ~100 chars, prettier-clean). In `tests/scripts/ci-gate.test.ts` add a test
      "CLAUDE.md records the test-gates deviation for PR-only CI" in a describe "CI stays on pull
      requests into main": CLAUDE.md contains a line starting `` `/test-gates` deviations`` and the
      text after it (up to the next `##` heading or blank-line-separated block) names `verify.yml`;
      and `.githooks/pre-push` does not exist (`existsSync`). Files: CLAUDE.md, ci-gate.test.ts.

## Model Hints

All Ds default tier.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/scripts/ci-gate.test.ts` › "triggers only on pull_request targeting main" and › "does not trigger on push to any branch" (existing, unedited)
- AC2 → unit `tests/scripts/ci-gate.test.ts` › "CLAUDE.md records the test-gates deviation for PR-only CI" (D3)
- AC3 → unit `tests/scripts/lane-minutes.test.ts` › "a run within budget writes the minutes and no warning" (D1) + unit `tests/scripts/ci-gate.test.ts` › "verify.yml sets LANE_BUDGET_MINUTES once and reports after npm run verify" (D2)
- AC4 → unit `tests/scripts/lane-minutes.test.ts` › "a run over budget emits one ::warning naming the minutes and the budget", › "a run exactly at the budget does not warn", › "a missing or non-numeric budget fails loudly" (D1) + the D2 wiring test above
- AC5 → unit `tests/scripts/ci-gate.test.ts` › "the pr row of the lane map names the same budget as verify.yml" (D2)
- AC6 → lint `npm run lint` (eslint.config `no-restricted-syntax` gate-test rule on `tests/**`) over `tests/scripts/lane-minutes.test.ts` and `tests/scripts/ci-gate.test.ts`; the D1 tests above inject both timestamps as literals

## Done

Added `scripts/lib/lane-minutes.mjs` (+ `.d.mts`): pure `laneReport` plus a `start`/`report` CLI. verify.yml now has job-level `LANE_BUDGET_MINUTES: 6`, a start step after setup-node and a last `!cancelled()` report step. CLAUDE.md pr row names verify.yml on PRs into main with budget `6 min (warns), aim 4`; a `/test-gates` deviations entry records PR-only CI. No trigger changes.

Commit message: `098: PR-only CI recorded as deviation, verify lane reports minutes vs 6 min budget`

Verification: narrow gate (`npx vitest run --changed HEAD`, no e2e mapped) green: build, lint, typecheck, tests (40). Review 1 (default): PASS, no fixes needed. AC1-AC6 verified by the tests named in `## Acceptance Tests`, all ran and passed; AC6 by lint. No manual residue.

- `format:check` is red only on `docs/requirements/100-...md` (another story's refine file, not touched here); all 098 files are prettier-clean.
- Decisions: moved the lane-table reader from `test-lanes.test.ts` into `tests/scripts/lane-table.ts` (shared with ci-gate); `test-lanes.test.ts` pr budget assertion updated to the new value (release row stays TBD for 097). The where-it-runs text sits in the table's Runs column.
- Unfixed minor review notes: `toContain('6')` in the warning test is loose; test-lanes.test.ts repeats the budget string that ci-gate compares; `endedAtMs` is not validated (CLI always passes `Date.now()`).

tiers: D 3 / hard 0 · review default · cycles 0 · agents 5
