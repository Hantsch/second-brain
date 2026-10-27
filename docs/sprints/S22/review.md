# Sprint S22 — review

Release hardening. Built directly on `dev` (user decision: no sprint branch).

## Overview

Goal: the current `dev` can be released — the agent's shell guard has been hardened for an adversarial pass, the setup apply neither downgrades nor loses a result, task routing to the agent (095) is finished with every criterion proven by a test and a changelog entry, and the S19 update/release gaps are closed.

| Story                                                   | Status | Commit    |
| ------------------------------------------------------- | ------ | --------- |
| 093 — The agent's guard holds under an adversarial pass | done   | `c835452` |
| 094 — The agent setup apply never loses a result        | done   | `e351621` |
| 095 — A task can be routed to the agent                 | done   | `3aa2da8` |
| 080 — Update and release follow-ups from S19            | done   | `145cb95` |

## Implemented stories

- **093:** the guard blocks `[char[]]` / `[System.Char[]]` and every write under `modules/gaston-help/` (file tools and shell); the wiki check shares its heading pattern with `parseLog`; `disableAllHooks` in the vault's settings shows the hook rules as Off; wording, help page and docs aligned.
- **094:** an edited file from a newer Gaston stays `newer` and is left alone; `applySetup` turns non-conflict errors into `failed` rows with the errno code, continues, and records only landed files; the plan dialog names failed files.
- **095:** "Test" on an agent-routed row checks the `gaston-jobs` install state; the agent's `failed`/`skipped` reason is quoted in the error sentence; no heuristic proposal is cached while `classify-dump` waits on an agent job; proof tests, e2e flow and changelog entry added.
- **080:** release runner recovery hint via uploaded artifact, top-level version read, shared `electronBuilderCli`; update service split (`staging.ts`), a superseded download fetches nothing and re-offers; an install authorises its own quit; About shows an error for a rejected check; `ProgressBar` atom replaces three hand-rolled bars; wiring tests; the journal Enter test no longer flakes.

## Findings and decisions

Direction decisions by the user: 093 the user runs the adversarial pass themselves (Q1) and `[char[]]` fails closed (Q2); 094 never downgrades, no restore action (Q1). Sprint decisions are recorded per story under `## Decisions (Sprint)` in `docs/requirements/done/`.

Unfixed findings all left this review as follow-up lines in [ROADMAP.md](../../ROADMAP.md) › "Follow-ups worth doing" (no story drafts: each is small and decision-free):

- 093: relative paths with the cwd inside the help module, and commands on the parent `modules/`, are not checked (same gap for `raw/web`); no regression rows for help-dir case / 8.3 / trailing-dot variants; .NET vs JS `\d` / `\s` Unicode edge in the heading regex.
- 095: weak `toContain` terms in the skill-content test; the llm-bridge test mocks `readSetupState` and e2e covers only the missing branch.
- 080: the quit grant is not revoked after a successful `quitAndInstall`; a feed version that is missing or formatted differently reads as superseded; a stale `check.isError` can override later event state; `close-guard.ts` is ~312 lines.
- Gate: `perf.test.ts` flaky under full-suite load; the existing `tray.spec.ts:134` flake follow-up stays.
- 094: no unfixed findings.

Accepted, not findings: `[char](106)` / `[char]$x` stay out of 093's scope until the user's own pass decides; 095 needed one production fix in `capture.ts` that its plan had not foreseen (reviewer: needed and correct).

## Blocked / open

Nothing is blocked. Open: the user's adversarial pass on the shell guard (093 AC1) is a **release blocker until it is done**; it does not hold the milestone. Merging into `dev` / the `sprint/S17`–`S20` branches and the first release are the user's decision.

## Regression gate

Ran on `145cb95` (dev), 2026-10-27 16:51–16:57, one launch each:

- `npm run build` — green, <1 min
- `npm test` — red: 1 failed / 5110 passed, 1.7 min
- `npm run test:e2e` — green, 122 passed, 3.5 min

Failure: `tests/core/index/perf.test.ts` › "a realistic vault stays within the index budget" (warm open 13191 ms vs. 1700 ms budget). Verdict: **flaky** — green when run alone on the same `HEAD` (54 s); the wall-clock budget fails under the full parallel suite's CPU load, and no sprint story touched `src/core/index/`. Not quarantined (`e2e-quarantine: none`); roadmap follow-up. No regression from this sprint's stories.

