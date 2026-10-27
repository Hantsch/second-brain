---
id: 096
title: Lane map in CLAUDE.md and a guard that every test file has a lane
status: draft # draft -> ready -> in-progress -> done
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

- [ ] **AC1** — CLAUDE.md contains a `## Test lanes` heading with a table of the lanes pr, release, release-prep, perf and ui-smoke, each with its command and whether it blocks.
- [ ] **AC2** — The table's budget cells carry no invented number: the pr and release budgets read "TBD (story 098)" and the other lanes read "none" or "warns only".
- [ ] **AC3** — A test in `tests/scripts/` fails when a file matching `*.test.*` or `*.spec.*` under `tests/` is claimed by none of vitest.config.ts, vitest.perf.config.ts and playwright.config.ts.
- [ ] **AC4** — The same test fails when a file is claimed by more than one of them.
- [ ] **AC5** — The guard reads include/exclude patterns from the imported real config objects; a search for a duplicated glob literal such as `*.perf.test.ts` in the guard file returns nothing.
- [ ] **AC6** — Seeded defect: adding `tests/core/stray.test.mts` makes the guard red, naming the file; removing it makes it green.
- [ ] **AC7** — The guard asserts that the commands named in the table's pr, release-prep and perf rows exist as scripts in package.json.
- [ ] **AC8** — The guard runs in `npm test` and contains no wall-clock assertion.

## Open Questions

- Should the guard also cover files outside `tests/` (for example `scripts/` specs), or is `tests/` the whole contract?
- The review rated this P1 as prerequisite of 097 and 098, the judge P2 (the table alone is S, the guard is a cheap add-on). Split into two deliverables, or ship together?
- The `release` row names `npm run test:smoke`, which only exists after 097. Name it now with AC7 deferred for that row, or land the row with 097?

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
