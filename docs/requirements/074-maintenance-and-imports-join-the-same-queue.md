---
id: 074
title: Maintenance and imports join the same queue
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

Decided with the user at the cut (2026-09-07): every long run belongs in one list, not two
mechanisms for the same problem. The maintenance run already has its own owner
(`src/main/gardener-run-state.ts`, plus `gardener:runStatus`, `gardener-autorun.ts` and
`close-guard.ts` around it) and an import already has its own job shape
(`IngestJob` / `event:ingest-progress`). Both migrate onto story 071's registry, so "is
something running" has exactly one answer — the same reason `gardener-run-state.ts` was
created in the first place, applied one level up.

The interview plan (`journal:interviewPlan`) rides along here, per story 073's recorded
decision.

This is a migration story, not a feature: nothing the user can do today may stop working.

## Acceptance Criteria

- [ ] **AC1** — A maintenance run appears as a task in the queue, with its stage-weighted
      progress (`src/core/gardener/progress.ts`) unchanged — the bar still weights the model
      stages as it does today.
- [ ] **AC2** — An import (YouTube, PDF, URL) appears as a task with its existing stages and
      messages; every consumer of the old progress path either keeps working or is migrated in
      this story, with none left reading a channel nobody feeds.
- [ ] **AC3** — Two maintenance runs still cannot overlap over one vault: the second is
      refused or queued, and there is no path (channel or autostart) that starts one behind
      the registry's back.
- [ ] **AC4** — The quit/close guard still asks before killing a running maintenance run, and
      now asks for a running condensation or import too, instead of dropping them silently.
- [ ] **AC5** — `gardener:runStatus` and the autostart read the registry; a test proves there
      is no second source of "a run is going".
- [ ] **AC6** — The existing gardener run and `RunStrip` test suites stay green without being
      weakened, and the e2e cross-screen check from story 042 still passes.
- [ ] **AC7** — The interview plan appears as a task on the fast lane and never occupies the
      model lane; the interview's follow-up questions stay outside the queue (added at refine
      from story 073's decision that the interview plan rides along here).

## Open Questions

- ~~Is `event:gardener-progress` kept as a narrow view onto the registry (cheapest for
  `RunStrip` and `QuitDuringRunDialog`), or removed in favour of the new channel?~~ answered →
  Decisions (Sprint)
- ~~Do imports take the same single model lane as condensations, or their own — a transcript
  fetch is network-bound, not model-bound?~~ answered → Decisions (Sprint)
- ~~Does the vault-close cancel path stay in `gardener-run-state.ts`'s shape (`'shutdown'`
  keeps nothing, `'user'` keeps partial results) for every kind of task?~~ answered →
  Decisions (Sprint)

Nothing open that blocks the build. One note for the sprint review, not a question: AC4's
per-kind broadening is proven for **condensation and import** at main level
(`tests/main/close-guard.test.ts`), while the _dialog itself_ is driven through the real
surface only for the maintenance run — the no-model e2e vault cannot hold a condensation in
`running`, and a text import parks in `awaiting-llm` there. Same class of harness gap as S14's
story 067.

## Decisions (Sprint)

- **(User)** `event:gardener-progress` is removed in favour of the new channel — no parallel
  channel, consistent with the ingest-progress decision in 071.
- **(User)** Imports get their own lane, separate from the single model lane — a transcript
  fetch is network-bound and should run alongside a condensation, not block on its lane.
- **(User)** The vault-close cancel path keeps `gardener-run-state.ts`'s shape (`'shutdown'`
  keeps nothing, `'user'` keeps partial results) uniformly for every kind of task.
- `gardener-run-state.ts` is kept as a maintenance-shaped **facade** over the registry with its
  four exported signatures unchanged, instead of being deleted — that is what lets
  `tests/main/gardener-run-state.test.ts`, `close-guard.ts` and `gardener-autorun.ts` stay
  green without a single weakened assertion (AC6).
- `gardener:runStatus` stays as an invoke channel, but purely as a projection of the registry —
  removing it too would drag `RunStrip`'s seed path (042) into this story for no gain, and AC5
  asks it to _read_ the registry, not to disappear.
- The maintenance run takes the single **model** lane (it runs the weighted model stages), so a
  condensation and a maintenance run serialise — exactly the local-model protection 071/AC2 was
  built for.
