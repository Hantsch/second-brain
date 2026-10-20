# S11 test plan — evidence stays primary, the run stays visible, and a condensation can be deleted

Sprint S11 shipped three user-facing stories and one tooling story. This document is a
step-by-step guide for a non-technical test user to check the three user-facing pieces
through the real UI — no console commands beyond starting the app and seeding the demo
vault:

- **040 — an answer cites the source, never the condensation.** Asking a question can no
  longer return a condensed artifact as a citation or excerpt, in any scope, with or
  without a model.
- **042 — a maintenance run stays visible wherever I am.** The maintenance progress strip
  now lives in the app shell instead of only on the Maintenance screen, and closing the
  app while a run is going warns first.
- **043 — I can delete a condensed artifact.** The condensed tab can delete an existing
  artifact, with a confirmation that names what is lost and a way back through the trash.

Story **041 — the format gate is green on Windows** has no UI surface at all (it is a
repository line-ending/tooling fix) and is out of scope for a UI walkthrough — see the
note at the end of this document for how it is accepted instead.

## Preparation

1. Open a terminal in the project folder.
2. Run `npm run seed`. This builds a demo vault (`.demo-vault/`) with realistic sample
   content. Relevant for this sprint: the area **Gesundheit** (`areas/gesundheit.md`)
   already carries a condensed artifact (`areas/gesundheit.condensed.md`) with one
   directive already recorded ("Keine offenen Finanz-Themen hier aufnehmen."), sourced
   from `areas/gesundheit.md`. This is the one area you need for use cases 1 and 4 below.
3. Run `npm run dev`. This starts the app with hot reload. Wait until the window opens.
4. The seeded vault has no LLM provider configured. Several steps below explicitly work
   this way (the "no model configured" paths); others need a real, reachable model to
   observe the golden path. Configure one via **Settings → Models**: add a provider (a
   local Ollama/LM Studio install, or any OpenAI-compatible endpoint you have access to),
   test it, then either press **Route automatically** or set individual tasks by hand in
   the routing table. The tasks you will route below, by name:
   - `query-answer` — for use case 1's with-model steps.
   - `condense-area` — for use case 4's "no resurrection" step.
   - `gardener-audit` — for use case 2, so the maintenance run takes long enough (seconds,
     not milliseconds) to actually watch it survive navigation. Without a model routed
     here, the run finishes almost instantly and the strip may disappear before you can
     navigate anywhere — still correct behaviour, just too fast to watch.
   - If you have no reachable model at all, note the affected steps as unverified rather
     than approximating the result by any other means.
5. Note on language: the app's UI language and document language are independent, set
   under **Settings → Languages**. Steps that ask you to check both languages mean the UI
   language switch there, not the vault language.

---

## Use case 1 — An answer never cites the condensation, only its sources (story 040)

Checks the guardrail: a condensed artifact stays fully findable in search, but is never
returned as an answer's evidence — with a model routed for `query-answer` and without one,
and whether filing an answer back as a page can smuggle a condensed citation into a new
page.

**Steps — the artifact stays findable in search**

1. Press `Ctrl+K` to open the command palette. Type `gesundheit`.

**Expected result**

- The condensed artifact (`areas/gesundheit.condensed.md`) appears among the search
  results — it is still reachable by the fastest route in the app, exactly as before this
  story. Open it to confirm the hit leads somewhere real.

**Steps — the honest no-model answer never cites it**

