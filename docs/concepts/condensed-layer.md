# Condensed layer — Concept

Status: **Draft** (vision + requirements, no stories yet). This document fixes what the
Second Brain's condensed layer is: one machine-written synthesis artifact per unit —
per knowledge module, per project, per area — rewritten section by section by a model,
proposed as a diff, confirmed by the human. It replaces the append-only bullet
mechanism that `wiki/overview.md` uses today, and it names the one thing the app has
been missing: the layer where captured material becomes knowledge that grows instead
of accumulating.

This document follows the architecture rules in [CLAUDE.md](../../CLAUDE.md): the files
stay the truth (the artifact is a Markdown file in the vault, not an index entry), the
AI proposes and the human confirms (guardrail 2), every statement carries evidence
(guardrail 3), and the app stays usable without a model (guardrail 1). It builds on
[systems/navigation.md](../systems/navigation.md), which already reserves a **Project knowledge**
tab for exactly this, and on [MODULE-SCHEMA.md](../MODULE-SCHEMA.md), whose
`wiki/overview.md` is the one existing instance of the layer.

---

## TL;DR

- **Vision.** Three areas already collect material — journal + notes, projects,
  knowledge modules. What is missing is the layer above them: for every unit, one
  file that answers "what do I know about this" in prose, not a protocol.
- **One mechanism, three artifacts.** Module, project and area each get their own
  condensed file. A single global condensation was rejected: a summary of summaries is
  neither citable nor reviewable.
- **Section-wise rewrite.** The model reads the existing artifact _and_ the inputs and
  rewrites individual sections. Today's `wiki/overview.md` appends one bullet per
  ingest and never shows the model what is already there — that is a changelog, and it
  is replaced.
- **The run is pulled, not pushed.** A gardener check reports "condensation due"; the
  human triggers it inside the unit. Nothing condenses on its own.
- **Confirmed as a diff.** Old versus new, accept or reject. Hash-guarded write, undo
  copy in `.secondbrain/trash/`.
- **A rejection carries a reason**, and the reason is appended to a **directives**
  section inside the artifact that the model reads on the next run and never writes.
  That is the layer's own learning loop — and the only history that is kept.
- **Evidence twice over:** `sources:` in the frontmatter (the existing `addSources`
  mechanism) plus one source line per section.
- **Soft size cap per artifact**, so a run has to compress older material instead of
  appending. The number is not decided yet.
- **Journal feeds areas.** Day close starts proposing `areas: [<slug>]` for a day
  entry — the link does not exist today.
- **Three task kinds** — `condense-module`, `condense-project`, `condense-area` — so
  the area condensation, which sees journal content, can be routed to a local model
  while the module condensation is not.
- **No log.** `condensed_at`, `sources:`, the directives section and the trash copy are
  the record. A log nobody reads and that grows forever is ballast.
- **Biggest open points:** the exact size cap, the `type:` of the new artifacts, the
  file name for the area artifact (dots collide with the filename rule), and whether
  per-level sections survive contact with the second implementation.

---

## 1. Vision

The app is good at taking things in. A hotkey, a text field, Enter — and the material
lands in `inbox/`, gets filed into a project, a day entry, an area, or a knowledge
module. What happens after that is: nothing. The material sits where it was filed.

The condensed layer is the part that makes it a _brain_ rather than an archive. For
every unit you care about there is one file that says what currently holds, what is
still open, and where the sources disagree — in prose, short enough to read in a
minute, written from everything that unit has collected. You open it when you come
back to a subject after three weeks, and you do not have to reread twenty notes.

The feel: **the artifact gets shorter as you get smarter.** Not longer. A condensation
run that only appends has failed. What the run does is decide what still matters and
say it in fewer words — with the source path attached, so you can always go back down.

And it never surprises you. The maintenance screen says a condensation is due, you
trigger it when you are in the subject anyway, you read the diff, and you accept it or
you say why not. What you say sticks, and the next run has read it.

## 2. Goals

- **G1** — One condensed artifact per unit: per knowledge module, per project, per
  area. Readable standalone, without its sources.
- **G2** — Condensation compresses. A run may shorten and delete, not only add.
- **G3** — Every statement in an artifact is traceable to the files it came from.
- **G4** — The artifact is machine-written, and the human's own files stay untouched by
  it. No condensation run writes into `project.md`, `areas/<slug>.md`, or a wiki page.
