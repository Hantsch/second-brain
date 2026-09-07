---
id: 070
title: A future mention becomes visible before its day arrives
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07): "if I write 'tomorrow I need to do X', there should be
a reminder somewhere that something is open, and that it belongs to that day" — asked for at the
moment of writing, not after the fact. Split out of [[069-a-day-shows-how-its-own-loose-ends-were-answered]]
as its own story since it needs a different mechanism, not just a different view.

Investigated the same day: `findLooseEnds()` (`src/core/journal/loose-ends.ts:362-405`) only
surfaces a forward-looking sentence once its target day has passed with no later entry addressing
it (`candidate.iso < today` at line 381) — the exact opposite of "as soon as it's written". The
model-augmented pass (`src/core/journal/loose-ends-llm.ts`) shares the same after-the-fact framing.
There is no code path today that reacts to a forward-looking mention at write time.

## Requirement

When a day's own text names a concrete future day or event, that mention should become visible as
an open, upcoming item right away — not only once its day has passed unaddressed. The existing
loose-end mechanism (open once overdue, closes when a later entry addresses it) stays as it is for
the retrospective case; this adds the missing forward-looking half.

## Acceptance Criteria

- [ ] **AC1** — After writing a sentence that names a concrete future day or event, an "upcoming"
      item becomes visible on both surfaces decided in refine — a dedicated dashboard tile and a
      badge on the calendar day the mention points to — naming the mention and the day it points to,
      before that day arrives.
- [ ] **AC2** — Once the target day is reached, the same item continues into the existing loose-end
      lifecycle (open if unaddressed, resolved once a later entry addresses it) rather than existing
      as a second, disconnected mechanism.
- [ ] **AC3** — The baseline detection works with no model configured, reusing the existing
      heuristic date/forward-reference machinery (`findDates`/`isForward`); a model-augmented pass
      may extend it the same way it already does for the retrospective case, but is not required for
      the feature to work.

## Open Questions

- ~~Where does the "upcoming" item live — its own small dashboard section, a badge on the calendar
  day it points to, both?~~ answered → Decisions (Sprint)
- ~~Does this stay a visibly separate "upcoming" bucket, or fold into the same tile as today's
  loose ends?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Placement: both — a dedicated small dashboard section and a badge on the calendar day
  it points to.
- **(User)** Bucket: keep upcoming mentions visibly separate from today's loose ends, consistent
  with M8's split of loose ends from waiting-on.

Taken in refine (2026-09-07), each against the ACs, the linked stories, M15 and CLAUDE.md:

- **Mechanism — one scan, two date windows.** The candidate enumeration in `loose-ends.ts` (after
  069 that is its exported `announcementsOf(source, today)`, before 069 the inner loop of
  `findLooseEnds`) gets its date window as a parameter; `findUpcomingMentions()` reuses it with the
  opposite window. A second scanner would be a second truth that drifts — 020 says exactly this
  about the model pass.
- **Handover boundary:** upcoming covers `refDate >= today` (target day inclusive), loose ends keep
  `refDate < today` — disjoint, so there is neither a duplicate row nor a day on which the mention
  vanishes (AC2).
- **Same identity across the boundary:** the reminder id stays `idFor('loose-end', looseEndId(day,
quote))`. That makes AC2's "same item continues" literal and provable in one test, and lets a
  snooze survive the switch.
- **Days scanned:** `date <= today`, so a sentence written today counts immediately — the story's
  whole point. Day files dated in the future are not scanned.
- **Transport:** no new IPC channel — upcoming mentions ride the existing `reminders:list` as a new
  `ReminderSource` `'upcoming-mention'`, exactly how loose ends already reach the dashboard, and
  `reminders` is a vault-dependent query root (`lib/queries/keys.ts`), so the refresh right after
  the write comes for free.
- **Same subtraction:** `settledCheck` is reused unchanged — an announcement already carried by a
  dated todo, or picked up by a later day, is not nagged twice on a second surface.
- **Horizon:** bounded by the existing `deadlineHorizonDays` limit — a mention two years out is not
  a reminder, and this needs no new setting.
- **Urgency:** always `'upcoming'`, never `'today'`/`'overdue'` — keeps `DaySummary`'s "due today"
  count and `DeadlinesTile`'s source filter untouched.
- **Tile visible by default** (`sm`, after `gardener`): a hidden tile is not the "reminder somewhere"
  the feedback asked for. Accepts one more visible module against the two-screen budget noted in
  `shared/types/overview.ts`.
