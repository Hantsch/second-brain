---
name: delegate
description: Hands a concrete implementation task to the local Qwen coder via opencode, then verifies and reviews the result. Use when the user asks to delegate work, to save tokens, or to have the local model implement something. Not for design, debugging, or exploratory work.
---

# Delegate to the local coder

Opus analyses and specifies; the local Qwen3-Coder-30B on `http://127.0.0.1:8081` types.
The saving comes from not doing the edit loop yourself — reading files, applying edits,
fixing typos, re-reading. It does **not** come from skipping the analysis. Specify
carefully, then get out of the way.

## When not to delegate

Say so and do the work yourself when:

- the task is architectural, or the right approach is still open
- it is a bug hunt — the local model cannot hold enough of the repo to reason about it
- fewer than ~3 files change and you already have them in context; the handoff costs
  more than the edit
- it touches secrets handling, the IPC contract, or the vault write/conflict path

Delegating badly is more expensive than not delegating. Mechanical, well-bounded,
pattern-following work is the sweet spot: i18n keys, test scaffolding, a new screen
that mirrors an existing one, repetitive refactors.

## Preconditions

Check the coder is up before anything else:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8081/v1/models
```

Not 200 means the server is down. Tell the user to run
`D:\AI\tools\serve-qwen3coder.ps1`. Only one large model fits in 16 GB, so if the 35B is
on 8080 it has to go first: `Get-Process llama-server | Stop-Process -Force`. The setup
is documented in `D:\AI\tools\README.md`. Do not start or stop a server yourself without
asking — the user may have something running. Do not silently fall back to another
model; the user picked this one.

Expect ~60 s until the server answers, and 50–68 t/s generation once it does. If
throughput collapses below 20 t/s, VRAM is full and `--ctx-size` in the script needs to
come down — that is the user's call, not yours.

Then make sure work lands on a branch, never on `dev` or `main` directly:

```bash
git rev-parse --abbrev-ref HEAD
git checkout -b delegate/<short-slug>
```

## The work order

This is the whole job. A vague spec makes the local model explore, and exploration is
what fills its 64k context — in past sessions 84% of its tool calls were `read`/`grep`/
`glob` and only 12% were `edit`.

Write the work order to the scratchpad. It must contain:

1. **One deliverable.** If the task has three parts, that is three runs.
2. **The exact file list**, with paths. You have already located them — hand them over.
   State for each file what changes in it.
3. **The pattern to follow**: name an existing file that already does the same thing.
   "Mirror `src/renderer/screens/journal/JournalScreen.tsx`" is worth more than three
   paragraphs of prose.
4. **The acceptance criterion**, concrete and checkable.
5. **The verification command**, usually `npm run verify`, or a narrower
   `npx vitest run tests/<file>` when the full gate is too slow for the loop.

Leave out background, motivation, and repo tour. AGENTS.md is already prepended.

## The run

Use the **Bash** tool, not PowerShell — the npm shim wraps `opencode.exe` and PowerShell
turns its stderr into a `NativeCommandError` even on a clean exit.

```bash
opencode run --agent impl --auto \
  -f src/path/one.ts -f src/path/two.tsx \
  "$(cat /path/to/scratchpad/work-order.md)" 2>&1 | tail -n 25
```

- `--agent impl` carries the anti-exploration prompt from `.opencode/impl-prompt.md`.
- `-f` attaches the files directly, so the model starts with them instead of hunting.
- `--auto` approves writes without asking. Safe only because you branched.
- `| tail -n 25` keeps the transcript out of your context. Do not use `--format json` —
  the event stream is far more tokens than the answer is worth.
- One deliverable, one fresh session. Do not chain with `-c`: a long session that has
  been compacted has already lost half of what it understood.

Give it room. A 30B model on a partially offloaded card is slow; a real deliverable can
take several minutes. Use a generous `timeout` rather than assuming it hung.

## Verify yourself

Never take the model's word for it.

```bash
npm run verify
git diff --stat
```

Read `git diff`, not the changed files — the diff is a fraction of the tokens and shows
exactly what moved.

Then check what a green gate cannot: does it use `gs-*` atoms and tokens instead of raw
Tailwind palette classes, do new strings go through `t()` with keys in both `de.ts` and
`en.ts`, did anything in `src/core/` grow an Electron import, was a test weakened to
make it pass.

If the diff is close, fix the remainder yourself — a second round trip to explain a
small correction costs more than making it. If the diff is wrong in substance, the work
order was wrong. Rewrite it and rerun on a clean tree (`git checkout -- .`); do not try
to talk the model out of it.

## Report

Tell the user what the model produced, what you corrected, and the verify result. If
you fixed things by hand, say so — the point of the exercise is knowing whether
delegating actually paid off, and that only works if the corrections are visible.

`opencode stats` shows token usage and the tool-call mix. A read share back above ~60%
means the file lists are too thin.
