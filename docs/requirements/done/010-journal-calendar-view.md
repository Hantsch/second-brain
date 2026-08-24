---
id: 010
title: Journal — a calendar on top of the days
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I want to see my writing as a month, not only as a list. A calendar above the day
list: which days have an entry, which do not, where the holes are — and I can click a
day to open it and browse through months.

The list is good at "the last few days". It is bad at "how did June look", at finding a
day I only remember by its position in the month, and at showing a pattern. The data is
already there — one file per day, derived into `JournalDay` — nothing new has to be
recorded.

The calendar is a **navigation control**, not a second journal screen: it selects the
day, the entry below it stays the place where I read and write.

Related: [009](009-journal-open-days-filter.md) defines "finished / not finished". The
calendar shows that state as a marker, so an unfinished day is visible in the month
without turning on a filter first.

## Acceptance Criteria

- [x] A month calendar sits above the day list, showing the month of the selected day.
- [x] Every day cell states whether an entry exists — the difference between "written"
      and "not written" is legible without hovering.
- [x] Clicking a day opens it, exactly like a click in the list, and updates
      `#/journal?d=…`.
- [x] Today is marked, and it is marked differently from "selected".
- [x] I can page to the previous and next month, and get back to today in one step.
- [x] Months without a single entry are reachable and honestly empty, not skipped.
- [x] A day's state is visible beyond "exists": at least mood (the dot the list already
      uses) and whether the day is unfinished (from [009](009-journal-open-days-filter.md)).
- [x] Keyboard: the calendar is reachable and operable by keyboard, and the existing
      arrow-key day switching keeps working unchanged.
- [x] A future day is not offered as if it were writable history; backfilling a past
      day works.
- [x] Reading a month does not read every file of that month — it goes through the
      derived days, like the list does.
- [x] External changes show up: a day added in Obsidian appears in the calendar.
- [x] Works with no model configured.
- [x] Weekday and month names come from the UI language via `Intl`, and every label
      goes through `t()`, in `de` and `en`.

## Open Questions

- ~~**Month or a rolling heatmap?**~~ answered → Decisions (Sprint)
- ~~Does the calendar **replace** the day list, or sit above it?~~ answered →
  Decisions (Sprint)
- ~~Can it be collapsed?~~ answered → Decisions (Sprint)
- ~~What happens on a cell for a day with **no** entry~~ answered → Decisions (Sprint)
- ~~How many markers can a cell carry~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Month grid, not a rolling heatmap — answers "what did this month look
  like" without overlapping the existing streak tile.
- **(User)** Sits above the day list rather than replacing it — the list keeps its
  excerpt/word-count scannability, the calendar adds a second navigation path onto the
  same days.
- **(User)** Collapsible, so it does not permanently eat vertical space.
- **(User)** Clicking an empty day cell opens an empty "write it now" state that only
  creates the file on the first keystroke — browsing the calendar never fills the
  vault with empty days.
- **(User)** Maximum two markers per cell (e.g. entry/mood dot + an unfinished
  indicator) to keep cells legible.

