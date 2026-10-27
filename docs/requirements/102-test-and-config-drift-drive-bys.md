---
id: 102
title: Test and config drift drive-bys
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

The maintainer wants three small drifts between tests, config and their sources removed, so that a
deliberate edit (a retuned prompt cap, a changed installer target, a new Node floor) does not
break a test with no user-visible change, and so that `engines.node` says what CI actually runs.
All three are low severity (P3) and ship as drive-bys.

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F10, F11, F14):

- F10: `tests/scripts/build-config.test.ts:45` pins `win.target` to `['nsis', 'portable']`, and
  `tests/scripts/e2e-wiring.test.ts:153-154` asserts that README.md mentions `npm run test:e2e`.
  Both fail on a deliberate edit, not on a defect a user would notice. The deliberate guards stay:
  `build.files` (`build-config.test.ts:23`), the publish pin (`:53`) and
  `tests/main/architecture-doc.test.ts` (story 058 AC6).
- F11: `package.json:10-12` has `engines.node` `>=20.19`, `.nvmrc` is `24`, and
  `vitest.config.ts:18-24` preloads a shim (`:30`, used at `:70`) only for Node < 22.10, a major
  CI never runs. `npm install` on Node 20 is accepted.
- F14: 3 tests repeat a builder's cap: `tests/core/llm/prompts.test.ts:33`
  (`toBeLessThan(4200)`), `tests/core/wiki/prompts.test.ts:103` (`9000`) and
  `tests/core/ingest/transcript.test.ts:66` (`1800`). `tests/core/claude/jsonl.test.ts:158`
  (`5000`) is not a prompt cap and is out of scope.

## Acceptance Criteria

- [ ] **AC1** — `tests/scripts/build-config.test.ts` no longer contains the literal
      `['nsis', 'portable']`; if the win target is still asserted, it asserts a property (for
      example that targets are non-empty, or no space in artifact names), and a test fails when
      that property is seeded broken.
- [ ] **AC2** — `tests/scripts/e2e-wiring.test.ts` no longer asserts that README.md mentions
      `npm run test:e2e` (`grep -n "README" tests/scripts/e2e-wiring.test.ts` returns nothing
      about that sentence); the `test:e2e` invokes `playwright test` check (`:38-41`) stays.
- [ ] **AC3** — The `build.files` assertion, the `publish` pin in `build-config.test.ts` and
      `tests/main/architecture-doc.test.ts` are unchanged, and `npx vitest run
tests/scripts/build-config.test.ts tests/scripts/e2e-wiring.test.ts
tests/main/architecture-doc.test.ts` exits 0.
- [ ] **AC4** — `package.json` `engines.node` is `>=24`, and a test or `npm install` check fails
      for a value whose major differs from the `.nvmrc` major (a seeded `>=20.19` turns it red).
- [ ] **AC5** — `vitest.config.ts` still starts, `npm test` exits 0, and the Node 25 Web Storage
      flag (`:32-37`) is unchanged by this story.
- [ ] **AC6** — Each of `tests/core/llm/prompts.test.ts:33`, `tests/core/wiki/prompts.test.ts:103`
      and `tests/core/ingest/transcript.test.ts:66` no longer contains a bare numeric
      `toBeLessThan(<literal>)` on prompt length; each asserts against an exported cap constant of
      the builder, or is replaced by a content-level truncation assertion.
- [ ] **AC7** — Truncation is still proven by content in each of the 3 files: a test fails when
      the builder is seeded to stop truncating long input (the output then contains the tail of the
      input that should have been cut).
- [ ] **AC8** — `tests/core/claude/jsonl.test.ts` has no diff, and `refresh-paths.test.ts:79` has
      no diff.
- [ ] **AC9** — No test is deleted or skipped; every removed assertion is named, with the reason,
      in the commit message or the Done section.

## Open Questions

- Deleting the undici shim (`vitest.config.ts:18-24,:30,:70`) is a separate step and a policy
  decision: it drops the support floor for developers on Node 20 and 22. Do that in this story,
  in a follow-up story, or never? AC4 and AC5 do not require it.
- F11 enforcement: is `engines.node` plus the existing `.nvmrc` warning enough, or should a test
  pin the two to the same major? (A test that mirrors a config is what F10 removes.)
- F10: drop the `win.target` assertion entirely, or replace it with a property (no space in
  artifact names, as the test's title at `build-config.test.ts:36` suggests)?
- F14: export each builder's cap and assert `<= CAP`, or drop the length check where a content
  test already covers truncation? Some builders clamp with an inline literal (for example
  `src/core/llm/prompts/condense-area.ts:124`); is exporting a constant in scope for the 3 sites?
- The three F14 sites were checked by grep only; refine must confirm per builder that each cap
  mirrors a constant before choosing between the two options.

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
