---
id: 041
title: The format gate is green on Windows
status: draft # draft -> ready -> in-progress -> done
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
- Q4 — `src/renderer/styles/gaston/` is prettier-ignored as vendored code. Does it stay ignored
  under the new decision, and does it still get git's normalization? A detail for refine: the
  default is that it stays ignored by prettier and is still normalized by git, since git's
  normalization is what keeps a clone byte-identical.

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

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
