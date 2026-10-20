---
id: 037
title: An area can be condensed into one file
status: done # draft -> ready -> in-progress -> done
created: 2026-09-01
---

Part of M12 (condensed layer, area level). The core of the milestone: the artifact, the run and
the honest no-model case. Depends on [[036-a-day-says-which-areas-it-belongs-to]] for one of its
three inputs. Concept: [[../concepts/condensed-layer]] (CND-1, 3, 4, 5, 6, 9, 10, 11, 13, 14,
15, 16, 28, 29, 30, 31).

No screen in this story — the run produces a proposal, story 038 shows and confirms it.

## Requirement

An area collects material and nothing ever gathers it. Its notes section grows, its todos come
and go, and — after story 036 — day entries point at it. What is missing is the one file that
says what currently holds in this area, what pattern keeps repeating, and what is still open,
in prose I can read in a minute without rereading three weeks of days.

The app should be able to produce that file for an area: read the area's own notes and todos and
the day entries carrying its slug, and write _state_, _patterns_ and _open_ — each section ending
with the paths it was written from. It gets shorter as I get smarter: a run may delete, and it
compresses older material rather than appending to it.

It must not invent. A sentence it cannot attribute to one of the inputs it read does not get
written. And because an area sees my journal, this is a sensitive task: it should be routed to a
local model, and without a configured model the app says so plainly and writes nothing — there is
no mechanical fallback here, because a concatenation of excerpts presented as a synthesis would
assert knowledge nobody checked.

## Acceptance Criteria

- [x] An area with inputs can be condensed into exactly one artifact file belonging to that area;
      an area with no inputs produces no artifact and no placeholder.
- [x] The artifact carries `condensed_at` and a `sources:` list naming every input the run read.
- [x] Its sections are _state_, _patterns_ and _open_, with headings in the document language
      (not the UI language), and each section ends with the source paths it came from.
- [x] Input selection is deterministic and stated: the area's notes section, its todos, and the
      day entries carrying its slug. No model decides what it may read.
- [x] Where the run read only part of the available inputs, the artifact says so.
- [x] A run respects a soft size target and compresses older material instead of appending.
- [x] A run that cannot complete leaves the artifact untouched and reports the failure — never a
      half-written file.
- [x] Unknown frontmatter keys and the directives section of an existing artifact survive a run
      untouched.
- [x] The task kind `condense-area` is independently assignable to a provider and model, is
      marked sensitive, and recommends a local model.
- [x] With no model configured for it, the run does not start, states which task kind is missing,
      and writes nothing.
- [x] Tests cover the run with the fake provider and with "no model configured", and a test proves
      nothing reaches a real network.

## Open Questions

- ~~Q1 — What `type:` does the artifact carry...~~ answered → Decisions (Sprint)
- ~~Q2 — What is the artifact's file name?...~~ answered → Decisions (Sprint)
- ~~Q3 — What is the soft size cap, concretely, and is it per artifact or per section?...~~
  answered → Decisions (Sprint)
- ~~Q4 — What bounds the inputs...~~ answered → Decisions (Sprint)
- ~~Q5 — What happens when I edited a body section by hand and the next run rewrites it?...~~
  answered → Decisions (Sprint)
- ~~Q6 — Are contradictions their own section on the area level, or a rule for the _state_
  section? Concept open point O4.~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 (O2) — artifact `type:`: a new `DocType` (e.g. `condensed`), not a reuse of
  `overview`. Avoids overloading `overview`'s existing meaning (module synthesis) and the resulting
  re-audit of every `type === 'overview'` branch.
- **(User)** Q2 (O7) — file name: `areas/<slug>.condensed.md`, with an explicit dotted-file
  exception added to VAULT-FORMAT.md, precedented by `web/<date>-<slug>.ingest.json`.
- **(User)** Q3 (O1) — soft size cap: ~2000 words / ~12k characters per artifact (not per
  section). Matches "read in a minute" from the requirement; revisit after real usage.
