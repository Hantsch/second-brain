---
id: 049
title: One button closes the day
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-03
---

Part of M15. The user's feedback names the redundancy directly: "als abgeschlossen markieren" and
"Tag abschließen" both end the day, and it is not clear which one does what. Decided with the user
at the M15 cut (2026-09-03): one action. Touches the head actions in
[DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx),
[CloseProposal.tsx](../../src/renderer/screens/journal/CloseProposal.tsx) and the
`journal:setClosed` / `journal:close` / `journal:applyClose` channels in
[src/shared/ipc.ts](../../src/shared/ipc.ts). Follow-ups in M15's second part:
re-indexing a day that changed afterwards, and correcting the close summary.

## Requirement

There should be exactly one way to end a day, and it should be obvious what it does.

Today there are two: a manual switch in the header that only writes the `closed` field, and the
close-out below the text that runs the analysis, proposes facts, todos and frontmatter, and sets
the same field on accept. Two buttons for one intent, and the header one silently skips
everything the other does.

From now on: "Tag abschließen" is the one action. It runs the close-out, shows what it found, and
accepting it marks the day closed. Without a model configured the day can still be closed — it
just says honestly that nothing was extracted. Reopening a day stays possible; it is a correction,
not a main path.

## Acceptance Criteria

- [ ] The day header no longer offers a second "mark as finished" button as a primary action.
- [ ] "Tag abschließen" runs the close-out; accepting the proposal marks the day closed in the
      same write, and the day's badge shows it afterwards without a reload.
- [ ] Nothing is written before the user accepts (guardrail 2): running the close-out alone does
      not set `closed`, and discarding the proposal leaves the day exactly as it was — including
      still open.
- [ ] With no model configured, closing the day still works from the UI, states plainly that no
      facts or todos could be extracted, and sets `closed` once the user confirms — no dead end,
      no silent failure.
- [ ] A closed day can be reopened through the UI, and the story records where that action lives
      and why it is not a primary button.
- [ ] A day that is already closed does not offer a plain second close; the header states it is
      closed and on what date.
- [ ] The `journal:setClosed` channel keeps working (it is what reopen uses) and stays covered by
      a test; if the manual set-true path becomes unreachable from the UI, that is stated.
- [ ] `npm run seed && npm run shot` shows the single close action, a proposal, and a closed day's
      header.

## Open Questions

- ~~Q1: Where does "reopen" live? Proposal: a ghost action next to the closed badge in the
  header — visible only on a closed day, so the header carries exactly one action either way.~~
  answered → Decisions (Sprint)
- ~~Q2: With no model configured, does the confirmation still go through the proposal panel (an
  empty proposal with an honest statement), or through a plain confirm dialog?~~ answered →
  Decisions (Sprint)
- ~~Q3: Should closing also be reachable from the day list or the dashboard, or stays it inside
  the day?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Reopen lives as a ghost action next to the closed badge in the header — visible
  only on a closed day.
- **(User)** With no model configured, confirmation still goes through the proposal panel (an
  empty proposal stating honestly that nothing was extracted) — one path, one place where the
  day gets marked.
- **(User)** Closing stays reachable only from inside the day, not from the day list or the
  dashboard.

Decisions taken in refinement (not the user's — verified against the acceptance criteria, 047/048
and the guardrails):

- The merged action keeps the existing pair of channels: `journal:close` proposes,
  `journal:applyClose` writes. Reason: `applyClose` already sets `closed` in the same write
  (`closedMark` in [journal-day.ts](../../src/main/ipc/journal-day.ts) L196), so the merge needs no
  new channel and no new write path.
- The "als abgeschlossen markieren" button is removed together with the `finish.onMarkFinished`
  prop; the header keeps "Wieder öffnen" (ghost, closed days only) and "Datei öffnen". Reason: a
  prop nobody calls is dead code, and AC1 asks for the button to be gone, not hidden.
- On a closed day the close trigger is not rendered at all — badge plus reopen carry the state.
  Reason: AC6 forbids a plain second close, and `closedMark` would silently no-op on an already
  closed day, so the button would promise a write it does not do.
- The proposal's apply button is never `disabled` any more (only `loading`): a close always writes
  at least `closed`. Reason: today's `disabled={!writes}` in
  [CloseProposal.tsx](../../src/renderer/screens/journal/CloseProposal.tsx) L308 is exactly the
  dead end AC4 names.
- A `null` result from `journal:close` (the day has a file but no text) no longer swallows the
  click: the screen puts an **empty** suggestion into the date-keyed proposal store, built in
  [close-proposal.ts](../../src/renderer/lib/close-proposal.ts) from the day's path and the
  existing `journal.close.empty` text. Reason: without it, removing the header button would take
  away the only way to close a text-less day; keeping it in the renderer holds the fix in one
  layer and states it in the user's UI language instead of core's German close labels.
