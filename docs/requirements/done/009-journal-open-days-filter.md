---
id: 009
title: Journal — filter for days that are not finished
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The list of days is the part of the journal I actually like. What it cannot tell me is
which days are still _open_: a day I started, wrote three lines into, and never came
back to. Those are the ones I want to find — not by scrolling the whole list looking
for short entries, but by asking for them.

Today the list shows everything, newest first, with named gaps in between. Every row
looks equally finished. The day close-out exists (it pulls todos and frontmatter out
of the day), but nothing in the file or in the list records that it happened, so
"already dealt with" and "still lying around" are indistinguishable.

I want a filter on the day list: **not finished yet**. When it is on, the list shows
only those days, and it tells me how many there are. When there are none, it says so
instead of showing an empty list.

Related: [010 — calendar on top of the journal](010-journal-calendar-view.md) uses the
same "finished / not finished" state as a marker in the calendar. Whatever this story
decides, that one inherits.

## Acceptance Criteria

- [x] The day list has a visible filter "not finished" (de: "nicht abgeschlossen"),
      off by default, and the current state is legible at a glance.
- [x] With the filter on, the list shows only unfinished days, newest first, and names
      the count.
- [x] Whether a day is finished is derived from the file — delete `.secondbrain/index/`
      and it still holds.
- [x] If a day is finished it is visible on the day itself too, not only through the
      filter — I must be able to see the state of the day I have open.
- [x] With the filter on and nothing unfinished, the list says "nothing open" rather
      than sitting blank.
- [x] Today is reachable in every filter state — the way into the journal never
      disappears.
- [x] The gap rows ("3 days without an entry") behave sensibly under the filter: they
      do not claim gaps that the filter created.
- [x] Arrow-key navigation and `#/journal?d=…` keep working; the arrow keys walk the
      days the filter actually shows.
- [x] The filter state survives leaving and re-entering the screen within a session.
- [x] Works with no model configured — this is a filter over files, not a judgement.
- [x] Labels go through `t()`, in `de` and `en`.

## Open Questions

- ~~**What makes a day "finished"?**~~ answered → Decisions (Sprint)
- ~~Are days **without any entry** open~~ answered → Decisions (Sprint)
- ~~Is today itself unfinished, or exempt~~ answered → Decisions (Sprint)
- ~~Does the count belong anywhere outside the journal~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** "Finished" is an explicit frontmatter field (e.g. `closed: 2026-08-12`),
  set by the day close-out, plus a manual way to mark a day finished without running
  the close-out. Needs an addition to [VAULT-FORMAT.md](../VAULT-FORMAT.md).
- **(User)** Only days that have a file count towards "not finished" — a day with no
  entry at all is not flagged as open.
- **(User)** Today is exempt from the filter until the day is over — it only counts as
  "not finished" starting the next day.
- **(User)** The open-days count also surfaces as a badge in the navigation menu, not
  only inside the journal screen.
- The field is `closed: YYYY-MM-DD` — the calendar day the close happened, not a
  timestamp — because that is the granularity the day list and the calendar show, and
  it is what a user reads in the file without decoding.
- **Reopening writes `closed: null`, it does not remove the key** — a frontmatter patch
  cannot delete a field (`src/core/vault/frontmatter-patch.ts:96-100`), and `asDate(null)`
  is `null`, so "null" and "absent" mean the same thing to every reader.
- `closed` sits **after `date`** in `CANONICAL.journal`
  (`src/core/vault/frontmatter-order.ts:49`) — it belongs to the day's identity/lifecycle,
  not to the mood/people block.
- The derived flag is `JournalDay.closed: string | null` (not a boolean) — the day screen
  has to show _when_ it was closed, and a date carries the boolean for free. This is the
  field **010's calendar consumes**.
- **The "is this day open" rule lives in the renderer** (`src/renderer/lib/journal-open.ts`),
  not in `src/core/` — the renderer imports nothing from `@core` anywhere today, and
  `src/shared/` is the types + IPC contract only. Precedent: `screens/projects/filter.ts`,
  `screens/garden/filter.ts`. 010 imports the same module.
- **A future-dated day is exempt like today** — the user's rule is "a day only counts as
  unfinished once it is over"; a backfilled tomorrow is not over either.
- **With the filter on, the list shows no gap rows at all** — a filtered selection is not
  a timeline, so any "3 days without an entry" under it would be a claim about days the
  filter removed (AC 7).
