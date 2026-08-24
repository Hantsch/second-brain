---
sprint: S02
kind: manual acceptance test plan
doc-language: en
stories: [005, 006]
ui-acceptance-required: true
---

# Sprint S02 — manual acceptance test plan

Seventeen use cases, all of them driven through the running app. The UI of this
app is German, so every label quoted below is the German string the tester really
sees; the plan itself is English.

**Rule for this plan:** every test step is a real UI action — a click, a key, a
typed character. The console appears only to start the app and, once, to make an
edit outside the app the way Obsidian or VS Code would. Anything a story claims
that cannot be reached that way is not written as a workaround; it is listed under
[Gaps](#gaps) at the end.

---

## Global preparation

Run once, before the first use case, in the repo root
(`C:\development\Hantsch\second-brain`).

### 1. Build the demo vault

PowerShell:

```powershell
npm run seed
```

This creates `.demo-vault\` with the sample content every use case below refers
to.

### 2. Start the app on the demo vault

PowerShell:

```powershell
$env:SB_VAULT = "$PWD\.demo-vault"; npm run dev
```

Bash:

```bash
SB_VAULT="$PWD/.demo-vault" npm run dev
```

`SB_VAULT` beats the vault history, so the app opens the demo vault without
touching whatever vault you normally work in. The title bar shows the vault name
next to "Second Brain" — that is how you confirm the right vault is open.

Where a use case says **restart the app**, close the window and run the same
start command again.

### 3. What the demo vault contains

Facts the steps below rely on:

| Thing                                                     | Where                                                                                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Areas "Gesundheit" (private) and "Kunden und Team" (work) | `areas/gesundheit.md`, `areas/kunden-und-team.md` — each has exactly one dated note and at least one open todo                                |
| Area "Finanzen" (private)                                 | `areas/finanzen.md` — one open todo, **zero notes** (built on purpose to show the per-area empty state)                                       |
| No area named "Notizen" yet                               | the default, untargeted-note area (`areas/notes.md`) is created the first time someone saves a note without a target                          |
| Five dumps in `inbox/`                                    | three `status: raw`, one `status: proposed`, one `status: kept` ("Zu viele Baustellen gleichzeitig" — deliberately left lying, not a finding) |
| The Notes filter link / the Today strip both count 4      | only `raw`/`proposed` dumps count as "unfiled" — the one already `kept` does not, but still sits in the workspace list                        |
| UI language                                               | German (`languages.ui: de`)                                                                                                                   |
| LLM providers                                             | **none configured** — every filing proposal is the heuristic one, not a model's                                                               |

---

## Story 005 — Notes: a home for the areas

### UC-1 — The rail is the final seven entries, and "Notizen" is one of them

**Preparation:** app started as above, any screen.

**Steps**

1. Look at the rail on the left edge of the window. Count the entries and read
   their labels, top to bottom.
2. Look at the bottom of the rail, just above the vault indicator.
3. Click into no field, then press `1`, then `2`, then `3`, then `4`, then `5`,
   then `6`, then `7`, one at a time, and note which screen opens each time.
4. Click the rail entry "Einstellungen", open the tab "Sprachen", set
   "Oberflächensprache" to "English".
5. Look at the rail again.
6. Set "Oberflächensprache" back to "Deutsch".

**Expected result**

- Step 1: exactly **seven** entries, in this order — `Dashboard`, `Projekte`,
  `Tagebuch`, `Wissen`, `Notizen`, `Pflege`, `Einstellungen`. There is **no**
  entry named "Inbox" anywhere in the rail.
- Step 2: "Pflege" and "Einstellungen" sit visually separated from the five
  entries above, in their own group above the vault name — the "system" pair
  the other five "place" screens are not part of.
- Step 3: `1`→Dashboard, `2`→Projekte, `3`→Tagebuch, `4`→Wissen, `5`→Notizen,
  `6`→Pflege, `7`→Einstellungen. Every digit opens a screen; none is unassigned.
- Step 5: the same seven entries, now reading `Dashboard`, `Projects`,
  `Journal`, `Knowledge`, `Notes`, `Care`, `Settings` — still no "Inbox".

---

### UC-2 — Areas show up as sections, newest note first

**Preparation:** UC-1 done, UI language German, press `5` to open "Notizen".

**Steps**

1. Read the sentence directly under the title "Notizen".
2. Look at the list of areas below the composer, without expanding anything.
3. Click "Notizen zeigen" on the panel "Kunden und Team" to expand it.
4. Read the dated entry and the todos underneath.
5. Click "Notizen verbergen" on "Kunden und Team", then "Notizen zeigen" on
   "Gesundheit".

**Expected result**

- Step 1: "Tagebuch ist Rückblick auf den Tag, eine Notiz ist ein Gedanke, der
  für sich steht." — this sentence is permanent screen furniture, not tied to
  any one state.
- Step 2: the areas appear as collapsed panels, in this order — **"Kunden und
  Team"** first, **"Gesundheit"** second, **"Finanzen"** last (it has no notes
  yet, so it sorts after everything that has one). Each panel's meta line
  states its note count and, if any are open, its open-todo count (e.g.
  "1 Notizen · 2 offen" for Kunden und Team).
- Step 4: one dated entry with the note text underneath, and below it the
  area's own todo list with its checkboxes — laid out exactly like a project's
  todos.
- Step 5: sections collapse and expand independently; collapsing one leaves
  the others as they were.

---

### UC-3 — Write a note without choosing a target

**Preparation:** on "Notizen", nothing expanded.

**Steps**

1. Click into the field at the top of the screen (placeholder "Ein Gedanke,
   der für sich steht.").
2. Type `Testgedanke ohne Ziel, Sprint 02`.
3. Look at the select next to the field, labelled "Bereich" — do **not** touch
   it.
4. Press `Ctrl+Enter`.
5. Look at the areas list.
6. Open `.demo-vault\areas\notes.md` in a text editor.

**Expected result**

- Step 3: the select already reads "Später entscheiden" — nothing forces a
  choice before the note can be saved.
- Step 4: the field clears; nothing asked for a folder, a project, or a
  module first.
- Step 5: a **new** section titled "Notizen" now sits at the very top of the
  list (its note is the newest one, so it sorts first), already expanded, with
  the typed sentence inside it.
- Step 6: the file exists, `type: area`, and the sentence sits under a
  `### <today's date>` heading inside a `## Notizen` section — created on
  first use, not pre-seeded.

---

### UC-4 — Move a note into a different area

**Preparation:** UC-3 done. On "Notizen", the section "Notizen" expanded.

**Steps**

1. Find the note you just wrote and click the small folder icon next to it
   (tooltip / screen-reader name "In einen anderen Bereich verschieben").
2. In the dialog "Notiz verschieben", open the select "Zielbereich" and choose
   "Gesundheit".
3. Click "Verschieben".
4. Look at the "Notizen" section, then expand "Gesundheit".

**Expected result**

- Step 3: the dialog closes without an error.
- Step 4: the note is gone from "Notizen" and now sits inside "Gesundheit",
  once — not duplicated, not left in both places.

---

### UC-5 — Create a new area, and its empty state

**Preparation:** on "Notizen".

**Steps**

1. Click "Neuer Bereich" in the screen header.
2. Type `Haus` into the field "Titel".
3. Read the line under the field.
4. Click "Anlegen".
5. Find the new panel "Haus" in the list (it sits at the bottom, alongside
   "Finanzen" — neither has a note yet) and click "Notizen zeigen".
6. Try creating another area with the exact same title, `Haus`.

**Expected result**

- Step 3: "Angelegt wird areas/haus.md." — the slug is shown before you commit.
- Step 4: the dialog closes; a new panel "Haus" appears in the list.
- Step 5: the empty state reads "Noch keine Notiz in diesem Bereich. Die erste
  entsteht oben im Feld — wähle diesen Bereich als Ziel." — not a blank panel.
- Step 6: the field shows the error "Diesen Bereich gibt es schon — wähle
  einen anderen Titel."; no second `haus.md` is created.

---

### UC-6 — An area's todos count on Today, exactly like a project's

**Preparation:** on "Notizen", "Kunden und Team" expanded.

**Steps**

1. Note the number on the todo tile(s) on the dashboard for the work scope
   (press `1`, read the tile "Todos Arbeit" if it is on the board).
2. Press `5`, expand "Kunden und Team", check off the open todo "Wochenrückblick
   schreiben und an Miriam schicken".
3. Edit its text inline (click the text, change a word, confirm).
4. Press `1` again and re-read the same tile.

**Expected result**

- Step 2: the checkbox ticks, exactly like a project todo.
- Step 3: the edited text is saved without leaving the screen.
- Step 4: the open-todo count for the work scope has gone down by one — area
  todos count on Today the same way project todos do.

---

### UC-7 — An edit made outside the app shows up here

**Preparation:** app running, on "Notizen".

**Steps**

1. Open `.demo-vault\areas\finanzen.md` in a text editor while the app keeps
   running.
2. Add a line `### <today's date>` and, under it, a sentence, inside the
   existing `## Notizen` section. Save the file.
3. Switch back to the app within a few seconds. Do not press reload.
4. Expand "Finanzen".

**Expected result**

- Step 4: the sentence you typed in the editor is there, without a restart
  and without you having reloaded the window — external edits are picked up
  via the file's hash, same as any other screen in this app.

---

### UC-8 — A stale hash refuses the write instead of overwriting

**Preparation:** on "Notizen", "Gesundheit" expanded. It now holds two notes —
the seeded one ("Zwei Wochen Protokoll: …") and the one moved in during UC-4 —
either works for this test. Have a text editor already open on
`.demo-vault\areas\gesundheit.md` so the next edit can happen in a couple of
seconds.

**Steps**

1. Click the seeded note's "move to another area" icon, pick "Kunden und
   Team" as the target, but do **not** click "Verschieben" yet.
2. Switch to the already-open editor, add a short line anywhere in the file,
   and save it as fast as you can.
3. Immediately switch back to the app and click "Verschieben".
4. If step 3 succeeded instead of failing, reload with `Ctrl+R`, repeat steps
   1–3 once more, acting faster between the save and the click.
5. Once you see the conflict, look at what the dialog and the file say.
6. Close the dialog, press `Ctrl+R`, and repeat the move.

**Expected result**

- Step 5: a toast states that the file changed (the generic "conflict"
  message), the dialog stays open, and the note that was being moved is
  **still in "Gesundheit"** — the editor's own line from step 2 is intact in
  the file, nothing was silently overwritten.
- Step 6: after a reload the app reads the current hash, and the same move now
  succeeds.
- _Note:_ the app's own file watcher picks up an external edit within about a
  second (the same mechanism as UC-7), so this conflict only appears if the
  edit and the click happen inside that window. It may take more than one
  attempt — that raciness is itself evidence the "files are the truth"
  guardrail is doing its job, not a bug in the steps.

---

### UC-9 — Search reaches a note inside an area

**Preparation:** UC-3/UC-4 done, so a note with a distinctive phrase exists
inside an area.

**Steps**

1. Press `Ctrl+K`.
2. Type `Testgedanke ohne Ziel`.
3. Press `Enter` on the hit.

**Expected result**

- Step 3: the Notes screen opens with the area that note now lives in already
  expanded — search reaches into an area's notes, not just project and journal
  text.

---

### UC-10 — Both languages, on the Notes screen

**Preparation:** switch "Oberflächensprache" to English (Settings → Languages).

**Steps**

1. Press `5` to open "Notes".
2. Read the sentence under the title, the composer's placeholder, target
   select, and hint text, and one area's "show"/"hide" control.
3. Click "New area" and read its dialog.
4. Switch back to Deutsch.

**Expected result**

- Step 2: "A journal entry looks back on the day; a note is a thought that
  stands on its own." under the title "Notes"; the field reads "A thought that
  stands on its own."; the target select's empty option reads "Decide later";
  the hint reads "Ctrl+Enter saves the note."; no German word anywhere on the
  screen.
- Step 3: dialog title "New area", field label "Title", button "Create" — all
  English, sentence case, no emoji.

---

## Story 006 — Inbox becomes the unfiled filter in Notes

### UC-11 — The unfiled workspace: two columns, and its actions

**Preparation:** on "Notizen", click the button reading "4 nicht abgelegt"
under the composer (or press `5` then that link).

**Steps**

1. Read the sentence at the top of the workspace.
2. Look at the layout: a list on the left, a detail column on the right.
3. Click the first row in the list.
4. Read the proposal card on the right — its overline, its confidence line
   (or the "no model" note), and the "this is what gets written" preview.
5. Look at the actions below the proposal. Click through a couple of the other
   rows in the list and look at the actions again each time.

**Expected result**

- Step 1: "Ablegen ist freiwillig — ein Dump, der nie abgelegt wird, ist kein
  Rückstand, sondern eine Notiz." — the same "filing is optional" sentence the
  story asks for.
- Step 2: the same two-column layout the old Inbox screen had — nothing here
  looks like a stripped-down replacement.
- Step 4: "Ohne Modell eingeordnet — Regeln statt Verstehen." (no model is
  configured in the demo vault), plus a real preview of what would be
  written — the proposal is honestly heuristic, not a dead panel.
- Step 5: three actions, never four at once. For a dump whose proposal names a
  real target: "Ablegen", "Anderes Ziel", "Verwerfen". For a dump whose
  proposal reads "Bleibt in der Inbox": "Liegen lassen" takes the primary
  button's place instead of "Ablegen", still next to "Anderes Ziel" and
  "Verwerfen" — every one of the old screen's actions is present, just never
  more than three at a time, and the button under `Ctrl+Enter` always carries
  the accent colour.

---

### UC-12 — The keyboard works exactly as before

**Preparation:** on the unfiled filter, focus somewhere in the list (click a
row once).

**Steps**

1. Press `j` twice, then `k` once, and watch which row is highlighted each
   time.
2. Press the down arrow, then the up arrow — same check.
3. Press `Enter`.
4. Press `Esc`.
5. Press `e`.
6. Press `Esc`.
7. Click a row, then press `Ctrl+Enter`. Do **not** confirm anything yet — this
   is just to see the shortcut is wired; if a filing actually goes through,
   undo it (see UC-13) before continuing.

**Expected result**

- Steps 1–2: `j`/`ArrowDown` move the selection one row down, `k`/`ArrowUp` one
  row up; the selection never leaves the list's bounds.
- Step 3: focus moves into the proposal card on the right.
- Step 4: focus returns toward the list.
- Step 5: focus lands in the proposal's text field, ready to edit.
- Step 7: `Ctrl+Enter` triggers the same primary action the mouse would
  ("Ablegen" or "Liegen lassen", whichever the card currently shows as
  primary).

---

### UC-13 — Leave it, discard, and the selection that follows the dump

**Preparation:** on the unfiled filter, the five seeded dumps all visible. The
open ones sort first, newest first — "Idee: Wochenrückblick …", "Kundenportal:
Vermutung …", "Link: Vertragsvorlagen …", "Einkauf fürs Hochbeet" — and "Zu
viele Baustellen gleichzeitig" (already marked "Bleibt liegen") sits last,
below all of them, because a dump already left unfiled on purpose sorts after
the open ones regardless of its date.

**Steps**

1. Click "Link: Vertragsvorlagen für Freelancer" to select it.
2. If the primary button reads "Ablegen" rather than "Liegen lassen", click
   "Anderes Ziel" and pick "Bleibt in der Inbox" from the list first — "inbox"
   is always one of the offered targets, precisely so leaving it stays a
   click away regardless of what the heuristic proposed. Then click "Liegen
   lassen".
3. Read the confirmation strip and the row's badge.
4. Click "Rückgängig" on the strip, before ten seconds are up.
5. Click "Kundenportal: Vermutung zu den Ladezeiten" — the row directly above
   "Link: Vertragsvorlagen für Freelancer" — to select it.
6. Click "Verwerfen", confirm with "Verwerfen" in the dialog that asks
   "Dump verwerfen?".
7. Look at which row is now highlighted, and where "Link: Vertragsvorlagen für
   Freelancer" now sits.
8. Click "Rückgängig" on the confirmation strip.

**Expected result**

- Step 2/3: the row keeps its position in the list, gains a "Bleibt liegen"
  badge, and a statement "Bleibt liegen — als bewusst behalten markiert."
  appears with a "Rückgängig" button that stays for about ten seconds — "leave
  it" really writes something and is undoable, exactly like filing.
- Step 4: the badge disappears and the strip closes — nothing was left behind.
- Step 6: a statement "Verworfen." appears with its own "Rückgängig"; the
  discarded row is gone from the list.
- Step 7: "Link: Vertragsvorlagen für Freelancer" now sits one row higher, and
  it — not whatever else ended up in that slot — is the one shown selected:
  the selection followed the dump by its path, it did not jump to an unrelated
  row when the row above it disappeared.
- Step 8: the discarded dump reappears in the list at its original position
  with its original status.

---

### UC-14 — File a dump, and see it again in the "Abgelegt" trail

**Preparation:** on the unfiled filter. "Kundenportal: Vermutung zu den
Ladezeiten" present (restored by UC-13's undo).

**Steps**

1. Select "Kundenportal: Vermutung zu den Ladezeiten".
2. Read whatever target the proposal card names (a project, an area, or a
   journal entry — the exact one depends on the heuristic, any is fine for
   this test). If the button reads "Liegen lassen" instead of "Ablegen" (the
   heuristic proposed staying put), click "Anderes Ziel" and pick any real
   project or area from the list first, so this use case actually files
   something.
3. Press `Ctrl+Enter`.
4. Read the confirmation strip. Let the ten seconds pass without clicking
   "Rückgängig" this time.
5. Scroll down to the collapsed panel "Abgelegt" and click "Notizen zeigen".
6. Read the row for this dump, then click its "abgelegt in …" link.
7. Go back (press `5`, click the filter link again), expand "Abgelegt" again.
8. Restart the app (see Global preparation), open the filter, expand
   "Abgelegt" once more.

**Expected result**

- Step 4: "Abgelegt in" followed by the real path the dump was filed into.
- Step 5: the panel reads "1 abgelegt".
- Step 6: the link leads to the actual target (a project or an area screen) —
  "where did that thought go?" has a real answer.
- Step 7: the dump is **not** in the working list above the trail, and it does
  **not** count in the filter's "N nicht abgelegt" label — a filed dump is
  neither open work nor gone.
- Step 8: the entry is still there after the restart — the receipt lives in the
  dump's own file (`status: filed`, `filed_into`, `filed_at`), not only in
  memory.

---

### UC-15 — Today's "N unfiled" strip: leads to the filter, and is absent at zero

**Preparation:** UC-14 done (one dump filed). Press `1` for the dashboard.

**Steps**

1. Read the strip above the tile grid.
2. Click it.
3. Back in the workspace, for each of the three still-open dumps ("Idee:
   Wochenrückblick …", "Link: Vertragsvorlagen …", "Einkauf fürs Hochbeet"):
   select it and click "Liegen lassen" (as in UC-13, go via "Anderes Ziel" →
   "Bleibt in der Inbox" first if the button reads "Ablegen" instead).
4. Press `1` again.
5. Press `5`, and look at the filter link on the plain Notes screen (do not
   click it) rather than the workspace itself.

**Expected result**

- Step 1: "3 nicht abgelegt" (four minus the one filed in UC-14).
- Step 2: lands on `/notes?filter=unfiled` — the same workspace.
- Step 4: the strip is **gone** — not showing "0 nicht abgelegt". A permanent
  zero would be a false alarm forever; this app removes the entry point
  instead.
- Step 5: the in-screen link on Notes, by contrast, still reads "0 nicht
  abgelegt" and is still clickable — this one is a permanent way into the
  filter, not a notification, so it does not disappear at zero the way the
  Today strip does.

---

### UC-16 — Every old inbox link still lands on the filter

**Preparation:** any state of the inbox (empty or not, from the previous use
cases).

**Steps**

1. Press `1`. Find the tile "Inbox" and click its footer link "Zur Inbox".
2. Press `1` again, click the lightning-bolt "Erfassen" button in the title
   bar, type a short thought, save it with `Ctrl+Enter`.
3. Click "Zur Inbox" next to the saved confirmation.
4. Press `Esc`, repeat step 2, and this time click "In der Inbox ansehen" in
   the classification line instead.
5. Press `Ctrl+K`, type `abge`, and press `Enter` on the entry "Nicht
   abgelegt".

**Expected result**

- Every one of steps 1, 3, 4 and 5 lands on the Notes screen with the unfiled
  filter active (`/notes?filter=unfiled`) — none of them goes to a dead route
  or an empty frame, even though every one of these buttons still says
  "Inbox" in its label.

---

### UC-17 — Both languages, on the unfiled filter and the Today strip

**Preparation:** UC-16 done — its two captured thoughts are themselves unfiled
dumps now, so the strip has something to show again. Switch
"Oberflächensprache" to English.

**Steps**

1. Press `1`, read the strip above the tiles.
2. Press `5` and click into the filter.
3. Read the sentence at the top of the workspace, then expand the collapsed
   panel "Filed" (it holds the dump filed in UC-14).
4. Switch back to Deutsch.

**Expected result**

- Step 1: "2 unfiled" (the two thoughts captured in UC-16).
- Step 3: "Filing is optional — a dump that never gets filed is not a backlog
  item, it is a note."; the panel reads "Filed", "1 filed", and its row's
  link reads "filed into {target}" — no German leftover anywhere on the
  screen.

---

## Gaps

Things the acceptance criteria claim that could **not** be turned into a
UI-only step, and why.

1. **`#/inbox` cannot be entered by hand.** The window is frameless with a
   custom title bar and there is no address field, no "go to URL" command and
   no external-link entry point anywhere in the shell. Story 006 retargeted
   every in-app link that used to point at `/inbox` (both dashboard tiles, the
   capture overlay, the command palette — all covered in UC-16), so no button
   produces the old address either. What is **not** covered by this plan: that
   `#/inbox` and `#/inbox?x=1`, typed directly, still redirect onto
   `/notes?filter=unfiled` with their query string intact. That risk — the one
   the story's own decisions call out as the most likely silent regression —
   stays covered only by its unit test (`tests/renderer/screens.test.tsx`,
   written to fail if the redirect drops the query string), not by this plan.

2. **The exact heuristic proposal a given dump receives (UC-14) is not fixed
   by this plan.** Which target the rule-based classifier proposes for
   "Kundenportal: Vermutung zu den Ladezeiten" depends on its rules matching
   the dump's tags and text, not on anything this plan pins down. The use case
   is written to accept whatever real target appears, because the filing path
   itself — not one particular target — is what is under test.

3. **UC-8's conflict is timing-sensitive.** The vault's file watcher notices
   an external edit within roughly a second, after which the app's own cached
   hash is already current and a "stale hash" write would no longer be
   possible to trigger. Reproducing the conflict on purpose therefore depends
   on how fast the tester can save the external edit and click the button
   afterward — it may take a repeat attempt, as the step itself says.
