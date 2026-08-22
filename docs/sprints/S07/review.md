---
sprint: S07
status: done
branch: sprint/S07
milestone: M9 — The gate is green and the small things are right
reviewed: 2026-08-22
---

# Sprint review S07 — The gate is green and the small things are right

## Overview

**Goal:** `npm test` fully green for the first time since M1, no screenshot run reading real
session data, German text closing its quotes, filing writing headings in the vault's own
language, and the maintenance run state as a set of files a reader can hold in their head.
Nothing new — the backlog of things every previous sprint had to call "pre-existing, unrelated"
gets an owner.

**Result: all five stories done, none blocked.** The goal is met: `npm test` reports
**190 files / 2707 tests / 0 failed**, verified by the orchestrator after the last commit.

| Story                                                | Status | Commit                                                              |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| 023 — The module schema says one thing, not two      | done   | `023: module schema doc and code say the same thing`                |
| 025 — A screenshot run never reads my real data      | done   | `025: demo vault seeds and guards Codex sessions too`               |
| 024 — Filing writes headings in my document language | done   | `024: filing writes headings in my document language`               |
| 026 — German text closes its quotes, + 3 papercuts   | done   | `026: German catalogue closes its quotes, loose-end dead link, …`   |
| 027 — The maintenance run state stops being one file | done   | `027: split the gardener run state into core and main glue`         |

Gate state after the final commit: `npm test` green, `npm run typecheck` green, `npm run lint`
green, `npm run build` green. `npm run format:check` is red on 460 files — see
"Findings & decisions" below; it is the pre-existing Windows CRLF effect, independently confirmed
by the orchestrator on a file this sprint never touched.

## Implemented stories

**023 — The module schema says one thing, not two.** The code won: `MODULE_SCHEMA_TEMPLATE` in
`src/core/wiki/agents-md.ts` needed no change (it was already the correct German text), and
`docs/MODULE-SCHEMA.md` was rewritten to mirror it byte-for-byte, with a repo-only banner comment
the drift test now strips before comparing. Line endings for that one doc are pinned via
`.gitattributes`. Two new tests cover guardrail 2 (an existing `AGENTS.md` survives a second
`createModule` untouched) and the English-vault path. This closed the test failure that had been
red since M1 and forced every sprint since to report a carve-out.

**025 — A screenshot run never reads my real session data.** The seed now writes Codex demo
sessions of its own (`scripts/seed/codex.mjs`: three rollout files, one empty-tolerance file, a
sibling `session_index.jsonl`) and pins both `claudeProjectsDir` and `codexSessionsDir` inside the
demo vault through one shared helper. A new `scripts/seed/settings-guard.mjs` fails the seed run
if a required session directory is missing, empty or outside the vault, plus a generic sweep for
any other outward-pointing absolute path. Four unit tests lock the guard. Nothing under `src/`
was touched.

**024 — Filing writes headings in my document language.** The largest story of the sprint. A
single shared name table (`src/core/vault/section-names.ts`) now holds the section kinds
(notes/todos/state/day/facts/dialogue) with their per-language names and folded aliases, placed
below `capture/`, `journal/`, `areas/` and `projects/` because `capture/` may not import
`journal/`. `docLanguage` is threaded through the whole filing write path, and the heading is
re-resolved against the freshly read target file at write time — so an existing `## Notizen`
keeps winning over the setting and no second section is ever created. The proposal card names the
heading before the user confirms. Per the user's decision, the languages settings tab warns that
existing files keep their old-language headings and offers a migration
(`src/core/vault/section-migration.ts`) that folds rather than duplicates and writes through
`expectedHash`. The read side was widened along the way: `index/projects.ts` accepted only
`stand` and would have silently emptied the re-entry excerpt of an English project file.

**026 — German text closes its quotes, and three journal papercuts.** All 100 German quote pairs
across the 13 `de*.ts` catalogues now close with U+201C (`„…“`) — verified by the orchestrator as
100 openers / 100 closers, with zero U+201E left in any `en*.ts` file. The convention is written
into `src/renderer/i18n/index.ts` and CLAUDE.md guardrail 7, and guarded by new assertions in
`tests/renderer/i18n.test.ts`. Plus: a loose end whose day cannot be resolved renders as plain
text instead of a link to nowhere, and the three inline `de-DE`/`en-GB` ternaries in `DayList`,
`DayEntry` and `HealthCard` now go through the shared `locale()` helper.

**027 — The maintenance run state stops being one big file.** Behaviour-preserving refactor.
Five pure modules moved out to `src/core/gardener/` (`run-record`, `run-scope`, `run-read`,
`run-merge`, `run-present`), shrinking `src/main/gardener-state.ts` from 788 to 226 lines of fs +
cache + delegation; `src/main/ipc/gardener.ts` went from 409 to 200 lines with the run flow and
the fix/orphan helpers split into `gardener-run.ts` and `gardener-actions.ts`. The proof that it
preserved behaviour: **not one test file was edited** — exported names were kept deliberately so
no test import had to move, and the existing 021 suites stayed green as they were.

## Findings & decisions

**User decisions taken in the clarification round (binding, recorded per story):**

- **023** — the code is authoritative, not the doc. `MODULE-SCHEMA.md` was rewritten to match
  what real vaults already contain.
- **024** — a `languages.documents` switch is not silently accepted: the settings screen warns
  and offers a migration of old-language headings. This widened the story by three deliverables
  and added a UI surface subject to P1.
- **026** — German low-high quotes `„…“` (U+201E / U+201C) for the whole catalogue.
- **027** — pure run-state logic moves to `src/core/gardener/`, only Electron glue stays in
  `src/main/`. Larger diff accepted for testability and the "core knows nothing about Electron"
  guardrail.

