---
id: 090
title: I hand a waiting source to the agent
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

A source in `awaiting-llm` (`src/core/ingest/queue.ts`) waits for a model the user may not have,
or one too weak to condense it well. The user can hand it to the agent instead — explicitly, per
source; nothing reaches the agent without a click (concept §10, AGT-12 to AGT-14).

The click writes one job file under `.secondbrain/`. The job-queue skill ([[084]]) works it: the
agent writes the source page under `wiki/sources/` and a result file. Gaston validates the result
before doing any bookkeeping — `sourcePage` and `modules` in `.ingest.json`, the `index.md` and
`log.md` check — exactly as after a digestion. The agent never writes `.ingest.json`.

The Tasks screen shows a handed-over job and its outcome like any other task; job files make it
survive a restart, which today's session-only work queue does not. This story builds the job and
result format and the validation the other job kinds ([[091]], [[092]]) reuse.

## Acceptance Criteria

- [x] **AC1** — A source in `awaiting-llm` offers "Hand to agent" in Sources and in the Tasks
      screen; one click writes exactly one job file, and a second click on the same source writes
      none.
- [x] **AC2** — No job file exists for a source the user did not hand over.
- [x] **AC3** — A handed-over source shows as "with the agent" in the Tasks screen, also after a
      restart.
- [x] **AC4** — After a valid result, `.ingest.json` carries `sourcePage` and `modules` as after a
      digestion, and the source leaves `awaiting-llm`.
