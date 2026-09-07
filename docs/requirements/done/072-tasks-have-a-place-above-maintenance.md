---
id: 072
title: Tasks have a place above maintenance
status: done # draft -> ready -> in-progress -> done
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

- [x] **AC1** — The rail shows a tasks entry directly above the maintenance entry
      (`rail.garden`), reachable by mouse and by keyboard, in both UI languages.
- [x] **AC2** — While at least one task is running or waiting, the entry carries a count
      badge; with nothing in flight it carries none.
- [x] **AC3** — The screen shows three groups, each labelled: running (kind, subject,
      progress, elapsed time), waiting (with position in the queue), finished this session
      (outcome and duration).
- [x] **AC4** — A running task can be stopped from the screen; it then appears as cancelled in
      the finished group rather than disappearing.
- [x] **AC5** — A waiting task can be removed from the queue before it starts, and does not
      start afterwards.
- [x] **AC6** — A failed task can be retried from the screen; the retry appears as a new task
      and the failed record stays.
- [x] **AC7** — With nothing ever started, the screen shows an honest empty state — no
      spinner, no blank panel.
- [x] **AC8** — The screen carries exactly one accent colour, sentence case, no emoji, and no
      raw Tailwind palette class (CLAUDE.md design system).
- [x] **AC9** — A maintenance run started from the garden screen shows the same state in
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

As written during `/refine`, verbatim below; the "as verified" mapping with the real, final
test names/locations is in `## Done`.

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

**Summary.** Gave story 071's work registry a place in the app: a `tasks` rail entry directly
above maintenance (`/tasks`, system group, no digit hotkey), a screen with three labelled
groups (running / waiting / finished this session), and the three action verbs
(`tasks:cancel`, `tasks:remove`, `tasks:retry`) wired to the real `WorkRegistry`. The
maintenance run stays on `event:gardener-progress` for this story, but its progress is now
rendered from the very same derivation `RunStrip` uses (`tasks-view.ts#maintenanceLabel`), so
the two surfaces cannot say different things about the same run. Env-gated synthetic tasks
(`SB_E2E_TASKS_FIXTURE`) give AC5/AC6 — which have no real producer until stories 073/074 — a
real IPC path to drive in e2e.

**Commit message:**

```
072: tasks have a place above maintenance
```

**Verification.**

- `npm run build` — green.
- `npm test` — 267 files / 3707 tests, all green.
- `npm run lint` — green.
- `npm run typecheck` — green.
- `npm run format:check` — green on every file this story touched (verified by diffing the
  command's warning list against this story's changed-file list); the ~230-file repo-wide
  backlog elsewhere predates this story.
- `npm run test:e2e` — 23/23 green, including the 9 new tasks specs
  (`tasks-screen.spec.ts` ×3, `tasks-queue.spec.ts` ×5, `tasks-runstrip.spec.ts` ×1).
- Code review (clean agent, `story-review-hard` tier, per Model Hints): **first pass FAIL**,
  two confirmed defects (maintenance row showed the raw untranslated finding-kind id instead of
  the text `RunStrip` shows for the same snapshot; the rail badge's count was `aria-hidden` with
  no accessible-name fallback) plus test-strength findings (an AC9 unit test proving two
  identical stand-ins agree with each other rather than proving `RunStrip` shares a source; an
  AC8 test that never scanned `tasks.css` or the i18n files; an AC7 test with an unreset
  module-singleton dependency on running first in its file; a single e2e test covering five
  ACs, so one early failure hid the other four). All fixed in one review-fix cycle: see
  Decisions below. **Second pass PASS**, with five further non-blocking findings, of which two
  (an accent-token regex missing a hyphenated variant, and `tasks.css` never scanned for a raw
  hex colour) were fixed directly afterward and reverified; the remaining three (a test-naming
  mismatch on which AC9 block is the real proof, a straight-quote-closer typo in a German test
  assertion message, and a latent e2e timing risk against the gardener autorun timer) are
  addressed or accepted below. 2 review-fix cycles total, under the 3-cycle cap.