- A second maintenance run is **refused**, not queued (AC3 allows either) — `gardener:run` and
  `GardenerAutorun.run()` both branch on today's busy result, and queueing would turn a
  long-running invoke into an unbounded one.
- The import lane keeps `IngestQueue`'s existing concurrency limit
  (`src/core/ingest/queue.ts:214`) rather than being clamped to one — this is a migration story
  and parallel imports work today.
- An import task carries its `IngestJob` snapshot in the task record's `detail` field, so
  `useIngestJobs`' `mergeJob` keeps merging a whole job as it does from `event:ingest-progress`
  today — a refetch per progress tick would be the alternative, and the job carries no vault
  body content (071/AC8 holds).
- Cancel reasons map as: `ingest:cancel` and the tasks screen give `'user'`, vault close and
  `will-quit` give `'shutdown'`. For imports, story 050's all-or-nothing rollback stays
  authoritative — the reason only decides partial retention where a kind has partials.
- The close guard asks for tasks in `running` only; `queued` tasks are dropped silently,
  because nothing has been computed for them yet and 071/AC6 clears the queue anyway.
- `journal:interviewPlan` is registered on the fast lane (it makes no model call — it only
  probes `isAvailable('journal-chat')`), and `journal:interviewFollowUp` stays out of the
  queue: serialising a live in-dialog conversation behind the model lane would stall an
  interaction the user is having.
- AC7 was added at refine so the interview-plan scope 073 handed over has a criterion, a
  deliverable and a test instead of riding along untracked.
- If 072 had to bridge `RunStrip` and the tasks screen to satisfy its AC9 before maintenance
  was on the registry, this story removes that bridge — 074 owns the end state of "one source".

## Plan