- **G5** — The human decides _when_, and the human decides _whether_. The app only
  reports that something is due.
- **G6** — A rejection teaches the layer. The reason is kept and applied next time.
- **G7** — One mechanism, so the three levels do not drift: one run shape, one diff
  view, one write path, one freshness rule.
- **G8** — Journal content becomes reachable for condensation, thematically rather
  than chronologically.
- **G9** — The artifacts are cut so that a later MCP server can expose one resource per
  unit without reshaping them.

### Non-goals (deliberately out)

- **A global "my brain" artifact.** Considered and rejected in the interview: its only
  ordering would be chronological, and the journal already is that. Retrieval goes
  through areas.
- **A separate journal digest** (weekly/monthly). Rejected for now — the area
  artifact is the answer to "what do I know about X"; "how was my month" is a
  different question and does not get an artifact in this concept.
- **Automatic condensation.** No threshold, no background run, no schedule. Same
  reasoning as the filing threshold that [CONCEPT.md](../CONCEPT.md) removed under
  "Out of scope": a write nobody looked at is not a confirmation.
- **A condensation log.** See §10.
- **The MCP server itself.** §14 is an outlook that constrains the artifact shape, not
  a set of requirements.
- **Cross-unit condensation.** Nothing condenses across two projects, or across a
  project and a module. The link between units stays what it is today: frontmatter
  (`modules:`, `projects:`, `areas:`) and wikilinks.
- **Vector search / embeddings** for input selection. Out of scope per CLAUDE.md;
  input selection is deterministic (§11) plus the existing search.

## 3. Design decisions taken (from the requirements interview)

| Topic                     | Decision                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Granularity               | One artifact **per unit** (module, project, area), not one global condensed layer. A summary of summaries is not citable (guardrail 3) and not reviewable (guardrail 2).                    |
| "my brain" unit           | **Per area**, answering "what do I know about X". Journal entries are an _input_, not a target. A single brain artifact and an additional journal digest were both rejected.                |
| Write mechanism           | **Section-wise rewrite**: the model reads the current artifact _and_ the new inputs and rewrites individual sections. Not append-only, not full regeneration.                               |
| Fate of today's mechanism | **Replace.** `updateOverview()` stops appending bullets and `overviewChange` leaves the ingest prompt; `wiki/overview.md` is written only by a condensation run.                            |
| Storage                   | **Its own file per unit**, so no run ever writes into a file the human writes into. Modules already work this way.                                                                          |
| Trigger                   | **Maintenance proposes, the human triggers.** A gardener check reports "condensation due"; the run starts in the unit.                                                                      |
| Confirmation              | **Diff proposal** (old vs. new), accept or reject. Never a silent write.                                                                                                                    |
| Sections                  | **Per level**, not uniform across the three (tendency, see §7 for the reversal trigger).                                                                                                    |
| Size                      | **Soft cap per artifact**; over it, the run must compress instead of append (tendency, see §6 for the reversal trigger). Number not decided.                                                |
| Evidence                  | **`sources:` in frontmatter** (existing `addSources` mechanism) **plus one source line per section**.                                                                                       |
| Task kinds                | **Three**: `condense-module`, `condense-project`, `condense-area` — so the area run, which sees journal content, can be routed to a local model independently.                              |
| Project inputs            | **All four**: agent sessions, project notes + state section, todos + `waiting_on`, journal entries mentioning the project.                                                                  |
| Journal → area link       | **Day close proposes `areas: [<slug>]`** in the day entry's frontmatter, alongside the existing `projects:`, `people:`, `tags:`.                                                            |
| Rejection                 | **Rejection carries a reason**, kept and fed into the next run's prompt. Chosen over a bare "dismissed" because a dismissal without a reason is neither explainable nor traceable.          |
| Where the reason lives    | A **directives section inside the artifact**, human-editable, read by the model and never written by it.                                                                                    |
| History                   | **No log.** `condensed_at` + `sources:` + the directives section + the trash copy. A log nobody reads and that grows without bound is ballast; a capped log is not a log.                   |
| Without a model           | **Honestly empty** plus a link into settings. No heuristic fallback — a mechanically concatenated "condensation" would assert knowledge nobody checked.                                     |
| UI location               | **Trigger and read inside the unit**; the maintenance screen only reports due-ness and links there. Mirrors `unprocessedSourceCheck`, whose fix writes nothing and opens the place instead. |
| MCP                       | **Outlook section only.** No requirements, so the artifact shape is not decided against it.                                                                                                 |

