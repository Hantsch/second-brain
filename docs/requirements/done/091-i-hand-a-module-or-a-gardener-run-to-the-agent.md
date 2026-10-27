---
id: 091
title: I hand a module or a gardener run to the agent
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Two more job kinds on the format from [[090]] (concept §10, AGT-12, AGT-15):

- **Curate module** — at a module in Knowledge and in the Agent tab. The agent changes the wiki
  layer directly (with `log.md`), writes proposals ([[088]]) for the rest, and the run report
  ([[089]]) says what it did. Gaston has nothing to book.
- **Gardener audit** — at a gardener run without an audit, in Maintenance. The agent writes its
  interpretation per finding; Gaston validates it with the same hard check against the index as
  `src/core/gardener/audit.ts` and stores it in `gardener.json` like a model audit.

The curator skill's checklist is decided here (concept O11): at least filing, links, index
completeness and contradictions.

## Acceptance Criteria

- [x] **AC1** — A module in Knowledge offers "Hand to agent"; one click writes exactly one
      curate-module job.
- [x] **AC2** — A gardener run without an audit offers "Hand to agent" in Maintenance; one click
      writes exactly one gardener-audit job.
- [x] **AC3** — A finished curate job shows as done in the Tasks screen with the number of pages
      changed and proposals written, taken from its run report.
- [x] **AC4** — A valid audit result passes the `audit.ts` check, is stored in `gardener.json`, and
      Maintenance shows it like a model audit.
- [x] **AC5** — An audit result naming a path not in the index or a finding not in the run shows
      the job as failed with the reason, and `gardener.json` is unchanged.
- [x] **AC6** — The installed curator skill lists its checklist (filing, links, index completeness,
      contradictions); the template test pins it.

## Open Questions

- ~~**Q1 — The curator checklist** (concept O11): anything beyond the four named points?~~ answered → Decisions (Sprint)
- ~~**Q2 — Help module.** Is "Hand to agent" offered on the help module ([[086]]), or hidden because Gaston overwrites its pages?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Curator checklist: only the four points the story names.
- **(User)** Help module: "Hand to agent" is hidden on it.
- Both kinds reuse [[090]]'s job/result format, file naming, store, dedupe, withdraw and result
  pickup; this story only adds two kinds and their validators, because a second format is exactly
  what 090 exists to prevent.
- Curate job subject is the module slug; one open curate job per module, a second click writes
  none — the same identity rule 090 applies per source, so AC1's "exactly one" holds.
- The help module is refused in core as well as hidden in the UI, so a hand-made IPC call cannot
  file it either.
- Curate counts come from the run report ([[089]]) that lists the job as finished: pages changed
  = the report's changed pages under `modules/<slug>/wiki/`, proposals written = the report's
  proposals for that run. Proposals carry a run, not a job ([[088]]), so a run that worked several
  jobs reports its proposals under each — stated, not hidden.
- A valid curate result without a report yet shows as done with "report pending" instead of
  numbers; the counts appear when the report arrives (watcher), never guessed.
- Curate needs no validation beyond the result shape: concept §10 says Gaston has nothing to book,
  and the wiki-page/`log.md` check is already the post-write hook from [[085]].
- "In the Agent tab" is served by the Agent screen's commands panel: each curatable module slug
  listed there gets the same hand-to-agent button, so the requirement's second place exists
  without a new picker.
- A gardener run is identified by its `ranAt` (gardener.json keeps only the latest run and has no
  run id); a result for a run that is no longer the stored one fails with "the run was replaced".
- "Has an audit" becomes an explicit optional `audit: { by: 'model' | 'agent', at }` on
  `StoredRun`, set by both paths: `usedLlm` also turns true from the loose-ends stage and
  `completed` lists `audit` even when no model answered, so neither can say it. Runs stored before
  the field count as audited when `usedLlm` is true.
