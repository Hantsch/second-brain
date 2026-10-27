---
id: 100
title: e2e absence checks wait on a signal; the quit test gets its own spec
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

The maintainer wants every e2e check that something did not happen to wait on an observable
signal, not on a fixed delay, so that a late event cannot pass as an absent one, and wants the
quit test to stand alone instead of depending on running last in a shared app. A fixed-delay
absence check turns green exactly when the guarded behaviour is broken but slow, which is the
failure the security-relevant file:// check exists to catch.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F05, F07): 3 `waitForTimeout`
calls exist in `tests/e2e`: `navigation-guard.spec.ts:27` (300 ms, after a `file:///etc/passwd`
navigation, then `:31` asserts the URL is unchanged), `start-minimized.spec.ts:34` (500 ms, then
asserts the window is hidden) and `update-check-disabled.spec.ts:20` (4000 ms). That is 4.8 s of
serial wall time on one worker (`playwright.config.ts:18`), 4 s of it in one spec. A navigation
that only takes effect after 300 ms passes the guard test. `tray.spec.ts:133-146` holds a quit
test that says "Must stay last" because it ends the app every test above shares; it awaits
`waitForEvent('close')` (`:144`), bounded only by the 120 s test timeout. The header comment at
`tray.spec.ts:9` still says the quit lifecycle is out of scope, and `docs/ROADMAP.md:69` cites
`tray.spec.ts:134`.

## Acceptance Criteria

- [ ] **AC1** — `tests/e2e/navigation-guard.spec.ts` contains no `waitForTimeout`, and its
      absence check awaits a signal (for example the `will-navigate` event being cancelled, or a
      sentinel round-trip after the navigation attempt), not a clock.
- [ ] **AC2** — Seeding a defect that lets the `file://` navigation through (removing the
      navigation guard in `src/main`) turns the navigation-guard spec red, on a machine where the
      navigation takes longer than 300 ms.
- [ ] **AC3** — `tests/e2e/update-check-disabled.spec.ts` contains no `waitForTimeout`, and the
      spec finishes without a 4 s sleep; it asserts on a main-side flag or counter that the
      startup check was skipped.
- [ ] **AC4** — Seeding a defect that makes the startup update check run while disabled turns the
      update-check-disabled spec red.
- [ ] **AC5** — The quit test (formerly `tray.spec.ts:133-146`) lives in its own spec file under
      `tests/e2e/` with its own `specId`, and `tray.spec.ts` no longer contains a test that ends
      the app.
- [ ] **AC6** — `tray.spec.ts` passes when its tests run in any order
      (`npx playwright test tests/e2e/tray.spec.ts --repeat-each=1 --fully-parallel` or equivalent
      exits 0), and no comment in it says a test must stay last.
- [ ] **AC7** — The header comment of `tray.spec.ts` (formerly `:9`) no longer states that the
      close/hide/quit lifecycle is out of scope.
- [ ] **AC8** — `docs/ROADMAP.md` contains no citation of `tray.spec.ts:134` (the follow-up line
      is removed at the sprint cut; this story owns it).
- [ ] **AC9** — `grep -rn "waitForTimeout" tests/e2e` returns nothing, or each remaining hit
      (start-minimized, if left) carries a same-line reason and is named in the Decisions section.
- [ ] **AC10** — No file under `tests/` defines a generic absence helper, and no `timeout:` value
      in `playwright.config.ts`, `vitest.config.ts` or `tests/setup.ts` is larger than before.
- [ ] **AC11** — `npx playwright test tests/e2e/navigation-guard.spec.ts
tests/e2e/update-check-disabled.spec.ts tests/e2e/tray.spec.ts` and the new quit spec exit 0.

## Open Questions

- Which signal for navigation-guard: the main-process `will-navigate` event observed through
  `app.evaluate`, or a sentinel round-trip (renderer call completes after the blocked navigation)?
  The refuter and judge accept either; the security weight sits here, so do this spec first.
- update-check-disabled: a main-side flag or counter that already exists, or a new one? The
  constraint is no new test-only hook; refine must show the counter is part of the production
  path (for example an existing check-state value) or choose the poll-on-state alternative.
- start-minimized is optional (judge: only navigation-guard has security weight). Fix it in this
  story or leave the 500 ms wait with a recorded reason?
- Story 100 is ordered after 097 in the story map. Does it need 097 (smoke wiring), or can it run
  independently?
- Should the roadmap line also record the failure output of the one observed quit-test failure
  (review F07 recommendation), or is a pointer to the new spec enough? The refuter said not to hunt
  the race.

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
