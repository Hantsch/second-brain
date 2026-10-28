---
id: 101
title: Hook tests keep one cheap case per hook in the PR lane; eol test fails honestly
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

The maintainer wants the blocking PR lane to spawn as few real PowerShell processes as possible
while the Windows-only hook coverage stays whole, and wants the line-ending guard to report a
broken environment as a failure instead of a silent skip. Heavy process spawns in the lane that
blocks a merge have already destabilised neighbouring tests, and a guard that skips when git is
missing reports green having checked nothing.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F06): 3 hook suites run
`describe.runIf(process.platform === 'win32')` with `TIMEOUT = 120_000`:
`tests/core/agent/hook-run-report.test.ts:19,:27-28`, `hook-shell-guard.test.ts:58` and
`hook-wiki-check.test.ts:39`, 39 cases in total, each spawning Windows PowerShell. They sit in
`npm test`, the PR lane. `docs/sprints/done/S20/review.md:95-96` records
`tests/renderer/journal.test.tsx` as flaky under load until story 085 capped its PowerShell spawns,
and commit 55e1985 fixed these hook tests failing only on the Windows runner. All CI runs on
`windows-latest`, so the platform skip does not fire there; the cost is spawn count, not skipped
coverage. `tests/scripts/eol-normalization.test.ts:36` and `:64` use `it.skipIf(!gitAvailable)`;
`gitAvailable` (`:21-33`) is false when `git` is not on PATH even inside a checkout, so the eol
guard reports green without running. The comment at `:15-20` protects the downloaded-zip case,
which is detectable by a missing `.git`, not a missing `git`.

## Acceptance Criteria

- [ ] **AC1** — `eol-normalization.test.ts` fails (does not skip) when a `.git` entry exists at the
      repo root and `git` cannot be run; a test that simulates this (PATH without git, `.git`
      present) is red on the old code and green on the new.
- [ ] **AC2** — `eol-normalization.test.ts` still skips, with a stated reason, when no `.git`
      exists at the repo root (the downloaded-zip case), and a test covers that branch.
- [ ] **AC3** — `grep -n "skipIf(!gitAvailable)" tests/scripts/eol-normalization.test.ts` returns
      nothing.
- [ ] **AC4** — In `hook-run-report`, `hook-shell-guard` and `hook-wiki-check`, exactly one case
      per hook script stays in a file included by `vitest.config.ts` (the PR lane), and that case
      passes on Windows.
- [ ] **AC5** — The remaining heavy spawn cases of the 3 suites sit in files that `vitest.config.ts`
      excludes and that a named command runs (the release-prep lane command in CLAUDE.md
      `## Test lanes`, as defined by story 096); that command exits 0 on Windows.
- [ ] **AC6** — The number of hook test cases before and after is equal: the sum of `it(` cases
      across the moved and kept files is 39, and no case is deleted or weakened; each moved case
      appears once.
- [ ] **AC7** — Story 096's guard test passes: every test file is claimed by exactly one config or
      lane after the move. A moved file claimed by no command fails it.
- [ ] **AC8** — Seeding a defect in each of the 3 hook scripts (for example inverting one decision)
      turns the kept cheap case red in the PR lane.
- [ ] **AC9** — `tests/e2e/agent-terminal.spec.ts` has no diff.

## Open Questions

- ~~Naming of the moved files: `*.shell.test.ts` included only by a release-prep config, or a
  `tests/full/` folder? Either needs a config the guard from 096 understands.~~ Answered: see
  Decisions (Sprint), 1.
- ~~Which case is "cheap" for each hook (fewest spawns, still proves the hook works end to end)?~~
  Answered: see Decisions (Sprint), 2.
- ~~Does the release-prep command run the moved files through a new config, or through
  `npm test` with an include switch? Moving without a command that runs them is forbidden.~~
  Answered: see Decisions (Sprint), 3.
- ~~Order: this story is after 096 in the story map. Without the guard and the lane table, the
  moved files have no lane; is 096 a hard prerequisite, or can the move ship together with a
  minimal command?~~ Answered: see Decisions (Sprint), 4.