- **(User)** Q4 (O3) — input bounds: the last ~90 days of day entries carrying the area's slug,
  plus the area's full notes and todos section. Mirrors the contradiction check's 24-page
  precedent for a stated, bounded input.
- **(User)** Q5 (O8) — human edit vs. rewrite: flag it in the diff and let the user decide each
  time; never silently overwrite, and no new protection machinery this sprint.
- Q6 (O4) — contradictions are a **rule for the _state_ section**, not their own section. Follows
  the concept's stated default (§7) and this story's AC 3, which names exactly three sections.
- D1 — the artifact's own module is `src/core/condense/`, not an extension of `src/core/areas/`.
  `areas/` is string transforms over the human's `areas/<slug>.md`; the artifact is a machine-owned
  sibling file, and mixing them is how the two write paths would blur.
- D2 — section headings are added to the shared table `src/core/vault/section-names.ts`
  (`patterns`, `open`, `directives`; `state` already exists) rather than a local `phrases()` bag,
  because the artifact is re-parsed and merged on every run and needs alias-tolerant reading.
- D3 — the task-routing entry goes into `TASK_KINDS` + `TASK_DEFINITIONS`
  (`src/core/llm/tasks.ts`) only; the settings routing table derives from there, so no renderer
  list is hand-edited.
- D4 — the run returns a **proposal object** and never writes; the thin hash-guarded
  `writeCondensedArea()` helper ships here too so AC 1 is testable, while diff, accept, reject and
  directives-append stay in story 038.
- D5 — no-attribution enforcement is deterministic, not prompt-only: a section whose `sources` are
  not a subset of the inputs actually read fails the run. Guardrail 3 cannot rest on the model
  obeying an instruction.
- D6 — `condensed_at` is written as an ISO timestamp with offset, mirroring the concept's §5
  example; `sources:` uses the existing `sources` frontmatter key so no new evidence mechanism
  appears.
- D7 — scope boundary against 039: this story introduces the `condensed` `DocType` and its path
  mapping; the gardener exemptions, the due-ness check and the search/type-filter acceptance stay
  in 039, which owns those criteria.
- D8 — the truncation notice (AC 5) is a sentence in the artifact body written from the
  deterministic selector's own report, not something the model is asked to add.

## Plan

The story is backend only — no screen (038 owns the surface). One new core module
`src/core/condense/`, one new task kind, one new vault file kind.

1. **Vault format & type.** `docs/VAULT-FORMAT.md` gets an explicit dotted-sibling exception to
   the filename rule (line ~57, precedent `web/<date>-<slug>.ingest.json` at line 33) and a new
   `## Condensed area (areas/<slug>.condensed.md)` section after the area section (line ~175),
   documenting `condensed_at`, `sources:` and the four body sections. `DocType` gains `condensed`
   (`src/shared/types/vault.ts:27`), `DOC_TYPES` gains it (`src/core/index/build.ts:36`), and
   `docTypeFromPath` gets a `/^areas\/[^/]+\.condensed\.md$/` check **before** the generic
   `isInside('areas', …)` line (`build.ts:81`) — otherwise the artifact keeps resolving to `area`.
   `frontmatter-order.ts`'s `CANONICAL` gains a `condensed` order.
2. **Task kind.** `condense-area` into the `TaskKind` union (`src/shared/types/llm.ts:62`),
   `TASK_KINDS` and `TASK_DEFINITIONS` (`src/core/llm/tasks.ts`) with `sensitive: true`,
   `structured: true`, `streams: false`, `suggested: 'strong'`, plus `task.condense-area.label` /
   `.hint` in `i18n/de.ts` and `en.ts`. Routing/recommendation UI derives itself.
3. **Artifact model.** `src/core/condense/artifact.ts`: parse an existing artifact into
   frontmatter + sections + directives, compose a new one (headings via the extended
   `section-names.ts`, one `From: …` line per section, unknown frontmatter keys merged, directives
   carried over verbatim).