## 4. Core terms & model

- **Unit** — the thing being condensed: one knowledge module, one project, one area.
  Three levels, one mechanism.
- **Inputs** — the files (and agent sessions) belonging to a unit. Always the truth.
  Never modified by a condensation run.
- **Artifact** — the machine-written condensed file of a unit. Deletable without loss:
  it can be regenerated from the inputs (the directives section is the one exception,
  see §10).
- **Run** — one condensation: read artifact + directives + inputs, produce a proposal.
- **Proposal** — the diff. Accepted → hash-guarded write. Rejected → a reason.
- **Directives** — human sentences inside the artifact that steer the next run.
- **Due-ness** — a deterministic statement that inputs are newer than the artifact.

```
inputs (files — the truth)                       artifact (machine-written)
────────────────────────────────────────         ─────────────────────────────────
modules/<slug>/wiki/{sources,entities,
  concepts}/*.md                          ──▶    modules/<slug>/wiki/overview.md

projects/<scope>/<slug>/project.md
  (state section, todos, notes, waiting_on)
projects/<scope>/<slug>/notes/*.md        ──▶    projects/<scope>/<slug>/condensed.md
agent sessions (~/.claude, ~/.codex)
journal entries mentioning the project

areas/<slug>.md (notes + todos sections)
journal entries with areas: [<slug>]      ──▶    areas/<slug>.condensed.md
```

The run:

```
gardener run ──▶ finding "condensation due" ──▶ opens the unit
                                                      │
                                          human triggers the run
                                                      │
                       read artifact + directives + inputs (deterministic selection)
                                                      │
                            LLM condense-<level> rewrites whole sections
                                                      │
                                    diff proposal (old ▏ new)
                                    │                        │
                                 accept                   reject + reason
                                    │                        │
                    hash-guarded write to the        reason appended to the
                    artifact; condensed_at,          directives section;
                    sources: updated; undo           artifact unchanged
                    copy in .secondbrain/trash/
```

## 5. The artifact

One file per unit, machine-written, with frontmatter:

```markdown
---
type: <see open point O2>
title: Nyota Auth0 Migration — synthesis
condensed_at: 2026-08-18T09:14:22+02:00
sources:
  - projects/work/nyota-auth0-migration/project.md
  - journal/2026/08/2026-08-04.md
  - agent:claude/c--development-kunde-nyota
---

## <state>

The migration is blocked on the role mapping. Two role models are in
circulation — the one from the June concept and the one Stefan's feedback
implies; they differ in how service accounts are treated.

From: projects/work/nyota-auth0-migration/project.md, journal/2026/08/2026-08-04.md

## <waiting on>

Stefan, on approval of the role concept, since 2026-08-04, was due 2026-08-12.

From: projects/work/nyota-auth0-migration/project.md

## <directives>

Do not put the Stefan escalation in here — that is a todo, not knowledge.
```

Rules:

- **Headings go through the document language**, like everything else in the vault
  (`phrases(language)` in `src/core/wiki/module.ts`, `HEADINGS` in
  `src/core/areas/sections.ts`). The section names in §7 are the concepts, not the
  literal strings.
- **A run rewrites section bodies. It never touches the directives section**, and it
  never touches unknown frontmatter keys — writes merge, per VAULT-FORMAT.md.
- **An artifact with no inputs does not exist.** No placeholder file, no empty
  synthesis. Same rule the module overview already follows on creation, and the same
  reasoning as the maintenance health score that is never invented.
- **The artifact is exempt from the checks that punish restatement.** `orphanCheck`
  already exempts `type: overview` (`src/core/gardener/checks/orphan.ts:38`) and
  `nearDuplicateCheck` already excludes it
  (`src/core/gardener/checks/near-duplicate.ts:18`), because a synthesis restates its
  own sources by design. The two new artifacts need the same exemption.

## 6. The run and the size cap

