---
id: 044
title: A project can be condensed into one file
status: done # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M14 (condensed layer, project level). The core of the milestone: the artifact, the run
and the honest no-model case, mirroring [[037-an-area-can-be-condensed-into-one-file]] for the
project level. Concept: [[../concepts/condensed-layer]] (CND-1, 3, 4, 5, 6, 9, 10, 11, 13, 14,
15, 16, 17, 28, 30, 31).

No screen in this story — the run produces a proposal, story 045 shows and confirms it.

## Requirement

A project collects notes, todos, waiting-on entries, agent sessions and journal mentions, and
none of it is gathered anywhere. Coming back to a project after a break means rereading all of
it. What is missing is the one file that says what currently holds, what the next step is, who I
am waiting on, and what I have learned — in prose I can read in a minute.

The app should be able to produce that file for a project: read the project's own state, its
notes, its todos and waiting-on entries, the linked agent sessions, and the journal entries
mentioning it, and write _state_, _next step_, _waiting on_ and _learned_ — each section ending
with the paths (including agent sessions) it was written from. It gets shorter as I get smarter:
a run may delete, and it compresses older material rather than appending to it.

It must not invent. A sentence it cannot attribute to one of the inputs it read does not get
written. Without a configured model for this task, the app says so plainly and writes nothing —
there is no mechanical fallback here, because a concatenation of excerpts presented as a
synthesis would assert knowledge nobody checked.

## Acceptance Criteria

- [x] A project with inputs can be condensed into exactly one artifact file belonging to that
      project; a project with no inputs produces no artifact and no placeholder.
- [x] The artifact carries `condensed_at` and a `sources:` list naming every input the run read,
      including agent sessions in a stable, resolvable citation form.
- [x] Its sections are _state_, _next step_, _waiting on_ and _learned_, with headings in the
      document language (not the UI language), and each section ends with the source paths it
      came from.
- [x] Input selection is deterministic and covers all four inputs: the linked agent sessions,
      `project.md` plus its notes, todos plus `waiting_on`, and journal entries mentioning the
      project. No model decides what it may read.
- [x] Where the run reads only part of the available inputs (a long transcript, a bounded
      window of mentions), the artifact states it.
- [x] A run respects a soft size target and compresses older material instead of appending.
- [x] A run that cannot complete leaves the artifact untouched and reports the failure — never a
      half-written file.
- [x] Unknown frontmatter keys and the directives section of an existing artifact survive a run
      untouched.
- [x] The task kind `condense-project` is independently assignable to a provider and model.
- [x] With no model configured for it, the run does not start, states which task kind is
      missing, and writes nothing.
- [x] Tests cover the run with the fake provider and with "no model configured", and a test
      proves nothing reaches a real network.

## Open Questions

- ~~Q1 — Is `condense-project` sensitive, like `condense-area`? The concept names journal content
  as the reason the area task is sensitive (§3), but §11 also lists journal mentions among the
  project's own inputs — the concept never says explicitly whether the project task should carry
  the same `sensitive: true` and local-model recommendation.~~ answered → Decisions (Sprint)
- ~~Q2 — Citation form for an agent session (concept open point O6): `agent:<kind>/<pathKey>` is
  a sketch, not a decision, and this is the first story that actually needs it. Is the sketch
  sufficient, and how does the UI resolve such a citation back to a session view?~~ answered →
  Decisions (Sprint)
- ~~Q3 — Soft size cap for the project artifact (concept open point O1): reuse the area's ~2000
  words / ~12k characters, or does a project — potentially with more transcript volume — need
  its own number?~~ answered → Decisions (Sprint)
- ~~Q4 — Input bounds (concept open point O3): how much of a long agent transcript, how many
  journal mentions, how far back. Numbers are undecided at the concept level.~~ answered →
  Decisions (Sprint)
- ~~Q5 — Contradictions on the project level (concept open point O4): the concept's default (§7)
  treats this as a rule for the _state_ section rather than its own section, same as the area —
  confirm, or does _learned_ absorb it instead?~~ answered → Decisions (Sprint)
