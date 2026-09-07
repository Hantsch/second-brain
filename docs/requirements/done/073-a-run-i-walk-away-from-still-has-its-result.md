---
id: 073
title: A run I walk away from still has its result
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The two runs the user actually named — condensing an area or a project, and closing a day —
become tasks in story 071's queue, and their results stop being tied to the component that
started them. Today both are awaited mutations in the renderer
(`src/renderer/lib/queries/condense.ts:43`, `journal:close`): leaving the screen mid-run
means the proposal, once it arrives, has nowhere to land, and the user has to run the model
again to get it back. On a local model that is minutes of work thrown away.

Decided with the user at the cut (2026-09-07): the finished task itself holds the result and
offers a way to it — "view result" routes to the area's or project's knowledge tab, or to the
day, with the proposal open. Guardrail 2 stays intact: a proposal that arrived while the user
was elsewhere is still a proposal and is never written by itself.

## Acceptance Criteria

- [x] **AC1** — Starting a condensation (area or project) creates a task visible in the queue,
      and the panel that started it shows the same state as the task list.
- [x] **AC2** — Navigating to another screen while a condensation runs does not cancel it;
      returning to the panel shows the finished proposal instead of an empty panel or a
      restarted run.
- [x] **AC3** — Starting a day's close creates a task with the same behaviour: leaving the
      journal and coming back shows the finished close proposal.
- [x] **AC4** — A finished task offers "view result", which routes to the area/project
      knowledge tab resp. the day, with the proposal open.
- [x] **AC5** — A proposal that completes while the user is on another screen writes nothing
      to the vault until it is accepted (CLAUDE.md guardrail 2).
- [x] **AC6** — Requesting a second condensation while one runs shows that it is waiting, with
      its position — not a spinner that means nothing.
- [x] **AC7** — With no model configured, no task is created and the existing honest "no
      model" state appears unchanged (CLAUDE.md guardrail 1).
- [x] **AC8** — A condensation or close that fails states its reason where the run was started
      as well as in the task list; the panel does not stay stuck in a running state.

## Open Questions

- ~~Where does a completed-but-unaccepted proposal live: extend the existing session store
  (`src/renderer/lib/close-proposal.ts`) and the condense query cache, or hang the payload on
  the task record in main?~~ answered → Decisions (Sprint)
- ~~Does a task whose result was accepted (or rejected) drop out of the finished group, or stay
  with an "accepted" mark?~~ answered → Decisions (Sprint)
- ~~Does the interview plan (`journal:interviewPlan`) belong in this story or ride along in
  074?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** A completed-but-unaccepted result lives on the task record in main, not the
  renderer session store — the renderer store dies on reload, which is exactly the complaint
  this story fixes.
- **(User)** A task whose result was accepted or rejected stays in the finished group with an
  "accepted"/"rejected" mark, rather than dropping out.
- **(User)** The interview plan (`journal:interviewPlan`) rides along in story 074, not here —
  073 stays focused on condense/ingest result persistence.
- The result payload lives in main keyed by task id and is fetched on demand (`tasks:result`);
  the broadcast task record only carries `hasResult` — the user's decision, without pushing
  vault content through every list broadcast (071/AC8, CLAUDE.md guardrail 6).
- The result store is `src/core/tasks/results.ts` — pure, capped, cleared on vault close — with
  main only wiring it, per CLAUDE.md's core-knows-no-Electron guardrail.
- `condense:run` and `journal:close` keep their names but return a task handle instead of the
  payload — one contract change beats a second parallel channel next to the old one.
- The accepted/rejected mark is set in main inside the existing `condense:accept` /
  `condense:reject` / `journal:applyClose` handlers, resolved by kind+subject, so the mark
  cannot be forgotten from the renderer and no request shape changes.
- `src/renderer/lib/close-proposal.ts` stays as the renderer-local _edit_ buffer and is seeded
  from the task result — story 075 in this sprint builds on it, so it is not removed here.
- A heuristic (no-model) day close still creates a task, off the model lane, per 071's decision;
  AC7's "no task is created" therefore refers to the condense path, the one with an explicit
  `no-model` result.