**`npm run format:check` is red and it is not this sprint's doing.** 460 files fail. The
orchestrator confirmed independently on `src/main/index.ts` — last touched before this sprint —
that the working copy carries CRLF line terminators and prettier rejects it for that alone. This
is `core.autocrlf` on Windows against a repo prettier expects in LF. Every story in this sprint
verified its own changed files as prettier-clean individually. **This is the next carve-out this
project should retire** — exactly the kind of never-green gate story 023 just removed. It wants
its own story: either `.gitattributes` normalisation for the whole repo (023 did it for one file)
or a prettier/git configuration that agrees with itself on Windows.

**Real defects found during the sprint, beyond the stated scope, and fixed:**

- Story 024's review found four more places that hardcoded a German heading or matched only the
  German one: `ProjectOverviewTab.tsx` (empty panel on `## Status`), `main/ipc/todos.ts` (the
  no-project todo target), `main/ipc/projects.ts` (`newBody()` for new projects), plus the
  `stand`-only read side. All fixed with discriminating tests. The story as written would have
  shipped a half-language-aware app.
- Story 026's rewrite made 8 renderer test files red, because they asserted the old ASCII-closed
  strings. Fixed as a glyph-only mechanical follow-up — no expectation was weakened.

**Known, deliberately not fixed (needs a follow-up story):**

- **The maintenance progress bar vanishes** after navigating away from the garden screen and
  back. Found while smoke-testing 027 and rigorously isolated: it lives in
  `src/renderer/lib/queries/gardener.ts`, which story 027 never touched, and the backend answers
  `gardener:runStatus` correctly at the exact instant the bar disappears. Confirmed against a
  HEAD worktree as pre-existing. **This is the strongest candidate for the next small story.**
- `src/main/ipc/gardener-deps.ts` (635 lines) stays over the soft limit. It is run orchestration,
  not run state, so it was out of 027's scope — flagged there as a follow-up.
- `core/capture/filing.ts`'s `applyFiling` export has no live caller (pre-existing dead export).
  Its new `docLanguage` option is correct but exercised by no live path.
- Story 025's settings guard skips the two session-directory fields by value rather than by key
  in its generic sweep. Negligible with today's fixed settings schema; noted rather than fixed.
- `useSectionMigrationPlan` reads the whole vault uncached. Acceptable at personal-vault scale.

**Process note.** The build of story 024 was cut off mid-run by a session limit, after all nine
deliverables were implemented but before the confirming review pass. It resumed cleanly from the
files alone — story status, progress trail and working tree were enough to reconstruct where it
stood, which is what the file-based state is for. Worth knowing that it works.

## Live acceptance status (P2)

Per the profile, `live-smoke-required: true` — and an autonomous sprint cannot perform manual UI
acceptance. Status per story:

- **024** — driven through the real app during the build: the proposal card showed "Landet unter
  `Notizen`", switching the document language to English surfaced the migration card ("32
  Dateien…"), and triggering it reported "32 Dateien umgestellt." Screenshot run clean.
  **Built, live acceptance pending** — the user should confirm the flow themselves.
- **026** — `npm run seed && npm run shot` clean (61 shots, no console errors), and the German
  `„…“` convention was confirmed rendering live in Settings → Sprachen. Two caveats, both
  honest: the demo vault contains no unresolvable loose end, so that branch was accepted on unit
  tests rather than on screen; and the English due-date string is an `aria-label`, not visible
  text, so it was verified in source and tests. **Built, live acceptance pending.**
- **027** — start, stop mid-run, continue, scope-to-kind and close-vault-mid-run were each driven
  through the built app and passed. **Built, live acceptance pending** (and see the known
  progress-bar issue above, which the tester will likely encounter).
- **023** — engine plus docs, exempt from P1/P2 per the sprint plan. Accepted on tests.
- **025** — the screenshot harness itself; its acceptance *is* a green seed-and-shot run, which
  it had, plus a manual negative-path check confirming the guard fires.

No story is presented as fully accepted. `ui-acceptance-required` was satisfied for every
user-facing path — no console workaround was accepted as a test step anywhere.

**Gaps named in the test plan, repeated here as the rule requires:**

- **Story 025's guard has no UI surface at all.** Its AC — the seed refuses to run if a setting
  points outside the demo vault — is a console-only safety net inside `npm run seed`. There is
  nothing to click. This is honest rather than a defect (the story *is* the harness), but it means
  that criterion cannot be manually accepted through the app.
- **026's English due-date fix is an `aria-label`, not visible text** — verifiable in a screen
  reader or in source, not by looking at the screen.
- **026's loose-end dead-link fix has no example to click** in the seeded vault: every seeded
  loose end resolves to a real day, so the branch that was fixed cannot be reached from demo
  content. Accepted on unit tests. If this matters again, the seed should grow a loose end whose
  day does not resolve.

## Blocked / open

**Nothing blocked.** All five stories completed; no story needs a user decision to proceed.

Open items for the next planning session, in the order they deserve attention:

1. **The prettier/CRLF gate** — a second never-green gate, of exactly the kind this sprint
   existed to remove. Needs a story.
2. **The maintenance progress bar** after navigation — small, visible, isolated, ready to pick up.
3. **`gardener-deps.ts`** still over the soft limit at 635 lines.
4. **The condensed layer** stays in "Open / unprioritised" and remains the strongest M10
   candidate — this sprint deliberately did not touch it.

No `changelog-path` is configured in `.claude/ai-scrum.md`, so the changelog sweep was skipped.
