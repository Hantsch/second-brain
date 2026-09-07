---
id: 069
title: A day shows how its own loose ends were answered
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07), describing a confusing moment: a correctly shown
follow-up (a loose end from an earlier day — "we're meeting Michi today") was answered, but the
answer landed on today's day, not on the day the meeting itself belonged to. Opening that earlier
day still shows nothing about it having been dealt with.

Investigated the same day: this is by design, not a bug — `answerLooseEnd()`
(`src/core/journal/loose-end-answer.ts:40-52`) always writes the answer into **today's** entry
with a `[[<announcingDay>]]` backlink, a decision recorded under M6
(`requirements/done/020-journal-loose-ends.md`). What is missing is the other direction: the
announcing day itself has no view of what happened to the loose end it raised — the resolution is
findable only if you already know which later day answered it.

## Requirement

Opening a day that raised a loose end should show, on that day, whether and how it was resolved —
without needing to already know which later day holds the answer. The answer keeps living in the
entry that actually wrote it (M6's decision is unchanged); this story only makes that resolution
visible from the day it belongs to, as a derived, read-only pointer.

## Acceptance Criteria

- [x] **AC1** — A day that raised a loose end which has since been answered shows, next to that
      loose end, that it was answered and links to the day/entry that answered it.
- [x] **AC2** — This indicator is derived at read time, not written into the announcing day's file —
      no write path in this story touches the original day's content (consistent with "the files
      are the truth" and no silent overwrite).
- [x] **AC3** — A loose end raised on a day that has not yet been answered shows as open on that
      day, consistent with how it already appears on the maintenance/loose-ends surface today.

## Open Questions

- ~~Where does the indicator sit — inline next to the day's own loose-end row, a small banner on
  the day view, or both?~~ answered → Decisions (Sprint)
- The user's feedback also named a second, separate want: a proactive reminder at the moment a
  forward-looking sentence is written (before its day arrives), rather than only after the day has
  passed. That is a materially different mechanism (write-time detection vs. read-time visibility)
  from what this story covers — tracked as its own story, [[070-a-future-mention-becomes-visible-before-its-day-arrives]],
  not folded into this one.

## Decisions (Sprint)

- **(User)** Indicator placement: inline next to the day's own loose-end row (not a banner).
- **One truth for "already answered"**: `isAnswered`/`settledCheck` in `loose-ends.ts` becomes a
  verdict-returning `resolutionCheck()`, with `settledCheck` kept as a thin boolean facade — a
  second implementation of "is it settled" would be a second truth that drifts (020 says exactly
  this about the model pass).
- **Candidate enumeration is extracted, not duplicated**: the announcement scan inside
  `findLooseEnds` becomes an exported `announcementsOf()`, so the day view can see _settled_
  candidates too while `findLooseEnds` keeps returning exactly what maintenance, reminders and the
  interview get today.
- **Resolution order — vault first, state file second**: the answering day is read off the files (a
  later day linking `[[<day>]]` and picking the subject back up); the explicit record in
  `.secondbrain/loose-ends.json` only adds answers whose wording does not repeat the subject
  ("Erledigt."). Losing `.secondbrain/` degrades a row to "open", never to a wrong claim.
- **The link points at the answering day, not the answering line**: the app has no per-entry anchor
  today, so the pointer is `/journal?d=<answering day>` via `navigate` — the pattern
  `components/tiles/LooseEndsTile.tsx:82` already uses.
- **An announcement settled only through the dated-todo branch stays invisible on the day**
  (unchanged): it is chased on the todo list, and a third state ("has a todo") is outside AC1-AC3.
- **Dismissed / snoozed loose ends stay invisible on the day view** (unchanged) — AC3 asks for
  consistency with the maintenance surface as it behaves today, not for a new state.
- **The time window is untouched**: a candidate still needs `refDate` strictly between its own day
  and today. A mention before its day arrives is
  [[070-a-future-mention-becomes-visible-before-its-day-arrives]], deliberately not folded in here.
- **A new wire shape instead of overloading the interview's**: `JournalDayLooseEnd` in
  `src/shared/ipc.ts`; `JournalInterviewLooseEnd` stays as it is, because neither the interview nor
  the answer write path needs a resolution field.
- **Main-side composition gets its own module** (`src/main/ipc/journal-loose-ends.ts`):
  `src/main/ipc/journal.ts` is at 428 lines, already past CLAUDE.md's ~300-line soft limit.
- **No seed change for the acceptance test**: `scripts/seed/journal.mjs` already seeds both halves
  (day -12 announces "Morgen bin ich beim Notar.", day -10 answers it with a `[[-12]]` backlink)
  plus an unanswered one (day -3, the dentist), so the read-only e2e vault fixture is enough.

## Plan

The gap is precise: `journal:get` (`src/main/ipc/journal.ts:204-212`) serves the day view from
`openLooseEnds()`, which only ever yields _open_ items — an answered loose end is already dropped
inside `findLooseEnds` (step 4, `settled(...) continue`, `src/core/journal/loose-ends.ts`) or
filtered out by `answeredIds()`. So the announcing day sees nothing at all once its loose end is
resolved. Fix: derive the day's announcements _including_ the settled ones, and attach where the
answer landed.

1. **Core, one truth** (`src/core/journal/loose-ends.ts`): extract the per-day announcement scan out
   of `findLooseEnds` into an exported `announcementsOf(source, today)` (same rule, same ids, no
   behaviour change for existing callers) and turn `isAnswered` into a verdict:
   `resolutionCheck(days, todos)` → `{ by: 'day', date, path } | { by: 'todo' } | null`.
   `settledCheck` stays exported as the boolean wrapper the model pass uses.
2. **Core, day-scoped derivation** (new `src/core/journal/loose-end-resolution.ts`):
   `dayLooseEnds(days, todos, today, date, answered)` → that day's announcements, oldest first, each
   with `resolution: { day, path } | null`. `answered` is a plain `ReadonlyMap<id, path>` parameter
   so core stays pure and Electron-free; a read, no store, no clock.
3. **IPC contract** (`src/shared/ipc.ts`): `JournalDayLooseEnd = { id, day, quote, resolution }`;
   `JournalDayView.looseEnds` switches to it.
4. **Main composition** (new `src/main/ipc/journal-loose-ends.ts`): open items keep coming from the
   untouched `openLooseEnds()` (AC3), resolved ones from `dayLooseEnds`, fed with the `LooseEndState`
   records (`findingId('loose-end', ...)` prefix mapping, `baseName` for the answering date).
   `journal:get` returns the union — a candidate is either open or resolved, never both.
5. **Renderer** (`src/renderer/screens/journal/LooseEndRow.tsx`, `JournalScreen.tsx`): a resolved row
   renders inline in place of the answer field — the quote plus one line "Answered on <date>" as a
   link to `/journal?d=<date>`. New keys under `journal.looseEnd.*` in `i18n/de-journal.ts` /
   `en-journal.ts` (German with `„…“`).
6. **Acceptance on the real surface**: one e2e spec drives the seeded pair (day -12 / day -10) and
   the seeded open one (day -3), and asserts the announcing day's file is byte-identical before and
   after (AC2).

Order: 1 → 2 → 3+4 → 5+6. The write side is not touched; M6's decision (the answer lives in the day
that wrote it) stays as it is.

