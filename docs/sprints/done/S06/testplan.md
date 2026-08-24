# S06 manual test plan — machine scan, model recommendations, guided local runtime

Covers the three stories delivered this sprint:

- [019a — the app looks at my machine and tells me what it can carry](../../requirements/done/019a-machine-scan.md)
- [019b — one recommended model per task, in plain language and in money](../../requirements/done/019b-model-recommendations.md)
- [019c — a local runtime without typing a command](../../requirements/done/019c-guided-local-runtime.md)

All three surfaces live in the same screen: **Settings → Models**. This plan walks through
each one as a person with no prior knowledge of the code would: where to click, what to
type, what you should see.

Every step that performs a user-facing action goes through the real UI — clicking and
typing in the running app. A PowerShell/terminal command only ever starts the app,
verifies a side effect after the fact (a file, a process list), or is explicitly named by
the story as something you'd do outside the app (stopping a service, disabling a network
adapter). No step performs the action itself via a console or IPC call.

## 0. Preparation

1. Open a terminal in the repository root (`C:\development\Hantsch\second-brain`).
2. Install dependencies if you haven't already: `npm install`.
3. Build a demo vault with realistic sample content:

   ```powershell
   npm run seed
   ```

4. Run the project's own live smoke test — this drives the built app end-to-end with
   Playwright's `_electron` harness and drops a PNG of every screen (including the models
   tab) into `.screenshots/`:

   ```powershell
   npm run seed
   npm run shot
   ```

   Expected: the command finishes without console errors and `.screenshots/` contains
   `30-settings-models.png` (and, once the models panel is tall enough to scroll,
   `settings-models-bottom.png`). Look at both — they should show the machine card, the
   local runtime card and the recommendation panel. Treat any red output or a missing
   screenshot as a blocker before doing the manual steps below.

5. Start the real app for the manual walkthrough:

   ```powershell
   npm run dev
   ```

6. In the running app, open **Settings** (left rail) and switch to the **Models** tab
   (`Settings → Models`, or the tab labelled "Models" / "Modelle"). Everything below
   happens on this one tab, from top to bottom: machine card, local runtime card, providers,
   routing, model recommendation.

No special vault content is needed — the demo vault from `npm run seed` is enough for
every section below. Sections that need a configured provider or a real Ollama install say
so explicitly as a prerequisite; do not fake or skip them silently.

## 1. Machine scan card (019a)

This card is always visible at the top of the Models tab, labelled "This machine" /
"Diese Maschine" — whether or not any provider is configured.

**Steps**

1. Look at the card in its resting state. Expected: a button reading "Scan this machine"
   and no verdict yet.