- "Hand to agent" on a run is offered only when the run has at least one page to interpret
  (`auditPages` non-empty) — the same precondition under which the model path makes no call.
- The gardener-audit job carries the run's `ranAt`, its findings (id, kind, title, paths), the
  candidate ids and the page paths from `auditPages`; no excerpts, because the agent reads the
  vault itself and the job file should not copy content.
- The result answers in the model's shape (`contradictions`, `confirmed`, `rejected`, `advice`).
  The check is one function extracted from `audit.ts`: the model path keeps dropping bad entries
  as today, the agent path fails the whole result on any dropped entry (AC5) — one check, two
  policies, no copy.
- Maintenance shows an agent audit exactly as a model audit (AC4); the `by` field is stored for
  the record, not displayed, in this story.
- Skill text: `gaston-jobs` documents both kinds and their result shapes; `gaston-curate` keeps
  exactly the four checklist points it already has (User decision) — both template versions go
  up, so an installed setup shows "outdated".

## Plan

Builds on 088 (proposals), 089 (run reports) and 090 (job/result format, store, pickup, Tasks
rows for agent jobs). Nothing here defines a format of its own.

1. **Curate kind (core)** — `curate-module` job: file (dedupe, help refused) and outcome from the
   run report.
2. **Audit kind (core)** — extract the hard check from `src/core/gardener/audit.ts` into one
   exported function; build the gardener-audit job from the stored run; validate a result
   strictly.
3. **Booking the audit (core + gardener state)** — apply a validated agent audit to the stored
   run in `gardener.json`: rejected candidates leave, contradictions join, advice, `audit` field,
   `completed`/`checkedKinds` — without touching dismissed/snoozed decisions. Model path sets the
   new `audit` field too.
4. **Main wiring** — IPC to hand a module / a run; register both result handlers in 090's pickup;
   failure records the reason and leaves `gardener.json` byte-identical.
5. **Buttons** — Knowledge module header, Agent screen commands panel, Maintenance health card.
6. **Tasks rows + e2e** — kind labels, curate counts, audit failure reason; one spec file with two
   flows; changelog.
7. **Skills** — `gaston-jobs` learns both kinds, versions bumped, mirrors and template test.

Order: D1, D2, D3, D4, D5, D7, D6 (the e2e needs the installed skill text only as documentation,
but D7 is cheap and keeps the template test green before the last UI D).

## Deliverables

- **D1 — Curate-module job kind (core).** Add kind `curate-module` (subject: module slug) to the
  job types and store [[090]] built in `src/core/agent/` (jobs module; reuse its id, dedupe and
  write helpers — do not define a second format). New `src/core/agent/curate-job.ts`:
  `fileCurateJob(store, slug)` refuses `HELP_MODULE_SLUG` (`src/shared/help-module.ts`) and an
  unknown module, and writes nothing when an open curate job for the slug exists;
  `curateOutcome(jobId, slug, reports)` takes the reports via [[089]]'s report reader, picks the
  newest report listing the job as finished, and returns `{ pagesChanged, proposalsWritten }`
  (pages counted only under `modules/<slug>/wiki/`) or `{ reportPending: true }`. Result
  validation is the result shape only (done / failed / skipped with reason). Tests in
  `tests/core/agent/curate-job.test.ts`: "a second hand-over of the same module files no second
  job", "the help module is never filed", "the outcome counts the module's pages and the run's
  proposals from the report", "a done result without a report says the report is pending".