## Deliverables

- [x] **D1 — Core: verdict instead of a boolean, scan extracted.**
  `src/core/journal/loose-ends.ts`: exported `announcementsOf(source, today)` (used by
  `findLooseEnds` itself, so the rule exists once), `resolutionCheck()` returning the verdict,
  `settledCheck()` as its boolean wrapper. Acceptance: `tests/core/journal/loose-ends.test.ts` and
  `tests/core/journal/loose-ends-llm.test.ts` green unchanged (no behaviour drift), plus new cases
  in `tests/core/journal/loose-ends.test.ts` proving the verdict names the answering day for the
  link branch and reports `{ by: 'todo' }` for the dated-todo branch.
- [x] **D2 — Core: a day's loose ends with their resolution.**
  New `src/core/journal/loose-end-resolution.ts`, exported via `src/core/journal/index.ts`;
  `dayLooseEnds(days, todos, today, date, answered)`, mirroring `loose-ends.ts#findLooseEnds` in
  shape (pure, `today` handed in, no clock). Acceptance: new
  `tests/core/journal/loose-end-resolution.test.ts` — an answer on a later day yields
  `resolution.day` = that day; an unanswered announcement yields `null`; an `answered` map entry
  resolves a case the heuristic misses ("Erledigt."); a todo-settled announcement is not listed; the
  function takes no store, so it cannot write.
