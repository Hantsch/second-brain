---
sprint: S03
kind: manual acceptance test plan
doc-language: en
stories: [003, 004, 013]
ui-acceptance-required: true
---

# Sprint S03 — manual acceptance test plan

Twenty-two use cases, all of them driven through the running app. The UI of this app is
German, so every label quoted below is the German string the tester really sees; the
plan itself is English.

**Rule for this plan:** every test step is a real UI action — a click, a key, a typed
character. The console appears only to start the app and, once, to remove the search
index folder (an environment setup step, not a user-facing feature). A handful of use
cases also ask you to edit a project file directly in a text editor while the app keeps
running — that is not a workaround either, it is one of the app's own guardrails under
test ("the user may edit the files directly, and the app picks it up"). Anything a story
claims that genuinely cannot be reached that way is listed under [Gaps](#gaps) at the
end, not faked as a console step.

Sprint S03 touches two surfaces: the project **detail** view (stories 003 and 004 both
land there, so they are tested together as one walkthrough of that screen) and the
project **list**, the dashboard tiles, and the filing/linking pickers (story 013).

---

## Global preparation

Run once, before the first use case, in the repo root
(`C:\development\Hantsch\second-brain`).

### 1. Build the demo vault

PowerShell:

```powershell
npm run seed
```

This creates `.demo-vault\` with the sample content every use case below refers to.

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
whatever vault you normally work in. The title bar shows the vault name next to "Second
Brain" — that is how you confirm the right vault is open.

Where a use case says **restart the app**, close the window and run the same start
command again.

### 3. What the demo vault contains

Facts the steps below rely on. Press `2` (or click "Projekte" in the rail) to reach the
project list; scope filter "Alle", sort "Zuletzt berührt" is the default view.

| Project (work)                    | Touched      | Starred | Stale | Notes                                                              |
| ---------------------------------- | ------------ | ------- | ----- | ------------------------------------------------------------------- |
| Kundenportal Relaunch               | today        | no      | no    | has a `next_step`; deadline in 3 days; the re-entry point           |
| Orbit SSO-Migration                 | 2 days ago   | **yes** | no    | status "Wartet"; two open `waiting_on` entries, one already overdue |
| Datenmigration Legacy-CRM           | 40 days ago  | **yes** | **yes** | untouched long enough to count as stalled on its own                |
| Angebot Praxisnetz Süd              | 3 days ago   | no      | no    | **no `next_step`** — the empty state to fetch a suggestion for      |
| Rechnungsautomatisierung            | 1 day ago    | no      | no    | plain, unstarred, nothing special                                   |

| Project (private)                  | Touched      | Starred | Stale |
| ---------------------------------- | ------------ | ------- | ----- |
| Hochbeet für den Balkon             | 2 days ago   | no      | no    |
| Finanzen aufräumen                  | 5 days ago   | no      | no    |
| Podcast-Idee: Werkstattfunk         | 14 days ago  | no      | **yes** |
| Italienisch lernen                  | 33 days ago  | no      | **yes** |

Given this, the default "Alle" / "Zuletzt berührt" view's **current** section reads, top
to bottom: **Kundenportal Relaunch** (marked "Zuletzt bearbeitet"), **Orbit
SSO-Migration** (starred), **Datenmigration Legacy-CRM** (starred, still tagged
"Stagniert"), **Rechnungsautomatisierung**, **Hochbeet für den Balkon**, **Angebot
Praxisnetz Süd**, **Finanzen aufräumen** — and the collapsed "Lange nicht angefasst"
section holds **Podcast-Idee: Werkstattfunk** and **Italienisch lernen**. Use cases
below refer back to this list; if you have restarted the seed or already run some use
cases, the star/stale state may have shifted — each use case says what it needs.

Also true of every seeded project: none carries `status_set` or `next_step_set` yet, so
every provenance line starts at the honest fallback. No LLM provider is configured, so
every filing/status suggestion is the heuristic one, not a model's. UI language is
German (`languages.ui: de`).

---

## Story 003 + 004 — Project detail: notes, waiting-on, and where the facts come from

The project detail view is where both stories land, so this section walks it top to
bottom instead of separating the two stories.

### UC-1 — Before anything is recorded: the honest fallback

**Preparation:** app started as above. Press `2`, click **Kundenportal Relaunch** in the
list.

**Steps**

1. Look at the line directly under the status dropdown.
2. Look at the line under the next-step text (it already reads "Abnahmeprotokoll mit
   Miriam durchgehen …").

**Expected result**

- Step 1: "Herkunft nicht erfasst · zuletzt berührt heute" (or "vor N Tagen" if you seeded
  earlier than today) — no author is claimed, because the file has no `status_set` yet.
- Step 2: the same wording under the next step, and **no** "Möglicherweise veraltet"
  badge — nothing is invented for either value.

---

### UC-2 — Write a note, see it immediately, then undo it

**Preparation:** UC-1's project still open, Overview tab.

**Steps**

1. Look at the "Notizen" panel: it is already expanded, holding two dated entries, with
   the composer's text field directly underneath — there is no "Notizen zeigen" /
   "verbergen" toggle anywhere on the panel.
2. Click into the text field (placeholder "Notiz eintragen"), type `Testnotiz, Sprint 03`.
3. Press `Ctrl+Enter`.
4. Read the toast that appears.
5. Click "Projektdatei öffnen" in the "Stand" panel's header (or open
   `.demo-vault\projects\work\kundenportal-relaunch\project.md` yourself) and look under
   `## Notizen`.
6. Back in the app, click "Rückgängig" on the toast.
7. Look at the "Notizen" panel and the file again.

**Expected result**

- Step 3: the field clears immediately; the new note appears at the **top** of the
  "Notizen" panel with today's date, without a reload and without expanding anything —
  it renders exactly like the two seeded entries, in the same dated-heading format.
- Step 4: a success toast with a "Rückgängig" action.
- Step 5: the new text sits under its own `### <today's date>` heading, above the two
  older entries — indistinguishable from a note that was filed from a dump.
- Step 7: the note is gone from both the panel and the file; the two seeded notes and
  everything else in the file (todos, Stand) are untouched.

---

### UC-3 — A stale hash refuses to overwrite a note

**Preparation:** same project still open. Have a text editor ready to open
`.demo-vault\projects\work\kundenportal-relaunch\project.md`.

**Steps**

1. Open the file in the editor, add a short line anywhere inside `## Stand`, and save.
2. Switch back to the app **without** reselecting the project or reloading, type a note
   (`Konflikttest`) into the notes field, and press `Ctrl+Enter` as fast as you can after
   the save.
3. If the write succeeds instead of failing, press `Ctrl+R` to reload, repeat steps 1–2
   once more, acting faster.
4. Once you see the conflict, read the error and check the field and the file.

**Expected result**

- Step 4: an error banner titled "Das hat nicht funktioniert", with the body „Kundenportal
  Relaunch" wurde zwischenzeitlich geändert. Nichts wurde überschrieben." — the typed
  text `Konflikttest` is **still in the field**, and the file keeps the editor's own line
  from step 1 with no note appended.
- *Note:* like every conflict test in this app, this is timing-sensitive — the file
  watcher usually catches up within about a second, so you may need a repeat attempt.
- After confirming the conflict, press `Ctrl+R` to reload and leave the project in a
  clean state for the next use case.

---

### UC-4 — Add a waiting-on entry, see it on the dashboard, then undo it

**Preparation:** press `Ctrl+R` if you haven't already, reopen **Kundenportal Relaunch**.

**Steps**

1. Look at the "Warte auf" panel: it is empty for this project ("Du wartest bei diesem
   Projekt auf niemanden."), with an "Warten auf hinzufügen" button below it.
2. Press `w`. A row of fields opens; the "Auf wen wird gewartet" field has focus.
3. Type `Miriam` and press `Enter` without filling anything else.
4. Look at the list, then open the project file and check `waiting_on`.
5. Press `1` to go to the dashboard, find the "Warte auf" tile.
6. Press `2`, reopen Kundenportal Relaunch, click "Rückgängig" on the still-visible
   waiting toast (or, if it has since disappeared, resolve the new entry and disregard
   the toast check).
7. Check the list and the file once more.

**Expected result**

- Step 3: the composer stays open (ready for another entry) and the field clears; the
  entry "Miriam" appears in the "Warte auf" list with today's date as "seit".
- Step 4: the file's `waiting_on` array gained one entry, `who: Miriam`, `since:
  <today>`, with no `what`/`due` keys at all (left out, not written as empty strings).
- Step 5: the tile lists "Miriam" among the projects' waiting-on entries, the same as any
  filed one.
- Step 7: the entry is gone from the list and from the file's `waiting_on` array; nothing
  else in the file changed.

---

### UC-5 — Keyboard reaches both composers, and knows when not to fire

**Preparation:** same project, Overview tab, nothing focused (click empty space on the
panel background first).

**Steps**

1. Press `m`. Then press `Escape` (nothing to close, the note field is always mounted —
   just confirm focus landed there by starting to type `x` and deleting it again).
2. Click elsewhere to blur, then press `w`. The waiting composer opens with its first
   field focused.
3. Press `Escape`.
4. Click into the note text field, type the letter `w` as part of a sentence (e.g.
   `wichtig`). Watch that nothing else opens.
5. Click into the "Todos" panel's new-todo field (press `t` first if it isn't open), type
   the letter `m` as part of a word.

**Expected result**

- Step 1: the note field has focus (typed characters land in it).
- Step 2: the "Auf wen wird gewartet" field has focus.
- Step 3: the waiting composer closes and clears.
- Step 4 and 5: typing `w`/`m` inside a field only adds the letter — it never opens or
  closes a composer while you are typing somewhere else.

---

### UC-6 — Status provenance: set by you

**Preparation:** same project.

**Steps**

1. Open the "Status" dropdown and pick a different value (e.g. "Pausiert"), then switch
   it back to "Aktiv" if you want to leave the project as the seed found it.
2. Read the line under the dropdown after each change.
3. Open the project file and check the frontmatter.

**Expected result**

- Step 2: "Von dir gesetzt · heute" appears immediately after each change — no reload
  needed.
- Step 3: `status_set: { at: <today>, by: user }` sits under `next_step` in the
  frontmatter.

---

### UC-7 — Next-step provenance: typed by hand, then accepted from a suggestion

**Preparation:** press `2`, open **Angebot Praxisnetz Süd** — the one project with no
`next_step` set.

**Steps**

1. Look at the next-step area: "Kein nächster Schritt festgelegt" plus a "Vorschlag
   holen" button.
2. Click "Vorschlag holen".
3. Read the suggestion card: the proposed next step, the reasoning line, and the line
   "Aus Regeln über den Bestand abgeleitet, ohne Modell." (no LLM is configured).
4. Click "Nur den Schritt" (or "Beides übernehmen" if it offers a status change too).
5. Read the line under the now-filled-in next step.
6. Press `2`, open a different project, then come back to Angebot Praxisnetz Süd.
7. Click the next-step line to edit it, type a different sentence, press `Enter`.
8. Read the provenance line again.

**Expected result**

- Step 3: the card states plainly that this is a rule-based guess, never claiming a
  model's judgement it didn't get.
- Step 5: "Aus einem Vorschlag übernommen · heute".
- Step 6: still "Aus einem Vorschlag übernommen · heute" after navigating away and back —
  the acceptance is recorded in the file, not just in this session's memory.
- Step 8: "Von dir gesetzt · heute" — hand-typing a step overwrites both the text and the
  provenance.

---

### UC-8 — A stale next step becomes visible, and stops being stale

**Preparation:** Angebot Praxisnetz Süd, right after UC-7 (it now has `next_step_set:
{ at: <today>, by: user }`). Open its file,
`.demo-vault\projects\work\angebot-praxisnetz\project.md`, in a text editor, app still
running.

**Steps**

1. In the editor, change `next_step_set`'s `at` to three days ago (keep `by: user`), and
   save.
2. Switch back to the app within a few seconds — do not reload.
3. Read the next-step area.
4. Back in the editor, set `at` to today again, save, switch back to the app.
5. Read the next-step area once more.

**Expected result**

- Step 3: a warning badge "Möglicherweise veraltet" appears next to the provenance line,
  with the explanation "Seit dem Eintragen hat sich etwas im Projekt getan." — the file
  itself was touched today (by your edit), which is after the `at` you just backdated.
- Step 5: the badge is gone — the app picked up the external edit without a restart,
  exactly like the note/waiting-on paths above.

---

### UC-9 — Notes tolerate a hand-renamed heading

**Preparation:** Kundenportal Relaunch, its file open in a text editor.

**Steps**

1. In the editor, rename `## Notizen` to `## Notes` and save.
2. Switch back to the app: the "Notizen" panel title itself doesn't change (it's the
   screen's own label), but check that the two existing dated entries still show.
3. Write one more note through the composer (`Nach Umbenennung`) and save it.
4. Reopen the file and check where the new entry landed.

**Expected result**

- Step 2: both older entries are still visible — nothing got orphaned by the renamed
  heading.
- Step 4: the new entry sits under the same `## Notes` heading, not under a second,
  newly created `## Notizen` section.

---

## Story 013 — Favourite projects: star, order, tiles, and pickers

### UC-10 — One flat list, no work/private blocks, and the re-entry marker

**Preparation:** press `2`. Scope filter on "Alle".

**Steps**

1. Read the list top to bottom; look for any heading that separates work from private
   rows.
2. Read the meta row of the very first project.
3. Switch the scope filter to "Arbeit", then to "Privat", then back to "Alle".

**Expected result**

- Step 1: one flat list — **Kundenportal Relaunch, Orbit SSO-Migration, Datenmigration
  Legacy-CRM, Rechnungsautomatisierung, Hochbeet für den Balkon, Angebot Praxisnetz Süd,
  Finanzen aufräumen** — no "Arbeit" / "Privat" heading anywhere in it, and the collapsed
  "Lange nicht angefasst — 2" section below holds Podcast-Idee and Italienisch lernen.
- Step 2: Kundenportal Relaunch's row carries the "Zuletzt bearbeitet" chip.
- Step 3: each scope still shows a single flat list (no headings appear even filtered to
  one scope) and the private-only list still has no favourite at the top (private
  projects start with none starred) — the scope filter alone is what separates the
  scopes.

---

### UC-11 — Star and unstar a project from the list

**Preparation:** scope "Alle", as in UC-10.

**Steps**

1. Hover over the row "Rechnungsautomatisierung" (do not click the row itself).
2. Click the star that appears at the right edge of the row.
3. Look at its new position and the star's fill.
4. Click the same star again.

**Expected result**

- Step 1: a hollow star fades in on hover — it isn't visible on an unstarred row at rest.
- Step 3: the star is filled (solid, no colour tint — outline vs. filled at text colour
  is the only difference), and the row has moved up, in among Orbit SSO-Migration and
  Datenmigration Legacy-CRM (the favourites), just below the top "Zuletzt bearbeitet" row.
- Step 4: the star empties and the row returns to its previous spot, right after
  Datenmigration Legacy-CRM.

---

### UC-12 — A starred stale project stays out of the stale section

**Preparation:** scope "Alle". Datenmigration Legacy-CRM is starred and stale per the
seed (UC-10's list).

**Steps**

1. Find Datenmigration Legacy-CRM in the main list (not inside the collapsed section) and
   read its row.
2. Expand "Lange nicht angefasst" and check whether it's listed there too.
3. Click its star to unstar it.
4. Check both places again.
5. Click its star once more to restore it.

**Expected result**

- Step 1: the row carries the amber "Stagniert" tag while sitting in the main list.
- Step 2: it does **not** also appear in the collapsed section — every project appears
  exactly once.
- Step 4: after unstarring, the row is gone from the main list and now sits inside "Lange
  nicht angefasst", still tagged "Stagniert".
- Step 5: it's back in the main list, starred and stale again, as in step 1 — restoring
  the seed's baseline for later use cases.

---

### UC-13 — The last-touched project, if starred, appears once

**Preparation:** scope "Alle". Kundenportal Relaunch is the current top row (unstarred).

**Steps**

1. Hover Kundenportal Relaunch's row, click its star.
2. Look at the whole list, top to bottom.
3. Unstar it again to restore the seed's baseline.

**Expected result**

- Step 2: it still stands exactly once, at the very top, still carrying "Zuletzt
  bearbeitet" — it does **not** also show up a second time among Orbit SSO-Migration and
  Datenmigration Legacy-CRM just because it is now also starred.

---

### UC-14 — Deadline, priority and name sort exactly as before

**Preparation:** scope "Alle", sort "Zuletzt berührt" (the default).

**Steps**

1. Switch the "Sortierung" dropdown to "Priorität".
2. Read the list: note where Datenmigration Legacy-CRM (starred) sits relative to
   Kundenportal Relaunch and Hochbeet für den Balkon.
3. Switch to "Name".
4. Read the list top to bottom.
5. Switch to "Frist".
6. Switch back to "Zuletzt berührt".

**Expected result**

- Every one of steps 1, 3 and 5: **no** "Zuletzt bearbeitet" chip anywhere in the list —
  that marker only makes a claim under the default sort.
- Step 2: Datenmigration Legacy-CRM sits near the **bottom** of the current section
  (after Hochbeet für den Balkon), not pulled toward the top the way it is under "Zuletzt
  berührt" — its star does not change a priority order.
- Step 4: exact alphabetical order — Angebot Praxisnetz Süd, Datenmigration Legacy-CRM,
  Finanzen aufräumen, Hochbeet für den Balkon, Kundenportal Relaunch, Orbit
  SSO-Migration, Rechnungsautomatisierung, then the collapsed section (Italienisch
  lernen, Podcast-Idee) — Orbit and Datenmigration sit wherever the alphabet puts them,
  not pulled forward.
- Step 6: the "Zuletzt bearbeitet"-marked, favourites-first order from UC-10 is back.

---

### UC-15 — The scope filter still excludes a starred project

**Preparation:** scope "Alle", sort "Zuletzt berührt".

**Steps**

1. Hover "Finanzen aufräumen" (private, unstarred) and star it.
2. Set the scope filter to "Arbeit".
3. Look for "Finanzen aufräumen" in the list.
4. Set the scope back to "Alle", unstar "Finanzen aufräumen" again.

**Expected result**

- Step 3: it is **not** shown — a starred project the scope filter excludes stays
  excluded; the star raises a project within its own scope, it does not smuggle it past
  the filter.

---

### UC-16 — Star from the project detail, the list follows

**Preparation:** open **Rechnungsautomatisierung**'s detail (unstarred, per the seed).

**Steps**

1. Look at the title row: an outline star sits next to the scope badge "Arbeit".
2. Click it.
3. Press `2` to go back to the list, without doing anything else.

**Expected result**

- Step 2: the star fills immediately, no confirmation dialog.
- Step 3: the list reflects the change — Rechnungsautomatisierung now sits among the
  favourites, right after Datenmigration Legacy-CRM, without a reload.
- Afterward, click the star again (from either the list row or the detail head) to
  unstar it and restore the seed's baseline for later use cases.

---

### UC-17 — A hand-typed `favorite: true` has the same effect as a click

**Preparation:** app running, Projects screen open. Open
`.demo-vault\projects\private\podcast-werkstattfunk\project.md` in a text editor.

**Steps**

1. Add a line `favorite: true` under `priority` in the frontmatter and save.
2. Switch back to the app within a few seconds, without reloading.
3. Expand "Lange nicht angefasst" (Podcast-Idee is stale and was in there).
4. Look at the main list above the collapsed section.

**Expected result**

- Step 4: Podcast-Idee: Werkstattfunk has left the collapsed section and now shows a
  filled star in the main list, tagged "Stagniert" — the star pulled it up exactly as a
  click would have, and the app picked up the hand-edited file without a restart.
- Undo it afterward: set `favorite: false` in the file (or the same edit as `false`) and
  save, to restore the baseline.

---

### UC-18 — Favourites first in the dashboard tiles

**Preparation:** press `1` for the dashboard. "Laufende Projekte" and "Stagnierende
Projekte" are hidden by default.

**Steps**

1. Click "Module" in the dashboard header.
2. In the dialog "Module des Dashboards", tick "Laufende Projekte" and "Stagnierende
   Projekte", then close the dialog.
3. Read the "Laufende Projekte" tile top to bottom.
4. Read the "Stagnierende Projekte" tile top to bottom.
5. Reopen "Module" and untick both tiles again, to leave the dashboard as the seed found
   it.

**Expected result**

- Step 3: **Datenmigration Legacy-CRM** is the first row, even though Kundenportal
  Relaunch has a more urgent priority and a more recent trail — the favourite sorts
  first, ahead of the tile's own priority ordering.
- Step 4: Datenmigration Legacy-CRM again sits first — it is both a favourite and stale,
  so it belongs in this tile too, and its star still wins the ordering here.

---

### UC-19 — Favourites first in the filing target picker

**Preparation:** dashboard or any screen.

**Steps**

1. Click the lightning-bolt "Erfassen" button in the title bar.
2. Type a short thought, e.g. `Testgedanke für die Zielauswahl`, and press `Ctrl+Enter`.
3. Press `Ctrl+K`, type `abge` and press `Enter` on "Nicht abgelegt" to reach the unfiled
   list; click the dump you just captured.
4. On its proposal card, click "Anderes Ziel".
5. Read the order of the list in the dialog "Anderes Ziel", ignoring the search field.
6. Close the dialog with "Schließen" and click "Verwerfen" on the dump to clean up.

**Expected result**

- Step 5: the currently proposed target (whatever the heuristic picked, e.g. "Inbox")
  comes first, then the favourite projects — Orbit SSO-Migration and Datenmigration
  Legacy-CRM — ahead of any more-recently-touched non-favourite project such as
  Kundenportal Relaunch, then the rest in the proposal's own order.

---

### UC-20 — Favourites first when linking an agent working directory

**Preparation:** press `Ctrl+K`, type `Agent-Sitzungen`, press `Enter`. On the "Claude"
tab, find a project card that shows **no** "verknüpft mit …" line under its dates (a
linked one has that line, an unlinked one doesn't — e.g. "spielwiese" in the demo data)
and open it.

**Steps**

1. Click "Vault-Projekt zuordnen".
2. Open the select's dropdown (do not pick anything yet) and read the order of the
   project names.
3. Press `Escape` to close the dropdown without picking, to leave the agent project
   unlinked for anyone re-running this plan.

**Expected result**

- Step 2: Orbit SSO-Migration and Datenmigration Legacy-CRM (the favourites) appear
  before Kundenportal Relaunch, even though Kundenportal was touched more recently — the
  same `favoritesFirst` order the dashboard tiles and the filing picker use.

---

### UC-21 — Both languages, and the labels this sprint added

**Preparation:** Settings → tab "Sprachen", set "Oberflächensprache" to "English".

**Steps**

1. Press `2`, hover a project row and read the star's screen-reader label (inspect via
   accessibility tooling, or simply trust the visible "last worked on" chip's text).
2. Open a project's detail; read the status and next-step provenance lines, the "Notes"
   panel (composer placeholder and hint), and the "Waiting for" panel (composer labels).
3. Switch back to "Deutsch".

**Expected result**

- Step 1: the top row reads "Last worked on" instead of "Zuletzt bearbeitet".
- Step 2: "Set by you · {date}" / "Accepted from a suggestion · {date}" / "Origin not
  recorded · last touched {age}"; the note field's placeholder "Add a note"; the waiting
  panel's "Add" action — no German word left on the screen.

---

## Cross-story — surviving a restart and an index rebuild

### UC-22 — Everything this sprint wrote survives a full rebuild

This is the one place this plan needs a step outside the UI: the index is a derived
cache, and proving it is *derivable* means removing it and watching the app rebuild it —
there is no in-app button for that by design (deleting `.secondbrain/index/` is an
environment setup action, not a user-facing feature; the verification itself happens
entirely back in the UI afterward).

**Preparation:** run through UC-2 (a note), UC-4 (a waiting-on entry, this time leave it
in rather than undoing it), UC-6 (a status change) and UC-11 (star
Rechnungsautomatisierung, this time leave it starred) without undoing any of them.

**Steps**

1. Close the app.
2. Delete the folder `.demo-vault\.secondbrain\index\` (File Explorer, or `Remove-Item
   -Recurse -Force .demo-vault\.secondbrain\index`).
3. Start the app again with the same command as in Global preparation.
4. Open Kundenportal Relaunch: check the note, the waiting-on entry, and the status
   provenance line.
5. Press `2`: check Rechnungsautomatisierung's star and its position in the list.

**Expected result**

- Step 3: the app opens normally — no error, no "rebuilding" screen that gets stuck —
  and after a short moment the list and dashboard populate.
- Steps 4 and 5: every one of the four facts written before the deletion is exactly as
  you left it — nothing here lived only in the index.

---

## Gaps

Things the acceptance criteria claim that could **not** be turned into a UI-only step,
and why.

1. **Whether a hand-typed `favorite`/heading value survives the write path unchanged is
   only checked by reopening the file in a text editor**, not by an in-app "show file
   contents" view — the app has no such screen (`docs/VAULT-FORMAT.md` describes the
   format; reading the raw file is the only way to see it verbatim). This is the same
   kind of step story 003's and 006's plans (S01/S02) already used for the same reason,
   not a new gap this sprint introduces.
2. **UC-3's and UC-8's conflicts/external-edit pickups are timing-sensitive**, exactly
   like the conflict use case in the S02 plan: the file watcher usually notices an
   external change within about a second, so reproducing "a write against an
   already-stale hash" can take a repeat attempt. That raciness is itself evidence the
   "files are the truth" guardrail is working, not a flaw in the steps.
3. **The exact wording of a heuristic status/next-step suggestion (UC-7) is not fixed by
   this plan.** Which text the rule-based suggestion proposes for "Angebot Praxisnetz
   Süd" depends on its open todos at the moment you run the seed, not on anything pinned
   here — the acceptance/provenance path around the suggestion is what is under test, not
   one particular sentence.
4. **`status_set`/`next_step_set`'s "unrecognized `by` value falls back to unknown"**
   (a decision recorded in story 004) is not exercised by this plan: typing a nonsense
   `by` value into the file by hand and confirming the fallback would need the same kind
   of external-edit step as UC-8 for a case with no separate visible acceptance criterion
   of its own — covered by the story's own unit tests instead
   (`tests/core/index/projects.test.ts`).