- Panel state is derived from the task list rather than held locally, so AC1's "same state" is
  one source proven by a test, not two views that happen to agree.
- e2e gets one env seam, `SB_E2E_FAKE_PROVIDER` (JSON file with `replies` / `latencyMs` /
  `failEverything`) feeding the existing `FakeProvider` via the existing `kind: 'fake'` config —
  mirroring `SB_E2E_STAGE_DELAY_MS`; without it no condensation can run offline in e2e, and
  ROADMAP.md already names this as the wanted follow-up to S14's harness gap.
- Three e2e spec files instead of one, because the fake-provider fixture option is worker-scoped
  per spec file: happy path, no-model, failure.
- "View result" targets the existing addresses (`/notes?a=<slug>&tab=condensed`,
  `/projects?p=<slug>&tab=knowledge`, `/journal?d=<date>`) through one helper, so the tasks
  screen carries no route knowledge.
- The "view result" action is added to story 072's task list component rather than a new screen —
  073 comes after 072 in the sprint's strict build order.

## Plan

Assumes 071's registry (`enqueue`, a task record with kind/subject/state/position, the list
channel and its change event) and 072's `/tasks` screen exist.

1. **Shared + core.** `TaskResult` union (`condense` → `CondenseProposal`, `journal-close` →
   `JournalCloseSuggestion`) in `src/shared/types/tasks.ts`; a capped, pure result store in
   `src/core/tasks/results.ts` (`put` / `get` / `bySubject` / `mark` / `clear`), keyed by task
   id. None of it travels in the list broadcast.
2. **Main.** New `tasks:result` channel (`{ id }` → `TaskResult | null`) in `src/shared/ipc.ts`
   plus the preload allowlist. `condense:run` (`src/main/ipc/condense.ts`, `condense-unit.ts`)
   returns the existing `no-model` result unchanged, otherwise enqueues a model-lane task and on
   success puts the proposal into the store. `journal:close` (`src/main/ipc/journal.ts`) does the
   same, off the model lane when heuristic. Accept/reject handlers mark the record and drop the
   payload.
3. **Renderer.** One hook `useTaskForSubject(kind, subject)` returns state, queue position, error
   and result for a subject; `queries/condense.ts` starts a task instead of awaiting one.
   `CondensedUnitPanel` / `AreaCondensedTab` / `ProjectKnowledgeTab` and `JournalScreen` /
   `CloseProposal` render from it (running, waiting with position, failed with reason, finished
   with proposal). `close-proposal.ts` gets seeded from the task result instead of the mutation.
4. **Way back.** `src/renderer/lib/task-result-route.ts` maps a finished task to its address; the
   tasks screen's list gets a "view result" action using it.
5. **Harness.** `SB_E2E_FAKE_PROVIDER` seam next to the provider factory in
   `src/main/llm-bridge.ts`, plus a `fakeProvider` worker option in `tests/e2e/fixtures/app.ts`
   that writes the JSON file and the provider + routing into the throwaway vault's settings.

Order: D1 → D7 as listed. D1 first because every condense e2e depends on it.

## Deliverables

- **D1 — e2e can drive a deterministic offline model.** `SB_E2E_FAKE_PROVIDER` read once next to
  the provider factory (`src/main/llm-bridge.ts`, mirroring the env read in
  `src/main/ipc/gardener-run.ts:29`), passing `replies` / `latencyMs` / `failEverything` into
  `FakeProvider`; a `fakeProvider` worker option in `tests/e2e/fixtures/app.ts` that writes the
  file and the `kind: 'fake'` provider + routing into the vault settings (same place as
  `pinUiLanguage`). Files: `src/main/llm-bridge.ts`, `tests/e2e/fixtures/app.ts`,
  `tests/main/fake-provider-seam.test.ts`. Mirror: `tests/main/gardener-run-delay.test.ts`.
  Acceptance: env unset changes nothing; env set makes the provider answer scripted and offline,
  proven by that unit test.
- **D2 — the result store.** `TaskResult` in `src/shared/types/tasks.ts` (exported via
  `src/shared/types/index.ts`) and `src/core/tasks/results.ts`. Files: those two plus
  `tests/core/tasks/results.test.ts`. Acceptance: the cap evicts the oldest, `clear` empties,
  marking keeps the record and drops the payload.