4. **Input selection.** `src/core/condense/inputs.ts`: deterministic, model-free — the area's
   notes section (`parseAreaNotes`, `index/areas.ts:110`), its todos (`parseTodos` over the todos
   section range), and day entries carrying `areas: [<slug>]` from story 036, bounded to the last
   ~90 days. Mirrors `mentions()` in `src/core/overview/status.ts`. Reports what it dropped.
5. **Prompt.** `src/core/llm/prompts/condense-area.ts` — input type, JSON schema, prompt builder;
   mirrors `project-status.ts`. Carries the artifact, the directives, the inputs, the ~2000-word
   soft cap and the no-invention rule.
6. **The run.** `src/core/condense/run.ts` — `condenseArea()` guards with
   `gateway.isAvailable('condense-area')`, selects inputs, calls `gateway.complete`, validates the
   returned per-section sources against what was read, composes, and returns a proposal. Writes
   nothing. Every failure path returns a typed result, never a partial artifact.
7. **Write helper.** `writeCondensedArea()` — `assertWritable` + `VaultStore.write({ expectedHash })`,
   so the trash copy and the `conflict` come from the existing path. 038 calls it from IPC.
8. Tests throughout, with `tests/fakes/llm.ts`'s `createFakeGateway` / `createEmptyGateway`.

## Deliverables

**D1 — `condensed` becomes a known vault file kind**
Files: `docs/VAULT-FORMAT.md`, `src/shared/types/vault.ts`, `src/core/index/build.ts`,
`src/core/vault/frontmatter-order.ts`, new `src/core/condense/paths.ts`
(`condensedAreaPath(slug)`, `isCondensedAreaPath`, `areaSlugFromCondensedPath`), new
`tests/core/condense/paths.test.ts`.
Accept: `docTypeFromPath('areas/health.condensed.md') === 'condensed'` while
`areas/health.md` still maps to `area`; VAULT-FORMAT.md states the dotted-file exception and the
new file kind incl. `condensed_at`; frontmatter order puts `type, title, condensed_at, sources`
first.

**D2 — the artifact's section headings exist in both document languages**
Files: `src/core/vault/section-names.ts` (add kinds `patterns`, `open`, `directives` to
`SectionKind`, `NAMES`, `ALIASES` — `state` is already there), `src/core/areas/sections.ts` if the
`Record<SectionKind, …>` widening requires it, `tests/core/vault/section-names.test.ts`.
Accept: `sectionNameFor('patterns', 'de'|'en')` returns the document-language word; existing
`notes`/`todos`/`state` behaviour unchanged (regression test).

**D3 — an artifact can be read and written back without loss**
Files: new `src/core/condense/artifact.ts`, new `tests/core/condense/artifact.test.ts`.
Mirror: `src/core/wiki/module.ts` (`overviewBody()`) for body composition, `src/core/areas/sections.ts`
for section ranges.
Accept: parse → compose round-trip preserves unknown frontmatter keys and the directives section
byte-for-byte; headings follow the document language; each of _state_ / _patterns_ / _open_ ends
with its `From:` source line; a composed artifact carries `condensed_at` and `sources:`.

**D4 — the task kind `condense-area` is routable and sensitive**
Files: `src/shared/types/llm.ts`, `src/core/llm/tasks.ts`, `src/renderer/i18n/de.ts`,
`src/renderer/i18n/en.ts`, `tests/core/llm/tasks.test.ts`.
Mirror: the `journal-chat` definition (`tasks.ts:100`).
Accept: the kind appears in the settings routing table without renderer changes, is marked
sensitive, recommends a local model, and `createEmptyGateway().isAvailable('condense-area')` is
`false`; i18n key coverage test stays green, German strings use `„…“`.

**D5 — input selection is deterministic and states what it dropped**
Files: new `src/core/condense/inputs.ts`, new `tests/core/condense/inputs.test.ts`.
Mirror: `mentions()` in `src/core/overview/status.ts`; consumes story 036's "list days by area
slug" capability and the `areas:` frontmatter key.
Accept: for a fixture vault the selector returns exactly the area's notes entries, its todos and
the day entries carrying the slug within the last ~90 days, in a stable order, with a doc comment
stating the bound; days outside the window and days without the slug are excluded and counted in a
`truncated` report; no model is involved.

