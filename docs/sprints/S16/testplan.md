# Sprint S16 testplan — manual residues only

Per `.claude/ai-scrum.md`'s `testplan: optional` policy, this file lists only the acceptance
criteria marked `manual residue` — nothing else needs a human walk-through; every other
criterion is proven by an automated test (see [review.md](review.md)'s Acceptance section).

## 065 — The gate runs on every push

**AC1 / AC5 — the workflow actually runs on GitHub's Windows runner.**

- Reason it cannot be automated here: GitHub Actions is an external service; the workflow files
  are statically verified (`tests/scripts/ci-gate.test.ts`), but whether they actually execute
  correctly on GitHub's infrastructure is only observable once the branch is pushed.
- Preparation: push `sprint/S16` (or open a PR against `dev`) so `verify.yml` and `ui-smoke.yml`
  run for the first time.
- Steps: open the pushed commit's or PR's checks tab; confirm `verify.yml` ran `npm run verify`
  to completion and `ui-smoke.yml` ran to completion (or failed without blocking the PR, since
  it's advisory).
- Expected result: `verify.yml` is green (format/lint/typecheck/test/build all pass on Windows);
  `ui-smoke.yml` uploads a `.screenshots/` artifact regardless of its own outcome.

**AC4 — dependency-caching runtime budget.**

- Reason it cannot be automated here: a cold-cache vs. warm-cache wall-clock number can only be
  read off a real run's timing, not asserted by a unit test.
- Preparation: same pushed branch/PR as above.
- Steps: read the first run's total duration (cold cache) and the second run's total duration
  (warm cache, cache hit) from the Actions run summary.
- Expected result: both numbers are recorded in story 065's `## Done` section as the AC4 budget
  (no number is recorded yet — this walk fills it in).

## 050 — A digestion completes whole or leaves no trace

**AC5 — the progress bar moves visibly during a many-model-call digestion, not just structurally.**

- Reason it cannot be automated here: the e2e fake provider answers instantly, so no Playwright
  poll can observe two distinct progress values in sequence without a second per-phase timing
  seam beyond the existing `SB_E2E_INGEST_DELAY_MS` — the same harness limit already named for
  S14/S15.
- Preparation: a real or slowed-down model provider configured, and a source long enough to need
  several chunk summaries.
- Steps: start a digestion on that source from the Sources screen; watch the progress bar while
  it runs.
- Expected result: the bar advances at least once between the start and the merge step — it does
  not sit at one value for the whole run.

No other criterion in this sprint is manual residue; everything else is proven by the tests
named in [review.md](review.md).
