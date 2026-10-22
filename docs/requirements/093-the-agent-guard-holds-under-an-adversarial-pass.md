---
id: 093
title: The agent's guard holds under an adversarial pass
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Story [[085]] shipped the protection that keeps the vault agent out of `journal/` and off `raw/`: deny
rules, a fail-closed PowerShell pre-tool guard (`hook-shell-guard.ts`) and a wiki post-write check. A
false allow leaks the journal to a cloud model, so the guard has to be attacked before a release, not
only tested by its author.

S20's hard review of 085 never ran its adversarial probe battery: a safety classifier stopped it while it
was preparing about 150 probes, and the orchestrator did not retry. The verdicts for 085 rest on reading
the code, the guard author's 198 probes and the stage-1 reviewer's ~100 probes through the real script
(`powershell.exe`, win32 only). That is a merge and release caveat
([S20 review](../sprints/S20/review.md)).

Alongside that pass, five known gaps in the same protection are closed or consciously accepted:

- `[char[]]` indirection can build a path the guard cannot see (documented limit).
- The protection reader judges a hook as installed from its path and existence only; it does not read
  `disableAllHooks`, so the panel can say a rule holds while the hooks are switched off.
- The guard's write allowlist permits `modules/gaston-help/wiki/**`, which the vault `CLAUDE.md` calls
  read-only.
- The wiki post-write check's heading regex is looser than the one in `src/core/wiki/log-md.ts`.
- `.secondbrain/index/` and `.secondbrain/chats/` are protected like `journal/` (beyond the spec text of
  085); the concept and the Protection panel wording should say so.

## Acceptance Criteria

<Sketch for refine — rewrite as numbered, observable criteria.>

- [ ] **AC1** — An adversarial probe battery against the shell guard has been run through the real
      script, and every probe that reads `journal/` (or the derived index and chats) or writes `raw/`
      is blocked; the probes that matter are committed as test cases.
- [ ] **AC2** — With `disableAllHooks` set in the installed settings, the Protection section says the
      guard is off instead of listing it as holding.
- [ ] **AC3** — The agent cannot write under `modules/gaston-help/wiki/**` through the guard.
- [ ] **AC4** — The wiki post-write check and `log-md.ts` accept and reject the same log headings.
- [ ] **AC5** — Each remaining known limit (`[char[]]` indirection) is named in the agent help page and
      the Protection panel, or blocked.

## Open Questions

- **Q1 — How is the battery run?** The classifier stopped a reviewer that generated ~150 probes itself.
  Options: the probes are hand-written by the guard's author and committed as fixtures, then a reviewer
  only runs and extends them; or the pass is done by the user. The pass must not be skipped again.
- **Q2 — `[char[]]` indirection.** Block any shell command that builds a string from char codes, or keep
  it a documented limit?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
