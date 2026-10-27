---
id: 094
title: The agent setup apply never loses a result and never downgrades
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Two edges of the setup apply from story [[084]] that the S20 review left open
([S20 review](../sprints/done/S20/review.md)):

- A managed file the user edited and that carries a **newer** template version than this Gaston (written
  by a newer Gaston, then opened with an older one) shows as `modified` and is an opt-in. Ticking it
  overwrites it with the older template — a downgrade, after the undo copy is taken.
- A hard write error in the middle of an apply throws away the per-file results of the files already
  written and skips the manifest. The marker fallback recovers the state on the next read, but the user
  sees an error and no record of what was written.

## Acceptance Criteria

- [ ] **AC1** — A managed file that the user edited and whose installed version (manifest entry or the
      file's own marker) is above the shipped one shows as "From a newer Gaston" in the Agent tab, is
      listed under "Left alone" in the plan without a checkbox, is refused if confirmed anyway, and is
      byte-identical after an apply.
- [ ] **AC2** — When writing one file fails with a non-conflict error, the apply still returns: every
      file written before (and after) it has outcome `written`, the failed file has outcome `failed`
      with the error code as reason, and the manifest records exactly the files that were written. The
      plan dialog names the failed file and its reason.
- [ ] **AC3** — After such a partial apply the Agent tab shows the real state (the written files
      current, the failed one still due) and offers an update; once the cause is gone, a second apply
      writes the rest and the tab is current.

## Open Questions

- ~~**Q1 — Newer and edited.** Is a downgrade ever wanted (an explicit "restore Gaston's version")? If so
  it is its own action, not a ticked box. ~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — downgrade: never in this story. Apply neither downgrades nor overwrites a newer or edited file; an explicit restore action is out of scope.
- "Newer" beats "modified": a file counts as newer when either the manifest entry or the file's own
  marker names a version above the shipped one — both are ways a newer Gaston records itself, and the
  error direction is fail-safe (a file is left alone, never overwritten).
- A failed file does not stop the apply: the remaining files are still attempted, because one locked or
  blocked path says nothing about the next and stopping would leave more undone for no gain.
- The failure reason is the Node errno code (`EPERM`, `EISDIR`, …) or `unknown`, never `error.message`,
  because messages carry absolute machine paths into the renderer (guardrail 6).
- A failing undo copy (`snapshot`) fails that file without writing it — a write without its undo copy
  would break 084's promise.
- The steps after the files (agent dirs, manifest, help chronicle) report a hard failure as a `failed`
  row on their own path instead of throwing, so no late step can discard the file results either.
- No renderer change for AC1: the plan already lists `newer` under "Left alone" with its badge; only the
  core classification is wrong.

## Plan

Two independent fixes in `src/core/agent/`, one renderer/e2e slice on top.

1. **Newer wins** (`setup-status.ts` › `classify`): with a manifest entry, an edited file whose
   manifest version or in-file marker version exceeds the shipped version is `newer`, not `modified`.
   `buildPlan` already puts `newer` into `leave`, and `applySetup`'s `WRITABLE` already refuses it.
2. **Apply never throws mid-way** (`setup-apply.ts`): a non-conflict error during snapshot/write becomes
   outcome `failed` with `reason` (errno code); the loop continues; the manifest is written from the
   files that landed. Dir creation, manifest and chronicle failures become `failed` rows too. Shared
   type gains `'failed'` and optional `reason`.
3. **Renderer + e2e**: the plan dialog's outcome lists `failed` rows with path and reason (new i18n
   key, de + en); CHANGELOG `### Fixed` entry; one new e2e flow walks AC1–AC3 on the real app, the
   hard error provoked by an empty directory sitting at a managed file's path.

Order: D1 → D2 → D3. No systems doc exists for the agent setup (`docs/systems/` has only
`navigation.md`), so no doc D.

## Deliverables

- **D1 — An edited file from a newer Gaston stays newer.**
  In `src/core/agent/setup-status.ts` › `classify`: when a manifest entry exists and the content is
  edited (hash matches neither the entry nor the rendered template), return `newer` if the entry's
  version **or** the file's own marker version (`templateMarker(template, content)?.version`) is above
  `template.version`; otherwise `modified` as today. `installedVersion` reports the higher of the two.
  The marker-only branch (no manifest entry) already returns `newer` — leave it.
  Tests: first extract the helpers `template`, `shippedWith`, `confirmEverything`, `install`,
  `statusOf`, `manifestEntries` from `tests/core/agent/setup.test.ts` (lines ~31–66) into
  `tests/helpers/agent-setup.ts` and import them there (no behaviour change to existing tests). Then a new
  file `tests/core/agent/setup-edges.test.ts` using `MemoryVaultStore` and those helpers, with
  - "an edited file from a newer Gaston is left alone and never downgraded": install with
    `shippedWith(CURATE_SKILL, v+1)`, append a line to the file, read state with `SETUP_TEMPLATES` →
    status `newer`, path in `plan.leave` (not `plan.optIn`); `applySetup` with that path confirmed at its
    current hash → outcome `refused`, content byte-identical.
  - same with the manifest deleted (marker path) → still `newer`, refused, byte-identical.

  Files: `src/core/agent/setup-status.ts`, `tests/helpers/agent-setup.ts` (new),
  `tests/core/agent/setup.test.ts`, `tests/core/agent/setup-edges.test.ts` (new).

