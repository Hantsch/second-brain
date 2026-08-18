---
sprint: S01
kind: manual acceptance test plan
doc-language: en
stories: [002, 007, 008]
ui-acceptance-required: true
---

# Sprint S01 — manual acceptance test plan

Seventeen use cases, all of them driven through the running app. The UI of this
app is German, so every label quoted below is the German string the tester really
sees; the plan itself is English.

**Rule for this plan:** every test step is a real UI action — a click, a key, a
typed character. The console appears only to start the app. Anything a story
claims that cannot be reached that way is not written as a workaround; it is
listed under [Gaps](#gaps) at the end.

---

## Global preparation

Run once, before the first use case. Both commands are run in the repo root
(`C:\development\Hantsch\second-brain`).

### 1. Build the demo vault

PowerShell:

```powershell
npm run seed
```

This creates `.demo-vault\` with the sample content every use case below refers
to. It also writes its own Claude Code history store into
`.demo-vault\.secondbrain\claude-demo\projects` and points the vault setting
`overview.claudeProjectsDir` at it, so nothing here ever reads your real
`~/.claude`.

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

| Thing                                                          | Where                                             |
| -------------------------------------------------------------- | ------------------------------------------------- |
| Work projects `Kundenportal Relaunch`, `Orbit SSO-Migration`, `Rechnungsautomatisierung` | each names an agent working directory in `repos`  |
| Work projects `Datenmigration Legacy-CRM`, `Angebot Praxisnetz Süd` | `repos` empty — **no** linked agent directory      |
| Agent project `C:/development/demo/spielwiese`                  | 1 session, linked to **no** vault project          |
| Knowledge modules (at least two, e.g. `identity-management`)    | Knowledge → tab "Module"                           |
| UI language                                                     | German (`languages.ui: de`)                        |
| LLM providers                                                   | **none configured** — every model path is in its honest "no model" state |

---

## Story 002 — Knowledge absorbs sources

### UC-1 — The rail is seven entries and says "Wissen"

**Preparation:** app started as above, any screen.

**Steps**

1. Look at the rail on the left edge of the window.
2. Count the entries and read their labels.
3. Click into no field, then press the digit `2`.
4. Press `4`.
5. Press `8`.
6. Press `7`.
7. Click the rail entry "Einstellungen", open the tab "Sprachen", set
   "Oberflächensprache" to "English".
8. Look at the rail again.
9. Set "Oberflächensprache" back to "Deutsch".

**Expected result**

- Step 2: exactly **seven** entries, in this order — `Dashboard`, `Inbox`,
  `Projekte`, `Tagebuch`, `Wissen`, `Pflege`, `Einstellungen`. There is **no**
  "Module", no "Quellen", no "Erfassen", no "Fragen" and no "Agents" entry.
- Steps 3–5: nothing happens. The screen does not change, no overlay opens, no
  error appears.
- Step 6: the Knowledge screen opens — overline "Module und Quellen", title
  "Wissen", tabs "Module" and "Quellen", "Module" selected.
- Step 8: the same seven entries, now reading `Dashboard`, `Inbox`, `Projects`,
  `Journal`, `Knowledge`, `Maintenance`, `Settings`.

---

### UC-2 — The Sources tab keeps every function it had as a screen

**Preparation:** UC-1 done, UI language German.

**Steps**

1. Press `7` to open "Wissen".
2. Click the tab **"Quellen"**.
3. Read the panel titled "Quelle aufnehmen".
4. Click into the field labelled "URL, YouTube-Link oder Text" and paste
   `https://www.youtube.com/watch?v=dQw4w9WgXcQ`.
5. Read the line directly under the field.
6. Clear the field and type `Ein loser Gedanke ohne URL`.
7. Read that line again.
8. Open the select labelled "Zielmodul".
9. Close the select again without choosing (press `Esc`).
10. Look at the row that mentions `yt-dlp`.
11. Look at the panel "Aufträge".
12. Scroll down to the source inventory and click one source row.
13. Close the dialog that opens.
14. Drag any `.md` or `.txt` file from Explorer over the screen (do not drop it).

**Expected result**

- Step 3: the panel is there, with the input field, an "Aufnehmen" button and a
  "Dateien wählen" button.
- Step 5: "YouTube-Video erkannt".
- Step 7: "Text erkannt — wird als Quelle abgelegt".
- Step 8: the first option is "Später einordnen", followed by the demo vault's
  knowledge modules.
- Step 10: a status row reading "yt-dlp vorhanden" or "yt-dlp fehlt" (either is
  a pass — it depends on the machine, not on the app). If it is missing there is
  a button "Automatisch holen".
- Step 11: the jobs panel exists; on a fresh start it says "Noch kein Auftrag in
  dieser Sitzung."
- Step 12: a detail dialog for that source opens.
- Step 14: a drop zone appears over the screen, "Datei hier fallen lassen /
  Text und Markdown werden übernommen."
- Throughout: no "no model configured" wall, no empty area. The tab is fully
  usable although no model is configured.

---

### UC-3 — Ingesting into a specific module, with the picker prefilled

**Preparation:** UC-2 done.

**Steps**

1. Press `7`, stay on the tab "Module".
2. Click a module card (e.g. "Identity management").
3. In the module detail, click the tab **"Quellen"**.
4. Click the button **"Quelle in dieses Modul aufnehmen"**.
5. Look at the select "Zielmodul".
6. Click the rail entry "Wissen" again, then the tab "Quellen".
7. Look at the select "Zielmodul".

**Expected result**

- Step 4: the Knowledge screen's top-level tab "Quellen" is now selected — the
  full ingest workbench from UC-2, not the module's own filtered list.
- Step 5: the select already shows **the module you came from**, not
  "Später einordnen".
- Step 7: with no module in play, the select starts on "Später einordnen" again.

---

### UC-4 — Both Knowledge destinations are findable and land correctly

**Preparation:** any screen.

**Steps**

1. Press `Ctrl+K`.
2. Type `wiss`.
3. Press `Enter` on the entry "Wissen".
4. Press `Ctrl+K` again.
5. Type `quel`.
6. Press `Enter` on the entry "Quellen".
7. Press `9` to open "Pflege" and run a check if the finding list is empty
   (button "Erneut prüfen").
8. Look through the findings for one whose path starts with `raw/`. If there is
   one, click its "open" action.

**Expected result**

- Step 2: under the group heading "Bereiche" there is an entry "Wissen".
- Step 3: the Knowledge screen, tab "Module".
- Step 5: under "Bereiche" there is an entry "Quellen" (icon: download), listed
  directly below "Wissen".
- Step 6: the Knowledge screen with the tab **"Quellen"** selected — not the
  module overview.
- Step 8: the Knowledge screen opens on the tab "Quellen". _(If the demo vault
  produced no `raw/` finding, this half of the step is not testable in this run;
  see Gaps.)_

---

## Story 007 — Capture and ask become actions

### UC-5 — Capture from the title bar, on any screen

**Preparation:** any screen.

**Steps**

1. Press `5` to open "Projekte".
2. In the title bar, click the lightning-bolt button whose tooltip reads
   **"Erfassen"** (screen-reader name: "Gedanken erfassen").
3. Look at what is behind the overlay.
4. Type `Testgedanke aus dem Overlay, Sprint 01`.
5. Look at the counter line under the field.
6. Press `Ctrl+Enter`.
7. Read the line that appears after saving.
8. Click **"Rückgängig"**.
9. Press `Esc`.
10. Press `1`, `3`, `6`, `7`, `9`, `0` in turn and check the title bar each time.

**Expected result**

- Step 2: an overlay opens over the projects screen, headed "Was liegt an?",
  with a text field, the "Bereich" select, a "Tags" field and a "Speichern"
  button carrying the `Ctrl` `Enter` key hint.
- Step 3: the projects screen is still visible behind the dimmed scrim — the
  screen was not left.
- Step 5: "… Zeichen · … Wörter", counting up as you type.
- Step 7: **"Gespeichert in"** followed by the file path of the new inbox file,
  plus the buttons "Rückgängig" and "Zur Inbox".
- Step 8: the saved text is back in the field, ready to be edited.
- Step 9: the overlay closes, the projects screen is operable again.
- Step 10: the capture button is present in the title bar on **every** screen.

---

### UC-6 — The quick-capture window is unchanged

**Preparation:** app running, main window focused.

**Steps**

1. Press `Ctrl+Shift+Space`.
2. Type a short thought and press `Ctrl+Enter`.
3. Close the small window.
4. Click somewhere outside the app so it loses focus, then press
   `Ctrl+Shift+Space` again.
5. Close it again.
6. In the main window press `Ctrl+K`, type `fenster`, press `Enter` on the entry
   **"Erfassen-Fenster"**.

**Expected result**

- Steps 1 and 4: the small separate quick-capture window opens — both while the
  app is in the foreground and while it is not. It is a window of its own, not
  the in-shell overlay from UC-5.
- Step 2: the thought is saved, exactly as before this sprint.
- Step 6: the same separate window opens.
- _Caveat:_ if another application on the machine already owns
  `Ctrl+Shift+Space`, the app says so with a warning toast at startup. Steps 1
  and 4 then cannot be tested on this machine; step 6 still can, and covers the
  capability.

---

### UC-7 — `Ctrl+K` is one control with two modes

**Preparation:** any screen.

**Steps**

1. Press `Ctrl+K`.
2. Look at the two chips at the top of the dialog and at the footer line.
3. Type `erfass`.
4. Look at the group "Aktionen".
5. Clear the field and press `Tab`.
6. Look at the chips, the field placeholder and the list.
7. Press `Tab` again.
8. Press `Tab` once more, then type
   `Was weiß ich über Identity management?` and press `Enter`.
9. Look at what opens.
10. Press `Esc`.
11. Press `Ctrl+K`, then click the chip **"Fragen"** with the mouse.
12. Press `Esc`, press `Ctrl+K`, and type `?Wie lange läuft ein Token?`
13. Press `Esc`, press `Ctrl+K`, type `frage`, press `Enter` on the entry
    **"Frage stellen"**.

**Expected result**

- Step 2: two chips, **"Befehle"** (pressed) and **"Fragen"**; footer
  "Pfeiltasten wählen, Enter öffnet, Esc schließt, Tab fragt".
- Step 4: two capture entries — **"Gedanken erfassen"** (opens the overlay) and
  **"Erfassen-Fenster"** (opens the separate window) — plus **"Frage stellen"**.
- Step 6: the chip "Fragen" is now pressed, the placeholder reads
  **"Was willst du wissen?"**, the result list is gone, and the footer reads
  "Enter fragt, Esc schließt, Tab zurück zu den Befehlen".
- Step 7: back in palette mode, and the text typed in step 3 is still there.
- Step 9: the palette closes and the **ask overlay** opens with the question
  already asked — the answer is running or done, not merely prefilled.
- Step 11: mouse click switches the mode just like `Tab`.
- Step 12: the leading `?` switches to ask mode and the `?` itself does **not**
  end up in the question — the field holds `Wie lange läuft ein Token?`.
- Step 13: the palette stays open and switches to ask mode (this one command
  does not close it).

---

### UC-8 — Ask inside a module is scoped to that module

**Preparation:** UI language German.

**Steps**

1. Press `7`, tab "Module", click a module card (e.g. "Identity management").
2. Press `Ctrl+K`, press `Tab`, type `Was ist hier festgehalten?` and press
   `Enter`.
3. Look at the chip row above the composer in the ask overlay.
4. Click the chip labelled **"alles"** in the "Modul" row.
5. Press `Esc` to close the overlay.

**Expected result**

- Step 3: a chip group labelled **"Modul"** in which the module you were
  standing in is the active chip.
- Step 4: the module restriction is gone — "alles" is now active.
- The overlay lies over the module detail; the module is still there behind it.

---

### UC-9 — Ask inside a project is scoped to that project, and the chip clears

**Preparation:** UI language German.

**Steps**

1. Press `5` to open "Projekte".
2. Click the project **"Kundenportal Relaunch"** in the list.
3. Press `Ctrl+K`, press `Tab`, type `Woran wurde zuletzt gearbeitet?` and press
   `Enter`.
4. Look at the chip row above the composer.
5. Look at the file paths in the evidence / citation column of the answer.
6. Click the **"Filter entfernen"** control next to the project chip.
7. Ask the same question again with the button "Frage stellen".
8. Look at the file paths again.

**Expected result**

- Step 4: a single chip group labelled **"Projekt"** holding one chip with the
  title of the project you were standing in, plus a clear control.
- Step 5: every cited path lies under that project (`projects/work/kundenportal-relaunch/…`).
- Step 6: the project chip group disappears — nothing is restricted any more.
- Step 8: paths from across the whole vault may now appear.
- Throughout: because no model is configured, the answer is the honest
  passages-plus-note form, not invented prose. That is a pass.

---

### UC-10 — The honest answer, and filing an answer back

**Preparation:** UI language German.

**Steps**

1. Press `1` to open the dashboard.
2. Press `Ctrl+K`, `Tab`, then type a question the vault cannot answer, e.g.
   `Was weiß ich über die Zugfestigkeit von Titan?` and press `Enter`.
3. Read the answer area.
4. Click **"Neue Frage"** in the overlay header.
5. Ask `Was weiß ich über Identity management?`.
6. Read the note about the missing model.
7. Click **"Als Wiki-Seite ablegen"**.
8. Pick a module in the dialog, adjust the title if you like, and confirm with
   **"Ablegen"**.
9. Read the confirmation.
10. Press `Esc`, press `7`, open that module and look at its pages.

**Expected result**

- Step 3: **"Dazu steht nichts im Vault."** plus its hint. No invented answer,
  no fabricated citation.
- Step 4: the thread is cleared and the composer is ready for the next question.
- Step 6: an explicit note that no model is configured, next to the passages the
  index did find — not a dead screen.
- Step 9: **"Abgelegt in"** followed by the real file path of the new page.
- Step 10: the page is in that module.

---

### UC-11 — The old capture and ask addresses still land, via the links that use them

The addresses `#/capture` and `#/ask?q=…` are still reached by real in-app
buttons; this use case exercises them the way a user does.

**Preparation:** UI language German.

**Steps**

1. Press `1` to open the dashboard.
2. Find the tile "Frage an das Second Brain", type
   `Was weiß ich über Identity management?` into its field and press `Enter`.
3. Look at what opens and at the question field inside it.
4. Press `Esc`.
5. On the dashboard, click the button **"Gedanken erfassen"** in the screen
   header (or, if the dashboard is empty, the same button in the empty state).
6. Press `Esc`.
7. Press `3` to open "Inbox" and click **"Gedanken erfassen"** in the header.
8. Press `Esc`.
9. On the dashboard, use the capture action of the tile "Inbox" and of the tile
   "Zuletzt gearbeitet".

**Expected result**

- Step 3: the **ask overlay** opens over the dashboard with the question already
  in the field — and **not yet asked** (an address is not a user action). The
  address bar-less window shows the dashboard behind the scrim, never a blank
  screen.
- Steps 5, 7, 9: the **capture overlay** opens over the screen you were on. No
  navigation to a capture screen, no dead route, no empty frame.

---

## Story 008 — Agent sessions move inside projects

### UC-12 — The all-sessions view hangs under Projects

**Preparation:** app started on the demo vault.

**Steps**

1. Look at the rail — confirm there is no "Agents" entry (already covered by
   UC-1; re-check here in context).
2. Press `1`, find the tile with the Claude Code sessions and click its footer
   link **"Alle Agent-Sitzungen öffnen"**.
3. Look at the screen header and at the rail.
4. Click **"Zurück zu den Projekten"**.
5. Press `Ctrl+K`, type `sitz`, press `Enter` on the entry
   **"Agent-Sitzungen"**.
6. Look at the rail again.

**Expected result**

- Step 3: the screen has overline **"Projekte"** and title
  **"Agent-Sitzungen"**, a Claude/Codex switch and the list of agent projects.
  In the rail the entry **"Projekte"** is highlighted as current — the view sits
  under Projects, not beside it.
- Step 4: the projects screen.
- Step 5: the same all-sessions screen.
- Step 6: "Projekte" highlighted again.

---

### UC-13 — A project detail has Overview and Sessions, and the trace lives in Sessions

**Preparation:** all-sessions view left, on the projects screen.

**Steps**

1. Press `5`, click the project **"Kundenportal Relaunch"**.
2. Look at the tab bar under the project head.
3. Stay on **"Überblick"** and scroll the whole tab to the bottom.
4. Click the tab **"Sitzungen"**.
5. Read the panel **"Arbeitsspur"**.
6. Look at the Claude/Codex switch and click **"Codex"**.
7. Click **"Claude Code"** again.
8. Click one session card.
9. In the transcript, scroll to the bottom and click **"Mehr laden"** if the
   button is there.
10. Click **"Zurück zu den Sitzungen"**.
11. Click the project **"Orbit SSO-Migration"** in the list and open its
    "Sitzungen" tab.

**Expected result**

- Step 2: exactly two tabs — **"Überblick"** and **"Sitzungen"** — with
  "Überblick" selected.
- Step 3: the overview holds the next step, waiting-on, todos, status and notes,
  and **no session list and no work trace** any more. There is exactly one place
  for sessions, not two.
- Step 5: "Letzte Spur …" with its source, and the project's `repos` entries in
  monospace (`C:/development/demo/kundenportal-web`).
- Step 6: the switch works. What Codex shows depends on the machine — see Gaps.
- Step 8: the transcript of that session opens, inside the tab.
- Step 9: further messages load; when the history is exhausted it says
  "Ende des Verlaufs".
- Step 10: back to the session list of the same project, same tab.
- Step 11: that project's own sessions, not the previous project's.

---

### UC-14 — A project without a linked directory hides the tab, and the toggle reveals it

**Preparation:** on the projects screen.

**Steps**

1. Press `5`, click the project **"Datenmigration Legacy-CRM"** (its `repos` is
   empty).
2. Look at the tab bar.
3. In the filter bar above/beside the project list, tick the checkbox
   **"Sitzungen-Tab immer zeigen"**.
4. Look at the tab bar of the same project again.
5. Click the tab **"Sitzungen"**.
6. Read what the tab says.
7. Click **"Verzeichnis zuordnen"**.
8. Click "Zurück zu den Projekten", open **"Kundenportal Relaunch"** and check
   that its Sessions tab is unaffected.
9. Restart the app (see Global preparation), press `5`, open
   "Datenmigration Legacy-CRM".
10. Untick the checkbox again.

**Expected result**

- Step 2: only **"Überblick"**. No Sessions tab.
- Step 4: the tab **"Sitzungen"** has appeared.
- Step 6: **"Kein Arbeitsverzeichnis zugeordnet"**, saying that no working
  directory of this agent belongs to the project, and where one is assigned.
- Step 7: the all-sessions view (`Projekte · Agent-Sitzungen`) opens — no dead
  end.
- Step 8: unchanged; the toggle is global but changes nothing for projects that
  already have a link.
- Step 9: the Sessions tab is **still** there — the setting survived the
  restart.
- Step 10: the tab disappears from that project again.

---

### UC-15 — Link an unlinked agent project, then find its sessions in the project

**Preparation:** the demo vault's agent project `C:/development/demo/spielwiese`
is linked to no vault project. If a previous run already linked it, undo that
first (see step 6) or re-run `npm run seed`.

**Steps**

1. Reach the all-sessions view (dashboard tile footer, or `Ctrl+K` →
   "Agent-Sitzungen").
2. Find the card whose path is `C:/development/demo/spielwiese` and click it.
3. In the header of the agent project, click **"Vault-Projekt zuordnen"**.
4. Pick **"Angebot Praxisnetz Süd"** from the picker.
5. Read the toast.
6. Do **not** click "Rückgängig" yet — first click "Zurück zu den Projekten",
   open "Angebot Praxisnetz Süd" and look at its tab bar.
7. Open its **"Sitzungen"** tab.
8. Go back to the all-sessions view and look at the `spielwiese` card again.

**Expected result**

- Step 3: the link control is offered only because this agent project has no
  vault project yet.
- Step 5: a toast **"Arbeitsverzeichnis dem Projekt „Angebot Praxisnetz Süd"
  zugeordnet"** with the hint that the path is now in `repos`, and a
  **"Rückgängig"** action.
- Step 6: the project now shows **"Überblick | Sitzungen"** — even with the
  "show empty" toggle off, because it is genuinely linked now.
- Step 7: the session from `spielwiese` is listed, and its transcript opens.
- Step 8: the card now states **"verknüpft mit angebot-praxisnetz"** and no
  longer offers the link control.

---

### UC-16 — Dismiss an unmapped agent project, bring it back, and it survives a restart

**Preparation:** if UC-15 linked `spielwiese`, undo it first (the toast's
"Rückgängig", or re-run `npm run seed` and restart) — only an **unlinked** agent
project can be dismissed.

**Steps**

1. Reach the all-sessions view.
2. On the card `C:/development/demo/spielwiese`, click the eye-with-slash button
   in its top-right corner (screen-reader name **"Projekt … ausblenden"**).
3. Look at the list and at the line below it.
4. Look at the top-right corner of a card that **is** linked to a vault project
   (e.g. the one for `kundenportal-web`).
5. Click **"Alle anzeigen"**.
6. Look at the dismissed card.
7. Click the eye button on it (**"Projekt … wieder einblenden"**).
8. Dismiss it again, then restart the app and reach the all-sessions view.
9. Click "Alle anzeigen", then click **"Ausgeblendete wieder verbergen"**.

**Expected result**

- Step 3: the card is gone from the grid, and a line below states
  **"ein Projekt ausgeblendet"** with a button **"Alle anzeigen"**. Nothing is
  hidden silently.
- Step 4: a **linked** agent project has **no** dismiss button — it belongs to a
  project and cannot vanish from it.
- Step 5: the dismissed card is visible again, marked **"ausgeblendet"**.
- Step 7: the marker is gone and the card is back in the normal list for good.
- Step 8: the dismissal is still in effect after the restart.
- Step 9: the toggle is a look, not a change — it flips back without touching
  what is stored.

---

### UC-17 — The honest states survive in both views

**Preparation:** app running on the demo vault.

**Steps**

1. Press `0`, open the tab **"Verhalten"**.
2. In the field **"Ordner der Claude-Projekte"**, replace the path with
   `C:\gibt-es-nicht\claude`.
3. Reach the all-sessions view and read what it says.
4. Click the offered action.
5. Press `5`, open **"Kundenportal Relaunch"**, open its **"Sitzungen"** tab and
   read what it says.
6. Go back to Settings → Verhalten and switch **"Claude-Code-Sessions
   mitlesen"** off.
7. Reach the all-sessions view again.
8. Open the "Sitzungen" tab of "Kundenportal Relaunch" again.
9. Switch reading back on and restore the Claude projects folder path (clear the
   field to fall back to the default, then paste
   `<repo>\.demo-vault\.secondbrain\claude-demo\projects`), or simply re-run
   `npm run seed` and restart.

**Expected result**

- Steps 3 and 5: **"Verzeichnis nicht gefunden"** and a body that **names the
  path that is missing**, plus the action "Einstellungen öffnen". Both views say
  it — the state ladder is one implementation, not two.
- Step 4: the settings screen, behaviour tab.
- Steps 7 and 8: **"Mitlesen ist ausgeschaltet"** with the action
  **"Einschalten"** — an honest off state, not an error and not a blank list.
- Step 8 in particular: the Sessions tab is **still offered** for this project
  (its `repos` says it has a working directory), so the honest state is
  reachable instead of the tab silently disappearing along with it.
- Step 5 also still shows the panel **"Arbeitsspur"** above the state — the
  index knows the last touch even when no session can be read.
- Throughout: no model is configured and nothing here asks for one.

---

## Gaps

Things the acceptance criteria claim that could **not** be turned into a
UI-only step, and why.

1. **The old addresses `#/modules`, `#/sources` and `#/agents` (with query
   string) cannot be entered.** The window is frameless with a custom title bar
   (`src/renderer/components/TitleBar.tsx`) and there is no address field, no
   "go to URL" command and no external-link entry point anywhere in the shell.
   All three stories repointed every in-app link to the new addresses, so no
   button produces an old one either. What **is** covered UI-only: that every
   destination those redirects point at is correct and complete (UC-4, UC-12).
   What is **not** covered: that `#/modules?m=<slug>&tab=log&p=<path>`,
   `#/sources` and `#/agents?a=codex&p=<key>&s=<id>` arrive with the query
   string intact. That is exactly the risk the sprint notes call out as the most
   likely silent regression, and it stays covered only by unit tests
   (`tests/renderer/screens.test.tsx`, `tests/renderer/shell.test.tsx`) and the
   Playwright smoke run — not by this plan.
   → The two opener routes `#/capture` and `#/ask?q=…` are the exception and
   **are** covered (UC-11), because the dashboard tiles, the inbox and the
   recent-work tile still navigate to them.

2. **"Reload the app on `#/…`" (story test plans 002/5, 007/8, 008/8) is not
   performable.** Same reason as gap 1: nothing in the UI lets the tester choose
   the address the app comes up on. A restart always lands on `/dashboard`.

3. **The Codex side of the Claude/Codex switch shows machine data, not demo
   data.** `scripts/seed/` writes `overview.claudeProjectsDir` into the demo
   vault but sets nothing for Codex, so `useCodexSessions` defaults to on with
   an empty `codexSessionsDir` — i.e. the real `~/.codex/sessions` of whoever
   runs the test. Steps UC-13/6 and the "switch stays available in both views"
   criterion can therefore only verify that the **control** works and that the
   resulting state is honest (empty, or "Verzeichnis nicht gefunden"); they
   cannot verify Codex sessions actually appearing in a project's tab. Story 008
   records this as an observation for later.

4. **Every LLM-backed expected result can only be seen in its "no model" form.**
   The demo vault ships `providers: []`. Ask therefore answers with passages and
   the honest note (UC-9, UC-10), and capture's proposal strip stays in its
   heuristic form (UC-5). The criteria "answers with citations and file paths"
   and "capture states where the thought landed" are still checkable — the
   citations, paths and saved path are all real — but "ask keeps everything it
   has today" cannot be checked in its with-a-model shape without configuring a
   real API key, which this plan does not do.

5. **`Ctrl+Shift+Space` may not be testable on a given machine.** If another
   application owns the combination, the app says so with a warning toast and the
   global hotkey never fires (story 007 hit exactly this). UC-6 keeps a UI
   fallback — the palette entry "Erfassen-Fenster" — which covers the capability
   but not the *global* part of the criterion.

6. **The `raw/…` maintenance finding in UC-4/8 is not guaranteed.** Whether the
   demo vault produces a finding on a `raw/` path depends on which gardener
   checks fire against the seeded content. If none appears, that half of the
   deep-link criterion ("a maintenance finding on a raw path lands on the
   Sources tab") has no UI path in that run.

7. **"Show all" in the all-sessions list is deliberately not persisted**, so
   there is nothing to check across a restart for it (UC-16/9 checks the
   opposite: that it flips back). Only the dismissals themselves and the
   "Sitzungen-Tab immer zeigen" toggle persist, and both are covered
   (UC-14/9, UC-16/8).