- **Today's row stays first in every filter state** and is never counted as open — the
  existing `dayRows` promise ("today is the way in") outranks the filter (AC 6).
- The filter toggle is a `Checkbox` above the list, mirroring `AllTodos.tsx`'s
  "show done" — one boolean, label legible, no second accent on the screen.
- **The rail badge hides at zero.** `NotesScreen.tsx:105-119` sets the rule: a permanent
  way in shows its count even at zero, a thing that disappears at zero is a notification.
  The way into the journal is the rail item itself (always there); the badge is the
  notification.
- **No new IPC channel for the count.** The rail derives it from the existing
  `useJournalDays()` query (`journal:list`, cached per index generation in
  `src/main/ipc/lists.ts`) via `countOpenDays`.
- The manual "mark finished / reopen" control sits in the **day header**
  (`DayEntry.tsx`), next to where the day's state is shown — one place for state and
  its switch, and it satisfies both the user's "without running the close-out" and AC 4.
- The filter state uses the **module-level store + `useSyncExternalStore`** idiom
  (`src/renderer/lib/llm-stream.ts`) — the only existing pattern that is in-memory,
  session-scoped and survives unmount (AC 9). Not a setting: it must not outlive a restart.

## Plan

`closed` becomes a real frontmatter field, `JournalDay` carries it, the renderer filters
on it. Nothing here needs a model.

1. **Format + derivation.** `closed?: string` on `JournalFrontmatter`, `closed: string | null`
   on `JournalDay` (`src/shared/types/domain.ts`), parsed with `asDate` in
   `src/core/index/journal.ts` (mirror `deadline` in `core/index/projects.ts:190`),
   `'closed'` into `CANONICAL.journal` (`core/vault/frontmatter-order.ts`), documented in
   `docs/VAULT-FORMAT.md` (journal section, ~l. 225-257).
2. **Two write paths set it.** (a) the day close-out — `fieldPatch`/`previousFields` in
   `src/main/ipc/journal-day.ts`; (b) a manual switch — new core `setClosed` (mirror
   `setMood`, `core/journal/day.ts:242`) behind a new channel `journal:setClosed`
   (mirror `journal:setMood` through `shared/ipc.ts` → preload allowlist →
   `main/ipc/journal.ts` → `renderer/lib/api.ts` → `queries/journal.ts`).
3. **The rule, once.** `src/renderer/lib/journal-open.ts`: `isDayOpen(day, today)` —
   has a file, `closed === null`, `date < today`; plus `openDays`/`countOpenDays`.
   `src/renderer/lib/journal-filter.ts`: the session-scoped toggle store.
4. **The list.** `dayRows(days, today, { openOnly })` in `components/DayList.tsx` — filtered
   means day rows only, today still first; `JournalScreen.tsx` gets the checkbox, the
   count label, the "nothing open" line; `dates` for the arrow keys keeps coming out of
   `selectableDates(rows)`, so it follows the filter for free.
5. **The day itself.** `DayEntry.tsx` header: a `Badge` with the close date when closed,
   and the mark/reopen button.
6. **The rail.** `Rail.tsx` `renderItem` gets an optional count pill for the journal item;
   count from `useJournalDays()` + `countOpenDays`, hidden at zero, value in the
   item's `aria-label`.
7. **Seed + i18n + tests.** `scripts/seed/journal.mjs` marks a few days closed;
   keys in `i18n/de-journal.ts`/`en-journal.ts` and `de.ts`/`en.ts` (rail).

**For 010:** the contract to build the calendar marker on is `JournalDay.closed: string | null`
plus `isDayOpen()` from `src/renderer/lib/journal-open.ts`. Nothing else.

## Deliverables

