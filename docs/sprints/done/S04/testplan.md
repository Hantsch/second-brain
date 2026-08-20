---
sprint: S04
kind: manual acceptance test plan
doc-language: en
stories: [011, 012, 009, 010]
ui-acceptance-required: true
---

# Sprint S04 — manual acceptance test plan

Five use cases, all of them driven through the running app. The UI of this app is
German by default (`languages.ui: de` in the seed), so every label quoted below is the
German string you actually see; the plan itself is English. The one console command in
this plan starts the app; a couple of steps also ask you to open a day's file in a text
editor — that is not a workaround, it is the guardrail "the files are the truth" under
test, the same pattern earlier sprints' plans use. Anything a story's acceptance
criteria claim that this plan genuinely cannot reach through clicking and typing is
listed under [Gaps](#gaps) at the end.

Sprint S04 rebuilt the Journal screen (rail item 3, key `3`): one writing surface with a
stance instead of a Day/Talk tab split (011), an interview overlay for the days you
don't know how to start (012), a "not finished" filter on the day list (009), and a
month calendar above that list (010).

---

## Global preparation

Run once, before the first use case, in the repo root
(`C:\development\Hantsch\second-brain`).

### 1. Build the demo vault

PowerShell:

```powershell
npm run seed
```

This writes `.demo-vault\` with about a dozen journal days spread over the last three
weeks (with gaps — nobody writes every day), plus two sparse entries about 40 and 42
days back so the calendar has a second month to page into. Two of the past days are
already marked finished; the rest are open. One day still carries the old, no-longer
written `## Gespräch` legacy section; one day is a pure interview transcript; today's
day already has a paragraph of its own.

### 2. Start the app on the demo vault

PowerShell:

```powershell
$env:SB_VAULT = "$PWD\.demo-vault"; npm run dev
```

Bash:

```bash
SB_VAULT="$PWD/.demo-vault" npm run dev
```

`SB_VAULT` beats the vault history, so the app opens the demo vault without touching
whatever vault you normally work in. Where a use case says "reopen the day list", that
means navigating away (e.g. rail item 1, "Dashboard") and pressing `3` again — no
restart needed unless a step says so explicitly.

### 3. Open the journal

Press `3`, or click "Tagebuch" in the rail. The screen shows, left to right: the month
calendar and day list in a narrow side column, then the open day — header (date, mood,
energy, people/project chips), the "Interview starten" button, the day's text, the
timeline (`Verlauf`) of prose and app answers, and the writing field with the stance row
at the bottom.

### 4. Whether a model is connected

The demo vault ships with no journal content that depends on one, but whatever LLM
provider your machine already has configured under **Settings → Modelle** (rail item 7,
tab "Modelle") stays configured — `npm run seed` never touches it, because provider
settings live outside the vault. Use case 1 needs a model routed to the task "Tagebuch-
Gespräch" to see a real streamed answer for "Tipps"/"Analysieren"; use case 2
deliberately removes it. If you don't have a local runtime such as Ollama or LM Studio
running, Settings → Modelle can still connect a remote provider (OpenAI, Anthropic, an
OpenAI-compatible endpoint) with your own API key via "Provider hinzufügen" — entirely
through the UI, no console call. If you have neither at hand, do use case 2 first (it
needs no model at all) and treat the "Tipps"/"Analysieren" half of use case 1 as
optional; see [Gaps](#gaps).

---

## Use case 1 (story 011) — Writing a day with each stance

**Preparation:** journal open, "Heute" selected (it's the default). The seed's settings
default the stance to "Tipps" — you'll switch it. A model is routed to "Tagebuch-
Gespräch" (see step 4 of Global preparation) for the "Tipps"/"Analysieren" parts.

**Steps**

1. Look at the stance row above the field ("Haltung: Zuhören · Tipps · Analysieren").
   There is no "Tag"/"Gespräch" tab anywhere on the screen — one field, one stance row.
2. Click "Zuhören" (or press `Ctrl+1`). Read its hint line: "Zuhören: wird abgelegt, ohne
   Antwort und ohne Rückfrage."
3. Type a sentence into the field ("Kurzer Test für Zuhören.") and click "Sagen" (the
   send button's label itself changes to "Sagen" only in this stance).
4. Watch the timeline ("Verlauf") section below.
5. Open today's file (`.demo-vault\journal\<year>\<month>\<today>.md`) in a text editor
   and look at the end of the `## Tag` section.
6. Back in the app, click "Tipps" (or `Ctrl+2`). Type a sentence about the day ("Der
   Nachmittag war zäh, zu viele offene Enden gleichzeitig.") Note the button now reads
   "Speichern und fragen"; click it.
7. Watch the timeline immediately after clicking, then once the answer finishes.
8. Click "Analysieren" (or `Ctrl+3`). Type a sentence naming a problem ("Ich schiebe die
   Ladezeiten im Kundenportal seit Tagen vor mir her.") and click "Speichern und
   fragen".
9. Read the resulting answer and, if any earlier days are listed under "Ähnlich klang es
   an diesen Tagen", click one.

**Expected result**

- Step 3/4: your sentence appears at once at the end of the timeline as a plain
  paragraph — no speaker header, no timestamp, rendered as you typed it (it is not
  interpreted as Markdown). The field clears. No answer appears below it, ever — "Zuhören"
  never contacts a model.
- Step 5: your sentence sits as an ordinary line of prose inside `## Tag`, with no
  `> **Second Brain**` quote around it.
- Step 7: your paragraph appears the same plain way immediately; the reply grows in
  underneath it inside a block headed "Second Brain — HH:MM" (mono time), rendered
  through Markdown (it may hold a short list) — the header and the quote-styled block are
  what make it legible as the app's words, never mixed into your own paragraph.
- Step 9: the "Analysieren" answer stays grounded in what your entries actually say (no
  claim it can't back); clicking a listed day jumps the whole screen to that day (its
  file, its content) — from there you can navigate back with `3` or the day list.
- Throughout: your own words are always plain, undecorated prose; every one of the app's
  words carries the "Second Brain" header and a timestamp. There is no point where the
  two are visually interchangeable.

---

## Use case 2 (stories 011 + 012) — With no model configured

**Preparation:** journal open. Remove any configured model first: **Settings → Modelle**,
and for every provider card listed, click "Entfernen" then confirm "Ja, entfernen" —
repeat until the "Provider" panel says there are none and the "Aufgaben-Routing" table
shows "ohne Modell" for every row, including "Tagebuch-Gespräch". (Note what you removed
if you want to reconnect it afterward — this plan doesn't restore it for you.)

**Steps**

1. Press `3` to return to the journal, select "Heute".
2. With the stance on "Zuhören", type a sentence ("Test ohne Modell.") and click "Sagen".
3. Look at the timeline and the field.
4. Click "Interview starten" (on any day — an empty day makes it the primary, teal
   button; on today, which already has text, it's the secondary outline button, which is
   fine for this check).
5. Read the line under the dialog's title, above the first question.
6. Answer the first question and click "Antworten und weiter". Read the next question.

**Expected result**

- Step 3: the sentence is filed exactly as in use case 1 — nothing about "Zuhören" ever
  depends on a model in the first place, so this step behaves identically with or
  without one. No error, no stuck state.
- Step 5: "Fester Fragenkatalog — kein Modell nötig." — stated plainly, not inferred by
  you from an absence.
- Step 6: the interview keeps running through its fixed five-topic question set (work,
  events, people, what's open, how it felt) one at a time, exactly like use case 3 below
  — a missing model changes nothing about the question flow, only that no optional
  follow-up question is ever inserted.

---

## Use case 3 (story 012) — The interview, from an empty day

**Preparation:** journal open, a model routed to "Tagebuch-Gespräch" restored if you
want to see the optional follow-up question too (it's not required for the rest of this
use case). Pick a day the seed left empty: in the day list on the left, find a gap row
between two dated rows a few days apart and click the calendar day that falls into that
gap (any day the calendar shows without an entry dot and that is not greyed out as
future) — for example the day right before the entry dated 4 days back. The day opens
empty: no `## Tag` text yet, just mood/energy pickers, "Interview starten" as the
primary teal button, and the field.

**Steps**

1. Click "Interview starten".
2. Read the first question (rendered as an app turn, "Second Brain" header). Type a short
   answer and click "Antworten und weiter".
3. Open the day's file in a text editor
   (`.demo-vault\journal\<year>\<month>\<that-day>.md`) — it did not exist before step 1;
   check it now exists and holds the question as a quote block followed by your answer
   as plain prose.
4. Back in the app, read the second question. Click "Überspringen" without typing
   anything.
5. Read the third question — the interview kept going.
6. Reopen the file from step 3: confirm nothing about the skipped question was written
   (no orphan question, no empty answer).
7. Click "Verlassen und selbst schreiben" (or press `Esc`).
8. Look at where the text cursor lands, and at the day's timeline.
9. Type one more sentence yourself into the field and click "Sagen" or "Speichern und
   fragen" depending on the stance shown.
10. Click "Interview starten" again on the same day.
11. Let it run to the end (answer or skip every remaining question).

**Expected result**

- Step 2: exactly one question is visible at a time — no wall of questions.
- Step 3: the answer already reached the file before you moved to the next question —
  confirmed by opening it right there, not by trusting the dialog.
- Step 5: skipping did not end the interview and did not write anything for the skipped
  topic.
- Step 8: the overlay closes, focus lands back in the day's own writing field, and every
  question/answer pair you completed (steps 2 and any others before leaving) is already
  visible in the day's timeline — leaving early lost nothing.
- Step 10/11: the second run does not re-ask what you already answered or skipped over
  cleanly-covered ground from the first run; it runs to the end and the closing panel
  says: "Das Interview ist für heute durch — Übersprungenes bleibt offen. Stimmung und
  Energie warten noch auf die Regler oben im Tag." — an honest statement, not a claim
  that every topic got a real answer.

---

## Use case 4 (story 009) — The "not finished" filter

**Preparation:** journal open, day list visible in the side column.

**Steps**

1. Look at the checkbox above the list, "Nur offene Tage" — it is off, and the line
   above the list reads the total day count ("… Tage mit Eintrag").
2. Turn the checkbox on.
3. Read the line above the list and scan the rows.
4. Press `ArrowDown`/`ArrowUp` (or `j`/`k`) a few times.
5. Pick one of the open days in the filtered list (not "Heute") and open it. Look at its
   header.
6. Click "Als abgeschlossen markieren".
7. Look at the header, then at the filtered list.
8. Click "Wieder öffnen" on the same day.
9. Leave the journal (rail item 1, "Dashboard"), then come back (`3`).
10. Repeat clicking a filtered day's row, opening it, and clicking "Als abgeschlossen
    markieren" until the filtered list holds nothing below "Heute" (this takes several
    repeats — the seed leaves roughly a dozen days open).
11. Look at the list and the rail's own "Tagebuch" item.

**Expected result**

- Step 3: only past days without a close marker remain in the list, plus "Heute" (always
  first, never itself counted as open); the count line above the list now reads e.g.
  "N Tage offen" / "Ein Tag offen"; no "N Tage ohne Eintrag" gap row appears anywhere
  while the filter is on.
- Step 4: the arrow keys only walk the rows that are actually visible — they skip
  whatever the filter hid.
- Step 5: the header of an open day offers "Als abgeschlossen markieren", no badge.
- Step 7: the header now shows a green "Abgeschlossen am {date}" badge with today's date;
  back in the filtered list, that day is gone (no reload needed).
- Step 8: the badge disappears and the day reappears in the filtered list, without a
  reload.
- Step 9: the checkbox is still on after leaving and returning — the filter state
  survives navigating away within the same session.
- Step 10/11: once every day but "Heute" is closed, the list shows "Nichts offen. Jeder
  vergangene Tag ist abgeschlossen." instead of going blank; "Heute" is still there and
  still reachable; the rail's "Tagebuch" item, which carried a numbered pill while any
  day was open, now shows no pill at all (the way into the journal itself never
  disappears — only the notification pill does).
- Reopen the days you closed in step 10 afterward (click "Wieder öffnen" on each, or
  leave them closed if you don't need the demo vault's original state back) — this plan
  doesn't require restoring them, but doing so keeps the vault representative for anyone
  running this plan again after you.

---

## Use case 5 (story 010) — The month calendar

**Preparation:** journal open. The calendar sits above the day count and the day list,
showing the current month, expanded by default.

**Steps**

1. Look at today's cell and whichever cell is currently selected (normally the same
   one, "Heute") — then click a different day with an entry so the two differ, and
   compare the two cells' look.
2. Look across the grid: cells with an entry carry a small dot (a mood-coloured dot if
   the day has a mood set, a plain dot otherwise); cells without an entry carry neither —
   check this without hovering anything.
3. Click a day cell that has an entry dot. Watch the day panel on the right and the day
   list's own selection.
4. Click the "‹" (previous month) button, then "›" (next month), then the "Heute" button
   in the calendar's toolbar.
5. Keep clicking "‹" until you reach a month with no entries at all (the seed's two
   sparse days sit about 40/42 days back — a couple of months of paging back should
   reach a fully empty one, depending on today's date).
6. In the demo vault's day list, find a day at least a couple of days in the future
   (backfill isn't part of the seed, so any future date has no file) and click its cell
   in the calendar.
7. Click the collapse toggle (the chevron button at the right of the calendar's
   toolbar).
8. Navigate away (rail item 1) and back (`3`).
9. Click the expand toggle to bring the grid back.
10. Click into the grid once (it takes exactly one tab stop) and use the arrow keys:
    left/right moves a day, up/down moves a week, crossing past the start or end of the
    month pages it automatically. Press `Home` and `End`. Press `PageUp`/`PageDown`.
11. Click a row in the day list itself and press `j`/`k`/arrow up/down — confirm day
    switching there still works exactly as before, unaffected by the grid's own arrow
    handling.
12. Find a past day in the calendar that has a file but no closed badge (an open day) and
    look at its cell's markers, then find "Heute"'s cell.
13. In a text editor, create a new file at
    `.demo-vault\journal\<year>\<month>\<a-date-a-few-days-back-with-no-existing-file>.md`
    with this minimal content and save it:

    ```markdown
    ---
    type: journal
    date: <that-date>
    lang: de
    ---

    ## Tag

    Von außen angelegt.
    ```

    Switch back to the app without restarting.
14. Settings → Sprachen: switch "Oberflächensprache" to English, then look at the
    calendar again; switch back to Deutsch.

**Expected result**

- Step 1: the two cells look different from each other — today's marking (e.g. an
  outline/accent) is not the same visual as the selected cell's marking, so a day can be
  both without the two collapsing into one look.
- Step 3: the day panel opens that day exactly as a day-list click would, and the address
  updates to `#/journal?d=<that day>`; the day list's own row for it is selected too.
- Step 5: the grid still draws all seven columns and the full set of weeks for that
  month — it is not skipped or replaced by an empty-state message — every cell in it
  simply has no dot.
- Step 6: the future cell does nothing on click and its accessible label names it as
  "Liegt in der Zukunft, noch kein Eintrag" rather than just looking greyed out.
- Step 7/8: the calendar collapses to just its toolbar; after leaving and returning to
  the journal screen, it is still collapsed — the state survived the navigation within
  the session.
- Step 10: the grid answers every one of these keys itself (arrows move and select in one
  step, `Home`/`End` jump to the first/last day of the month, `PageUp`/`PageDown` change
  the month), and none of them also fires the day list's own arrow handling at the same
  time.
- Step 11: `j`/`k` and the plain arrow keys still switch the day list's selection exactly
  as they did before this story, once focus is in the list rather than in the grid.
- Step 12: an open past day's cell carries a second, square marker (not just colour)
  alongside its dot, with the accessible label "Tag noch nicht abgeschlossen"; "Heute"'s
  cell never carries that marker, even though today isn't closed out either.
- Step 13: within a moment (no restart), the calendar shows a new cell with an entry dot
  for that date, and it is now selectable/clickable in the calendar and appears in the
  day list — the watcher picked up the hand-created file.
- Step 14: weekday abbreviations, the month/year caption, the "Today" button, the
  collapse label and every marker's tooltip switch to English and back with the UI
  language — no leftover German word in the calendar in either state.

---

## Gaps

Things the stories' acceptance criteria name that this plan does not turn into a step,
and why.

1. **Seeing a genuine streamed "Tipps"/"Analysieren" answer (use case 1, steps 6–9)
   needs a real LLM provider connected to the "Tagebuch-Gespräch" task.** The app itself
   only offers UI to connect one (Settings → Modelle); actually having a reachable local
   runtime (Ollama, LM Studio) or a remote API key is an environment precondition this
   plan cannot supply. Without one, those steps still run and still file your paragraph,
   but the "answer" you see is the honest failure sentence from use case 2
   ("Aufgeschrieben. …"), not a generated reply — which exercises the no-model path
   again rather than the stance's actual output.
2. **"Reading a month does not read every file of that month" (010's acceptance
   criteria) has no UI-observable signal.** It's an internal guarantee — the calendar
   reads the same already-derived `journal:list` array the day list uses, with no
   separate per-file read — checkable in the diff and the story's own tests, not by
   clicking anything.
3. **The interview's optional model-driven follow-up question (012) is not asserted by
   exact content.** With a model connected, answering a backbone question may insert one
   extra question before the next backbone topic; this plan's use case 3 deliberately
   verifies the fixed-question backbone (which behaves identically with or without a
   model) rather than pinning down a specific follow-up's wording, since that wording is
   whatever the connected model actually returns.
4. **Deleting `.secondbrain/index/` and confirming `closed`/journal state still holds**
   (009's and 010's "derived from the file, not the index" acceptance criteria) needs a
   step outside the UI (removing a folder) — the same kind of environment-setup action
   earlier sprints' plans already used for the same reason, and not included here since
   none of the five assigned use cases asks for it specifically.
