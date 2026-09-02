---
id: 041
title: The format gate is green on Windows
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. Found in S07, in the roadmap's "Open / unprioritised" table ever since. The second
never-green gate after M9 retired the first, and the one that also blocks `npm run handoff`
([[031-a-build-i-can-hand-on]]). Story [[023-the-module-schema-says-one-thing]] solved it for a
single file via `.gitattributes`.

## Requirement

`npm run format:check` fails on this machine for a reason that has nothing to do with the code:
1077 files differ from prettier by line ending alone, including files no sprint has ever touched.
`core.autocrlf` writes CRLF into a working tree that prettier reads as LF, so the check reports
the whole repository as unformatted.

Because `format:check` is the first step of `npm run verify`, the gate is red before a single test
runs. That is worse than having no gate: S10's review records that `format:check` was not part of
any story's done gate, because it could not be. And `npm run handoff` refuses for the same reason,
so the build I am supposed to hand to a test user cannot be produced. A gate that is always red
tells me nothing, and I stop reading it — which is exactly when it would have caught something.

I want one decision about what this repository's canonical bytes are, made once and written down,
so that `format:check` means "the formatting is wrong" again. Not a growing list of per-file
exemptions.

## Acceptance Criteria

- [ ] `npm run format:check` passes on a fresh clone on Windows, with `core.autocrlf` as this
      machine has it configured.
- [ ] `npm run verify` gets past step one and actually reaches lint, typecheck, test and build.
- [ ] `npm run handoff` runs to completion.
- [ ] The three existing `eol=lf` exemptions keep doing their job: the vault/frontmatter/section
      string logic that assumes bare `\n`, and `tests/core/wiki/module.test.ts`'s byte-exact
      comparison, stay green.
- [ ] The same checkout on a non-Windows machine produces the same `format:check` result.
- [ ] No test is deleted, skipped or weakened to get there.
- [ ] Behaviour is unchanged: lint, typecheck, test and build results are identical before and
      after the change.
- [ ] The decision and its reason are written where the next person meets the problem, not only in
      this story.
- [ ] `format:check` is added to the verify list in `.claude/ai-scrum.md`, so a story's done gate
      includes it from the next sprint on.
- [ ] The three existing `eol=lf` carve-outs are re-examined against the new repo-wide rule and
      either removed as redundant or kept with a reason recorded in `.gitattributes`.

## Open Questions

- ~~Q1 — Repo-wide `eol=lf` normalization, or prettier accepting the platform's endings?~~
  answered → Decisions (Sprint)
- ~~Q2 — Does the renormalizing commit stand alone, and when does it land?~~
  answered → Decisions (Sprint)
- ~~Q3 — Does `format:check` join the verify list in `.claude/ai-scrum.md` once it is green?~~
  answered → Decisions (Sprint)
- ~~Q4 — `src/renderer/styles/gaston/` under the new rule?~~ answered → Decisions (Sprint)

None open. Status `ready`.

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding.

- **(User)** Q1 — **repo-wide `* text=auto eol=lf`.** LF is this repository's canonical byte, and
  git normalizes on checkout. One renormalizing pass over ~1077 files. Chosen over prettier's
  `endOfLine: "auto"` because only normalization makes a clone byte-identical on any OS, and over
  `"crlf"` because CRLF would fight the three existing `eol=lf` carve-outs that exist precisely
  because the vault/frontmatter/section string logic assumes bare `\n`. Those three carve-outs
  become redundant rather than special cases — check whether they can go, and say so either way.
- **(User)** Q3 — **yes, `format:check` joins the verify list** in `.claude/ai-scrum.md` once it is
  green, so every story's done gate really includes it. A gate no story is allowed to rely on
  decays back to red, which is how this one got here.
- Q2 — **the renormalizing pass is its own commit, and this story runs last in S11** (build order
  040 → 042 → 043 → 041). Decided at the plan, recorded in
  [../sprints/S11/sprint.md](../sprints/S11/sprint.md): placed first it would make every other
  diff in the sprint unreadable, and a line-ending decision that goes wrong would eat the sprint
  before the guardrail story lands. Running last, its sweep also picks up what 040, 042 and 043
  wrote.

