---
id: 056
title: Loose ends are derived once per index
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.2-3](../reviews/2026-09-03-architecture-review.md)),
P1 — the concrete follow-up the roadmap's M6 and M8 gap notes already predicted. Evidence:
`findLooseEnds` does two stream parses per journal day plus ~13 regex passes per sentence plus
an O(days) scan per candidate (`src/core/journal/loose-ends.ts:362`), and runs uncached from
five call sites: `journal:get` — which then filters the full result to one day
(`src/main/ipc/journal.ts:210`) — `journal:interviewPlan` (`src/main/ipc/journal.ts:386`),
`reminders()` for both `dashboard:data` and `reminders:list`
(`src/core/overview/reminders.ts:302`), the gardener check (`src/core/gardener/report.ts:160`),
and the hourly notifier (`src/main/reminder-notify.ts:184`). Every write invalidates all
vault-dependent query roots at once (`src/renderer/lib/events.ts:15`), so one coach turn near
the dashboard triggers two or more full-corpus passes; opening a day adds a third.

## Requirement

The heuristic that finds loose ends re-reads and re-parses the entire journal history every
time any screen wants any part of its result — and the screens want it constantly: opening a
day, opening the dashboard, the interview, the reminder tick. The result is identical between
two index changes, and most callers throw away almost all of it (the day view keeps one day's
rows out of a full-history scan).

The derivation stays exactly what it is — same findings, same honesty about being heuristic.
It just runs once per index state, and everything that needs loose ends reads that one result.
Opening a day or the dashboard must not scale with the length of my journal history.

## Acceptance Criteria

- [x] Between two index changes, the loose-end derivation runs at most once, no matter how many
      screens ask; a test counts invocations across `journal:get`, `dashboard:data`,
      `reminders:list`, and the interview plan.
- [x] A vault change invalidates the cached result; the next reader recomputes.
- [x] The derived findings are byte-identical to today's — pinned by existing tests, none of
      which are weakened.
- [x] `journal:get` for one day no longer pays for the whole history.
- [x] The gardener check and the notifier read the same single source of truth.

## Open Questions

## Decisions (Sprint)

- **The cache lives in `src/core/journal/`, keyed on the `VaultIndex` object (`WeakMap`), not
  inside `IndexService`.** Reason: every caller already holds something with `.index()`, so no
  interface (`OverviewIndex`, `GardenerIndexView`, `IndexLike`) or test fake changes, and
  `src/core/index/` keeps knowing nothing about journal rules.
- **If 054 lands an explicit per-index-state hook (generation counter / derived slot reset in
  `IndexService.update()`), key on that instead of object identity.** Reason: the invariant is
  "new index state ⇒ recompute, same state ⇒ reuse"; identity only holds as long as every refresh
  produces a new `VaultIndex` object, and D1's IndexService test pins exactly that.
- **The key includes `today`, built by one `derivationKey()` function.** Reason: `findLooseEnds`
  depends on `today` (a midnight rollover without an index change must recompute), and 061 can
  add the document language to that one function without reshaping the cache.
- **One entry per index state; a different key replaces it.** Reason: bounded memory; stale index
  objects are collected by the `WeakMap`.
- **Days and todos are derived from the `VaultIndex` inside the derivation, never passed in.**
  Reason: an input the key does not see would make the cache silently stale.
- **The derivation also holds the prepared `resolutionCheck`; `findLooseEnds` and `dayLooseEnds`
  get an optional prepared-check parameter whose default is today's behaviour.** Reason:
  `journal:get` otherwise re-parses every day in `resolutionCheck`, and a second implementation
  of "settled" is exactly what `loose-ends.ts` forbids.
- **AC4 reads as: beyond the once-per-index derivation, `journal:get` does work bounded by the
  one requested day.** Reason: the first reader after an index change pays once by AC1's own
  definition; what must go is the full-history parse per call.
- **Upcoming mentions (070) ride in the same derivation, memoized per horizon.** Reason: the
  requirement says opening the dashboard must not scale with journal history, and
  `reminders()` would otherwise keep one full scan per call through `findUpcomingMentions`.
- **No renderer change; `src/renderer/lib/events.ts` keeps invalidating all roots.** Reason: once
  re-reads are cheap the broad invalidation costs nothing, and changing it is out of scope.
- **Invocation counting uses `vi.mock` with a spy that wraps the real `findLooseEnds`, with no
  test counter in production code.** Reason: the tests watch the real function, and production
  code carries nothing that exists only for tests.
- **`modelLooseEnds` takes the cached heuristic/settled check as an optional input field.**
  Reason: the gardener's model stage must read the same source (AC5), and leaving the field out
  keeps today's path, so the existing fake-provider and no-model tests stay as they are.
- **Language-awareness (061) is not touched.** Reason: separate story; only the key function is
  left open for it.

## Plan