2. Make sure `query-answer` is **not** routed to a model (Settings → Models — this is the
   seeded vault's default).
3. Press `Ctrl+K` again. Press `Tab` (or click the **Ask** mode chip) to switch into ask
   mode. Type a question using wording close to a sentence in the artifact's "Stand"
   section, e.g. "Wie hält sich der Rücken?" / "How is the back holding up?", and press
   Enter.

**Expected result**

- With no model configured, the answer lists the matching passages directly (an honest
  fallback, not a generated sentence). None of the listed passages is
  `areas/gesundheit.condensed.md` — the day entry or `areas/gesundheit.md` itself is what
  shows.

4. Ask a question that only the artifact's own synthesis wording would match — something
   phrased like the "Muster" section's insight (movement and sleep length correlating),
   worded so it does not literally appear in `areas/gesundheit.md`'s own notes.

**Expected result**

- The answer is the honest "no evidence found" message, not a citation of the artifact.
  This is expected and correct: the condensation is worded differently from its sources on
  purpose, and a question only the condensation's phrasing would answer is meant to come
  back empty rather than launder the condensation in as a "quote."

**Steps — the same holds with a model configured**

5. Route `query-answer` to a reachable model (see Preparation, step 4). Repeat steps 3 and
   4 above.

**Expected result**

- The prose answer's citation list still contains no path ending in `.condensed.md` — the
  guardrail holds the same way whether or not a model is involved.

**Steps — the condensed tab says it is not evidence**

6. **Notes** → open area **Gesundheit** → **Verdichtet** / **Condensed** tab (third tab,
   next to Notizen/Notes and Todos).

**Expected result**

- Below the artifact's rendered content, one quiet line states that the artifact is not
  used as evidence and that answers cite its sources instead.

7. Switch the UI language (Settings → Languages) and look at the same line again.

**Expected result**

- The line is translated in both languages; the German version uses the low-high quote
  pair `„…“` wherever it quotes anything, never a straight `"`.

**Steps — filing an answer back cannot carry a condensed citation**

8. Back in the **Ask** overlay (`Ctrl+K` → ask mode, or `Ctrl+K` → type `?` followed by a
   question), ask a question that returns at least one real citation (e.g. one from step 3
   with the model routed). On the answer, press **File as wiki page** / **Als Wiki-Seite
   ablegen**, pick or create a module, give it a title, and confirm.
9. Open the page that was created.

**Expected result**

- The new page's evidence section and its `sources:` frontmatter list only real, primary
  files — no path ending in `.condensed.md`, even though the condensed artifact was
  findable in search the whole time.

---

## Use case 2 — A maintenance run stays visible wherever I go (story 042)

Checks that the progress strip lives in the shell rather than on one screen: it survives
navigation, offers stop/continue from anywhere, disappears when nothing is running, and
never competes with the screen's own teal accent.

**Preparation for this use case:** route `gardener-audit` to a reachable model (Preparation
step 4) so the run takes long enough to actually watch.

**Steps — the strip survives navigation**

1. Go to **Maintenance** (the Garden screen in the rail). Press **Jetzt prüfen** / **Check
   now**.
2. While the strip is running, click through: **Dashboard**, **Journal**, a project, then
   back to **Maintenance**.

**Expected result**

- The strip (a thin bar right under the title bar) stays visible on every screen you visit,
  the whole way. The running check's name, the step count, the elapsed timer, and the stop
  button all keep working — nothing blinks, empties or vanishes at any point, including
  while the model is interpreting findings (the number can stand still for several seconds
  there; the elapsed timer keeps ticking to show the run is still alive).

**Steps — stop and continue from elsewhere**

3. Start a run again (if the previous one finished). Navigate to the **Dashboard**. Press
   the **×** button inside the strip itself (not on the Maintenance screen).

**Expected result**

- The run ends. The strip switches to a "stopped partway" message with a **continue**
  button, visible from wherever you are (except the Maintenance screen itself, which shows
  its own equivalent banner there instead — see below).

4. Press **continue** in the strip.

**Expected result**

- The run resumes without repeating the stages it had already finished.

5. Let it finish, then dismiss the notice via the strip's dismiss (×) button.

**Expected result**

- The strip disappears and does not reappear on further navigation.

**Steps — finishing while you are elsewhere**

6. Start a run, immediately go to **Journal**, and wait for it to finish there.

**Expected result**

- The strip reports the run as finished and then disappears on its own — you do not need to
  go back to Maintenance to notice. Go to **Maintenance**: the new report and health score
  are shown without a manual reload.

**Steps — no phantom bar**

7. With no run going (including right after the stop in step 3), look at every screen in
   the rail.

**Expected result**

- No strip is shown anywhere. The fix does not trade "the strip disappears when it
  shouldn't" for "the strip appears when nothing is running."

**Steps — one accent per screen**

8. With a run going, look at **Maintenance**, **Dashboard**, and **Settings** in turn.

**Expected result**

- Exactly one teal-accented element is visible per screen — the screen's own primary
  action. The strip itself is grey/neutral, never teal.

**Steps — language**

9. Switch the UI language and repeat steps 3–5 far enough to read every new string.

**Expected result**

- No key names, no English leftovers, and German text uses `„…“` where it quotes anything.

---

## Use case 3 — Closing the app during a run warns me first (story 042)

Checks that the app cannot be closed mid-write without at least one explicit choice, and
that cancelling the warning changes nothing.

**Steps — the title bar's × during a run**

1. Start a maintenance run (Preparation as in use case 2). While it is going, click the
   window's own **×** in the title bar (top right of the frameless window).

**Expected result**

- A dialog appears: "Ein Pflegelauf läuft noch." / "A maintenance run is still going." The
  window stays open and the run keeps going behind the dialog.

2. Press **Abbrechen** / **Cancel** (or press `Escape`).

**Expected result**

- The dialog closes. The window is still open, the run is still going, and the strip keeps
  advancing exactly as before — nothing was touched.

3. Click × again. This time press **Lauf stoppen und schließen** / **Stop run and close**.

**Expected result**

- The app closes. Start it again (`npm run dev`) and go to **Maintenance**: it shows a
  stopped-partway report with a working **continue** — not a truncated or missing one.

**Steps — `Alt+F4`**

4. Start a run again. Press `Alt+F4`.

**Expected result**

- The same warning dialog appears (this is the same close event as the title bar's ×, by
  design). Cancel it, confirm the run is untouched, then let the run finish normally and
  press `Alt+F4` again — this time the app closes immediately with no warning, since no
  run is going.

---

## Use case 4 — I can delete a condensed artifact (story 043)

Uses the seeded **Gesundheit** area, whose condensed artifact already carries a directive.

**Steps — no dead control without an artifact**

1. Open an area that was never condensed (any area besides Gesundheit that has no
   `<slug>.condensed.md` file — check by opening its condensed tab first).

**Expected result**

- The condensed tab shows its empty state and offers **no delete control at all** — not a
  disabled button, nothing.

**Steps — the confirmation names what is lost**

2. **Notes** → **Gesundheit** → **Verdichtet** / **Condensed** tab. Press **Verdichtung
   löschen** / **Delete condensation**.

**Expected result**

- A dialog opens naming the file (`areas/gesundheit.condensed.md`). It states that the
  sections and sources can be regenerated from the area's own notes, but explicitly says
  the directives section is the one part no later run can reproduce.

3. Press **Abbrechen** / **Cancel**.

**Expected result**

- The dialog closes, the artifact is still shown in the tab, and the file on disk is
  unchanged.

**Steps — delete, and the way back**

4. Press **Verdichtung löschen** / **Delete condensation** again, then confirm with
   **Löschen** / **Delete**.

**Expected result**

- The tab falls back to its "never condensed" empty state.
- In a file browser, `areas/gesundheit.condensed.md` is gone from the vault folder, and a
  new token folder under `.secondbrain/trash/` holds a copy of the file, directives section
  included.

**Steps — the index dropped it**

5. Press `Ctrl+K` and search for a phrase that only occurred in the deleted artifact (e.g. a
   distinctive word from its "Muster" section) — no hit.
6. Go to **Maintenance** and run a check.

**Expected result**

- The report now lists Gesundheit as needing a condensation (material present, no
  artifact) — the same "condensation due" finding kind used for areas that were never
  condensed.

**Steps — no resurrection of the deleted directive**

7. Route `condense-area` to a reachable model (Preparation step 4). Back on Gesundheit's
   condensed tab, press **Diesen Bereich verdichten** / **Condense this area** (first-ever
   run again, since the artifact is gone).

**Expected result**

- The resulting proposal contains no directives section — the rejected-finance sentence
  from before the delete does not come back on its own.

**Steps — conflict**

8. If you still have an artifact for another area (or re-create one for Gesundheit by
   accepting the run from step 7), open its condensed tab. Edit the underlying
   `<slug>.condensed.md` file directly in a text editor outside the app and save. Back in
   the app, press delete and confirm.

**Expected result**

- The app reports a conflict instead of deleting — the file is still on disk with your
  external edit, and nothing new appears under `.secondbrain/trash/` for this attempt.

**Steps — works with no model configured**

9. In **Settings → Models**, unroute `condense-area`. Open the condensed tab of an area that
   still has an artifact.

**Expected result**

- The honest no-model note is shown, the artifact stays readable, and the delete button and
  confirmation still work end to end.

**Steps — language**

10. Switch the UI language and repeat steps 2 and 4.

**Expected result**

- All strings are translated, and the German dialog title uses `„…“` around the file path.

---

## Note on story 041 — the format gate is green on Windows

This story has no UI surface at all — it fixes a repository-wide line-ending mismatch so
`npm run format:check` (and therefore `npm run verify` and `npm run handoff`) is green on
Windows. Per the project's own test plan for this story, its acceptance is procedural, not
a UI walkthrough:

1. `npm run format:check` → exits 0, no file list.
2. `npm run verify` → passes format:check and continues through lint, typecheck, test,
   build.
3. `npm run handoff` → runs to completion and writes exactly one
   `dist/gaston-<version>-windows.zip`.

Do not attempt to construct a UI test for this story — there is not one, by design.

---

## Known gaps for this test round

- **Use case 1's with-model steps, use case 2, and use case 4's "no resurrection" step need
  a real, reachable LLM provider.** The seeded demo vault deliberately ships with no
  provider configured. If no reachable model is available on the test machine, note the
  affected steps as unverified rather than approximating a result by a console command or
  a direct IPC call — this project's UI-acceptance rule does not allow that as a substitute
  for a real user-facing step.
- **A tray quit cannot be exercised through this UI.** Story 042's close guard also covers
  `app.on('before-quit')`, which a system tray's "Quit" item would trigger — but this build
  has no system tray at all (no `Tray` is created anywhere in `src/main/`). The guard code
  is in place and covered by automated tests, but there is no real UI door to drive it
  through yet. Use case 3 above only exercises the two doors that do exist: the title bar's
  × and `Alt+F4`. This is a genuine gap, not a step to skip silently — record it as
  "not testable through this build's UI" rather than inventing a workaround.
