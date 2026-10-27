---
sprint: S21
status: in-progress # planned | in-progress | done
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
- [ ] 092 — I hand a module's condensation to the agent

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