- **Tile is read-only** (jump to the announcing day, target day shown), no `SnoozeMenu`: snoozing
  something before its day has no meaning — the snooze exists once it is a loose end.
- **Badge sits on the day pointed at** (`refDate`), with its own shape plus a suffix in the cell's
  accessible name — no color-only status, `MonthCalendar`'s own rule — and it renders on future,
  file-less days too, which is exactly the case this story is about.
- **No model pass:** AC3 calls it optional, so `loose-ends-llm.ts` and the gardener's loose-end
  check stay untouched and the retrospective case is unchanged.
- **Nothing is written:** the mention stays derived (index → reminders → view). No write path in
  this story, consistent with "the index is derived".
- **Scope fence to [[069-a-day-shows-how-its-own-loose-ends-were-answered]]:** 070 adds no
  read-time indicator on the announcing day, and touches neither `src/main/ipc/journal.ts` nor
  069's new `journal-loose-ends.ts`. The only file both stories edit is `loose-ends.ts` — 069
  builds first, so D1 here extends what 069 left behind instead of re-extracting it.
- **e2e writes through the real surface:** the harness has no per-spec vault authoring
  (`scripts/lib/app-harness.mjs` seeds a fixed demo vault), so the spec types the sentence into
  `#sb-day-field` and saves — which is the user action AC1 describes anyway.

## Plan

Core detection first, then the two surfaces, then the flow test. No new IPC channel, no write path.
Builds after 069, which touches `loose-ends.ts` first.

1. **`src/core/journal/loose-ends.ts`** — give the candidate enumeration its date window as a
   parameter (`inWindow(dayIso, candidateIso, today)`), leaving every existing caller's behaviour
   byte-identical: same ids, same line numbers, same ordering, same `settled` subtraction.
   `tests/core/journal/loose-ends.test.ts` and `loose-ends-llm.test.ts` stay green unchanged.
2. **`src/core/journal/upcoming-mentions.ts`** (new, small) — `findUpcomingMentions(days, todos,
today, horizonDays)`: days with `date <= today`, window `candidate > day && candidate >= today`
   and within the horizon, same `settledCheck`, same `looseEndId`. Exported via
   `src/core/journal/index.ts`; `UpcomingMention` alias plus a corrected `refDate` doc comment in
   `src/shared/types/domain.ts`.
3. **`src/core/overview/reminders.ts`** — `fromUpcomingMentions()` next to `fromLooseEnds()`, same
   `looseEndDaysOf()` input, `source: 'upcoming-mention'`, `urgency: 'upcoming'`, id unchanged;
   wired into `reminders()` with `deadlineHorizonDays`. New source value in
   `src/shared/types/overview.ts`.
4. **Dashboard tile** — `UpcomingMentionsTile.tsx` mirroring `LooseEndsTile.tsx` minus the snooze
   menu; new module id in `DashboardModuleId` / `DASHBOARD_MODULES` / `DEFAULT_DASHBOARD_TILES`,
   registered in `screens/dashboard/tiles.tsx`, strings in `i18n/{en,de}-dashboard.ts`.
   `tests/main/dashboard-ipc.test.ts:166` counts the modules — 14 becomes 15.
5. **Calendar badge** — `upcoming: boolean` on `Cell` in `lib/month-calendar.ts` (from a new
   `upcoming: ReadonlySet<string>` argument to `monthCells`), marker plus accessible-name suffix in
   `components/MonthCalendar.tsx`, its shape in `styles/app/journal-calendar.css`, strings in
   `i18n/{en,de}-journal-calendar.ts`. `JournalScreen.tsx` builds the set from `useReminders()`
   filtered on `source === 'upcoming-mention'`.
6. **e2e** — `tests/e2e/upcoming-mention.spec.ts`: type a sentence with an explicit future date
   into today's field, save, then assert the calendar badge on that day and the tile row on the
   dashboard.

Order: 1 → 2 → 3, then 4 and 5 independently, 6 last (needs both surfaces).

## Deliverables

- **D1 — The forward scan, two windows.** Parameterize the window of the candidate enumeration in
  `src/core/journal/loose-ends.ts`, add `src/core/journal/upcoming-mentions.ts` and its export in
  `src/core/journal/index.ts`, plus the `UpcomingMention` alias in `src/shared/types/domain.ts`.
  Mirror: `findLooseEnds` in the same file. Acceptance: `tests/core/journal/loose-ends.test.ts` and
  `loose-ends-llm.test.ts` pass untouched; new `tests/core/journal/upcoming-mentions.test.ts` covers
  a dated announcement found without a model, the target-day-inclusive boundary against
  `findLooseEnds`, the horizon cut-off, the `settledCheck` subtraction, and id equality with the
  loose end the same sentence becomes a day later. Fixtures: `tests/core/journal/fixtures.ts`.