- **D2 — A hard write error is a result, not a thrown apply.**
  `src/shared/types/agent-setup.ts`: `AgentSetupApplyResult['results'][number]` becomes
  `{ path; outcome: 'written' | 'conflict' | 'refused' | 'failed'; reason?: string }` (`reason` only on
  `failed`, the errno code or `'unknown'`).
  `src/core/agent/setup-apply.ts`: in the per-file `try`, `VaultConflictError` stays `conflict`; any
  other error becomes `failed` with `reason` and the loop continues. `snapshot` sits inside the same
  `try` before the write, so a failing undo copy fails the file without writing it. A failed file is
  never pushed to `written`, so `recordSetupFiles` records exactly the files that landed. Wrap the
  `mkdir` of each plan dir, the manifest write (after its existing conflict-retry) and `logHelpWrite`
  so a hard error appends a `failed` row (path = the dir, `AGENT_SETUP_MANIFEST`, or
  `wikiLogPath(HELP_MODULE_SLUG)` from `src/core/vault/paths`) instead of throwing. Errno extraction:
  a small local `errnoOf(error): string` (`(error as NodeJS.ErrnoException)?.code ?? 'unknown'`) — do
  **not** use the condense `reasonOf` copies (they return `error.message`, which carries absolute
  paths). Update the file's header comment. Keep the file under ~120 lines.
  Tests in `tests/core/agent/setup-edges.test.ts` with a wrapper around `MemoryVaultStore` whose
  `writeText` (or `snapshot`) throws `Object.assign(new Error('x'), { code: 'EPERM' })` for one chosen
  path:
  - "a failed write keeps the results of every other file and the manifest records only what landed":
    fresh install where the 6th template path fails → all others `written`, that one
    `{ outcome: 'failed', reason: 'EPERM' }`, apply resolves; manifest entries = exactly the written
    paths; the failed path is still absent.
  - "a failing undo copy leaves the edited file untouched": edited file confirmed via opt-in, `snapshot`
    throws → `failed`, content byte-identical.
  - "a second apply after a partial one writes the rest": after the failure, remove the fault and run
    `install` again → only the formerly failed path is written; `readSetupState(...).action` is `none`.
  - "a manifest that cannot be written is reported, not thrown": manifest write throws non-conflict →
    files `written`, a `failed` row for `AGENT_SETUP_MANIFEST`.

  Files: `src/shared/types/agent-setup.ts`, `src/core/agent/setup-apply.ts`,
  `tests/core/agent/setup-edges.test.ts`.

- **D3 — The plan dialog names a failed file; the real app walks it end to end.**
  `src/renderer/screens/settings/agent/AgentSetupPlanDialog.tsx` › `Outcome`: a `failed` row renders
  `t('settings.agent.setup.plan.result.failed', { path, reason })`; `conflict` and `refused` stay as they
  are. New key in `src/renderer/i18n/en-settings.ts` (`'Not written: {path} ({reason}).'`) and
  `src/renderer/i18n/de-settings.ts` (`'Nicht geschrieben: {path} ({reason}).'`), next to
  `settings.agent.setup.plan.result.refused`. `CHANGELOG.md` › `## Unreleased` › `### Fixed`: one
  bullet — the agent setup never overwrites a file from a newer Gaston, and a file that cannot be written
  is named while the rest is still written and recorded.
  E2E: append one test to `tests/e2e/agent-setup.spec.ts`,
  "an apply never downgrades a newer file and never loses a result". The spec's tests share one app and
  vault, so it starts from the setup the preceding test installed (all managed files current, CURATE
  rewritten). Steps:
  1. Delete `.claude/skills/gaston-jobs/SKILL.md`; delete PROPOSE and create an empty **directory** at
     PROPOSE's path (readText sees no file, so it is `missing`; the atomic rename onto a directory fails —
     `EISDIR` on Linux, `EPERM` on Windows, so assert the row, not the code). Append a line to CURATE and
     set its manifest entry's `version` to 4 (shipped is 3), hash unchanged.
  2. Agent tab: CURATE row shows "From a newer Gaston"; Update opens; CURATE is under "Left alone" and the
     dialog has no checkbox for it; "Will write" lists the jobs skill and PROPOSE.
  3. Confirm "Write 2 files": status shows "Setup written. 1 file."; a line names PROPOSE as not
     written; the manifest has a fresh entry for the jobs skill and none written for PROPOSE.
  4. Close, reopen tab: jobs skill "Current", PROPOSE "Missing", Update offered.
  5. Remove the directory; Update → "Write 1 file" → PROPOSE exists; CURATE is byte-identical to the
     edited text from step 1 throughout.

  Files: `AgentSetupPlanDialog.tsx`, `en-settings.ts`, `de-settings.ts`, `CHANGELOG.md`,
  `tests/e2e/agent-setup.spec.ts`.

## Model Hints

- D2 → deliverable-hard — the apply loop's ordering guarantees cross three files (undo copy before
  write, manifest records only landed files with its conflict retry, conflict vs. failed); a catch-all in
  the wrong place silently writes without an undo copy or records a file that never landed.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/agent/setup-edges.test.ts` › "an edited file from a newer Gaston is left alone
  and never downgraded"; e2e `tests/e2e/agent-setup.spec.ts` › "an apply never downgrades a newer file
  and never loses a result" (steps 2, 5)
- AC2 → unit `tests/core/agent/setup-edges.test.ts` › "a failed write keeps the results of every other
  file and the manifest records only what landed", "a failing undo copy leaves the edited file
  untouched", "a manifest that cannot be written is reported, not thrown"; e2e
  `tests/e2e/agent-setup.spec.ts` › "an apply never downgrades a newer file and never loses a result"
  (step 3)
- AC3 → unit `tests/core/agent/setup-edges.test.ts` › "a second apply after a partial one writes the
  rest"; e2e `tests/e2e/agent-setup.spec.ts` › "an apply never downgrades a newer file and never loses a
  result" (steps 4, 5)

Coverage: AC1 → D1 (+ D3 e2e), AC2 → D2 (+ D3 dialog/e2e), AC3 → D2 (+ D3 e2e).

## Done