### Decided at refine (2026-09-02, not the user's — reasons below)

- Q4 — **`src/renderer/styles/gaston/` stays prettier-ignored and is still git-normalized**, as
  the default lean says. Reason: its eight files are already `i/lf` in the index and only `w/crlf`
  in the working tree, so `eol=lf` makes a clone byte-identical without prettier ever reformatting
  vendored code.
- **The premise "one renormalizing pass over ~1077 files" does not hold — measured at refine:**
  `git ls-files --eol` reports **0 `i/crlf`, 0 `i/mixed`** across all 1162 tracked files and
  **1101 `w/crlf`**. The repository's committed bytes are _already_ LF; only the checkout direction
  is broken (`core.autocrlf=true` writes CRLF into the tree prettier then reads as LF). So
  `git add --renormalize .` is expected to stage **nothing** and the fix is checkout-side: the
  `.gitattributes` rule plus one working-tree refresh. This does not touch Q1 — repo-wide
  `* text=auto eol=lf` stays the decision, it is just cheaper than budgeted.
- **The three `eol=lf` carve-outs are removed, not kept** (AC 10). Reason: the repo-wide rule is
  strictly stronger than all three, and the story explicitly asks for one decision instead of a
  growing list of exemptions — their _reason_ survives as a comment on the repo-wide rule, so the
  next person still learns why LF matters for `tests/core/vault/**`, `tests/fixtures/vault/**` and
  `docs/MODULE-SCHEMA.md`.
- **Binary extensions get an explicit `-text` pin** next to the blanket rule. Reason: the 21
  tracked binaries (`assets/**` `.png`/`.ico`, `.screenshots/*.png`) are only safe today by git's
  content sniffing, and a blanket `* text=auto` should not leave that to heuristics.
- **The 13 genuinely misformatted files are fixed with `npm run format`, in the same commit as the
  renormalization.** Reason: they are the residue the EOL noise has been hiding
  (`prettier --check --end-of-line auto .` → 13 files at refine time); splitting them off would
  leave the gate red for a second commit and the first green `format:check` is the point.
- **The historical roadmap entries that call the gate "never green" (M9/M10 gaps,
  `docs/ROADMAP.md` L363/439/522/552) are left as written.** Reason: they are a record of when the
  problem was seen; the sprint review closes the loop, and rewriting history sections is not this
  story's mandate.
- **No CI step is added.** Reason: the repo has no `.github/workflows/` at all, so inventing one
  here would be a second, unrelated decision.
- **No `.editorconfig` and no `endOfLine` key in `.prettierrc.json`.** Reason: with git handing out
  LF, prettier's default (`"lf"`) is already correct; a second source of truth for line endings is
  exactly what made this gate ambiguous.

## Plan

Five small steps, in order. Step 0 first, because AC 7 ("results identical before and after") can
only be proven against numbers taken _before_ anything moves.

**0. Baseline.** On the untouched tree run `npm run lint`, `npm run typecheck`, `npm test`,
`npm run build` and write down the test/file counts and the lint/typecheck output. That is the
reference for AC 6 and AC 7.

**1. `.gitattributes` (D1).** Replace the three narrow rules with one repo-wide
`* text=auto eol=lf`, a comment recording _why_ LF is this repository's canonical byte (carrying
over the string-logic reason from story 005/023), and explicit `-text` pins for `*.png` / `*.ico`.

**2. The working tree becomes LF (D2, own commit per Q2).** On a **clean** tree: `git add
--renormalize .` (expect zero staged changes — see Decisions), then refresh the checkout so it
matches the index (`git rm --cached -r . && git reset --hard`, which is why the tree must be clean
first; `npm run format` reaches the same state file-by-file if that is preferred). Then
`npm run format` to fix the ~13 files that are genuinely misformatted, and `npm run format:check`
must exit 0.

