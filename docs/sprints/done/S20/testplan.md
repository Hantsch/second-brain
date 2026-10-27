# Sprint S20 test plan — manual residue only

This is not an acceptance gate; the automated tests are (see the Acceptance section in
[review.md](review.md)). It lists only what no test can do. Every other S20 criterion has a passing
test and is not walked again by hand.

## 087 AC1–AC3 — a real terminal window opens in the vault with `claude` running

**Reason it cannot be automated.** Tests never start a real terminal or the real CLI. The e2e suite and
the unit tests prove the launch plan (executable, arguments, working directory, first prompt) through a
spawn recorder; that a real Windows Terminal or PowerShell window then opens, shows the vault as its
folder, runs `claude` and has the skill typed needs the user's desktop session and a logged-in Claude
Code CLI.

**Preparation.**

1. Windows machine with Claude Code installed and logged in (`claude` starts from any terminal).
2. Start Gaston (`npm run dev`, or the installed build) with a vault that has at least one module other
   than `gaston-help`; the vault path may contain a space.
3. Settings → Agent: the CLI status reads "installed"; if the setup is not current, press Install and
   confirm the plan, so the Terminal section is enabled.

**Steps and expected results.**

1. **AC1.** Press "Open Claude in the vault". Expected: the tab says "Opened in Windows Terminal." (or
   "Opened in PowerShell." without Windows Terminal); a window opens whose folder is the vault
   (`pwd` / `Get-Location` shows it) and Claude Code is running with an empty prompt.
2. **AC2.** Close that window. Press "Work the jobs". Expected: the same window opens with Claude Code
   running and `/gaston-jobs` already typed as the first prompt.
3. **AC3.** Close it. Pick a module in "Module to curate", press "Curate a module". Expected: the same
   window opens with `/gaston-curate <module-slug>` as the first prompt, for the module you picked.
4. **Fallback (optional, same residue).** On a machine without `wt.exe`, repeat step 1. Expected: a plain
   PowerShell window opens in the vault with `claude` running, and the tab says "Opened in PowerShell."