- A day without a file still cannot be closed (the trigger stays disabled while `view.data` is
  `null`). Reason: `journal:setClosed` and `applyClose` both refuse to create a day file, and
  inventing one on a close would write a day the user never wrote.
- Apply is relabelled to name both effects ("Übernehmen und abschließen" / "Apply and close"), and
  the `journal.close.nothing` / `journal.close.doneNothing` copy is corrected. Reason: after the
  merge "nothing written" is false — the close mark is always written.
- The manual set-**true** path of `journal:setClosed` becomes unreachable from the UI. The channel
  stays (reopen uses it with `closed: false`) and its set-true coverage stays where it is, in
  `tests/main/journal-ipc.test.ts`. Reason: AC7 asks for the statement, and the channel is not
  dead — only one of its two arguments is.
- Reopen stays `setClosed(false)` rather than an undo of the apply, and it only clears `closed` —
  todos and facts already written stay. Reason: it must work on any closed day, including one
  closed in an earlier session where no undo payload exists; that it is a correction and not a
  main path is why it is a ghost action.
- Layout, section order and the day/coach field key handling are not touched here — 047 owns the
  order and the close action's place, 048 owns the fields' keys and surfaces.

## Plan

The two close mechanisms become one. Nothing moves on the screen (047 already placed the close
action); what changes is which actions exist and what accepting a proposal does.

1. **Header, one action** — [DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx)
   L139-171: drop the "Als abgeschlossen markieren" button and narrow the `finish` prop to
   `{ busy, onReopen }`. Reopen stays a ghost next to the closed badge, "Datei öffnen" stays.
   [JournalScreen.tsx](../../src/renderer/screens/journal/JournalScreen.tsx) L539-544 drops
   `onMarkFinished`; `setClosed(true)` disappears from the renderer.
2. **Trigger only on an open day** — `JournalScreen.tsx` L370-382: `closeAction` also becomes
   `undefined` while `view.data.day.closed !== null` (in addition to the 018 rule that an open
   proposal takes the trigger's place).
3. **Accepting closes** — `CloseProposal.tsx` L303-312: remove `disabled={!writes}`; `writes`
   survives only as the condition for the informational line. Relabel apply, fix the
   `journal.close.nothing` and `journal.close.doneNothing` strings in
   [de-journal.ts](../../src/renderer/i18n/de-journal.ts) /
   [en-journal.ts](../../src/renderer/i18n/en-journal.ts). The write path itself is unchanged:
   `applyClose` already patches `closed` in the same write, and `mutations.applyClose`'s `onSuccess`
   already invalidates `qk.journal.day` and `qk.journal.list`, so the badge follows without a reload.
4. **No dead end on a text-less day** — `lib/close-proposal.ts` gains `emptySuggestion(date, path,
reason)`; `JournalScreen.tsx`'s `closeDay()` (L283-292) uses it instead of returning silently
   when `journal:close` yields `null`.
5. **Tests** — rewrite `describe('Tagebuch: Fertig markieren / wieder öffnen (009, D6)')` in
   [journal.test.tsx](../../tests/renderer/journal.test.tsx) L1596-1680 into the merged flow;
   extend `describe('Tagebuch: Tagesabschluss')` (L994) with the empty-proposal close.
   `tests/main/journal-ipc.test.ts` stays untouched — it is AC7's coverage.
6. **Shots** — extend `shootDayClose` in [shot.mjs](../../scripts/shot.mjs) L881 with a closed
   day's header (the seeded closed days are at offsets -7 and -8 in
   `scripts/seed/journal.mjs`).

Order: 1 → 2 → 3 → 4 → 5/6. Step 1 alone would leave a text-less day unclosable, so 4 must land in
the same story.

## Deliverables

**D1 — The header offers one action** (AC1, AC5, AC6-badge, AC7)
Files: `src/renderer/screens/journal/DayEntry.tsx`, `src/renderer/screens/journal/JournalScreen.tsx`,
`tests/renderer/journal.test.tsx` (rewrite the 009/D6 block, L1596-1680).
Remove the mark-finished button and the `finish.onMarkFinished` prop; keep the closed badge with its
date and the reopen ghost; update the doc comment on `finish` so it no longer describes a switch that
is gone. Acceptance: an open day's header has no "Als abgeschlossen markieren"; a closed day shows
"Abgeschlossen am {date}" plus "Wieder öffnen"; clicking reopen still sends
`journal:setClosed { closed: false, expectedHash }` and the badge disappears without a reload; a
conflict on reopen is still reported visibly. `tests/main/journal-ipc.test.ts` stays green untouched.

