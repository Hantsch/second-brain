# Sprint S21 — review

Work goes to the agent and comes back. Built directly on `dev` (user decision: no sprint branch).

## Overview

| Story                                                | Status | Commit                              |
| ---------------------------------------------------- | ------ | ----------------------------------- |
| 088 — The agent's proposals wait in Maintenance      | done   | `42ebacc`, regression fix `67cc764` |
| 089 — Every agent run leaves a report                | done   | `b8fc408`                           |
| 090 — I hand a waiting source to the agent           | done   | `3f454fd`                           |
| 091 — I hand a module or a gardener run to the agent | done   | `7c3f71e`                           |
| 092 — I hand a module's condensation to the agent    | done   | `65fd02b`                           |

## Implemented stories

- **088:** proposals in `.secondbrain/agent/proposals/` list in Maintenance with a diff; accept
  (hash-guarded, with undo) and reject move them to `resolved/`; filing proposals go through the
  capture flow; rail badge.
- **089:** a PowerShell stop hook writes one report per Gaston skill run (last 50 kept); the Agent
  tab shows the last run and links to waiting proposals.
- **090:** Markdown job/result format, validation and settling per job kind
  (`AGENT_JOB_SETTLERS`); hand-over and withdraw on Sources and Tasks.
- **091:** `curate-module` and `gardener-audit` job kinds; strict audit booking (a violation fails
  the whole result); buttons in the module header, Agent tab and Maintenance.
- **092:** `condense-module` job kind sharing the in-app reply validation, so the agent's answer
  becomes the same diff; in-app condensation is blocked while a job is open.

## Findings and decisions

- **User decisions** (recorded in each story): full-content proposals; filing via the capture flow;
  resolved proposals moved aside; stop hook writes reports, last 50; Markdown jobs with `done/`
  pruned after 30 days; withdrawal allowed; curator checklist unchanged; help module hidden from
  hand-over; block in-app condense while a job is open.
- **Job format split:** story 095's JSON `llm-task` jobs and 090's Markdown jobs sit side by side in
  `jobs/`. Both work; unifying them is open.
- **Left unfixed on purpose** (no decision needed, see the roadmap follow-ups): a crash between
  booking and `finish` can leave a job open; `agentJobId` has second resolution; the non-empty-string
  and `isRecord` helpers exist in four to five places; `condense-source-job.ts` (~315 lines) and
  `CondensedUnitPanel.tsx` (384 lines) are over the 300-line soft limit; a small race in
  `condense:run`; an agent `skipped` result cancels the task without its reason in the panel; an
  empty module can be handed over and then fails at settle; 088 checks `gaston`/`version` only for
  presence; 090's e2e test 2 depends on test 1.
- **Skill-template versions** were bumped by every story (`gaston-jobs` 2→6); an S20-installed setup
  shows "outdated" and updates through 084's mechanism.
- **Progress trail:** build agents wrote `YYYY-MM-DD HH:MM` timestamps; they are monotonic and none
  is later than the clock.
- **Changelog:** every story has its entry; nothing was added late.

## Blocked / open

Nothing blocked. Not merged anywhere: S21 sits on `dev` as commits.

## Regression gate

Red on the first run, then resolved: one real regression (088's e2e missing `test.step`, fixed in
`67cc764`), two **pre-existing** e2e failures not caused by this sprint (`tasks-screen.spec.ts:14`,
`update-installed.spec.ts:191`), and vitest load flakes that pass on re-run. Details in
`sprint.md`. The two pre-existing e2e failures remain red on `dev`.

## Acceptance

Every acceptance criterion of 088–092 is mapped to a named automated test in its story's
`## Acceptance Tests` and proven in its Done section (core, main and renderer tests, plus e2e specs
`agent-proposals`, `agent-last-run`, `agent-source-job`, `agent-module-jobs`,
`module-condense-agent`). **Manual residue:** none. 089's AC1 was reworded at refine to match the
user's stop-hook decision.

## Tier record

| Story     | Ds  | hard Ds | Review     | Cycles | Agents | Build min |
| --------- | --- | ------- | ---------- | ------ | ------ | --------- |
| 088       | 7   | 1       | default    | 1      | 11     | 53        |
| 089       | 5   | 1       | default    | 1      | 10     | 34        |
| 090       | 6   | 1       | default    | 1      | 10     | 55        |
| 091       | 7   | 1       | default    | 1      | 11     | 60        |
| 092       | 4   | 1       | default    | 1      | 8      | 50        |
| **Total** | 29  | 5       | default ×5 | 5      | 50     | 252       |

No second-stage (hard) review was run, so there was nothing for it to find. Gate: build 0.3, test
2.8, e2e 5.7 min.