A run is: **read the artifact, read the directives, read the inputs, rewrite the
sections that changed.** Three things follow.

**The model sees the artifact.** This is the point of departure from today: the ingest
prompt's `knownPages()` explicitly filters out the overview
(`src/core/wiki/ingest.ts:65`), so the model has never known what it was adding to.
Section-wise rewriting is impossible without that read.

**A run may delete.** Compression means dropping what no longer matters. So the diff has
to show removals as prominently as additions, and the undo copy is not optional.

**Soft cap per artifact.** The run gets a target size; over it, the prompt requires
compressing older material rather than appending. The number is a placeholder — not
decided (open point O1).

> **Reversal trigger for the soft cap.** If the first cap-triggered rewrite produces a
> diff that touches every section at once, the proposal stops being reviewable and the
> human will accept it blind. If that happens in practice, the decision flips to
> per-section caps, which bound each diff to one section.

**Failure is not partial.** A run either produces a complete proposal or it fails
visibly. No half-written artifact — the write happens once, atomically
(`writeFileAtomic`), against the hash the proposal was built from. A stale hash means
the human edited the artifact meanwhile: the proposal is discarded with a `conflict`,
not merged.

## 7. Sections per level

Each level gets the sections that fit its purpose. Concepts, not literal headings:

| Level       | Sections                                         |
| ----------- | ------------------------------------------------ |
| **Module**  | _decided_ · _open_ · _contradictions_            |
| **Project** | _state_ · _next step_ · _waiting on_ · _learned_ |
| **Area**    | _state_ · _patterns_ · _open_                    |

Plus, on every level: the _directives_ section (§10) and the per-section source line
(§8).

Rationale from the interview: "waiting on" is meaningful only for a project, "patterns"
only for an area, and the module already uses _decided_ / _open_ today
(`overviewBody()` in `src/core/wiki/module.ts:92`). A uniform section set would leave
one section structurally empty on two of the three levels.

**Contradictions stay named.** [CONCEPT.md](../CONCEPT.md) commits to keeping
contradictions rather than flattening them. On the module level that is its own
section. On the project and area levels it is a rule for the _state_ section: a
contradiction is written into the prose as a contradiction, not resolved by picking a
side. Whether project and area should get their own contradictions section instead is
open point O4.

> **Reversal trigger for per-level sections.** If, when the second level is
> implemented, the prompt and schema turn out to differ only in heading strings, then
> per-level is three copies of one thing and the decision flips to a uniform set with
> optional sections. The test is concrete: does the second `condense-*` prompt contain
> any rule the first one does not?

## 8. Evidence and honesty

Two levels of evidence, because they answer different questions:

1. **`sources:` in the frontmatter** — "these files were read." The mechanism exists:
   `writePage(..., { addSources: [...] })` maintains exactly this list
   (`src/core/wiki/pages.ts:74`).
2. **One source line per section** — "this section came from there." Fits the
   section-wise rewrite exactly: one section, one source set, rewritten together.

Per-sentence wikilinks were rejected: a plausible sentence with the wrong citation
attached is worse than a sentence with none, and per-sentence attribution is where that
failure occurs.

What follows for the prompt: **a section whose claims cannot be attributed to a listed
input is not written.** No smoothing, no general knowledge, no inference beyond the
inputs. Guardrail 3 applies to the artifact exactly as it applies to an answer.

Agent sessions need a citable form. A session is not a vault path, so it gets a
reference shape of its own (`agent:<kind>/<pathKey>`, derived from
`aggregateAgentProjects` in `src/core/agents/projects.ts:45`) — see open point O6.

## 9. Freshness: when a condensation is due

A new deterministic gardener check: **an artifact is stale when an input is newer than
`condensed_at`, or when the unit has inputs and no artifact at all.**

This slots into the existing catalogue (`src/core/gardener/checks/index.ts:23`) next to
`stalePageCheck`, which already does the same shape of comparison — `reviewed` ??
`updated` against `ctx.limits.reviewAfterDays`
(`src/core/gardener/checks/stale-page.ts:31`).

Two properties are copied deliberately from `unprocessedSourceCheck`:

- **The fix writes nothing.** It opens the place where condensation happens. That check
  states the reason in its own doc comment: condensing needs a model and a target, so
  it is not the gardener's job (`checks/unprocessed-source.ts:11`).
