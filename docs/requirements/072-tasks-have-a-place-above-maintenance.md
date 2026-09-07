---
id: 072
title: Tasks have a place above maintenance
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The user asked for it in exactly those terms (2026-09-07): "we should add a kind of queue or
task manager, best placed above maintenance." Story 071 builds the truth behind it; this story
gives it a place in the app — a rail entry directly above "Pflege" and a screen that answers
three questions at a glance: what is running, what is waiting, what just finished and how it
ended.

The screen is also where a run can be acted on: stopped, taken out of the queue before it
starts, or retried after it failed. The maintenance run's existing strip
(`src/renderer/components/RunStrip.tsx`) stays — but it reads the same source, so there is
never a strip saying one thing and a screen saying another.

## Acceptance Criteria

- [ ] **AC1** — The rail shows a tasks entry directly above the maintenance entry
      (`rail.garden`), reachable by mouse and by keyboard, in both UI languages.
- [ ] **AC2** — While at least one task is running or waiting, the entry carries a count
      badge; with nothing in flight it carries none.
- [ ] **AC3** — The screen shows three groups, each labelled: running (kind, subject,
      progress, elapsed time), waiting (with position in the queue), finished this session
      (outcome and duration).
- [ ] **AC4** — A running task can be stopped from the screen; it then appears as cancelled in
      the finished group rather than disappearing.
- [ ] **AC5** — A waiting task can be removed from the queue before it starts, and does not
      start afterwards.
- [ ] **AC6** — A failed task can be retried from the screen; the retry appears as a new task
      and the failed record stays.
- [ ] **AC7** — With nothing ever started, the screen shows an honest empty state — no
      spinner, no blank panel.
- [ ] **AC8** — The screen carries exactly one accent colour, sentence case, no emoji, and no
      raw Tailwind palette class (CLAUDE.md design system).
- [ ] **AC9** — A maintenance run started from the garden screen shows the same state in
      `RunStrip` and on this screen at the same time — one source, proven by a test, not two
      that happen to agree.

## Open Questions

- ~~Route and label: `/tasks` with `rail.tasks` — "Aufgaben"/"Tasks"? "Aufgaben" collides with
  todos in the user's vocabulary; "Läufe"/"Runs" may read more precisely.~~ answered →
  Decisions (Sprint)
- ~~Does the badge count waiting tasks only, or running plus waiting?~~ answered → Decisions
  (Sprint)
- ~~Does stopping a half-finished condensation keep a partial result (as the maintenance run
  does for finished stages), or discard it?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Route and label: `/tasks` with `rail.tasks`, labelled "Aufgaben"/"Tasks" — kept as
  originally proposed despite the vocabulary overlap with todos.
- **(User)** Badge counts running plus waiting tasks together, not waiting-only.
- **(User)** Stopping a half-finished condensation keeps the partial result, consistent with
  the maintenance run's existing behaviour for finished stages.
- Maintenance stays on `event:gardener-progress` for the whole of this story; the screen
  derives its running row from the very store `RunStrip` reads
  (`src/renderer/lib/gardener-progress.ts`) — that is AC9's "one source" without pre-empting
  story 074's migration.
- The maintenance row is read-only here: a stopped gardener run leaves no finished record
  until 074, so a stop button that made the row vanish would contradict AC4 — that run's stop
  stays in `RunStrip`, which is mounted in the shell and therefore visible on this screen too.
- The badge counts registry tasks (running + waiting) plus that adapted maintenance row,
  because a badge reading zero while the screen shows a running maintenance task would be the
  same "two answers" the story exists to end.
- 072 owns the action channels `tasks:cancel` / `tasks:remove` / `tasks:retry`: story 071's
  criteria stop at the registry and its list, so the surface's verbs are cut here, with any
  missing registry method added in `src/core/tasks/` (CLAUDE.md: queue logic stays
  Electron-free).
- The rail entry takes no digit hotkey; it is keyboard-reachable through rail focus and the
  command palette, because renumbering `garden` (6) and `settings` (7) would silently change
  two shortcuts documented in `docs/ARCHITECTURE.md`.
- The entry sits in the rail's `system` group immediately before `garden`, and `Rail.tsx`'s
  hardcoded `isJournal` badge branch becomes a small per-screen count lookup — reuse instead
  of a second copy of the same branch.
- The empty state carries no action (`screen.tasks.empty.action` is deliberately absent): work
  starts where it belongs — on a project, a day, an area — never from an empty queue. The i18n
  test gets its own tasks block rather than joining the header list that demands an action key.
- Groups render only when non-empty, in the fixed order running → waiting → finished; the
  honest empty state (AC7) appears only when all three are empty and the list has resolved.
- The one accent belongs to the running group's progress bar; waiting and finished use neutral
  tokens, following `RunStrip`'s own "one accent per screen" note.
- AC5 and AC6 have no real producer yet in 072 (073 and 074 bring them), so the e2e trigger is
  an env-gated synthetic task set (`SB_E2E_TASKS_FIXTURE`) in main, mirroring the existing
  `SB_E2E_STAGE_DELAY_MS` seam — the real IPC path and the real registry, only the work is fake.