**D6 — the prompt asks for three attributed sections under a soft cap**
Files: new `src/core/llm/prompts/condense-area.ts`, `src/core/llm/prompts/index.ts`, new
`tests/core/llm/prompts/condense-area.test.ts`.
Mirror: `src/core/llm/prompts/project-status.ts`.
Accept: the schema demands `state`, `patterns`, `open`, each `{ text, sources: string[] }`; the
prompt contains the current artifact, the directives section, the ~2000-word / ~12k-char target
with the instruction to compress rather than append, the rule that a claim not attributable to a
listed input is not written, and contradictions kept as contradictions inside _state_; headings
are requested in the document language.

**D7 — `condenseArea()` produces a proposal, or an honest refusal**
Files: new `src/core/condense/run.ts`, new `src/core/condense/index.ts`, new
`tests/core/condense/run.test.ts`.
Mirror: `suggestProjectStatus()` in `src/core/overview/status.ts:221` (read inputs → ask → return
a proposal, write nothing).
Accept: with the fake gateway a proposal comes back carrying the composed artifact, its base hash
and the `sources:` list; with `createEmptyGateway()` the run does not start and returns a
no-model result naming `condense-area`, writing nothing; an area with no inputs returns a
no-inputs result and no artifact content; a model reply whose section `sources` are not a subset
of the inputs read fails the run; a truncated selection puts the notice into the artifact body; a
test proves no network call is made.