- **Severity is informational, not a warning.** An un-condensed unit is not broken.
  Nothing in the vault is wrong; there is just knowledge not yet gathered.

Cleanup this makes possible: `src/core/wiki/ingest.ts:168` writes a `condensed: false`
flag today that no check ever reads. Either the new check uses it or it goes.

## 10. Rejection, directives, and why there is no log

**Rejecting requires a sentence.** Not "dismissed" — a reason. It is appended to the
artifact's directives section, and every subsequent run reads it as an instruction. The
interview's reasoning: a dismissal without a reason is neither explainable later nor
useful to the next run, and "why was this rejected" is itself part of the learning.

Properties of the directives section:

- **Human-owned.** The model reads it and never writes it. You can edit or delete lines
  in Obsidian at any time.
- **It lives in the artifact**, not in `.secondbrain/`, because it is _not derivable_
  from the files. `.secondbrain/` is deletable by contract; a directive is not
  recoverable, so it belongs in the vault.
- **It is the one part of the artifact that is not machine-written.** A small, clearly
  bounded exception to §5's rule, taken knowingly: the alternative is a third file per
  unit, and directives you do not see while reading the result do not get maintained.

**And there is no log.** Not per unit, and not a capped one. The reasoning is the
user's: a log nobody reads is ballast, and one that grows without bound eventually
costs more than it explains — while a log that gets truncated is not append-only and
therefore contradicts VAULT-FORMAT.md's promise. The record that remains:
`condensed_at` (when), `sources:` (from what), the directives (what you told it), and
`.secondbrain/trash/` (one step back). The cost is accepted explicitly: you cannot
reconstruct the artifact from three runs ago.

Whether the module's existing `wiki/log.md` gets one line per run — it is append-only
and grows anyway — is open point O5.

## 11. Inputs per level

Selection is deterministic. No model decides what it gets to read.

**Module.** All wiki pages of the module except `index.md`, `log.md` and the artifact
itself (`NON_PAGES` in `src/core/index/pages.ts:96` plus the artifact).

**Project.** All four sources, per the interview:

- **Agent sessions** — the linked ones, via `aggregateAgentProjects`
  (`src/core/agents/projects.ts:45`) and `readTranscriptPage`
  (`src/core/agents/transcript.ts`). The original trigger for this whole idea.
- **Project notes and the state section** — `project.md` plus `notes/` in the project
  folder. Note the repo fact: there is no `## Status` section; state lives in
  frontmatter and in the body's state section (`src/core/capture/apply.ts:83`), which is
  what `stateSection()` already feeds to the model
  (`src/core/overview/status.ts:250`).
- **Todos and `waiting_on`** — open and closed, with dates. This is what makes the
  project artifact a re-entry briefing and not only a knowledge state.
- **Journal mentions** — day entries naming the project. The mechanism exists:
  `mentions()` in `src/core/overview/status.ts`.

**Area.** The area's notes section (`parseAreaNotes`,
`src/core/index/areas.ts:110`), its todos, and the day entries carrying
`areas: [<slug>]`.

**The `areas:` link is new.** Day close currently proposes `people`, `projects`, `mood`,
`energy`, `tags` (`JOURNAL_CLOSE_SCHEMA`, `src/core/llm/prompts/journal-close.ts:33`)
and no area. It starts proposing `areas` as well — as a proposal, like everything else
in the close; `closeDay()` writes nothing itself
(`src/core/journal/close.ts:148`), the write happens on acceptance in
`src/main/ipc/journal-day.ts:181`. Search-based matching at run time was rejected in
the interview in favour of an explicit, confirmed frontmatter key.

**Volume is bounded, and the bound is visible.** Transcripts in particular can exceed
any context window (`TRANSCRIPT_PAGE_BYTES` exists for that reason). Where a run reads
only part of the inputs, the artifact says so, in the same spirit as the contradiction
check that documents its 24-page ceiling in a doc comment. The concrete bounds are open
point O3.

## 12. Without a model

**Honestly empty.** No artifact, one sentence saying a model is needed for this and
which task kind it is, one link to the model assignment. Nothing is written to disk.

