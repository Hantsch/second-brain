---
id: 096
title: Lane map in CLAUDE.md and a guard that every test file has a lane
status: done # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

As the maintainer, I want CLAUDE.md to say which command runs which tests and which lane blocks,
and I want a test that fails when a test file belongs to no lane, so that /release-prep and
/test-review have a defined command list and no test file can silently run nowhere.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F04): CLAUDE.md:205 points to
"this project's `## Test lanes` table" and no such table exists. `grep -rn "Test lanes" CLAUDE.md
docs .claude` finds only references (release-prep SKILL.md:27, test-review SKILL.md:44,
refine.md:179). Vitest claims `tests/**/*.test.ts|tsx` minus perf files (vitest.config.ts:57-58),
Playwright claims `**/*.spec.ts` under tests/e2e (playwright.config.ts:13-14), and
ci-gate.test.ts:236-264 only guards that the perf lane stays excluded. No test asserts that every
test file is claimed by a config. Today none is unclaimed (344 `.test.ts`, 63 `.test.tsx`, 53
`.spec.ts`), but a `*.test.mts`, a `*.spec.tsx` or a spec outside tests/e2e would run under no
command unnoticed. The 53 specs have no lane at all (run by hand).

## Acceptance Criteria

- [x] **AC1** — CLAUDE.md contains a `## Test lanes` heading with a table of the lanes pr, release, release-prep, perf and ui-smoke, each with its command and whether it blocks.
- [x] **AC2** — The table's budget cells carry no invented number: the pr and release budgets read "TBD (story 098)" and the other lanes read "none" or "warns only".
- [x] **AC3** — A test in `tests/scripts/` fails when a file matching `*.test.*` or `*.spec.*` under `tests/` is claimed by none of vitest.config.ts, vitest.perf.config.ts and playwright.config.ts.
- [x] **AC4** — The same test fails when a file is claimed by more than one of them.
- [x] **AC5** — The guard reads include/exclude patterns from the imported real config objects; a search for a duplicated glob literal such as `*.perf.test.ts` in the guard file returns nothing.
- [x] **AC6** — Seeded defect: adding `tests/core/stray.test.mts` makes the guard red, naming the file; removing it makes it green.
- [x] **AC7** — The guard asserts that the commands named in the table's pr, release-prep and perf rows exist as scripts in package.json.
- [x] **AC8** — The guard runs in `npm test` and contains no wall-clock assertion.

## Open Questions

- ~~Should the guard also cover files outside `tests/` (for example `scripts/` specs), or is
  `tests/` the whole contract?~~ Answered under Decisions: `tests/` is the contract.
- ~~Split into two deliverables, or ship together?~~ Answered under Decisions: one story, two Ds.
- ~~The `release` row names `npm run test:smoke`, which only exists after 097. Name it now with
  AC7 deferred for that row, or land the row with 097?~~ Answered under Decisions: named now,
  marked as landing with 097; AC7 covers only pr, release-prep and perf.

## Decisions (Sprint)

- The guard scans `tests/` only: every config's roots (vitest `tests/**`, Playwright
  `testDir: tests/e2e`) and CLAUDE.md's layout put tests there, and AC3 defines the contract on `tests/`.
- Table and guard ship in one story as two deliverables: the guard reads the table (AC7), so
  separating them would leave one half untested, and both are small.
- The `release` row names `npm run test:smoke` now with the note "lands with story 097"; AC7
  deliberately checks only pr, release-prep and perf, and 097 adds `release` to that check when
  it creates the script.
- Lane cells follow the review's lane table (docs/reviews/2026-10-27-tests-review.md
  `## Test lanes`), except budgets per AC2: pr and release "TBD (story 098)", release-prep and
  ui-smoke "none", perf "warns only"; story 098 updates the cells and the asserted values.
- Glob matching uses Node's built-in `path.posix.matchesGlob` (Node 24, braces supported), so no
  new dependency is added for a guard; `picomatch`/`minimatch` are only transitive.
- AC6's seeded defect is proven by feeding the guard's pure function the real file list plus
  `tests/core/stray.test.mts`, not by writing a file into the repo, because a real file would
  race the parallel vitest forks and could be left behind by a killed run.

## Plan

1. CLAUDE.md gets a `## Test lanes` section directly after `## Quality gates` (outside the
   tech-rules managed block): one table, columns `Lane | Runs | Budget | Blocks`, rows pr,
   release, release-prep, perf, ui-smoke. Commands in backticks so the guard can parse them.