## Acceptance

Every criterion below was proven by a test that ran and passed, except the manual residue.

**093**

- AC1 — manual residue (below).
- AC2 → `protection-status` "disableAllHooks turns the hook rules off…" + e2e `agent-protection.spec.ts` "hooks switched off by disableAllHooks show as off".
- AC3, AC5 → `hook-shell-guard` "pre-tool guard" cases.
- AC4 → `hook-wiki-check` "the log check counts the headings parseLog reads".
- AC6 → e2e "installing lists all seven rules as installed".

**094**

- AC1 → setup-edges "an edited file from a newer Gaston is left alone and never downgraded" + e2e `agent-setup.spec.ts` "an apply never downgrades a newer file and never loses a result".
- AC2 → setup-edges "a failed write keeps…", "a failing undo copy…", "a manifest that cannot be written…" + e2e.
- AC3 → setup-edges "a second apply after a partial one writes the rest" + e2e.

**095**

- AC1 → `routing-table.test.tsx` "offers the agent in every row…", `llm-ipc.test.ts` "keeps a route to the agent through a reopen of the vault", e2e `agent-task-route.spec.ts`.
- AC2 → `jobs.test.ts` "files one job with the full request…" and "triggering the same request again reuses the open job" + e2e.
- AC3 → e2e journal line; `capture-flow.test.ts` "a dump routed to the agent is filed by heuristic, then by the agent's answer…".
- AC4 → `capture-flow.test.ts` (same), `jobs.test.ts` "reports a failed or skipped result with the agent's reason", `error-state-llm.test.tsx` "a failed agent job quotes the agent's reason".
- AC5 → `jobs.test.ts` "the shipped gaston-jobs skill documents the llm-task job…".
- AC6 → `llm-bridge.test.ts` "testing an agent-routed task reports the agent setup and files no job", `routing-table.test.tsx` "a row routed to the agent explains the job…", e2e.
- AC7 → `routing-table.test.tsx` "a model proposal never replaces a task routed to the agent".

**080**

- AC1 → `runner.test.ts` "a failed publish after the push points at the uploaded release files…", `wiring.test.ts` "a failed release run uploads its assets and notes".
- AC2 → `plan.test.ts` "the current version comes from the top-level field…".
- AC3 → `update/service.test.ts` "a download that finds a newer release than announced fetches nothing…", `update/backend.test.ts` "download stops before fetching when the feed now names another version".
- AC4 → `close-guard.test.ts` "an update install's quit is not vetoed…", `update/service.test.ts` "install authorises the quit… and revokes it when that throws".
- AC5 → `close-guard.test.ts` "a failed install leaves the next close guarded" + AC4's service test.
- AC6 → `settings-about.test.tsx` "a manual check whose call fails shows the error line".
- AC7 → `progress-bar-usage.test.ts`.
- AC8 → `services.test.ts` "the update service is disabled when unpackaged or on the demo vault…".
- AC9 → `start-without-tray.test.ts` "start schedules the one startup update check and will-quit stops it".
- AC10 → `journal.test.tsx` Enter combinations (rewritten, same assertions).

**Manual residue**

- 093 AC1 — the user attacks the shell guard with their own probes. Reason: a safety classifier stopped the agent-generated battery in S20, so an agent cannot run this pass. See [testplan.md](testplan.md).

**Below the real surface:** 080 AC6 is a renderer test, not e2e, because main's `update:check` never rejects by contract and no real-surface path produces the rejection.

## Tier record

| Story | Ds  | hard Ds | Review stages | Review cycles | Agents | Build min |
| ----- | --- | ------- | ------------- | ------------- | ------ | --------- |
| 093   | 5   | 1       | default       | 1             | 7      | 29        |
| 094   | 3   | 1       | default       | 0             | 5      | 13        |
| 095   | 5   | 0       | default       | 1             | 7      | 10        |
| 080   | 6   | 1       | default       | 1             | 9      | 16        |
| Total | 19  | 3       | —             | 3             | 28     | 68        |

Refine took 7 min (parallel). No hard (second-stage) review ran, so none found anything the default review missed.

## Changelog sweep

`CHANGELOG.md` has user-facing entries for 093 (agent protection), 094 (agent setup: newer file never overwritten), 095 (task routed to the agent) and 080 (three `Updates:` bullets). None was missing.
