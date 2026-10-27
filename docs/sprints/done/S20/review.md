# Sprint S20 review — A module condenses itself, and Claude Code works safely in the vault

Branch `sprint/S20` (not merged; the merge into `dev` is the user's decision). Milestone M20 stays
open: S21 is still planned.

**Read before merging or releasing:** story 085's hard (second-stage) adversarial probe battery never
ran. See Blocked / open and [story 093](../../requirements/093-the-agent-guard-holds-under-an-adversarial-pass.md).

## Overview

**Goal.** At the end of this sprint a module's `wiki/overview.md` is its condensed artifact: started in
the module view, confirmed as a diff, never touched by an ingest again. Settings has an Agent tab that
shows whether Claude Code is installed, installs and updates a marked, versioned setup in the vault
(`CLAUDE.md`, deny rules, skills, hooks) that keeps the agent out of `journal/` and off `raw/`, ships a
help module Ask can cite, and opens a terminal in the vault with `claude` and a skill already typed.

| Story                                     | Status | Commit                                                                                                     |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| 081 A module condenses itself             | done   | `8e0ae3f` condense-module task, overview artifact, module condensed tab, due finding                       |
| 082 The ingest leaves the overview alone  | done   | `3cc9323` no overviewChange, catalog counts against orphan, legacy overview replaced whole                 |
| 083 Settings has an Agent tab             | done   | `bdd5e54` pure PATH lookup for Claude Code, install-guide link, about this                                 |
| 084 Gaston installs the agent setup       | done   | `9d13fe9` templates + marker/manifest, status/plan/apply, agent:setup IPC, setup panel + plan dialog       |
| 085 The agent cannot read the journal     | done   | `070efaf` deny rules, fail-closed PowerShell shell guard, wiki post-write check, protection reader + panel |
| 086 Gaston explains itself from the vault | done   | `67030da` gaston-help module, collision guard, gardener skips it, Agent tab row + About link               |
| 087 Open Claude in the vault              | done   | `6b46dd2` terminal section, wt/PowerShell launch plans, readiness guard, e2e spawn seam                    |

## Implemented stories

- **081:** the module level of the condensed layer. `condense-module` runs only on the click in the new
  module `condensed` tab, is confirmed as a diff through the shared `condense:*` channels, and writes
  `overview.md` with `condensed_at`, sources and decided / open / contradictions sections; maintenance
  reports a due condensation and writes nothing.
- **082:** the digestion no longer writes `overview.md` (`overviewChange` left prompt, schema and reply);
  an `index.md` entry now counts as a reference for the orphan check; a legacy overview without
  `condensed_at` is replaced whole by its first condensation; the module schema says so.
- **083:** a seventh Settings tab, Agent, with a pure `PATH` lookup for Claude Code (installed with path /
  absent with install-guide link / unknown with reason) and an "About this" text. No process is started.
- **084:** the managed vault setup: `CLAUDE.md`, `.claude/settings.json`, hooks and the skills
  `gaston-jobs`, `gaston-curate`, `gaston-propose`, with marker + version, a manifest at
  `.claude/gaston-manifest.json`, a plan dialog before any write, opt-in overwrite of edited files with
  an undo copy, and `.claude/` kept out of the index.
- **085:** one `PROTECTION_RULES` list feeds the deny rules; a fail-closed PowerShell pre-tool guard and a
  wiki post-write/Stop check ship as templates; the Agent tab reads the protection back from the
  installed files.
- **086:** the `gaston-help` module (a page per rail screen, the vault format, the agent), registered in
  084's managed set with a collision guard, left out of gardener findings and vault size, shown in the
  Agent tab; a generic `.gs-dialog` scroll fix after a 22-file plan pushed the confirm button off-screen.
- **087:** a Terminal section in the Agent tab (open, work the jobs, curate a module): pure launch plans
  for Windows Terminal with a PowerShell fallback, readiness re-checked on every launch, and an e2e
  spawn-recorder seam.

## Findings & decisions

Per-story decisions live in each story's `## Decisions (Sprint)` and `## Done`. Findings left unfixed
leave this review as story drafts or as follow-up lines in
[ROADMAP.md](../../ROADMAP.md) ("Follow-ups worth doing", source `[S20 review]`); nothing is listed here
a second time.

**Story drafts filed from this review**

- [093 — The agent's guard holds under an adversarial pass](../../requirements/093-the-agent-guard-holds-under-an-adversarial-pass.md):
  the battery that never ran, plus 085's five protection gaps (`[char[]]` indirection, `disableAllHooks`
  not detected, hook reader judging by path/existence only, the `gaston-help` write-allowlist gap, the
  looser wiki-check heading regex).
- [094 — The agent setup apply never loses a result](../../requirements/094-the-agent-setup-apply-never-loses-a-result.md):
  084's newer-but-modified downgrade and the lost per-file results on a mid-apply write error.

**Decision-free follow-ups** went to the roadmap: 081 (`condense.ts` 312 lines, `reasonOf` third copy,
unused `moduleSlugFromOverviewPath`, graph ref for a differing `slug:`), 082 (orphan fix appends
`## Seiten` to the overview), 083 (concept docs say the tab shows a version; thin AC5 e2e; untested
`PATHEXT` / `UNKNOWN` branches), 084 (`docs/ARCHITECTURE.md` has no `agent/` row), 085 (scope beyond spec
documented), 086 (three copies of settle / status-set shapes, `indexFile` vs `indexBody`, jobs wording),
087 (stubbed section test, two wording edges) and the load-flaky tests.

**Decisions worth carrying into planning**

- Layout fixed by 084 and read by S21: `.secondbrain/agent/{jobs,results,proposals,runs}/`, skills
  `gaston-jobs`, `gaston-curate`, `gaston-propose`, manifest `.claude/gaston-manifest.json`.
- 083 decided the CLI status is `PATH`-only and shows no version (starting `claude` just to read it was
  rejected); the concept still says otherwise (roadmap follow-up).
- 085 protects `.secondbrain/index/` and `chats/` like `journal/` (beyond the spec) because the derived
  index holds journal bodies. It kept `hook-shell-guard.ts` as one ~800-line PowerShell script in one
  string (over the 300-line soft limit) on purpose: splitting it into fragments would hurt reading the
  script.
- 086: help status rides on `agent:setupStatus` (no new channel). A `gaston-help` folder whose `module.md`
  is not Gaston-marked reads as `collision`, whatever the manifest says. The generic `.gs-dialog` now
  scrolls; e2e button labels "Write 7 files" became "Write 22 files".
- 081/082 overlap: 081's Done did not implement the legacy-overview rule; 082 owns it (`carriedOver` in
  `run-module.ts`, module level only; area and project runs keep lossless carry-through). 082 also
  turned the seeded intended orphans into `unlisted` pages, since index entries now count as references.
