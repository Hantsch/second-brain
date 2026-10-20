# Sprint S15 review — Work in flight has a place, and a proposal can be corrected

## Overview

**Goal:** One queue for every long run and one place that shows it — a rail entry above
maintenance with a live list of what runs, what waits and what just finished, including a way
back to the result of a run the user walked away from. And the day's close stops being
all-or-nothing: every proposed line and every field can be corrected before it is accepted.

| Story                                                    | Status | Commit                                                              |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| 071 — Work in flight is one queue                        | done   | `949e53d` — 071: work in flight is one queue                        |
| 072 — Tasks have a place above maintenance               | done   | `920e161` — 072: tasks have a place above maintenance               |
| 073 — A run I walk away from still has its result        | done   | `ee3768d` — 073: a run I walk away from still has its result        |
| 074 — Maintenance and imports join the same queue        | done   | `961485d` — 074: maintenance and imports join the same queue        |
| 075 — A close proposal can be corrected, not just pruned | done   | `49aa3d9` — 075: a close proposal can be corrected, not just pruned |

All five stories are `done`. No blocked stories. Built in strict order (071 → 072 → 073 → 074),
then 075 independently, exactly as planned in `sprint.md`'s Notes.

## Implemented stories

**071 — Work in flight is one queue.** Built the one truth for work in flight: `WorkTask`
(`src/shared/types/work.ts`) and `WorkRegistry` (`src/core/work/`) — a plain-TypeScript,
deps-injected queue with `model`/`free` lanes, mirroring `IngestQueue`/`IngestJob`, wired into
main via `work-queue.ts`, the `work:list` channel and `event:work-tasks` event. Vault close and
`will-quit` both cancel and clear the queue. No producer or screen yet — that came next.

**072 — Tasks have a place above maintenance.** Gave the registry a place in the app: a `/tasks`
rail entry directly above maintenance, a screen with three labelled groups (running / waiting /
finished this session) and the action verbs (`tasks:cancel`/`tasks:remove`/`tasks:retry`). The
maintenance row was deliberately kept reading `event:gardener-progress` for this story (074 does
the real migration), rendered from the same derivation `RunStrip` uses so the two views cannot
disagree.

**073 — A run I walk away from still has its result.** Moved condense and journal-close results
onto the task record in main instead of an awaited renderer mutation: a new, pure
`TaskResultStore` (`src/core/tasks/results.ts`) holds the finished proposal/suggestion keyed by
task id, fetched on demand and never broadcast on the task list itself. The condense panel and
the journal screen derive all their running/waiting/failed/finished state from one hook reading
the live queue, so leaving and coming back shows the real state, not a blank panel. A "view
result" action routes a finished task to where its proposal already sits open.

**074 — Maintenance and imports join the same queue.** The riskiest story of the sprint: migrated
the maintenance run and imports onto the registry via a new `WorkRegistry.startExternal()`
(neither fits the registry's own enqueue/pump shape), deleted both legacy progress channels, and
made the close/quit guard cover every running task. `gardener-run-state.ts` stayed exactly the
untouched facade the story's own decisions promised — its existing test suite needed zero edits.
`journal:interviewPlan` also became a fast-lane task, carried over from 073's scope decision.

**075 — A close proposal can be corrected, not just pruned.** Every row and field in the day-close
card became editable inline: a todo's text, target, scope and (for a waiting-on) person, plus a
hand-added row; people/projects/tags as removable chips; mood/energy always visible with the
inline `MoodPicker`. A new server-side normalizer re-validates the corrected payload
(`close-request.ts`) before `applyClose` writes it. Independent of 071–074 as planned, touching
only the journal close screen and its write path.

## Findings & decisions

- **All 15 deliberately open questions from refine went to the user** (clarification round,
  bundled via `AskUserQuestion`) rather than being decided by an agent — persistence, badge
  semantics, partial-result retention, event-channel consolidation, lane assignment for imports,
  cancel-path uniformity, todo validation, mood/energy editing surface, and inline-vs-dialog
  editing. One purely architectural question (071: registry in `src/core/` vs `src/main/`) was
  left to refine, since CLAUDE.md's interface-first/core-no-electron guardrail already settles it.
- **071's real API differed from every downstream story's plan text**, all written before 071
  landed: `WorkTask` (not `TaskRecord`), `progress`/`queuePosition` (not `percent`/`position`),
  `work:list`/`event:work-tasks` (not `tasks:list`/`event:tasks-changed`), and the registry itself
  lives in `src/core/work/`, not the assumed `src/core/tasks/`. Every downstream story adapted
  names, not the story's intent, per the sprint's own rule — documented in each story's Decisions.
- **074's key engineering call**: neither the maintenance run nor an import job fits the
  registry's own `enqueue(input, run)` shape (both are paced by existing code outside any
  `await`), so `WorkRegistry.startExternal()` mirrors an externally-paced task into the registry
  with a bidirectional, reentrancy-safe cancel hook, without ever competing for lane capacity.
- **Two review-fix cycles caught a real defect each in 071 and 074** that a lighter check would
  have missed: 071's queue-position recompute happened _after_ the emit reporting a transition
  (a late joiner could see a stale position); 074's first "hide Retry" fix keyed off `task.kind`
  instead of an honest `retryable` field, silently hiding Retry for a genuinely retryable
  synthetic task — caught only by actually running the full e2e suite after the first fix, not
  by unit tests alone. Both are worth remembering: **trust the full e2e run over a green unit
  suite when a fix touches shared, cross-story surface.**