**Assumed 071 surface** (stable per the sprint note; if the built names differ, follow the
built API and keep this story's behaviour): `src/core/tasks/registry.ts` with
`enqueue(spec)` / `list()` / `cancel(id, reason)` / `subscribe()`, a `TaskRecord`
(`id, kind, subject, state, lane, progress, message, error, startedAt, finishedAt, detail?`),
the main-side wiring in `src/main/task-registry.ts`, and the channels `tasks:*` plus
`event:task-update`. Lanes: one `model` lane, an `import` lane, and a fast path taking no lane.

Order (each step leaves the app running):

1. **Kinds and lanes** (`src/shared/types` + `src/core/tasks/`): add `maintenance`, `import`,
   `interview-plan`; map `maintenance` to the model lane, `import` to the import lane with
   `IngestQueue`'s limit, `interview-plan` to the fast path; `detail` carries an `IngestJob`.
2. **Maintenance producer** (`src/main/gardener-run-state.ts` as a facade,
   `src/main/ipc/gardener-run.ts`, `src/main/ipc/gardener.ts`): `beginGardenerRun` enqueues a
   task and `publish()` writes `computeProgress()`'s percent onto it; `gardenerRunSnapshot()`
   and `gardener:runStatus` read the registry; `cancelGardenerRun(reason)` delegates.
3. **No back door** (`src/main/gardener-autorun.ts`): `gardenerRunning()` is the registry, so
   the autostart cannot start a run the registry does not know.
4. **Ingest producer** (`src/core/ingest/queue.ts` emit into the registry via
   `src/main/ipc/ingest.ts`); `event:ingest-progress` and `event:gardener-progress` are deleted
   from `src/shared/ipc.ts` (`IpcEvents` + `IPC_EVENTS`; `tests/main/ipc-coverage.test.ts`
   guards the removal).
5. **Renderer re-source, maintenance** (`src/renderer/lib/gardener-progress.ts`,
   `mock-bridge.ts`): the store derives the maintenance snapshot from `event:task-update` and
   `tasks:list`; its exported API (`useGardenerProgress`, `seedGardenerProgress`) is unchanged,
   so `RunStrip.tsx` and `QuitDuringRunDialog.tsx` are untouched.
6. **Renderer re-source, ingest** (`src/renderer/lib/events.ts`,
   `src/renderer/lib/queries/ingest.ts`): `mergeJob` reads `detail` off import task updates.
7. **Close guard** (`src/main/close-guard.ts`, `QuitDuringRunDialog.tsx`, `i18n/de.ts|en.ts`):
   veto on any `running` task, and the dialog names the kind.
8. **Interview plan** (`src/main/ipc/journal.ts`): wrap the handler in a fast-lane task record.

**Test discipline for AC6:** existing suites may be edited **only on their transport line** —
which channel a test emits or seeds. No assertion is removed, relaxed or renamed; the assertion
count per suite stays the same or grows. Suites in scope:
`tests/main/gardener-run-state.test.ts`, `tests/main/gardener-ipc.test.ts`,
`tests/main/close-guard.test.ts`, `tests/renderer/run-strip.test.tsx`,
`tests/renderer/quit-during-run-dialog.test.tsx`, `tests/core/ingest/queue.test.ts`,
`tests/main/ingest-ipc.test.ts`, `tests/e2e/gardener-run-cross-screen.spec.ts`.

## Deliverables

- **D1 — Task kinds and lanes for the three migrating kinds.** Files:
  `src/shared/types/tasks.ts` (or 071's location), `src/core/tasks/registry.ts`,
  `tests/core/tasks/lanes.test.ts` (new). Mirror: 071's own lane handling. Acceptance:
  `maintenance` occupies the model lane, `import` runs on its own lane with `IngestQueue`'s
  limit and never waits on a model task, `interview-plan` takes no lane; `detail` is typed to
  carry an `IngestJob`. Plus its test in `tests/core/tasks/lanes.test.ts`.

- **D2 — Maintenance becomes a task; `gardener-run-state.ts` becomes a facade.** Files:
  `src/main/gardener-run-state.ts`, `src/main/ipc/gardener-run.ts`, `src/main/ipc/gardener.ts`,
  `tests/main/gardener-run-state.test.ts` (transport only), `tests/main/gardener-task.test.ts`
  (new). Acceptance: the four exported signatures are unchanged and their existing suite passes
  unweakened; a run shows up in `registry.list()`; the task's percent equals
  `computeProgress()`'s for the same stage plan; a second `beginGardenerRun` is still refused;
  `gardener:runStatus` returns the registry's projection. Plus its test in
  `tests/main/gardener-task.test.ts`.

- **D3 — No path starts a run behind the registry.** Files: `src/main/gardener-autorun.ts`,
  `tests/main/gardener-ipc.test.ts` (added cases). Acceptance: with a maintenance task the
  autorun did not start, `GardenerAutorun.run()` reports `'busy'` and `gardener:run` refuses; a
  test asserts `gardenerRunning()` has no state of its own — a registry-side cancel is
  immediately visible through it. Plus its cases in `tests/main/gardener-ipc.test.ts`.

- **D4 — Imports publish into the registry; both old event channels are deleted.** Files:
  `src/core/ingest/queue.ts`, `src/main/ipc/ingest.ts`, `src/shared/ipc.ts`,
  `tests/core/ingest/queue.test.ts` (transport only), `tests/main/ingest-ipc.test.ts`.
  Acceptance: every stage and message an import emits today lands on its task record; cancel
  reasons map per the decision above with story 050's rollback intact;
  `event:ingest-progress` and `event:gardener-progress` are gone from `IpcEvents` and
  `IPC_EVENTS` and `tests/main/ipc-coverage.test.ts` is green. Plus its test in
  `tests/main/ingest-ipc.test.ts`.

- **D5 — `RunStrip`'s store reads the registry (042 must not regress).** Files:
  `src/renderer/lib/gardener-progress.ts`, `src/renderer/lib/mock-bridge.ts`,
  `tests/renderer/run-strip.test.tsx` (transport only),
  `tests/renderer/quit-during-run-dialog.test.tsx` (transport only),
  `tests/e2e/maintenance-task-visible.spec.ts` (new; mirror
  `tests/e2e/gardener-run-cross-screen.spec.ts`, including `test.use({ stageDelayMs })`).
  Acceptance: `RunStrip.tsx` and `QuitDuringRunDialog.tsx` are unmodified; both renderer suites
  pass unweakened; the e2e shows the same running maintenance run in the strip and on `/tasks`
  with the same percent.

- **D6 — Ingest consumers read the registry.** Files: `src/renderer/lib/events.ts`,
  `src/renderer/lib/queries/ingest.ts`, `tests/renderer/ingest-jobs.test.tsx` (new, or the
  existing ingest renderer suite), `tests/e2e/import-task.spec.ts` (new). Acceptance:
  `useIngestJobs` still merges a whole job per update (no refetch per tick), the sources list
  and the detail dialog show unchanged stages and messages, and no renderer code listens to a
  channel nobody feeds. The e2e types text into `SourceInput` on the sources tab, submits, and
  finds the import as a task on `/tasks` (no network, per the `noNetworkCalls` fixture).

- **D7 — The close guard covers every running task.** Files: `src/main/close-guard.ts`,
  `src/renderer/components/QuitDuringRunDialog.tsx`, `src/renderer/i18n/de.ts`,
  `src/renderer/i18n/en.ts`, `tests/main/close-guard.test.ts` (added cases),
  `tests/e2e/quit-during-run.spec.ts` (new). Acceptance: a running maintenance run,
  condensation or import each veto the close and produce the prompt; a `queued` task does not;
  the dialog names the kind in both languages (low-high quotes in German, no U+201E in
  English); the existing close-guard suite passes unweakened. The e2e requests a real window
  close during a maintenance run, asserts the prompt, cancels it, and the run continues.

- **D8 — The interview plan is a fast-lane task.** Files: `src/main/ipc/journal.ts`,
  `tests/main/journal-ipc.test.ts` (added cases). Acceptance: `journal:interviewPlan` creates a
  task with the date as its subject and leaves the model lane free (a queued condensation is
  not delayed by it); `journal:interviewFollowUp` creates no task; the existing plan test stays
  green. Plus its cases in `tests/main/journal-ipc.test.ts`.

## Model Hints

- `D2 → deliverable-hard` — the slot, cancel and `cancelledBy` semantics of
  `gardener-run-state.ts` have to survive verbatim under a new owner while
  `tests/main/gardener-run-state.test.ts` keeps every assertion.
- `D4 → deliverable-hard` — deleting two event channels while ingest keeps its stage
  granularity, its concurrency limit and story 050's all-or-nothing rollback is the
  cross-module subtlety of this story.
- `D5 → deliverable-hard` — this is the 042 regression surface: `RunStrip`'s cross-screen
  survival must hold with the store's transport swapped underneath it.
- D1, D3, D6, D7, D8 — default tier.
- `Review: → story-review-hard` — the sprint names 074 its riskiest story: four existing
  suites, two removed channels and the quit path in one diff.

## Acceptance Tests

- AC1 → unit `tests/main/gardener-task.test.ts` › "a maintenance run's task percent is the
  stage-weighted progress" (D2), and e2e `npm run test:e2e`
  `tests/e2e/maintenance-task-visible.spec.ts` › "a running maintenance run shows the same
  progress in the strip and on the tasks screen" (D5).
- AC2 → e2e `npm run test:e2e` `tests/e2e/import-task.spec.ts` › "a submitted text source
  appears as an import task" (D6), plus unit `tests/main/ingest-ipc.test.ts` › "an import
  publishes every stage onto its task record" (D4) and `tests/main/ipc-coverage.test.ts`
  (unchanged) for "no consumer left reading a dead channel".
- AC3 → unit `tests/main/gardener-ipc.test.ts` › "a second maintenance run is refused, by
  channel and by autostart" (D3).
- AC4 → e2e `npm run test:e2e` `tests/e2e/quit-during-run.spec.ts` › "closing the window during
  a maintenance run asks first" (D7), plus unit `tests/main/close-guard.test.ts` › "a running
  condensation or import vetoes the close, a queued task does not" (D7). Harness limitation for
  the condensation/import _dialog_ through the real surface: see the note in `## Open
Questions` — covered one level down, not a manual step.
- AC5 → unit `tests/main/gardener-task.test.ts` › "gardenerRunning and gardener:runStatus have
  no state of their own" (D2/D3).
- AC6 → the existing suites, run unchanged except on their transport line:
  `tests/main/gardener-run-state.test.ts`, `tests/renderer/run-strip.test.tsx`,
  `tests/renderer/quit-during-run-dialog.test.tsx` and e2e
  `tests/e2e/gardener-run-cross-screen.spec.ts` › "a run started in the garden stays visible on
  another screen and can be stopped there" (D2/D5).
- AC7 → unit `tests/main/journal-ipc.test.ts` › "the interview plan is a task and leaves the
  model lane free" (D8).

## Done
