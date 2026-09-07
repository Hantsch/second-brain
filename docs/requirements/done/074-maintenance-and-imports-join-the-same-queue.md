---
id: 074
title: Maintenance and imports join the same queue
status: done # draft -> ready -> in-progress -> done
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

- [x] **AC1** — A maintenance run appears as a task in the queue, with its stage-weighted
      progress (`src/core/gardener/progress.ts`) unchanged — the bar still weights the model
      stages as it does today.
- [x] **AC2** — An import (YouTube, PDF, URL) appears as a task with its existing stages and
      messages; every consumer of the old progress path either keeps working or is migrated in
      this story, with none left reading a channel nobody feeds.
- [x] **AC3** — Two maintenance runs still cannot overlap over one vault: the second is
      refused or queued, and there is no path (channel or autostart) that starts one behind
      the registry's back.
- [x] **AC4** — The quit/close guard still asks before killing a running maintenance run, and
      now asks for a running condensation or import too, instead of dropping them silently.
- [x] **AC5** — `gardener:runStatus` and the autostart read the registry; a test proves there
      is no second source of "a run is going".
- [x] **AC6** — The existing gardener run and `RunStrip` test suites stay green without being
      weakened, and the e2e cross-screen check from story 042 still passes.
- [x] **AC7** — The interview plan appears as a task on the fast lane and never occupies the
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

As written during `/refine`, superseded below by the real names/locations, per this story's own
practice for D1–D8 (adapt names, not shape, when the built API and test layout differ from an
assumption made before build started).

- AC1 → unit `tests/main/gardener-task.test.ts` › the case building the expected percent from the
  real `computeStagePlan`/`computeProgress` and asserting the mirrored task carries that exact
  number (D2), and e2e `tests/e2e/maintenance-task-visible.spec.ts` › "a running maintenance pass
  is one task: same percent in the strip and on the tasks screen, counted once" (D5).
- AC2 → e2e `tests/e2e/import-task.spec.ts` › "a submitted text source appears as an import task"
  (D6), plus unit `tests/main/ingest-ipc.test.ts` (stage/`detail` mirroring, cancelled-vs-failed,
  retry-mints-a-new-task) (D4) and `tests/main/ipc-coverage.test.ts` (unchanged, green) for "no
  consumer left reading a dead channel".
- AC3 → unit `tests/main/gardener-ipc.test.ts` › the two cases seeding a `'gardener'` task
  directly via `startExternal` (bypassing `beginGardenerRun`) and proving the autostart reports
  `'busy'` while it is non-terminal, and un-busy the instant it is cancelled through the registry
  directly (D3) — a local-flag implementation could not pass these.
- AC4 → e2e `tests/e2e/quit-during-run.spec.ts` › "closing the window during a maintenance run
  asks first, and cancelling leaves the run and window alone" (D7), plus unit
  `tests/main/close-guard.test.ts` (a running condensation or import vetoes the close, a queued
  task does not) (D7). Harness limitation for the condensation/import _dialog_ through the real
  surface unchanged from refine: covered one level down at the main/unit level, not a manual step.
- AC5 → unit `tests/main/gardener-task.test.ts` — two cases: `gardener:runStatus` answers from
  the queue in the ordinary `beginGardenerRun` flow, and (added in review-fix cycle 1, since the
  first case alone did not discriminate a local-state implementation from a registry-only one) a
  second case seeding the registry directly with `startExternal`, bypassing `beginGardenerRun`
  entirely, and asserting the handler returns exactly that seeded value. The autostart half is
  AC3's two cases above (same registry read, `gardener-autorun.ts`). A repo-wide grep during
  review confirmed no production call site still reads `gardenerRunning()`/`gardenerRunSnapshot()`
  — only tests of `gardener-run-state.ts` itself do, which is correct: that module stays a facade
  with those two functions internally unchanged, per this story's own Decisions.
- AC6 → the existing suites, unchanged or changed only on their transport/seeding line:
  `tests/main/gardener-run-state.test.ts` (byte-for-byte untouched — confirmed via an empty diff),
  `tests/renderer/run-strip.test.tsx` (seeding line only, `RunStrip.tsx` itself untouched),
  `tests/renderer/quit-during-run-dialog.test.tsx` (necessarily rewritten further, since D7
  deliberately generalised the dialog itself beyond the gardener — no assertion weakened, two
  cases added), and e2e `tests/e2e/gardener-run-cross-screen.spec.ts` (byte-for-byte untouched,
  still green).