**AC → test mapping, as verified (real names/locations; supersedes the as-written section
above where they differ):**

- AC1 → `tests/renderer/rail.test.tsx` › "sits the tasks entry directly above maintenance in
  both languages" + e2e `tests/e2e/tasks-screen.spec.ts` › "the rail opens tasks directly above
  maintenance, by click and by key" — both passed.
- AC2 → `tests/e2e/tasks-queue.spec.ts` › "the badge counts what runs and what waits (AC2)" +
  `tests/e2e/tasks-screen.spec.ts` › "with nothing started the rail carries no badge" +
  `tests/renderer/tasks-view.test.ts` › "counts running and waiting tasks, ignoring finished
  ones" / "adds one for a running maintenance row on top of the registry count" — all passed.
- AC3 → `tests/e2e/tasks-queue.spec.ts` › "running, waiting and finished each stand under their
  own heading (AC3)" + `tests/renderer/tasks-view.test.ts` › "reports a waiting task its queue
  position" / "measures a finished task from when it started running" — all passed.
- AC4 → `tests/e2e/tasks-queue.spec.ts` › "a running task stopped from the screen appears as
  cancelled (AC4)" + `tests/main/tasks-ipc.test.ts` › "cancel leaves a cancelled record, not a
  gap (AC4)" — both passed.
- AC5 → `tests/e2e/tasks-queue.spec.ts` › "a waiting task removed before it starts never runs
  (AC5)" + `tests/main/tasks-ipc.test.ts` › "remove takes a queued task out of the lane (AC5)"
  — both passed, the latter asserting every emitted snapshot, not just the end state.
- AC6 → `tests/e2e/tasks-queue.spec.ts` › "a failed task can be retried and the failure stays
  (AC6)" + `tests/main/tasks-ipc.test.ts` › "retry enqueues a new task and keeps the failed
  record (AC6)" — both passed.
- AC7 → `tests/renderer/tasks.test.tsx` › "zeigt bei einer leeren Warteschlange den Leerzustand
  statt eines Spinners, aber nie vor der ersten Antwort (AC7)" + e2e `tests/e2e/tasks-screen.
