---
sprint: S21
status: done # planned | in-progress | done
branch: dev # user decision: no sprint branch, commits go straight to dev
milestone: M20 — An agent curates the vault
---

# Sprint S21 — Work goes to the agent and comes back

## Goal

At the end of this sprint the user can hand a waiting source, a module, a gardener run or a
module's condensation to the agent with one click; the agent works the job in the terminal, and
Gaston validates the result before it books anything. What the agent wants to change outside the
wiki waits in Maintenance as a proposal with a badge on the rail, and the Agent tab shows the last
run.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 088 — The agent's proposals wait in Maintenance
- [x] 089 — Every agent run leaves a report
- [x] 090 — I hand a waiting source to the agent
- [x] 091 — I hand a module or a gardener run to the agent
- [x] 092 — I hand a module's condensation to the agent

## Notes

- **Concept:** [concepts/vault-agent.md](../../concepts/vault-agent.md) (AGT-9 to AGT-18).
- **Precondition:** S20 done — the setup mechanism, skill names and `.secondbrain/` layout from
  084, the deny rules from 085, the module condensation from 081.
- **Order:** 088 and 089 first (091's curate outcome reads the report and counts proposals). 090
  builds the job/result format and validation that 091 and 092 reuse. 092 last.
- **Every story bumps a skill template.** An S20-installed setup must show "outdated" afterwards
  and update cleanly — that is 084's mechanism doing its job, worth one e2e assertion.
- **Watcher:** results, proposals and reports must be picked up while Gaston is open (vault-agent
  O10); first needed in 088.

## Regression gate

<!-- Filled by `/sprint` phase 2b: the commands run, minutes taken, result, commit, and a verdict per failure. -->

- Ran on `65fd02b` (HEAD after story 092), 2026-10-27, **red, then fixed**:
  - `npm run build` — green, 0.3 min
  - `npm test` — red, 2.8 min (12 files / 15 tests failed, 5050 passed)
  - `npm run test:e2e` — red, 5.7 min (115 passed, 2 failed, 3 not run)
  - `e2e-all` is `none` (the e2e command is the full suite), so no long-suite launch.
- Verdicts (attribution agent, failing tests only):
  - `tests/scripts/e2e-wiring.test.ts` "agent-proposals.spec.ts: every test( names its steps" — story 088, `42ebacc`; fixed in `67cc764` (two e2e tests wrapped in `test.step`; wiring test 65/65, spec 3/3).
  - `tests/e2e/tasks-screen.spec.ts:14` "rail opens tasks directly above maintenance" — pre-existing: commit `1459397` put the Agent entry between Tasks and Maintenance and the spec from story 072 is stale. Red at the merge-base too. Not fixed here.
  - `tests/e2e/update-installed.spec.ts:191` "a streaming reply refuses the install" — pre-existing, red at the merge-base `c90c483`, spec byte-identical. Cause not investigated. Not fixed here.
  - Vitest timeouts (perf, IPC tests for areas/capture/chat/gardener/ingest/journal/projects, `condense-task`, renderer `journal` and `settings`) — flaky under full-suite load; 482/483 green on re-run, the one red being the wiring test above.
- Quarantine: `e2e-quarantine` is `none`, so nothing was written; the two pre-existing e2e reds are follow-ups in the roadmap.
- Note: removing the attribution agent's merge-base worktree emptied the main checkout's `node_modules` (junction followed); restored with `npm ci`. No source or test file was affected.
