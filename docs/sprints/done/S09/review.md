# Sprint S09 review — a small model, an engine that installs itself, and a start I can see

## Overview

**Goal.** A machine without a strong graphics card gets a local model it can actually run,
without a terminal: the catalogue learns the 1B–4B class, llama.cpp becomes a runtime the app
fetches and sets up the way it already does Ollama, and starting it happens from the settings
screen with layer count, context size and thread count derived from the machine rather than
invented.

| Story | Status | Result |
| --- | --- | --- |
| 035 — The machine card remembers, and speaks plainly | `done` | Scan persists across restarts, VRAM in GB, resource budget as a slider, card split under 300 lines. |
| 032 — A model that fits a weak machine | `done` | Catalogue gained two sub-7B local models; `cheap` tier gained a size signal and a per-task minimum; honest `beyond-this-machine` verdict when nothing in the catalogue fits. |
| 033 — llama.cpp is a runtime the app can install | `done` | llama.cpp is a second managed `RuntimeInstaller` next to Ollama: fetch, model search/download (Hugging Face), status, cancel, all through the existing IPC shapes. |
| 034 — The engine starts with settings that fit this machine | `in-progress` (built, acceptance pending) | Pure derivation, lifecycle, card and auto-start are implemented and reviewed; live acceptance needs a machine where the engine is genuinely absent, which the author's machine is not. |

Branch: `sprint/09`, cut from `main` (no `dev` branch exists yet in this repo). Four commits, one
per story: `294729a` (035), `e7e1f26` (032), `d779e2b` (033), `a02206f` (034).

## Implemented stories

**035 — The machine card remembers, and speaks plainly.** The machine scan now caches to
`<userData>/machine-scan.json` and re-derives on every read, so a budget or VRAM change never
shows a stale verdict. Manual VRAM entry moved from MB to GB, the resource budget became a real
Gaston slider, and the card explains machine capacity in plain language instead of parameter
counts. The 493-line `MachineCard.tsx` was split into `src/renderer/screens/settings/machine/`.
A review pass found and fixed five defects (double-commit on the slider, GB rounding away
decimals, a broken hover token, German decimal-comma formatting, missing test coverage on the
new channel) before closing.

**032 — A model that fits a weak machine.** The bundled catalogue gained two hand-curated
sub-7B local entries. `tiers.ts` now distinguishes tiny/small/mid inside the `cheap` tier with a
documented per-task minimum, and `recommend.ts` drops candidates below that minimum, right-sizes
among the survivors, and reports `pick: null` / `reasonKey: 'beyond-this-machine'` with a
shortfall when the machine itself — not just the configured catalogue — cannot meet a task.
Nothing is routed without confirmation; a shortfall row shows no accept button.

**033 — llama.cpp is a runtime the app can install.** llama.cpp is now a second local runtime
behind the shared `RuntimeInstaller` interface introduced for this story (033-Q6, resolved as
"extract, don't duplicate"). Both runtimes share cards, an install dialog (GPU-scan-preselected
build with a translated reason), status, engine fetch and cancel through the same IPC channels
plus one addition (`llm:searchModelFiles`). The engine fetch stages into a temp directory and
only renames into place on full success. A model panel searches Hugging Face anonymously and
downloads through the existing pull-progress shape. AC8 (a real network + GPU download) could not
be live-verified on the build machine and was left as the one open item in 033's own Done section
even though the story closed as `done`.

**034 — The engine starts with settings that fit this machine.** A prior session had already
implemented all seven deliverables (pure derivation in `src/core/llm/llama-args.ts`, IPC
contract, lifecycle/spawn/autostart in `src/main/ipc/runtime/`, the card and advanced-override
row in the renderer, log redaction) but had committed them under an unrelated, mislabelled commit
(`a4ecd1d`, "prettier run and parts of 31") without a fresh verification pass, leaving the
sprint's own bookkeeping (`progress.md`) wrongly claiming the work was lost. This sprint's build
step audited the actual code against every acceptance criterion (all passed), then ran a clean
`story-review-hard` review, which found a real blocker: manual engine start could race the D6
on-demand auto-start guard and double-spawn `llama-server`, orphaning the first process. That and
four related findings (an auto-start guard firing regardless of provider, an unredacted
spawn-throw error, a dead-child poll not short-circuiting, a `will-quit` hook not crash-safe, a
stale renderer plan after a budget change) were fixed in one pass and re-reviewed to PASS. The
story stays `in-progress` because its acceptance criteria depend on a machine where the engine is
genuinely absent and a real GPU/CPU-only start can be exercised — story 031 (S08) exists to make
that possible on the test user's laptop, but the author's own machine cannot substitute for it.

## Findings & decisions

- **033-Q6 (extract vs. duplicate) resolved as extract.** `RuntimeInstaller` is now the shared
  interface both Ollama and llama.cpp implement; this is the shape any future third runtime
  would also follow.
- **Sprint bookkeeping cannot be trusted blindly.** `sprint.md` was found at `status: planned`
  with no branch and no ticked stories, and `progress.md` claimed lost work, while the branch
  already carried three finished, committed, `done` stories and most of the fourth. Root cause:
  a prior session's commit (`a4ecd1d`) bundled unrelated repo-wide changes ("prettier run and
  parts of 31") together with real story work under a commit message that named neither — the
  next session's orchestrator had nothing in the log to recognize the work by. Worth carrying
  into future sprints: one commit, one story, always — mixing "incidental repo maintenance" into
  a story commit is what broke resumability here.
- **034's acceptance risk, named at the milestone cut, materialized exactly as predicted.** The
  M11 cut already flagged that 033/034 "have 019c's acceptance problem in a sharper form" and
  that at least one would likely end as "built, acceptance pending" until run on the test user's
  laptop. 034 is that story.
- **AC8 in 033** (a real network download against Hugging Face plus a real GPU) is the same class
  of gap as 034's — not fixable from this machine, carried forward as a live-smoke item for the
  test user rather than hidden behind a mock.

## Blocked / open

- **034 — live acceptance pending.** Start/stop lifecycle, the advanced-override row, and
  foreign-runtime detection (steps 3, 5, 6, 7 in the story's manual test plan) all need a machine
  with a real llama.cpp engine and model present, or genuinely absent — neither is true on the
  build machine. Decision needed from the user: run the live smoke on the test user's laptop
  (story 031, S08) and flip 034 to `done`, or accept it as `in-progress` for another cycle.
- **033 — AC8 not live-verified**, same underlying reason (no live network + GPU on the build
  machine). Story itself is `done`; this is a residual gap, not a blocker.
- Two pre-existing, unrelated gaps carried over from S07/S08 and still open: `format:check` never
  green on Windows (CRLF line endings vs. prettier's LF default), and the maintenance progress
  bar disappearing after navigation (`src/renderer/lib/queries/gardener.ts`).
