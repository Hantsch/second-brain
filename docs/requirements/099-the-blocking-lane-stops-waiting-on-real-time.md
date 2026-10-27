---
id: 099
title: The blocking lane stops waiting on real time
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

As the maintainer, I want the blocking test lane to wait on signals and injected clocks instead of
real time, so that a slow runner cannot turn a correct build red and "green here" keeps meaning
"green on GitHub".

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F03, F13):
tests/core/vault/watch.test.ts:196-212 runs a real watcher with `writeStabilityMs: 400`, appends
three chunks 150 ms apart (:200-203) and asserts `toHaveLength(1)`; a stall over 400 ms between
appends yields two reports and a red test with no defect. There are 19 sleep-to-wait hits in 13
files outside tests/e2e (`grep -rnE "\bsleep\(|new Promise\(\(?r(esolve)?\)? *=> *setTimeout" tests`),
among them teardown sleeps that stand in for a missing settle signal at ingest-ipc.test.ts:91-102
(comment :94-97), knowledge-flow.test.ts:171-173 and module-lifecycle-ipc.test.ts:139-141. One
elapsed-time assertion remains: llamacpp-lifecycle.test.ts:659
(`expect(Date.now() - startedAt).toBeLessThan(ceilingMs / 2)`, `ceilingMs = 20_000` at :640)
behind an eslint-disable with a same-line reason (:658).

## Acceptance Criteria

- [ ] **AC1** — The chunked-write case in watch.test.ts proves "three chunks, one report" under fake timers or an injected clock; a search for `setTimeout` and `sleep` in that case returns nothing.
- [ ] **AC2** — One real-watcher smoke case remains in watch.test.ts and asserts only that a write is reported at least once, with no timing in its assertion.
- [ ] **AC3** — Seeded defect: setting the product's stability window to 0 turns the fake-clock case red; a 1 s artificial stall in the test body does not change its result.
- [ ] **AC4** — llamacpp-lifecycle.test.ts:636-660 asserts a `fetchImpl` call count (through `fakeFetchOnPort`) below `ceilingMs / pollIntervalMs`, with no `Date.now` and no `eslint-disable-next-line no-restricted-syntax` in that test.
- [ ] **AC5** — Seeded defect: making the poll loop ignore its ceiling turns the call-counter test red.
- [ ] **AC6** — Every test name in the touched files still exists after the change and no assertion is removed; the diff shows it.
- [ ] **AC7** — A search for `Date.now` in tests/main/ipc/runtime/llamacpp-lifecycle.test.ts returns nothing.

## Open Questions

- Second cut (judge: P3, touches product code): give the index settle path an awaitable idle/dispose and replace the three teardown sleeps (ingest-ipc, knowledge-flow, module-lifecycle-ipc) with an await. Include it here or split into its own story? The judge said to leave the remaining sleeps.
- Does the watch module already accept a clock, or does the product code need a seam for fake timers?
- Alternative from the review: move the real-filesystem watcher cases to a release-prep file instead of rewriting. Where should the single real-watcher smoke live?
- Is the llamacpp bound a hang detector worth keeping in some form once the counter exists, or does the 60 s central test timeout cover it?

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