- 087 raised `HELP_MODULE_VERSION` to 2 (the agent page claimed Gaston never starts a terminal).
- Tests changed on purpose, none weakened: 081 (`evidence.test.ts`, `report.test.ts`: counts split by
  `module === null`), 082 (tests pinning the removed behaviour; seed expectations), 083 (`settings.test.tsx`
  tab list gained "Agent"), 085 (`setup.test.ts` marker test split in two).
- Flaky once under load, not gate failures: `tests/core/ingest/queue.test.ts` (081) and
  `tests/renderer/journal.test.tsx` (084, 086; 085 capped its real PowerShell spawns at 3 to stop
  causing it). The gate had none. No quarantine entries (`e2e-quarantine: none`).
- Changelog sweep: `CHANGELOG.md` has an entry for every user-facing story 081–087, under
  `## Unreleased` / `### Added` (the file has no `# Features` heading). None was missing, so nothing
  was added late.
- Test plan: written only for the one manual residue (087 AC1–AC3), see [testplan.md](testplan.md).
- Process: the trail's timestamps are monotonic; build agents write `YYYY-MM-DD HH:MM`, the orchestrator
  ISO; one build agent (084) merged two events into one command (both real timestamps). Prettier was
  non-idempotent on story 087's file (two passes needed) and is green now.

## Blocked / open

No story is blocked and no gate is red. One caveat is open and belongs to the merge/release decision:

- **085's hard adversarial review never ran.** A safety classifier stopped the stage-2 reviewer while it
  was preparing about 150 probes against the shell guard; the orchestrator did not retry or rephrase.
  085's stage-2 verdicts therefore rest on reading the code. Coverage rests on the guard author's 198
  probes and stage 1's ~100 probes through the real script (`powershell.exe`, win32 only). A false
  allow leaks the journal to a cloud model, so **run a hard adversarial pass before any release**:
  [story 093](../../requirements/093-the-agent-guard-holds-under-an-adversarial-pass.md) (open question
  Q1 is how to run it without tripping the classifier). The user decides whether the merge into `dev`
  waits for it; a release should.

## Regression gate

