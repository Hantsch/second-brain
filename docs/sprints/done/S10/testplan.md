# S10 test plan — the condensed layer, area level

Sprint S10 shipped the first slice of the condensed layer (M12, area level): a day now
says which areas it touched (036), an area can be condensed into one file that a human
confirms before anything is written (037/038), and maintenance says, without a model,
when a condensation is due or missing (039). This document is a step-by-step guide for a
non-technical test user to check that work through the real UI — no console commands
beyond starting the app and seeding the demo vault.

Two things are explicitly out of scope this sprint, and are not tested below: deleting a
condensed artifact from the UI, and citing a condensed artifact as evidence when
answering a question (the concept's Q4 decision keeps condensed files out of the
citation path entirely — this is by design, not a gap).

## Preparation

1. Open a terminal in the project folder.
2. Run `npm run seed`. This builds a demo vault (`.demo-vault/`) with realistic sample
   content, including three areas relevant to this sprint:
   - **Gesundheit** (`areas/gesundheit.md`) already carries an existing condensed
     artifact (`areas/gesundheit.condensed.md`) with one directive already recorded
     ("Keine offenen Finanz-Themen hier aufnehmen.") — this artifact is seeded as
     out of date (it carries no recorded source hashes), so maintenance reports it as
     due.
   - **Kunden und Team** (`areas/kunden-und-team.md`) has notes and todos but no
     condensed artifact yet.
   - **Finanzen** (`areas/finanzen.md`) is a freshly created area with only a todo and
     no notes, also with no condensed artifact.
3. Run `npm run dev`. This starts the app with hot reload. Wait until the window opens.
4. The seeded vault has no LLM provider configured. Use cases 2 and 6 below work exactly
   as seeded. Use cases 1, 3, 4 and 5 need a real, reachable model to see the golden
   path (a proposal actually coming back) — configure one via **Settings → Models**:
   add a provider (a local Ollama/LM Studio install, or any OpenAI-compatible endpoint
   you have access to) and route the task named in each use case to it. This is the same
   "you need a real reachable model to see the golden path" situation as previous
   sprints' local-runtime test plans — if you have no reachable model at all, note the
   affected steps as unverified rather than approximating the result.
5. Note on language: the app's UI language and document language are independent, set
   under **Settings → Languages**. Steps that ask you to check both languages mean the
   UI language switch there, not the vault language.

---

## Use case 1 — Closing a day proposes which areas it touched (story 036)

Checks that the day-close proposal now includes an areas row, that only areas that
exist in the vault are ever offered, that nothing is written until accepted, and that
the row works honestly with and without a model.

**Steps — without a model (honest empty state)**