- ~~Refuter severity: low for the skips, medium for the spawn cost. Is the spawn-cost reframe
  enough to justify the story, or is the eol fix alone worth shipping first?~~ Answered: see
  Decisions (Sprint), 5.

## Decisions (Sprint)

1. Moved cases go to `<same name>.shell.test.ts` beside the original, matched by a `SHELL_TESTS`
   glob exported from `vitest.config.ts` and run by a new `vitest.shell.config.ts` /
   `npm run test:shell` — it mirrors the existing perf lane (`PERF_TESTS`,
   `vitest.perf.config.ts`) that 096's guard already reads, and keeps hook tests next to their
   module instead of in a `tests/full/` side tree.
2. Kept PR-lane case per hook: run-report › "a Gaston skill run ends with exactly one report that
   Gaston's reader parses" (2 spawns), shell-guard › "a char array cast is blocked as a dynamic
   command" (3 spawns, asserts the specific reason so a crashing guard is red too), wiki-check ›
   "a wiki change without a new log entry is reported when the session stops" (2 spawns, walks
   both PostToolUse and Stop) — each is the fewest-spawn existing case that asserts a decision
   only a working script produces.
3. The release-prep lane runs the moved files through the new config and script, not through an
   include switch on `npm test` — a separate config is what 096's guard can claim a file by.
4. 096 is a hard prerequisite and is built first in this sprint; this story only adds the new
   config to 096's guard and `npm run test:shell` to the release-prep row of its table.
5. Both parts ship together: the sprint scope was fixed by the user at the cut, and the eol fix
   is one small deliverable of this story.
6. AC6's "39" is the review's figure; a grep finds 36 test call sites (9 / 16 / 11) and several
   hundred `each` rows, so the binding proof is that the set of collected test names
   (`npx vitest list`) is identical before and after the move, rows included.
7. Each suite's setup (`session()`, `decide()`/`expectBlocked…` helpers, `beforeAll` vault) moves
   to `tests/helpers/hooks/<hook>.ts` so the kept and the moved file share it instead of copying
   it (CLAUDE.md: reuse instead of copy).
8. AC1 simulates "git cannot be run" by injecting the git executable name into the detection
   helper (a name that does not exist) instead of rewriting PATH — Windows' `Path`/`PATH`
   casing makes a PATH override unreliable, and the injected name fails the same way.
9. AC3, AC6, AC8 and AC9 are one-time build checks recorded under `## Done`, not permanent
   tests — a test pinning a grep result, a case count or a seeded defect would be padding that
   outlives the move.

## Plan

1. **Lane plumbing (D1).** `vitest.config.ts` exports `SHELL_TESTS = 'tests/**/*.shell.test.ts'`
   and excludes it next to `PERF_TESTS`. New `vitest.shell.config.ts` mirrors
   `vitest.perf.config.ts` (spread the gate config, `include: [SHELL_TESTS]`). `package.json`
   gets `"test:shell": "vitest run --config vitest.shell.config.ts"`. CLAUDE.md `## Test lanes`
   (written by 096): the release-prep row adds `npm run test:shell`. 096's lane guard learns the
   new config so every file is still claimed exactly once.
2. **Before any move (D2 start):** save the baseline name set:
   `npx vitest list tests/core/agent/hook- > <tmp>/before.txt` (Windows).
3. **Per hook (D2, D3, D4):** extract the suite's setup to `tests/helpers/hooks/<hook>.ts`,
   keep the chosen cheap case in the original file, move every other case verbatim (same
   names, same assertions, same `TIMEOUT`, same `describe.runIf(win32)`) into
   `tests/core/agent/<hook>.shell.test.ts`.
4. **eol guard (D5):** a helper decides from a `.git` entry (file or folder) at the repo root:
   no `.git` → skip with a reason in the describe title; `.git` present → the two checks run, and
   a missing `git` makes them throw (red). Helper tests cover both branches.
