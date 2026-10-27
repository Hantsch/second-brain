---
id: 101
title: Hook tests keep one cheap case per hook in the PR lane; eol test fails honestly
status: draft # draft -> ready -> in-progress -> done
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

- Naming of the moved files: `*.shell.test.ts` included only by a release-prep config, or a
  `tests/full/` folder? Either needs a config the guard from 096 understands.
- Which case is "cheap" for each hook (fewest spawns, still proves the hook works end to end)?
- Does the release-prep command run the moved files through a new config, or through
  `npm test` with an include switch? Moving without a command that runs them is forbidden.
- Order: this story is after 096 in the story map. Without the guard and the lane table, the moved
  files have no lane; is 096 a hard prerequisite, or can the move ship together with a minimal
  command?
- Refuter severity: low for the skips, medium for the spawn cost. Is the spawn-cost reframe enough
  to justify the story, or is the eol fix alone worth shipping first?

## Decisions (Sprint)

<Leave empty. Filled by `/sprint`'s clarification round and by `/refine <id>` when it runs
inside a sprint: one line per decision the user made, with the answer and why. Empty outside
a sprint.>

## Plan

<Leave empty. Filled by `/refine <id>`: a short, precise overview — max. ~50 lines.
Concrete steps, affected files, order. No essay.>

## Deliverables

<Leave empty. Filled by `/refine <id>`: small pieces, each with its own acceptance
(scrum-like) and the files it touches. `/build` implements them in order, in one go.
Every acceptance criterion above must be covered by at least one deliverable **and** by the
test named for it in `## Acceptance Tests` — the test is part of the deliverable that
implements the behaviour, never a clean-up afterwards. Refine checks both before
`status: ready`, build refuses to start without them.>

- [ ] D1 — <smallest useful, individually acceptable result; names the files it touches>
- [ ] D2 — ...

## Model Hints

<Agent tier per deliverable. Default is the cheap tier with `/build`'s effort — leave
unmarked. If a step needs more brainpower: "D3 (balancing formula) → deliverable-hard" (Opus +
high effort, agent in `.claude/agents/`) plus a one-sentence risk justification.
Plus one line for the code review, default: "Review: → default".>

## Acceptance Tests

<Leave empty. Filled by `/refine <id>`: one line per acceptance criterion above, naming the
automated test that proves it — level, file, and the test name it will carry. The tests are
written by the deliverables, not afterwards; `/build` re-checks this mapping and that the
tests pass before `status: done`. This section replaces the manual test plan: acceptance is
the suite, not a click list.

Example paths below; your real test layout and the commands that run it are in
`.claude/ai-scrum.md` (`e2e-story`, `test-story`).

- AC1 → e2e `tests/e2e/<flow>.spec.ts` › "<test name>" (real surface, per
  `ui-acceptance-required`)
- AC2 → unit `tests/core/<module>.test.ts` › "<test name>"
- AC3 → **manual residue:** <the real reason it cannot be automated — an OS dialog, a
  specific machine, a paid external service>. Goes into the sprint review; blocks nothing.>

## Done

<Leave empty. Filled by `/build <id>` after implementation:

- Short summary (2–5 lines): what was done.
- Commit message (1–2 lines, keywords are enough).
- Verification: build/test/lint result + review outcome; open points/blockers, if any.>
