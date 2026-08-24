# Sprint S08 — manual acceptance test plan

For a developer who did not build these stories, doing manual UI acceptance — not reading
code. Covers exactly the four stories built this sprint, nothing else:

1. [028 — I fill in what the scan missed](#use-case-1-fill-in-the-vram-the-scan-couldnt-detect-story-028)
2. [029 — How much of this machine a model may use](#use-case-2-set-how-much-of-this-machine-a-model-may-use-story-029)
3. [030 — The app is called Gaston, everywhere](#use-case-3-the-app-is-called-gaston-everywhere-story-030)
4. [031 — A build I can hand on](#use-case-4-a-build-you-can-hand-on-story-031)

Every step for a user-facing action goes through the real UI — no console command, no direct
internal call. Console commands only appear to start the app, to run the packaging pipeline
itself (031, which _is_ the feature under test), or, after a UI action, to independently confirm
an outcome the UI has no screen for (e.g. "did anything land in the vault's git status" — this
never replaces the UI step, it only double-checks its result, the same way the stories'
own authors verified them).

## Before you start

```powershell
npm ci            # only if you haven't already
npm run seed      # builds .demo-vault/ with realistic sample content — needed for all four
npm run dev       # starts Electron with hot reload
```

The app opens on the **onboarding screen** if no vault is currently open (fresh `userData`, or
after you close whatever vault you had open). If a vault from a previous session opens
automatically instead, that's fine too — for use cases 1–3 any open vault works; only use case
3's "old journal day" and "YouTube source" checks need the **demo vault**
(`.demo-vault/`, produced by `npm run seed`). If a different vault auto-opens, use
**Settings → Vault** or the app's vault switcher to open `.demo-vault/` explicitly.

The app's default UI language is German. All labels below are given in English with the German
label in _italics_ at first use per screen, so the plan works whichever language the app is
currently in. Settings → Languages (or the onboarding language picker, story 031) switches the
UI language at any time, live, with no restart.

---

## Use case 1: fill in the VRAM the scan couldn't detect (story 028)

**Preparation.** App running (see above), any vault open.

**Steps**

1. Open **Settings → Models** (_Einstellungen → Modelle_). Click **Scan this machine**
   (_Diesen Rechner scannen_).
   - Expected: a "This machine" (_Diese Maschine_) card appears with a verdict sentence, a list
     of rows (Resource budget, RAM, Graphics memory (VRAM), GPU, CPU cores, Free disk space),
     and a heuristic disclaimer note.
   - On a Windows machine whose graphics card has 4 GB or more of memory, the **Graphics memory
     (VRAM)** row (_Grafikspeicher (VRAM)_) reads **unknown** (_unbekannt_) even though the GPU
     row correctly names the card — this is the exact detection gap this story fixes (Windows
     only reports VRAM in a 32-bit field that saturates at 4 GB). If your card is smaller than
     4 GB the row may already show a real number; the rest of the walk below still works, you
     just won't see the "unknown → filled in" transition.
   - Note the verdict sentence and the tier list ("Sizes that should fit comfortably: …") before
     continuing — you'll compare against it in step 3.
2. Next to the VRAM row, click **Enter it** (_Eintragen_). Try each of the following in the
   field, pressing **Save** (_Speichern_) each time: empty, `0`, `-5`, `abc`, `999999999`.
   - Expected: each attempt shows an inline error under the field and the row's value does not
     change. No round trip to the machine card happens (the verdict above stays exactly as it
     was).
3. Enter `16384` and click **Save**.
   - Expected: the row now shows **16 GB** with a small **Entered by you** badge
     (_Von dir eingetragen_) next to it. The verdict sentence and the tier list above change to
     reflect the new ceiling. The heuristic disclaimer note is still there, unchanged.
4. Click **Scan again** (_Erneut scannen_).
   - Expected: the VRAM row still reads 16 GB with the "Entered by you" badge — a re-scan does
     not discard it.
5. Scroll to the **model recommendation** section further down the Models tab and refresh/re-open
   it (or switch away and back to the Models tab).
   - Expected: for at least one task, the previous recommendation reasoning changes now that a
     real 16 GB VRAM figure is known instead of the RAM-only estimate (see the note below on
     which direction to expect).
   - Note: the story's own acceptance text describes a "too big → now fits" example, but the
     app's capacity math can only ever narrow or hold a ceiling once a real (tighter) VRAM number
     replaces an unconstrained unknown — never widen it. The observable, correct effect is a
     model that fit under the old inflated RAM-only estimate now being excluded, or the ceiling
     tightening. This is documented in story 028's Done section as a knowingly corrected
     wording, not a bug.
6. Close the app entirely, then start it again (`npm run dev`), open the same vault, go to
   **Settings → Models**, click **Scan this machine**.
   - Expected: 16 GB is still shown, still marked "Entered by you" — the value survives an app
     restart.
7. Click **Clear** (_Löschen_) next to the VRAM row.
   - Expected: the row goes back to **unknown**, the "Entered by you" badge disappears, and the
     verdict sentence / tier list return to what step 1 showed.
8. Switch the UI language (Settings → Languages) and look at the VRAM row, its errors, and the
   badge again in the other language.
   - Expected: every label, every inline error message, and the badge are translated; nothing
     reads in German while the app is set to English, or vice versa.

**Outcome check (not a UI step, just confirms nothing leaked):**

```powershell
git -C .demo-vault status
```

Expected: clean. `.demo-vault/.secondbrain/settings.json` carries no VRAM key — the value you
entered lives only in this machine's own settings (`userData`), never the vault.

No gaps — every acceptance criterion for this story is reachable through the UI.

---

## Use case 2: set how much of this machine a model may use (story 029)

**Preparation.** App running, any vault open, Settings → Models already visited once this
session (so a machine scan result is on screen — if not, click **Scan this machine** first).

**Steps**

1. On the "This machine" card, find the **Resource budget** row (_Ressourcen-Budget_), above RAM
   and VRAM. It should read **80 %** by default. Below it there is explanatory help text stating
   that it sizes the recommendation and does not limit a model that is already running.
2. Look at the RAM and Graphics memory (VRAM) rows: each should show the real figure, then a
   suffix like "· planning with X GB at 80% after reserve" (_„· geplant mit X GB bei 80 % nach
   Reserve"_).
3. Click **Change** (_Ändern_) next to Resource budget. Try each of the following, pressing
   **Save** each time: empty, `abc`, `0`, `-5`, `9`, `101`.
   - Expected: each attempt shows an inline error, the stored percentage does not change, and
     nothing else on the card moves.
4. Set the value to `100` and save. Note the verdict sentence, the ceiling, and the tier list.
5. Click **Change** again, set it to `50`, save.
   - Expected: the planned figures on both the RAM and VRAM rows drop, the parameter ceiling
     drops, and at least one size disappears from the "Sizes that should fit comfortably" list
     compared to step 4.
6. Scroll to the model recommendation section and refresh it.
   - Expected: at least one task's recommended local model is smaller (or shows as no longer
     fitting) than it did at 100%. A cloud-provider recommendation, if one is configured, is
     unchanged.
7. Click **Change**, set the value to `10`, save.
   - Expected: the card states outright that no local model fits at this share (_"Bei diesem
     Anteil passt kein lokales Modell."_) — instead of quietly recommending nothing or something
     unrunnable.
8. Set the value back to `70`, leave the Settings screen (e.g. go to Dashboard), then return to
   Settings → Models.
   - Expected: still `70`, with no restart in between.
9. Close the app entirely, restart it (`npm run dev`), open the same vault, Settings → Models,
   scan.
   - Expected: still `70`, and the verdict is computed against it.
10. Switch the UI language and check the label, help text, the "planning with …" suffixes and the
    "no local model fits" line again.
    - Expected: all translated, no mixed-language string.

**Outcome check:**

```powershell
git -C .demo-vault status
```

Expected: clean; `.demo-vault/.secondbrain/settings.json` carries no budget/machine key — this
setting, like 028's, is machine-local only.

No gaps — every acceptance criterion for this story is reachable through the UI.

---

## Use case 3: the app is called Gaston, everywhere (story 030)

**Preparation.** `npm run seed` (already run above) creates the demo vault with the sample
content this use case checks: one seeded journal day still written in the _old_ label format
(`> **Second Brain**`) among otherwise normal days, and one seeded YouTube source with its real
external title. App running, demo vault open (`.demo-vault/`).

**Steps**

1. **Title bar.** Look at the app window's own title bar. Expected: it reads **Gaston** — not
   "Second Brain", not "Guston".
2. **About tab.** Go to **Settings → About** (_Einstellungen → Info_). Expected: the first row in
   the list is labelled **App** with the value **Gaston**, next to Version, Electron and
   Platform.
3. **Dashboard.** Go to **Dashboard** and find the "ask" tile/module. Expected: its label reads
   **Question to Gaston** (_Frage an Gaston_) — not "Frage an das Second Brain". Switch the UI
   language (Settings → Languages) and confirm the tile's label is correctly translated in both.
4. **New journal turn.** Go to **Journal** (_Journal_), open **Today**. Type a line into the
   composer at the bottom of the day and send it to get a coaching reply.
   - Expected: the reply appears in the conversation under the speaker label **Gaston** — not
     "Second Brain".
   - Optional file check (not a UI step, just confirms the write): open today's file under
     `.demo-vault/journal/<year>/<month>/<date>.md` in a text editor. The new turn you just wrote
     is stored as `> **Gaston** — HH:MM`.
5. **Old journal day still works.** In the Journal screen, browse a few days back (the demo data
   spans about three weeks) to find the day marked with a "stress" tag and a low mood/energy — it
   carries a section titled **Legacy conversation** (_Altes Gespräch_) with a **Move into the
   entry** button (_In den Eintrag übernehmen_).
   - Expected: it renders as a normal turn-by-turn conversation (still labelled Gaston in the
     UI, since the display always shows the current role label regardless of what the file's
     literal text says), the turn count looks complete, and the day otherwise reads normally.
     Do **not** click "Move into the entry" if you want to keep the old-format day intact for a
     repeat test — clicking it is a one-way action with no undo (that's expected, documented
     behaviour of the existing fold feature, not part of this story).
   - Optional file check: open that day's `.md` file in a text editor — its raw conversation
     section still literally reads `> **Second Brain**`. This confirms the app reads old and new
     labels alike without rewriting history.
6. **Vault untouched.** Confirm the vault folder still contains a `.secondbrain/` directory
   (visible in the file system, e.g. via `.demo-vault/.secondbrain`) — the directory name itself
   was deliberately not renamed by this story.
7. **Demo source keeps its real title.** Go to **Knowledge → Sources** (_Wissen → Quellen_).
   Expected: the seeded YouTube source still shows its real external title, unchanged by the
   rename (`Your AI Second Brain Is Slowly Rotting`) — the rename does not falsify sample data.
8. **Taskbar / jump list (optional, needs a packaged build).** The window title and About tab
   above are fully checkable in `npm run dev`. To also see the Windows taskbar entry and
   pinned/jump-list name (which read the packaged app's identity, not the dev window), use the
   packaged `.exe` from use case 4 below: pin it to the taskbar and check the entry's name reads
   Gaston.

No gaps — every acceptance criterion for this story that constitutes a user-facing check is
reachable through the UI; step 8 is a nice-to-have cross-check, not a blocking gap, since the
window title and About tab already cover the same identity in dev mode.

---

## Use case 4: a build you can hand on (story 031)

This is the one story whose full acceptance happens outside the running dev app — it is about
the packaged artifact a recipient with no Node and no checkout would get. Per the story's own
Done section, **steps 1–4 and 6 below were already run for real in this session** (a live
`npm run handoff` build, packaging, the negative/failure-abort test, and an automated Playwright
run of the onboarding screen). They're listed here for your own confidence check if you want to
repeat them yourself — they are not the gap. **Step 5 is the one thing this sprint could not
verify itself** and needs you.

**Preparation.** A clean-ish checkout is ideal but not required to repeat steps 1–3 (they run
against the same dev app already started above). Steps 4 and 6 need a terminal at the repo root.

**Steps (already run for real this session — repeat only if you want to double-check)**

1. If no vault is open (or after closing one), the onboarding screen appears with a **language
   choice** (_Oberflächensprache_, "Deutsch" / "English") above the header, the vault actions
   (Open a vault / Create a new vault), and — below them — a calm statement that no model is
   configured yet and that Gaston works fully without one.
2. Click **English**, then **Deutsch**, on the language choice. Expected: the screen's own texts
   (title, hints, buttons) switch immediately, with no restart.
3. Click **Create a new vault** (_Neuen Vault anlegen_), give it a name, pick an empty folder.
   Expected: the vault is created and opened, and going to e.g. the Journal or Ask screen shows
   the honest "no model configured" state (`LlmMissing`) instead of an error or a blank area.

**Steps (console, because this _is_ the feature under test — packaging, not a UI action)**

4. From the repo root:
   ```powershell
   npm run handoff
   ```
   Expected: exactly one `dist/gaston-0.1.0-windows.zip` is produced (version may differ if
   `package.json` has since bumped). Run it a second time — still exactly one ZIP, replaced, not
   duplicated. Open the ZIP: it contains only `gaston-0.1.0-portable.exe` and `README.txt`,
   nothing else — no `.env`, no `.secondbrain`, no real vault, no `node_modules`.
5. **⚠ The one step that needs you and could not be self-verified this sprint.** Copy
   `dist/gaston-<version>-windows.zip` to a USB stick (or any transfer method). Unpack it on a
   **genuinely separate Windows machine** — or at minimum a separate Windows user account with no
   Node.js installed and no checkout of this repository. Read `README.txt`, then double-click the
   `.exe`.
   - Expected: Windows SmartScreen warns because the `.exe` is unsigned (`README.txt` explains
     how to proceed — "More info" → "Run anyway"); the window opens titled **Gaston**; the
     first-start screen from steps 1–3 appears; you can create a vault; the app is fully usable
     with no model configured.
   - This is the one acceptance criterion this sprint's own session structurally cannot verify —
     there is no second machine available inside this environment. The story's status stays
     **in-progress** specifically because of this open point. Please run this step and report
     back whether it works; nothing else in story 031 is blocking.
6. Negative check, back on the dev machine:
   ```powershell
   New-Item -ItemType File -Path out\.env -Force   # or any file named .env under out/
   npm run handoff
   ```
   Expected: the run aborts with a named reason (e.g. "forbidden file found: .env") and
   **no ZIP is left in `dist/`** — a red gate must never ship a wrong artifact.

**Named gap:** step 5 (starting the unpacked ZIP on a genuinely separate, Node-free, checkout-free
Windows machine) is the only acceptance criterion in this entire sprint that cannot be performed
inside this session — it requires hardware/an account this environment does not have. It is
explicitly called out in story 031's own "Open point / acceptance pending" note as the reason its
status is still `in-progress` rather than `done`. Every other acceptance criterion across all
four stories (028, 029, 030, and the rest of 031) is reachable through the running app's UI as
described above.