5. **Build checks (recorded in Done):** name-set diff before/after (AC6), one seeded defect per
   hook script turning its kept case red (AC8), `grep` for AC3, `git diff --stat` for AC9,
   `npm test` and `npm run test:shell` exit 0.

Files: `vitest.config.ts`, `vitest.shell.config.ts` (new), `package.json`, `CLAUDE.md`, 096's
guard test, `tests/helpers/hooks/{run-report,shell-guard,wiki-check}.ts` (new),
`tests/core/agent/hook-{run-report,shell-guard,wiki-check}{,.shell}.test.ts`,
`tests/helpers/git-checkout.ts` (new), `tests/scripts/eol-normalization.test.ts`.
`.claude/hooks/*.ps1` templates and `tests/e2e/agent-terminal.spec.ts` are not touched.

## Deliverables

- [ ] D1 — **Shell lane exists and is claimed.** `vitest.config.ts`: export
      `SHELL_TESTS = 'tests/**/*.shell.test.ts'` (comment: PowerShell-spawning hook cases, run
      in release prep, kept out of the PR lane for spawn count) and add it to `exclude` beside
      `PERF_TESTS`. New `vitest.shell.config.ts` mirroring `vitest.perf.config.ts`: spread the
      gate config, `include: [SHELL_TESTS]`, `exclude: configDefaults.exclude`; no timeout
      change (the files carry their own `TIMEOUT`). `package.json` script
      `"test:shell": "vitest run --config vitest.shell.config.ts"`. CLAUDE.md `## Test lanes`
      table (added by story 096): release-prep row's command list gains `npm run test:shell`.
      The lane guard story 096 added under `tests/scripts/` (reads include/exclude from the
      imported config objects) imports `vitest.shell.config.ts` as one more claiming config,
      and its package.json-script check covers `test:shell` via the release-prep row. Accept:
      096's guard green with the new config; `npm run test:shell` is first run after D2 (no
      `passWithNoTests` — an empty lane must not report green).
- [ ] D2 — **run-report split.** Before touching any hook file, record the baseline:
      `npx vitest list tests/core/agent/hook- > %TEMP%/hook-before.txt`. Move `session()` and
      its imports from `tests/core/agent/hook-run-report.test.ts` into
      `tests/helpers/hooks/run-report.ts` as a factory (e.g. `createRunReportSessions()`
      returning `{ session, cleanup }`, holding its own `counter` and `cleanups`). Keep in
      `hook-run-report.test.ts` only "a Gaston skill run ends with exactly one report that
      Gaston's reader parses"; move the other 8 cases verbatim to
      `tests/core/agent/hook-run-report.shell.test.ts` (same `describe` title, same
      `describe.runIf(process.platform === 'win32')`, same `TIMEOUT`). Accept: both files green
      on Windows (`npx vitest run tests/core/agent/hook-run-report.test.ts`,
      `npx vitest run --config vitest.shell.config.ts hook-run-report`).
- [ ] D3 — **shell-guard split.** Same shape as D2 for `tests/core/agent/hook-shell-guard.test.ts`:
      the `GuardCase` builders (`bash`, `ps`, `tool`), constants and the `beforeAll` vault +
      `decide` / `expectBlocked` / `expectBlockedWith` / `expectAllowed` move to
      `tests/helpers/hooks/shell-guard.ts` (factory that sets up and tears down the vault, called
      from `beforeAll`/`afterAll` in each file). Keep only the `it.concurrent.each` "a char array
      cast is blocked as a dynamic command: $name" (3 rows); move every other call site and every
      row verbatim to `tests/core/agent/hook-shell-guard.shell.test.ts`. Accept: both files green
      on Windows.
