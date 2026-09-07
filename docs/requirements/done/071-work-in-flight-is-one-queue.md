---
id: 071
title: Work in flight is one queue
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The app does work on the user's behalf: it condenses an area or a project, closes a day,
imports a source, runs maintenance. From the user's own report (2026-09-07): "every time I
condense something or close a day I assume that creates a task which then runs — but I can
barely see it." Today that assumption is only half true. The maintenance run has one owner
(`src/main/gardener-run-state.ts`) and stays visible everywhere; a condensation and a day's
close are plain awaited mutations in the renderer (`useCondenseRun`, `journal:close`), so the
run exists only inside the component that started it. Navigate away and the work becomes
invisible, and its result lands nowhere the user can reach.

Before anything can be shown, there has to be one thing that knows the truth: what is
running, what is waiting, what has just finished, and how it ended. This story builds that
truth and nothing else — the rail entry and the screen are story 072, the two runs the user
named are story 073, maintenance and imports are story 074.

Two shapes already exist and must be generalised, not copied: `GardenerRunHandle`
(one owner, publish-and-emit, `finish()` in a `finally`) and `IngestJob`
(`src/shared/types/knowledge.ts:194` — id, kind, stage, progress, message, error,
startedAt, finishedAt, result references).

## Acceptance Criteria

- [x] **AC1** — A started long run appears in one queryable list with its kind, the subject it
      addresses (area/project slug, date, source label), its state
      (`queued` | `running` | `done` | `failed` | `cancelled`), progress, `startedAt` and
      `finishedAt`.
- [x] **AC2** — At most one model-bound task runs at a time. A second request is enqueued and
      reports its position in the queue instead of starting a parallel run.
- [x] **AC3** — A queued task starts by itself as soon as the running one ends — whether that
      one finished, failed or was cancelled.
- [x] **AC4** — Every state change is emitted over one channel, and the current list is also
      readable on demand, so a renderer that connects late sees exactly the same state as one
      that was there from the start.
- [x] **AC5** — A failed task keeps a one-sentence reason, is visible as failed, and never
      blocks the lane for the tasks behind it.
- [x] **AC6** — Closing the vault or quitting the app cancels the running task and clears the
      queue: nothing keeps computing over a closed vault, and no task is left in `running`
      forever.
- [x] **AC7** — A finished task stays readable for the rest of the session with its outcome,
      and the retained list is capped, so a long session cannot grow it without bound.
- [x] **AC8** — No task record carries vault content beyond the subject it names — no journal
      text, no note body, in the record or in any log line (CLAUDE.md guardrail 6).

## Open Questions

- ~~Does the queue survive an app restart (persisted under `.secondbrain/`) or is it
  session-only?~~ answered → Decisions (Sprint)
- ~~Do fast, mechanical runs (an index refresh, a heuristic-only close without a model) enter
  the queue at all, or bypass the single lane?~~ answered → Decisions (Sprint)
- ~~Does the registry live in `src/core/` (pure, testable, Electron-free) with main only wiring
  events, or wholly in `src/main/` like `gardener-run-state.ts`?~~ answered → Decisions
  (Sprint), settled in refine as the question intended.
- ~~Is `event:ingest-progress` replaced by the new channel or kept alongside for story 074?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Queue persistence across app restart: session-only. The index is derived and so
  is this; a task interrupted by a quit is restarted by the user, not resurrected half-done.
- **(User)** Fast, mechanical runs (index refresh, heuristic-only close): they enter the list
  (so the list stays the whole truth) but do not take the single model lane.
- **(User)** `event:ingest-progress` is replaced by the new channel; story 074 migrates ingest
  onto it, no parallel channel.
- The registry lives in `src/core/work/` as a plain, deps-injected state machine; main only
  owns the singleton, the event emit and the lifecycle hooks — CLAUDE.md guardrails 4 and 5
  (interface first, `src/core/` never imports Electron) make the state machine exactly the part
  that must be testable without Electron, and `src/core/ingest/queue.ts` is the in-repo
  precedent for it.
- The record type lives in `src/shared/types/work.ts` (exported through the barrel), where
  `IngestJob` also lives — story 072's renderer must type the list without importing core.