**D2 — The close trigger appears only on an open day** (AC6)
Files: `src/renderer/screens/journal/JournalScreen.tsx`, `tests/renderer/journal.test.tsx`.
Mirror the existing `proposal !== undefined` guard at L370. Acceptance: a closed day shows no
"Tag abschließen" anywhere on the screen; an open day with a file shows it exactly once; a day
without a file still shows it disabled.

**D3 — Accepting the proposal closes the day** (AC2, AC3, AC4)
Files: `src/renderer/screens/journal/CloseProposal.tsx`, `src/renderer/i18n/de-journal.ts`,
`src/renderer/i18n/en-journal.ts`, `tests/renderer/journal.test.tsx`.
Apply is enabled whenever a proposal is open; `writes` keeps driving only the "nothing to pull out"
line. Copy fix for `journal.close.apply`, `journal.close.nothing`, `journal.close.doneNothing`
(German strings use `„…“`; `tests/renderer/i18n.test.ts` pins key parity and the quote rule).
Acceptance: running the close-out alone sends no `journal:applyClose` and the day stays open;
"Verwerfen" leaves the day untouched and still open; apply sends `journal:applyClose` with the
frozen `expectedHash` and the badge appears afterwards without a reload; with a heuristic-only
suggestion (no model) the same path works and the heuristic note is visible.

**D4 — A day with no text is not a dead end** (AC4)
Files: `src/renderer/lib/close-proposal.ts`, `src/renderer/screens/journal/JournalScreen.tsx`,
`tests/renderer/close-proposal.test.ts`, `tests/renderer/journal.test.tsx`.
Add `emptySuggestion(date, path, reason)` — empty `todos`, `waitingOn`, `entities` and frontmatter,
`heuristic: false`, the reason from `t('journal.close.empty')`. Mirror the existing `setProposal`
call in `closeDay()`. Acceptance: with `journal:close` answering `null`, the click opens the panel,
the panel states that nothing could be pulled out, and apply then sends `journal:applyClose` with
`todos: []` and empty frontmatter; the store entry is still keyed by the clicked date, so switching
days does not carry the empty panel along.

**D5 — Screenshots** (AC8)
Files: `scripts/shot.mjs`.
Extend `shootDayClose` (L881): keep `journal-close-proposal`, then select a seeded closed day from
the day list and shoot `journal-day-closed`. Acceptance: `npm run seed && npm run shot` produces
both files, the proposal shot shows exactly one close action, the closed-day shot shows badge plus
reopen and no "Tag abschließen"; a missing state is pushed to `skipped` in the existing style
instead of failing silently.

## Model Hints

- D1, D2, D3, D4, D5 → default tier (Sonnet, effort `medium`). Each is a bounded renderer change in
  one layer with the tests to pin it.
- `Review: → story-review-hard` — this story removes one of the two ways a day could be closed;
  the failure it has to be checked for is a state where a day can no longer be closed at all (no
  text, no file, already-open proposal), plus guardrail 2, which breaks silently if anything is
  written before the user accepts.

## Test Plan (manual acceptance)

Run `npm run seed`, then start the app (`npm run dev`, or the `npm run shot` harness) and open
"Tagebuch".

1. **One action.** Today's day: the header carries only "Datei öffnen" — no "Als abgeschlossen
   markieren". Below the day's text stands exactly one "Tag abschließen".
2. **Nothing before accepting.** Click "Tag abschließen". The panel appears. Click "Datei öffnen"
   and check the frontmatter: no `closed`. Back in the app, click "Verwerfen" — the panel is gone,
   the header shows no badge, the file still has no `closed`.
3. **Accepting closes.** Click "Tag abschließen" again, then "Übernehmen und abschließen". Without
   reloading, the badge "Abgeschlossen am …" appears in the header and "Tag abschließen" is gone.
   The file now carries `closed: <today>`.
4. **Reopen.** Click "Wieder öffnen" next to the badge. The badge disappears, "Tag abschließen" is
   back, the file's `closed` is `null`. The todos and facts written in step 3 are still there.
5. **A day with no text.** On a day that has a file but empty prose (write a sentence, save, delete
   it, save again), click "Tag abschließen": the panel appears and says nothing could be pulled
   out; "Übernehmen und abschließen" still closes the day.
6. **Without a model.** In "Einstellungen", leave no model routed for the close tasks, then run
   step 3 again: the panel appears with the "ohne Modell" note (or the empty statement), and
   accepting still closes the day. No error card, no dead button.
7. **A closed day from the seed.** Pick one of the two seeded closed days in the list: the header
   states it is closed and on what date, and offers reopen — not a second close.

## Done