- [x] **D3 — Wire it up: contract plus main.**
  `src/shared/ipc.ts` (`JournalDayLooseEnd`, `JournalDayView.looseEnds`), new
  `src/main/ipc/journal-loose-ends.ts`, `journal:get` in `src/main/ipc/journal.ts`; mirror
  `src/main/ipc/journal.ts#openLooseEnds` for the state/gardener plumbing. Acceptance: new cases in
  `tests/main/journal-ipc.test.ts` — `journal:get` on the announcing day returns the loose end with
  `resolution.day` = the answering day, a still-open day returns `resolution: null`, and the
  announcing day's file hash is unchanged after the call.
- [x] **D4 — Renderer: the resolved row, plus the acceptance flow.**
  `src/renderer/screens/journal/LooseEndRow.tsx`, `src/renderer/screens/journal/JournalScreen.tsx`,
  `src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`, plus a gaston class in
  `src/renderer/styles/gaston/components.css` if a new one is needed (tokens only, no raw Tailwind
  palette); mirror `src/renderer/components/tiles/LooseEndsTile.tsx:82` for the day navigation.
  Acceptance: the new `tests/e2e/journal-loose-end-resolution.spec.ts` below is green, and
  `npm run shot` shows the resolved row inline on the announcing day.

## Model Hints

- `D1 → deliverable-hard` — it rewrites the shared "is it settled" heuristic that `findLooseEnds`,
  `loose-ends-llm.ts`, the reminders list and the maintenance report all read; a drift there
  silently changes what the gardener reports, and no test in this story would catch that on its own.
- D2, D3, D4 → default tier: new, additive code along an existing pattern.
- `Review: → default` — the one risky piece is a single deliverable, the rest is additive read-time
  plumbing with its own tests; a spec-vs-diff review at the cheap tier is enough.

## Acceptance Tests

- AC1 → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "an answered loose end shows its
  answer on the day that raised it" — opens the seeded announcing day (offset -12), asserts the row
  shows as answered and that its link opens the answering day (offset -10). Unit backing:
  `tests/core/journal/loose-end-resolution.test.ts` › "an answer on a later day resolves the
  announcement" and `tests/main/journal-ipc.test.ts` › "journal:get reports the answering day".
- AC2 → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "the announcing day's file is not
  touched" — `vault.snapshot()` of the announcing day byte-identical before and after opening it;
  plus `tests/core/journal/loose-end-resolution.test.ts` › "the derivation takes no store and writes
  nothing" and the unchanged-hash assertion in `tests/main/journal-ipc.test.ts` › "journal:get
  reports the answering day".
- AC3 → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "an unanswered loose end still shows
  as open" — opens the seeded day -3 (dentist) and asserts the open row with its answer field is
  there, the same item the maintenance surface lists. Unit backing:
  `tests/core/journal/loose-end-resolution.test.ts` › "an unanswered announcement has no
  resolution".

Coverage gate: AC1 → D2/D3/D4, AC3 → D2/D3/D4, AC2 → D2 (pure derivation) + D3 (no write) + D4's
byte comparison in the e2e spec. No manual residue.

The mapping above matched what was actually written — no test ended up placed differently than
planned.

## Done