No heuristic fallback, and this is a deliberate exception to CLAUDE.md's "where
possible, a heuristic fallback": a mechanical condensation is a concatenation of
excerpts, and presenting that as a synthesis would assert knowledge nobody checked —
guardrail 3 over guardrail 1's convenience. The deterministic alternative was offered
in the interview and rejected.

The mechanism to detect it exists: `isAvailable(task)` on the gateway
(`src/core/llm/gateway.ts:101`) and `LlmUnavailable` with `no-route` /
`provider-disabled` / `no-key`, which the screen turns into the honest state.

What does still work without a model: the due-ness check (§9 is deterministic), reading
an artifact that was condensed earlier, and searching it — it is a normal indexed
document.

## 13. Where it lives in the UI

**Trigger and read inside the unit.** The maintenance screen reports that something is
due and links there.

| Level    | Location                                                                                   |
| -------- | ------------------------------------------------------------------------------------------ |
| Project  | The **Project knowledge** tab, already reserved in [systems/navigation.md](../systems/navigation.md) |
| Module   | Inside the module view, next to the wiki pages                                             |
| Area     | Inside the area, in the Notes screen (story 005)                                           |
| Due-ness | Maintenance, as a finding that links to the unit                                           |

Rejected: doing all diffs in the maintenance screen. Confirming prose about a project
without the project in front of you is the situation in which people click through.

Requirements for the diff view: removals as visible as additions (§6), the source lines
part of the diff, and the reject path asking for the sentence (§10) rather than
offering a bare dismiss.

Per the project profile, `ui-acceptance-required` and `live-smoke-required` both apply:
every path here — trigger, diff, accept, reject-with-reason, no-model state — has to be
drivable through the real UI.

## 14. Outlook: MCP (not in this concept)

The user's stated intent: later, expose projects, knowledge modules and the condensed
layer over MCP so agents can use them. No requirements here — the point is only that
the artifact shape must not be decided against it.

Two properties already satisfy that, and should not be traded away without noticing:

- **One artifact per unit = one resource per unit.** Fine-grained, individually
  fetchable. A single global condensed document would have been one useless
  monolithic resource — one of the arguments that settled §3's granularity decision.
- **Evidence travels with the artifact.** `sources:` in the frontmatter and the
  per-section source lines mean a consuming agent can cite the same paths and never
  has to guess.

What deliberately stays open: transport, authentication, whether write tools are
exposed at all, and how a consumer sees due-ness. Its own concept, later.

## 15. Integration with existing systems (architecture notes)

**Vault format.** Two new file kinds plus two new frontmatter keys; all of it goes into
[VAULT-FORMAT.md](../VAULT-FORMAT.md) before implementation. `condensed_at` and the
artifact `type:` (O2) are new; `areas:` is new on the journal entry. Frontmatter field
order is centralised in `src/core/vault/frontmatter-order.ts:36` and needs the new
keys.

**Write path.** Nothing new. `writePage()` for the module
(`src/core/wiki/pages.ts:93`), `VaultStore.write({ expectedHash })` for the other two,
`assertWritable()` as the single guard (`src/core/vault/compose.ts:24`),
`VaultConflictError` with `code: 'conflict'` on a stale hash, `writeFileAtomic` for the
write itself, and the undo copy in `.secondbrain/trash/` as with every other write.

**LLM layer.** Three new `TaskKind` values in `src/shared/types/llm.ts:62` (10 → 13),
three entries in `TASK_KINDS` (`src/core/llm/tasks.ts:12`) and `TASK_DEFINITIONS`
(`tasks.ts:47`) with `structured: true`; `condense-area` carries `sensitive: true`, so
the admin screen recommends a local model the way `journal-chat` already does. Tier
suggestion follows CONCEPT.md's table for writing wiki pages: `strong`. Three prompts
plus schemas under `src/core/llm/prompts/`. Routing is unchanged —
`gateway.resolve(task)` (`src/core/llm/gateway.ts:121`).

**Ingest.** `overviewChange` leaves `WIKI_INGEST_SCHEMA`
(`src/core/llm/prompts/wiki-ingest.ts:68`) and `IngestReply`; `updateOverview()`
(`src/core/wiki/ingest.ts:261`) and its call site (`ingest.ts:187`) go. The
`knownPages()` filter that hides the overview from the model (`ingest.ts:65`) stays for
the ingest and is inverted for the condensation run.

