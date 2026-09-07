---
id: 073
title: A run I walk away from still has its result
status: ready # draft -> ready -> in-progress -> done
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

- [ ] **AC1** — Starting a condensation (area or project) creates a task visible in the queue,
      and the panel that started it shows the same state as the task list.
- [ ] **AC2** — Navigating to another screen while a condensation runs does not cancel it;
      returning to the panel shows the finished proposal instead of an empty panel or a
      restarted run.
- [ ] **AC3** — Starting a day's close creates a task with the same behaviour: leaving the
      journal and coming back shows the finished close proposal.
- [ ] **AC4** — A finished task offers "view result", which routes to the area/project
      knowledge tab resp. the day, with the proposal open.
- [ ] **AC5** — A proposal that completes while the user is on another screen writes nothing
      to the vault until it is accepted (CLAUDE.md guardrail 2).
- [ ] **AC6** — Requesting a second condensation while one runs shows that it is waiting, with
      its position — not a spinner that means nothing.
- [ ] **AC7** — With no model configured, no task is created and the existing honest "no
      model" state appears unchanged (CLAUDE.md guardrail 1).
- [ ] **AC8** — A condensation or close that fails states its reason where the run was started
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

- AC1 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "a started condensation shows
  as one task in the panel and in the task list" (D5)
- AC2 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "leaving the panel mid-run and
  coming back shows the finished proposal, not a new run" (D5)
- AC3 → e2e `tests/e2e/task-no-model.spec.ts` › "a day's close survives leaving the journal" (D6)
- AC4 → e2e `tests/e2e/task-result-survives-navigation.spec.ts` › "view result opens the
  project's knowledge tab and the day with the proposal open" (D7), plus unit
  `tests/renderer/task-result-route.test.ts` › "every finished kind maps to its address" (D7)
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