- Strings live in new i18n partials `de-tasks.ts` / `en-tasks.ts` and styling in a new
  `src/renderer/styles/app/tasks.css`, per the existing per-domain file convention.

## Plan

Assumed 071 API (stable per the sprint's build order; adjust names, not shape, if 071 landed
differently): `TaskRecord { id, kind, subject: { label, ref? }, state: 'queued' | 'running' |
'done' | 'failed' | 'cancelled', percent?, message?, error?, position?, startedAt?,
finishedAt? }` in `src/shared/types/tasks.ts`, readable via `tasks:list` and pushed on
`event:tasks-changed`.

1. **Place first** — `screens.ts` gets a `tasks` entry in the `system` group directly before
   `garden`; `App.tsx` routes `/tasks`; `scripts/lib/screens.mjs` learns it so `shot`/`a11y`
   cover it. `Rail.tsx`'s journal-only badge branch becomes a per-screen count lookup.
2. **Surface verbs** — `src/shared/ipc.ts` gains `tasks:cancel`, `tasks:remove`, `tasks:retry`
   (`tasks:list` / `event:tasks-changed` reused from 071 if present, added here if not);
   handlers in `src/main/ipc/tasks.ts` delegate to the registry, adding whatever it lacks in
   `src/core/tasks/`.
3. **Renderer data layer** — `tasks-store.ts` (`useSyncExternalStore` over the event, seeded by
   `tasks:list`, mirroring `gardener-progress.ts`), `queries/tasks.ts` for the mutations, and
   the pure `tasks-view.ts`: grouping, queue position, duration, badge count, plus the
   maintenance row derived from the gardener progress store — one source, two views.
4. **Screen** — `TasksScreen` = `ScreenHeader` + three labelled `TaskGroup`s of `TaskRow`s +
   `EmptyState`; row actions call the mutations from step 2. Styling in `styles/app/tasks.css`
   with tokens only.
5. **Real-surface trigger** — env-gated synthetic tasks in main plus the e2e spec that drives
   stop, remove and retry through them; the maintenance/`RunStrip` agreement gets its own spec.

Order: D1 → D2 → D3 → D4 → D5; D1 and D2 are independent of each other.

## Deliverables

- **D1 — the place and an honest empty screen.** Rail entry above maintenance, route, screen
  shell with `ScreenHeader` + `EmptyState`, i18n partials.
  Files: `src/renderer/lib/screens.ts`, `src/renderer/App.tsx`,
  `src/renderer/screens/tasks/TasksScreen.tsx`, `src/renderer/components/Rail.tsx`,
  `src/renderer/i18n/de-tasks.ts`, `en-tasks.ts`, `de.ts`, `en.ts`, `scripts/lib/screens.mjs`.
  Mirror: `src/renderer/screens/garden/GardenScreen.tsx`, `src/renderer/i18n/de-garden.ts`.
  Plus its tests in `tests/renderer/rail.test.tsx`, `tests/renderer/i18n.test.ts` and
  `tests/e2e/tasks-screen.spec.ts`.
  Acceptance: `/tasks` opens from the rail by click and by keyboard in both languages, sits
  directly above maintenance, shows the empty state and carries no badge.

- **D2 — the queue's verbs over IPC.** `tasks:cancel`, `tasks:remove`, `tasks:retry` (and
  `tasks:list` / `event:tasks-changed` if 071 did not add them), handlers against the registry.
  Files: `src/shared/ipc.ts`, `src/main/ipc/tasks.ts`, `src/main/ipc/index.ts`,
  `src/core/tasks/*` (only what the registry lacks).
  Mirror: `src/main/ipc/gardener-run.ts`, `src/main/ipc/gardener-deps.ts`.
  Plus its test in `tests/main/tasks-ipc.test.ts`.
  Acceptance: cancel leaves a `cancelled` record; remove takes a queued task out so it never
  runs; retry enqueues a new task and the failed record stays; `ipc-coverage` green.

- **D3 — one source, read once.** `tasks-store.ts`, `queries/tasks.ts`, api additions, event
  wiring, and the pure `tasks-view.ts` (grouping, position, duration, badge count, maintenance
  row from `gardener-progress.ts`).
  Files: `src/renderer/lib/tasks-store.ts`, `src/renderer/lib/tasks-view.ts`,
  `src/renderer/lib/queries/tasks.ts`, `src/renderer/lib/queries/keys.ts`,
  `src/renderer/lib/api.ts`, `src/renderer/main.tsx`.
  Mirror: `src/renderer/lib/gardener-progress.ts`, `src/renderer/lib/queries/gardener.ts`.
  Plus its tests in `tests/renderer/tasks-view.test.ts` and
  `tests/renderer/tasks-maintenance-source.test.tsx`.
  Acceptance: a late-mounting reader sees the same list as an early one; badge = running +
  waiting including the maintenance row; one store feeds `RunStrip` and the view model.