- [x] **AC5** — A result that fails validation (page missing, invalid frontmatter, page outside a
      module's wiki, `.ingest.json` touched) shows the job as failed with the reason and changes
      no bookkeeping.
- [x] **AC6** — A result the agent marked failed or skipped shows that reason in the Tasks screen.
- [x] **AC7** — The installed job-queue skill describes the condense-source kind and the result
      format; the template test pins it.

## Open Questions

- ~~**Q1 — Formats** (concept O3): job and result frontmatter, file naming, retention of finished jobs.~~ answered → Decisions (Sprint)
- ~~**Q2 — Withdrawing.** Can the user take a handed-over job back (and the source return to `awaiting-llm`), or does it stay until the agent answers?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Formats: Markdown + frontmatter, one file per job; finished jobs move to `done/` and are pruned after 30 days.
- **(User)** Withdrawing: yes; the source returns to `awaiting-llm` and a late result is ignored.
- Tracked jobs are `<id>.md` in `jobs/`, results `<id>.md` in `results/`; story 095's `llm-task`
  jobs stay `.json` as shipped — they are a request/answer cache the gateway re-reads by id, and
  moving them into `done/` would break 095's "the next call returns the answer". The rule "result
  has the job's file name" covers both.
- Job id `<kind>-<YYYYMMDDTHHmmss>-<first 8 hex of sha256(subject)>`: readable in a listing, and a
  re-hand-over after a withdrawal gets a new id instead of colliding with its `done/` copy.
- "A second click writes none" means: no new job while an **open** job for the same kind and
  subject exists; after a finish or withdrawal a new hand-over is allowed (the source is waiting
  again).
- Finished jobs move to `.secondbrain/agent/jobs/done/<id>.md` with `outcome`, `reason`,
  `finishedAt` added to the frontmatter, and their result to `jobs/done/<id>.result.md`; under
  `jobs/` the agent cannot write (085's `internal-write` rule), so the record stays Gaston's.
- Pruning runs on every settle pass (vault open and agent-folder change) and deletes `done/`
  entries whose `finishedAt` is older than 30 days — no timer, no extra trigger.
- A result file that does not parse as frontmatter counts as "no result yet" (the agent may still
  be writing it, as 095 does for JSON); a parseable result with a wrong `status` or missing field
  fails the job with the reason.
- The job names the target module when the hand-over knows it (Sources row picker, ingest job's
  module) and `module: null` otherwise; then the agent picks an existing module, and validation
  requires the page under an existing module's `wiki/sources/`.
- Validation is hard (page missing, unreadable/invalid frontmatter — `type: source`, non-empty
  `title`, `raw` equal to the job's raw path —, path outside `modules/<m>/wiki/sources/` or in
  another module than the job named, `.ingest.json` hash differs from the one recorded at
  hand-over); a missing `index.md` entry or `log.md` entry is **added by Gaston** with the same
  helpers as a digestion — the page is the agent's work product, the index/log lines are
  bookkeeping Gaston owns after a digestion too, and failing would discard valid work.
- "Leaves `awaiting-llm`" = `.ingest.json` carries `sourcePage` + `modules`, so the Sources row loses
  "Not condensed" and the source is condensed everywhere; the in-memory ingest job stays as it is
  but shows the agent job's state next to it (the ingest queue is session-only, the file is truth).
- The Tasks screen reads agent jobs from the files through their own channel and group, not by
  mirroring into the session-only `WorkRegistry` — mirroring would give one state two owners
  (registry remove/retry vs. files).
- Open agent jobs do not count in the Tasks rail badge: it counts work Gaston is doing, and a job
  can wait days for the user's next terminal run.
- Withdrawing is the row's action while the job is open (Tasks screen and Sources); the job moves
  to `done/` with outcome `withdrawn`; a page the agent already wrote stays in the wiki (agent-
  writable layer), only the bookkeeping is skipped.
- The job file holds paths and instructions only, never source content (guardrail 6), plus
  `language: <languages.documents>` so the page is written in the document language.
- Restart persistence (AC3) is proven by a main-level test that a fresh handler set on the same
  vault lists the open job; no e2e relaunch helper exists and the list is derived purely from
  files, so a relaunch would only re-prove the same read.
- The skill template `gaston-jobs` goes 2 → 3; the generic "setup shows outdated after a bump" is
  084's mechanism with its own tests, so no extra e2e here.

## Plan

1. **Format** (core, `src/core/agent/job-files.ts`): Markdown job/result format, id, fs store
   (file / list open / list finished / finish into `done/` / withdraw / prune). Generic over kind,
   so 091 and 092 add kinds without touching it. VAULT-FORMAT documents it.
2. **Condense-source** (core, `src/core/agent/condense-source-job.ts` + `settle-jobs.ts`): the
   hand-over (records `.ingest.json` hash), the validation, the bookkeeping via the digestion
   helpers, and `settleAgentJobs` dispatching per kind through a validator map.
3. **Skill** `gaston-jobs` v3 documents `condense-source` and the Markdown result.
4. **Main + IPC**: `agent:jobs`, `agent:handOverSource`, `agent:withdrawJob`,
   `event:agent-jobs`; settle on vault open and on watcher paths under `.secondbrain/agent/`.
5. **Renderer, Sources**: "Hand to agent" / "With the agent" / "Withdraw" on the uncondensed row
   and the `awaiting-llm` job note; e2e flow starts here.
6. **Renderer, Tasks**: "With the agent" group, finished agent jobs with outcome and reason,
   "Hand to agent" on an `awaiting-llm` ingest task; e2e flow completes.

Order D1 → D2 → D3 → D4 → D5 → D6. D3 is independent of D2 and may run in parallel.

## Deliverables

- **D1 — Job and result file format.** New `src/core/agent/job-files.ts` (core, no Electron),
  shared types in new `src/shared/types/agent-jobs.ts` (re-export from `src/shared/types/index.ts`).
  Reuse `readTextOrNull`, `statOrNull`, `writeFileAtomic` from `src/core/vault/fs-io.ts`, `sha256`
  from `src/core/vault/hash.ts`, `parse`/`serialize` from `src/core/vault/frontmatter.ts`,
  `AGENT_DIRS` from `src/shared/types/agent-setup.ts`. Do not touch `src/core/agent/jobs.ts`
  (095's JSON `llm-task` jobs stay as they are).
  - Types: `AgentJobKind = 'condense-source'` (union; 091/092 extend it);
    `AgentJobFile { version: 1; id; kind; createdAt; subject: string; fields: Record<string, unknown>; body: string }`;
    `AgentJobOutcome = 'done'|'failed'|'skipped'|'withdrawn'`;
    `AgentResultFile = {status:'done'; fields: Record<string, unknown>; body} | {status:'failed'|'skipped'; reason: string}`;
    `AgentJobView { id; kind; subject; label: string; module: string|null; state: 'with-agent'|AgentJobOutcome; reason: string|null; createdAt; finishedAt: string|null }`.
  - Job file `.secondbrain/agent/jobs/<id>.md`: frontmatter `gaston: agent-job`, `version: 1`,
    `id`, `kind`, `created`, `subject`, plus the kind's fields; body = English instructions.
    Result file `.secondbrain/agent/results/<id>.md`: frontmatter `job: <id>`, `status`, `reason`
    (failed/skipped), kind fields (e.g. `sourcePage`); body free.
  - `agentJobId(kind, subject, now)` → `<kind>-<YYYYMMDDTHHmmss>-<sha256(subject)[0..8]>` (UTC).
  - `createAgentJobFiles(vaultRoot, now = () => new Date())` returning:
    `file(job)` → `'filed'|'exists'` (exists = an open job with same kind+subject; reads open
    jobs, not ids); `open()` → jobs directly in `jobs/` (not `done/`), oldest first;
    `result(id)` → `AgentResultFile | {invalid: reason} | null` (null = absent or frontmatter
    unparseable); `finish(id, outcome, reason)` → rewrites the job into `jobs/done/<id>.md` with
    `outcome`, `reason`, `finished` added, moves the result (if any) to `jobs/done/<id>.result.md`,
    deletes the originals; `finished()` → done entries newest first; `prune()` → deletes `done/`
    pairs with `finished` older than 30 days; `orphanResults()` → result ids without an open job
    (late results), which `finish`-style move into `done/` without bookkeeping.
  - Update `docs/VAULT-FORMAT.md`, section "Who writes what under `.secondbrain/agent/`": job and
    result frontmatter, file naming, `jobs/done/`, 30-day pruning, `.json` = `llm-task`.
  - Test `tests/core/agent/job-files.test.ts` (temp dir):
    "a job is one Markdown file named by kind, time and subject",
    "filing the same open subject again writes no second job",
    "a finished job moves to done with its outcome and result, and a new hand-over is allowed",
    "an unparseable result counts as no result, a result without status is invalid with a reason",
    "finished jobs older than 30 days are pruned",
    "a result for a withdrawn job is moved aside and reported as late".

- **D2 — Condense-source: hand-over, validation, bookkeeping.** Core only. New
  `src/core/agent/condense-source-job.ts` and `src/core/agent/settle-jobs.ts`; uses D1's
  `createAgentJobFiles`.
  - `handOverSource(deps, {rawPath, module: string|null, language})`: refuses (typed error
    `'not-a-source'|'already-condensed'`) unless the raw source exists and its `.ingest.json`
    has no `sourcePage` (read via `src/core/ingest/raw.ts` / `protocolPaths` in
    `src/core/wiki/raw-protocol.ts`). Files a job with `subject: rawPath`, fields `raw`, `module`,
    `language`, `title`, `ingestHash` (sha256 of `.ingest.json` now). Body: write one source page
    under `modules/<module>/wiki/sources/` per `docs/VAULT-FORMAT.md` (frontmatter `type: source`,
    `title`, `module`, `raw: <rawPath>`), add its `index.md` entry and one `log.md` entry, never
    write `.ingest.json`, then a result with `sourcePage: <vault-relative path>`.
  - `validateCondenseSource(deps, job, result)` → `{ok: true, module, slug, path}` or
    `{ok: false, reason}`. Reasons (English, stable codes + text): `page-missing`,
    `invalid-frontmatter`, `outside-module-wiki` (path must normalise to
    `modules/<m>/wiki/sources/<file>.md` with no `..`, `<m>` an existing module, equal to
    `job.module` when set), `ingest-touched` (current `.ingest.json` hash ≠ `ingestHash`).
  - `bookCondenseSource(deps, valid)` under `withModuleLock(module)`
    (`src/core/wiki/module-lock.ts`) in a `WikiTransaction` (`src/core/wiki/transaction.ts`):
    add the page's index entry if `diffIndex` (`src/core/wiki/index-md.ts`) shows it missing
    (`upsertEntries`), add an `ingest` log entry via `appendLog` (`src/core/wiki/log-md.ts`) if
    `parseLog` has none naming the page, then `markRawProtocol(store, raw, slug, module)`
    (`src/core/wiki/raw-protocol.ts`) last, exactly as `writeDigestion` in
    `src/core/wiki/ingest.ts` does. A conflict on `.ingest.json` → failed `ingest-touched`, rollback.
  - `settleAgentJobs(deps)` in `settle-jobs.ts`: for every open job with a result — done →
    validate + book via a `Record<AgentJobKind, Settler>` map (091/092 register theirs) → finish
    `done` or `failed` + reason; failed/skipped → finish with the agent's reason; invalid result →
    finish `failed` + reason. Then move late results aside and `prune()`. Returns whether
    anything changed. Never throws on one bad job; each job settles independently.
  - Test `tests/core/agent/condense-source-job.test.ts` (temp vault built with the existing
    fixtures in `tests/fixtures/`):
    "handing over a waiting source files one job naming raw path, module and ingest hash",
    "a condensed source cannot be handed over",
    "a valid result books sourcePage and modules and fills a missing index and log entry",
    "a result is refused when the page is missing, its frontmatter is invalid, it lies outside the
    module wiki or the ingest protocol was touched — bookkeeping unchanged" (table-driven, includes
    a `../` path and a page in another module),
    "a failed or skipped result keeps the agent's reason",
    "a late result after withdrawal books nothing".

- **D3 — `gaston-jobs` skill v3.** `src/core/agent/templates/skills.ts` (bump version 2 → 3),
  mirror `docs/agent-setup/skill-gaston-jobs.md` (prettier on this file only, LF, copy back
  exactly). Steps: list only files directly in `jobs/` (never `jobs/done/`), oldest first by
  `created`; skip a job that already has a result; result name = job file name (`.md` → `.md`,
  `.json` → `.json`). New section `### condense-source`: read the raw source at `raw`, write the
  page under `modules/<module>/wiki/sources/` (any existing module when `module` is null) with
  frontmatter `type: source`, `title`, `module`, `raw`, in `language`, add the `index.md` entry and
  one `log.md` entry, then the result. Result format section: Markdown with frontmatter
  `job`, `status: done|failed|skipped`, `reason` (failed/skipped), `sourcePage` (done,
  condense-source); `llm-task` keeps its JSON result. Keep "never write `.ingest.json`".
  Test in `tests/core/agent/templates.test.ts`: "the jobs skill describes the condense-source
  job and the Markdown result Gaston reads" (asserts `condense-source`, `sourcePage`,
  `wiki/sources/`, `jobs/done/` exclusion, `status: done`, `.ingest.json`). The existing mirror
  test covers the rest.

- **D4 — Main and IPC.** Files: `src/shared/ipc.ts` (channels + allowlist), new
  `src/main/ipc/agent-jobs.ts` (`agentJobsHandlers(services)` via `defineHandlers`, mirror
  `src/main/ipc/agent-setup.ts`), `src/main/ipc/register-all.ts`, `src/main/services.ts`,
  `src/renderer/lib/api.ts` (`agent.jobs`, `agent.handOverSource`, `agent.withdrawJob`).
  - `agent:jobs` `{req: void; res: AgentJobView[]}` (open + finished);
    `agent:handOverSource` `{req: {rawPath; module: string|null}; res: {outcome: 'filed'|'exists'; job: AgentJobView}}`
    — validate `rawPath` is vault-relative under `raw/` (reuse the existing path check the ingest
    handlers use), language from settings `languages.documents`;
    `agent:withdrawJob` `{req: {id}; res: AgentJobView[]}`; event `event:agent-jobs`
    (`AgentJobView[]`).
  - Settle: on vault open and when `handleVaultChange` sees a path under `.secondbrain/agent/`
    (reuse an agent-path dispatch if story 088 added one, else add a small one), run
    `settleAgentJobs`, then emit `event:agent-jobs`. Serialise settle runs (one chain) so two
    watcher bursts never book twice.
  - Test `tests/main/agent-jobs-ipc.test.ts` (pattern of `tests/main/ingest-ipc.test.ts`):
    "handing a source over twice files one job", "no job exists for a source nobody handed
    over", "a result written into the results folder is settled on the next change and emitted",
    "a fresh session on the same vault lists the open job as with the agent",
    "withdrawing returns the source to waiting and a late result books nothing". The IPC
    coverage test (`tests/main/ipc-coverage.test.ts`) must stay green.

- **D5 — Sources: hand over, with the agent, withdraw.** Files: new
  `src/renderer/lib/queries/agent-jobs.ts` (query on `agent:jobs`, kept fresh by
  `event:agent-jobs`, mutations hand-over/withdraw; mirror `src/renderer/lib/queries/ingest.ts`),
  `src/renderer/screens/sources/SourceRow.tsx` (uncondensed row: "Hand to agent" next to
  Condense, with the picked module; when an open job exists for `source.path`: badge "With the
  agent" + "Withdraw" instead), `src/renderer/screens/sources/JobList.tsx` (`awaiting-llm` note:
  the same three states keyed by `job.rawPath`, module `job.module`), i18n
  `src/renderer/i18n/en-wiki.ts` / `de-wiki.ts` (`sources.agent.*`; German with „…“). Gaston
  atoms only (`Button`, `Badge`), sentence case, tokens only.
  - New e2e `tests/e2e/agent-source-job.spec.ts` (`test.use({ specId: 'agent-source-job' })`,
    no model): import a text source as `tests/e2e/import-task.spec.ts` does, so it ends
    `awaiting-llm`; test "a waiting source handed to the agent comes back condensed": click
    "Hand to agent" on the Sources row → exactly one file in `<vault>/.secondbrain/agent/jobs/`,
    row shows "With the agent" and no second hand-over button; the test then writes the source
    page, and `results/<id>.md` (`status: done`, `sourcePage`) with `fs` into `vaultPath`; the row
    loses "Not condensed" and the source's `.ingest.json` carries `sourcePage` and `modules`.

- **D6 — Tasks screen: the agent's jobs.** Files: `src/renderer/lib/tasks-view.ts` (agent group
  model), `src/renderer/screens/tasks/TasksScreen.tsx` (group "With the agent" for open jobs;
  finished agent jobs in the finished group, newest first), new
  `src/renderer/screens/tasks/AgentJobRow.tsx` (label, state badge, reason line for
  failed/skipped/withdrawn, "Withdraw" while open; same atoms and layout as `TaskRow`),
  `src/renderer/screens/tasks/TaskRow.tsx` (finished ingest task whose `detail.stage` is
  `awaiting-llm`: "Hand to agent" with `detail.module`, or "With the agent" when a job is open),
  i18n `src/renderer/i18n/en-tasks.ts` / `de-tasks.ts`. Uses D5's `queries/agent-jobs.ts`. The
  Tasks rail badge stays unchanged. Add a `CHANGELOG.md` entry under Unreleased › Added.
  - Extend `tests/e2e/agent-source-job.spec.ts` with test "the tasks screen shows the agent's
    jobs, their failure reason and a withdrawal": import a second text source; in Tasks click
    "Hand to agent" on its `awaiting-llm` task → one more job file, row in "With the agent"; write
    `results/<id>.md` with `status: failed`, `reason: transcript unreadable` → the row shows
    failed with that reason; hand it over again, click "Withdraw" → the row shows withdrawn and
    the Sources row offers "Hand to agent" again; also assert the first test's job shows as done
    in the finished group.
  - Renderer test `tests/renderer/agent-job-row.test.tsx`: "a failed agent job shows its reason
    and offers no withdraw".