- [ ] D4 — **wiki-check split.** Same shape for `tests/core/agent/hook-wiki-check.test.ts`:
      `checkTemplate`, `validPage`, `missingTitle`, the vault/hook setup and `session()` move to
      `tests/helpers/hooks/wiki-check.ts`. Keep only "a wiki change without a new log entry is
      reported when the session stops"; move the other 10 call sites verbatim to
      `tests/core/agent/hook-wiki-check.shell.test.ts`. Accept: both files green on Windows;
      then `npx vitest list tests/core/agent/hook-` plus
      `npx vitest list --config vitest.shell.config.ts` give, sorted and with file paths
      stripped, exactly the names in `hook-before.txt` (AC6), each once.
- [ ] D5 — **eol guard fails honestly.** New `tests/helpers/git-checkout.ts`:
      `eolGuardPlan(root: string | URL): { run: true } | { run: false; reason: string }` —
      `run: false` with reason "no .git at the repo root (downloaded zip)" only when no `.git`
      entry (file or folder) exists; and `indexEolLines(root, git = 'git'): string[]` running
      `execFileSync(git, ['ls-files', '--eol'])` without catching. In
      `tests/scripts/eol-normalization.test.ts`: drop `hasGitCheckout`/`gitAvailable`; the
      describe becomes `describe.skipIf(!plan.run)` with the reason in its title when skipped;
      the CRLF check uses `indexEolLines`, so a missing git throws and the test is red; update
      the header comment (the zip case is detected by `.git`, not by `git`). Add a
      `describe('git checkout detection')` in the same file: a temp dir with a `.git` folder →
      `run: true` and `indexEolLines(tmp, 'git-missing-for-test')` throws; a temp dir without
      `.git` → `run: false` with a non-empty reason. Temp dirs via `mkdtemp`, removed in
      `afterAll`.

## Model Hints

All deliverables default tier: moves are verbatim, the helpers are extractions of existing code,
and the build checks (name-set diff, seeded defects) catch a dropped or weakened case.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/scripts/eol-normalization.test.ts` › "a .git entry with git not runnable
  fails instead of skipping" (D5; on the old code the same situation returned
  `gitAvailable = false` and skipped)
- AC2 → unit `tests/scripts/eol-normalization.test.ts` › "no .git entry skips with a stated
  reason" (D5)
- AC3 → build check (D5): `grep -n "skipIf(!gitAvailable)" tests/scripts/eol-normalization.test.ts`
  prints nothing; recorded in Done.
- AC4 → unit `tests/core/agent/hook-run-report.test.ts` › "a Gaston skill run ends with exactly
  one report that Gaston's reader parses" (D2); `tests/core/agent/hook-shell-guard.test.ts` ›
  "a char array cast is blocked as a dynamic command: $name" (D3);
  `tests/core/agent/hook-wiki-check.test.ts` › "a wiki change without a new log entry is
  reported when the session stops" (D4) — green in `npm test` on Windows.
- AC5 → lane run: `npm run test:shell` exits 0 on Windows, running
  `tests/core/agent/hook-{run-report,shell-guard,wiki-check}.shell.test.ts` (D1–D4); the
  release-prep row of CLAUDE.md `## Test lanes` names it (D1).
- AC6 → build check (D4): `npx vitest list` name set before the move equals the union of both
  configs' name sets after it, rows included, each name once; recorded in Done.
- AC7 → unit: story 096's lane guard in `tests/scripts/` (every test file claimed by exactly one
  config), green with `vitest.shell.config.ts` added (D1).
- AC8 → build check (D2–D4): per hook script seed one inverted decision in the template source
  (`src/core/agent/templates/hook-{run-report,shell-guard,wiki-check}.ts`): run-report writes no report on Stop; shell-guard exits 0
  for the dynamic-command check; wiki-check's Stop exits 0 when the log has no new entry — each
  turns its kept case red in `npm test`; revert; recorded in Done.
- AC9 → build check: `git diff --stat -- tests/e2e/agent-terminal.spec.ts` is empty; recorded in
  Done.

## Done

<Leave empty. Filled by `/build <id>` after implementation:

- Short summary (2–5 lines): what was done.
- Commit message (1–2 lines, keywords are enough).
- Verification: build/test/lint result + review outcome; open points/blockers, if any.>
