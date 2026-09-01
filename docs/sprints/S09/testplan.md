# S09 test plan — local engine that fits this machine

Sprint S09 shipped four stories around one line of work: knowing what this machine can
carry, recommending a model that actually fits it, installing a second local runtime
(llama.cpp) from inside the app, and starting that runtime with settings derived from
the machine instead of hand-invented flags. This document is a step-by-step guide for a
non-technical test user to check that work through the real UI — no console commands
beyond starting the app.

Three of the four stories (032, 033, 035) are marked `done`. The fourth (034) is marked
`in-progress` — it is built and code-reviewed, but its last few steps need a real
llama.cpp engine and model installed to verify, which the story's own author did not
have on hand. Those steps are marked **not verifiable without a real llama.cpp
install** below; do not skip the app and use a console/script to fake them — if you
cannot install a real engine, note the gap instead.

## Preparation

1. Open a terminal in the project folder.
2. Run `npm run seed`. This builds a demo vault (`.demo-vault/`) with realistic sample
   content so the app has something to show.
3. Run `npm run dev`. This starts the app with hot reload. Wait until the window opens.
4. In the app, open **Settings** from the left-hand rail, then click the **Models** tab
   at the top of the settings screen (or go directly to `#/settings?tab=models`). All
   use cases below happen on this one tab unless a step says otherwise.
5. Some steps ask you to fully quit the app (not just close the window) and restart it.
   On Windows, if the app has a tray icon, right-click it and choose to quit, or use
   Task Manager to confirm no `Gaston`/`electron` process remains before restarting.

Note on language: the app's UI language and document language are independent, set
under **Settings → Languages**. Steps that ask you to check both languages mean the UI
language switch there, not the vault language.

---

## Use case 1 — The machine card remembers its last scan (story 035)

Checks that scanning the machine once is enough — the app must not forget the result
every time it is closed and reopened.

**Steps**

1. On **Settings → Models**, find the card titled "Diese Maschine" / "This machine" (it
   is the first card below the onboarding card, if any provider is not yet configured).
2. If the card shows an empty state, click the scan button it offers ("Scannen" /
   "Scan"). Wait for the result.
3. Note the numbers shown (RAM, VRAM if any, CPU cores) and the date/time the card
   states the scan was taken.
4. Fully quit the app (see Preparation, step 5) and start it again with `npm run dev`.
5. Return to **Settings → Models**.

**Expected result**

- The same facts and the same scan date are shown immediately, without clicking
  anything — no "scan again" prompt.
- The date shown is the date of the actual scan from step 2/3, not the current time.

---

## Use case 2 — The resource budget slider (story 035)

Checks that the machine's usable share of RAM/VRAM is set with a slider, and that it
writes its value once you let go, not on every pixel of movement.

**Steps**

1. On the "This machine" card, find the section describing what you may change — a
   slider for the resource budget, labelled with a percentage.
2. Click into the slider area and drag it from a high value (e.g. 80 %) to a lower one
   (e.g. 40 %). Watch the percentage label while dragging.
3. Release the mouse button.
4. Fully quit and restart the app, and return to **Settings → Models**.

**Expected result**

- The percentage label updates live while you drag.
- After releasing, the headline sentence and the "what this machine can carry" figures
  update to match the new budget.
- The scan date shown on the card does **not** change to "just now" — moving the
  slider is not a rescan.
- After the restart, the slider still shows the value you set (e.g. 40 %), not the
  original one.

---

## Use case 3 — Manual VRAM entry in GB (story 035)

Checks that a graphics card's memory is entered the way it is printed on the box (GB),
not in megabytes.

**Steps**

1. If the scan already found a VRAM figure and you want to test manual entry, look for
   an "edit"/"enter manually" control next to the VRAM figure on the "This machine"
   card. If the scan reports VRAM as unknown, the field for entering it is already
   visible.
2. With the UI language set to German (**Settings → Languages**), type `12,5` into the
   VRAM field and confirm/save it.
