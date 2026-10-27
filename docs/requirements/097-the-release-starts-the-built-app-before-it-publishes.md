---
id: 097
title: The release starts the built app before it publishes
status: draft # draft -> ready -> in-progress -> done
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

- Run the smoke against the packaged app (the electron-builder output) or against the electron-vite build? The packaged app proves more but needs scripts/lib/app-harness.mjs to accept an executable path.
- Replace release.yml's second `npm run verify` with build plus smoke? Only if `gh api repos/Hantsch/second-brain/rules/branches/main` shows verify as a required, up-to-date check. gh was unavailable in the review, so protection is unconfirmed and treated as absent; until confirmed, keep verify and add the smoke.
- Tag (`@smoke`) or folder (`tests/e2e/smoke/`)? A folder moves five files and breaks paths cited elsewhere.
- Should ui-smoke also run the axe half (F12 suggested `node scripts/verify.mjs`)? The judge said axe is not a gate; decide whether to run it advisory at all.
- Release time grows by the smoke run; the release budget is unmeasured. Accept until 098 measures?

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