Run on `6b46dd2` (HEAD of `sprint/S20` after story 087), 2026-10-22, by one gate agent. All green:

| Command            | Result                                  | Minutes |
| ------------------ | --------------------------------------- | ------- |
| `npm run build`    | green                                   | 0.1     |
| `npm test`         | green, 378 files, 4871 tests            | 1.2     |
| `npm run test:e2e` | green, 109 passed, no retries, no flaky | 3.1     |

`e2e-all` is `none` (the e2e command is the whole suite), so no further launch. No failures, so no
attribution, no fixes, no quarantine entries and no unexpected passes. Nothing is red; nothing blocks
the merge on gate grounds.

## Acceptance

Acceptance is the test suite. Every criterion below has a named passing test (from each story's `## Done`
and `## Acceptance Tests`), except the declared manual residue at the end. Paths are under `tests/`.

### 081 — A module condenses itself

| AC   | Criterion (short)                              | Proving test                                                                                                                                               |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1  | Run starts only on the Condense click          | e2e `module-condense.spec.ts` (step a); "never after an ingest" also by 082 AC1                                                                            |
| AC2  | Diff with visible removals                     | e2e `module-condense.spec.ts` (step b)                                                                                                                     |
| AC3  | Accept writes the artifact; undo copy in trash | e2e (step e); `main/condense-module-ipc.test.ts` "accepting writes overview.md…"; `core/condense/run-module.test.ts` "a proposal records every page read…" |
| AC4  | Stale file on accept is a conflict             | e2e (step d); `main/condense-module-ipc.test.ts` "accepting after overview.md changed on disk is a conflict…"                                              |
| AC5  | Reject needs a reason, appended to directives  | e2e (step c); `main/condense-module-ipc.test.ts` "rejecting a module proposal appends the reason…"                                                         |
| AC6  | Directives and unknown keys survive            | `core/condense/run-module.test.ts` (two tests); e2e (step e)                                                                                               |
| AC7  | Headings follow the document language          | `main/condense-module-ipc.test.ts` "…writes its headings in the document language, not the UI language"                                                    |
| AC8  | "Condensation due" finding, fix writes nothing | e2e `module-condense.spec.ts` maintenance test; `core/gardener/checks-condensed-module.test.ts` (two tests)                                                |
| AC9  | Task assignable in Models settings             | e2e `task-no-model.spec.ts`; `core/llm/tasks.test.ts`; `renderer/i18n.test.ts`                                                                             |
| AC10 | No model: honest state, nothing written        | e2e `task-no-model.spec.ts`; `main/condense-module-ipc.test.ts` "without a model for condense-module…"                                                     |

### 082 — The ingest leaves the overview alone

| AC  | Criterion (short)                                | Proving test                                                                                                      |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| AC1 | Overview byte-identical after a digestion        | `core/wiki/ingest.test.ts` (two tests); `core/wiki/concurrency.test.ts` "a foreign edit to overview.md… survives" |
| AC2 | `overviewChange` gone, old reply tolerated       | `core/wiki/prompts.test.ts`; `core/wiki/suggestions.test.ts` "a reply that still carries overviewChange…"         |
| AC3 | Old bullet overview still shown and found        | e2e `module-legacy-overview.spec.ts` (steps 1–2)                                                                  |
| AC4 | First condensation shows old bullets as removals | `core/condense/module-legacy-overview.test.ts`; e2e `module-legacy-overview.spec.ts` (steps 3–4)                  |
| AC5 | Schema template and docs mirror updated          | `core/wiki/module.test.ts` schema test + mirror test                                                              |
| AC6 | `AGENTS.md` not rewritten                        | `core/wiki/module.test.ts` existing AGENTS.md test (no refresh path added)                                        |
| —   | Decision: catalog entry counts as a reference    | `core/gardener/checks-links.test.ts` (two tests)                                                                  |

### 083 — Settings has an Agent tab

| AC  | Criterion (short)                             | Proving test                                                                                                                                        |
| --- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC1 | Tab between Customization and About, de/en    | e2e `settings-agent-tab.spec.ts` "the agent tab sits between…"; `renderer/i18n.test.ts` key-set test                                                |
| AC2 | Installed with path, no version               | e2e "with claude on PATH the agent tab shows it installed…"; `core/agent/cli-presence.test.ts` "finds claude in a PATH directory…"                  |
| AC3 | Absent: install-guide link                    | e2e "without claude on PATH the agent tab links to the official install guide"                                                                      |
| AC4 | Nothing downloaded or installed               | both e2e tests above (fake binary never ran; the only action is the link)                                                                           |
| AC5 | "About this" text                             | e2e "the agent tab sits between…" (checks `journal/` and `raw/` only, see below)                                                                    |
| AC6 | Failed lookup shows "unknown" with the reason | `core/agent/cli-presence.test.ts` (timeout; unreadable directory); `renderer/settings-agent-tab.test.tsx` "an unknown CLI status shows the reason…" |