**3. A guard so it cannot decay (D3).** New `tests/scripts/eol-normalization.test.ts`: parses
`git ls-files --eol` and fails if any tracked file is `i/crlf` or `i/mixed`, and asserts
`.gitattributes` carries the repo-wide rule. Skips itself if git is unavailable.

**4. The decision where the next person meets it (D4).** `CLAUDE.md` "Quality gates",
`README.md`'s `format:check` row, and `format: npm run format:check` in `.claude/ai-scrum.md`'s
`## Verify` block (AC 9).

**5. The gate proven (D5).** `npm run verify` end to end, then `npm run handoff` to completion,
compared against step 0's numbers and recorded in `## Done`.

Affected files: `.gitattributes`, `CLAUDE.md`, `README.md`, `.claude/ai-scrum.md`, new
`tests/scripts/eol-normalization.test.ts`, plus the ~13 files `npm run format` rewrites. No
`src/` logic, no IPC, no renderer behaviour.

## Deliverables

**D1 — One rule, and the carve-outs resolved**
`.gitattributes` (only file). Mirror: the existing comment style in the same file — every rule
carries its reason.
_Accepted when:_ the file contains `* text=auto eol=lf` with a comment naming the decision and its
reason (LF is canonical so a clone is byte-identical on any OS; the vault/frontmatter/section
string logic and `tests/core/wiki/module.test.ts`'s byte-exact comparison assume bare `\n`); the
three narrow `text eol=lf` rules are gone and the comment says they are redundant under the
repo-wide rule, not forgotten; `*.png` and `*.ico` are pinned `-text`;
`git check-attr text eol -- tests/core/vault/frontmatter.test.ts docs/MODULE-SCHEMA.md
src/renderer/styles/gaston/styles.css` reports `text: auto` / `eol: lf` for all three, and
`git check-attr text -- assets/app-icons/icon.ico` reports `text: unset`; nothing else in the repo
changed yet.

**D2 — The working tree is LF and `format:check` is green** _(risky, see Model Hints)_
Working tree wide; expected index diff is only the ~13 files `npm run format` rewrites. Its own
commit (Q2).
_Accepted when:_ run on a **clean** working tree (nothing uncommitted anywhere — this step
re-checks out every file); `git add --renormalize .` stages nothing, and if it stages anything the
step halts and reports it instead of committing; afterwards `git ls-files --eol` shows `w/lf` for
every tracked text file and still 0 `i/crlf` / 0 `i/mixed`; `npm run format:check` exits 0;
`git status` is clean apart from the prettier-formatted files, and their diff contains only
formatting — no content edit, no deleted line of test code; the commit message names the
renormalization as such.

**D3 — The gate cannot silently go red again**
New `tests/scripts/eol-normalization.test.ts`. Mirror:
[`tests/scripts/build-config.test.ts`](../../tests/scripts/build-config.test.ts) for the shape (a
repo-config assertion living under `tests/scripts/`).
_Accepted when:_ the test shells out to `git ls-files --eol`, fails with a readable message listing
the offenders if any tracked file is `i/crlf` or `i/mixed`, and asserts `.gitattributes` contains
the repo-wide `text=auto eol=lf` rule; it `skip`s (not fails) when git is not on PATH or the
directory is not a git checkout, with a comment saying why; it is green in `npm test` and adds to,
never replaces, existing tests.

**D4 — The decision is written where the next person meets it**
`CLAUDE.md` (the `## Quality gates` block), `README.md` (the `## npm scripts` table row for
`format:check`), `.claude/ai-scrum.md` (the `## Verify` block). Mirror: the surrounding table rows
and the existing `build:`/`test:` lines.
_Accepted when:_ `CLAUDE.md`'s quality-gates section states in one or two sentences that LF is the
repository's canonical line ending, enforced by `.gitattributes`, and that `format:check` is
therefore expected to be green on Windows too; `README.md`'s `format:check` row or the line under
the table points at `.gitattributes` for line endings; `.claude/ai-scrum.md`'s `## Verify` block
carries `format: npm run format:check` alongside `build/test/lint/typecheck` (AC 9); English,
sentence case, no emoji; `npm run format:check` still green after the edits.

**D5 — The gate proven end to end**
No source file — a verification deliverable; results land in `## Done`.
_Accepted when:_ `npm run verify` runs past `format:check` and completes through lint, typecheck,
test and build (AC 2); `npm run handoff` runs to completion and writes
`dist/gaston-<version>-windows.zip` (AC 3); the recorded test count, test-file count and
lint/typecheck output are **identical** to step 0's baseline (AC 6, AC 7), and any difference is
named and explained rather than accepted; `## Done` records the before/after numbers and states
explicitly that the three former carve-out areas (`tests/core/vault/**`, `tests/fixtures/vault/**`,
`tests/core/wiki/module.test.ts`) are green under the repo-wide rule (AC 4).

## Model Hints

- `D1 → default` — one config file with comments.
- `D2 → deliverable-hard` — the only destructive step in the story: it re-checks out all 1162
  tracked files via `git reset --hard`, so a dirty tree or an unnoticed staged renormalization diff
  would silently destroy 040/042/043's work from earlier in this sprint.
- `D3 → default` — one small test next to an existing sibling of the same kind.
- `D4 → default` — documentation and one profile line.
- `D5 → default` — running the gates and writing the numbers down.
- `Review: → default` — despite the 1101-file working-tree sweep, the reviewable diff is tiny
  (`.gitattributes`, one test, three doc edits, ~13 whitespace-only formattings) because the index
  was already LF; the real risk is procedural and is covered by D2's clean-tree precondition.

## Test Plan (manual acceptance)

No UI surface — this is a repo/tooling story, exempt from P1 (`ui-acceptance-required`). Acceptance
is the gates themselves plus one clone check the session cannot fake:

1. On the sprint branch after D2: `npm run format:check` → exits 0, no file list.
2. `npm run verify` → passes `format:check` and continues into lint, typecheck, test, build.
   Compare the test count with the baseline from plan step 0: it must be the same number.
3. `npm run handoff` → runs to completion, exactly one `dist/gaston-<version>-windows.zip`.
4. Fresh-clone check (AC 1): `git clone <this repo> C:\Temp\gaston-eol && cd C:\Temp\gaston-eol &&
npm ci && npm run format:check`. With `core.autocrlf=true` still set globally, this must be
   green — that is the criterion, and it can only be seen on a clone.
5. Open one file from the clone in Notepad or VS Code and confirm the status bar says `LF`; run
   `git ls-files --eol | Select-String "w/crlf"` → no output.
6. Non-Windows equivalence (AC 5), if a Linux/macOS or WSL shell is reachable: clone there,
   `npm ci && npm run format:check` → same green result, and `git status` clean immediately after
   the clone. If no such machine is available, record that AC 5 rests on the `eol=lf` normalization
   plus D3's index guard, and say so instead of ticking it silently.
7. Edit any tracked file in a CRLF-forcing editor, save, and confirm `git status` shows no change
   from the line endings alone — the normalization holds on the write path too.

## Coverage (AC → deliverable)

| Acceptance criterion                                | Deliverable                      |
| --------------------------------------------------- | -------------------------------- |
| `format:check` passes on a fresh clone on Windows   | D1 + D2, test plan 1 and 4       |
| `verify` gets past step one                         | D5, test plan 2                  |
| `handoff` runs to completion                        | D5, test plan 3                  |
| The three `eol=lf` exemptions keep doing their job  | D1 (rule + comment), D5 (green)  |
| Same result on a non-Windows machine                | D1 (normalization), D3, test 6   |
| No test deleted, skipped or weakened                | D5 (count identical to baseline) |
| Behaviour unchanged before/after                    | D5 (baseline comparison)         |
| The decision written where the next person meets it | D4, plus D1's comment            |
| `format:check` added to `.claude/ai-scrum.md`       | D4                               |
| The three carve-outs re-examined, removed or kept   | D1 (removed, reason recorded)    |

## Done
