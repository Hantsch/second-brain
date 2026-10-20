# S12 test plan — a project gathers itself

Sprint S12 shipped the project level of the condensed layer (M14): a project can be condensed
into one file (044), the Project knowledge tab shows the diff before anything is written and can
accept, reject-with-reason or delete the artifact (045), and Maintenance says — without a model —
when a project's condensation is due or missing (046). This mirrors sprint S10's area-level test
plan one level up. This document is a step-by-step guide for a non-technical test user to check
that work through the real, running UI — no console command beyond starting the app and seeding
the demo vault.

## Preparation

1. Open a terminal in the project folder (see the project's `README.md` for the full command
   list).
2. Run `npm run seed`. This builds a demo vault (`.demo-vault/`) with realistic sample content,
   including:
   - **Orbit SSO-Migration** (`projects/work/orbit-sso-migration/project.md`, status "waiting")
     already carries an existing condensed artifact
     (`projects/work/orbit-sso-migration/condensed.md`) with one directive already recorded
     ("Bei jedem Lauf explizit nennen, ob das Rollenkonzept inzwischen freigegeben ist.") — this
     artifact is seeded without recorded source hashes, so Maintenance reports it as due.
   - **Kundenportal Relaunch** (`projects/work/kundenportal-relaunch/project.md`, status "active")
     has notes and todos but no condensed artifact at all yet.
   - Several other running projects (e.g. Datenmigration Legacy-CRM, Angebot Praxisnetz Süd,
     Rechnungsautomatisierung, and the private projects) likewise have no condensed artifact,
     which is why Maintenance reports several "condensation missing" findings, not just one.
3. Run `npm run dev`. This starts the app with hot reload. Wait until the window opens.
4. The seeded vault has no LLM provider configured. Use cases 2, 6 and 7 below work exactly as
   seeded. Use cases 3, 4 and 5 need a real, reachable model to see the golden path (a proposal
   actually coming back) — configure one via **Settings → Models**: add a provider (a local
   Ollama/LM Studio install, or any OpenAI-compatible endpoint you have access to), let it detect
   or load its models, and let the tab's routing proposal assign `condense-project` to it (or route
   it by hand in the routing table). If you have no reachable model at all, note the affected steps
   as unverified rather than approximating the result — no console/IPC shortcut is acceptable for
   a user-facing action under this project's UI-acceptance rule.
5. Note on language: the app's UI language and document language are independent, set under
   **Settings → Languages**. Steps that ask you to check both languages mean the UI language
   switch there, not the vault language.

---

## Use case 1 — The Knowledge tab is there and directly addressable (story 045)

**Steps**

1. Go to **Projects**, open **Orbit SSO-Migration**.
2. Look at the row of tabs on the project's detail view.

**Expected result**

- A **Wissen** / **Knowledge** tab is present — unlike the Sessions tab, it is shown for every
  project, not only ones with linked agent sessions.

3. Click it. Look at the address bar / the app's current address.

**Expected result**

- The address reads `?p=orbit-sso-migration&tab=knowledge` (the project's slug plus
  `tab=knowledge`).

4. Reload the app window (or copy the address, close and reopen the project, or use the app's
   reload shortcut if available) while that address is current.

**Expected result**

- The app opens directly on the Knowledge tab of Orbit SSO-Migration — the deep link works, not
  just the click path.

---

## Use case 2 — No model configured for `condense-project` (stories 044/045)

Checks the honest "no model configured" state: the tab still shows the existing artifact, but
offers no trigger at all — not merely a disabled one.

**Steps**

