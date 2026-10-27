---
id: 098
title: CI runs on dev and the PR lane reports its minutes
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

As the maintainer, I want CI to run on every push to dev and to say how long the PR lane took, so
that work on dev gets a CI signal before the dev-to-main PR and a lane drifting past its budget
shows up as a warning instead of staying green.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F02, F08): verify.yml:3-6,
perf.yml:6-10 and ui-smoke.yml:3-6 trigger only on `pull_request` into main. Story 065 AC1
(done/065-the-gate-runs-on-every-push.md:28) says "on every push and pull request"; commit e042b80
(2026-09-25) removed `push:` and CLAUDE.md records no reason. ci-gate.test.ts:52-58 pins "triggers
only on pull_request targeting main" and :224-235 pins that ui-smoke never runs on push. Commits
a590fda and 75267d4 sit on dev with no CI run. verify.yml runs one step, `npm run verify`
(:38-39), with no duration output and no `::warning`; vitest has no slow-test threshold
(vitest.config.ts:63-64) and Playwright uses the `list` reporter. GitHub records step durations,
but nothing compares them to the 4-6 min budget. The only recorded durations are local and predate
5b39956 (docs/sprints/S22/review.md:43-47).

## Acceptance Criteria

- [ ] **AC1** — verify.yml has a `push` trigger with `branches: [dev]` and keeps `pull_request` with `branches: [main]`.
- [ ] **AC2** — perf.yml and ui-smoke.yml triggers are unchanged; the ci-gate.test.ts:224-235 test stays green and unedited.
- [ ] **AC3** — ci-gate.test.ts:52-58 asserts both triggers; seeded defect: removing the push trigger from verify.yml makes it red.
- [ ] **AC4** — verify.yml has a final step that emits `::warning` when the job ran longer than 6 minutes; the threshold is one named value in the workflow, asserted by ci-gate.test.ts.
- [ ] **AC5** — The job summary (`$GITHUB_STEP_SUMMARY`) lists the slowest vitest tests via a slow-test threshold or reporter setting in vitest.config.ts, with no assertion on a test's duration inside `npm test`.
- [ ] **AC6** — A search for `Date.now` and `performance.now` in tests/scripts/ci-gate.test.ts returns nothing.
- [ ] **AC7** — The CLAUDE.md `## Test lanes` pr row lists "push to dev" under where it runs, and its budget cell is replaced from "TBD" by the measured median once one dev push run exists.

## Open Questions

- Was PR-only a deliberate decision to save runner minutes? If yes, the alternative is one CLAUDE.md deviation row with its reason plus a `.githooks/pre-push` that runs `npm run verify`, replacing AC1-AC3. Decide which.
- A `pull_request` trigger on dev would not cover work that reaches dev by push and merge; confirm push is the right event.
- A dev push followed by the dev-to-main PR runs verify twice on the same tree. Accept, or skip?
- Warn on one run's elapsed time, or on a median over recent runs (needs the GitHub API)? The 6 min (aim 4) figure is the test-gates default, not a measurement.
- The review named tsc-twice removal as the first cut if over budget; the judge dropped it until measured. Confirm it stays out of scope.

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