Decided during refinement (not the user's calls — mine, with the reason):

- **No new IPC channel.** The calendar filters the days that `journal:list`
  already delivers (derived, unlimited, index-backed) client-side — that is what
  "reading a month does not read every file" means here.
- **The calendar sits in the existing side column**, above the day count and the
  list, not in a third column — day navigation already lives there, and 200–240 px
  carries a seven-column grid.
- **The shown month is component state seeded from `?d=`**, not a second URL
  parameter — `#/journal?d=…` stays the journal's one address; paging months is
  browsing, not a location.
- **The week starts on Monday in both UI languages** — `de-DE` and `en-GB` are both
  Monday-first, and fixing it avoids depending on the patchily-typed
  `Intl.Locale.weekInfo`.
- **Markup is a real `<table>`** with `<th scope="col">` weekday abbreviations and
  one button per day — the accessible calendar pattern axe already passes, instead
  of hand-rolled `role="grid"` bookkeeping.
- **Arrow keys inside the grid move _and_ select** (same mental model as the list),
  and `use-journal-keys.ts` ignores keydown that originates inside the calendar —
  so the list's arrow behaviour stays untouched everywhere else.
- **A future day is unselectable only when it has no entry**; a future day that
  already has a file stays openable — a written day is history whatever its date.
- **Collapse state lives in `sessionStorage`** under one key — the screen unmounts
  on navigation, and this mirrors the `localStorage` draft in `QuickCapture.tsx`;
  session-scoped, so the default stays "open".
- **"Creates the file on the first keystroke" is implemented as "selection never
  writes"** — the existing `journal:setDay` / `fresh` path already creates the day
  on the first save, so no new write path is added.
- **The unfinished marker consumes 009's derived `closed` field on `JournalDay`.**
  010 does not re-derive finishedness and adds nothing to VAULT-FORMAT.md.
- **The mood dot reuses `.sb-moodmark`**; a day with an entry but no mood gets a
  neutral entry dot — that plus the unfinished mark is the two-marker budget.
- **New stylesheet `styles/app/journal-calendar.css`** — `journal.css` is already
  752 lines, well past the soft cap.
- **No native `input type="date"`** — `components/DueField.tsx` already rejects it as a
  foreign body in the dark layout; the grid is buttons on tokens, and it is also the
  visible control that `systems/navigation.md` demands next to any hotkey.
- **`locale(language)` gets exported from `lib/format.ts`** instead of a third inline
  `language === 'de' ? 'de-DE' : 'en-GB'` — `DayList.tsx` and `DayEntry.tsx` already
  duplicate it, and the calendar would be the third copy.
- **Paging uses the existing `chevron-left` / `chevron-right` icons** — `atoms/Icon.tsx`
  is a closed allowlist with no calendar glyph, and this story is not the place to open it.
- **The seed gets two sparse entries ~40 days back** so month paging and "the
  previous month" are demonstrable in the demo vault whatever today's date is.

## Plan

Everything needed is already in the renderer: `journal:list` (no limit) returns every
derived day with `mood`, `turns`, `excerpt`, and — after 009 — `closed`. So this story
is renderer-only: no core change, no IPC change, no vault-format change.

1. **New presentational component** `components/MonthCalendar.tsx`, mirroring
   `components/DayList.tsx`: exported pure helpers (`monthOf`, `shiftMonth`,
   `monthCells`) next to the view, reusing `dateOf`/`todayIso` from `DayList.tsx` so
   there is one idea of "today". A `<table>` per month: caption = month + year from
   `Intl`, `<th scope="col">` weekday abbreviations, one `<button>` per day.
2. **Cell states**: in-month / padding, entry / no entry, today, selected, future,
   unfinished. Markers: mood dot (`.sb-moodmark`, existing) or a neutral entry dot,
   plus the unfinished mark — never more than two.
3. **New stylesheet** `styles/app/journal-calendar.css`, imported in
   `renderer/index.css`; tokens only, sized to fit the 200–240 px side column and the
   ≤1200 px single-column layout.
4. **Wire into `screens/journal/JournalScreen.tsx`**: render above `.sb-journal-count`
   and `DayList`, feed it `days.data`, hand clicks to the existing `select()` (so the
   URL path is literally the same one), keep `month` in state and re-sync it when the
   selection leaves the shown month, keep the collapse flag in `sessionStorage`.
5. **Keyboard**: roving tabindex (one tab stop), arrows ±1 / ±7 days across month
   boundaries, PageUp/PageDown for months, Home/End for the month's edges; teach
   `use-journal-keys.ts` to stand down when the event comes from inside the calendar.
6. **Unfinished marker** from 009's `closed` field, with 009's rules inherited
   verbatim: only days with a file, today exempt until the day is over.
7. **Tests** in a new `tests/renderer/journal-calendar.test.tsx` (journal.test.tsx is
   already 857 lines), plus seed entries in `scripts/seed/journal.mjs` and a live smoke
   run.

Order: 1–3 (D1) → 4 (D2) → 5 (D3) → 6 (D4) → 7 (D5). D4 depends on story 009 having
landed its `closed` field on `JournalDay`; if 009 named it differently, D4 follows 009's
actual field — the marker is the only part of it 010 owns.

## Deliverables

**D1 — The month grid as a component.**
Files: new `src/renderer/components/MonthCalendar.tsx`, new
`src/renderer/styles/app/journal-calendar.css`, `src/renderer/index.css` (one import),
`src/renderer/lib/format.ts` (export `locale`), `src/renderer/i18n/de-journal.ts`,
`src/renderer/i18n/en-journal.ts`, new `tests/renderer/journal-calendar.test.tsx`.
Mirror: `src/renderer/components/DayList.tsx` (exported pure helpers, mood-dot markup,
`Intl` per UI language), `src/renderer/styles/app/journal.css` (tokens only, one accent).
Note: new keys go under `journal.calendar.*` and must sit in the same-named partial in
both languages — `tests/renderer/i18n.test.ts` checks that, not just key parity.
Acceptance: the grid shows the month of the selected day with weekday header and month +
year from `Intl`; written vs. not written is legible without hovering; today is marked
differently from selected; prev/next month and a one-step "today" work; a month without a
single entry renders as a full, honestly empty grid instead of being skipped; at most two
markers per cell; the collapse toggle carries `aria-expanded`; every label goes through
`t()` and exists in `de` and `en`; axe finds nothing.

**D2 — The calendar in the journal screen.**
Files: `src/renderer/screens/journal/JournalScreen.tsx`,
`src/renderer/styles/app/journal-calendar.css`,
`tests/renderer/journal-calendar.test.tsx`.
Mirror: the existing `select()` / `useSearchParams` handling in the same file.
Acceptance: the calendar sits above the day count and the day list; a click on a day day
does exactly what a list click does and updates `#/journal?d=…`; browsing and selecting
never write a file; an empty past day opens the existing "write it now" field and the file
appears only on save; the collapse state survives leaving and re-entering the screen; a day
that arrives via `event:vault-changed` appears in the calendar without a reload; no model is
consulted anywhere in this path.

**D3 — Keyboard, without breaking the list arrows.**
Files: `src/renderer/components/MonthCalendar.tsx`,
`src/renderer/screens/journal/use-journal-keys.ts`, `src/renderer/i18n/de-journal.ts`,
`src/renderer/i18n/en-journal.ts` (`journal.keys` hint),
`tests/renderer/journal-calendar.test.tsx`.
Acceptance: exactly one tab stop reaches the grid; inside it, arrows move ±1 / ±7 days and
select, crossing month boundaries pages the month, PageUp/PageDown switch months, Home/End
jump to the month's edges, Enter/Space open the focused day; future days without an entry
are skipped and not selectable; with focus in the day list or the day text, `j`/`k` and the
arrow keys behave exactly as before (regression test in `tests/renderer/journal.test.tsx`
stays green).

**D4 — The unfinished day, visible in the month.**
Files: `src/renderer/components/MonthCalendar.tsx`, `src/renderer/i18n/de-journal.ts`,
`src/renderer/i18n/en-journal.ts`, `tests/renderer/journal-calendar.test.tsx`.
Depends on: story 009's `closed` field on `JournalDay`.
Acceptance: a past day with a file and without `closed` carries the unfinished marker;
today never does (009's exemption); a day without a file never does; the marker has a
`t()` label and is not colour-only.

**D5 — Demo vault and live smoke.**
Files: `scripts/seed/journal.mjs`, `.screenshots/` output (no source change expected in
`scripts/shot.mjs` unless the journal screenshot needs the calendar expanded).
Acceptance: `npm run seed` produces journal days in at least two different months;
`npm run shot` yields a journal screenshot with the calendar visible, and `npm run verify`
is green.

**Coverage gate — every acceptance criterion has a deliverable:**

| AC                                        | D          |
| ----------------------------------------- | ---------- |
| Month calendar above the day list         | D1, D2     |
| "Written" vs. "not written" legible       | D1         |
| Click opens the day, updates `?d=`        | D2         |
| Today marked, differently from selected   | D1         |
| Prev/next month, back to today in a step  | D1         |
| Empty months reachable and honestly empty | D1         |
| Mood dot + unfinished state               | D1, D4     |
| Keyboard, existing arrows unchanged       | D3         |
| No future day as writable history         | D3 (+D1)   |
| A month does not read every file          | D2         |
| External change appears                   | D2         |
| Works with no model configured            | D2         |
| `Intl` + `t()` in `de` and `en`           | D1, D3, D4 |

## Model Hints

- D1 → default
- D2 → default
- **D3 → `deliverable-hard`** — it changes `use-journal-keys.ts`, the global window
  keydown handler that today owns `j`/`k` and the arrow keys for the whole screen; a
  wrong bail-out condition silently kills day switching in the list or double-handles
  a keypress in the grid, and that regression is invisible in a screenshot.
- D4 → default
- D5 → default
- Review: → default — four small, single-layer renderer deliverables with no new write
  path, no IPC and no vault-format change; the one real risk (the shared keydown
  handler) is already carried by D3's tier and by the existing journal keyboard tests.

## Test Plan (manual acceptance)

`npm run seed`, then start the app on the demo vault (`npm run shot` for the
screenshots, or the launcher for hands-on).

1. Open **Journal** (rail 3). The month calendar sits above the day list and shows the
   current month; today's cell is marked, and it looks different from the selected cell.
2. Days with an entry carry a dot, days without one do not — check that without hovering.
3. Click a day with an entry in the calendar. The day opens on the right, the address in
   the title bar / deep link is `#/journal?d=<that day>`, and the list row for it is
   selected too.
4. Click an **empty past day**. The day opens with the empty writing field; check in the
   vault folder (`.demo-vault/journal/…`) that **no file** was created. Type a sentence,
   save — now the file exists, and the calendar cell has gained its dot.
5. Page to the **previous month** and back; then hit "today" — you land on today's month
   in one step.
6. Page back far enough to reach a month with **no entries at all**: the grid is fully
   drawn and says it is empty; it is not skipped.
7. Click a **future** day without an entry — nothing happens, and it does not look
   writable.
8. Tab into the calendar (one stop), then walk it with the arrow keys: left/right by a
   day, up/down by a week, over the month boundary. Then click a row in the day list and
   press `j`/`k` and arrow up/down — day switching behaves exactly as before.
9. Collapse the calendar, switch to another screen (rail 2), come back — it is still
   collapsed. Expand it again.
10. From story 009: a past day that is **not finished** carries the second marker; today
    does not, even before it is closed out.
11. Add a day externally: create `journal/YYYY/MM/YYYY-MM-DD.md` in the demo vault with a
    text editor. Within a moment the cell appears in the calendar, without restarting.
12. In settings, remove the model routing for `journal-chat` (or run with no provider at
    all) and repeat steps 1–5: the calendar behaves identically and nothing anywhere says
    a model is missing.
13. Switch the UI language to English and back to German: weekday and month names, the
    "today" button, the collapse label and the marker tooltips all change with it.

## Done

**Summary.** A month calendar (`MonthCalendar.tsx`, real `<table>`, Monday-first, one
teal accent) now sits above the day list in the Journal screen's existing side column,
seeded from `?d=` and paged independently as component state. It reads only the array
`journal:list` already returns — no new IPC, no vault-format change, no core change; the
whole story is renderer-only. Selecting a day reuses the screen's existing `select()`
(same as a list click). Every cell carries at most two markers (mood/entry dot +
009's unfinished mark, from `isDayOpen`); a future day without an entry is unselectable,
a future day with one stays open, exactly per the story's decision. Full keyboard grid
navigation (roving tabindex, arrows ±1/±7 crossing month boundaries, PageUp/PageDown,
Home/End, Enter/Space) coexists with the existing global day-list handler via one added
bail-out in `use-journal-keys.ts` (stands down when the event originates inside
`.sb-monthcal-grid`); the day list's own `j`/`k`/arrow/Ctrl+1-3 behaviour is unchanged and
regression-tested. Collapse state persists in `sessionStorage`, default expanded.

**Decisions (mine, made while building, per the sprint's "no questions" rule):**

- 009's `closed` field landed exactly as the plan assumed (`JournalDay.closed: string |
null`, `isDayOpen(day, today)` in `lib/journal-open.ts`) — D4 consumed it verbatim, no
  adaptation needed.
- The collapse toggle became icon-only (`chevron-up`/`chevron-down`, `aria-label` carries
  the translated text) rather than a text button with a wrap fallback: the 200–240px side
  column cannot fit four labelled toolbar buttons without either wrapping the toolbar
  across lines (visually noisy above a compact grid) or shrinking one button to an icon —
  the icon is the plainer fix and matches the existing icon-only prev/next-month buttons.
- Pure grid helpers (`monthOf`, `shiftMonth`, `monthCells`, `nextOpenable`, …) were split
  out of `MonthCalendar.tsx` into a new `src/renderer/lib/month-calendar.ts` once D4's
  addition pushed the component file to ~400 lines, per CLAUDE.md's ~300-line soft cap —
  the component is a rendering/keyboard responsibility, the grid math is a separate,
  independently testable one. `MonthCalendar.tsx` is ~309 lines after the split, judged
  acceptable by both the implementing agent and the reviewer (mostly header comment plus
  JSX; further splitting would separate closely-coupled keyboard/render code for no real
  gain).
- `journal.calendar.open`'s label was changed mid-D2 (from a value that was
  byte-identical to the day list's `journal.open`) to give the calendar's day buttons and
  the list's day rows distinct accessible names — an accessible-name collision that D1
  couldn't see while testing the calendar in isolation, but a real a11y defect once both
  controls exist on the same screen.
- A live-smoke bug was found after D5 (not part of any deliverable's original scope) and
  fixed as its own pass: at the narrow (≤1200px) breakpoint, the calendar's
  `aspect-ratio: 1` day cells scaled with the widened single-column layout and pushed the
  mood/energy/chips/composer/save controls out of scroll reach. Fixed with narrow-only
  CSS (a fixed cell height instead of `aspect-ratio`, plus a `grid-template-rows`/
  `overflow` fix in `journal.css` for a related sizing trap it exposed) — confirmed via
  `npm run shot` before and after.
- Story-review-hard found one further **confirmed, blocking** defect in the _wide_
  layout after that: the toolbar's four `.gs-btn` buttons (`white-space: nowrap`)
  exceeded the 200–240px column's width, spilling the collapse label past the side
  column's border (visible in `.screenshots/04-journal.png`). Fixed by making the
  collapse toggle icon-only (see above) — confirmed resolved in a fresh screenshot.
- Five further review findings were fixed in the same cycle, all low-severity/cheap: a
  missing `.gs-scrim` guard on the grid's own keydown handler (the global handler already
  had one; the grid's now mirrors it, closing one more path into a pre-existing,
  out-of-scope class of bug — `atoms/Dialog.tsx` has no focus trap, which is not this
  story's to fix); a raw `10px` font-size replaced with `var(--text-2xs)`; a dead empty
  CSS rule removed; a specificity bug where "today" lost its accent colour when also
  selected (the common default-view case) — fixed so both cues persist together; the
  weekday header row now collapses along with the grid body instead of staying visible
  when collapsed.
- Accepted without a code change: `DayList.tsx`/`DayEntry.tsx` still each carry their own
  inline `language === 'de' ? 'de-DE' : 'en-GB'` ternary even though `lib/format.ts` now
  exports `locale()` for exactly that purpose (this story's own D1 rationale). Migrating
  those two pre-existing call sites is a one-line-each cleanup with no user-visible
  effect and no relation to this story's acceptance criteria — left as a follow-up rather
  than scope creep into 010.

**Verification.** `npm run build`, `npm run lint`, `npm run typecheck` all clean.
`npm test`: 2199/2200 passing; the one failure (`tests/core/wiki/module.test.ts`, a
docs/MODULE-SCHEMA.md drift check) is pre-existing and unrelated — independently
reproduced on the base commit via `git stash`. `npm run format:check` shows the repo's
known, pre-existing CRLF/LF artifact across 282 files; every file this story touched was
confirmed byte-clean via `npx prettier --check --end-of-line auto <files>`. Live smoke
(`npm run seed && npm run shot`) run twice (before and after the review-fix cycle) and
visually inspected: the demo vault now spans two months (2026-07 and 2026-08) via two
new seed entries ~40 days back; the wide Journal screenshot shows the calendar, today's
distinct marking, entry/mood/unfinished markers, and paging controls all legible inside
the side column with no overflow; the narrow screenshot confirms the calendar renders
compact and the composer/save controls remain reachable by scroll. Code review
(`story-review-hard`, Opus tier per this story's Model Hints): first pass FAIL on one
confirmed blocking finding plus five low-severity/nit findings — all six fixed in one
review-fix cycle, re-verified green above; no findings left undone.

**Commit message:**

```
010: journal calendar view

Month grid above the day list, keyboard grid navigation coexisting
with the existing day-list arrows, mood/unfinished markers from 009,
demo-vault seed spanning two months.
```

**Changed files:**

New:

- `src/renderer/components/MonthCalendar.tsx`
- `src/renderer/lib/month-calendar.ts`
- `src/renderer/styles/app/journal-calendar.css`
- `src/renderer/i18n/de-journal-calendar.ts`
- `src/renderer/i18n/en-journal-calendar.ts`
- `tests/renderer/journal-calendar.test.tsx`

Modified:

- `src/renderer/screens/journal/JournalScreen.tsx`
- `src/renderer/screens/journal/use-journal-keys.ts`
- `src/renderer/lib/format.ts` (exported `locale()`)
- `src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts` (wired the new partials)
- `src/renderer/index.css` (one import)
- `src/renderer/styles/app/journal.css` (narrow-breakpoint fix)
- `tests/renderer/journal.test.tsx` (keyboard coexistence regression tests)
- `scripts/seed/journal.mjs` (two entries ~40 days back)
- `docs/requirements/010-journal-calendar-view.md` (this file)

**Open points:** none. Story is fully accepted; no further story in this sprint depends
on 010.