- AC7 → unit `tests/main/journal-ipc.test.ts` — the interview plan enqueues a `free`-lane task
  without changing its `InterviewPlan` response contract, a running `'model'`-lane task is
  neither delayed by nor delays it, `journal:interviewFollowUp` creates no task, and (added in
  review-fix cycle 1) a thrown `planInterview` rejects the IPC call instead of hanging, settling
  the task `'failed'` rather than silently `'done'` (D8).

## Done

**Summary.** Migrated the maintenance run and imports onto story 071's `WorkRegistry`, the last
two producers the milestone's kind union always anticipated (`'gardener'`, `'ingest'`), plus made
`journal:interviewPlan` a fast-lane task per 073's carried-over decision. `gardener-run-state.ts`
stays exactly the facade the Decisions promised: its four exported signatures and local
slot/publish/finish semantics are untouched, verified by `tests/main/gardener-run-state.test.ts`
needing zero edits. Two new registry primitives make this possible without forcing either
producer through the registry's own `enqueue`/pump shape, which fits neither (D1):
`WorkRegistry.startExternal()` creates a task whose lifecycle is paced by code outside the
registry (never queued by the registry's own pump, lane value for display/classification only),
with a bidirectional `onCancel` hook — a registry-initiated cancel reaches the real run/job, and
the real run/job's own cancel reaches the registry — verified reentrancy-safe by construction
(settle-once guards on both sides). The maintenance run (D2) and every import job (D4) are mirrored
this way; `gardener-autorun.ts`'s busy-check and `gardener:runStatus` now read the registry
directly instead of local state (D2/D3/AC5); `event:ingest-progress` and `event:gardener-progress`
are deleted from `IpcEvents` (D4); `RunStrip`'s store self-derives from the work-tasks feed instead
of being pushed into (D5), with the tasks screen's pre-existing synthetic maintenance row now
de-duplicated against the real registry task it represents; the ingest jobs list is live again
over the new transport (D6); the close/quit guard now vetoes on *any* running task and the prompt
names the kind(s) (D7); `journal:interviewPlan` is a `free`-lane task without changing its
response contract, `journal:interviewFollowUp` stays untouched (D8).

**Commit message:**
```
074: maintenance and imports join the same queue
```

**Verification.**
- `npm run build` — green.
- `npm test` (`npx vitest run`) — 277 files / 3811 tests, all green.
- `npm run lint` — clean.
- `npm run typecheck` — clean (node + web).
- `npm run format:check` — 232 pre-existing warnings, confirmed by direct diff to have **zero
  overlap** with this story's 59 changed files (same pre-existing repo-wide CRLF backlog 071/072/
  073 already documented).
- `npm run test:e2e` — 35/35 green, including the three new specs this story added
  (`maintenance-task-visible.spec.ts`, `import-task.spec.ts`, `quit-during-run.spec.ts`) and every
  pre-existing spec untouched (`gardener-run-cross-screen.spec.ts` byte-for-byte unchanged).
- Code review (clean agent, `story-review-hard` tier, per Model Hints): **first pass PASS** on all
  seven acceptance criteria, with six findings (F1–F6). Two (F2, F6) accepted and documented below
  without a code change; four (F1, F3, F4, F5) fixed in **review-fix cycle 1**, re-verified full
  green (typecheck/lint/format/vitest 3811/3811/build). A **second, self-found regression** — not
  from the reviewer — surfaced only by actually running e2e after cycle 1: F1's renderer fix hid
  the "Retry" button by `kind` (`'gardener'`/`'ingest'`), which incorrectly also hid it for a
  *normal*, genuinely-retryable `kind: 'ingest'` task (072's own `SB_E2E_TASKS_FIXTURE` synthetic
  failed task, used by `tests/e2e/tasks-queue.spec.ts`'s AC6 case) — `kind` does not mean the same
  thing as "was this created via `startExternal`". Fixed in **review-fix cycle 2** by exposing an
  honest `WorkTask.retryable` field instead of guessing from `kind`; re-verified full green
  (typecheck/lint/vitest 3811/3811/e2e 35/35 including the previously-red case/build). 2
  review-fix cycles total, under the 3-cycle cap; no third reviewer round dispatched — cycle 2 was
  this orchestrator's own catch (by actually running the full e2e suite, not just trusting a green
  unit-test run), and the full verification suite was independently re-run green after each cycle.