1. Make sure no model is routed for `condense-project` (**Settings → Models** — this is the
   seeded vault's default state; confirm the task shows as unassigned rather than silently
   falling back to another task's model).
2. **Projects** → **Orbit SSO-Migration** → **Wissen** / **Knowledge** tab.

**Expected result**

- A card states plainly that no model is configured, names the task kind (`condense-project` /
  "Projekt verdichten" / "Condense project"), and links to the model settings (**Settings →
  Models**).
- No trigger button ("Dieses Projekt verdichten" / "Condense this project") is rendered anywhere
  on the tab — not shown-and-disabled, simply absent.
- Below or next to that card, the existing artifact is still shown: its "Verdichtet am …" /
  "Condensed …" date, its source count, and its rendered Stand/Nächster Schritt/Wartet auf/Gelernt
  sections — reading an existing artifact never needs a model.

3. Open **Kundenportal Relaunch**'s Knowledge tab (no artifact exists yet for this project).

**Expected result**

- The same no-model card is shown, and no empty-state trigger is offered for this project either.

---

## Use case 3 — Producing a condensation with a model, and reading the diff before accepting (stories 044/045, golden path)

**Steps**

1. Route `condense-project` to a reachable model (Preparation step 4). Note: this task is marked
   sensitive by the app and the settings screen recommends a local model for it.
2. **Projects** → **Orbit SSO-Migration** → **Wissen** tab. Press **Erneut verdichten** /
   **Condense again** (the artifact already exists, so the button reads "again").

**Expected result**

- A running state appears immediately: the trigger becomes disabled and a spinner with
  "Verdichtung läuft" / "Condensation running" is shown next to it.

3. Wait for the run to finish.

**Expected result**

- A diff appears below the existing artifact: a summary line ("N entfernt, N hinzugefügt" / "N
  removed, N added"), then line rows. Removed lines are as visually prominent as added lines, not
  colour-only (check the glyph is present on every changed row, not just a colour change).
- The artifact's per-section `Aus: …` / `From: …` source lines appear as ordinary rows in the
  diff, exactly like any other changed sentence.
- **Nothing has been written yet.** Before doing anything else, open
  `projects/work/orbit-sso-migration/condensed.md` in a text editor: it still shows the old
  content, not the proposal.

4. Back in the app, press **Übernehmen** / **Accept**.

**Expected result**

- The artifact view updates to the new content and a new "Verdichtet am …" date.
- Open `.secondbrain/trash/` in a file browser: a new token folder holds a copy of the artifact's
  previous content (the undo copy).
- Re-open `projects/work/orbit-sso-migration/condensed.md` in the editor: it now matches what the
  diff's "after" side showed.

---

## Use case 4 — Rejecting a condensation with a reason, and seeing it land in the artifact's directives on the next run (stories 044/045)

Uses **Kundenportal Relaunch**, which starts this sprint with no condensed artifact at all — so
this also exercises "reject before any artifact exists."

**Steps**

1. With `condense-project` still routed to a reachable model, open **Projects** → **Kundenportal
   Relaunch** → **Wissen** tab. Press **Dieses Projekt verdichten** / **Condense this project**
   (first-ever run for this project).
2. When the diff appears, press **Ablehnen** / **Reject** (not Accept).

**Expected result**

- A dialog opens asking for a reason. The confirm button is disabled while the field is empty or
  contains only whitespace — there is no way to dismiss the proposal without entering a sentence,
  and no other close affordance discards the proposal itself, only the dialog.

3. Type a reason, e.g. "Keine Preise wörtlich übernehmen." / "Do not quote prices verbatim.", and
   confirm.

**Expected result**

- The proposal disappears from the tab.
- Open `projects/work/kundenportal-relaunch/condensed.md` in a text editor: it now exists, but
  carries only frontmatter plus a **Direktiven** / **Directives** section with your sentence — no
  Stand/Nächster Schritt/Wartet auf/Gelernt sections and no `condensed_at`, since no condensation
  was actually accepted yet.

4. Back in the app, press the trigger again ("Dieses Projekt verdichten" — still the first real
   condensation, since the previous run was rejected).

**Expected result**

- The new diff shows the directives section only as unchanged context (never as a removed row) —
  your reason survives into the next run's comparison.

5. Accept this run. Reopen the artifact file: the directive sentence from step 3 is still there,
   now alongside the newly written body sections.

---

## Use case 5 — A stale-hash conflict when accepting (stories 044/045)

Checks that an external edit between "run" and "accept" is never silently overwritten or merged.

**Steps**

1. With `condense-project` routed, open **Projects** → **Orbit SSO-Migration** → **Wissen** tab
   and press **Erneut verdichten** / **Condense again**. Wait for the diff to appear — do **not**
   accept yet.
2. While the proposal is showing, open `projects/work/orbit-sso-migration/condensed.md` in a text
   editor outside the app, change something in it (e.g. add a word to the Direktiven section), and
   save.
3. Back in the app, press **Übernehmen** / **Accept**.

**Expected result**

- The app reports a conflict (a toast/error naming the project) instead of writing — the proposal
  is discarded, and you are told to re-run rather than the app attempting any merge.
- Your external edit from step 2 is still in the file afterward, completely unmerged with the
  proposal's content.
- No new `.secondbrain/trash/` entry was created for this attempt.

4. Press the trigger again to get a fresh proposal based on the file's current content, and
   confirm accepting it now succeeds.

---

## Use case 6 — Deleting an existing project's condensed artifact (story 045)

Checks the delete affordance mirroring the area level's delete (story 043), hash-guarded and
undoable.

**Steps**

1. **Projects** → **Orbit SSO-Migration** → **Wissen** tab. Confirm the artifact from use case 3
   or 5 is showing (an artifact must exist — delete is not offered on an empty state).
2. Press **Verdichtung löschen** / **Delete condensation**.

**Expected result**

- A confirmation dialog names the artifact's file path
  (`projects/work/orbit-sso-migration/condensed.md`) and states plainly that the directives
  section is the part no later run can reproduce.

3. Confirm the deletion.

**Expected result**

- The tab falls back to its "Noch nicht verdichtet" / "Not condensed yet" empty state.
- The artifact file is gone from `projects/work/orbit-sso-migration/`.
- `.secondbrain/trash/` holds a new token folder with the deleted artifact's full previous
  content, including its directives section.

4. Press the trigger again ("Dieses Projekt verdichten", now the first-run wording again) and let
   a run complete.

**Expected result**

- The new proposal does not contain the directive that was deleted in step 3 — the deleted
  directive does not come back.

5. Repeat with a stale hash: trigger a run, then — before accepting — delete the artifact from a
   second path if possible, or otherwise confirm that a delete attempted against a hash that no
   longer matches the file on disk is refused as a conflict rather than deleting silently (if you
   cannot force this state through the UI alone, note it as unverified rather than approximating
   it via a console command).

---

## Use case 7 — Maintenance reports a project's condensation is due or missing, and its "open" link (story 046)

Checks the deterministic, model-free check and its exit into the project's Knowledge tab — the
check itself needs no model configured at any point.

**Steps**

1. Make sure `condense-project` is unrouted again (or leave it as-is — this check does not depend
   on a model either way; testing it both ways is the point of step 6 below).
2. **Maintenance** screen (Garden), press the button that runs a full check.
3. Look through the resulting findings for the kind labelled "Fällige Verdichtungen" /
   "Condensations due".

**Expected result**

- At least one finding names a **project** and reads as "condensation due" — Orbit SSO-Migration,
  whose seeded artifact carries no recorded source hashes and is therefore treated as stale.
- Several further findings name other running projects (e.g. Kundenportal Relaunch, before use
  case 4's condensation was accepted, or others such as Datenmigration Legacy-CRM, Angebot
  Praxisnetz Süd, Rechnungsautomatisierung) and read as "condensation missing" — material exists,
  no artifact at all.
- Every one of these findings is shown with the **informational** severity badge, not a warning —
  visually distinct from, e.g., a broken-wikilink finding.
- None of them offers a "fix" action (no button that would write anything) — only the file
  path(s).
- These project findings are visually distinguishable from the area-level "condensation due" /
  "condensation missing" findings still present from S10 (e.g. Kunden und Team, Finanzen) — each
  names its own unit, "Bereich" / "area" vs. "Projekt" / "project", in its title.

4. Click the project's condensed-artifact path shown in the finding (under "Dateien" / "Files"),
   e.g. `projects/work/orbit-sso-migration/condensed.md`.

**Expected result**

- The app navigates in-app to **Projects**, opens that project, and lands on its **Wissen** /
  **Knowledge** tab (`?p=orbit-sso-migration&tab=knowledge`).
- Nothing was written to the vault by clicking this — the tab shows the existing artifact (or the
  empty state) exactly as before, with no diff pre-confirmed and no accept having happened.
- Clicking the plain `project.md` path of a project (shown as the finding's second file) still
  lands on the project's overview, not the Knowledge tab — the two routes stay distinct.

5. With no model configured anywhere in the app, run maintenance once more.

**Expected result**

- The identical project condensation findings appear — this check does not depend on a model,
  unlike, say, a contradiction finding.

6. Switch the UI language (**Settings → Languages**) and repeat step 3.

**Expected result**

- The kind label and each project finding's sentence are translated in both languages, naming the
  project as "Projekt" / "project" rather than "Bereich" / "area"; German text uses the low-high
  quote pair `„…“`.

---

## Use case 8 — The area level stays unaffected (regression check, story 045)

**Steps**

1. Go to **Notes**, open the seeded **Gesundheit** area (carried over from S10, still condensed),
   its **Verdichtet** / **Condensed** tab.
2. Read, trigger a run, reject with a reason, and delete, exactly as in the S10 test plan.

**Expected result**

- Every step behaves exactly as it did in S10 — the area-level condensed tab and its IPC channels
  were only generalised with a `unit` discriminator this sprint, not changed in behaviour.

---

## Known gaps for this test round

- **Use cases 3, 4 and 5 need a real, reachable LLM provider** (local or remote) to see the actual
  proposal come back — the seeded demo vault deliberately ships with no provider configured, and
  this repository's own rule forbids seed/test scripts from calling a real model. If no reachable
  model is available on the test machine, note the affected steps as unverified rather than
  approximating a proposal by any other means (no console/IPC shortcut is acceptable for a
  user-facing action per this project's UI-acceptance rule).
- **Use case 6's step 5 (forcing a stale-hash conflict on delete)** may not be reproducible through
  the UI alone within a single session, since the same tab is the only place both the run and the
  external edit would need to interleave with a second delete path. If it cannot be forced, this
  is named here as an explicit gap rather than worked around with a console/IPC call — the delete
  handler's conflict behaviour is otherwise covered by the project's automated test suite
  (`tests/main/condense-ipc.test.ts`).
- A project overview badge for "condensation possibly outdated" (mirroring story 004's status
  badge) was explicitly cut from this sprint's scope (story 046's Q1) and is not tested above —
  its absence is expected, not a defect.
- Citing a condensed artifact as evidence when answering a question remains out of scope, carried
  over from S10 — condensed files are deliberately excluded from the citation path.