3. Switch the UI language to English (**Settings → Languages**) and return to
   **Settings → Models**. Type `12.5` into the same field and confirm/save it.
4. Try an out-of-range value, e.g. `0.1` or `300`, and confirm/save it.

**Expected result**

- Both `12,5` (German) and `12.5` (English) are accepted and shown as "12.5 GB".
- The out-of-range values are rejected, and the error message names bounds in GB (not
  in MB, and not a raw number without a unit).

---

## Use case 4 — Slider is keyboard-operable (story 035)

Checks that the new slider control (both the resource-budget slider and any other
Gaston slider on the card) is fully usable without a mouse.

**Steps**

1. Click somewhere else on the page first (e.g. the screen title), then repeatedly
   press **Tab** until the resource-budget slider receives focus.

**Expected result**

- A visible focus ring/outline appears around the slider once it is focused.

2. Press the **arrow keys** (left/right or up/down).

**Expected result**

- The percentage value changes step by step and the live label updates.

3. Press **Home**, then **End**.

**Expected result**

- The value jumps to the slider's minimum (10 %) on Home and its maximum (100 %) on
  End.

---

## Use case 5 — A machine that has never been scanned (story 035)

Checks the honest empty state — no invented numbers.

**Steps**

1. Fully quit the app.
2. Delete the machine-scan cache file. On Windows this is at
   `%APPDATA%\Gaston\machine-scan.json` (adjust the app-name folder if your build uses
   a different `userData` folder name — check via **Settings → About** if unsure).
3. Start the app again (`npm run dev`) and open **Settings → Models**.

**Expected result**

- The "This machine" card shows the same honest empty state it shows on a first run —
  no numbers, just an explanation and a scan button. Nothing is guessed.

---

## Use case 6 — A recommendation that fits a weak machine (story 032)

Checks that the app can name a small local model for a weak machine instead of always
suggesting something too big, and that it is honest when nothing fits.

**Steps**

1. On **Settings → Models**, set the resource budget slider (from use case 2) down to
   a low value, e.g. 25 %, and release it.