Pre-build shape, reconciled at build time against what 054/055 actually landed.

1. **Core derivation (D1).** New `src/core/journal/loose-ends-derived.ts`:
   `looseEndsDerived(index: VaultIndex, today: string): LooseEndDerivation` with
   `{ days, todos, resolve, looseEnds, upcoming(horizon) }`, memoized in a
   `WeakMap<VaultIndex, { key, value }>`. Days are built like `looseEndInput`/`looseEndDaysOf`
   (`deriveJournalDays(index.docs)` + body/bodyLine), and todos come from `index.todos`.
   `findLooseEnds(days, todos, today, resolve?)` and `dayLooseEnds(..., resolve?)` gain an
   optional prepared check. Exported via `src/core/journal/index.ts`.
2. **Core consumers (D2).** `reminders()` (`fromLooseEnds`, `fromUpcomingMentions`), the gardener
   `looseEndCheck`, `report.ts`'s model stage and `modelLooseEnds` read the derivation. The
   notifier goes through `reminders()`, so it follows automatically.
3. **Main consumers (D3).** `src/main/ipc/journal-loose-ends.ts` (`openLooseEnds`,
   `journalDayLooseEnds`) and `gardener-deps.ts`'s model stage read the derivation. Plus the
   cross-handler test that counts derivations through the real handlers.

Order: D1 → D2 → D3. Findings stay byte-identical: every existing loose-end, upcoming-mention,
reminders and gardener test runs unchanged.

## Deliverables

- **D1 — Once-per-index loose-end derivation (core).** Create
  `src/core/journal/loose-ends-derived.ts` exporting `looseEndsDerived(index: VaultIndex, today:
string): LooseEndDerivation`, where `LooseEndDerivation = { days: LooseEndDay[]; todos:
LooseEndTodo[]; resolve: ReturnType<typeof resolutionCheck>; looseEnds: LooseEnd[];
upcoming(horizonDays: number): UpcomingMention[] }`. Build `days` from
  `deriveJournalDays(index.docs)` (`@core/index/journal`) joined to `index.docs` by path for
  `body`/`bodyLine`, skipping days without a doc, which is the same transformation as
  `looseEndDaysOf` in `src/core/overview/reminders.ts:220`. Build `todos` from `index.todos` as
  `{ text, due }`. Compute `resolve = resolutionCheck(days, todos)` once and
  `looseEnds = findLooseEnds(days, todos, today, resolve)`. Memoize `upcoming` per horizon inside
  the entry, calling `findUpcomingMentions(days, todos, today, horizonDays)` unchanged. Memoize the
  whole entry in a module-level `WeakMap<VaultIndex, { key: string; value }>`. `key` comes from a
  single `derivationKey(today)` function (one place, so a later story can add the document
  language), and a different key replaces the entry. In `src/core/journal/loose-ends.ts`, give
  `findLooseEnds` an optional 4th parameter `resolve = resolutionCheck(days, todos)` and derive
  `settled` from it as `settledCheck` does today (`resolve(...) !== null`). Output must stay
  identical. In `src/core/journal/loose-end-resolution.ts`, give `dayLooseEnds` an optional last
  parameter `resolve` with the same default. Export the new function and type from
  `src/core/journal/index.ts`. Files: those four plus the test. Tests in
  `tests/core/journal/loose-ends-derived.test.ts` (mirror the fixtures of
  `tests/core/journal/loose-ends.test.ts`; count with
  `vi.mock('@core/journal/loose-ends', async (orig) => ({ ...(await orig()), findLooseEnds:
vi.fn((await orig()).findLooseEnds) }))` or an equivalent spy on the real function):
  - "the derivation equals findLooseEnds on the same stock". `looseEnds` deep-equals a direct
    `findLooseEnds(days, todos, today)`, and `upcoming(h)` deep-equals
    `findUpcomingMentions(...)`.
  - "the same index and day derive once". Two calls with the same `VaultIndex` and `today` give
    one `findLooseEnds` call and the same object back.
  - "a new day recomputes". The same index with a different `today` gives a second call.
  - "a refreshed index recomputes". A real `IndexService` over a temp vault
    (`tests/helpers/vault`): derive, change a journal day on disk, `refresh()`, derive again. The
    result is two calls, and the new result reflects the change. Also assert that
    `service.index()` is a different object after a change-bearing refresh. If 054 made refresh
    mutate in place, switch the key to 054's per-state hook (see Decisions) and keep this test.

