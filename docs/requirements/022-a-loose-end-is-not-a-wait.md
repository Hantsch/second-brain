---
id: 022
title: A loose end is its own thing, not a wait
status: draft # draft -> ready -> in-progress -> done
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

- [ ] "Waiting on" shows only entries where someone or something owes me an answer — no loose
      ends, and its count and overdue badge are computed over those entries alone.
- [ ] A loose end still reaches me on the dashboard, in a place of its own that names it as
      what it is (an announcement of mine without an outcome), not as a wait.
- [ ] Opening the day the announcement was made shows the open loose end on that day, from
      the journal screen, without going to maintenance first.
- [ ] The name of a loose end names what was announced. For my 12 Aug entry that means the
      Mondsee trip, not "vormittag ruhig lost vereinzelt paar fragen".
- [ ] A loose end whose subject is carried by a dated todo does not appear — my
      `Nach Mondsee fahren @due:2026-08-13` case is gone from the dashboard.
- [ ] A loose end that was already answered, dismissed or snoozed stays that way after this
      change — no reappearance because the wording or the id derivation moved.
- [ ] A loose end is not presented as more urgent than it is: its display distinguishes "the
      announced day has passed" from a missed deadline.
- [ ] All of it works without a model configured — the heuristic path alone produces the
      name, the subtraction and the display.
- [ ] The same loose end still carries one identity across dashboard, journal and
      maintenance; answering it in one place removes it from the others.

## Open Questions

<!-- From the requester; to be resolved in refine. -->

1. **Own dashboard module, or journal only?** I said "loose ends in the journal **or** its own
   module" — my preference is both, with the module visible by default, because the dashboard
   is where I look in the morning. If that blows the default grid budget
   (`DEFAULT_DASHBOARD_TILES`, two screens at 1152 px), decide explicitly which module gives
   up its slot, or ship the module hidden and say so.
2. **Id stability vs. better naming.** `looseEndId` hashes day + quote, and `subject` is
   derived from the quote. If the fix changes what counts as the sentence (rather than only
   which words become the subject), every id moves and my dismissals lose their anchor. Prefer
   a fix that leaves the quote — and therefore the id — untouched. If not possible, the
   migration is part of this story, not an afterthought.
3. **How is the subject found?** Suggestion: take the clause around the date reference, not the
   first six words of the whole sentence. Second candidate: loosen the settled check from "all
   terms" to "enough terms". These are two different fixes and the second one alone would
   silence my Mondsee row without fixing the name — decide whether both are wanted.
4. **Does a loose end keep a red mark at all?** A separate urgency ("open", not "overdue") is
   the honest answer, but it touches the shared `Reminder` shape. Alternative: keep the source
   and let the new surface style it. Decide once, not per tile.
5. **What does the journal show, exactly?** A marker on the day in the calendar sidebar, a row
   above the stream, or both? The interview already asks about one open loose end
   (020, D8) — the new surface must not ask me the same thing twice on the same day.
6. **Split?** Three capabilities again (core naming/subtraction fix, dashboard module, journal
   surface). If the plan runs long, cut it — the core fix is the one that must ship first,
   because both surfaces would otherwise display the same wrong name.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