**AC → test mapping, as verified:** see `## Acceptance Tests` above (updated in place with the
real test names/locations — the as-written section is superseded, per this story's own note that
older mappings get replaced, not kept alongside).

No manual residue beyond the one already named at refine (the condensation/import _dialog_ through
the real e2e surface — AC4 — same class of harness gap as story 067; the dialog's veto/cancel
mechanics are proven for real only via the maintenance run, and at the main/unit level for
condense/import).

**Decisions.**
- 074's own Plan assumed `src/core/tasks/registry.ts` with a `TaskRecord` shape; the real, already-
  built surface from 071–073 is `src/core/work/registry.ts`'s `WorkRegistry` and `WorkTask`
  (`src/shared/types/work.ts`) — used throughout, per the sprint's adapt-names-not-shape rule.
  `WorkTaskKind` never gained an `'import'` value: an import task uses `kind: 'ingest'` (already in
  071's kind union) with the new `lane: 'import'` — only the lane is new for imports.
- `WorkTask` gained two fields beyond what 071–073 declared: `detail: WorkTaskDetail | null`
  (`IngestJob` for an import task, `GardenerRunProgress` for a gardener task — carries the
  per-kind snapshot a task's own display needs, e.g. an import's stage/message or a maintenance
  run's weighted stage plan, without teaching the generic `WorkTask` shape about either) and
  `retryable: boolean` (added in review-fix cycle 2 — the honest, renderer-visible signal for
  whether the generic Tasks-screen retry can do anything for this task; `true` for anything
  created via the ordinary `enqueue()`/`retry()` path, `false` for anything created via
  `startExternal()`, since retrying one of those would silently create a task that never redoes
  the real work — see F1 below).
- `GardenerRunProgress` (`src/shared/types/gardener.ts`) is a new shared type holding exactly the
  fields the now-deleted `event:gardener-progress` payload and the pre-existing, separately-defined
  `GardenerProgressEvent` (`src/main/ipc/gardener-deps.ts`) both already declared identically —
  deduplicated into one shared source; `gardener-deps.ts` now aliases to it rather than redeclaring
  it, and `gardener:runStatus`'s response type references it directly instead of the deleted event
  key.
- The maintenance run and every import job are represented via `WorkRegistry.startExternal()`
  (new in D1) rather than the registry's own `enqueue(input, run)` — neither producer's real
  lifecycle fits an awaited-runner shape: the maintenance run claims its slot and starts computing
  synchronously outside any `await`, paced by `gardener-run-state.ts`'s own existing code; an
  import already runs inside `IngestQueue`'s own pump/concurrency, which must keep doing so
  completely unchanged (071/072's own precedent already relies on it). `startExternal` tasks never
  compete for their lane's capacity — the lane value is for display/classification only. This is a
  deliberate, accepted scope boundary (see F2 below), not an oversight.
- **(Accepted, not fixed — F2 from the clean review):** the story's Decisions record that "the
  maintenance run takes the single **model** lane … so a condensation and a maintenance run
  serialise". As shipped, they do not actually serialise: `startExternal` tasks never occupy lane
  capacity, so a condensation enqueued while a maintenance run is going starts immediately rather
  than queuing behind it (and vice versa). No acceptance criterion tests this cross-producer
  ordering (AC3 only covers two *gardener* runs, which the local `active` guard still correctly
  refuses/serialises, unaffected by this gap). Implementing real capacity-shared serialisation
  between an externally-paced task and a normally-enqueued one would mean either giving the
  maintenance run/an import a genuine wait-for-the-lane step (a real behavioural change to when a
  maintenance run starts computing — out of proportion for a migration story whose own text says
  "nothing the user can do today may stop working") or teaching `pump()`'s capacity accounting
  about non-controller-bearing entries (a deeper change to logic several existing suites pin
  exactly as it is today). Left as a known, documented gap for whichever story next needs real
  cross-producer model-lane protection — the same class of "accepted, bounded gap, noted for the
  next story that needs it" 071's own Decisions already used for `message`'s free-text exposure.
- **(Accepted, not fixed — F6 from the clean review):** a low-probability race on a vault switch
  mid-import: if an import job's terminal (cancelled/failed/done) publish arrives after
  `ipc/ingest.ts`'s per-`QueueHolder` mirror map has already been reset for the new vault, `mirror()`
  mints a fresh `startExternal` task in the *new* vault's queue carrying the *previous* vault's job
  label, then immediately settles it — a stray, mislabelled, already-terminal row that self-resolves
  and carries no vault content and no persisted state. Bounded and non-corrupting (no write, no
  UI-visible incorrectness beyond one ephemeral, already-finished row); the review itself classed
  this "low likelihood". Left for whichever story next hardens the ingest/vault-switch boundary
  broadly, the same posture 073 already took for its own unthreaded-abort gap.
- **Review-fix cycle 1 (F1, fixed):** `WorkRegistry.retry(id)` (`src/core/work/registry.ts`) now
  refuses (`null`) for a `startExternal`-created entry — retrying one previously created a new task
  that instantly read `'done'` while nothing was actually retried (a silent-failure-reported-as-
  success bug, guardrails 1/2). New tests in `tests/core/work/external-task.test.ts` prove the
  refusal and that no phantom task is created.
- **Review-fix cycle 1 (F3, fixed):** `journal:interviewPlan`'s deferred-promise wrapper
  (`src/main/ipc/journal.ts`) now rejects on a thrown `planInterview`, instead of hanging forever —
  a closed error path this story's own D8 change had reopened. New test in
  `tests/main/journal-ipc.test.ts` proves the rejection and that the task settles `'failed'`.
- **Review-fix cycle 1 (F5, fixed):** `tests/main/gardener-task.test.ts` gained a case seeding the
  registry directly via `startExternal` (bypassing `beginGardenerRun` and its local snapshot
  entirely) to prove `gardener:runStatus` genuinely sources from the registry — the original case
  alone could not have caught a regression back to reading local state, since `beginGardenerRun`
  always wrote both to the same value.
- **Review-fix cycle 1 (F4, partially addressed — documented, not force-fixed):** `will-quit`'s
  `getWorkQueue(runningServices).cancelAll('shutdown')` call is gated behind `runningServices`,
  which only becomes non-null once `start()` → `bootstrap()` resolves — a chain `tests/main/
will-quit.test.ts`'s minimal electron-mock harness does not drive (unlike the direct
  `cancelGardenerRun('shutdown')` call this story removed from `index.ts`, which was always
  reachable regardless). Driving a real `bootstrap()` in that harness was judged disproportionate
  (it pulls in window creation, settings/keystore/vault services, etc., for a fix-cycle). The
  registry-level sequence itself stays fully covered by `tests/main/work-queue-lifecycle.test.ts`'s
  existing "the shutdown cancel-and-clear sequence will-quit runs" test (071); `will-quit.test.ts`'s
  header comment now says plainly that this file's own harness does not exercise that branch, so
  the gap is documented rather than silently present.
- **Review-fix cycle 2 (self-found regression, fixed):** F1's renderer-side fix originally hid the
  Tasks screen's "Retry" button by `task.kind` (`'gardener'`/`'ingest'`) rather than by whether the
  task could actually be retried — this incorrectly also hid Retry for a normal, non-`external`
  `kind: 'ingest'` task (072's own `SB_E2E_TASKS_FIXTURE` synthetic failed task), breaking
  `tests/e2e/tasks-queue.spec.ts`'s existing AC6 case (caught only by actually running the full e2e
  suite after cycle 1 — not by any unit test, since none of them exercised that specific fixture's
  UI path). Fixed by adding the honest `WorkTask.retryable` field (see above) and switching
  `TaskRow.tsx`'s check to read it directly instead of guessing from `kind`; every `WorkTask`
  fixture across the touched test files was updated to set it correctly for what it represents.
  Full `vitest run` (3811/3811) and full `test:e2e` (35/35, including the previously-red case)
  re-run green afterward.