spec.ts` › "with nothing ever started the screen says so" — both passed; order-independence
  reverified with `--sequence.shuffle` after the review-fix cycle added
  `resetWorkTasksStoreForTests()`.
- AC8 → `tests/renderer/tasks.test.tsx`'s "(AC8)" describe block: raw-Tailwind-class scan (now
  also covering `tasks.css` for a raw hex colour), emoji scan (screen sources + both i18n
  partials), one-accent scan (now matching hyphenated token variants), an English sentence-case
  scan, and an axe run — all passed; `scripts/lib/screens.mjs` registers `tasks` so `shot`/`a11y`
  pick the screen up.
- AC9 → `tests/e2e/tasks-runstrip.spec.ts` › "a maintenance run shows the same progress in the
  run strip and on the tasks screen" + `tests/renderer/tasks-maintenance-source.test.tsx` ›
  "one store feeds both surfaces (AC9)" (renders the real `RunStrip` next to the `tasks-view.ts`
  derivation, asserts identical translated labels across two snapshots, and that neither ever
  shows the raw id) — both passed.

No manual residue.

**Decisions.**

- 071's real API differs in names from 072's plan (written before 071 landed): `WorkTask`
  (not `TaskRecord`), `progress` not `percent`, `queuePosition` not `position`, `work:list` /
  `event:work-tasks` (not `tasks:list` / `event:tasks-changed`) — reused as-is, per the sprint's
  adapt-names-not-shape rule. Only the new action verbs (`tasks:cancel`/`tasks:remove`/
  `tasks:retry`) use the `tasks:` prefix, matching the story's own explicit Decisions entry.
- The plan assumed a missing registry method would go in `src/core/tasks/`; that directory
  never existed and 071's registry lives in `src/core/work/`, so `WorkRegistry.retry()` (D2)
  was added there instead — the plan's intent (retry lives in core, Electron-free), not its
  literal path, was honoured.
- `retry()` re-enqueues using the original task's own stored `run` closure (so a retried task
  does the identical work, not an approximation) and leaves the failed record untouched by
  construction — it only ever reads the old entry.
- `tasks:remove` and `tasks:cancel` both call the same `WorkRegistry.cancel(id, 'user')`:
  `cancel()` already handles "queued → never starts" and "running → aborted" correctly and
  synchronously (settles before any `pump()` runs), so a second removal mechanism would only
  risk reintroducing the exact auto-start race Model Hints flagged as the risk for D2.
- The badge counts registry tasks (running + waiting) plus the maintenance row whenever a
  gardener run is going, per the story's Decisions — implemented as `tasksBadgeCount` in
  `tasks-view.ts`, fed to `Rail.tsx`'s per-screen count lookup (which also generalises the
  previously journal-only `aria-label` mechanism, fixed during review — see below).
- Review-fix cycle 1 (confirmed defects): `tasks-view.ts`'s maintenance-row label now calls a
  shared `maintenanceLabel(progress, t)` that `RunStrip.tsx` also calls (removing its inline
  three-way branch), so the two surfaces cannot drift on the same snapshot; `Rail.tsx`'s
  accessible-name mechanism (previously `journal`-only) now also covers `tasks`, so a
  screen-reader user hears the running+waiting count, not just the label.
- Review-fix cycle 1 (test strength): `tests/renderer/tasks-maintenance-source.test.tsx` gained
  a block that renders the real `RunStrip` (not a second stand-in) next to the `tasks-view.ts`
  derivation; `tests/renderer/tasks.test.tsx`'s AC8 block now reads `tasks.css` (via a
  `vitest.config.ts` CSS-processing opt-in scoped to that one file) and both i18n partials, and
  gained an English sentence-case check; `tasks-store.ts` gained
  `resetWorkTasksStoreForTests()`, called in a `beforeEach`, removing the AC7 test's ordering
  dependency; `tests/e2e/tasks-queue.spec.ts` was split into 5 independently-named tests (one
  per AC2-AC6), each still asserting its own criterion — the shared fixture's task set carries
  over between them by design (documented in the spec's header comment) since a fresh app
  launch per test cannot fast-forward the "runs until stopped" task back to a clean start.
- Review-fix cycle 2 (non-blocking, fixed): the "exactly one accent" regex only matched a single
  hyphen segment, missing real two-segment Gaston tokens like `--accent-soft-border` — widened;
  the raw-palette scan never covered `tasks.css` itself for a raw hex colour — added; the AC9
  unit-test name in the story's mapping pointed at the two-stand-ins block rather than the
  real-`RunStrip` one — the two `describe` blocks were renamed so "one store feeds both
  surfaces (AC9)" is now the strong proof and the weaker one is honestly named as a
  store-level check, not an AC9 claim; a straight `"` quote closer in a German test-assertion
  message was corrected to `„…“` (guardrail 7).
- Review-fix cycle 2 (accepted, not fixed): the second review noted — plausible but not
  observed in any run — that the seeded e2e vault's `gardener.runOnOpen: true` fires the
  maintenance autorun 2500 ms after vault open (`FIRST_RUN_DELAY_MS`,
  `src/main/gardener-autorun.ts`), and a tasks e2e spec slow enough to still be running past
  that mark could see the maintenance row appear mid-assertion. This is a pre-existing property
  of the whole e2e harness (every spec's seeded vault has autorun on; nothing before this story
  disabled it, and every existing spec already relies on finishing well inside that window), not
  something 072 introduced — adding a harness-wide opt-out is out of this story's scope. All
  tasks specs finish in well under 1 second per test in every run performed here (5/5 stable),
  leaving a wide margin; flagged here for whichever story next touches the e2e harness broadly.
  - Also accepted without a code change: `TaskRow.tsx`'s running-row elapsed time does not tick
    live between `event:work-tasks` pushes (AC3 only requires it be shown, not that it ticks);
    a 10-minute backstop `setTimeout` in the D5 fixture's "task A" is cleared by worker teardown
    rather than explicitly, matching how other long-running e2e fixtures in this suite behave.