- **D3 — condensation becomes a task.** `condense:run` enqueues instead of computing inline;
  `no-model` still returns before any task exists; the result goes into D2's store;
  `condense:accept` / `condense:reject` mark it. Files: `src/shared/ipc.ts`, the preload
  allowlist, `src/main/ipc/condense.ts`, `src/main/ipc/condense-unit.ts`, `src/main/ipc/tasks.ts`
  (the `tasks:result` handler), plus its test `tests/main/ipc/condense-task.test.ts` (fake gateway
  _and_ empty gateway). Acceptance: run → task id; the result is readable via `tasks:result` even
  though no renderer ever listened; no model → no task; accept marks and clears.
- **D4 — the day's close becomes a task.** The same for `journal:close`, off the model lane when
  `heuristic`; `journal:applyClose` marks. Files: `src/main/ipc/journal.ts` plus its test
  `tests/main/ipc/journal-close-task.test.ts`. Acceptance: close → task id, the suggestion is
  readable by id, and nothing is written to the vault before `applyClose`.
- **D5 — the condense panel reads the queue.** The `useTaskForSubject` hook,
  `queries/condense.ts` starting a task, and the three consumers rendering running /
  waiting-with-position / failed / finished. Files:
  `src/renderer/lib/hooks/use-task-for-subject.ts`, `src/renderer/lib/queries/condense.ts`,
  `src/renderer/components/condensed/CondensedUnitPanel.tsx`,
  `src/renderer/screens/notes/AreaCondensedTab.tsx`,
  `src/renderer/screens/projects/ProjectKnowledgeTab.tsx`, `src/renderer/i18n/de.ts` + `en.ts`.
  Tests: `tests/renderer/condensed-unit-panel-task.test.tsx` plus the e2e specs
  `tests/e2e/task-result-survives-navigation.spec.ts` and `tests/e2e/task-run-failure.spec.ts`.
- **D6 — the journal close reads the queue.** `JournalScreen` starts a task and seeds
  `close-proposal.ts` from the task result; `CloseProposal` shows a proposal that finished while
  the user was elsewhere. Files: `src/renderer/screens/journal/JournalScreen.tsx`,
  `src/renderer/screens/journal/CloseProposal.tsx`, `src/renderer/lib/close-proposal.ts`,
  `src/renderer/i18n/de.ts` + `en.ts`. Tests: `tests/renderer/close-proposal-task.test.tsx` plus
  the e2e spec `tests/e2e/task-no-model.spec.ts`.
- **D7 — the way back.** `src/renderer/lib/task-result-route.ts` and a "view result" action in
  072's task list component (`src/renderer/screens/tasks/`), with i18n keys in both languages.
  Tests: `tests/renderer/task-result-route.test.ts` plus the AC4 steps appended to
  `tests/e2e/task-result-survives-navigation.spec.ts`.

## Model Hints

- D3 → deliverable-hard — it changes the `condense:run` contract underneath the existing condense
  IPC tests while the `no-model` dead end and the accept/reject paths must keep behaving exactly
  as today; a regression here is silent.
- D5 → deliverable-hard — one derived state feeds three consumer components plus the failure and
  waiting-position paths, and the panel must never fall back to its own local run state.
- Review: → story-review-hard — the story spans core, IPC and renderer and touches guardrails 1,
  2 and 6 (no silent write of a proposal, no vault content in task records) in a sprint where 074
  and 075 build on the same files.

## Acceptance Tests

As written during `/refine`, mostly verbatim; AC4's single planned test was split in D7 into two
independently-named tests (condense and close-day each have a different "view result" address to
land on, and the story's own sprint-review precedent — 072 — flagged that bundling several
claims into one e2e test hides which one actually failed). Real names/locations below.

- AC1 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "a started condensation shows
  as one task in the panel and in the task list" (D5)
- AC2 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "leaving the panel mid-run and
  coming back shows the finished proposal, not a new run" (D5)
