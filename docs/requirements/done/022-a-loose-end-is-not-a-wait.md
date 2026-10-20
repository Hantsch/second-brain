---
id: 022
title: A loose end is its own thing, not a wait
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

My dashboard currently tells me I am waiting on **"vormittag ruhig lost vereinzelt paar
fragen"**, announced on 13 Aug. I am not waiting on anything of the sort. That row is a
loose end from my journal of 12 Aug, and it is wrong in three separate ways at once: it is
in the wrong tile, it is named after the wrong half of a sentence, and it should have been
settled days ago.

### 1. "Waiting on" answers a different question

"Waiting on" means **someone else owes me something** — Legal owes me a release, Thomas owes
me "Auth0 done". That is the third question of this app, and it is a question about other
people. A loose end is the opposite: **I** announced something, the day came, and I never
said how it went. Nobody owes me anything there.

Mixing them costs me the tile. Its count and its "1 overdue" badge are supposed to tell me
how much other people are blocking me; with loose ends folded in, the number answers no
question I actually have. The mixing sits entirely in the renderer
([WaitingOnTile.tsx:83-142](../../src/renderer/components/tiles/WaitingOnTile.tsx#L83-L142)),
which pulls `source === 'loose-end'` reminders in as extra rows. The core already keeps the
two apart: `waitingOn` comes from a project's `waiting_on` frontmatter, a loose end is its
own reminder source and its own maintenance finding kind.

### 2. There is nowhere else it belongs

Take it out of "waiting on" and it has no home on the dashboard — only the maintenance screen
would still list it, and that is the screen I open when I care about the archive, not when I
plan my day. It also has no trace **in the journal**, which is where it came from: I open
12 Aug and nothing on that day says "you announced something for the 13th and never came
back to it". The day it belongs to is the one place I would notice it without being told.

### 3. It is named after the wrong clause, and that also breaks "settled"

The row's title is the loose end's `subject`, and the subject is the first six content words
of the sentence ([loose-ends.ts:203-213](../../src/core/journal/loose-ends.ts#L203-L213)). My
paragraph carries no full stops, so `sentencesOf` correctly keeps the soft line break together
and hands over both lines as one sentence — the announcement ("fahr dann morgen so um zwei")
sits at the end, the subject gets taken from the beginning. Hence "vormittag ruhig lost
vereinzelt paar fragen".

The same wrong words then defeat the subtraction that should have removed the row entirely:
the settled check wants **every** subject term to appear in a dated todo
([loose-ends.ts:247-262](../../src/core/journal/loose-ends.ts#L247-L262)), and my todo
`Nach Mondsee fahren @due:2026-08-13 @done:2026-08-20` — which is exactly the announcement,
kept and done — matches none of them. So a loose end I closed a week ago still nags me, under
a name that means nothing.

One more thing about the red: the reminder is built with `urgency: 'overdue'` unconditionally
([reminders.ts:246](../../src/core/overview/reminders.ts#L246)). An announcement whose day
passed yesterday reads as urgently as a deadline I blew through — and by this app's own rule
("nothing invented"), it is not a deadline at all.

None of this may cost me the identity of a loose end: the id is shared with the maintenance
finding (`loose-end:<id>`), and my "answered", "dismissed" and "snoozed" hang on it. A loose
end must not come back from the dead because its wording was re-derived.

## Acceptance Criteria

- [x] "Waiting on" shows only entries where someone or something owes me an answer — no loose
      ends, and its count and overdue badge are computed over those entries alone.
- [x] A loose end still reaches me on the dashboard, in a place of its own that names it as
      what it is (an announcement of mine without an outcome), not as a wait.
- [x] Opening the day the announcement was made shows the open loose end on that day, from
      the journal screen, without going to maintenance first.
- [x] The name of a loose end names what was announced. For my 12 Aug entry that means the
      Mondsee trip, not "vormittag ruhig lost vereinzelt paar fragen".
- [x] A loose end whose subject is carried by a dated todo does not appear — my
      `Nach Mondsee fahren @due:2026-08-13` case is gone from the dashboard.
- [x] A loose end that was already answered, dismissed or snoozed stays that way after this
      change — no reappearance because the wording or the id derivation moved.
- [x] A loose end is not presented as more urgent than it is: its display distinguishes "the
      announced day has passed" from a missed deadline.
- [x] All of it works without a model configured — the heuristic path alone produces the
      name, the subtraction and the display.
- [x] The same loose end still carries one identity across dashboard, journal and
      maintenance; answering it in one place removes it from the others.

## Open Questions

<!-- All resolved in refine on 2026-08-22. Answers below. -->

1. **Own dashboard module, or journal only?** → **Both, but the module ships hidden by
   default.** No existing tile gives up its slot. Note the deviation from the requester's
   preference: AC 2 is met by the module existing and being one checkbox away in the tile
   catalog, not by it being on screen on day one.
2. **Id stability vs. better naming.** → **The quote is untouched.** `sentencesOf` is not
   changed at all; only `subjectWords` changes. `looseEndId(day, quote)` therefore produces
   the same id as before for every existing announcement — no migration needed. This is a
   hard invariant of D1, not a nice-to-have.
3. **How is the subject found?** → **Only the naming fix, not the loosening.** The subject is
   taken from the words around the date reference instead of from the head of the sentence.
   The settled check keeps its strict "every term" rule: a narrower, more accurate subject
   makes that rule _easier_ to satisfy, which is exactly what the Mondsee case needs.
   Loosening it on top would silence real loose ends — deliberately not done.
4. **Does a loose end keep a red mark at all?** → **New `ReminderUrgency` value `'open'`.**
   Decided once in the shared type, so the desktop notification in `reminder-notify.ts` also
   stops treating an announcement like a blown deadline.
5. **What does the journal show, exactly?** → **A row above the stream on the day the
   announcement was made.** No calendar marker: `MonthCalendar` already carries a mood dot
   and an "unfinished day" mark, a third marker type competes for the same cell. The row is
   not a question, so it cannot double up with the interview's loose-end question (020 D8);
   both read the same answered-state and both disappear together.
6. **Split?** → **One story, six deliverables**, D1 first because both surfaces would
   otherwise render the same wrong name.

## Plan

**Order is strict: D1 → D2 → (D3, D4) → D5 → D6.**

_Core — the name and the subtraction (D1)_

- `src/core/capture/dates.ts`: `DateHit` gains `at` (the label's offset in the text). The
  value already exists internally on `RawHit`; it is only dropped on the way out.
- `src/core/journal/loose-ends.ts`: `subjectWords(sentence)` becomes
  `subjectWords(sentence, at)` and picks the content words **nearest the date label**
  (window around `at`, still capped at `MAX_SUBJECT_WORDS`, still in reading order),
  instead of the first six of the whole sentence. `NOISE` gains the spelled-out number
  words (`zwei`, `drei`, … / `two`, `three`, …) — a numeral never names a subject, which is
  already the rule for digit-carrying words.
- `sentencesOf`, `quote` and `looseEndId` are **not** touched (Q2).

_Shared — honest urgency (D2)_

- `ReminderUrgency` gains `'open'`; `fromLooseEnds` uses it instead of the hardcoded
  `'overdue'` ([reminders.ts:245](../../src/core/overview/reminders.ts#L245)). Consumers
  (`reminder-notify.ts`, `DeadlinesTile`, `DaySummary`) handle the new value explicitly.

_Dashboard (D3, D4)_

- `WaitingOnTile` loses its loose-end rows and computes count + overdue over `waitingOn`
  entries alone.
- New `LooseEndsTile`, registered in `MODULE_META` / `TILES` / `DEFAULT_DASHBOARD_TILES`
  with `hidden: true`. Rows are read-only handles: subject, day announced, announced-for
  date, snooze, and a link into the journal day — answering happens in the journal (D6).

_Journal (D5, D6)_

- `JournalDayView` gains the day's open loose ends, served by reusing the existing
  `openLooseEnds()` in [ipc/journal.ts:136](../../src/main/ipc/journal.ts#L136) filtered to
  that day — one source of truth for "open", so answered/dismissed/snoozed already applies.
- `JournalScreen` renders a row above `EntryStream` with the announcement and an answer
  action, reusing `mutations.answerLooseEnd` the way
  [InterviewDialog.tsx:146-157](../../src/renderer/screens/journal/InterviewDialog.tsx#L146-L157)
  does.

No LLM anywhere in this story — every new path is the heuristic one.

## Deliverables

**D1 — The subject names what was announced.** _(core only)_

- `src/core/capture/dates.ts` — expose `at` on `DateHit`.
- `src/core/journal/loose-ends.ts` — `subjectWords(sentence, at)`, number words into
  `NOISE`, `findLooseEnds` passes `hit.at`.
- `tests/core/journal/loose-ends.test.ts`, `tests/core/capture/dates.test.ts`.

Acceptance: for every existing fixture the produced `quote` and `id` are byte-identical to
before (a snapshot/explicit assertion, this is the id-stability guard). A new fixture in the
shape of the 12 Aug entry — a paragraph with a soft line break whose announcement sits at
the end — yields a subject from the announcement clause, not from the opening words. With a
dated todo carrying that announcement, the same fixture produces no loose end at all.
`subjectTerms` keeps its exported signature.

**D2 — A loose end is open, not overdue.** _(shared + core + thin renderer touch)_

- `src/shared/types/overview.ts` — `'open'` in `ReminderUrgency`.
- `src/core/overview/reminders.ts` — `fromLooseEnds` uses `'open'`.
- `src/main/reminder-notify.ts` — `'open'` does not fire a deadline-grade notification.
- `src/renderer/components/tiles/DeadlinesTile.tsx`,
  `src/renderer/screens/dashboard/DaySummary.tsx` — handle `'open'` (no red urgency style).
- `src/renderer/i18n/de-dashboard.ts` / `en-dashboard.ts` — label for `'open'`.
- Tests: reminders unit test asserts `urgency: 'open'` for a loose end.

Acceptance: no `switch`/map over `ReminderUrgency` is left non-exhaustive (typecheck
proves it), and nothing renders a loose end in the overdue colour.

**D3 — "Waiting on" is waits only.** _(renderer only)_

- `src/renderer/components/tiles/WaitingOnTile.tsx` — remove the `source === 'loose-end'`
  filter (line 90) and the loose-end rows (lines 114-155); `total` and `overdue` over
  `entries` alone.
- `src/renderer/i18n/de-dashboard.ts` / `en-dashboard.ts` — drop `tile.waiting.looseEnd`.

Acceptance: the tile no longer calls `useReminders()` for loose ends; count and overdue
badge equal the number of `waitingOn` entries resp. the late ones among them.

**D4 — A loose ends module of its own.** _(renderer only)_

- New `src/renderer/components/tiles/LooseEndsTile.tsx` — mirror
  `src/renderer/components/tiles/AskTile.tsx` for the frame and
  `DeadlinesTile.tsx` for the reminder list + snooze pattern.
- `src/renderer/components/tiles/modules.ts` — `MODULE_META` entry.
- `src/renderer/screens/dashboard/tiles.tsx` — `TILES` map entry.
- `src/shared/types/overview.ts` — `DEFAULT_DASHBOARD_TILES` entry
  `{ id: 'loose-ends', size: 'sm', hidden: true }`.
- `src/renderer/i18n/de-dashboard.ts` / `en-dashboard.ts` — `module.loose-ends.name`,
  `.purpose`, `tile.looseEnds.*`.

Acceptance: the module appears in the tile catalog, is off by default, and once switched on
lists the open loose ends — each naming itself as an announcement without an outcome, with
the announced-for date and a link to that journal day. Gaston tokens only, sentence case,
no emoji.

**D5 — The day view knows its loose ends.** _(main + shared)_

- `src/shared/ipc.ts` — `JournalDayView` gains `looseEnds` (reuse the existing
  `JournalInterviewLooseEnd` shape rather than inventing a second one).
- `src/main/ipc/journal.ts` — `journal:get` fills it from `openLooseEnds()` filtered to the
  requested day.
- Tests: an ipc/journal test that a day with an unanswered announcement carries it, and an
  answered/dismissed one carries none.

Acceptance: no second implementation of "open" — the answered / gardener-dismissed /
snoozed filtering is the existing one, so the ids match the dashboard and maintenance ids.

**D6 — The day shows its loose end.** _(renderer only)_

- New `src/renderer/screens/journal/LooseEndRow.tsx` (small, one row per loose end).
- `src/renderer/screens/journal/JournalScreen.tsx` — render it above `EntryStream`.
- `src/renderer/i18n/de-journal.ts` / `en-journal.ts` (or the journal keys' actual home) —
  row label and answer action.

Acceptance: opening the day of the announcement shows the row without going through
maintenance; answering it there makes it vanish from the row, the dashboard module and the
maintenance report on the next read.

**Coverage** — AC 1 → D3 · AC 2 → D4 (module exists, off by default per Q1) · AC 3 → D5 + D6
· AC 4 → D1 · AC 5 → D1 · AC 6 → D1 (quote and id untouched) · AC 7 → D2 · AC 8 → D1 (no new
LLM path anywhere in this story) · AC 9 → D5 + D6 (shared id, one filtering implementation).

## Model Hints

- **D1 → `deliverable-hard`.** Risk: `subjectWords` feeds both the displayed name _and_
  `subjectTerms`, which drives the settled subtraction — a wrong window silently either
  resurrects loose ends the user already closed or swallows open ones, and any accidental
  change to `sentencesOf`/`quote` moves every `looseEndId` and detaches the user's stored
  "answered"/"dismissed" state in three separate state files.
- D2, D3, D4, D5, D6 → default.
- **Review: → `story-review-hard`.** Risk: the id-stability invariant spans
  `core/journal`, `core/overview`, `core/gardener` and three `main/*-state.ts` files; a
  reviewer that only reads the diff of one D cannot see that the same announcement still
  carries one identity across dashboard, journal and maintenance (AC 6, AC 9).

## Test Plan (manual acceptance)

Prerequisite: a vault whose journal contains the 12 Aug entry (the real vault, not
`.demo-vault`, because the wording is what is being fixed).

1. Start the app (`npm run dev`), open **Dashboard**.
   - "Waiting on" no longer lists `vormittag ruhig lost vereinzelt paar fragen`; its count
     and its overdue badge count only entries where someone owes you something.
2. Open the tile catalog on the dashboard, switch on **Loose ends**.
   - The module appears. The 12 Aug announcement is either absent (because the dated
     `Nach Mondsee fahren` todo settles it — the expected outcome) or, if present, named
     after the trip, dated "announced for 13 Aug", and **not** in the overdue colour.
3. Add a fresh test announcement to a past journal day via the journal composer (e.g. an
   entry on an earlier day saying you will do something "morgen"), with no matching todo.
   - It shows up in the loose ends module, named after the announcement clause.
4. Open that day in **Journal**.
   - A row above the stream names the open announcement. Answer it there.
   - The row disappears; the loose ends module and **Maintenance** no longer list it either.
5. On the maintenance screen, dismiss ("passt so") a different loose end, then reload.
   - It stays gone — on all three surfaces. This is the id-stability check.
6. In settings, remove the configured model and repeat steps 2-4.
   - Identical behaviour, no error state, no empty name.

## Done

**Summary.** All six deliverables implemented in plan order (D1 → D2 → D3+D4 in parallel → D5
→ D6). D1 (highest risk, `deliverable-hard`) moved `subjectWords` to pick content words nearest
the date label instead of the sentence's first six words, without touching `sentencesOf`,
`quote` or `looseEndId` — id stability verified with a hardcoded-hash regression test. D2 added
`ReminderUrgency: 'open'` and wired it through every consumer as an exhaustive switch. D3
stripped loose-end rows out of "waiting on"; D4 gave loose ends their own dashboard tile,
hidden by default. D5 exposed the day's open loose ends on `JournalDayView` by reusing
`openLooseEnds()`; D6 renders them as an answerable row above the journal entry stream.

A first review pass (`story-review-hard`) found 3 confirmed blocking bugs, all fixed and
re-reviewed to PASS in a second pass:

1. Answering a loose end from the journal used the viewed (past) day's hash instead of
   today's — every answer attempt raised a spurious conflict, since the write always targets
   today's file. Fixed by fetching today's day the same way `InterviewDialog.tsx` already does.
2. The LLM-assisted loose-end path still called `settled(day, quote)` with the pre-D1 2-arg
   signature, so it could re-propose a loose end the heuristic path had already subtracted.
   Fixed by threading the anchor offset through an `anchorOf()` helper.
3. Narrowing `subjectWords` in D1 accidentally also narrowed the "a later day answered it"
   `.some` check, which needs the opposite (broader terms match more easily under `.some`,
   not less). Split into `narrow` (dated-todo `.every`) and `broad` (later-day `.some`) term
   sets; regression test added.

**Not fixed, deliberately (non-blocking per second review pass):**

- `LooseEndsTile.tsx`'s journal link sends an empty `d=` query param when a loose end's day
  can't be resolved (defensive-only in practice — a loose end's path is always a journal day
  file, so this never fires on real data).
- `journal:get` re-derives `openLooseEnds()` (a full index scan) on every day fetch — spec-
  conformant (D5 mandated reusing the single source of truth) but a performance follow-up if
  journals grow large.
- A narrow race: answering two loose ends on the same day in quick succession could send a
  stale `expectedHash` for the second one, since `refreshDay` doesn't invalidate today's cached
  view and the vault-changed event races the second mutation. `InterviewDialog.tsx` has the
  identical shape and never surfaced it because it only ever asks one loose-end question per
  run; D6 is the first place several rows can stack. Worth a follow-up story if it's ever hit.
- Minor: a German opening quote closed with a straight quote in two i18n strings
  (`de-dashboard.ts`, `de-journal.ts`).

**Commit message:**

```
022: loose ends get their own place, waiting-on stays about others
```

**Verification:** `npm run build`, `npm run lint`, `npm run typecheck` all green.
`npm test` — 2638 passed, 1 failed (`tests/core/wiki/module.test.ts`, a pre-existing
template-drift snapshot unrelated to this story, predates it per commit e8959d1). Code review:
FAIL → 3 fixes → PASS (`story-review-hard`, two passes).

**Live smoke (P2) — accepted.** The manual test plan below requires the real vault (not
`.demo-vault`), because it exercises the exact wording being fixed (the 12 Aug "vormittag
ruhig lost vereinzelt paar fragen" entry), which a headless build session cannot drive. The
user ran the acceptance walk against the real vault and accepted the story on 2026-08-22;
status moved to `done`.