- ~~Q6 — Human edit vs. rewrite on a project artifact: reuse the area's decision from story 037
  (flagged in the diff, the human decides each time, no new protection machinery) —
  confirm.~~ answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/sprint 12` clarification round, ahead of refine —
not in a later round. Binding.

- **(User)** Q1 — **sensitive: true**, same rationale as `condense-area`: §11 lists journal
  mentions among the project's own inputs, the same reason the concept gives for the area task's
  sensitivity (§3). `condense-project` joins `sensitiveTasks()` and the UI recommends a local
  model for it.
- **(User)** Q2 — **adopt the `agent:<kind>/<pathKey>` sketch as the citation form, and make it
  click-through.** The UI resolves such a citation back to the referenced agent session view,
  not just plain text.
- **(User)** Q3/Q4 — **reuse the area's numbers as-is**: ~2000 words / ~12k characters soft cap,
  `in: 8000 / out: 1200` token budget (`condense-project`'s task definition), 90-day window for
  journal mentions and day entries — same window constant as `CONDENSE_DAY_WINDOW_DAYS`. No
  evidence yet that a project needs a larger budget than an area; reuse until a real case proves
  otherwise.
- **(User)** Q5 — **confirm the concept's §7 default**: a contradiction on the project level is
  written into the _state_ section as prose, not a dedicated contradictions section. Matches the
  area's handling; only the module level gets its own _contradictions_ section.
- **(User)** Q6 — **confirm, reuse story 037's approach**: a human edit since the last
  condensation is flagged in the diff for the human to weigh each time; no new
  locking/protection machinery for the project artifact.

Taken at refine (2026-09-02) for everything the six user decisions above do not cover. Each with
its reason.

- D7 — the project artifact is **`projects/<scope>/<slug>/condensed.md`**, a plain file name inside
  the project folder, so no dotted-filename exception is needed (unlike the area's
  `areas/<slug>.condensed.md`, story 037 Q2) and the artifact sits next to `project.md` where the
  human already looks.
- D8 — the artifact reuses the existing **`condensed` `DocType`** and the existing
  `CANONICAL.condensed` frontmatter order (`src/core/vault/frontmatter-order.ts:47`), which is
  field-name-based and path-independent; a second synthesis type would split the type filter and
  the gardener exemptions 046 needs, for no gain.
- D9 — the shared machinery in `src/core/condense/` (`artifact.ts`, `sources.ts`, `directives.ts`,
  `diff.ts`, `apply.ts`, `write.ts`) is **parameterised, not copied**: the section set becomes an
  argument instead of the hardcoded `CONDENSED_SECTIONS`. Two artifact parsers over the same file
  format is exactly the drift CLAUDE.md's reuse rule exists to prevent.
- D10 — but the **prompt and the run stay per level** (`condense-project.ts`, `run-project.ts`).
  This answers the concept's §7 reversal trigger explicitly: the project prompt does carry rules
  the area prompt does not — four sections instead of three, plus the `agent:` citation form and
  the transcript bound — so per-level is not three copies of one thing and the decision does not
  flip. Recorded here because §7 asks for that evaluation at the second level.
- D11 — `run.ts` is already 362 lines, over CLAUDE.md's ~300 soft limit, so the project run gets
  its own `run-project.ts` and the attribution check plus the truncation notice move into shared
  helpers. `partialInputsNote()` is currently duplicated in `run.ts` and `src/main/ipc/condense.ts`;
  it is extracted once rather than written a third time.
- D12 — the **agent citation is emitted at agent-project granularity**: one
  `agent:claude/<pathKey>` entry per distinct linked agent project whose transcripts the run read,
  not one per session. That is literally the form the user fixed in Q2, and a per-session id was
  not part of it.
- D13 — `<kind>` is **`claude`** for now, because `src/core/claude/link.ts` is the only surface
  that links sessions to a vault project today (it is what `projects:suggestStatus` already uses);
  the parser accepts any kind token, so a later `codex` needs no format change.
- D14 — **transcript bound**: the run reads the tail page of the **3 most recently active linked
  sessions**, clamped per session to a character budget, and counts everything dropped in the
  truncation report. Three mirrors `MAX_CONTEXT_ENTRIES` in `src/core/overview/status.ts:44`, and
  a 128 KiB `TRANSCRIPT_PAGE_BYTES` page per session would blow the 8000-token input budget the
  user fixed in Q3. The bound is stated in a doc comment, per the contradiction check's precedent.
- D15 — **journal mentions reuse the matching predicate of `mentions()`**
  (`src/core/overview/status.ts:132`) — frontmatter `projects[]` slug or title in body — but with
  the 90-day window and the full day-entry text, not `mentions()`'s 3-entry / 400-char preview
  clamp, which exists for the status suggestion and would silently under-read here. The predicate
  is exported and shared rather than reimplemented.
- D16 — **project notes are read verbatim** as the documents under
  `projects/<scope>/<slug>/notes/`, plus `project.md`'s state section via `stateSection()`. There
  is no `parseProjectNotes` and no `verbatim` option on the project side; reading an excerpt while
  `sources:` claims the whole file is precisely the AC-5 gap the area story had to fix afterwards.
- D17 — **todos and `waiting_on` are taken open _and_ closed/resolved with their dates**, per
  concept §11, because the artifact is a re-entry briefing: what got done and what stopped waiting
  are part of the state. `openTodosOf`/`openWaiting` are therefore not the right helpers here.
- D18 — `source_hashes` covers **vault documents only**. An agent session is outside the vault and
  has no vault hash, so it appears in `sources:` but not in `source_hashes`; 046's staleness check
  compares hashes for the vault inputs and activity timestamps for the sessions.
- D19 — 044 also ships **`projectInputs()`**, the document inventory that records the input
  hashes, because the run needs it anyway to write `source_hashes`. 046 consumes it; it is not a
  second implementation there. Mirrors `areaInputs()` in `inputs.ts`.
- D20 — **no new IPC channel and no screen in 044**, mirroring the 037/038 split: the run returns a
  proposal and the hash-guarded write helper ships here so AC 1 is testable, while trigger, diff,
  accept, reject and delete stay in 045. The one user-visible change 044 makes is the
  `condense-project` row in the settings routing table, and that is what the manual test plan
  covers (P1 is satisfied because the story has no other user-facing capability).
- D21 — the soft-cap constants move into `src/core/llm/prompts/shared.ts` and are reused by both
  condense prompts instead of a second pair of numbers, so Q3's "reuse the area's numbers" cannot
  drift apart later.

## Plan

Backend only — no screen (045 owns the surface). No new core module: `src/core/condense/` is
generalised from area-only to level-aware, plus one new task kind and one new artifact path.

1. **Path & file kind.** `condense/paths.ts` gains `condensedProjectPath(scope, slug)`,
   `isCondensedProjectPath`, `projectRefFromCondensedPath`. `docTypeFromPath`
   (`src/core/index/build.ts:81`) gets a `^projects/[^/]+/[^/]+/condensed\.md$` check **before**
   the generic `isInside('projects', …)` branch, or the artifact keeps resolving to `project`.
   `docs/VAULT-FORMAT.md` gains the new file kind after the project section.
2. **Section names.** `src/core/vault/section-names.ts` gains the kinds `next-step`,
   `waiting-on`, `learned` (names + folded aliases, de/en). Every exhaustive
   `Record<SectionKind, …>` widens with it.
3. **Artifact, parameterised.** `condense/artifact.ts`'s hardcoded `CONDENSED_SECTIONS` becomes an
   argument: `PROJECT_SECTIONS = ['state','next-step','waiting-on','learned']` alongside the
   existing area set. Round-trip, unknown-key merge and the directives carry-over stay one
   implementation.
4. **Task kind.** `condense-project` into the `TaskKind` union (`src/shared/types/llm.ts`),
   `TASK_KINDS` + `TASK_DEFINITIONS` (`src/core/llm/tasks.ts`) with `sensitive: true`,
   `structured: true`, `suggested: 'strong'`, `{ in: 8000, out: 1200 }`; `task.condense-project.*`
   and `settings.fallback.condense-project` in all four i18n files.
5. **Agent citation.** New `condense/agent-ref.ts`: build and parse `agent:<kind>/<pathKey>`
   (`pathKey` from `src/core/claude/paths.ts:39`). Exported for 045's click-through.
6. **Input selection.** New `condense/inputs-project.ts`: deterministic, model-free, four inputs —
   `project.md`'s state section + `notes/` verbatim, todos + `waiting_on` (open and closed),
   journal mentions in the last 90 days (`CONDENSE_DAY_WINDOW_DAYS`), and the tail page of the 3
   most recent linked agent sessions. Reports what it dropped; plus `projectInputs()` for hashes.
7. **Prompt.** New `src/core/llm/prompts/condense-project.ts` — four attributed sections, the
   shared ~2000-word / ~12k-char cap with "compress, do not append", the no-invention rule,
   contradictions folded into _state_, and the `agent:` citation form as a legal source token.
8. **The run.** New `condense/run-project.ts` — `condenseProject()` guards
   `gateway.isAvailable('condense-project')`, selects inputs, calls `gateway.complete`, checks the
   per-section sources against what was read, composes, returns a typed proposal. Writes nothing.
   `condense/write.ts` generalises to any artifact path; attribution + truncation notice become
   shared helpers the area run then uses too.
9. Tests throughout, with `tests/fakes/llm.ts`'s `createFakeGateway` / `createEmptyGateway`.

## Deliverables

**D1 — the project artifact is a known vault file kind**
Files: `src/core/condense/paths.ts`, `src/core/index/build.ts`, `docs/VAULT-FORMAT.md`,
`tests/core/condense/paths.test.ts`.
Mirror: the area half of the same three files (story 037 D1).
Accept: `docTypeFromPath('projects/work/nyota/condensed.md') === 'condensed'` while
`projects/work/nyota/project.md` still maps to `project` and `projects/work/nyota/notes/x.md`
is unchanged; `condensedProjectPath`/`projectRefFromCondensedPath` round-trip a scope+slug;
VAULT-FORMAT.md documents the file kind incl. `condensed_at`, `sources:` and the four sections.

**D2 — the four project section headings exist in both document languages**
Files: `src/core/vault/section-names.ts`, plus whatever the `Record<SectionKind, …>` widening
breaks (`src/core/areas/sections.ts`, `src/core/condense/artifact.ts`),
`tests/core/vault/section-names.test.ts`.
Accept: `sectionNameFor('next-step'|'waiting-on'|'learned', 'de'|'en')` returns the
document-language heading; folded aliases recognise both languages; existing
`notes`/`todos`/`state`/`patterns`/`open`/`directives` behaviour unchanged (regression test).

**D3 — one artifact parser serves both levels**
Files: `src/core/condense/artifact.ts`, `src/core/condense/index.ts`,
`tests/core/condense/artifact.test.ts`, new `tests/core/condense/artifact-project.test.ts`.
Accept: the section set is a parameter, `CONDENSED_SECTIONS` (area) and `PROJECT_SECTIONS` are both
supported, and every existing area assertion still passes untouched; a project artifact
parse → compose round-trip preserves unknown frontmatter keys, the directives section, the
preamble and stray sections byte-for-byte; each of the four sections ends with its source line;
`condensed_at` and `sources:` are written in the canonical order.

**D4 — the task kind `condense-project` is routable and sensitive**
Files: `src/shared/types/llm.ts`, `src/core/llm/tasks.ts`, `src/renderer/i18n/de.ts`,
`src/renderer/i18n/en.ts`, `src/renderer/i18n/de-settings-models.ts`,
`src/renderer/i18n/en-settings-models.ts`, `tests/core/llm/tasks.test.ts`.
Mirror: the `condense-area` definition (`src/core/llm/tasks.ts:126`).
Accept: the kind appears in the settings routing table with no renderer list hand-edited, is
marked sensitive with the local-model recommendation, carries `{ in: 8000, out: 1200 }` and
`structured: true`; `createEmptyGateway().isAvailable('condense-project')` is `false`;
`settings.fallback.condense-project` exists in **both** languages (037 shipped this key missing and
only the live smoke caught it); the i18n coverage test stays green and German strings use the
low-high quote pair.

**D5 — an agent session has a stable, parseable citation form**
Files: new `src/core/condense/agent-ref.ts`, `src/core/condense/index.ts`, new
`tests/core/condense/agent-ref.test.ts`.
Accept: `agentRef('claude', pathKey(cwd))` yields `agent:claude/<pathKey>`; the parser returns
`{ kind, pathKey }` for a valid ref and `null` for a vault path or a malformed token, so one source
list can hold both shapes without ambiguity; the form is stable across a cwd that differs only in
separator or case (whatever `pathKey` already normalises).

**D6 — project input selection is deterministic and states what it dropped**
Files: new `src/core/condense/inputs-project.ts`, `src/core/overview/status.ts` (export the
mention predicate), `src/core/condense/index.ts`, new `tests/core/condense/inputs-project.test.ts`.
Mirror: `src/core/condense/inputs.ts` (area selector, `CONDENSE_DAY_WINDOW_DAYS`) and
`mentions()` / `stateSection()` in `src/core/overview/status.ts`.
Accept: for a fixture project the selector returns, in a stable order, `project.md`'s state
section, every note under `notes/` **verbatim** (not an excerpt), all todos of the project open
and closed with their dates, all `waiting_on` entries resolved and unresolved, the day entries
mentioning the project within 90 days in full, and the transcript tails of at most the 3 most
recent linked sessions; days outside the window, sessions beyond the third and clamped transcript
bytes are excluded **and counted** in the truncation report; a doc comment states each bound; no
model and no gateway are involved; `projectInputs()` returns the vault documents to hash, without
the agent sessions.

**D7 — the prompt asks for four attributed sections under the shared soft cap**
Files: new `src/core/llm/prompts/condense-project.ts`, `src/core/llm/prompts/shared.ts`
(hoist the cap constants), `src/core/llm/prompts/condense-area.ts` (re-export them),
`src/core/llm/prompts/index.ts`, new `tests/core/llm/prompts/condense-project.test.ts`.
Mirror: `src/core/llm/prompts/condense-area.ts`.
Accept: the schema demands `state`, `next-step`, `waiting-on`, `learned`, each
`{ text, sources: string[] }`; the prompt carries the current artifact, its directives as
read-only context, the four input groups, the ~2000-word / ~12k-char target with the instruction
to compress rather than append, the rule that a claim not attributable to a listed input is not
written, contradictions kept as contradictions inside _state_, and `agent:<kind>/<pathKey>` named
as a legal source token; headings are requested in the document language; the area prompt's own
test stays green.

**D8 — `condenseProject()` produces a proposal, or an honest refusal, and can be written**
Files: new `src/core/condense/run-project.ts`, `src/core/condense/write.ts` (generalise to any
artifact path), new `src/core/condense/attribution.ts` + `src/core/condense/notice.ts` (extracted
from `run.ts`), `src/core/condense/run.ts` (use the extracted helpers),
`src/core/condense/index.ts`, new `tests/core/condense/run-project.test.ts`,
`tests/core/condense/write.test.ts`.
Mirror: `src/core/condense/run.ts` (`condenseArea`) one-to-one for the result union and the guard
order.
Accept: with the fake gateway a proposal comes back carrying the composed artifact, its base hash,
the `sources:` list including the `agent:` refs, and `source_hashes` for the vault inputs only;
with `createEmptyGateway()` the run does not start, returns a no-model result naming
`condense-project`, and writes nothing; a project with no inputs returns a no-inputs result and no
artifact file; a reply whose section `sources` are not a subset of the inputs read, or whose
non-empty section has an empty `sources`, fails the run; a truncated selection puts the notice into
the artifact body; a failing run leaves an existing artifact byte-identical; writing produces
exactly one `projects/<scope>/<slug>/condensed.md`, a stale `expectedHash` throws
`VaultConflictError` with `code: 'conflict'`, and a second write preserves the on-disk directives
section and unknown keys; a test proves no network call is made (stub `globalThis.fetch`), and the
area run's own tests stay green after the extraction.

**Coverage gate** — AC 1 → D1 + D8; AC 2 → D3 + D5 + D8; AC 3 → D2 + D3 + D7; AC 4 → D6;
AC 5 → D6 + D8; AC 6 → D7 + D8; AC 7 → D8; AC 8 → D3 + D8; AC 9 → D4; AC 10 → D4 + D8;
AC 11 → D8.

## Model Hints

- D3 → `deliverable-hard` — turning the shipped area parser's hardcoded section set into a
  parameter touches a lossless round-trip that already guards unknown frontmatter keys and a
  human-owned directives section: a regression there loses the user's own text silently.
- D6 → `deliverable-hard` — four input sources across `index/`, `overview/status.ts` and
  `claude/`, each with its own bound; the failure mode is silent under-reading while `sources:`
  claims the whole input, which is exactly the bug the area story shipped and had to fix.
- D8 → `deliverable-hard` — cross-module (gateway + selector + artifact + store), carries
  guardrail 3's deterministic source-subset check and five distinct refusal paths, and it
  refactors helpers out of the shipped `run.ts` that the area run keeps using.
- D1, D2, D4, D5, D7 → default tier.
- Review: → `story-review-hard` — core story of the milestone, it modifies a shipped write path
  that may delete text, and a missed refusal path or an unattributed sentence does not show up in
  a green test run.

## Test Plan (manual acceptance)

The story has no screen of its own (045 owns the surface), so acceptance is by tests — except for
the one user-visible change D4 makes in settings, which is checked through the real UI:

1. `npm run seed`, then start the app.
2. Settings → model routing: `condense-project` appears as its own row in the task list with its
   own provider/model assignment, is marked sensitive, and shows the local-model recommendation
   the way `condense-area` and `journal-chat` do.
3. Leave `condense-project` unassigned: the row states it is unconfigured with a translated
   sentence (not a raw `settings.fallback.condense-project` key) and does not fall back to another
   task's model.
4. Switch the UI language to English and back: label, hint and the unconfigured sentence are
   translated in both.

## Done

A project can now be condensed into `projects/<scope>/<slug>/condensed.md`, mirroring the shipped
area-level machinery. `src/core/condense/` was generalised from area-only to level-aware
(D1-D3, D9): `condense/artifact.ts`'s section set is a parameter (`CONDENSED_SECTIONS` for areas,
`PROJECT_SECTIONS` for projects), so one parser/composer serves both. New: the `condense-project`
task kind (sensitive, `{in: 8000, out: 1200}`), the `agent:<kind>/<pathKey>` citation form for a
linked Claude session (`condense/agent-ref.ts`), deterministic project input selection
(`condense/inputs-project.ts`) over four bounded groups, the four-section prompt
(`llm/prompts/condense-project.ts`), and the run + hash-guarded write (`condense/run-project.ts`,
generalised `condense/write.ts`). No IPC, no screen — backend only, per D20; the one user-visible
change is the `condense-project` row in the settings routing table (verified live, see below).

**Verification**

- `npm run build`, `npm test` (3500/3500), `npm run lint`, `npm run typecheck`: all green.
- `npm run format:check`: green on every file this story touched; flags `docs/ROADMAP.md` and
  `docs/sprints/done/S11/review.md`, both pre-existing and untouched by this story (confirmed via
  `git status`).
- Live smoke (`npm run seed && npm run shot`): `.screenshots/33-settings-models-bottom.png` shows
  „Projekt verdichten" as its own row, marked „Groß"/„Persönlich", with the translated unconfigured
  sentence „Ohne Modell: Die Projektseiten bleiben, wie sie sind" (not a raw key) — test-plan steps
  1-3 confirmed through the real UI. Step 4 (English/German round-trip) is covered by the automated
  i18n parity test (`tests/renderer/i18n.test.ts`, green) rather than a second screenshot: the
  language switch is the same generic mechanism every other task row already uses, not custom code
  this story adds.
- Clean-agent review (`story-review-hard`, two rounds): round 1 verdict FAIL with 6 findings;
  round 2 (verifying the round-1 fixes) verdict CONCERNS with 5 further findings. All findings
  from both rounds were fixed except two, documented below with reasoning. Final state: all fixes
  verified, full suite green.

**Findings fixed across two review-fix cycles**

- F1 — `agent:<kind>/<pathKey>` citations built from a POSIX session cwd (`pathKey()` keeps a
  leading `/`) were corrupted by `toVaultPath()`'s empty-segment collapsing inside the attribution
  check, failing every non-Windows session's citation. Fixed in `condense/attribution.ts`:
  `readSection()` now passes an agent ref through unchanged (`parseAgentRef` recognizes it) instead
  of normalising it as a vault path.
- F2 — the prompt's own per-item character cap (`condense-project.ts`'s `itemLines`) silently
  shortened what the model saw of a verbatim-read input, uncounted, so the artifact could claim a
  full read while the model saw only part. Fixed: `promptItemsClampedChars()` sums what the cap
  drops; `run-project.ts` folds it into the truncation notice (`notice.ts`'s `projectTruncationNotice`
  gained a `promptClampedChars` parameter) even when D6's own selector found nothing to drop.
- F5 — `deriveIndex()` parsed todos out of every doc regardless of `docType`, and since a project's
  `condensed.md` lives inside `projects/<scope>/<slug>/`, a `- [ ]`-looking line the model wrote as
  prose became a phantom duplicate open todo of that project. Fixed: `deriveIndex()` now skips
  `docType === 'condensed'` docs. The same defect existed in `deriveProjects()`'s `touchesByDir()`
  (found in review round 2): writing `condensed.md` was resetting the project's own `lastTouch`/
  `ageDays`/`stale`, making a condensation run make an untouched project look freshly worked on.
  Fixed with the same `docType !== 'condensed'` filter.
- F4 (round 1: documented as inherited; round 2: reviewer showed a real in-file fix existed) —
  `inputs-project.ts`'s `linkedSessions()` matched a session to a project by slug only, unlike
  `todosOf()` in the same file, which deliberately matches by folder path to avoid a same-slug,
  different-scope collision. The round-2 reviewer correctly pointed out that `Project.repos` and
  `session.cwd` (already used elsewhere in this file via `pathKey`) make a scope-correct guard a
  local, in-file fix, not an upstream `ClaudeSession`/`link.ts` change. Fixed: `belongsToProject()`
  additionally requires `session.cwd` to lie under one of the project's `repos` when any are named,
  falling back to slug-only when the project names none (matching `link.ts`'s own fallback).
- Round-2 finding on `promptItemsClampedChars` — it counted `item.text.length` while the `clamp()`
  it mirrors trims first, so a body with a trailing newline was reported as "trimmed" when it was
  not. Fixed to count `item.text.trim().length`, matching `clamp()` exactly.
- Round-2 finding on `notice.ts` — `projectTruncationNotice()` could render a malformed sentence
  ("…: were left out.") if ever called with nothing to report; every current caller already guards
  this, but the function is barrel-exported. Added a defensive empty-parts early return. Also
  unified the two condense prompts' previously-duplicated `1500`-character item cap into one
  `CONDENSE_ITEM_CHARS` constant in `llm/prompts/shared.ts` (`condense-area.ts` and
  `condense-project.ts` both reuse it now).
- F6 — `docs/VAULT-FORMAT.md`'s "Condensed project" section had a stale "later deliverable"
  sentence (D8 shipped the run in this same story) and did not document the `agent:` citation form.
  Rewritten to state the actual `source_hashes` scope, the citation form, and the four-input-group
  selection with its bounds.

**Findings reviewed and deliberately left unfixed**

- F3 — the three new `SectionKind` values (`next-step`, `waiting-on`, `learned`) are recognised
  vault-wide by `section-migration.ts` (the document-language migration scans every `.md` file for
  any known `##` heading), so a human's own note using a heading like "Next step" could be
  folded/renamed by an unrelated language-migration run. Verified this is not new: commit `b41ee19`
  (story 037) added `state`/`patterns`/`open` to this exact same globally-scanned enum with no
  carve-out, so 044 mirrors established precedent rather than introducing a new class of risk.
  Retroactively redesigning that precedent is out of this story's scope. Worth a note for whoever
  next touches `section-migration.ts`: "Next step"/"Learned" are more common free-form headings than
  "Direktiven"/"Muster", so this raises the *probability* of the accepted risk, even though its
  nature is unchanged.

**Deviations from the plan**

- `src/core/index/build.ts`'s `deriveIndex()` and `src/core/index/projects.ts`'s `touchesByDir()`
  were not in D1's file list but needed the same one-line `docType !== 'condensed'` guard D1
  already applied to `docTypeFromPath` — both are index-derivation code paths D1's own file kind
  change made reachable in a new way (see F5 above).
- `src/core/llm/prompts/shared.ts` gained `CONDENSE_ITEM_CHARS` beyond the two soft-cap constants
  D7/D21 already planned to hoist there — same rationale (one number instead of two that can
  drift), found necessary during review rather than at plan time.
- `src/core/condense/inputs-project.ts`'s `linkedSessions()` gained a `repos`-aware guard beyond
  D6's own file list — see F4 above.

Commit message: `044: a project can be condensed into one file`