- AC3 → e2e `tests/e2e/task-no-model.spec.ts` › "a day's close survives leaving the journal" (D6)
- AC4 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "view result opens the area's
  condensed tab with its proposal already open" and › "view result opens the day with its close
  proposal already open" (D7), plus unit `tests/renderer/task-result-route.test.ts` › "every
  finished kind maps to its address" (D7)
- AC5 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "a proposal that finished
  elsewhere writes nothing until it is accepted" (vault snapshot, D5), plus unit
  `tests/main/ipc/journal-close-task.test.ts` › "the close task writes nothing before applyClose"
  (D4)
- AC6 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "a second condensation shows
  its position in the queue" (D5)
- AC7 → e2e `tests/e2e/task-no-model.spec.ts` › "with no model configured a condensation creates
  no task and keeps its honest dead end" (D6), plus unit
  `tests/main/ipc/condense-task.test.ts` › "an empty gateway returns no-model and enqueues
  nothing" (D3)
- AC8 → e2e `tests/e2e/task-run-failure.spec.ts` › "a failed condensation states its reason in
  the panel and in the task list" (D5)

## Done

**Summary.** The two runs the user actually named now run through 071's work queue instead of as
awaited renderer mutations: `condense:run` (D3) and `journal:close` (D4) each enqueue a `WorkTask`
and return immediately; a new, pure `TaskResultStore` (`src/core/tasks/results.ts`, D2) holds the
finished proposal/suggestion keyed by task id, fetched on demand via `tasks:result` and never
broadcast on the task record itself (`WorkTask` only ever carries `hasResult: boolean`). The
condense panel and the journal screen (D5/D6) derive all of their running/waiting-with-position/
failed-with-reason/finished-with-proposal state from one hook, `useTaskForSubject`, reading the
live session-wide queue — not local component state — so leaving the screen mid-run and coming
back shows the real, current state instead of a blank panel. A "view result" action (D7) on the
tasks screen routes a finished task to the area/project knowledge tab or the day, where the
proposal is already open by construction (no separate "open" step). An e2e env seam,
`SB_E2E_FAKE_PROVIDER` (D1), lets the whole flow run scripted and offline in Playwright.

**Commit message:**
```
073: a run I walk away from still has its result
```

**Verification.**
- `npm run build` — green.
- `npm test` — 274 files / 3767 tests, all green.
- `npm run lint` — green.
- `npm run typecheck` — green.
- `npm run format:check` — green on every file this story touched (confirmed by diffing the
  command's ~234-file warning list against this story's full changed-file list: zero overlap);
  the pre-existing repo-wide backlog predates this story, same as 071/072 noted.
- `npm run test:e2e` — 32/32 green, run twice (once before the review-fix cycle, once after) to
  confirm the fixes introduced no regression. A single earlier run (during D7's own pass) reported
  6 failures, all `worker process exited unexpectedly` (an Electron crash exit code) on specs
  D7 never touched, while the same specs had just passed individually seconds before — diagnosed
  as this machine's resource contention from many concurrent, unrelated sessions (confirmed via
  `Get-Process`: over a hundred `node`/`electron` processes alive at the time), not a code
  regression; both full, uninterrupted runs performed here (32/32 and 32/32) confirm this.
- Code review (clean agent, `story-review-hard` tier, per Model Hints): **first pass FAIL**, three
  confirmed defects (see Decisions), all fixed in one review-fix cycle and reverified (full
  `npm test` 3767/3767, `npm run build`, `npm run lint`, `npm run typecheck` green; `npm run
  test:e2e` 32/32 green, run fresh after the fix). Three further findings accepted without a code
  change (see Decisions). 1 review-fix cycle, well under the 3-cycle cap; no second reviewer
  round dispatched — the fixes were narrow, each came with its own new regression test proven red
  before the fix and green after, and the full verification suite was independently re-run green
  twice by this session after the fix, not just reported by the fixing agent.

**AC → test mapping, as verified:**
- AC1 → `tests/e2e/task-result-survives-navigation.spec.ts` › "a started condensation shows as
  one task in the panel and in the task list" — passed.
- AC2 → `tests/e2e/task-result-survives-navigation.spec.ts` › "leaving the panel mid-run and
  coming back shows the finished proposal, not a new run" — passed.