- **073 found and fixed a mark-before-write-succeeds bug**: `condense:accept`/`reject` and
  `journal:applyClose` were marking a task's result as decided _before_ confirming the write
  actually succeeded, so a refused write (stale hash) permanently dropped a recoverable proposal.
  Fixed to mark only after a successful write, across all three handlers.
- **Accepted, documented, non-blocking gaps** (none covered by an acceptance criterion, none
  blocking): 074's `startExternal` tasks don't compete for the model lane, so a maintenance run
  and a condensation don't actually serialise despite both notionally sharing the "one queue";
  073's cancelled condense/close tasks don't thread a real `AbortSignal`, so a cancelled task's
  underlying model call can still finish and store an orphaned, unreachable result; 074 has a
  low-probability vault-switch race that can leave one ephemeral, mislabelled, already-terminal
  import row. All three are named as follow-up candidates in the roadmap's Gaps/notes.
- **Infrastructure, not code, stalled three of the five builds mid-review-fix** (071, 073, 074) —
  a session rate limit or a sub-agent backgrounding its own verification and never blocking on
  the result. Each time, resuming the same agent with an explicit "run synchronously, don't
  background verification" instruction closed the story clean, same lesson S13 already recorded
  for a different infra hiccup. 075 built straight through with none of this.

## Blocked / open

None. All five stories completed without a user-blocking question during build.

## Acceptance

Acceptance is the test suite (per `.claude/ai-scrum.md`). Per-criterion mapping (full detail in
each story's own `## Done` section under `docs/requirements/done/`):

**071 — Work in flight is one queue** (8 ACs, all core/IPC, no user-facing surface)

- AC1–AC8 → `tests/core/work/registry.test.ts`, `tests/core/work/cancel.test.ts`,
  `tests/main/work-queue-ipc.test.ts`, `tests/main/work-queue-lifecycle.test.ts`.
- No manual residue. **Gap:** AC6's user-visible half (the close guard asking before it kills a
  run) has no producer to drive in 071 itself — proven through the real surface in 074/AC4
  instead.

**072 — Tasks have a place above maintenance** (9 ACs)

- AC1–AC9 → `tests/renderer/rail.test.tsx`, `tests/e2e/tasks-screen.spec.ts`,
  `tests/e2e/tasks-queue.spec.ts`, `tests/main/tasks-ipc.test.ts`, `tests/renderer/tasks-view.test.ts`,
  `tests/renderer/tasks.test.tsx`, `tests/e2e/tasks-runstrip.spec.ts`,
  `tests/renderer/tasks-maintenance-source.test.tsx`.
- No manual residue. AC5/AC6 driven through an env-gated synthetic task set
  (`SB_E2E_TASKS_FIXTURE`) since 072 itself has no real waiting/failing producer yet.

**073 — A run I walk away from still has its result** (8 ACs)

- AC1–AC8 → `tests/e2e/task-result-survives-navigation.spec.ts`, `tests/e2e/task-no-model.spec.ts`,
  `tests/e2e/task-run-failure.spec.ts`, `tests/renderer/task-result-route.test.ts`,
  `tests/main/ipc/condense-task.test.ts`, `tests/main/ipc/journal-close-task.test.ts`.
- No manual residue. AC7's e2e half is honestly noted as weak on its own (the trigger is hidden,
  so "no row appears" is vacuous) — the unit test is the real proof of the criterion.

**074 — Maintenance and imports join the same queue** (7 ACs)

- AC1–AC7 → `tests/e2e/maintenance-task-visible.spec.ts`, `tests/e2e/import-task.spec.ts`,
  `tests/e2e/quit-during-run.spec.ts`, `tests/main/gardener-task.test.ts`,
  `tests/core/work/external-task.test.ts`, `tests/core/work/lanes.test.ts`.
- **Gap** (named at refine, confirmed at Done): AC4's close/quit-during-run dialog is proven
  through the real e2e surface only for the maintenance run; the condensation/import broadening
  is proven at main level (registry cancel semantics), not through the dialog itself — the
  no-model e2e vault has no way to hold either in a genuinely long-running `running` state on
  demand. Same class of harness gap as story 067 (S14). Not a manual residue.

**075 — A close proposal can be corrected, not just pruned** (10 ACs)

- AC1–AC10 → `tests/e2e/journal-close-correct.spec.ts` (10 tests), `tests/core/journal/close-request.test.ts`,
  `tests/renderer/close-proposal-todo-row.test.tsx`, `tests/renderer/close-proposal-fields.test.tsx`,
  `tests/renderer/close-proposal-view.test.ts`, `tests/main/journal-ipc.test.ts`.
- No manual residue.

**Summary:** every acceptance criterion across all five stories is proven by an automated test.
One criterion (074/AC4) is proven one level below the real e2e surface for two of its three
producer kinds, because the no-model e2e harness cannot hold a condensation or import in a
genuinely long `running` state on demand — a harness gap, tracked in the roadmap, not blocking.

No `testplan.md` was written — no criterion in this sprint was marked `manual residue`.