- **D2 — Gardener-audit job kind and the shared hard check (core).** In
  `src/core/gardener/audit.ts` extract the existing validation (contradiction paths must be two
  distinct wiki pages in the index, ids must be candidate ids, advice trimmed to `MAX_ADVICE`)
  into an exported `checkAuditAnswer(ctx, answer, candidateIds)` returning the cleaned
  `AuditResult` parts plus a list of violations with reasons; `auditFindings` uses it and keeps
  dropping silently (its existing tests in `tests/core/gardener/` must stay green unchanged). New
  `src/core/agent/audit-job.ts`: `buildAuditJob(ctx, storedRun)` (kind `gardener-audit`; `ranAt`,
  findings as id/kind/title/paths, candidate ids from `AUDIT_CANDIDATE_KINDS`, page paths from
  `auditPages`; returns `null` when there is no page to interpret), and
  `validateAuditResult(ctx, job, storedRun, answer)` → ok with the cleaned audit, or failed with
  the reason when the stored run's `ranAt` differs ("the run was replaced"), the answer is
  malformed, or `checkAuditAnswer` reports any violation (the reason names the path or id). Tests
  in `tests/core/agent/audit-job.test.ts`: "a result naming a path not in the index fails with
  that path", "a result confirming a finding that is not a candidate of the run fails with that
  id", "a result for a replaced run fails", "a valid result passes the same check as a model
  audit", "a run with nothing to interpret builds no job".
- **D3 — Booking an agent audit into `gardener.json` (core + gardener state).** Add optional
  `audit?: { by: 'model' | 'agent'; at: string }` to `StoredRun`
  (`src/core/gardener/run-record.ts`), read/validated in `src/core/gardener/run-read.ts`; the model
  path in `src/main/ipc/gardener-deps.ts` sets `{ by: 'model' }` when `auditFindings` answered with
  `usedLlm: true`. Export `hasAudit(run)` (field present, or legacy: no field and `usedLlm`). New
  `src/core/gardener/run-audit-apply.ts`: `applyAgentAudit(run, audit, at)` returns the new
  `StoredRun` — rejected candidate ids removed from `findings` but kept in `consideredIds`,
  contradictions added (scope-filtered when the run is scoped, deduped by id, sorted like the run's
  findings), `consideredIds` extended by the contradiction ids, `advice` set, `usedLlm: true`,
  `'audit'` in `completed`, `'contradiction'` in `checkedKinds`, `audit: { by: 'agent', at }`;
  `ranAt`, `plan`, `healthAsOf`, `scope` untouched so `isRunComplete` answers as before. Persist
  through the existing state write in `src/main/gardener-state.ts` without passing through the
  pruning of dismissed/snoozed decisions as a new run would. Tests in
  `tests/core/gardener/run-audit-apply.test.ts`: "an agent audit drops rejected candidates but
  keeps them considered", "an agent audit keeps dismissed and snoozed decisions", "an applied
  audit leaves the run's completeness as it was", "an old run with a model answer counts as
  audited".