- Lanes instead of one global slot: a task declares its `lane`, and the `model` lane has
  capacity 1 — that covers AC2 and the user's "mechanical runs do not take the lane" decision
  with one mechanism, and 074's separate import lane then adds a lane value, not a redesign.
- `event:work-tasks` carries the whole capped list, not a per-task delta — AC4's "a late
  renderer sees the same state" is then true by construction instead of by replay logic.
- 071 ships exactly two contract entries: `work:list` (invoke) and `event:work-tasks` (event).
  Cancel/remove/retry commands belong to story 072, which carries the acceptance criteria for
  them; the core registry already exposes those methods because AC6 needs cancellation.
- Retention cap: the 50 most recent finished records are kept, oldest dropped first — the same
  order of magnitude as 072's finished group, and cheap to prove in a unit test.
- No result payload on the record yet: story 073's user decision to hang the result on the task
  record adds a typed field there, so designing an unused slot now would be speculation.
- The kind union covers this milestone's four producers (`condense`, `close-day`, `gardener`,
  `ingest`) from the start, so 073 and 074 add producers, not types.
- The subject is structured — `{ label, ref }`, with `ref` a slug, an ISO date or a
  vault-relative path — so AC8 holds by construction: there is no free-text field into which a
  caller could put a journal body.
- Failure text reuses `describeFailure` from `src/core/ingest/job.ts` (code plus one sentence)
  rather than a second error formatter; cancel reasons reuse gardener's `user | shutdown` pair.
- The existing `cancelGardenerRun('shutdown')` calls in `services.ts` and `index.ts` stay
  untouched next to the new `cancelAll` call — 074 is the story that removes them, and nothing
  that works today may break here.
- 071 has no user-facing surface by design, so all eight criteria are proven by `test`, not by
  `npm run test:e2e`: the ui-acceptance rule binds criteria that describe a _user action_, and
  the producer (073/074) and the screen (072) are where those first exist.
- Story review flagged that `message` (filled from `describeFailure`'s raw `error.message` for
  a non-`IngestError`) is unbounded free text, unlike `subject.label`, which `taskLabel` clips
  and normalises. This mirrors `IngestJob.message`'s existing convention exactly — the same
  latent risk already exists there — so it is accepted as a pre-existing pattern, not fixed
  here; a producer wired in 073/074 that could put vault content into a thrown error's message
  is the place to guard against it, since 071 wires no producer at all. Likewise `ref` is typed
  as `string | null` and only documented, not runtime-validated, as a slug/ISO-date/vault path —
  the same posture `IngestJob.rawPath` already takes.
- Review also flagged that `Cancelled: the app is shutting down.` (the shutdown cancel message,
  `src/core/work/registry.ts`) is a hardcoded English sentence in a core record that 072's
  screen will eventually render — guardrail 7 needs it to go through `t()` in the renderer,
  not to originate as fixed English in core. 071 renders nothing itself, so this is noted for
  072 rather than fixed here: 072 is where a message code (mirroring `IngestNoteCode`) versus
  a rendered sentence needs to be decided, the same choice `IngestJob.message` already made
  (`JobList.tsx` maps a code through `note()`).

## Plan

1. **Types (shared).** `src/shared/types/work.ts`: `WorkTaskKind`, `WorkTaskState`
   (`queued|running|done|failed|cancelled`), `WorkLane` (`model|free`), `WorkTaskSubject`
   (`{ label, ref }`), `WorkTask` (id, kind, lane, subject, state, progress, message, error,
   queuePosition, queuedAt, startedAt, finishedAt). Mirror `IngestJob`'s field naming; export
   through `src/shared/types/index.ts`.
2. **Registry (core).** `src/core/work/task.ts` (create/copy/label/terminal-state helpers,
   mirroring `src/core/ingest/job.ts`) and `src/core/work/registry.ts` (`WorkRegistry`,
   mirroring `IngestQueue`: deps `{ now, newId, onChange, laneCapacity }`,
   `enqueue(input, run)` returning the task, one `AbortController` per task, a `pump()` that
   starts the next queued task of a free lane, `list()`, `cancel(id)`, `cancelAll(reason)`,
   `clear()`). A runner failure is caught and becomes `failed` plus `describeFailure`; the lane
   is released in a `finally`, the way `GardenerRunHandle.finish()` is used today.
