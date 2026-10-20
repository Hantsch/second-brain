# S05 manual test plan — a finding can be acted on

Covers the five stories delivered this sprint:

- [014 — the maintenance run reports findings, not results](../../requirements/done/014-maintenance-says-befund.md)
- [015 — a near-duplicate can be resolved, not only compared](../../requirements/done/015-resolve-a-near-duplicate.md)
- [016 — an orphaned page can be linked where I say](../../requirements/done/016-orphan-page-i-pick-the-target.md)
- [017 — a finding says how it ends, and "looks fine" stays reversible](../../requirements/done/017-a-finding-says-how-it-ends.md)
- [020 — journal, announced and never followed up](../../requirements/done/020-journal-loose-ends.md)

014 is a pure rename (the German UI now says "Befund"/"Befunde" instead of "Ergebnis"
wherever it means a maintenance finding); every screenshot below already shows that
wording, so it has no use case of its own — check it in passing as you read the cards.

Every step that performs a user-facing action goes through the real running app —
clicking and typing. A terminal is only used to start the app, seed the demo vault, or
verify a side effect on disk _after_ an action already happened in the UI (a moved file,
a changed catalog line) — never to perform the action itself.

## 0. Preparation

1. Open a terminal in the repository root (`C:\development\Hantsch\second-brain`).
2. Install dependencies if you haven't already: `npm install`.
3. Build a demo vault with realistic sample content:

   ```powershell
   npm run seed
   ```

   The demo vault ships every fixture this plan needs: a near-duplicate pair and a
   zero-candidate orphan page in the module **Second-Brain-Methodik**, a single-candidate
   orphan in **Identity-Management** (regression only, not walked below), and two
   journal announcements — one already answered by a later day, one still open.

4. Run the project's own live smoke test (builds the app, drives it with Playwright,
   drops a PNG of every screen into `.screenshots/`):

   ```powershell
   npm run shot
   ```

   Expected: finishes without console errors; `.screenshots/06-garden.png` shows the
   **Pflege** screen with at least one finding. Treat red output as a blocker before the
   manual steps below.

5. Start the real app for the manual walkthrough:

   ```powershell
   npm run dev
   ```