2. New guard `tests/scripts/test-lanes.test.ts` (runs in `npm test` via vitest's include):
   - parses the `## Test lanes` table from CLAUDE.md; asserts the five lanes, their Blocks and
     Budget cells, and that every `npm test` / `npm run <x>` named in the pr, release-prep and
     perf rows is a script in package.json;
   - imports the real config objects (`vitest.config.ts`, `vitest.perf.config.ts`,
     `playwright.config.ts`) and derives one claim per config from `include`/`exclude`/
     `testDir`/`testMatch` - no glob literal in the guard file;
   - a pure `claimsOf(file, claims)` reports which configs claim a file; every file under
     `tests/` matching `*.test.*` or `*.spec.*` must get exactly one;
   - fed synthetic inputs, it names a stray `.test.mts` (unclaimed) and a doubly claimed file.
3. No production code, no workflow and no config file changes.

## Deliverables

- [x] D1 — `## Test lanes` table in CLAUDE.md plus its table guard. Files: `CLAUDE.md` (new
      section right after `## Quality gates`, before `## QA rules`; do not touch the
      `tech-rules:managed` block) and new `tests/scripts/test-lanes.test.ts`. Table columns
      `Lane | Runs | Budget | Blocks`, rows exactly (Lane: Runs / Budget / Blocks):
      pr: `npm run verify` / TBD (story 098) / yes;
      release: build + `npm run test:smoke` (lands with story 097) / TBD (story 098) / yes;
      release-prep: `npm test` + `npm run test:e2e` + `npm run test:perf` + `npm run package` /
      none / by hand; perf: `npm run test:perf` / warns only / no;
      ui-smoke: `npm run shot` / none / no.
      One sentence under the table: every Playwright spec runs under `npm run test:e2e`
      (release-prep); which specs the release lane runs is story 097's job. Guard: read
      CLAUDE.md, slice from `## Test lanes` to the next `## ` heading, parse the table rows into
      `{ lane, runs, budget, blocks }`, extract commands from backticked `npm test` /
      `npm run <name>`. Read package.json scripts as `tests/scripts/ci-gate.test.ts:15` does.
      Tests: "the test lanes table names every lane with its command, budget and whether it
      blocks" (lane set, Blocks and Budget cells exactly as above, Runs non-empty) and "every
      command the pr, release-prep and perf lanes name is a package.json script". Test names
      carry behaviour, no story ids. `npx prettier --check CLAUDE.md` stays green.

- [x] D2 — Claim guard, a second `describe` in `tests/scripts/test-lanes.test.ts`. Import the
      default exports of `../../vitest.config`, `../../vitest.perf.config` and
      `../../playwright.config` (all three are in tsconfig.node.json's include). Build
      `Claim = { name, include: string[], exclude: string[] }` per config: vitest
      `test.include`/`test.exclude` as-is (repo-root relative); Playwright `testMatch` joined
      onto `testDir` (string or string array; throw a clear error on a RegExp so a config change
      cannot pass silently). Match with `path.posix.matchesGlob` on forward-slash repo-relative
      paths (normalise backslashes for Windows). Walk `tests/` with
      `readdirSync(dir, { recursive: true })`, keep files whose basename matches
      `/\.(test|spec)\./`. Pure `claimsOf(file, claims): string[]`. No glob literal
      (any string with `*`, e.g. `*.perf.test.ts`, `**/*.spec.ts`, `tests/**`) may appear in
      the file - the only pattern is the basename regex; plain sample file paths are fine. Tests: "every test file under tests/ is claimed by exactly one config"
      (real tree; the failure message lists each offending file with its claims), "a stray
      .test.mts file is reported as claimed by no config" (real claims, file
      `tests/core/stray.test.mts`, assert it is named with zero claims), "a file two configs
      claim is reported with both names" (real claims plus a copy of the Playwright claim
      under another name, file `tests/e2e/x.spec.ts`). No `Date.now`/`performance.now`/sleep.

## Model Hints

D1, D2 default tier (the glob semantics are the only subtlety and are spelled out in D2).

Review: → default

## Acceptance Tests

No user-facing surface: every line is a unit test in `npm test`, no e2e.

- AC1, AC2 → unit `tests/scripts/test-lanes.test.ts` › "the test lanes table names every lane
  with its command, budget and whether it blocks" (D1)
- AC3 → unit `tests/scripts/test-lanes.test.ts` › "every test file under tests/ is claimed by
  exactly one config" (D2)
- AC4 → unit `tests/scripts/test-lanes.test.ts` › "a file two configs claim is reported with
  both names" (D2)
- AC5 → unit `tests/scripts/test-lanes.test.ts` › "every test file under tests/ is claimed by
  exactly one config" (D2; claims derive from the imported config objects) plus the review's
  search of the guard file for a glob literal (`*.perf.test.ts`, `*.spec.ts`, `tests/**`), which
  must return nothing
- AC6 → unit `tests/scripts/test-lanes.test.ts` › "a stray .test.mts file is reported as
  claimed by no config" (D2); the removed state is the real-tree test being green
- AC7 → unit `tests/scripts/test-lanes.test.ts` › "every command the pr, release-prep and perf
  lanes name is a package.json script" (D1)
- AC8 → unit `tests/scripts/test-lanes.test.ts` › "every test file under tests/ is claimed by
  exactly one config" (the guard file itself is in that list, claimed by the gate config =
  `npm test`); no wall-clock assertion is enforced by `npm run lint` (`no-restricted-syntax`)

## Done

Added the `## Test lanes` table to CLAUDE.md (pr, release, release-prep, perf, ui-smoke) and the guard
`tests/scripts/test-lanes.test.ts`: it parses the table and checks its commands against package.json
scripts, and derives one claim per config from the imported vitest, vitest-perf and Playwright
configs so every `*.test.*`/`*.spec.*` file under `tests/` is claimed by exactly one of them.

Commit message: `096: test lanes table in CLAUDE.md + guard that every test file has exactly one lane`

Verification (narrow gate, `npx vitest run --changed HEAD`; no e2e, none mapped):
- build, lint, typecheck green; changed-run vitest green (5/5 in test-lanes.test.ts).
- AC1, AC2, AC7 table tests; AC3, AC5, AC8 real-tree test; AC4 double-claim test; AC6 stray test: all ran and passed.
- Review (default tier): PASS, no findings to fix. No manual residue.
- `format:check` is red only for docs/requirements/099-*.md and 100-*.md (other S23 stories' refine output),
  not this story's files; left untouched, belongs to those stories.

Decisions: a typecheck error pass (noUncheckedIndexedAccess) in the guard helpers was fixed after D2 with
a `byLane(name)` helper that throws on a missing row. Local Node is 25.6.1 (.nvmrc says 24); `path.posix.matchesGlob` works on both.

tiers: D 2 / hard 0 · review default · cycles 0 · agents 5