### 084 — Gaston installs and updates the agent setup

| AC  | Criterion (short)                                 | Proving test                                                                                           |
| --- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AC1 | Missing files listed, "Install" offered           | e2e `agent-setup.spec.ts` "the agent tab lists the setup as missing and offers install"                |
| AC2 | Plan shown before any write                       | e2e `agent-setup.spec.ts` "install and update write only what the plan shows…"                         |
| AC3 | Files written with marker and version             | same e2e; `core/agent/setup.test.ts` "install writes every managed file with its marker…"              |
| AC4 | Outdated shown, Update rewrites only marked files | same e2e; `core/agent/setup.test.ts` "update rewrites only managed files that are outdated or missing" |
| AC5 | User's `.claude/` file byte-identical             | same e2e; `core/agent/setup.test.ts` "a file without the marker is the user's…"                        |
| AC6 | Templates pinned to docs mirror                   | `core/agent/templates.test.ts` "every setup template matches its docs mirror"                          |
| AC7 | Vault `CLAUDE.md` content                         | `core/agent/templates.test.ts` "the vault CLAUDE.md names the only direct write target…"               |
| AC8 | No absolute machine path installed                | `core/agent/setup.test.ts` "installed setup files contain no absolute machine path"                    |
| AC9 | Edited file: opt-in overwrite with undo copy      | same e2e; `core/agent/setup.test.ts` "an edited managed file is overwritten only when confirmed…"      |

### 085 — The agent cannot read the journal or touch raw

| AC  | Criterion (short)                                 | Proving test                                                                                                           |
| --- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| AC1 | Deny rules in installed settings                  | `core/agent/protection.test.ts` "the installed settings deny journal reads and every protected write"                  |
| AC2 | Guard blocks journal reads, allows raw reads      | `core/agent/hook-shell-guard.test.ts` (two tests, real `powershell.exe`)                                               |
| AC3 | Guard blocks writes/moves/deletes under raw       | `core/agent/hook-shell-guard.test.ts` "…writes, moves or deletes under raw is blocked"                                 |
| AC4 | Post-write check reports invalid frontmatter      | `core/agent/hook-wiki-check.test.ts` "a wiki page written without valid frontmatter is reported"                       |
| AC5 | Missing `log.md` entry reported, silent when done | `core/agent/hook-wiki-check.test.ts` (three tests)                                                                     |
| AC6 | Protection panel reads rules back; missing shown  | e2e `agent-protection.spec.ts`; `core/agent/protection-status.test.ts` "a rule removed by hand reads as missing"       |
| AC7 | No setup: "nothing protects the vault yet"        | e2e `agent-protection.spec.ts`; `core/agent/protection-status.test.ts` "a vault without settings reads as unprotected" |

The spawn-based hook tests (163 + 13 cases) run only on win32, the only packaged platform and the CI runner;
elsewhere they skip with that reason.

### 086 — Gaston explains itself from the vault

| AC  | Criterion (short)                                  | Proving test                                                                                                     |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| AC1 | Help module written and listed in Knowledge        | `core/agent/help-setup.test.ts` "install writes the help module…"; e2e `help-module.spec.ts`                     |
| AC2 | Ask cites a help page; no model: search hits       | `core/wiki/ask-help-module.test.ts` (both)                                                                       |
| AC3 | No gardener finding, same health score             | `core/gardener/help-exclusion.test.ts` (three); `main/gardener-ipc.test.ts` "a run leaves the help module out…"  |
| AC4 | Marker/version; current, outdated, missing; Update | `core/agent/help-module.test.ts`; `core/agent/help-setup.test.ts` (two); e2e `help-module.spec.ts`               |
| AC5 | User's added page byte-identical after update      | `core/agent/help-setup.test.ts` "a page the user added stays byte-identical after update"                        |
| AC6 | A page for every rail screen, vault format, agent  | `core/agent/help-module.test.ts` "every rail screen has a help page"                                             |
| AC7 | About-this link opens the agent page               | e2e `help-module.spec.ts`                                                                                        |
| —   | Decision: collision blocks install                 | `core/agent/help-setup.test.ts` "an unmarked user module named gaston-help blocks install…" (+ three more edges) |