- **D2 — Core consumers read the derivation.** In `src/core/overview/reminders.ts`,
  `reminders()` calls `looseEndsDerived(index.index(), day)`. `fromLooseEnds` maps
  `derived.looseEnds`, `fromUpcomingMentions` maps `derived.upcoming(deadlineHorizonDays)`, and
  the two `looseEndDaysOf(...)` calls go (delete `looseEndDaysOf` if it becomes unused). In
  `src/core/gardener/checks/loose-end.ts`, `looseEndCheck.run` uses
  `looseEndsDerived(ctx.index.index(), ctx.today).looseEnds`. Keep `looseEndInput` for callers
  that still need raw days. In `src/core/journal/loose-ends-llm.ts`, `LooseEndModelInput` gains
  an optional `derived?: Pick<LooseEndDerivation, 'looseEnds' | 'resolve'>`. When present,
  `heuristic = derived.looseEnds` and `settled` comes from `derived.resolve`. When absent,
  behaviour is unchanged. In `src/core/gardener/report.ts:158`, pass
  `derived: looseEndsDerived(ctx.index.index(), ctx.today)` into `modelLooseEnds`. Mapping,
  ids, sort order and snooze filtering stay byte-identical. Files: those four plus tests. Tests:
  - `tests/core/overview/reminders.test.ts` › "reminders derive loose ends once per index". Two
    `reminders()` calls on the same index and day give one `findLooseEnds` call (spy as in D1),
    and the output equals the pre-existing expectations.
  - `tests/core/journal/loose-ends-llm.test.ts` › "the model stage reuses a passed derivation".
    With `derived` passed, `findLooseEnds` is not called again and the result equals the call
    without `derived`. Keep the existing fake-provider and no-model tests unchanged.

- **D3 — Main consumers read the derivation, plus the cross-surface count.** In
  `src/main/ipc/journal-loose-ends.ts`, `looseEndContext` becomes
  `looseEndsDerived(gardenerIndex(services).index(), gardenerToday())`. `openLooseEnds` filters
  `derived.looseEnds` (same answered/dismissed/snoozed logic). `journalDayLooseEnds` passes
  `derived.resolve` into `dayLooseEnds(days, todos, today, date, answered, derived.resolve)`, so
  per call only the requested day is scanned (`announcementsOf(source)` in `answeredFor` and
  `dayLooseEnds` is one day). Look the day up once and do not re-map `days` per call. In
  `src/main/ipc/gardener-deps.ts:493`, pass `derived` into `modelLooseEnds` as in D2. Files:
  those two plus the test. Test `tests/main/loose-ends-once.test.ts` (mirror the harness of
  `tests/main/journal-gardener-flow.test.ts`: real `buildHandlers`, temp vault, `electron`
  mocked, and the `findLooseEnds` spy via `vi.mock('@core/journal/loose-ends', ...)` wrapping the
  real function), seeded with journal days that include one open loose end:
  - "loose ends derive once across journal:get, dashboard:data, reminders:list and the interview
    plan". All four channels in one index state give exactly one `findLooseEnds` call, and each
    surface shows the seeded loose end.
  - "a vault change invalidates the derived loose ends". Write a journal day through a handler
    (or change it on disk and refresh the index), call `journal:get` again, and the count goes to
    2 with the new state visible.
  - "journal:get for one day does not re-derive the history". With the derivation warm, a spy on
    `resolutionCheck` shows 0 calls, and `announcementsOf` is called only with the requested day,
    for another `journal:get` on a different date.
  - "the gardener check and the notifier read the same derivation". With the derivation warm,
    `gardener:run` (no model) and a `ReminderNotifier.check()` (fake notifier, mirror
    `tests/main/reminder-notify.test.ts`) leave the count at 1, and the gardener's loose-end
    finding id equals `findingId('loose-end', <reminder's raw id>)`.

## Model Hints