1. Make sure no model is routed for `extract-tasks` (**Settings → Models** — leave the
   task unassigned, or note the vault's default state).
2. **Journal**, open today's entry, write a sentence or two, then press **Tag
   abschließen** / **Close day**.
3. In the close panel that appears, find the **Bereiche** / **Areas** row.

**Expected result**

- The row shows the honest empty state ("Kein Bereich ausgewählt." / "No area
  chosen.") — no invented chip, no error, no dead control.
- An "add an area" picker is still shown and offers only areas that actually exist in
  the vault (Gesundheit, Kunden und Team, Finanzen, and any others seeded).

**Steps — the picker still lets you add an area manually**

4. Use the picker to add "Gesundheit". Confirm it appears as a removable chip. Remove
   it again — it disappears.
5. Press **Verwerfen** / **Discard**. Open `areas/gesundheit.md` in a text editor — it is
   unchanged (no day file references were written, since nothing was accepted).

**Steps — with a model configured**

6. Route `extract-tasks` to a reachable model (see Preparation, step 4).
7. Open a day, write a sentence that clearly touches an existing area (e.g. mentions
   sleep/back training for Gesundheit), press **Close day** again.
8. Read the **Areas** row.

**Expected result**

- The model's proposed area appears as a chip; it can be removed, and a different
  existing area can be added via the picker. Only real vault areas are ever offered
  (no invented slug).

9. Keep one area, then press **Übernehmen** / **Apply**.

**Expected result**

- The day's frontmatter now carries `areas: [<slug>]`; every other frontmatter key and
  the day's body text are unchanged (open the day file in an editor to confirm).

10. Switch the UI language (**Settings → Languages**) and repeat step 3: the row's
    label, empty state and picker placeholder are translated, German text uses
    the low-high quote pair `„…“` (visible in the remove-chip's label, e.g.
    „Gesundheit“ entfernen).

---

## Use case 2 — Reading a condensation with no model configured (stories 037/038)

Checks the honest "no model configured" state: the tab still shows an existing
artifact, but offers no trigger at all (not merely a disabled one).

**Steps**

1. Make sure no model is routed for `condense-area` (**Settings → Models** — this is
   the seeded vault's default state; confirm the task shows as unassigned rather than
   silently falling back to another task's model).
2. **Notes**, open the **Gesundheit** area, switch to its **Verdichtet** / **Condensed**
   tab (third tab, next to Notizen/Notes and Todos).

**Expected result**

- A card states plainly that no model is configured, names the task kind
  (`condense-area` / "Bereich verdichten" / "Condense area"), and links to the model
  settings.
- No trigger button ("Diesen Bereich verdichten" / "Condense this area") is rendered
  anywhere on the tab — not shown-and-disabled, simply absent.
- Below or next to that card, the existing artifact is still shown: its
  "Verdichtet am …" / "Condensed …" date, its source count, and its rendered
  state/patterns/open sections — reading an existing artifact never needs a model.

3. Open the **Kunden und Team** or **Finanzen** area's condensed tab (no artifact
   exists yet for either).

**Expected result**

- The same no-model card is shown, and no empty-state trigger is offered for these
  areas either.

---

## Use case 3 — Producing a condensation with a model, and reading the diff before

accepting (stories 037/038, golden path)

**Steps**

1. Route `condense-area` to a reachable model (Preparation step 4). Note: this task is
   marked sensitive and the settings screen recommends a local model for it — using a
   local install is closer to how this is meant to run in practice.
2. **Notes** → **Gesundheit** → **Verdichtet** tab. Press **Erneut verdichten** /
   **Condense again** (the artifact already exists, so the button reads "again").

**Expected result**

- A running state appears immediately: the trigger becomes disabled and a spinner with
  "Verdichtung läuft" / "Condensation running" is shown next to it.

3. Wait for the run to finish.

**Expected result**

- A diff appears below the existing artifact: a summary line ("N entfernt, N
  hinzugefügt" / "N removed, N added"), then line rows. Removed lines carry a minus
  glyph, added lines a plus glyph — both are visually as prominent as each other, not
  colour-only (check this holds if you have a colour-blindness simulation handy, or at
  least confirm the glyph is present on every changed row, not just a colour change).
- The artifact's per-section `Aus: …` / `From: …` source lines appear as ordinary rows
  in the diff — if a source line changed, it shows as a removed row plus an added row,
  the same as any other changed sentence.
- **Nothing has been written yet.** Before doing anything else, open
  `areas/gesundheit.condensed.md` in a text editor: it still shows the old content, not
  the proposal.

4. Back in the app, press **Übernehmen** / **Accept**.

**Expected result**

- The artifact view updates to the new content and a new "Verdichtet am …" date.
- Open `.secondbrain/trash/` in a file browser: a new token folder holds a copy of the
  artifact's previous content (the undo copy).
- Re-open `areas/gesundheit.condensed.md` in the editor: it now matches what the diff's
  "after" side showed.

---

## Use case 4 — Rejecting a condensation with a reason, and seeing it land in the

artifact's directives on the next run (story 038)

Uses **Kunden und Team**, which starts this sprint with no condensed artifact at all —
so this also exercises "reject before any artifact exists."

**Steps**

1. With `condense-area` still routed to a reachable model, open **Notes** → **Kunden
   und Team** → **Verdichtet** tab. Press **Diesen Bereich verdichten** / **Condense
   this area** (first-ever run for this area).
2. When the diff appears, press **Ablehnen** / **Reject** (not Accept).

**Expected result**

- A dialog opens asking for a reason. The confirm button is disabled while the field is
  empty or contains only whitespace — there is no way to dismiss the proposal without
  entering a sentence, and no other close affordance (×, Escape, backdrop) discards the
  proposal itself, only the dialog.

3. Type a reason, e.g. "Keine Kundennamen wörtlich übernehmen." / "Do not quote client
   names verbatim.", and confirm.

**Expected result**

- The proposal disappears from the tab.
- Open `areas/kunden-und-team.condensed.md` in a text editor: it now exists, but
  carries only frontmatter plus a **Direktiven** / **Directives** section with your
  sentence — no `state`/`patterns`/`open` body sections and no `condensed_at`, since no
  condensation was actually accepted yet.

4. Back in the app, press the trigger again ("Diesen Bereich verdichten" — still the
   first real condensation, since the previous run was rejected).

**Expected result**

- The new diff shows the directives section only as unchanged context (never as a
  removed row) — your reason survives into the next run's comparison.
- The new proposal's content should visibly respect the instruction you gave (e.g. no
  client names quoted in a state/patterns/open sentence) — read the diff's added rows
  to confirm, since this depends on the actual model's behaviour rather than a
  guaranteed mechanical rule.

5. Accept this run. Reopen the artifact file: the directive sentence from step 3 is
   still there, now alongside the newly written body sections.

---

## Use case 5 — A stale-hash conflict when accepting (story 038)

Checks that an external edit between "run" and "accept" is never silently overwritten
or merged.

**Steps**

1. With `condense-area` routed, open **Notes** → **Gesundheit** → **Verdichtet** tab and
   press **Erneut verdichten** / **Condense again**. Wait for the diff to appear —do
   **not** accept yet.
2. While the proposal is showing, open `areas/gesundheit.condensed.md` in a text editor
   outside the app, change something in it (e.g. add a word to the Direktiven section),
   and save.
3. Back in the app, press **Übernehmen** / **Accept**.

**Expected result**

- The app reports a conflict (a toast/error naming the area) instead of writing — the
  proposal is discarded, and you are told to re-run rather than the app attempting any
  merge.
- Your external edit from step 2 is still in the file afterward, completely unmerged
  with the proposal's content.
- No new `.secondbrain/trash/` entry was created for this attempt (a conflicting accept
  writes nothing, so there is nothing to snapshot).

4. Press the trigger again to get a fresh proposal based on the file's current content,
   and confirm accepting it now succeeds.

---

## Use case 6 — Maintenance reports a condensation is due or missing, and its "open"

link (story 039)

Checks the deterministic, model-free check and its exit into the area — the check
itself needs no model configured at any point.

**Steps**

1. Make sure `condense-area` is unrouted again (or leave it as-is — this check does not
   depend on a model either way; testing it both ways is the point of step 5 below).
2. **Maintenance** screen (Garden), press the button that runs a full check.
3. Look through the resulting findings for the kind labelled "Fällige Verdichtungen" /
   "Condensations due".

**Expected result**

- At least three findings of this kind appear (from the seeded vault): one for
  **Gesundheit** (its artifact is out of date), one each for **Kunden und Team** and
  **Finanzen** (material exists, no artifact at all) — the exact wording differs
  between the "out of date" and "no artifact yet" variant, but both name the area.
- Every one of these findings is shown with the **informational** severity badge, not a
  warning — visually distinct from, e.g., a broken-wikilink finding.
- None of them offers a "fix" action (no button that would write anything) — only the
  file path(s) and, if applicable, an "open in editor" affordance.

4. Click the area's path shown in the finding (under "Dateien" / "Files"), e.g.
   `areas/gesundheit.md`.

**Expected result**

- The app navigates in-app to **Notes**, opens that area, and lands on its
  **Verdichtet** / **Condensed** tab.
- Nothing was written to the vault by clicking this — the tab shows the existing
  artifact (or the empty state) exactly as before, with no diff pre-confirmed and no
  accept having happened.

5. Go back to Maintenance. Use the findings filter at the top of the list to narrow to
   this one kind (a "kind" dropdown), then press the "check only this" button that
   appears once the filter narrows the view.

**Expected result**

- The rerun still reports the same condensation findings; other kinds are absent from
  the result (the run genuinely narrowed, it did not just hide rows).

6. Change the filter to scope by module instead (pick any module).

**Expected result**

- No condensation-due finding appears under a module scope — an area belongs to no
  module, so a module-scoped run correctly excludes it.

7. Start a full run again and stop it partway through (the interface's stop/cancel
   control).

**Expected result**

- The condensation findings from the already-completed check stage are still shown,
  and the run is marked incomplete/stopped, not failed.

8. With no model configured anywhere in the app, run maintenance once more.

**Expected result**

- The identical condensation findings appear — this check does not depend on a model,
  unlike, say, a contradiction finding.

9. Switch the UI language (**Settings → Languages**) and repeat step 3.

**Expected result**

- The kind label and each finding's sentence are translated in both languages; German
  text uses `„…“` where it quotes anything.

---

## Known gaps for this test round

- **Use cases 1, 3, 4 and 5 need a real, reachable LLM provider** (local or remote) to
  see the actual proposal come back — the seeded demo vault deliberately ships with no
  provider configured, and this repository's own rule forbids seed/test scripts from
  calling a real model. If no reachable model is available on the test machine, note
  the affected steps as unverified rather than approximating a proposal by any other
  means (no console/IPC shortcut is acceptable for a user-facing action per this
  project's UI-acceptance rule).
- Deleting a condensed artifact from the UI, and citing a condensed artifact as
  evidence in question answering, are both deliberately out of scope for this sprint
  (recorded as follow-ups in the roadmap) — they are not tested above, and their
  absence from the UI is expected, not a defect.
