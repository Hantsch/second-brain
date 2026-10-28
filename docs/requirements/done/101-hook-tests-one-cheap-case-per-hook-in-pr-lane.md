---
id: 101
title: Hook tests keep one cheap case per hook in the PR lane; eol test fails honestly
status: done # draft -> ready -> in-progress -> done
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

- [x] **AC1** — `eol-normalization.test.ts` fails (does not skip) when a `.git` entry exists at the
      repo root and `git` cannot be run; a test that simulates this (PATH without git, `.git`
      present) is red on the old code and green on the new.
- [x] **AC2** — `eol-normalization.test.ts` still skips, with a stated reason, when no `.git`
      exists at the repo root (the downloaded-zip case), and a test covers that branch.
- [x] **AC3** — `grep -n "skipIf(!gitAvailable)" tests/scripts/eol-normalization.test.ts` returns
      nothing.
- [x] **AC4** — In `hook-run-report`, `hook-shell-guard` and `hook-wiki-check`, exactly one case
      per hook script stays in a file included by `vitest.config.ts` (the PR lane), and that case
      passes on Windows.
- [x] **AC5** — The remaining heavy spawn cases of the 3 suites sit in files that `vitest.config.ts`
      excludes and that a named command runs (the release-prep lane command in CLAUDE.md
      `## Test lanes`, as defined by story 096); that command exits 0 on Windows.
- [x] **AC6** — The number of hook test cases before and after is equal: the sum of `it(` cases
      across the moved and kept files is 39, and no case is deleted or weakened; each moved case
      appears once.
- [x] **AC7** — Story 096's guard test passes: every test file is claimed by exactly one config or
      lane after the move. A moved file claimed by no command fails it.
- [x] **AC8** — Seeding a defect in each of the 3 hook scripts (for example inverting one decision)
      turns the kept cheap case red in the PR lane.
- [x] **AC9** — `tests/e2e/agent-terminal.spec.ts` has no diff.

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
9. AC3, AC6, AC8 and AC9 are one-time build checks recorded under `## Done

Hook suites split: one cheap case per hook stays in the PR lane, the other 193 cases moved verbatim to `*.shell.test.ts`
files run by the new `vitest.shell.config.ts` / `npm run test:shell` (release-prep row of the lane table). Setup shared via
`tests/helpers/hooks/`. The eol guard now skips only when no `.git` exists and fails when git cannot be run.

Commit message: `101: hook cases split into PR-lane cheap case + shell lane, eol guard fails honestly`

Verification (narrow gate): build, lint, typecheck, format:check green; `npx vitest run --changed HEAD` green (405 files, 4938 tests);
`npm run test:shell` exit 0 (3 files, 194 tests); review 1 (default): PASS.
- AC1/AC2: eol-normalization.test.ts "a .git entry with git not runnable fails instead of skipping" / "no .git entry skips with a stated reason" passed.
- AC3: grep empty. AC9: no diff on tests/e2e/agent-terminal.spec.ts.
- AC4: three kept cases passed in `npm test`; AC5: test:shell exit 0; AC7: test-lanes.test.ts passed.
- AC6: `vitest list` name set before (199) equals default + shell config after, diff empty.
- AC8: seeded defect in each hook template turned its kept case red; restored byte-exact.
Decisions: added `vitest.shell.config.ts` to `tsconfig.node.json` include (TS6307 otherwise). Prettier realigned the CLAUDE.md lane table.
Unfixed minor review notes: git-checkout.ts:11 builds a file URL from a string root (only tmpdir paths reach it).
No manual residue. Narrow gate only; full gate pending.
tiers: D 5 / hard 0 · review default · cycles 1 · agents 7
