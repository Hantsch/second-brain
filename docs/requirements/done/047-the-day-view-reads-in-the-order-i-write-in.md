---
id: 047
title: The day view reads in the order I write in
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. Comes straight from the user's feedback on the journal after using it: the day view
has all the right parts but not in the order the day is actually lived, and the field that should
carry the writing is not the field the eye lands on. Touches
[src/renderer/screens/journal/DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx) and
the slots [JournalScreen.tsx](../../src/renderer/screens/journal/JournalScreen.tsx) passes into
it. Sibling stories: [[048-the-field-i-write-in-is-visible-and-sends-when-i-say-so]] (the field's
look and its keys), [[049-one-button-closes-the-day]] (the close action this order places).

## Requirement

Opening a day should read top to bottom the way the day is written: what day it is, how I felt,
how much energy I had, an offer to be interviewed if I do not know where to start, then the one
big field I write into, then closing the day, then the facts that came out of it, and last the
conversation history.

Today the order is different (facts before the close, the close below the facts, the coach field
last but carrying a duplicate close button in the wide layout), and the day's own text field is
one section among several rather than the obvious place to write. The coaching conversation is
not being taken away — it moves to where it belongs: under the history it produces.

Concretely the order the user named:

1. Today (the day's header)
2. Mood
3. Energy
4. Interview
5. The free-text field to write into
6. Close the day
7. Facts
8. History

## Acceptance Criteria

- [x] Opening any day in the app shows those eight parts in exactly that order, top to bottom.
- [x] The day's own text field is visibly the primary place to write: it is the largest element
      on the screen, always editable, and needs no click into an edit mode first.
- [x] The close action sits directly below the text field and above the facts — in both the wide
      and the narrow layout, and exactly once on the screen (no second copy in the coach field's
      footer).
- [x] The coach field sits at the bottom, below the history, and its label says plainly that
      writing there talks to the coach rather than being the day's own entry.
- [x] Nothing that exists today is lost: people/project chips, the loose-end rows, the legacy
      conversation fold, the file-open action and the stance switch are all still reachable.
- [x] A close proposal, when one exists, still appears where the close action is — never below
      the facts it is about to write.
- [x] `npm run seed && npm run shot` produces a screenshot of a seeded day showing the new order,
      and one of the narrow layout.

## Open Questions

- ~~Q1: The people/project chips are not in the user's list. Proposal: keep them directly under
  the header (position 1b), since they describe the day rather than being written into it.~~
  answered → Decisions (Sprint)
- ~~Q2: The loose-end rows currently sit above the stream, inside the dialogue slot. Proposal:
  they travel with the history (position 8) — the day they were announced on is what the row
  already states.~~ answered → Decisions (Sprint)
- ~~Q3: The legacy conversation fold (story 011's migration) has no place in the user's list.
  Proposal: it stays directly above the history, since that is what folding it produces.~~
  answered → Decisions (Sprint)
- ~~Q4: Does the interview offer stay a full-width action row, or does it become a smaller
  secondary action now that it sits between the energy row and the writing field?~~ answered →
  Decisions (Sprint)

## Decisions (Sprint)

- **(User)** People/project chips position: directly under the header (position 1b) — they
  describe the day rather than being written into it.
- **(User)** Loose-end rows position: travel with the history (position 8) — the day they were
  announced on is already stated in the row.
- **(User)** Legacy conversation fold position: stays directly above the history — the result of
  folding sits right before what it produces.
- **(User)** Interview offer becomes a smaller secondary action, since it now sits between the
  energy row and the writing field rather than as a full-width row.
- The day's text field becomes an always-rendered textarea (`rows={12}`); the pencil edit trigger
  and the "nothing written yet → render nothing" branch in `DayText.tsx` are removed, because AC 2
  ("always editable, no edit mode first") cannot be met by an edit-mode component.
- "Cancel" on the day field now means "drop the draft, fall back to the file's text"; the frozen
  hash, the conflict card and the external-change bar stay exactly as they are — the conflict
  guarantee from CLAUDE.md is not what this reordering is allowed to touch.
- The day field's key behaviour stays untouched (`Ctrl+Enter` still saves, `Esc` still discards the
  draft) — 048 owns that and has its own user decision on it; 047 must not pre-empt it.
- `.sb-journal-footer` loses `position: sticky` and becomes a plain last section: its only reason
  was to keep "close the day" above the visible window edge, and that button leaves the composer in
  this story. A permanently pinned coach bar would also contradict AC 2 and AC 4.
- `useNarrow()` in `JournalScreen.tsx` and `CoachComposer`'s `footerAction` prop are deleted rather
  than left unused, since AC 3 puts the close action in one place for both layouts.
- The day's own prose stays visible inside the history as `entry` blocks (`EntryStream` untouched):
  filtering it out would remove the interleaving that lets a coach answer be checked against the
  paragraph it replies to, so the duplication with the field above is accepted for now.
- The coach field's label becomes „Mit dem Coach sprechen“ / "Talk to the coach"; the stance switch
  sitting directly below it keeps the honest nuance that „Zuhören“ files verbatim without asking a
  model (AC 4).
- Autofocus on a fresh day, and the focus returned when the interview dialog closes, both move from
  the coach field to the day's text field — that is the primary place to write now (AC 2).
- The interview button renders as `variant="secondary" size="sm"` unconditionally; the `dayEmpty`
  accent juggling in `JournalScreen.tsx` disappears with it, since the one teal accent now belongs
  to the day field's own save action.
- `journal.day.edit` is deleted from both catalogues — its only caller is gone, and a key nobody
  calls is a text nobody maintains.
- AC 7 reuses the existing `journal.png` / `journal-narrow.png` steps in `scripts/shot.mjs`; only
  the now-wrong sticky-footer comment and workaround in `shootDayClose` get corrected. No new
  screenshot step is needed.

## Plan

Pure restructuring of the day column. The target order in `DayEntry.tsx`:

```
1   head        date, path, closed badge, head actions (file open, mark finished)
1b  chips       people / projects
2   mood        MoodPicker "mood"
3   energy      MoodPicker "energy"
4   interview   interviewAction, secondary + sm
5   day text    DayText — always editable, rows=12, the largest element
6   close       proposal ?? closeAction (never both, never below the facts)
7   facts       FactsSection
8   history     legacy fold, then dialogue (loose-end rows + EntryStream)
9   coach       CoachComposer — last, labelled as the coach's field
```

Steps, in order:

1. `DayEntry.tsx` — reorder the JSX to the list above (chips before the levels, day text before
   facts, proposal/close between them, legacy fold before `dialogue`), rewrite the header comment
   and the slot docs that describe the old order.
2. `DayText.tsx` — drop the edit-mode gate: one textarea, value `draft ?? text`, `rows={12}`, the
   `editLabel` as its permanent label. Hash freeze, conflict card and external-change bar stay.
   New optional `fieldRef` so the screen can focus it.
3. `JournalScreen.tsx` / `CoachComposer.tsx` / `journal.css` — one close action for both layouts:
   `closeAction` always goes to `DayEntry`, `footerAction` and `useNarrow()` are gone,
   `.sb-journal-footer` becomes static and `.sb-journal-footer-close` is removed.
4. `JournalScreen.tsx` / `i18n` — interview always secondary+sm, focus goes to the day field,
   coach label renamed.
5. `tests/renderer/journal.test.tsx` — pin the order, the always-editable field, the single close
   button; adapt the assertions that drove the pencil trigger.
6. `npm run seed && npm run shot`, fix the stale comment in `shootDayClose`.

Not in this story: the fields' surface, border and key behaviour (048), and the redundancy between
"mark as finished" and "close the day" (049). The field and the close action stay clean seams —
047 only decides where they sit.

## Deliverables

**D1 — the eight sections in the user's order.** [x]
`src/renderer/screens/journal/DayEntry.tsx` only (JSX order + header comment + the `proposal` /
`closeAction` / `legacy` prop docs that still describe the old order).
Accepted when: the rendered DOM order is head → chips → mood → energy → interview → day text →
proposal/close → facts → legacy → history → composer, and every slot that exists today is still
rendered exactly once.

**D2 — the day's field is always the field.** [x]
`src/renderer/screens/journal/DayText.tsx`, `src/renderer/i18n/de-journal.ts`,
`src/renderer/i18n/en-journal.ts`.
Accepted when: the textarea renders on every day (fresh, empty and written), needs no click first,
carries `rows={12}` and the permanent `journal.day.editLabel`; the pencil `IconButton` and the
`journal.day.edit` key are gone; "Cancel" restores the file's text; the frozen-hash logic,
conflict card and external-change bar behave exactly as before (existing conflict tests stay
green, untouched).

**D3 — one close action, both layouts.** [x]
`src/renderer/screens/journal/JournalScreen.tsx`,
`src/renderer/screens/journal/CoachComposer.tsx`,
`src/renderer/screens/journal/DayEntry.tsx` (`closeAction` becomes required),
`src/renderer/styles/app/journal.css`.
Accepted when: `closeAction` is passed unconditionally, `footerAction` and `useNarrow()` no longer
exist, `.sb-journal-footer` is static with no `box-shadow` and no narrow-window override left for
it, `.sb-journal-footer-close` is removed, and the button appears exactly once at 1440 px and at
1152 px. Colours/spacing keep coming from tokens only.

**D4 — interview, focus and the coach's label.** [x]
`src/renderer/screens/journal/JournalScreen.tsx`, `src/renderer/screens/journal/DayText.tsx`
(consume `fieldRef`), `src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`.
Accepted when: the interview button is always `secondary`/`sm` and `dayEmpty` is gone; a day
without a file focuses the day's text field, and closing the interview dialog returns focus there
too; `journal.field.label` says plainly that this field talks to the coach, in both languages,
with the `„…“` pair on the German side.

**D5 — the order and the single button are pinned by tests.** [x]
`tests/renderer/journal.test.tsx`.
Accepted when: one test asserts the DOM order of the eight sections, one asserts the day's field is
editable without any preceding click, one asserts exactly one "Tag abschließen" button, one asserts
the proposal renders above the facts; the assertions that used the pencil trigger are rewritten to
the new path (not deleted), and `expectNoViolations` still passes.

**D6 — screenshots.** [x]
`scripts/shot.mjs` (comment/workaround in `shootDayClose` only).
Accepted when: `npm run seed && npm run shot` is green, `.screenshots/journal.png` and
`journal-narrow.png` show the new order, `journal-close-proposal.png` shows the proposal above the
facts, and no journal gate finding is reported.

## Model Hints

- D2 → `deliverable-hard` — the day text's frozen-hash/conflict path is the app's data-loss guard;
  turning the component from edit-mode into always-editable rewrites exactly the state that decides
  which hash a save goes out with.
- D1, D3, D4, D5, D6 → default.
- Review: → `story-review-hard` — the diff spans five files across markup, CSS and i18n, and one of
  them is the write path that CLAUDE.md's conflict guarantee depends on.

## Test Plan (manual acceptance)

Through the running app (`npm run seed && npm start`), on a seeded day with prose, facts and
history:

1. Open the journal. Read the day top to bottom: date, chips, mood, energy, interview button, the
   big text field, "Tag abschließen", facts, history, the coach's field last.
2. Click straight into the big text field and type — no edit button first. It is visibly the
   largest element on the page.
3. Count the "Tag abschließen" buttons: exactly one. Resize the window below 1152 px and count
   again: still exactly one, still directly below the text field.
4. Click "Tag abschließen": the proposal appears where the button was — above the facts, with the
   day's text still visible.
5. Read the coach field's label: it says this field talks to the coach. Switch the stance and open
   the file via the header action — both still work.
6. Open a day that has no file yet: the cursor sits in the day's text field. Start the interview,
   close it — the cursor is back in the day's text field.

## Done

The day column now renders in the user's read order — head, people/project chips, mood, energy,
a secondary-sized interview action, the day's own text field, close action/proposal, facts, the
legacy conversation fold, dialogue history, then the coach's field last with an honest label. The
day field is a permanently rendered, always-editable `rows={12}` textarea (no pencil edit gate);
its frozen-hash/conflict guard now arms on first keystroke instead of on "enter edit mode" and is
covered by four new tests, including the in-flight-keystroke and external-hash-release cases. The
close action exists exactly once for both layouts (`closeAction` required, `footerAction` and
`useNarrow()` removed, `.sb-journal-footer` no longer sticky). Autofocus and the interview
dialog's returned focus both target the day field. `journal.day.edit` was removed from both i18n
catalogues as dead.

Decisions made during the resumed build (not user decisions):

- Kept the pre-existing rule that the day text field disables its own save button when the draft
  is empty after trimming (`DayText.tsx`); this predates the story and is not something 047's
  reordering was asked to change, but it is now the sole write path for the day's text since the
  edit-mode gate is gone. Left as-is — not a regression, and changing save-when-empty semantics is
  outside this story's scope.

Verification: `npm run format:check` (story files clean; the 241 pre-existing unrelated warnings
are untouched files, not this story's scope), `npm run lint`, `npm run typecheck`, `npm test`
(3561/3561, 251 files), and `npm run build` all green. Live smoke: `npm run seed && npm run shot`
ran clean with no console errors; `04-journal.png`, `journal-narrow.png` and
`15-journal-close-proposal.png` were inspected directly and confirm the eight-section order, the
single close action above the facts, and the coach field's honest label at the bottom, in both
layouts. A fresh `story-review-hard` review (independent of the build) returned **PASS** on all
seven acceptance criteria, confirmed the conflict guarantee holds under the D2 rework, and raised
only three low-severity, no-action-needed notes (a pre-existing empty-save guard, one unrelated
but harmless comment fix in `EntryStream.tsx`, and a pre-existing straight-quote pattern already
present elsewhere in the test file).

Commit message: `047: day view reads top to bottom in write order`