**Gardener.** One new check file in `src/core/gardener/checks/`, registered in
`checks/index.ts:23`; a new `GardenerFindingKind`
(`src/shared/types/overview.ts:169`); a new fix action alongside `open-ingest`
(`overview.ts:212`) that opens the unit and writes nothing. `orphanCheck` and
`nearDuplicateCheck` get their overview exemptions extended to the two new artifacts.

**Journal.** `JOURNAL_CLOSE_SCHEMA` gains `areas`
(`src/core/llm/prompts/journal-close.ts:33`); `dayFacts`
(`src/core/journal/facts.ts:184`) and the `applyClose` write path
(`src/main/ipc/journal-day.ts:181`) carry it through. Note the existing oddity: day
close runs on the `extract-tasks` task kind, not a task kind of its own.

**Index.** `docTypeFromPath` (`src/core/index/build.ts:92`) gains patterns for the two
new paths; `DOC_TYPES` (`build.ts:36`) gains the type from O2. Artifacts are searchable
like any document (MiniSearch over title/tags/text, `src/core/index/search.ts:33`) and
must not be counted as module pages — `countPage` (`src/core/index/pages.ts:110`)
already excludes overview.

**Areas.** `src/core/areas/` is string transforms only today, with writes one layer up
in `src/main/ipc/areas.ts`. The artifact is a sibling file, so `areas/<slug>.md` and its
section parsing are untouched — which matters because story 005 is building that screen
right now.

**Agents.** Read-only surface, unchanged (`AgentSessionSource`,
`src/core/agents/types.ts:23`). The condensation run is a consumer, like
`suggestProjectStatus()` (`src/core/overview/status.ts:221`) is today — and that
function is the closest existing precedent for the whole shape: read sessions +
journal mentions + state, ask a model, return a _proposal_, write nothing.

**IPC.** New channels for run and accept/reject, in `src/shared/ipc.ts`, exposed
through preload's allow-list. Renderer touches no files.

**i18n.** Section headings per document language; all UI strings through `t()` in `de`
and `en` (guardrail 7). Note that heading names are the _document_ language while the
UI is the _UI_ language — two independent settings.

## 16. Requirements

**The artifact**

- **CND-1** — Each unit (module, project, area) has at most one condensed artifact, in
  its own file, separate from the files the human writes into.
- **CND-2** — The module artifact is the existing `modules/<slug>/wiki/overview.md`. No
  second module-level file is introduced.
- **CND-3** — An artifact carries `condensed_at` and a `sources:` list of every input
  the run read.
- **CND-4** — A unit with no inputs has no artifact. No placeholder is written.
- **CND-5** — Section headings follow the document language, not the UI language.
- **CND-6** — Unknown frontmatter keys and the directives section survive every run
  (merge, never replace).
- **CND-7** — Artifacts are exempt from the orphan and near-duplicate checks.
- **CND-8** — An artifact is a normal indexed document: searchable, type-filterable,
  and not counted as a module page.

**The run**

- **CND-9** — The run reads the current artifact, its directives section, and the
  deterministically selected inputs, and rewrites whole sections.
- **CND-10** — Nothing appends. A run may shorten and delete text.
- **CND-11** — The run respects a soft size target for the artifact and compresses
  older material to stay within it.
- **CND-12** — No condensation starts without an explicit human action. There is no
  schedule, no threshold-triggered write, no background run.
- **CND-13** — A run that cannot complete leaves the artifact untouched and reports the
  failure.
- **CND-14** — Where a run reads only part of the available inputs, the artifact states
  it.

**Evidence**

- **CND-15** — Every section ends with the source paths it was written from.
- **CND-16** — A claim not attributable to a listed input is not written.
- **CND-17** — An agent session is citable in a stable, resolvable reference form.

**Confirmation and rejection**

- **CND-18** — The proposal is shown as a diff before any write, with removals as
  visible as additions.
- **CND-19** — Accepting writes hash-guarded against the hash the proposal was built
  from; a stale hash discards the proposal as a conflict rather than merging.
- **CND-20** — Every accepted write leaves an undo copy in `.secondbrain/trash/`.
- **CND-21** — Rejecting requires a reason; the artifact is not written.
- **CND-22** — The reason is appended to the artifact's directives section.
- **CND-23** — Every subsequent run reads the directives section as an instruction and
  never writes to it.

