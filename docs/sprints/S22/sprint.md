---
sprint: S22
status: done
branch: dev # no sprint branch, built directly on dev (user decision)
milestone: M21 — Release hardening
---

# Sprint S22 — Release hardening

## Goal

The current `dev` can be released: the agent's shell guard has survived an adversarial pass, the setup
apply neither downgrades nor loses a result, task routing to the agent (095) is finished with every
criterion proven by a test and a changelog entry, and the S19 update/release gaps are closed.

## Stories (in build order)

- [x] 093 — The agent's guard holds under an adversarial pass
- [x] 094 — The agent setup apply never loses a result and never downgrades
- [x] 095 — A task can be routed to the agent instead of a model
- [x] 080 — Update and release follow-ups from S19

## Notes

- 095 was implemented in `c90c483` before S21 without refine: its status said `done`, but the criteria
  were the sketch, none was mapped to a test and it has no changelog entry. Reset to `draft`; refine
  keeps the existing code and the decisions already recorded, writes real criteria, and the build adds
  the missing tests (AC4 result as proposal, AC6 "Test" on an agent row), the e2e flow and the
  changelog entry.
- 093 is the release blocker named in the S20 review.
- `d9fd25c` already fixed the two stale e2e specs (`tasks-screen`, `update-installed`) before this
  sprint; `tray.spec.ts:134` flaked once in the full run on 2026-10-27 (roadmap follow-up).

## Regression gate

Ran on `145cb95` (dev), 2026-10-27 16:51–16:57, one launch each:

- `npm run build` — green, <1 min
- `npm test` — red: 1 failed / 5110 passed, 1.7 min
- `npm run test:e2e` — green, 122 passed, 3.5 min

Failure: `tests/core/index/perf.test.ts` › "a realistic vault stays within the index budget" (warm open 13191 ms vs. 1700 ms budget). Verdict: **flaky** — green when run alone on the same `HEAD` (54 s); the wall-clock budget fails under the full parallel suite's CPU load, and no sprint story touched `src/core/index/`. Not quarantined (`e2e-quarantine: none`); roadmap follow-up.