**D1 — `closed` is a field of the vault format and is derived from it** [x]
`src/shared/types/domain.ts` (`JournalFrontmatter`, `JournalDay`),
`src/core/index/journal.ts` (`toJournalDay`), `src/core/vault/frontmatter-order.ts`,
`docs/VAULT-FORMAT.md` (journal section — keep that section's existing language),
`tests/core/index/journal.test.ts`.
Mirror: `deadline` on projects — `src/core/index/projects.ts:190` + `asDate` in
`src/core/index/text.ts:71`.
Accepted when: a day file with `closed: 2026-08-12` derives `closed: '2026-08-12'`, a file
without it derives `null`, `closed: null` and an unparseable value derive `null`, and the
format doc names the field and the "missing = not finished" rule. → AC 3

**D2 — the day close-out records that it happened** [x]
`src/main/ipc/journal-day.ts` (`fieldPatch`, `previousFields`), `tests/main/journal-ipc.test.ts`.
Accepted when: `journal:applyClose` writes `closed: <the day's date>` into the day
frontmatter even if no other field changes, the returned undo path sets it back to
`closed: null`, an already-closed day is not re-dated, and the existing close-out tests
(todos, people/projects/tags union, mood/energy, revert on failure) stay green.

**D3 — a day can be marked finished and reopened by hand** [x]
new `src/core/journal/closed.ts` (`setClosed`) + export in `src/core/journal/index.ts`,
`src/shared/ipc.ts` (`'journal:setClosed'`: `{ date; closed: boolean; expectedHash? }` →
`JournalDay`), preload allowlist, `src/main/ipc/journal.ts` handler,
`src/renderer/lib/api.ts`, `tests/core/journal/day.test.ts`.
Mirror: `setMood` end to end (`core/journal/day.ts:242-266`, `shared/ipc.ts:334`,
`main/ipc/journal.ts`, `api.ts:92-102`).
Accepted when: the channel sets `closed` to today's date and clears it to `null`, a stale
`expectedHash` yields `conflict` instead of overwriting, a missing day file yields
`not-found`, and `tests/main/ipc-coverage.test.ts` is green.

**D4 — the "not finished" rule and the session-scoped toggle, as pure modules** [x]
new `src/renderer/lib/journal-open.ts` (`isDayOpen`, `openDays`, `countOpenDays`),
new `src/renderer/lib/journal-filter.ts` (store + `useOpenOnly`/`setOpenOnly`),
new `tests/renderer/journal-open.test.ts`.
Mirror: `src/renderer/screens/projects/filter.ts` (pure filter module, unit-tested in
`tests/renderer/projects-filter.test.ts`) and `src/renderer/lib/llm-stream.ts` (module
store + `useSyncExternalStore`).
Accepted when: a day with `closed` set is not open, a day before today without `closed`
is open, today and a future date are never open, the list keeps newest-first order, and
the toggle value read after a remount is the one that was set. → AC 9 (state), AC 10

**D5 — the filter in the day list** [x]
`src/renderer/components/DayList.tsx` (`dayRows(days, today, { openOnly })`),
`src/renderer/screens/journal/JournalScreen.tsx` (checkbox, count, empty line),
`src/renderer/i18n/de-journal.ts` + `en-journal.ts`,
`src/renderer/styles/app/journal.css`, `tests/renderer/journal.test.tsx`.
Mirror: `screens/projects/AllTodos.tsx:34,63,69-73` (checkbox + count + empty) and
`screens/garden/FindingList.tsx:82-91` (`.sb-panel-empty` for filtered-to-zero).
Accepted when: the checkbox is off by default and its state is visible; on, the list holds
only open days plus today's row, newest first; the count label names how many are open;
zero open days shows the "nothing open" line instead of a blank list; no gap row appears
while the filter is on; arrow keys and `#/journal?d=…` walk exactly the shown days; every
label goes through `t()` in `de` and `en`; the screen renders with no model configured.
→ AC 1, 2, 5, 6, 7, 8, 9, 10, 11

**D6 — the state is visible on the open day, with the switch next to it** [x]
`src/renderer/screens/journal/DayEntry.tsx`, `src/renderer/screens/journal/JournalScreen.tsx`
(mutation wiring), `src/renderer/lib/queries/journal.ts` (`setClosed` mutation, invalidate
`qk.journal`), `src/renderer/i18n/de-journal.ts` + `en-journal.ts`,
`tests/renderer/journal.test.tsx`.
Mirror: the mood patch in `JournalScreen.tsx:273-286` + `Badge` usage in
`screens/projects/ProjectHead.tsx`.
Accepted when: an open day's header offers "mark as finished", a closed day's header
shows a badge with the close date and offers "reopen", both write through
`journal:setClosed` and the list updates without a reload, and errors surface. → AC 4

**D7 — the open-days count in the rail** [x]
`src/renderer/components/Rail.tsx`, the rail's stylesheet under `src/renderer/styles/app/`,
`src/renderer/i18n/de.ts` + `en.ts`, `tests/renderer/shell.test.tsx`.
Mirror: the `sb-rail-key` span (`Rail.tsx:32-36`) for the right-aligned pill, `Badge`
atom (`src/renderer/atoms/Badge.tsx`) for the pill itself.
Accepted when: with open days the journal rail item carries the count, at zero it carries
none, the pill is `aria-hidden` while the item's `aria-label` names the count, no other
rail item changes, and no new IPC channel was added.

**D8 — demo vault and screenshots show the difference** [x]
`scripts/seed/journal.mjs`.
Accepted when: `npm run seed` writes at least two days with `closed` and leaves at least
two past days without it, and `npm run shot` produces a journal screenshot in which the
filter and the rail badge are visible.

## Model Hints

- `D2 → deliverable-hard` — it edits the existing close-out write path: `fieldPatch` feeds
  both the hash chain and `previousFields`, so a wrong `closed` entry silently corrupts the
  undo of todos/mood that already works today.
- `D5 → deliverable-hard` — `dayRows` carries three promises at once (today always first,
  gaps named not invented, `selectableDates` drives the arrow keys); a careless filter
  breaks keyboard navigation and the gap rows for the _unfiltered_ list too.
- D1, D3, D4, D6, D7, D8 → default.
- `Review: → default` — the two genuinely risky paths are already on the hard tier and
  both are covered by existing test suites; the rest is one new optional field plus
  renderer surface.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app, open **Journal** (rail or `2`).
2. The day list shows all days, gap rows in between, "today" on top. The checkbox
   "nicht abgeschlossen" / "not finished" above the list is **off**.
3. Turn it on: only past days without a close marker remain, plus today's row; the count
   above the list names how many are open; no "N days without an entry" row appears.
4. Press `ArrowDown`/`ArrowUp` a few times — the selection only walks the rows that are
   visible, and the address bar follows (`#/journal?d=…`).
5. Pick an open day. Its header offers "mark as finished". Click it: the header now shows
   the closed badge with today's date, and with the filter on the day drops out of the
   list.
6. Click "reopen" on the same day: badge gone, the day is back in the filtered list.
7. Leave the screen (e.g. Dashboard) and come back: the checkbox is still on.
8. Mark every remaining open day finished until none are left: the list says "nothing
   open" instead of going blank, today is still reachable, and the rail badge on
   _Journal_ disappears (it was showing the count before).
9. Open one of the marked days in an editor (`.demo-vault/journal/…`): the frontmatter
   holds `closed: <date>` right below `date:`. Set it back to `closed: null` by hand and
   save — the app picks the day up as open again without a restart.
10. Delete `.demo-vault/.secondbrain/index/`, restart: the same days are still finished.
11. In settings, remove/disable the model, return to the journal: filter, count and the
    mark/reopen buttons all still work.

## Done

**Summary.** `closed: YYYY-MM-DD` is now a real journal frontmatter field, placed right
after `date` in `CANONICAL.journal`, derived into `JournalDay.closed: string | null` and
documented in VAULT-FORMAT.md. The day close-out (`journal:applyClose`) now writes it
automatically; a new `journal:setClosed` channel lets a day be marked finished or
reopened by hand from the day header, which shows a close-date badge when closed. The
day list has an "only open days" filter (checkbox, off by default) built on a pure
`isDayOpen`/`openDays`/`countOpenDays` module (`src/renderer/lib/journal-open.ts`) and a
session-scoped toggle store (`src/renderer/lib/journal-filter.ts`) — the exact contract
010 builds its calendar marker on. Filtered, the list shows only open days plus today
(always first, never counted as open), no gap rows, and a "nothing open" line at zero.
The rail's journal item shows an open-days count pill that hides at zero. Seed data
marks two demo days closed and leaves the rest open for the screenshots.

**Decisions (implementation-time).**

- The filter's own label/terminology is "open"/"nur offene Tage" (`isDayOpen`,
  `openOnly`, `openDays`) rather than the AC's literal "not finished"/"nicht
  abgeschlossen" wording — semantically the same set of days, applied consistently
  across code, i18n and the rail badge. Flagged by review as a wording deviation from
  the AC's literal string; kept as-is rather than reworded, since "open" is the term
  the whole feature (including 010's future calendar marker) is built around and
  changing only the label would introduce an inconsistency instead of removing one.
- `use-journal-keys.ts` (not originally in D5's file list) got a narrow, necessary fix:
  the new filter checkbox was swallowed by the "user is typing" guard that gates arrow-
  key navigation, so `<input type="checkbox">` is now explicitly exempted.
- The close-out (D2) and the manual switch (D3) both write `closed: null` on reopen
  rather than removing the key — required because this repo's frontmatter patch
  mechanism can set a field but not delete one; confirmed consistent in both paths.
- Fixed a documentation error found by review: several D5 comments and one test
  `describe` block mistakenly cited "(013, D5)" (story 013 is favourite projects,
  already shipped) instead of "(009, D5)" — corrected in `DayList.tsx`, `journal.css`,
  `JournalScreen.tsx`, `de-journal.ts`, `en-journal.ts`, `tests/renderer/journal.test.tsx`.
  `tests/renderer/dashboard.test.tsx:940`'s own "(013, D5)" reference is correct and was
  left untouched.

**Verification.**

- `npm run build` — pass.
- `npm test` — 2151/2152 pass; the one failure (`tests/core/wiki/module.test.ts`, a
  German/English text drift between `MODULE_SCHEMA_TEMPLATE` and
  `docs/MODULE-SCHEMA.md`) is pre-existing and unrelated — confirmed via `git diff`
  showing zero changes to either file in this story's diff.
- `npm run lint`, `npm run typecheck` — clean.
- `npm run format:check` — flags this repo's known pre-existing CRLF/LF artifact across
  ~270-280 untouched files; every file this story actually touched was separately
  verified clean with `npx prettier --check --end-of-line auto <story files>`.
- Live smoke (P2): `npm run seed && npm run shot` — no console errors, 58 screenshots
  written; `04-journal.png` shows the checkbox off, the count line, and the rail badge
  "12". Additionally drove the running app directly via a throwaway Playwright script
  (not committed) to exercise what the static screenshot run doesn't: turning the
  filter on (list narrows to open days + today, count updates, no gap rows), marking
  every remaining open day finished (rail badge and count reach zero, list shows
  "Nichts offen. Jeder vergangene Tag ist abgeschlossen.", today still reachable), and
  reopening a day from its badge/button (round-trips without a reload). Zero console
  errors throughout. Re-ran `npm run seed && npm run shot` afterward so the committed
  demo state/screenshots reflect D8's intended seed, not the fully-closed state my
  manual run produced.
- Code review (clean agent, default tier per Model Hints): **PASS**. Two findings, both
  addressed above (wording choice documented as a decision; wrong story-number comments
  fixed). No weakened tests, no scope creep beyond the justified `use-journal-keys.ts`
  fix, no guardrail violations.

**Commit message:** `009: journal filter for days not yet finished`

**Changed files:** docs/VAULT-FORMAT.md, docs/requirements/009-journal-open-days-filter.md,
scripts/seed/journal.mjs, src/core/index/journal.ts, src/core/journal/closed.ts (new),
src/core/journal/index.ts, src/core/vault/frontmatter-order.ts, src/main/ipc/journal-day.ts,
src/main/ipc/journal.ts, src/renderer/components/DayList.tsx, src/renderer/components/Rail.tsx,
src/renderer/i18n/de-journal.ts, src/renderer/i18n/de.ts, src/renderer/i18n/en-journal.ts,
src/renderer/i18n/en.ts, src/renderer/lib/api.ts, src/renderer/lib/journal-filter.ts (new),
src/renderer/lib/journal-open.ts (new), src/renderer/lib/mock-bridge.ts,
src/renderer/lib/mock-fixtures.ts, src/renderer/lib/queries/journal.ts,
src/renderer/screens/journal/DayEntry.tsx, src/renderer/screens/journal/JournalScreen.tsx,
src/renderer/screens/journal/use-journal-keys.ts, src/renderer/styles/app/journal.css,
src/renderer/styles/app/shell.css, src/shared/ipc.ts, src/shared/types/domain.ts,
tests/core/index/journal.test.ts, tests/core/journal/day.test.ts,
tests/core/journal/streak.test.ts, tests/main/journal-gardener-flow.test.ts,
tests/main/journal-ipc.test.ts, tests/renderer/journal-open.test.ts (new),
tests/renderer/journal.test.tsx, tests/renderer/shell.test.tsx