- AC3 → `tests/e2e/task-no-model.spec.ts` › "a day's close survives leaving the journal" —
  passed.
- AC4 → `tests/e2e/task-result-survives-navigation.spec.ts` › "view result opens the area's
  condensed tab with its proposal already open" and › "view result opens the day with its close
  proposal already open", plus `tests/renderer/task-result-route.test.ts` › "every finished kind
  maps to its address" — all passed.
- AC5 → `tests/e2e/task-result-survives-navigation.spec.ts` › "a proposal that finished elsewhere
  writes nothing until it is accepted", plus `tests/main/ipc/journal-close-task.test.ts` › "the
  close task writes nothing before applyClose" — both passed.
- AC6 → `tests/e2e/task-result-survives-navigation.spec.ts` › "a second condensation shows its
  position in the queue" — passed.
- AC7 → `tests/e2e/task-no-model.spec.ts` › "with no model configured a condensation creates no
  task and keeps its honest dead end", plus `tests/main/ipc/condense-task.test.ts` › "an empty
  gateway returns no-model and enqueues nothing" — both passed (the review noted the e2e half is
  weak on its own — the trigger is hidden so `condense:run` is never called, making "no row"
  vacuous — but the unit test is the real, solid proof of the criterion; not reworked further, as
  a stronger e2e assertion here would mean asserting on the *absence* of a UI element that never
  had a code path to appear in the first place, which the unit test already proves at the source).
- AC8 → `tests/e2e/task-run-failure.spec.ts` › "a failed condensation states its reason in the
  panel and in the task list" — passed.

No manual residue.

**Decisions.**
- 071/072's real API differed from this story's own Plan text in two places, adapted per the
  sprint's "adapt names, not shape" rule: `JournalCloseSuggestion` (not `DayCloseSuggestion`) is
  the wire-facing suggestion type, already correctly named in the Plan; `applyClose`'s real
  location is `src/main/ipc/journal-day.ts`, not inline in `journal.ts` (only the handler
  registration is in `journal.ts`).
- `JournalCloseSuggestion` and `JournalFrontmatterFields` were declared inline inside
  `src/shared/ipc.ts` before this story; `TaskResult`'s `journal-close` variant needed to reference
  the former from `src/shared/types/tasks.ts`, which would have created a circular module
  reference (`ipc.ts` already imports many types from the `shared/types` barrel). Fixed by moving
  both into a new `src/shared/types/journal.ts`, mirroring how `CondenseProposal` already lived in
  `shared/types` rather than in `ipc.ts` — a structural fix, not a behaviour change; every
  consumer's import path was updated, none of the two types' shapes changed.
- The result store's own directory, `src/core/tasks/` (D2), is intentionally separate from the
  existing registry's `src/core/work/` — the story's Decisions section named this path explicitly
  or a new module, not a reuse of an existing one; `WorkRegistry.retry()` (already added in 072)
  stays in `src/core/work/registry.ts`, untouched in its own right except for the `WorkRunner`
  signature change below.
- `condense:run`/`journal:close`'s "no model"/"nothing to close" dead ends are each decided by a
  cheap, synchronous pre-check (`gateway.isAvailable(...)` for condense, `gateway.isAvailable
  ('extract-tasks')` deciding the lane and a `readDay`/`dayText` pre-check for close) run BEFORE
  `enqueue()`, so AC7's "no task is created" holds by construction rather than by a task
  immediately failing.
- A heuristic (no-model) day close still creates a task, on the `free` lane instead of `model`,
  per 071's own decision — AC7 therefore only ever refers to the condense path, exactly as the
  Plan already said.
- `hasResult: boolean` was added to `WorkTask` (`src/shared/types/work.ts`) and `WorkRunner`
  (`src/core/work/registry.ts`) was extended to let a runner report `{ hasResult: true }` back
  to the registry on success, merged into the finished record — this is the mechanism that keeps
  a proposal's existence knowable from the task list without ever putting the proposal itself on
  it (guardrail 6).