**Freshness**

- **CND-24** — A deterministic check reports a condensation as due when an input is
  newer than `condensed_at`, or when a unit has inputs and no artifact.
- **CND-25** — The check runs without a model.
- **CND-26** — Its fix writes nothing; it opens the unit.
- **CND-27** — Severity is informational. An un-condensed unit is not an error.

**Model routing and the no-model case**

- **CND-28** — Three task kinds, each independently assignable to a provider and model.
- **CND-29** — `condense-area` is marked sensitive and recommends a local model.
- **CND-30** — Without a configured model the screen states this, names the task kind,
  and links to the setting. Nothing is written.
- **CND-31** — There is no heuristic condensation.

**Journal → area**

- **CND-32** — Day close proposes `areas: [<slug>]` for a day entry alongside the
  existing fields.
- **CND-33** — It stays a proposal; the write happens on acceptance, as with all other
  close fields.
- **CND-34** — The area run reads day entries carrying its slug.

**Replacing the old mechanism**

- **CND-35** — The ingest stops writing to `wiki/overview.md`; `overviewChange` leaves
  the ingest prompt and reply.
- **CND-36** — Existing bullet-list overviews in real vaults are readable and are
  replaced by the first condensation run without data loss (the trash copy applies).

**UI**

- **CND-37** — Trigger and diff live inside the unit: project knowledge tab, module
  view, area.
- **CND-38** — Maintenance reports due-ness and links to the unit; the diff is not
  confirmed there.
- **CND-39** — Every path is drivable through the real UI: trigger, diff, accept,
  reject-with-reason, no-model state.
- **CND-40** — All UI strings in `de` and `en`.

## 17. Open points

- **O1 — The size cap number.** Not decided. Any figure named in the interview was a
  placeholder. Needs one measured run per level against a realistic vault before it is
  fixed, and it may have to differ per level.
- **O2 — The `type:` of the new artifacts.** Reuse `overview` (then
  `docTypeFromPath` gains path patterns and every `type === 'overview'` branch in the
  codebase has to be re-read for whether it means "module synthesis" or "any
  synthesis"), or add a new `DocType`. Not asked.
- **O3 — Input bounds.** How much of a long transcript, how many day entries, how far
  back. Where the ceiling sits and how it is documented — the contradiction check's
  24-page ceiling in a doc comment is the precedent, but the numbers are undecided.
- **O4 — Contradictions on the project and area level.** Decided: the module has its
  own section. Whether project and area get one too, or whether contradictions are a
  rule for their state section, is not decided.
- **O5 — One line per run in the module's `wiki/log.md`?** It is append-only and grows
  anyway. Raised in the interview, left open when the no-log decision was taken.
- **O6 — The citation form for an agent session.** `agent:<kind>/<pathKey>` is a
  sketch, not a decision. It must survive a moved repo folder, and it must be
  resolvable back to a session by the UI.
- **O7 — The area artifact's file name.** `areas/<slug>.condensed.md` collides with
  VAULT-FORMAT.md's filename rule (lowercase, hyphenated, ASCII — no dots).
  `web/<date>-<slug>.ingest.json` is an existing precedent for a dotted sibling, so
  either the rule gains an explicit exception or the name changes.
- **O8 — Rewriting versus the human's own edits.** The directives section is protected.
  What happens when the human edits a _body_ section by hand and the next run rewrites
  it is not decided: silently overwrite (the hash guard permits it — the human's edit
  becomes the base), flag it in the diff, or protect it somehow.
- **O9 — Whether an accepted artifact can be answered _from_.** The question path
  (`query-answer`) currently reads pages. Whether it may cite a condensed artifact as
  evidence, or must always go down to the primary source, was not discussed — and it
  touches guardrail 3 directly.
- **O10 — Migration for vaults already carrying bullet-list overviews.** CND-36 asks
  for no data loss; whether that means "first run replaces silently", "first run shows
  the bullets in the diff as removals", or "a one-off migration" is open.
- **O11 — Ordering against M2/M3/M4.** This concept depends on story 005 (the Notes
  screen reading `areas/`) and on story 008's Project knowledge tab. Sequencing is a
  `/roadmap plan` decision, not part of this document.