- **D4 — the three groups and their actions.** `TaskGroup` / `TaskRow`, stop / remove / retry
  wired, tokens-only styling.
  Files: `src/renderer/screens/tasks/TasksScreen.tsx`, `TaskGroup.tsx`, `TaskRow.tsx`,
  `src/renderer/styles/app/tasks.css`, `src/renderer/index.css`,
  `src/renderer/i18n/de-tasks.ts`, `en-tasks.ts`.
  Mirror: `src/renderer/screens/garden/FindingList.tsx`, `src/renderer/styles/app/garden.css`.
  Plus its tests in `tests/renderer/tasks.test.tsx` and `tests/e2e/tasks-runstrip.spec.ts`.
  Acceptance: running (kind, subject, progress, elapsed), waiting (position) and finished
  (outcome, duration) each under their own heading; one accent, no emoji, no raw palette class,
  axe clean; a maintenance run reads identically in the strip and on the screen.

- **D5 — a real trigger for waiting and failed.** Env-gated synthetic task set in main plus the
  queue spec that drives the verbs through the real surface.
  Files: `src/main/ipc/tasks-e2e-fixture.ts`, `src/main/ipc/tasks.ts`,
  `tests/e2e/fixtures/app.ts`, `tests/e2e/tasks-queue.spec.ts`.
  Mirror: the `SB_E2E_STAGE_DELAY_MS` seam in `src/main/ipc/gardener-run.ts` and
  `tests/e2e/fixtures/app.ts:65,153`, plus `tests/main/gardener-run-delay.test.ts`.
  Plus its test in `tests/main/tasks-fixture-env.test.ts` (off without the env var).
  Acceptance: with the flag the screen shows a running, two waiting and one failed task, and
  stop, remove and retry each work from the screen; without the flag nothing changes.

## Model Hints

- D2 → `deliverable-hard` — it lands the surface's verbs on a registry another story is still
  building: retry must enqueue a _new_ task without disturbing the failed record, and remove
  must beat 071/AC3's auto-start race for the very task it is taking out of the lane.
- D1, D3, D4, D5 → default.
- Review: → `story-review-hard` — the story rests on an assumed 071 API and on AC9's "one
  source" claim, and both are exactly the kind of thing a diff can satisfy on the surface while
  two sources quietly remain.

## Acceptance Tests

- AC1 → e2e `tests/e2e/tasks-screen.spec.ts` › "the rail opens tasks directly above
  maintenance, by click and by key" + unit `tests/renderer/rail.test.tsx` › "the tasks entry
  sits directly above maintenance in both languages" (D1)
- AC2 → e2e `tests/e2e/tasks-queue.spec.ts` › "the badge counts what runs and what waits" (D5)
  - e2e `tests/e2e/tasks-screen.spec.ts` › "with nothing started the rail carries no badge"
    (D1) + unit `tests/renderer/tasks-view.test.ts` › "the badge counts running plus waiting"
    (D3)
- AC3 → e2e `tests/e2e/tasks-queue.spec.ts` › "running, waiting and finished each stand under
  their own heading" (D5) + unit `tests/renderer/tasks-view.test.ts` › "a waiting task reports
  its position, a finished one its duration" (D3)
- AC4 → e2e `tests/e2e/tasks-queue.spec.ts` › "a running task stopped from the screen appears
  as cancelled" (D5) + unit `tests/main/tasks-ipc.test.ts` › "cancel leaves a cancelled record,
  not a gap" (D2)
- AC5 → e2e `tests/e2e/tasks-queue.spec.ts` › "a waiting task removed before it starts never
  runs" (D5) + unit `tests/main/tasks-ipc.test.ts` › "remove takes a queued task out of the
  lane" (D2)
- AC6 → e2e `tests/e2e/tasks-queue.spec.ts` › "a failed task can be retried and the failure
  stays" (D5) + unit `tests/main/tasks-ipc.test.ts` › "retry enqueues a new task and keeps the
  failed record" (D2)
- AC7 → e2e `tests/e2e/tasks-screen.spec.ts` › "with nothing ever started the screen says so"
  (D1) + unit `tests/renderer/tasks.test.tsx` › "an empty queue shows the empty state, not a
  spinner" (D4)
- AC8 → unit `tests/renderer/tasks.test.tsx` › "one accent, sentence case, no emoji, no raw
  palette class" (source scan of `src/renderer/screens/tasks/*` plus the rendered tree) and the
  axe run in the same file (D4); `npm run a11y` / `npm run shot` pick the screen up through
  `scripts/lib/screens.mjs` (D1)
- AC9 → e2e `tests/e2e/tasks-runstrip.spec.ts` › "a maintenance run reads the same in the strip
  and on the tasks screen" (D4, with `stageDelayMs` as in `gardener-run-cross-screen.spec.ts`)
  - unit `tests/renderer/tasks-maintenance-source.test.tsx` › "one store feeds both surfaces"
    (D3)

No manual residue.

## Done