- **Review-fix cycle 1 (three confirmed defects, all fixed):**
  1. A retried task (via 072's existing "retry" action) stored its result under the *original,
     failed* task's id, not the new one — `WorkRunner`'s reused closure captured the task id from
     an outer variable set once at the first `enqueue()`, and `WorkRegistry.retry()` (by design,
     071) reuses that exact closure for a new task id. Fixed by giving the runner its own task id
     as a parameter (`WorkRunner` is now `(signal, taskId) => Promise<...>`, `start()` passes
     `entry.task.id` — correct for a retry too, since `retry()` creates a genuinely new entry with
     the old closure). New tests in `tests/core/work/registry.test.ts` and
     `tests/main/ipc/condense-task.test.ts` prove a retried run's result is keyed by the *new* id.
  2. `condense:accept`/`condense:reject` and `journal:applyClose` marked the stored result
     `accepted` *before* the write/apply that decision represents had actually succeeded — a
     refused write (stale hash, any other failure) had already dropped the payload even though
     nothing was written, forcing a full re-run to get the proposal back. Fixed by moving the mark
     to after the write succeeds in all three handlers. New tests prove a refused write leaves the
     result still retrievable afterward.
  3. A discarded (or already-applied) day-close proposal could resurface: `discardProposal()` only
     cleared the renderer-local edit buffer, never telling main anything (unlike condense's
     reject/delete, which mark the stored result); and neither `discardProposal()` nor a successful
     `apply()` ever cleared the renderer's own React Query cache for `tasks:result`, so a stale
     cached response could resurrect an already-decided proposal within its cache window and let
     it be applied a second time. Fixed with a new `journal:discardClose` channel (marks the result
     `rejected` in main, mirroring `applyClose`'s `accepted` mark) plus a `forgetCloseResult()`
     helper in `JournalScreen.tsx` (mirrors `CondensedUnitPanel.tsx`'s existing `forgetResult()`)
     called from both `discardProposal()` and `apply()`'s success handler. New tests prove neither
     path resurfaces the proposal after an unmount/remount on the same session.
- **Review findings accepted without a code change:**
  - The registry's `cancel()` frees a task's lane immediately and marks it `cancelled`, but the
    condense/close-day runners themselves don't check the `AbortSignal` they're handed (neither
    `runCondenseUnit` nor `closeDay`'s call site threads it through today) — a cancelled task's
    underlying model call keeps running in the background and, on success, still `put()`s a result
    under a now-cancelled task's id. This is a real gap, but a bounded, non-corrupting one: the
    registry's own `entry.settled` guard means the cancelled record itself is never overwritten,
    the orphaned result is unreachable (no route, no `hasResult: true` on any visible task) and
    it's evicted by the store's own 50-entry retention or cleared outright on vault close — no
    vault write, no UI-visible incorrectness. Threading a real abort through `runCondenseUnit`/
    `closeDay` is a larger, cross-cutting change (074 already owns the gardener/ingest cancellation
    story for this sprint) and is left for whichever story next hardens cancellation broadly,
    the same way 071 left an analogous `message`-field gap for "whoever wires the next producer."
  - `tests/scripts/e2e-wiring.test.ts`'s story-066 guard ("the fixture configures no provider") had
    to be narrowed for D1's legitimate, network-free `kind: 'fake'` provider seam; the review
    noted the new check (forbidding only a literal `kind: 'anthropic'`/`'openai-compatible'`) is
    slightly looser than strictly necessary (e.g. a provider kind built from a spread/variable
    rather than a literal would not be caught). Accepted as-is: the practical guarantee — no real
    network call ever happens in e2e — is still independently enforced at runtime by the same
    file's `noNetworkCalls` auto-fixture, which every spec is subject to regardless of how a
    provider kind literal is spelled.
  - `TaskResultStore.mark`/`.status` (D2) and the newly-public `subscribeWorkTasks` export
    (pre-existing, `tasks-store.ts`) are exercised only by tests, not by any production call site —
    production only ever uses `markBySubject`. Left in place rather than removed: `mark`/`status`
    are the natural, symmetric counterpart to `markBySubject` for a future caller that already
    knows a task id (a plausible shape for 074/075's own producers), and removing a small, already-
    tested piece of public API now only to re-add it later is more churn than the dead surface
    itself costs.