Built the read-time "answered from here" view of a loose end: `resolutionCheck()` in
`src/core/journal/loose-ends.ts` (D1, extracted from the former boolean `isAnswered`, with
`announcementsOf()` pulled out of `findLooseEnds` so the scan exists once), the new pure
`dayLooseEnds()` in `src/core/journal/loose-end-resolution.ts` (D2), the `JournalDayLooseEnd`
wire shape plus `src/main/ipc/journal-loose-ends.ts` composing open and resolved loose ends for
`journal:get` (D3), and the inline resolved row in `LooseEndRow.tsx` with new
`journal.looseEnd.*` i18n keys (D4). The write side (M6, `answerLooseEnd()`) is untouched — the
answer still lands on the day it was written on; this story only makes that fact visible from the
day that raised the question.

Commit message: `069: a day shows how its own loose ends were answered`

### Verification

- `npm run build` — green.
- `npm test` — 255 files / 3619 tests passed (includes the new
  `tests/core/journal/loose-end-resolution.test.ts` and the new cases in
  `tests/core/journal/loose-ends.test.ts` and `tests/main/journal-ipc.test.ts`).
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run format:check` — pre-existing, repo-wide failures (242 files) unrelated to this story;
  none of the files this story touched or added appear in that list, confirmed by grepping the
  warning output for every changed/new path. Not caused by 069, not fixed by 069 either (out of
  scope — a repo-wide formatting pass is its own story).
- `npm run test:e2e` — 12/12 passed, including the new `journal-loose-end-resolution.spec.ts`
  (3/3) and the pre-existing suite (068's `journal-reopen.spec.ts` included), so nothing on the
  shared journal surface regressed.
- Code review (clean agent, default tier per `Review: → default`): verdict **PASS**. Two
  findings were stale doc comments referencing the old `isAnswered` name / an outdated
  "already filtered to open" claim — fixed directly (`JournalScreen.tsx`,
  `tests/core/journal/loose-end-answer.test.ts`), re-verified green (lint, typecheck, prettier,
  the two affected test files). A third finding — a dismissed/snoozed loose end that later gets
  vault- or state-file-resolved would still render as a resolved row, since `journalDayLooseEnds`
  only filters dismissed/snoozed out of the *open* list — was left unfixed: the story's own
  Decisions section scopes "dismissed/snoozed stay invisible" explicitly to AC3's open state
  ("not for a new state"), so extending that filter to the new resolved state is a policy call
  outside this story's ACs, not a defect in what was asked for.

### AC → test mapping, as verified

- **AC1** → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "an answered loose end shows
  its answer on the day that raised it" — passed. Unit backing:
  `tests/core/journal/loose-end-resolution.test.ts` › "an answer on a later day resolves the
  announcement" and `tests/main/journal-ipc.test.ts` (new case, `resolution.day` = answering
  day) — passed.
- **AC2** → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "the announcing day's file is
  not touched" (byte-identical snapshot) — passed. Plus
  `tests/core/journal/loose-end-resolution.test.ts` › "the derivation takes no store and writes
  nothing" and the unchanged-hash assertion in `tests/main/journal-ipc.test.ts` — passed.
- **AC3** → e2e `tests/e2e/journal-loose-end-resolution.spec.ts` › "an unanswered loose end
  still shows as open" — passed. Unit backing: `tests/core/journal/loose-end-resolution.test.ts`
  › "an unanswered announcement has no resolution" — passed.
- No manual residue.

### Decisions

- Fixed two stale doc comments the review found (D1's rename, D4's row-filter description) —
  documentation only, no behaviour change, re-verified.
- Left the dismissed/snoozed-resolved-row edge case unfixed, per the reasoning above — a future
  story's call, not this one's.
- `src/core/journal/loose-ends.ts` (≈489 lines) and `src/main/ipc/journal.ts` (≈478 lines) both
  stay over CLAUDE.md's ~300-line soft limit; both were already over or close to it before this
  story (D1/D3 grew them further while extracting `announcementsOf`/`journal-loose-ends.ts` to
  keep `journal.ts` from growing even more). Flagged, not addressed — a dedicated split is out
  of scope for a read-time feature story.