### 087 — Open Claude in the vault from Gaston

| AC  | Criterion (short)                                | Proving test                                                                                                                                                                   |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC1 | Terminal in the vault running `claude`           | `core/agent/terminal.test.ts`; e2e `agent-terminal.spec.ts` (recorded launch) — **real window: manual residue**                                                                |
| AC2 | "Work the jobs" types the queue skill            | `core/agent/terminal.test.ts`; e2e `agent-terminal.spec.ts` — **real window: manual residue**                                                                                  |
| AC3 | "Curate a module" types curator skill and module | `core/agent/terminal.test.ts` (two); `main/ipc/agent-terminal.test.ts`; e2e — **real window: manual residue**                                                                  |
| AC4 | Disabled with a reason without CLI/setup         | `shared/agent-terminal-readiness.test.ts`; `main/ipc/agent-terminal.test.ts` (two); `renderer/agent-terminal-section.test.tsx`; e2e                                            |
| AC5 | No print/headless flag, no key; one spawn        | `core/agent/terminal.test.ts` "no plan carries a print, headless, permission-bypass or key flag"; `main/ipc/agent-terminal.test.ts` "a launch spawns only the terminal, once…" |
| AC6 | Spaces and non-ASCII in the vault path           | `core/agent/terminal.test.ts` (escaped `-d`); `main/ipc/agent-terminal.test.ts` "…survives the real argv round-trip"                                                           |
| AC7 | Failed launch says so with the reason            | `main/ipc/agent-terminal.test.ts` (two); `renderer/agent-terminal-section.test.tsx`; e2e (wt missing, wt and cmd missing)                                                      |

### Manual residue

- **087 AC1–AC3:** that a real Windows Terminal / PowerShell window opens in the vault with `claude`
  running and the skill typed. Tests never start a real terminal or the real CLI; this needs the user's
  desktop session and CLI login. Steps in [testplan.md](testplan.md). Blocks nothing.

### Criteria covered below the real surface

- 087 AC1–AC3, AC5: proven at the launch-plan and spawn-recorder level, not a window (the residue above).
  The 087 e2e spec skips off Windows, where the handler refuses `unsupported-platform` (a main unit test
  covers that refusal).
- 087 AC6: the argv round-trip uses a real `spawn` of `process.execPath` with the wt plan's arguments, not
  `wt.exe`.
- 083 AC5: the e2e checks `journal/` and `raw/` in the About text only, not every sentence of the
  criterion; the full text is pinned by the i18n key-set test. 083 AC6: the "unknown" display is a
  renderer test, because a failing lookup cannot be forced through the real surface without a test-only
  branch in main.
- 081 AC1: "never after an ingest" is proven by 082 AC1's test; nothing in 081 schedules a run.
- 085 AC2/AC3: real `powershell.exe` through the real script, but unit level on win32 only. The
  adversarial battery above them did not run (see Blocked / open).

## Tier record

| Story | Ds     | hard Ds | Review stages    | Review cycles | Agents | Build minutes |
| ----- | ------ | ------- | ---------------- | ------------- | ------ | ------------- |
| 081   | 7      | 1       | 1 (default)      | 1             | 11     | 48            |
| 082   | 6      | 1       | 1 (default)      | 1             | 10     | 22            |
| 083   | 4      | 0       | 1 (default)      | 1             | 6      | 13            |
| 084   | 7      | 1       | 1 (default)      | 1             | 11     | 40            |
| 085   | 6      | 1       | 2 (default+hard) | 2             | 16     | 98            |
| 086   | 4      | 1       | 2 (default+hard) | 3             | 14     | 62            |
| 087   | 4      | 0       | 1 (default)      | 1             | 8      | 21            |
| **Σ** | **38** | **5**   | **9**            | **10**        | **76** | **304**       |

Outside the stories: the refine round (all seven in parallel) took 21 min (08:14–08:35) and the gate
4.4 min (one gate agent), so the sprint's measured agent time is about 330 minutes.

Did the hard review find anything the default review missed? Yes, once, in 086, where the second stage
found false page claims and a collision-ownership gap (a manifest-first path) that the default stage had
passed; in 085 it found nothing, because its adversarial probe battery never ran and its PASS verdicts
rest on reading only. Five of the seven stories had a hard deliverable but only 085 and 086 also
escalated the review (the other three hard-D stories passed the default review in one cycle).