2. Click **Scan this machine**. Expected: the button briefly shows a loading state, then
   the card fills in with:
   - a one-sentence verdict naming one limiting factor (e.g. "16 GB RAM, no usable GPU —
     models up to about 8B run comfortably, up to roughly 13B are possible but will be
     slow").
   - a row of facts: RAM, VRAM, GPU, CPU cores, free disk — each either a real value or the
     word "unknown".
   - a sentence stating this is a heuristic, not a measurement (the card's note line).
3. Click the button again (it now reads "Scan again"). Expected: the same verdict/facts
   reappear (refreshed), nothing else on the screen changes.
4. If any fact reads "unknown" (e.g. VRAM on some GPUs, or no GPU detection tool on this
   platform), expected: there is also a sentence listing which facts could not be
   determined, and the verdict still renders sensibly rather than crashing or showing a
   blank state.
5. Switch the UI language: go to **Settings → Languages**, change "Interface" /
   "Oberfläche" to the other language, then return to **Settings → Models**. Expected:
   every label on the machine card, the verdict sentence and the disclaimer are all in the
   new language — no leftover German text in English mode or vice versa.

**Verify nothing was written** (side-effect check, after the fact — not part of performing
the action):

```powershell
git -C .demo-vault status
```

Expected: clean. Scanning must not touch `.demo-vault/.secondbrain/settings.json` or any
other vault file.

## 2. Local runtime card (019c)

This card ("Local runtime (Ollama)" / "Lokale Laufzeit (Ollama)") sits directly below the
machine card and is always visible too.

**Prerequisite note:** the exact starting state — "no runtime installed", "installed but
stopped", or "running" — depends on whether Ollama is already on this machine. The steps
below cover all three; do only the block that matches what the card actually shows, and
treat the others as optional if your machine doesn't naturally reach that state.

### 2a. No runtime installed

Prerequisite: run this on a machine without Ollama, or uninstall it first (outside the
app — this app does not offer uninstall, by design).

**Steps**

1. The card shows "No local runtime is installed on this machine" and a **Get it** button.
   There is no terminal command shown anywhere on the card — only the button and a link to
   the official Ollama website.
2. Click **Get it**. Expected: a dialog opens, titled "Get the local runtime", and — before
   anything downloads — it states:
   - the download size,
   - the exact path the installer will be saved to,
   - the path Ollama will use to store models,
   - a sentence that the app cannot uninstall Ollama later.
3. Click **Cancel**. Expected: the dialog closes and nothing was downloaded (no new file
   in the temp folder — see the check below).
4. Click **Get it** again, then click **Download the installer**. Expected: the dialog
   switches to a downloading state with a progress bar and a "downloaded so far / total"
   readout in human-readable units (e.g. "12 MB of 180 MB"), plus a **Cancel the download**
   button.
5. While it is downloading, click **Cancel the download**. Then check, outside the app,
   that no partial file was left behind:

   ```powershell
   Get-ChildItem $env:TEMP -Filter "OllamaSetup*"
   ```

   Expected: no result (no leftover file).

6. Click **Get it** once more, confirm, and this time let the download finish. Expected:
   the dialog reaches a "Download finished" state with an **Open the installer** button.
7. Click **Open the installer**. Expected: the dialog tells you it opened the installer and
   that it is now your turn — the app does not click through the installer for you.
8. Walk through the Ollama installer yourself (outside the app), then close the dialog and
   click **Check again** on the card. Expected: the card now reflects the installed state
   (either "installed but not running" or "running", depending on whether the installer
   started the service).

### 2b. Installed but not running

Prerequisite: Ollama installed, but its service stopped.

**Steps**

1. Stop the service (outside the app, this is the story's own instruction for reaching this
   state):

   ```powershell
   Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process
   ```

2. In the app, click **Check again** on the local runtime card. Expected: the card shows
   "Ollama is installed but not running right now" and a **Start it** button.
3. Click **Start it**. Expected: a success sentence appears ("Started — Ollama is now
   running") and the card's status flips to "running". If starting fails for some reason,
   expected: a one-sentence reason instead of a silent failure or endless spinner.

### 2c. Running — pulling a model

Prerequisite: Ollama installed and running, so the card is in its "running" state. This
also needs at least one model to be reachable given this machine's capacity verdict from
section 1 (the pull list is fed by the recommendation engine from 019b) — run the machine
scan first if you haven't.

**Steps**

1. With the card showing "Ollama is running on this machine", scroll down within the card
   to the **"Models worth pulling"** section. Expected: a list of models this machine can
   actually run, each labelled with its download size in GB — or, if none qualify yet, an
   honest empty message rather than a blank area.
2. Pick a row and click **Pull**. Expected: a progress bar appears with the current status
   text and a "downloaded so far / total" readout in human units.
3. While the pull is running, navigate away — open a different screen from the left rail,
   e.g. Journal — then come back to **Settings → Models**. Expected: the same pull's
   progress bar is still there, further along than when you left (progress survives
   navigation).
4. Click **Cancel** on the running pull. Then verify, outside the app, that nothing
   half-downloaded survived:

   ```powershell
   ollama list
   ```

   Expected: the cancelled model does not appear in the list.

5. Click **Pull** again on the same row and let it finish this time. Expected: the row
   shows "Installed." once done.
6. Scroll further down to the **Providers** panel and, once you've added/probed an Ollama
   provider (see section 3 below) or if one already responds, check the **Routing** section
   — the pulled model should now be selectable as a routing target for tasks.
7. If a pull fails (e.g. network hiccup), expected: a one-sentence reason next to the row
   and a **Retry** button — never a silently stuck progress bar.

### 2d. Blocked case (optional, needs a specific machine state)

Prerequisite: a platform Ollama's installer doesn't support in-app (Linux), a nearly full
disk, or a folder without write permission for the installer's temp directory. This
typically cannot be arranged without altering the test machine, so treat this as
optional/manual-only.

**Steps**

1. On such a machine, click **Get it**. Expected: instead of the confirm dialog, the card
   shows one sentence naming the reason (unsupported platform, not enough free disk, or no
   write permission) plus a link to the manual install path — never an endless spinner.

## 3. Model recommendation panel (019b)

This panel ("Model recommendation" / "Modellempfehlung") sits further down the Models tab,
below the Providers and Routing panels.

### 3a. Nothing configured

**Steps**

1. On a fresh demo vault with no providers configured, scroll to the recommendation panel
   and click **Get recommendations**. Expected: the panel does not crash and does not spin
   forever — it should show all ten tasks with an honest "nothing reachable yet" style
   reason for tasks with `pick: null`, or the idle empty state if you haven't clicked yet.

### 3b. Local provider configured

Prerequisite: Ollama installed and running (section 2), reachable from this app.

**Steps**

1. Scroll to the **Providers** panel and click **Add a provider**. In the dialog, pick the
   **Ollama** preset from the list (its address and type are filled in for you).
2. Click **Save**. Expected: the app tests the connection immediately and shows a success
   sentence with the response time, or an honest failure reason if Ollama isn't reachable.
3. Close the dialog. Back on the recommendation panel, click **Get recommendations** again
   (or wait for the routing proposal that may already have triggered automatically after a
   successful provider test). Expected: ten rows, one per task, each naming either a local
   model or "needs a download of N GB" — no cost figure shown on local rows.
4. Find the three rows marked with the "sensitive" badge (classify-dump, extract-tasks,
   journal-chat — check the task names against
   [src/core/llm/tasks.ts](../../../src/core/llm/tasks.ts) if unsure). Expected: all three
   name a local target.

### 3c. Cloud provider configured

Prerequisite: a configured OpenRouter (or other cloud) provider with a real, valid API key
— this cannot be exercised without one. If you don't have a key, skip this block and note
it as not verified rather than faking a result.

**Steps**

1. In **Providers → Add a provider**, pick the **OpenRouter** preset, paste in your API
   key, and save. Expected: a successful probe sentence.
2. On the recommendation panel, click **Get recommendations** again. Expected: cloud rows
   now show an estimated cost per run, labelled as an estimate (e.g. "~$0.0012 per run
   (estimate)").
3. Check the three sensitive rows again. Expected: each either still names a local target,
   or names a cloud endpoint that additionally shows a line naming the policy source and
   the date it was read (e.g. "Policy read from …, dated …"). A sensitive row that names a
   cloud endpoint with no policy line would be a failure of this story's core guarantee —
   report it as a bug, don't wave it through.

### 3d. Accepting a recommendation

**Steps**

1. On any row that shows an **Accept** button (i.e. its pick names a provider that's
   actually configured), click it. Expected: the button switches to "Accepted" and the
   **Routing** panel above updates to show that task now routed to the accepted model.
2. Click **Discard** at the bottom of the recommendation panel. Expected: the recommendation
   list clears; the one task you accepted in step 1 stays routed (discard only clears the
   _unaccepted_ proposal, not what you already committed).
3. Verify, outside the app, that only the one accepted task was written:

   ```powershell
   git -C .demo-vault diff .secondbrain/settings.json
   ```

   Expected: exactly the one task you accepted appears under `routing.tasks`; nothing else
   changed.

4. Optionally, re-fetch recommendations and click **Accept all**. Expected: every row whose
   pick names a configured provider gets accepted one at a time (you can watch each row
   flip to "Accepted" in turn); rows with no configured provider yet show "Set up a
   matching provider to accept this one." instead of a dead button.

### 3e. Offline fallback

Prerequisite: ability to disable your network adapter (a Windows setting, done outside the
app — this is the story's own instruction for reaching this state, not a workaround).

**Steps**

1. Disable your network adapter (Windows Settings → Network, or `ncpa.cpl`).
2. In the app, click **Get recommendations** again (or Check again on the local runtime
   card, if you want to see its behaviour too). Expected: rows still appear — recommendations
   come from the bundled catalogue — and a visible note states that prices may be stale,
   naming the catalogue's date.
3. Re-enable your network adapter afterwards.

### 3f. Language

**Steps**

1. Go to **Settings → Languages**, switch "Interface" to the other language, return to
   **Settings → Models**.
2. Expected: every label, reason sentence, tradeoff sentence and cost/policy line on the
   recommendation panel is translated — no leftover string in the other language.

## Summary checklist

| Section                   | Story          | Needs a real Ollama/network state?                                                |
| ------------------------- | -------------- | --------------------------------------------------------------------------------- |
| 1. Machine scan           | 019a           | No — works on any machine                                                         |
| 2a. Install runtime       | 019c           | Yes — a machine without Ollama installed                                          |
| 2b. Start runtime         | 019c           | Yes — Ollama installed, service stopped                                           |
| 2c. Pull a model          | 019c           | Yes — Ollama installed and running                                                |
| 2d. Blocked install       | 019c           | Optional — needs a constrained machine (full disk, no write permission, or Linux) |
| 3a. No providers          | 019b           | No                                                                                |
| 3b. Local recommendations | 019b           | Yes — Ollama running                                                              |
| 3c. Cloud recommendations | 019b           | Yes — a real OpenRouter API key                                                   |
| 3d. Accept/discard        | 019b           | No (works once any provider is configured)                                        |
| 3e. Offline fallback      | 019b           | Yes — ability to disable the network adapter                                      |
| 3f. Language              | 019a/019b/019c | No                                                                                |

Sections marked "No" can be run on any machine right after `npm run seed && npm run dev`.
Sections marked "Yes" need the stated prerequisite arranged first — if you don't have it,
report that block as not verified rather than skipping it silently or faking the result.