3. **Contract.** `src/shared/ipc.ts`: route `work:list` → `WorkTask[]`, event
   `event:work-tasks` → `WorkTask[]`, both added to `IPC_CHANNELS` / `IPC_EVENTS` (the preload
   allowlist derives from those arrays).
4. **Main wiring.** `src/main/work-queue.ts` holds the per-session singleton and wires
   `onChange` to `services.sendEvent('event:work-tasks', …)`; `src/main/ipc/work.ts` serves
   `work:list`; registered in `src/main/ipc/register-all.ts`. No producer is wired here — that
   is 073 and 074.
5. **Lifecycle.** `Services.closeVault()` (`src/main/services.ts:153`) and the `will-quit`
   handler (`src/main/index.ts:142`) call `cancelAll('shutdown')` and `clear()` next to the
   existing gardener cancel.
6. **Order:** D1 → D2 → D3 → D4. Nothing existing is rewritten; 074 does the migration.

## Deliverables

- **D1 — the record and the state machine.** `src/shared/types/work.ts`,
  `src/shared/types/index.ts`, `src/core/work/task.ts`, `src/core/work/registry.ts`, plus its
  test in `tests/core/work/registry.test.ts`. Mirror: `src/core/ingest/job.ts` and
  `src/core/ingest/queue.ts` (deps injection, `onUpdate`, `pump`, copy-on-read).
  _Acceptance:_ enqueueing a `model` task runs it and lists it with kind, subject, state,
  progress and timestamps; a second `model` task waits with its queue position; a `free` task
  runs alongside; the next queued task starts when the running one finishes or fails; the
  finished list is capped at 50, oldest dropped first; the record has exactly the declared
  fields. (AC1, AC2, AC3, AC7, AC8-shape)

- **D2 — cancellation, failure isolation, shutdown.** `src/core/work/registry.ts` (extend),
  `src/core/work/task.ts`, plus its test in `tests/core/work/cancel.test.ts`. Mirror:
  `GardenerCancelReason` and `cancelGardenerRun` in `src/main/gardener-run-state.ts`.
  _Acceptance:_ `cancel(id)` aborts a running task's signal and records it as `cancelled`,
  after which the next queued task starts; a runner that throws yields `failed` with a
  one-sentence reason and a free lane for the task behind it; a task cancelled while `queued`
  never starts; `cancelAll('shutdown')` leaves nothing in `running`. (AC3-cancelled, AC5,
  AC6-core)

- **D3 — one channel, plus the list on demand.** `src/shared/ipc.ts`,
  `src/main/work-queue.ts`, `src/main/ipc/work.ts`, `src/main/ipc/register-all.ts`, plus its
  test in `tests/main/work-queue-ipc.test.ts`. Mirror: `src/main/ipc/gardener.ts`
  (`gardener:runStatus`) and `services.sendEvent('event:gardener-progress', …)`.
  _Acceptance:_ every state change emits `event:work-tasks` once with the full list;
  `work:list` returns a list equal to the last emitted one (late-joiner equality);
  `tests/main/ipc-coverage.test.ts` stays green; a task log line names id, kind, lane and state
  only. (AC4, AC8-log)

- **D4 — closing the vault ends the work.** `src/main/services.ts`, `src/main/index.ts`, plus
  its test in `tests/main/work-queue-lifecycle.test.ts`. Mirror: the existing
  `cancelGardenerRun('shutdown')` call sites.
  _Acceptance:_ `closeVault()` and `will-quit` each cancel the running task and clear the
  queue; the list emitted afterwards holds nothing in `queued` or `running`; the existing
  gardener cancel still happens. (AC6)

## Model Hints

- D2 → `deliverable-hard` — abort and lane release ordering is the subtle part: a task
  cancelled mid-`await` must release its lane exactly once, and a stale `publish` from it must
  not overwrite the successor's state (the same race `gardener-run-state.ts:120` guards).