- **D4 — Main wiring.** In 090's agent IPC file under `src/main/ipc/` add the hand-over calls for
  the two kinds (channels in `src/shared/ipc.ts` following 090's naming, e.g. a `kind` on its
  hand-over channel, or `agent:handModule` / `agent:handGardenerRun` if 090's channel is
  source-specific); the renderer passes only a slug or nothing — main resolves the module and
  the stored run itself and validates the slug as every path from the renderer. Register result
  handlers for both kinds in 090's result pickup: curate → outcome via D1; gardener-audit →
  validate via D2, book via D3, otherwise record the job failed with the reason and do not write
  `gardener.json`. Emit the existing gardener report invalidation after booking so Maintenance
  refreshes. Tests in `tests/main/agent-module-jobs.test.ts` (mirror 090's main test): "an invalid
  audit result leaves gardener.json byte-identical and fails the job", "a valid audit result is
  booked once even when the result file is seen twice".
- **D5 — Hand-to-agent buttons (renderer).** Reuse the hand-to-agent button/hook 090 built for
  Sources (do not write a second one). Place it in
  `src/renderer/screens/modules/ModuleActions.tsx` (hidden for `HELP_MODULE_SLUG`; secondary
  variant; shows "with the agent" while a job is open), next to each slug in
  `src/renderer/screens/agent/AgentCommandsPanel.tsx`, and in the footer row of
  `src/renderer/screens/garden/HealthCard.tsx` when the run has no audit and has something to
  interpret (main reports both via the report/ IPC response, not computed in the renderer). i18n
  keys in en/de (German with „…“). Tests in `tests/renderer/hand-to-agent-places.test.tsx`: "the
  help module offers no hand-over", "a run with an audit offers no hand-over", "an open job shows
  the module as with the agent".
- **D6 — Tasks rows, e2e, changelog.** In the agent-job row 090 added under
  `src/renderer/screens/tasks/` add the two kinds' labels (module title / "maintenance run of
  <date>"), the curate line "n pages changed, m proposals written" or "report pending", and the
  failed reason for both; i18n en/de. New `tests/e2e/agent-module-jobs.spec.ts` with two tests
  (one app launch), simulating the agent by writing result and report files in 089's and 090's
  formats: "a module handed to the agent comes back with its report in Tasks" (click in
  Knowledge → exactly one job file, button shows with the agent → result + report → Tasks shows
  done with the counts) and "a gardener run handed to the agent: a bad audit fails, a good one is
  stored" (run maintenance → hand → exactly one job file → result naming an unknown path → Tasks
  shows failed with the path, `gardener.json` unchanged → hand again → valid result → Maintenance
  shows the advice as for a model audit). Entry in `CHANGELOG.md`.
- **D7 — Skill templates.** `src/core/agent/templates/skills.ts`: `gaston-jobs` documents kinds
  `curate-module` (work the module like `/gaston-curate <slug>`, write the result; the report is
  the run's) and `gardener-audit` (read the listed pages, answer `contradictions` / `confirmed` /
  `rejected` / `advice` with paths from the vault and ids only from the job, at most three advice
  sentences) with an example of each result; version +1. `gaston-curate`: keep the four checklist
  points exactly, mention it may also be started by a curate-module job; version +1. Update the
  mirrors `docs/agent-setup/skill-gaston-jobs.md` and `skill-gaston-curate.md`. Tests in
  `tests/core/agent/templates.test.ts`: "the curator skill lists its four-point checklist", "the
  job skill describes the curate and audit kinds".

## Model Hints

- D3 → deliverable-hard: booking an audit into an existing stored run after the fact is a new path
  into `gardener.json` next to `applySavedRun`'s merge, and getting `consideredIds`, `completed` or
  the dismissed/snoozed pruning wrong silently deletes user decisions or flips run completeness —
  regressions no screen shows.
- Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/agent-module-jobs.spec.ts` › "a module handed to the agent comes back with
  its report in Tasks"; plus unit `tests/core/agent/curate-job.test.ts` › "a second hand-over of
  the same module files no second job"
- AC2 → e2e `tests/e2e/agent-module-jobs.spec.ts` › "a gardener run handed to the agent: a bad
  audit fails, a good one is stored"
- AC3 → e2e `tests/e2e/agent-module-jobs.spec.ts` › "a module handed to the agent comes back with
  its report in Tasks"; plus unit `tests/core/agent/curate-job.test.ts` › "the outcome counts the
  module's pages and the run's proposals from the report"
- AC4 → unit `tests/core/agent/audit-job.test.ts` › "a valid result passes the same check as a
  model audit" and `tests/core/gardener/run-audit-apply.test.ts` › "an agent audit drops rejected
  candidates but keeps them considered"; surface in e2e `tests/e2e/agent-module-jobs.spec.ts` › "a
  gardener run handed to the agent: a bad audit fails, a good one is stored"
- AC5 → unit `tests/core/agent/audit-job.test.ts` › "a result naming a path not in the index fails
  with that path" and "a result confirming a finding that is not a candidate of the run fails with
  that id"; `tests/main/agent-module-jobs.test.ts` › "an invalid audit result leaves gardener.json
  byte-identical and fails the job"; surface in the same e2e flow as AC2
- AC6 → unit `tests/core/agent/templates.test.ts` › "the curator skill lists its four-point
  checklist"
- (User) help-module decision → renderer `tests/renderer/hand-to-agent-places.test.tsx` › "the help
  module offers no hand-over"; unit `tests/core/agent/curate-job.test.ts` › "the help module is
  never filed"

## Done

A module (Knowledge header, Agent commands panel; never the help module) and a gardener run without an
audit (Maintenance health card) can be handed to the agent as `curate-module` / `gardener-audit` jobs on
090's format. A finished curate job shows pages changed and proposals written from the run report (or
"report pending"). An agent audit is validated by the shared `checkAuditAnswer`, booked into
`gardener.json` only when valid (any violation fails the whole job, file byte-identical).

Commit message: `091: hand a module or a gardener run to the agent (curate + audit jobs, strict audit booking, buttons, Tasks rows, skills v5/v3)`

Verification (narrow gate): `npm run build`, `lint`, `typecheck`, scoped `prettier --check` green;
`npx vitest run --changed HEAD` (~320 files, ~4300 tests) green apart from load-dependent timing flakes
(`journal.test.tsx`, `settings.test.tsx` a11y, `perf.test.ts`, `capture-ipc.test.ts`, `overview-flow`,
`agent-terminal`) that all pass alone; `npx playwright test tests/e2e/agent-module-jobs.spec.ts
agent-setup agent-screen agent-source-job` green (7/7). AC -> test as verified (all passed): AC1-AC3 e2e
first test + `curate-job.test.ts`; AC2, AC4, AC5 e2e second test + `audit-job.test.ts`,
`run-audit-apply.test.ts`, `tests/main/agent-module-jobs.test.ts`; AC6 `templates.test.ts`; help-module
decision `hand-to-agent-places.test.tsx` + `curate-job.test.ts`. No manual residue. Review: stage 1
(default) PASS, one fix cycle (see Decisions), narrow gate re-run green.

Decisions: names for 092: `fileCurateJob`/`curateOutcome`/`settleCurateModule` (`curate-job.ts`),
`buildAuditJob`/`validateAuditResult`/`settleGardenerAudit` (`audit-job.ts`), optional
`AgentJobDeps.gardenerAudit` (`settler.ts`), `checkAuditAnswer` (`gardener/audit.ts`), `hasAudit`/
`applyAgentAudit`/`bookAgentAudit` (`run-audit-apply.ts`, `GardenerState.bookAgentAudit`), channels
`agent:handOverModule` / `agent:handOverGardenerRun`, `AgentHandOverResult`, `AgentJobView.curate`,
`GardenerReport.agentAudit`, `readRecentRuns` (`run-reports.ts`). `StoredRun.audit` is `RunAudit | null`
(null = new run without audit, absent = legacy; legacy counts as audited when `usedLlm`), because a new
run's `usedLlm` also turns true from loose ends. `'audit'` joins `completed` only when `isRunComplete`
stays unchanged; `checkedKinds` gets `'contradiction'` only when the run recorded a list. Agent audit fails
on over-long advice, not just bad paths/ids. Skills: `gaston-jobs` 4->5, `gaston-curate` 2->3 (new
`skills-jobs-kinds.ts`); mock bridge pins updated. Open-job lookups match the stored run's `ranAt`.
Unfixed, deliberately: `agentJobId` has second resolution (same-second re-hand-over of one subject reuses
the id; inherited from 090); `isRecord` is a fifth local copy; `slugify(x) !== x` vs a regex slug check;
e2e relies on the automatic maintenance run after vault open; e2e pins "Interpreted by the model." for an
agent audit (story decision: shown like a model audit). The orchestrator fixed the stale mock-bridge skill
versions directly (two-line pin change). Format red outside this story: `docs/requirements/*.md`.

tiers: D 7 / hard 1 · review default · cycles 1 · agents 11