6. In the left rail, click **Pflege** (the maintenance screen; overline "Wissen gesund
   halten"). No provider or model is configured in the freshly seeded demo vault — that
   is deliberate: most of this plan runs in the app's normal "no model configured" state,
   the same state 020's heuristic and the mechanical checks always run in.
7. Click **Jetzt prüfen** top right and wait for the run to finish before starting any
   use case below.

## 1. Resolve a near-duplicate — discard one of the two pages (015)

**Content:** the seeded pair titled "Your AI Second Brain Is Slowly Rotting (Video)" in
module Second-Brain-Methodik — one file's name ends in `-2.md`.

**Steps**

1. In the findings list, open the group **Beinahe-Dubletten** (or set the "Art" filter to
   it) and find the card for that title.
2. Read the card: both pages side by side with their creation date, a "„…" verwerfen"
   button under each page naming its own file, a "Überholt: … → …" button, plus "Beide
   Seiten vergleichen", "Habe ich in den Dateien erledigt", the snooze clock icon and "Ist
   kein Problem" — never only the last one.
3. Click the discard button naming the file that ends in `-2.md`.
4. In the dialog "„…-2.md" verwerfen?": read how many other pages link to it (or "Keine
   andere Seite verlinkt darauf."), the exact catalog line that would be removed, and — if
   it has inbound links — a pre-checked "Verweise auf „…" statt darauf umbiegen" checkbox.
   Click **Abbrechen**. Expected: dialog closes, nothing on disk changed.
5. Click the same discard button again, this time click **Verwerfen**.
6. Expected: the outcome strip reads "„…-2.md" liegt jetzt im Papierkorb." with a
   **Rückgängig** button.
7. Verify on disk (after the fact): the file is gone from
   `.demo-vault\modules\second-brain-methodik\wiki\sources\`, a copy sits under
   `.demo-vault\.secondbrain\trash\`, and its line is gone from
   `.demo-vault\modules\second-brain-methodik\wiki\index.md`.

   ```powershell
   Get-ChildItem .demo-vault\.secondbrain\trash
   Select-String -Path .demo-vault\modules\second-brain-methodik\wiki\index.md -Pattern "-2"
   ```

8. Click **Rückgängig** in the strip. Expected: the file and its catalog line are back.
9. Click **Neu prüfen**. Expected: the near-duplicate finding is reported again — the run
   recomputes from the files, and both files are back.

## 2. Resolve a near-duplicate — name one as superseding the other (015)

Continue on the same card (re-run the check if you navigated away).

**Steps**

1. Under "Welche Seite ist die neuere?", pick one of the two radio options (each names a
   file). Expected: once picked, a preview appears — "Trägt supersedes: […] in {file} ein.
   Beide Seiten bleiben stehen, die ältere ist damit als überholt markiert." plus a
   `+ supersedes: […]` preview line — and only then does the "Überholt: … → …" button
   become the thing to click.
2. Click **Überholt: … → …**. Expected: the outcome strip reads "Eingetragen in {file}.".
   Both files still exist; open the newer file to confirm the `supersedes:` line is there.
3. Click **Rückgängig**. Expected: the frontmatter is back to what it was.
4. Confirm the supersede again (step 2). Click **Neu prüfen**. Expected: the pair is **not**
   reported as a near-duplicate any more — a named relation silences it.
5. Reopen the newer file in Notepad or VS Code, remove the `supersedes:` line, and instead
   add `extends: [<the other file's slug>]` by hand, then save. Back in the app, on any
   other finding's card click **Habe ich in den Dateien erledigt** to trigger a fresh run
   (or click **Neu prüfen** top right). Expected: the pair stays silent — a relation typed
   by hand counts exactly like one written by the app.

## 3. A stale edit is refused, not overwritten (015 guardrail)

**Steps**

1. Run the check again so both files count as a fresh near-duplicate pair (undo the
   supersede from case 2 first, or re-seed).
2. Open one of the two pages in Notepad or VS Code, add a line, and save it — but do
   **not** run the check again in the app.
3. In the app, click the discard button for that same file and confirm.
4. Expected: the app reports a conflict instead of silently discarding — the file you just
   edited is untouched, and the sentence names that one of the two pages could not be read
   as expected (it may have changed since the run).

## 4. Link an orphaned page — from the module overview (016)

**Content:** "Interview: Warum Notiz-Communities ihre Wikis nicht pflegen" in
Second-Brain-Methodik — a freshly condensed source page nothing yet mentions.

**Steps**

1. Set the "Art" filter to **Verwaiste Seiten** and open that page's card.
2. Read the card: no fix button, the note "Von selbst richten lässt sich hier nichts. Die
   Wege daraus stehen darunter.", then a "Zielseite" section with a one-click "Von der
   Übersicht des Moduls „Second-Brain-Methodik" aus verlinken" button, an "Andere Seite
   wählen" link, and (below) the shared "„…" verwerfen" action.
3. Click **Von der Übersicht … aus verlinken**. Expected: a preview appears immediately —
   "Geschrieben wird in overview.md:" plus the exact `+ Bezug: […]` (or `Related:`) line —
   and a button "Verweis in „overview.md" eintragen" appears.
4. Click that button. Expected: the outcome strip shows the write with a **Rückgängig**
   button.
5. Open `.demo-vault\modules\second-brain-methodik\wiki\overview.md` in an editor: the
   line stands as its own paragraph at the end, nothing earlier in the file changed.
6. Click **Rückgängig**. Expected: the line is gone again, the rest of the file unchanged.

## 5. Link an orphaned page — pick a page myself (016)

**Steps**

1. Re-run the check (or reopen the same card from case 4).
2. Click **Andere Seite wählen**. Expected: a list of the module's other pages opens
   (a search field with the label "Seite suchen" appears once the module has eight or
   more candidates; below that it is a plain dropdown) — the orphaned page itself and the
   overview page you already linked from in case 4 are not offered.
3. Before picking, open one of the candidate pages in an external editor, add a sentence
   at the end, and save it.
4. Back in the app, pick that same page. Expected: the preview names exactly that file and
   the same `+ Bezug: […]` line as before.
5. Click "Verweis in „…" eintragen". Expected: the line is appended **below** the sentence
   you just added by hand — nothing you wrote is lost, because the write re-reads the file
   first.
6. Run the check again: the page is no longer reported as orphaned.

## 6. Discard a page that has no reason to exist (015 shared with 016)

**Steps**

1. On any orphan card (an orphan finding has no surviving page to repoint to), click the
   "„…" verwerfen" button.
2. Expected: the dialog names the file, states plainly "Keine andere Seite verlinkt
   darauf." (no repoint checkbox — there is nothing to repoint to), and shows the catalog
   line that would be removed.
3. Confirm. Expected: outcome strip "„…" liegt jetzt im Papierkorb." with **Rückgängig**.
4. Click **Rückgängig**. Expected: the page is back.

## 7. "Not now" — snooze a finding, and bring it back (017)

**Steps**

1. Pick any open finding and click the clock icon (its label reads "Nicht jetzt: „{titel}"").
2. In the panel, click **Nächste Woche**. Expected: the card leaves the open list, the
   outcome strip reads "Nicht jetzt. Der Befund kommt am {datum} wieder." with a
   **Wieder anzeigen** button.
3. Click **Wieder anzeigen** in the strip. Expected: the strip now reads "Der Befund zählt
   wieder." — the finding is back on the open list.
4. Snooze the same (or another) finding again. This time, instead of using the strip,
   change the "Zustand" filter to **Nicht jetzt**. Expected: the card is listed there with
   the note "Kommt am {datum} wieder." and its own **Wieder anzeigen** button.
5. Click that button on the card. Expected: no outcome strip appears — the finding is
   simply back in the open list. Reversibility does not depend on the strip staying on
   screen.

## 8. "This is not a problem" — dismiss a finding, and bring it back (017)

**Steps**

1. Pick a different open finding and click **Ist kein Problem**.
2. Expected: the outcome strip reads "Kein Problem. Der Befund zählt nicht mehr gegen die
   Gesundheit." with a **Wieder anzeigen** button. (Contrast with case 7 step 2: the two
   sentences read unmistakably differently — one says "not a problem," the other names a
   return date.)
3. Navigate to Dashboard and back to Pflege — the strip is gone by now, as expected.
4. Set the "Zustand" filter to **Kein Problem**. Expected: the card is listed there with
   the note "Ist kein Problem." and a **Wieder anzeigen** button.
5. Click it. Expected: the finding is back on the open list, and the health score (see
   case 9) drops to include it again.
6. Click **Neu prüfen**. Expected: your dismiss decisions from this section that you did
   not just restore are still gone — a fresh run keeps them, because they are statements
   about the subject matter, not about one run.

## 9. The health card admits what it left out (017)

Do this with at least one dismissed and one snoozed finding still hidden (leave one of
each from cases 7–8 unrestored).

**Steps**

1. Look at the health card's "Woher der Wert kommt" section.
2. Expected: a line naming the total and the split, e.g. "2 Befunde bleiben bei diesem
   Wert ausgeklammert: 1 als kein Problem markiert, 1 nicht jetzt." — never "Die Prüfung
   hat keine Befunde ergeben." while something is hidden, even if the visible score reads 100.
3. Click **Ausgeklammerte Befunde zeigen**. Expected: the "Zustand" filter jumps to
   **Alle** and both hidden cards appear.

## 10. A loose end — answer it (020)

**Content:** the seeded, still-open announcement "Morgen habe ich einen Termin beim
Zahnarzt, wegen der Krone, die seit Wochen wackelt." (a journal day a few days back).

**Steps**

1. Set the "Art" filter to **Lose Enden** (or scroll to that group — it renders even at
   zero, with its own count).
2. Open the card. Expected: the quoted sentence in its own block, "Angekündigt am {tag}.
   Seitdem nichts dazu.", the note "Von der eingebauten Prüfung gefunden." (no model is
   routed), and — among the affected files — the announcing day's path.
3. Click that path. Expected: the journal day opens and the sentence really stands there,
   word for word.
4. Back on the card, type an answer into the "Antwort" field, e.g. "Der Termin ist gut
   gelaufen, die Krone hält wieder.", and click **Eintragen**.
5. Expected: the card leaves the list; the outcome strip shows the write (today's journal
   file).
6. Open **Tagebuch → heute**: your exact words stand in the entry, preceded by a link back
   to the announcing day.
7. Click **Neu prüfen** on Pflege. Expected: the answered loose end does not come back.

## 11. A loose end — dismiss it, and the no-model state (020)

**Steps**

1. On a second open loose-end card, click **Ist kein Problem**.
2. Set the "Zustand" filter to **Kein Problem**. Expected: it is listed there like any
   other hidden finding, with **Wieder anzeigen** to bring it back — 020 reuses 017's
   mechanism rather than building a second one.
3. Confirm the whole loose-end group has been visible throughout this walkthrough without
   any provider or model configured (check **Einstellungen → Modelle → Aufgaben-Routing**:
   the row "Losen Enden nachgehen" reads "Standard: ohne Modell" — nobody set that up).
   Expected: the loose-end group and every action on it worked identically; the app never
   showed a dead area or an error because no model is routed for this sensitive task.

## 12. Loose ends reach me as reminders (020)

**Steps**

1. Restore any loose end you dismissed or answered above only if you want the tile to show
   one — otherwise use one that is still open.
2. Open **Dashboard** and find the **Warte auf** tile.
3. Expected: the open loose end appears as its own row with the detail "Angekündigt am
   {datum}, seitdem nichts dazu" — the same wording the maintenance card uses, so it is
   clear why it is nagging.
4. Click the clock icon next to it and choose **Nächste Woche**.
5. Expected: the row leaves the tile; back on Pflege, the same finding now shows the
   "Nicht jetzt" state in the filter (case 7's mechanism, shared).
6. Click the loose end's title in the tile (before snoozing it, if you want to redo step
   4): expected navigation to the journal day it was announced on.

## Language check

Once through any one of the sections above: go to **Einstellungen → Sprachen**, switch
"Oberfläche" to **English**, and repeat the same card. Expected: every label — button
text, dialog title, preview sentence, outcome strip, filter option — is in English, no
leftover German string, sentence case, no emoji. Switch back to German afterwards.

## Gaps

None found: every user-facing action named by the five stories — discard, supersede, pick
an orphan target, fix, dismiss, snooze, restore, recheck, answer a loose end, and reading
the hidden/health state — has a real control in the running UI. Two things are
intentionally **not** exercised above because they are out of this sprint's scope, not
UI-reachability gaps:

- Citing a source page via another page's `sources:` frontmatter (016's own documented
  out-of-scope variant) — the orphan card can only append a body line, never a
  frontmatter citation.
- A model-found loose end (`origin: 'model'`) needs a real local model routed for
  "Losen Enden nachgehen"; the heuristic path in cases 10–12 covers the app's default,
  always-available behaviour, and is what a user without a configured model actually
  sees.