- D1 → deliverable-hard. Risk: an identity-keyed memo is silently stale if 054's incremental
  refresh updates the `VaultIndex` in place, or if the key misses an input (`today`, todos), and
  the `findLooseEnds`/`dayLooseEnds` signature extension must keep output byte-identical for
  every existing caller.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/main/loose-ends-once.test.ts` › "loose ends derive once across journal:get,
  dashboard:data, reminders:list and the interview plan" (plus
  `tests/core/journal/loose-ends-derived.test.ts` › "the same index and day derive once"). IPC/core
  behaviour with no user-driven surface, so `npm test` is the level.
- AC2 → unit `tests/core/journal/loose-ends-derived.test.ts` › "a refreshed index recomputes" and
  `tests/main/loose-ends-once.test.ts` › "a vault change invalidates the derived loose ends".
- AC3 → unit `tests/core/journal/loose-ends-derived.test.ts` › "the derivation equals
  findLooseEnds on the same stock", plus the unchanged existing suites
  `tests/core/journal/loose-ends.test.ts`, `loose-end-resolution.test.ts`,
  `loose-ends-llm.test.ts`, `tests/core/overview/reminders.test.ts`, and
  `tests/main/journal-ipc.test.ts`, none weakened.
- AC4 → unit `tests/main/loose-ends-once.test.ts` › "journal:get for one day does not re-derive
  the history".
- AC5 → unit `tests/main/loose-ends-once.test.ts` › "the gardener check and the notifier read the
  same derivation" (plus `tests/core/journal/loose-ends-llm.test.ts` › "the model stage reuses a
  passed derivation instead of finding loose ends again (056, D3)").

Coverage: AC1 → D1 + D3 · AC2 → D1 + D3 · AC3 → D1 + D2 · AC4 → D1 (prepared check) + D3 ·
AC5 → D2 + D3.

## Done

Loose-end findings, upcoming mentions and the resolution check are now computed once per
`VaultIndex` object plus `today` (`src/core/journal/loose-ends-derived.ts`, `looseEndsDerived`,
`WeakMap`-memoized) instead of once per caller. `journal:get`, `dashboard:data`,
`reminders:list`, `journal:interviewPlan`, the gardener's `loose-end` check and its model stage,
and the reminder notifier all read the same derivation; `journal:get` now passes the prepared
`resolve` into `dayLooseEnds` so a single-day read no longer folds the whole journal.

**Commit message:**

```
056: derive loose ends once per index instead of once per caller
```

**Verification (narrow gate):**

- `npm run build` — green.
- `npm run lint` — green.
- `npm run typecheck` — green.
- `npm run format:check` — red on 5 files; 4 pre-existing and unrelated to this story
  (`docs/requirements/052-*.md`, `061-*.md`, `062-*.md`, `tests/main/services.test.ts`), left
  untouched; this story's own file (this one) was reformatted and is green now.
- `npx vitest run --changed HEAD` (test-story) — 89 files, 1259 tests, all green.
- No `e2e-story`: every AC maps to unit tests only (no user-facing surface), so `e2e` was not run,
  per the profile's rule for stories with no e2e-mapped criterion.
- AC → test mapping, all verified green in the run above: AC1 →
  `tests/main/loose-ends-once.test.ts` "loose ends derive once across journal:get, dashboard:data,
  reminders:list and the interview plan" + `loose-ends-derived.test.ts` "the same index and day
  derive once". AC2 → `loose-ends-derived.test.ts` "a refreshed index recomputes" +
  `loose-ends-once.test.ts` "a vault change invalidates the derived loose ends". AC3 →
  `loose-ends-derived.test.ts` "the derivation equals findLooseEnds on the same stock" + unweakened
  `loose-ends.test.ts`, `loose-end-resolution.test.ts`, `loose-ends-llm.test.ts`, `reminders.test.ts`,
  `journal-ipc.test.ts`. AC4 → `loose-ends-once.test.ts` "journal:get for one day does not re-derive
  the history". AC5 → `loose-ends-once.test.ts` "the gardener check and the notifier read the same
  derivation" + `loose-ends-llm.test.ts` "the model stage reuses a passed derivation…". No manual
  residues.
- Review (default tier, per `Review: → default`): PASS, no findings, 0 fix cycles needed.

**Decisions:**

- **Identity-keyed `WeakMap`, not 054's `generation()`.** Verified directly in
  `src/core/index/service.ts`'s `update()`/`updateScoped()`: every state-changing refresh assigns a
  fresh `VaultIndex` object to `this.current`, and `updateScoped` returns early — leaving identity
  untouched — when nothing changed. The invariant "new object ⇒ maybe stale, needs recompute; same
  object ⇒ definitely same state" holds without needing `IndexService.generation()`, which is
  private and would have required a new public surface for no correctness gain (D1's own decision
  #2 was conditional on refresh mutating in place, which it does not).
- **`looseEndsDerived`'s parameter narrowed from `VaultIndex` to a local `{ docs, todos }` shape
  (`LooseEndIndexSource`, D3).** The gardener's `GardenerIndexData` (via `ctx.index.index()`) is
  structurally narrower than `VaultIndex` and doesn't carry `todos`; the derivation only ever reads
  `.docs` and `.todos`, so narrowing the parameter (rather than force-widening `GardenerIndexData`
  to the full `VaultIndex` shape) let both the overview and gardener call sites pass their real,
  identity-stable index objects without an unsound cast.
- **`GardenerIndexData` widened with `todos: readonly Todo[]`.** `IndexService` already returns an
  object with `todos` at runtime (`GardenerIndexView`'s own doc comment: "IndexService erfuellt es
  strukturell") — the interface just hadn't said so. No test fake needed hand-editing beyond the one
  hand-built fixture in `tests/core/gardener/checks-condensed.test.ts`.
- **`OverviewIndex.index()` widened from `{docs}` to full `VaultIndex` (D2).** Needed so
  `reminders()` hands `looseEndsDerived` the same object `IndexService` hands out elsewhere — a
  narrower copy would defeat the identity-keyed cache and silently reintroduce a recompute per call.

tiers: D 3 / hard 1 · review default · cycles 0 · agents 5