- **D2 — Upcoming mentions become reminders.** `fromUpcomingMentions()` in
  `src/core/overview/reminders.ts`, `'upcoming-mention'` in `ReminderSource`
  (`src/shared/types/overview.ts`). Mirror: `fromLooseEnds` in the same file. Acceptance: new cases
  in `tests/core/overview/reminders.test.ts` — a mention for a coming day appears as
  `source: 'upcoming-mention'` with `urgency: 'upcoming'` and its target day as `date`; the same
  mention one day later appears as `source: 'loose-end'` **with the same id**; the two never appear
  at once; a mention beyond `deadlineHorizonDays` does not appear at all.
- **D3 — The dashboard tile.** `src/renderer/components/tiles/UpcomingMentionsTile.tsx`, the module
  id in `src/shared/types/overview.ts` (three lists), registration in
  `src/renderer/screens/dashboard/tiles.tsx`, strings in `src/renderer/i18n/en-dashboard.ts` and
  `de-dashboard.ts`, the module count in `tests/main/dashboard-ipc.test.ts`. Mirror:
  `LooseEndsTile.tsx`. Acceptance: new cases in `tests/renderer/dashboard.test.tsx` (with
  `dashboard-fixtures.ts`) — the tile lists a mention with its target day and links to the
  announcing day, and shows its empty state when there is none; `tests/renderer/i18n.test.ts`
  (de/en key parity) stays green.
- **D4 — The calendar badge.** `src/renderer/lib/month-calendar.ts`,
  `src/renderer/components/MonthCalendar.tsx`, `src/renderer/styles/app/journal-calendar.css`,
  `src/renderer/i18n/en-journal-calendar.ts` + `de-journal-calendar.ts`,
  `src/renderer/screens/journal/JournalScreen.tsx`. Mirror: the `unfinished` flag end to end, from
  `monthCells` to `.sb-monthcal-unfinished`. Acceptance: new cases in
  `tests/renderer/journal-calendar.test.tsx` — the day a mention points to carries the marker and
  names it in the cell's accessible name, a future day without a file carries it too, a padding cell
  never does.
- **D5 — The flow, through the real app.** `tests/e2e/upcoming-mention.spec.ts` (mirror:
  `tests/e2e/journal-close.spec.ts`, fixtures `tests/e2e/fixtures/vault.ts`). Acceptance: on the
  no-model demo vault, typing a sentence with an explicit future date into `#sb-day-field` and
  saving it makes (a) the badge appear on that calendar day and (b) the row appear in the
  upcoming-mentions tile on the dashboard — with no model configured and no network call
  (`withoutKeyEnv`, `noNetworkCalls`).

## Model Hints

- `D1 → deliverable-hard` — it reaches into the inner loop of `findLooseEnds`, the most-tested
  heuristic in the journal core and shared with the gardener check, the interview and the reminders:
  an off-by-one in the date window, a shifted `subjectWords` offset or a changed id would silently
  break story 020's loose ends, and 069 will have just edited the same function.
- D2, D3, D4, D5 → default.
- `Review: → default` — after D1 the remaining surface is additive (one reminder source, one tile,
  one calendar flag), with no write path and no new IPC channel.

## Acceptance Tests

- AC1 → e2e `tests/e2e/upcoming-mention.spec.ts` › "a sentence about a coming day shows up as
  upcoming on the dashboard and on the calendar day it points to" (D5)
- AC2 → unit `tests/core/overview/reminders.test.ts` › "the same mention keeps its id: upcoming
  before its day, loose end after it" (D2), plus unit
  `tests/core/journal/upcoming-mentions.test.ts` › "the target day itself is still upcoming, the day
  after it is a loose end" (D1)
- AC3 → unit `tests/core/journal/upcoming-mentions.test.ts` › "finds a dated announcement with no
  model and no gateway in sight" (D1); the e2e spec of AC1 runs the same path on a vault without a
  configured model, so the no-model case is proven on the real surface as well

Coverage gate: AC1 → D5 (e2e, real surface), AC2 → D2 + D1, AC3 → D1 (plus D5's no-model run).
No manual residue.
