# Sprint S07 — manual acceptance test plan

This plan covers the five stories closed in sprint S07: 023, 024, 025, 026, 027. It
assumes no prior knowledge of the codebase — only of the running app.

## Before you start

1. Install dependencies once if you haven't: `npm install`.
2. Build the demo vault: `npm run seed`. This creates `.demo-vault/` with realistic
   sample content (projects, journal days, a knowledge module, Claude Code **and**
   Codex sessions) and never touches your real vault or your real `~/.claude` /
   `~/.codex` folders.
3. Start the app against that vault: `npm run dev`. Every step below is done by
   clicking and typing inside the running window — no console command is part of
   any test step itself; the console is only used to start the app or to reseed it.
4. UI language: most steps below assume the interface language is **German**
   (`de`), because that is where the visible fixes in story 026 live. Switch it
   under **Settings → Languages → Interface**. One step explicitly asks you to
   switch to **English** instead — it says so.

If you'd rather just look at static screenshots instead of clicking through the
live app, `npm run build && npm run shot` produces the same views as PNGs in
`.screenshots/`, but the steps below describe the interactive app.

---

## Story 023 — the module schema doc and the code agree

This story has no UI of its own: it fixed a text drift between
`docs/MODULE-SCHEMA.md` and the schema the app writes into a module's
`AGENTS.md`, and closed a test gate. There is nothing new to click. The one
existing, unchanged user path (creating a knowledge module) still goes through
the **Knowledge** screen as before.

**Optional check, for curiosity only:**

1. In the running app, go to **Knowledge** and create a new module (any title,
   e.g. "Test schema").
2. Open the resulting file in a text editor —
   `.demo-vault/modules/test-schema/AGENTS.md`.
3. Open `docs/MODULE-SCHEMA.md` in the repo next to it. Below its leading
   `<!-- ... -->` comment, the body should read the same as the module's file
   (title line aside).

**Expected result:** the two texts match. This is not part of the sprint's
UI-acceptance gate — it's included here only so you can see what the story fixed.

---

## Story 024 — filing writes headings in your document language

### Use case A: the filing preview names the heading it will write

**Preparation:** demo vault seeded, app running, document language currently
German (default).

**Steps:**

1. Go to **Capture**, type a short sentence (e.g. "Check the invoice numbers
   again"), and submit it.
2. Go to **Inbox**. Open the dump you just created.

**Expected result:** the proposal card shows a line naming the section the text
will land under (e.g. "Landet unter `Notizen`"), before you confirm anything.

### Use case B: English document language creates "Notes", not "Notizen"

**Preparation:** continue from the app already running.

**Steps:**

1. Go to **Settings → Languages**. Set **Document language** to **English**.
   **Expected:** a card appears below that setting, warning that a number of
   files still carry old-language headings, with a "Migrate headings" button.
   Leave the migration alone for now.
2. Go to **Capture**, dump a short sentence, and open it from the **Inbox**.
   **Expected:** the proposal names the heading `Notes`.
3. File it, choosing a project that has **no** existing notes section yet (or
   check "Other target" to pick one). Open that project's file (via the app or a
   text editor).

**Expected result:** the text sits under a `## Notes` heading — not `## Notizen`
— and there is exactly one notes section in the file.

### Use case C: an existing heading always wins over the setting

**Preparation:** document language still set to English (from use case B). The
demo vault ships German project files that already carry `## Notizen`.

**Steps:**

1. Go to **Capture**, dump another short sentence.
2. In the **Inbox**, open it and use "Other target" to file it onto a project
   that already has a `## Notizen` section (any seeded project work file).
3. Confirm, then open that project's file.

**Expected result:** the text is appended under the existing `## Notizen`
heading. No second, English `## Notes` section is created.

### Use case D: the settings warning and the migration offer

**Preparation:** document language set to English, the migration card from use
case B still showing its count.

**Steps:**

1. On **Settings → Languages**, click **Migrate headings**.
2. In the dialog that opens, read the file count, then confirm the migration.
3. Open one of the affected project files.

**Expected result:** the dialog reports how many files were migrated (and any
conflicts, which should be zero here). The previously German headings in that
project file now read in English, with the same content — nothing lost.

4. Switch **Document language** back to **German**, dump one more sentence, and
   file it onto the project you just migrated.

**Expected result:** the text lands under the now-English heading — the file's
own heading wins over the setting, exactly as before the switch.

---

## Story 025 — the demo vault never reads your real session data

This story is the seed/screenshot harness itself, not an app feature — there is
nothing new to click that a normal user would use day to day. What you can
verify through the UI is the harness's promise: after `npm run seed`, the app
never shows anything from your real machine.

**Preparation:** `npm run seed` already run, app running against `.demo-vault`.

**Steps:**

1. Go to a project's **Sessions** view (Projects → open a project → Sessions
   tab, or via the dashboard's recent-work trace) and look for a Claude/Codex
   switch.
2. Switch to the **Codex** tab.

