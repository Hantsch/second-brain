# S13 test plan — the day column reads in the order I write in

Sprint S13 shipped three stories that reshape the journal's day view: the eight sections
render in the order the day is actually lived, with the day's own text field as the
obvious place to write (047); both journal fields — the day's field and the coach's field
— sit on a visible surface and only file on their button, never on a keypress (048); and
"Tag abschließen" / "Close the day" became the single way to end a day, replacing the old
two-button redundancy (049). This document is a step-by-step guide for a non-technical
test user to check that work through the real, running UI — no console command beyond
starting the app and seeding the demo vault.

## Preparation

1. Open a terminal in the project folder (see the project's `README.md` for the full
   command list).
2. Run `npm run seed`. This builds a demo vault (`.demo-vault/`) with realistic sample
   journal content, including several closed days (two of the seeded days already carry
   a `closed` date) and several open days with prose, mood/energy, facts and coaching
   history.
3. Run `npm run dev`. This starts the app with hot reload. Wait until the window opens,
   then click **Journal** in the left rail (or press its shortcut if you know it).
4. Note on language: the app's UI language and document language are independent, set
   under **Settings → Languages**. Where a step below quotes both a German and an
   English label, that is the same button in the two UI languages, not something you
   need to switch.
5. Note on the model: the seeded vault ships with no LLM provider routed for the
   journal's coaching or close-out tasks. That is intentional — several steps below
   exist specifically to check the app's behaviour *without* a model. Where a step
   needs a real model to see the golden path, it says so and names the alternative
   check to run instead.

---

## Use case 1 — The day reads top to bottom in the order it is written (story 047)

**Steps**

1. In the day list on the left, click **Today** (or whichever day is selected by
   default).
2. Read the detail column on the right from top to bottom, without scrolling past
   anything.

**Expected result**

You encounter, in exactly this order, and each exactly once:

1. The spelled-out date as a heading (e.g. "Thursday, 3 September 2026"), with the
   file's path in monospace next to it.
2. People/project chips, if the day has any (some seeded days do, e.g. ones that name a
   project).
3. A mood picker.
4. An energy picker.
5. A small, secondary-styled "Start interview" / "Interview starten" button — clearly
   smaller than the text field below it, not a full-width row.
6. A large text field labelled "Text of the day" / "Tag" — the single biggest element on
   the page.
7. Directly below that field: either the "Tag abschließen" / "Close the day" button, or
   — if you already triggered a close-out and its proposal is open — the proposal panel
   in that same spot (see use case 5).
8. A facts section.
9. If the day has an old-style folded conversation notice, it appears next, directly
   above the history.
10. The conversation history (the day's own paragraphs interleaved with any coaching
    replies).
11. The coach's own field, at the very bottom, labelled "Talk to the coach" /
    "Mit dem Coach sprechen" — visibly a different field from the day's own text field
    higher up.

**Steps (continued)**