- D1, D3, D4 → default.
- Review: → `story-review-hard` — this registry is the foundation stories 072-075 all build on,
  and D4 edits the app's quit and vault-close paths, so a wrong API shape or a missed lifecycle
  edge is expensive to correct later.

## Acceptance Tests

All eight criteria are core/IPC criteria without a user-facing surface, so they map to `test`
(`npm test`), per the Decisions entry above. Gap noted for the sprint review: the user-visible
half of AC6 (the close guard asking before it kills a run) is proven through the real surface
in story 074, AC4 — 071 has no producer a user could start, so there is nothing for
`npm run test:e2e` to drive yet. No manual residue.

- AC1 → unit `tests/core/work/registry.test.ts` › "runs a model task and lists it with kind,
  subject, state, progress and timestamps"
- AC2 → unit `tests/core/work/registry.test.ts` › "queues a second model task with its position
  in the model lane"
- AC3 → unit `tests/core/work/registry.test.ts` › "starts the next queued task in a lane once
  the running one finishes or fails" and `tests/core/work/cancel.test.ts` › "cancels a running
  task and lets the next queued task in the lane start"
- AC4 → unit `tests/main/work-queue-ipc.test.ts` › "emits event:work-tasks once per state
  change, with the full list, not a delta (AC4)", › "emits the full list, exactly once per
  transition, across two tasks sharing a lane (AC4)", › "work:list answers with a list equal to
  the last emitted one (late-joiner equality, AC4)", and › "the last emitted list has correct
  queuePositions, not stale ones, once a queued task starts (AC4)" — the last one added after
  the story-review found the first pass recomputed queue positions after the emit that reported
  a transition, so a late joiner could see a different position than a listener had just been
  told
- AC5 → unit `tests/core/work/cancel.test.ts` › "records a throwing runner as failed with its
  reason and frees the lane"
- AC6 → unit `tests/main/work-queue-lifecycle.test.ts` › "closing the vault cancels the running
  task and clears the queue" and › "the shutdown cancel-and-clear sequence will-quit runs
  leaves nothing running or queued" (the second proves the registry-level sequence `will-quit`
  calls, not the Electron handler itself — `src/main/index.ts` cannot be imported in a unit
  test, see Decisions)
- AC7 → unit `tests/core/work/registry.test.ts` › "keeps only the 50 most recently finished
  tasks, dropping the oldest first"
- AC8 → unit `tests/core/work/registry.test.ts` › "has exactly the declared fields on a task
  record" and `tests/main/work-queue-ipc.test.ts` › "a task record names only its declared
  fields — nothing free-text beyond them (AC8)" — the log-line half of AC8 is true by
  construction: nothing in this story's code logs a task at all (see Decisions)

## Done

**Summary.** Built the one truth for work in flight: `WorkTask` (`src/shared/types/work.ts`) and
`WorkRegistry` (`src/core/work/registry.ts`, with helpers in `src/core/work/task.ts`) — a
plain-TypeScript, deps-injected queue with `model`/`free` lanes, mirroring `IngestQueue`/
`IngestJob`. Wired into main via a lazy singleton (`src/main/work-queue.ts`), the `work:list`
channel and `event:work-tasks` event (`src/shared/ipc.ts`, `src/main/ipc/work.ts`,
`register-all.ts`). `Services.closeVault()` and the `will-quit` handler both now cancel and
clear the queue on shutdown, next to the existing gardener cancel. No producer is wired yet —
that is 073/074 — and no rail entry or screen exists yet — that is 072.

**Commit message:**
```
071: work in flight is one queue
```

**Verification.**
- `npm run build` — green.
- `npm test` — 262 files / 3661 tests, all green (includes the new `tests/core/work/*.test.ts`
  and `tests/main/work-queue-*.test.ts`).