**Expected result:** invented demo sessions appear (fictional repo names such as
`kundenportal-web`), with a title, timestamp and transcript — never anything
from your real `~/.codex/sessions`. The Claude tab shows the same kind of demo
content it always has.

**Gap — not verifiable through the UI:** the acceptance criterion "if a future
setting points outside the demo vault, the seed run says so" is a developer-facing
safety net inside `npm run seed`'s own console output (a failed, non-zero exit
with a message). It has no user-facing surface at all — there is no screen that
would ever show this check, so it cannot be turned into a click-through step.

---

## Story 026 — German quotes close properly, a dead link is gone, dates are consistent

### Use case A: German quotation marks close correctly

**Preparation:** UI language German.

**Steps:**

1. Go to **Projects**, open the search field, and clear it so the empty-state
   text with a quoted example shows (or open **Settings → Languages**, where the
   interface-language example line quotes a screen name).

**Expected result:** every quoted phrase reads `„…“` — opens with `„` and closes
with `“`, never with a straight `"`.

2. Go to **Settings → Languages** and read the "Interface" example line.

**Expected result:** it reads something like `der Bereich heißt „Erfassen“ statt
„Capture“` — both quote pairs correctly closed.

### Use case B: no German quote leaks into English text

**Preparation:** switch **Settings → Languages → Interface** to **English**.

**Steps:**

1. Go to **Journal**, open a day, and close it (the day-close flow that shows a
   due-date field for an open todo).

**Expected result:** nothing on screen reads a German „ anywhere. (The specific
due-date string this story fixed is only exposed as an accessibility label, not
visible text — if you have a screen reader or the browser/Electron accessibility
inspector handy, the due-date field's label should read `Due date for "…"` with
correctly curled English quotes; otherwise take this one on the strength of the
test suite.)

### Use case C: a loose end never links to nowhere

**Preparation:** switch the interface language back to German if you like (not
required for this check). Enable the "Lose Enden" tile: Dashboard → the
"Module hinzufügen"/tile-catalog button top right → switch on **Lose Enden** →
close the catalog.

**Steps:**

1. On the dashboard, find the "Lose Enden" tile and click one of its rows.

**Expected result:** it opens the **Journal** on the day the loose end was
announced (URL ends in `?d=YYYY-MM-DD`). In the seeded demo vault every loose end
resolves to a real day, so every row is a clickable link — there is no row you
can click today that goes nowhere. (The fix itself — a row whose day cannot be
resolved renders as plain, non-clickable text instead of a dead link — has no
seeded example to click in this vault; it is confirmed by the story's own unit
tests, not by something visibly different on this screen.)

### Use case D: dates read the same as before, just through one shared helper

**Steps:**

1. Go to **Journal**, look at the day list and open a day entry.
2. Go to **Maintenance** ("Care" in the rail) and look at the health card's
   timestamp.

**Expected result:** dates read exactly as they did before this sprint, in both
languages (e.g. `10. Aug. 2026` in German, `10 Aug 2026` in English) — this
story only changed which code path produces that text, not what it looks like.

---

## Story 027 — the maintenance run state is split, behaviour unchanged

This story is a refactor with no visible effect. The acceptance is "nothing
moved": every run behaviour on the **Care** (maintenance) screen has to look
identical to before.

**Preparation:** demo vault seeded, app running, go to **Care** in the rail.

**Steps:**

1. Click **Check now**. **Expected:** a progress bar appears with the current
   check named; switch to another screen and back to Care.
   **Known issue, not a regression from this sprint:** the progress bar may
   disappear after you navigate away and back, even though the run is still
   going in the background (it resumes showing progress, or simply finishes,
   on its own). This is a pre-existing bug in
   `src/renderer/lib/queries/gardener.ts`, confirmed by this story's own Done
   notes to predate the split and to be outside its scope. If you see it,
   it is not something this sprint introduced.
2. While a run is going, click **Cancel**. **Expected:** the findings found so
   far are kept, the report says the run stopped early, and the health score
   shown carries its own frozen date rather than a number from the partial run.
3. Click **Continue**. **Expected:** it finishes without redoing already-done
   stages, and no previously dismissed or snoozed finding reappears.
4. Filter the findings list to one kind (or one module), then use the "check
   only …" button that appears. **Expected:** only that slice re-runs; findings
   outside it are untouched.
5. While a run is going, close the vault (Settings → Vault, or quit and restart
   pointing at a different folder) and reopen the demo vault. **Expected:** the
   report on disk is the one from before you started that run — unchanged.

---

## Gaps summary

- **Story 025, AC 4** (seed run reports a future setting that points outside the
  demo vault): purely a developer-facing console safety net inside `npm run
  seed`; no screen in the app can ever surface it, so it has no UI step.
- Two smaller, already-noted exceptions above are not full gaps but are worth
  flagging: the due-date aria-label quote fix (026) is not visible text, only an
  accessibility label; and the loose-end dead-link fix (026) has no example in
  the seeded demo vault to click, since every seeded loose end resolves to a
  real day.