**D8 — an accepted artifact can be written, hash-guarded**
Files: `src/core/condense/write.ts` (or the write function in `run.ts`'s module),
`tests/core/condense/write.test.ts`.
Mirror: `src/main/ipc/areas.ts`'s use of `assertWritable` + `VaultStore.write({ expectedHash })`.
Accept: writing produces exactly one `areas/<slug>.condensed.md`; a stale `expectedHash` throws
`VaultConflictError` with `code: 'conflict'` and leaves the file untouched; the existing trash copy
appears; a second write preserves the directives section and unknown keys of the file on disk.

**Coverage gate** — AC 1 → D1 + D8; AC 2 → D3 + D7; AC 3 → D2 + D3; AC 4 → D5; AC 5 → D5 + D7;
AC 6 → D6 + D7; AC 7 → D7 + D8; AC 8 → D3 + D8; AC 9 → D4; AC 10 → D4 + D7; AC 11 → D7.

## Model Hints

- D3 → `deliverable-hard` — a parse/compose round-trip that must preserve unknown frontmatter keys
  **and** a human-owned directives section across a rewrite is exactly where silent data loss hides.
- D7 → `deliverable-hard` — cross-module (gateway + selector + artifact) and carries guardrail 3:
  the deterministic source-subset check and the four distinct refusal paths are subtle logic, not
  wiring.
- D1, D2, D4, D5, D6, D8 → default tier.
- Review: → `story-review-hard` — this is the core story of the milestone and the first stage of a
  write path that may delete; a missed refusal path or a leaked unattributed sentence is not
  visible in a green test run.

## Test Plan (manual acceptance)

The story has no screen of its own (038 owns the surface), so acceptance is by tests — except for
the one user-visible change D4 makes in settings:

1. `npm run seed`, then start the app.
2. Settings → model routing: `condense-area` appears in the task list with its own provider/model
   assignment, is marked sensitive, and shows the local-model recommendation the way `journal-chat`
   does.
3. Switch the UI language to English and back: the label and hint are translated in both.
4. Leave `condense-area` unassigned and confirm the routing table shows it as unconfigured rather
   than falling back to another task's model.

## Done

Backend-only story, built deliverable by deliverable (D1–D8), all disjoint-file Ds (D5/D6)
delegated in parallel. `condense-area` is a new core module (`src/core/condense/`): a vault file
kind, an alias-tolerant artifact parser/composer, a deterministic 90-day input selector, a
routable+sensitive task kind, an attributed-sections prompt, the `condenseArea()` run (proposal
only, never writes), and a hash-guarded `writeCondensedArea()`. One `story-review-hard` pass found
one real acceptance gap (fixed) plus several polish findings (fixed); the live smoke pass through
the actual built app found one more real bug (missing i18n key) and it was fixed too.

**Decisions:**

- Notes are read `verbatim: true` (full note body), not the 240-char `excerpt` preview the
  selector's underlying `parseAreaNotes` defaults to — the reviewer caught that the excerpt path
  silently under-read the area's own notes while `sources:` still claimed the whole file, which
  is exactly the AC-5 gap ("where the run read only part of the available inputs, the artifact
  says so") the story guards against. Day entries were already passed through verbatim; notes now
  match.
- `areaSlugOf` in `src/core/condense/inputs.ts` was a duplicate of `areaSlug` (`src/core/index/
areas.ts`, previously unexported) — replaced with an import instead of carrying two
  implementations of the same rule (CLAUDE.md "reuse instead of copying").
- `writeCondensedArea()` does not create a trash copy on overwrite — confirmed this codebase's
  `VaultStore.write`/`writeText` never does (only explicit `delete()`/undo populates the trash),
  and the mirrored write path (`src/main/ipc/areas.ts`) has the same property. "No write path
  silently overwrites the user's edits" (CLAUDE.md) is upheld by the existing
  `expectedHash`/`mustNotExist` hash guard, not by a trash copy — adding trash-on-overwrite would
  be new machinery outside this sprint's Q5 decision ("no new protection machinery this sprint").
  Accepted as-is; a second write replaces the prior artifact with no recoverable copy beyond the
  hash guard against stale writes.
- D7 added one attribution rule beyond the story's literal wording: a section with non-empty text
  but an _empty_ `sources` array also fails the run (`reason: 'no-source'`). An uncited section
  cannot satisfy AC 3's "each section ends with the source paths it came from" and the
  requirement's "a sentence it cannot attribute... does not get written" — kept as in-scope, not
  creep, per the review's own read.
- `condensed_at` reuses `isoStamp` from `src/core/ingest/raw` (the repo's only ISO-with-offset
  formatter) rather than adding a second one.
- `preamble` and `extraSections` (free text / stray headings found in an existing artifact) are
  carried through verbatim on every compose, beyond the story's literal ask — this is what makes
  D3's parse→compose round-trip actually lossless for anything a human adds outside the four
  named sections, and is documented in `artifact.ts`'s own comments.
- Left two doc-comment occurrences of German-style quotes with a straight closer in
  `src/core/llm/prompts/condense-area.ts` (lines 2 and 11) unfixed — they are code comments, not
  runtime/UI strings, so CLAUDE.md guardrail 7 (which governs strings shown to the user) does not
  strictly apply; flagged here rather than silently left for the next person to trip over.

**Verification:** `npm run build`, `npm test` (227 files / 3230 tests), `npm run lint`,
`npm run typecheck` all green. One `npm test` run mid-story showed ~35 timeouts across unrelated
`tests/main/**` files with a cold transform cache; confirmed via `git stash` that the same
failures do not exist on `dev` and disappear on a warm-cache re-run — pre-existing
machine/CPU-contention flakiness, not a regression from this story's changes (no `src/main/**`
file was touched). Live smoke: drove the real built app via the project's harness
(`scripts/lib/app-harness.mjs`/`screens.mjs`) against the seeded demo vault, navigated to
Settings → model routing, and confirmed live (not just via source-reading) that `condense-area`
appears as its own row, is marked sensitive, recommends a local model, defaults to "no model"
without falling back to another task, and that its label/hint switch correctly between German and
English in the same running session. Found and fixed one real bug in that pass: the "no model
assigned" sub-line rendered the raw untranslated key `settings.fallback.condense-area` because it
was missing from `de-settings-models.ts`/`en-settings-models.ts` — added, both languages, coverage
test green.

**Commit message:**

```
037: an area can be condensed into one file
```