2. Scroll down to the recommendation section (below the routing table) and click the
   button that requests recommendations (e.g. "Empfehlungen holen" / "Get
   recommendations").
3. Read through the resulting rows, one per task (e.g. "title-tags", "wiki-ingest",
   "gardener-audit", "journal-chat").
4. Push the budget slider back up to 100 % and release it, then request recommendations
   again.

**Expected result**

- At the low budget, at least the lighter tasks (e.g. titling, tag extraction) show a
  small local model as their pick (not "nothing fits").
- Demanding tasks that this machine genuinely cannot carry at the low budget show a
  line naming: which task, why (the size needed vs. what this machine carries), and the
  honest options (a cloud model for that one task, or leaving it unrouted) — not a
  small local model silently substituted for a task it cannot do well.
- No row for a sensitive task (`journal-chat`, the private journal coach; or a
  dump-classification task) ever names a cloud provider just because the local model is
  small — those stay local-only or unrouted.
- At 100 % budget, the picks change back to the larger local models where they fit.
- Nothing is applied automatically — routing only changes after you press "Accept" /
  "Accept all" on a row, per the guardrail that the AI proposes and the human confirms.

---

## Use case 7 — llama.cpp appears as an installable runtime (story 033)

Checks that llama.cpp is offered next to Ollama as a guided, in-app install — not a URL
to configure by hand.

**Steps**

1. On **Settings → Models**, scroll past the "This machine" card. You should see one
   card for **Ollama** and, right below it, one card for **llama.cpp**.
2. Read the llama.cpp card's description text.

**Expected result**

- The llama.cpp card names what it is for in plain language (control over GPU offload
  and context size on weak hardware) — it does not just ask for a URL.
- If llama.cpp is not installed on this machine, the card shows "not installed" and
  offers a "get it" / "Jetzt holen" button, not a manual setup form.

---

## Use case 8 — Installing the llama.cpp engine, with progress and cancel (story 033)

**Not fully verifiable without an internet connection and a genuinely absent engine.**
If llama.cpp is already installed on this machine from an earlier test run, either
uninstall it first (delete `<userData>/runtimes/llamacpp/` after fully quitting the
app) or skip to use case 10.

**Steps**

1. On the llama.cpp card (status "not installed"), click "Jetzt holen" / "Get it".
2. A dialog appears naming the download size, the target folder, and a preselected
   build (e.g. "CUDA" or "CPU") with one sentence of reasoning. Confirm the build is
   pre-chosen, then read the reasoning sentence.
3. If you want to test the override: change the preselected build to a different one
   from the same dialog before starting.
4. Start the download.
5. While the download is in progress, click "Abbrechen" / "Cancel".

**Expected result**

- The dialog names a size and a target directory before anything downloads.
- The build select shows a plausible pre-choice with a one-line reason in your UI
  language, and can be changed.
- Progress is visible (a percentage or a moving bar) once the download starts.
- After cancelling mid-download, the card returns to "not installed" and no leftover
  partial files remain in `<userData>\runtimes\llamacpp\` (check the folder if you
  want to confirm).

**Steps (continued) — full install**

6. Click "Jetzt holen" / "Get it" again, start the download, and this time let it run
   to completion.

**Expected result**

- The card updates to "installed, stopped" and names the build that was installed,
  without a manual refresh being required (though a "recheck" button also exists).

---

## Use case 9 — Downloading a model file for llama.cpp (story 033)

Requires use case 8's engine install to have completed (or a pre-existing llama.cpp
install).

**Steps**

1. With the llama.cpp card showing "installed" or "installed, stopped", find the model
   search panel it now shows (search field, likely labelled for Hugging Face search).
2. Type a search term, e.g. `qwen2.5 1.5b gguf`, and submit the search.
3. Look at the results list.
4. Pick one small file from the results and note its listed size before downloading.
5. Start the download, then click cancel partway through.
6. Start a download of a small file again and let it complete.
7. Try a search that returns no results (e.g. a nonsense string), and, if you have a
   way to test it, a repository that requires access on huggingface.co (gated repo).

**Expected result**

- Results show repository, file name, size and quantisation (e.g. "Q4_K_M") for each
  file.
- The size is shown before you commit to downloading.
- Cancelling removes the partial file — no leftover `.gguf.part`/incomplete file in
  `<userData>\models\gguf\`.
- A completed download shows in the panel as available.
- An empty search result and a gated/inaccessible repository each show their own
  honest message (not a silent empty list or a crash).
- If you attempt a download larger than the free disk space on this machine, it is
  refused before any byte downloads, and the message names the actual number of MB/GB
  needed vs. available.

---

## Use case 10 — The app works with nothing installed (stories 033, 034)

Checks the "no model configured" guardrail — the app must never show a dead screen.

**Steps**

1. Make sure no LLM provider is configured and no local runtime is running (a fresh
   `npm run seed` state, or remove providers via the Models tab).
2. Visit each screen in the left rail: Dashboard, Inbox, Projects, Todos, Journal,
   Modules, Search, Overview, Settings.
3. Try an action that needs a model, e.g. open the journal and start a coaching
   conversation, or ask a question in search/chat.

**Expected result**

- Every screen loads normally, with no blank/frozen area.
- The action that needs a model states plainly that no model is configured, instead of
  hanging or showing a raw error.

---

## Use case 11 — Starting and stopping the llama.cpp engine (story 034)

**Not verifiable without a real, installed llama.cpp engine and model on this
machine.** This story is still `in-progress` for exactly this reason: its own author
could not verify these steps in the build environment and left the story status as
"built, acceptance pending." If you have a machine with llama.cpp genuinely installed
(via use cases 8–9), run the steps below through the UI as written; if you do not,
record that this use case could not be verified rather than approximating it with a
console command.

**Steps**

1. With the engine "installed, stopped" (llama.cpp card on **Settings → Models**),
   look below the model panel for the derived start values: GPU layers, context size,
   and CPU threads, each with one plain-language sentence explaining why that number was
   chosen (e.g. "28 of 33 layers on the GPU — the rest runs on the CPU because ... does
   not hold more").
2. Click the start button ("Starten" / equivalent — the button with a lightning-bolt
   icon on the card).

**Expected result**

- The card's status flips to "running" on its own, without pressing a manual refresh
  button.
- The same derived values and sentences shown before starting are still shown
  afterwards (unchanged).

**Steps (continued)**

3. Click the stop button ("Stoppen" / equivalent, with a square icon).

**Expected result**

- The card returns to "installed, stopped".
- No `llama-server` process remains in Task Manager.
- Opening the journal chat (or any task routed to this engine) now reports "no model
  configured" instead of hanging.

**Steps (continued) — quit behaviour**

4. Start the engine again, then fully quit the app (not just close the window).

**Expected result**

- No `llama-server` process remains in Task Manager after the app has fully quit.

**Steps (continued) — foreign engine**

5. If you are comfortable doing so, start a `llama-server` process yourself outside the
   app (on the default port the app would use, 11435), then open the card again.

**Expected result**

- The card reports the engine as running but states the app did not start it, and its
  stop button is disabled with a sentence explaining why.

---

## Use case 12 — Advanced overrides for GPU layers and context (story 034)

**Depends on a real llama.cpp install, same caveat as use case 11.**

**Steps**

1. On the llama.cpp card, expand the "Advanced" / "Erweitert" disclosure below the
   derived values.
2. Type a context size, e.g. `2048`, into the context field and confirm (blur the field
   or press Enter).
3. Look at the context sentence above.
4. Clear the field (delete its contents and blur/press Enter again).

**Expected result**

- After entering `2048`, the value is labelled as manually entered, not derived.
- After clearing it, the sentence returns to the app's own derived value and its
  reasoning.

---

## Use case 13 — Auto-start toggle (story 034)

Does not require a real engine install to see the control itself, but the actual
triggered start does (same caveat as use case 11).

**Steps**

1. On the llama.cpp card, find the "auto-start" switch (labelled something like "Bei
   Bedarf starten" / "Start on demand").
2. Confirm its default state.
3. Toggle it on.

**Expected result**

- The switch defaults to off ("manual") — the engine never starts itself unless you
  turn this on.
- Toggling it does not itself start the engine; it only changes when a future task
  that needs this engine is allowed to start it automatically.

---

## Use case 14 — Both languages, no untranslated text (all four stories)

**Steps**

1. Walk through use cases 1–10 above (skip the llama.cpp-install-dependent ones if
   already covered) once with the UI language set to German and once set to English
   (**Settings → Languages**).
2. Look specifically at: the machine card's headline sentence, the budget slider label,
   the VRAM field and its error message, the recommendation shortfall lines, the
   llama.cpp card's hint text, and the install dialog's build-choice sentence.

**Expected result**

- No raw i18n key (e.g. text that looks like `settings.runtime.plan.gpuLayers.manual`
  instead of a real sentence) appears anywhere.
- German text uses the low-high quote pair „…" (opening low, closing high), never a
  straight `"`.
- No mix of German and English in one sentence.
- No emoji anywhere, and all body text is sentence case (not Title Case).

---

## Known gaps for this test round

- **Story 034 (in-progress):** use cases 11–13 need a real llama.cpp engine binary and
  a real GGUF model file on the test machine. If neither is available, note this
  explicitly as unverified rather than substituting a console command or a direct
  internal call — the story's acceptance intentionally waits for a tester with a real
  install.
- **Story 033 AC "the provider works end to end" (`llm:probe`, `llm:models`, one real
  task):** also depends on a real download and a real running `llama-server`; covered
  by use cases 9 and 11 above where a real install is available.