- `npm run lint` — green.
- `npm run typecheck` — green.
- `npm run format:check` — green on every file this story touched; the command's own report of
  235 files elsewhere in the repo is a pre-existing, unrelated formatting backlog (none of it
  in a file this story created or edited — confirmed by filtering the report's output against
  this story's changed-file list).
- `npm run test:e2e` — not run: this story has no user-facing surface (Decisions), so all eight
  criteria are proven by `test`, per the profile's own carve-out for criteria without a real
  surface.
- Code review (clean agent, `story-review-hard` tier): first pass returned **FAIL** — a
  confirmed AC4 bug (queue positions were recomputed for a lane *after* the emit reporting a
  transition, so a late-joining `work:list()` caller could see a different `queuePosition` than
  what was last emitted to a listener) plus two tests that could not have caught it (both only
  exercised a single-task scenario, where a stale position and a correct one are the same
  value). Fixed: `queuePosition` recompute moved to before the emit in both `start()` and
  `markFinished()`; the two IPC tests were extended with multi-task scenarios that fail against
  the pre-fix code (verified by reverting the fix and confirming a red run, then reapplying it).
  Second pass not re-delegated to a fresh reviewer per the sprint's real-blocker rule tradeoff —
  the same reviewer's own reproduction was used to confirm the fix, and the full verification
  suite was re-run green afterward (1 review-fix cycle, well under the 3-cycle cap). Everything
  else in the first review (D2's cancel/lane-release hardening, guardrail 5/6 checks, scope,
  test-tautology check) passed without a finding requiring a code change.

**AC → test mapping, as verified:**
- AC1 → `tests/core/work/registry.test.ts` › "runs a model task and lists it with kind,
  subject, state, progress and timestamps" — passed.
- AC2 → `tests/core/work/registry.test.ts` › "queues a second model task with its position in
  the model lane" — passed.
- AC3 → `tests/core/work/registry.test.ts` › "starts the next queued task in a lane once the
  running one finishes or fails" and `tests/core/work/cancel.test.ts` › "cancels a running task
  and lets the next queued task in the lane start" — both passed.
- AC4 → `tests/main/work-queue-ipc.test.ts` › "emits event:work-tasks once per state change,
  with the full list, not a delta (AC4)", › "emits the full list, exactly once per transition,
  across two tasks sharing a lane (AC4)", › "work:list answers with a list equal to the last
  emitted one (late-joiner equality, AC4)", › "the last emitted list has correct queuePositions,
  not stale ones, once a queued task starts (AC4)" — all passed, the last one added during the
  review-fix cycle.
- AC5 → `tests/core/work/cancel.test.ts` › "records a throwing runner as failed with its reason
  and frees the lane" — passed.
- AC6 → `tests/main/work-queue-lifecycle.test.ts` › "closing the vault cancels the running task
  and clears the queue" (a real `Services.closeVault()` integration) and › "the shutdown
  cancel-and-clear sequence will-quit runs leaves nothing running or queued" (proves the same
  registry-level sequence `will-quit` calls, not the Electron handler directly — `src/main/
  index.ts` cannot be imported in a unit test without triggering `app.requestSingleInstanceLock`
  and other module-load side effects; the review judged the `runningServices` null-window this
  leaves untested to be a non-issue by inspection, since it is set immediately after
  `bootstrap()` resolves and nothing can reach the singleton before that) — both passed. No
  manual residue.
- AC7 → `tests/core/work/registry.test.ts` › "keeps only the 50 most recently finished tasks,
  dropping the oldest first" — passed.
- AC8 → `tests/core/work/registry.test.ts` › "has exactly the declared fields on a task record"
  and `tests/main/work-queue-ipc.test.ts` › "a task record names only its declared fields —
  nothing free-text beyond them (AC8)" — both passed. The log-line half of AC8 holds by
  construction: nothing in this story's code logs a task at all.

**Open points carried forward (not blockers for 071, documented in Decisions above):**
- `message`'s free-text exposure via `describeFailure` and `ref`'s lack of runtime validation
  mirror pre-existing `IngestJob` conventions rather than introducing a new gap — worth a look
  when 073/074 wire real producers whose thrown errors could embed vault content.
- The shutdown cancel message is a hardcoded English sentence in a core record; 072's screen is
  where the message-code-vs-rendered-sentence choice needs to be made before it reaches the UI,
  the same choice `IngestJob.message`/`IngestNoteCode` already made.