3. Resize the app window to be quite narrow (below roughly 1150 px wide — drag the
   window edge, or use your OS's snap-to-half-screen).
4. Read the same day again, top to bottom.

**Expected result**

- The order from the wide layout is unchanged; nothing swaps position.
- Count the "Tag abschließen" / "Close the day" buttons on the page: exactly one, still
  directly below the day's own text field — not a second copy near the coach field at
  the bottom.

---

## Use case 2 — The day's text field is the obvious place to write (story 047)

**Steps**

1. On any day, without clicking any "edit" button first, click directly into the large
   text field (position 6 from use case 1) and type a sentence.

**Expected result**

- The cursor appears and the sentence is typed immediately — there is no pencil/edit
  icon to click first, and no separate "view" state to leave.
- The field remains the visually largest element on the page while you type.

**Steps (continued)**

2. In the day list, pick a date that has no journal entry yet (e.g. click a day several
   weeks in the future via the month calendar above the list, or use the calendar's
   navigation arrows to reach a month with no seeded content, then click an empty day).

**Expected result**

- The day's own text field already has the text cursor in it (focus), with no click
  needed — you can start typing immediately.

3. Click the small "Start interview" / "Interview starten" button, then close the
   interview dialog that opens (its close control, or `Esc`).

**Expected result**

- After the dialog closes, the cursor is back in the day's own text field, not
  somewhere else on the page.

---

## Use case 3 — Both journal fields are visibly writing surfaces (story 048)

**Steps**

1. On any day, look at the day's own text field and the coach's field at the bottom,
   both while unfocused (click elsewhere on the page first, e.g. the date heading).

**Expected result**

- Both fields sit inside a visibly darker/framed box with its own border, clearly
  distinguishable from the page background around it — not flush with the page.

2. Click (`Tab` also works) into the day's field, then into the coach's field.

**Expected result**

- Each field shows a clear, teal-tinted focus ring around it the moment it is focused.

---

## Use case 4 — Neither field files on a keypress (story 048)

**Steps**

1. Click into the day's own text field and type a short sentence.
2. Press `Enter`. Then press `Shift+Enter`. Then press `Ctrl+Enter` (or `Cmd+Enter` on
   macOS).

**Expected result**

- Each of the three key combinations only inserts a line break in the field — the text
  grows by a blank line each time, nothing is written to disk, and no "Saved." /
  "Gespeichert." note appears anywhere near the field.

3. Read the hint line below the field.

**Expected result**

- It plainly states that only the "Save" / "Speichern" button commits the text — it
  does not name a key that saves.

4. Click the "Save" / "Speichern" button.

**Expected result**

- The "Saved." / "Gespeichert." note now appears next to the field.

5. Type another sentence in the same field, then press `Esc`.

**Expected result**

- Focus leaves the field (e.g. click back into it and note the cursor was gone), but
  the sentence you typed is still there — `Esc` does not discard it. Discarding only
  happens if you click "Cancel" / "Abbrechen" (do not click it here if you want to keep
  testing with this day's text).

6. Repeat steps 1–5 in the coach's field at the bottom, substituting the "Say it" /
   "Sagen" (or "Save and ask" / "Speichern und fragen", depending on the selected
   stance) button for "Save", and checking that no turn appears in the conversation
   history until you click that button.

**Expected result**

- Same behaviour as the day's field: all three key combinations only break the line, no
  turn is added to the history until the button is clicked, and the hint line names the
  button, not a key.

7. From the day's field, press `Tab` once, then `Enter` (or `Space`).

**Expected result**

- `Tab` lands on the "Save" / "Speichern" button (you can see its focus ring), and
  `Enter`/`Space` activates it, saving the field's text — the button is reachable
  without a mouse.

8. From the coach's field, press `Tab` (you will pass over the stance switch first),
   then `Enter`/`Space`.

**Expected result**

- The send button receives focus after the stance switch and activates the same way.

9. Open the **Ask** screen (a different screen in the rail) and repeat step 2 with a
   question typed into its field.

**Expected result**

- On the Ask screen, plain `Enter` still asks the question immediately (this screen was
  not changed by this sprint); `Shift+Enter` still only breaks the line. This confirms
  the "no keypress files it" change is confined to the journal's two fields.

---

## Use case 5 — One button closes the day, and nothing is written before you accept (story 049)

**Steps**

1. Pick an open (not yet closed) day from the list — one with some written text, e.g.
   today.
2. Look at the day's header, next to the date: confirm there is no "Mark as finished" /
   "Als abgeschlossen markieren" button there — only "Open file" / "Datei öffnen" (and,
   only on a closed day, a reopen action — see step 8).
3. Click "Tag abschließen" / "Close the day" (directly below the day's own text field).

**Expected result**

- A panel appears in that same spot, in place of the button, showing what the app found
  (or, if no model is configured for this task, an honest statement that nothing could
  be extracted — see use case 6 for that path specifically).

4. Without clicking anything else in the app, open the day's Markdown file directly (use
   "Open file" / "Datei öffnen" in the header, or navigate to it in your file manager —
   the path is shown next to the date) in a text editor.

**Expected result**

- The file's frontmatter shows no `closed` field yet (or `closed: null`) — running the
  close-out alone has written nothing.

5. Back in the app, click "Discard" / "Verwerfen".

**Expected result**

- The panel disappears, the header still shows no closed badge, and "Tag abschließen"
  reappears in its place. Re-checking the file confirms `closed` is still unset.

6. Click "Tag abschließen" again, then click "Apply and close" / "Übernehmen und
   abschließen".

**Expected result**

- Without reloading the app, the header now shows a green "Closed on …" / "Abgeschlossen
  am …" badge, and "Tag abschließen" is gone from below the text field.
- Re-opening the file confirms it now carries a `closed` date.

**Steps (continued)**

7. On the same now-closed day, check below the text field again.

**Expected result**

- No close trigger is offered there at all — the badge plus the reopen action (next
  step) are the only affordances for a closed day; there is no way to trigger a second
  close.

8. In the header, next to the closed badge, click "Reopen" / "Wieder öffnen".

**Expected result**

- The badge disappears, "Tag abschließen" reappears below the text field, and the file's
  `closed` field is cleared again. Any todos or facts that were written when you closed
  the day in step 6 are still present — reopening only undoes the closed mark.

9. Pick one of the two seeded days that already carry a closed badge (scroll the day
   list, or check the days named in the Preparation section).

**Expected result**

- The header states plainly that the day is closed and on what date, and offers only
  "Reopen" — never a second "Tag abschließen".

---

## Use case 6 — Closing a day with no text, and with no model configured (story 049)

**Steps**

1. Open a day, write one short sentence in its text field, save it, then delete the
   sentence and save again so the field is empty (or pick a day that already has a file
   but effectively no prose).
2. Confirm no model is routed for the day-close task: go to **Settings → Models** and
   check that no model is assigned to the close-out task (this is the seeded default).
3. Back in the journal, on that day, click "Tag abschließen" / "Close the day".

**Expected result**

- The panel still opens (it is not a dead button) and states plainly that nothing could
  be pulled out of the day — no todos, no facts.
- "Apply and close" / "Übernehmen und abschließen" is still available (not greyed out)
  and, when clicked, still marks the day closed — checked the same way as use case 5,
  step 6 (badge appears, file gets a `closed` date).

---

## Known gaps for this test round

- **Story 048's accessibility acceptance criterion** ("the accessibility report from
  `npm run a11y` shows no new finding on the journal screen") is a build-pipeline check,
  not something driven through clicking in the running app. Use case 3 above covers the
  same intent through the real UI (visible border, visible focus ring on both fields);
  running `npm run a11y` separately is the maintainers' own verification step for the
  underlying axe-core report and is not repeated here as a user-facing test step.
- **Story 049's acceptance criterion on `journal:setClosed`'s manual set-true path**
  states that this path becomes unreachable from the UI on purpose (the header's old
  "mark as finished" switch is gone; only "reopen", which always sends `closed: false`,
  remains). There is therefore no UI step in use case 5 that exercises "manually mark a
  day closed without running the close-out" — that path no longer exists by design, and
  its removal is exactly what use case 5, step 2 checks.
- **Screenshots** for both stories (`journal.png`, `journal-narrow.png`,
  `journal-close-proposal.png`, `journal-day-closed.png`) are produced by
  `npm run seed && npm run shot`, which is the maintainers' own build-verification step,
  not a substitute for the click-through steps above.