## Model Hints

- D2 → deliverable-hard: it books `.ingest.json`, `index.md` and `log.md` from untrusted agent
  output — a containment check by string prefix (`modules/a/wiki/sources/../../x.md`) or a
  partial write without rollback would put wrong bookkeeping into the user's vault, and it must
  match `writeDigestion`'s order and lock exactly.
- Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/agent-source-job.spec.ts` › "a waiting source handed to the agent comes
  back condensed" (Sources) and › "the tasks screen shows the agent's jobs, their failure reason
  and a withdrawal" (Tasks); second click → unit `tests/core/agent/job-files.test.ts` › "filing the
  same open subject again writes no second job" and `tests/main/agent-jobs-ipc.test.ts` ›
  "handing a source over twice files one job"
- AC2 → `tests/main/agent-jobs-ipc.test.ts` › "no job exists for a source nobody handed over";
  e2e › "a waiting source handed to the agent comes back condensed" (exactly one job file)
- AC3 → e2e › "the tasks screen shows the agent's jobs, their failure reason and a withdrawal"
  ("With the agent" group); restart → `tests/main/agent-jobs-ipc.test.ts` › "a fresh session on
  the same vault lists the open job as with the agent"
- AC4 → unit `tests/core/agent/condense-source-job.test.ts` › "a valid result books sourcePage
  and modules and fills a missing index and log entry"; e2e › "a waiting source handed to the
  agent comes back condensed"
- AC5 → unit `tests/core/agent/condense-source-job.test.ts` › "a result is refused when the page
  is missing, its frontmatter is invalid, it lies outside the module wiki or the ingest protocol
  was touched — bookkeeping unchanged"; display → `tests/renderer/agent-job-row.test.tsx` › "a
  failed agent job shows its reason and offers no withdraw"
- AC6 → e2e › "the tasks screen shows the agent's jobs, their failure reason and a withdrawal";
  unit › "a failed or skipped result keeps the agent's reason"
- AC7 → unit `tests/core/agent/templates.test.ts` › "the jobs skill describes the condense-source
  job and the Markdown result Gaston reads" (+ existing "every setup template matches its docs
  mirror")
- Withdraw decision → `tests/main/agent-jobs-ipc.test.ts` › "withdrawing returns the source to
  waiting and a late result books nothing"; unit › "a late result after withdrawal books nothing"

Coverage: AC1 D5+D6+D1+D4 · AC2 D4 · AC3 D4+D6 · AC4 D2+D5 · AC5 D2+D6 · AC6 D2+D6 · AC7 D3.

## Done

A source in `awaiting-llm` can be handed to the agent per click (Sources row, `awaiting-llm` note, Tasks row).
Gaston files one Markdown job under `.secondbrain/agent/jobs/`, settles the agent's result file (validate,
then bookkeeping via the digestion helpers), and shows open and finished agent jobs in the Tasks screen
and Sources; withdrawing is supported. Skill `gaston-jobs` (now v4) documents `condense-source`.

Commit message: `090: hand a waiting source to the agent (job + result format, validation, Sources/Tasks UI, skill v4)`

Verification (narrow gate): `npm run build`, `lint`, `typecheck`, scoped `prettier --check` green;
`npx vitest run --changed HEAD` green (312 files, 4250 tests; known timing flakes passed alone on re-run);
`npx playwright test tests/e2e/agent-source-job.spec.ts tests/e2e/agent-setup.spec.ts
tests/e2e/agent-last-run.spec.ts tests/e2e/agent-protection.spec.ts` green (6/6). AC -> test as verified:
AC1-AC3, AC6 e2e `agent-source-job.spec.ts` (both tests) + `job-files`, `agent-jobs-ipc` tests; AC4, AC5
`condense-source-job.test.ts` + e2e + `agent-job-row.test.tsx`; AC7 `templates.test.ts`; withdraw decision
`agent-jobs-ipc` + `condense-source-job` late-result tests (all passed). No manual residue. Review: stage 1
(default) PASS, one fix cycle (no-protocol source refused and booking fails without a protocol, module slug
stored in the job, condensed source offers no hand-over in the note, hand-over/withdraw errors visible,
AC2 and withdraw IPC tests strengthened), narrow gate re-run green.

Decisions: skill `gaston-jobs` was already v3 (089), so it went 3 -> 4. Job format names for 091/092:
`src/core/agent/job-files.ts` (`createAgentJobFiles(vaultRoot, now)`: file/open/result/finish/finished/prune/
orphanResults/discardLateResult; `agentJobId`), types `src/shared/types/agent-jobs.ts` (`AgentJobKind`
union to extend), `src/core/agent/settler.ts` (`Settler`, `AgentJobDeps`, `AgentRefusal`), per-kind checker
registry `AGENT_JOB_SETTLERS: Record<AgentJobKind, Settler>` in `settle-jobs.ts` (`settleAgentJobs(deps,
settlers?)`), condense-source in `condense-source-job.ts` (`handOverSource`, `validateCondenseSource`,
`bookCondenseSource`, `settleCondenseSource`, `CONDENSE_REFUSALS`), views `job-views.ts`, main
`src/main/ipc/agent-jobs.ts` + `src/main/agent-jobs-settle.ts` (one serialised chain; settle on vault open and
on `jobs/`/`results/` paths; `agentJobDeps(services)`), channels `agent:jobs|handOverSource|withdrawJob`,
event `event:agent-jobs`. The watcher already reported `.secondbrain/agent/` paths, no dispatch from 088 existed.
Added hand-over code `unknown-module`. Unfixed, deliberately: `finish` after a successful booking that then
throws leaves the job open and a later settle fails it as `ingest-touched`; `finish` writes `done/` before
removing the open job (a crash between lists it twice briefly); non-empty-string helper exists in four
places; `condense-source-job.ts` is ~315 lines (hand-over, validation, booking); `(story 090)` pointers in
comments. e2e test 2 relies on test 1's finished job (same app, in-order). Format red outside this story:
`docs/requirements/*.md` story files fail `prettier --check`.

tiers: D 6 / hard 1 · review default · cycles 1 · agents 10
