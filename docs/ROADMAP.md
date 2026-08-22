# Roadmap

**The** one source of status and planning: where we stand, what comes next, what is not planned
at all yet. As of: 2026-08-22.

Rules (so this document does not drift):

- **Milestone granularity.** Story truth lives in the requirements folder (open = flat folder,
  finished = `done/INDEX.md`); sprint detail in the sprints folder. This file links, it does not
  duplicate.
- **Concepts are timeless** (what/why) — when/status lives **only** here.
- **Defined write moments:** end of `/ai-scrum:sprint` (phase 3), end of `/ai-scrum:concept`,
  and the `/ai-scrum:roadmap` ritual (sync check + sprint cut). "Accepted" is marked by the
  user only.

---

## Phase overview

| Phase                | Goal                                                                                                       | Status            |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------- |
| 1 — Usable every day | Every capability exists; now the app has to be legible — obvious paths, nothing written that stays unread. | ▶ **in progress** |

Phase 2 is deliberately not defined. It gets cut once phase 1 has been used for a while and
the gaps are known from use, not from guessing.

---

## Current phase: 1 — Usable every day

The feature surface is complete: all rail screens are built and every channel in
`IPC_CHANNELS` is really implemented ([README, "Status"](../README.md)). What is missing is not
capability but legibility — eleven flat rail entries, a write path into `areas/` that no screen
reads, and screens for things that are actions rather than places.

Way of working: every milestone ends in an increment that can be driven through the real UI.
Between milestones: playtest, review, steering by the user. Stories are cut only once the
previous milestone is accepted, so scope does not balloon up front.

### M1 — Navigation: places, actions, systems — accepted

Concept: [systems/navigation.md](systems/navigation.md) (moved from `concepts/` — fully built).

The rail went from eleven flat entries to seven, and the distinction between **place**,
**action** and **system** is now structurally visible. Sources moved inside Knowledge, agent
sessions moved inside Projects, capture and ask lost their rail entries and became overlays, and
`areas/` finally has a screen that reads it — which is also what turned the inbox into a filter
instead of a duty. All five stories are done; the milestone's target picture is fully built and
accepted by the user on 2026-08-19.

Sprints:

- [sprints/done/S01/sprint.md](sprints/done/S01/sprint.md) — the rail becomes places (002,
  007, 008), `done` — accepted
  ([review](sprints/done/S01/review.md) · [testplan](sprints/done/S01/testplan.md))
- [sprints/done/S02/sprint.md](sprints/done/S02/sprint.md) — notes get a home (005, 006),
  `done` — accepted
  ([review](sprints/done/S02/review.md) · [testplan](sprints/done/S02/testplan.md))

The rail now stands at its final seven entries: Dashboard, Projects, Journal, Knowledge, Notes,
Maintenance, Settings — digits 1–7, system entries separated at the foot. Sources sits under
Knowledge, agent sessions under Projects, capture and ask are shell overlays, `areas/` reads
into Notes, and the old inbox is the "unfiled" filter on it.

Gaps/notes:

- **`tests/core/wiki/module.test.ts` was red from S01 through S06.** `MODULE_SCHEMA_TEMPLATE` in
  `src/core/wiki/agents-md.ts` drifted from `docs/MODULE-SCHEMA.md` when the doc was migrated to
  English (commit `e8959d1`). Resolved by story 023: the code is authoritative, `docs/MODULE-SCHEMA.md`
  is rewritten to match it and carries a banner saying so — a single fixed (German) schema text
  is simpler than a per-language doc plus a second drift guard, and nothing in the app parses
  `AGENTS.md`.
- **`scripts/seed/internal.mjs` pins `claudeProjectsDir` for the demo vault but not Codex**, so
  screenshot runs read the real `~/.codex/sessions`. Pre-existing from story 001, surfaced by 008
  because the Sessions tab now reads both CLIs.
- **Story 001 shipped without a sprint.** It sits in `done/` with `· — ·` instead of a sprint id.
  Not worth backfilling; noted so the gap in the sprint history is not read as a lost sprint.
- **M1 accepted by the user on 2026-08-19**, both sprints' test plans walked end to end:
  [sprints/S01/testplan.md](sprints/done/S01/testplan.md),
  [sprints/S02/testplan.md](sprints/done/S02/testplan.md).

### M2 — Projects answer where I left off — accepted

Stories 003 (notes and waiting-on, editable in place), 004 (where the status and next step come
from), 013 (favourite projects and an order that matches how I work). No concept behind them;
the stories are detailed enough to cut from directly.

Depended on M1: story 008 moved a Sessions tab into this same screen, so M1 went first to avoid
touching the project detail twice. M1 is accepted; M2's target picture is fully built and
accepted by the user on 2026-08-19, [sprints/done/S03/testplan.md](sprints/done/S03/testplan.md)
walked end to end.

Sprints:

- [sprints/done/S03/sprint.md](sprints/done/S03/sprint.md) — where I left off (003, 004, 013),
  `done` ([review](sprints/done/S03/review.md) · [testplan](sprints/done/S03/testplan.md))

Gaps/notes:

- **A `.gitignore` bug excluded `src/core/vault/` from git entirely, since S01.** The rule
  `vault/` (meant to keep the user's real vault data out of the repo) was unanchored and
  matched any directory named `vault` anywhere in the tree, including the core vault module.
  Fixed in a standalone commit on the S03 branch (`af519ef`): anchored to `/vault/`, module
  added. Confirmed missing from both `main` and `dev` before the fix — needs the S03 branch
  merged to actually land the core module in history.
- **The "last worked on" marker (013) is computed over the filtered list**, not globally — under
  a narrowed scope filter it marks the most recent project within that scope. Intentional and
  tested, not a defect.
- **List-level star writes (013) have no error surface**, unlike the detail star. Matches an
  existing pattern on the same screen for other list-level patches; not a regression.

### M3 — The journal becomes one thing — accepted

Stories 011 (one entry instead of day and conversation), 012 (the interview, for when the field
is empty), 009 (filter for days that are not finished), 010 (a calendar on top of the days). No
concept behind them.

Independent of everything else — [systems/navigation.md](systems/navigation.md) explicitly
leaves the journal untouched at the rail level; 011 supersedes only the line about the journal's
_inner_ structure staying untouched.

The `## Day`/`## Conversation` split is gone for new writing: one field, a stance next to it
(listen/tips/analyse, chosen per write and not persisted), the app's answers interleaved inline
as blockquote turns. An interview overlay covers a fixed five-topic backbone for the days the
field stays empty. The day list gets a "not finished" filter (`closed` is now a real vault
frontmatter field) with a rail badge, and a collapsible month calendar sits above the list
showing entry/mood/unfinished markers. All four stories done; M3's target picture is fully built
and accepted by the user,
[sprints/done/S04/testplan.md](sprints/done/S04/testplan.md) walked end to end.

Sprints:

- [sprints/done/S04/sprint.md](sprints/done/S04/sprint.md) — the journal becomes one thing (011,
  012, 009, 010), `done`
  ([review](sprints/done/S04/review.md) · [testplan](sprints/done/S04/testplan.md))

Gaps/notes:

- **Legacy `## Day`/`## Conversation` days are not migrated automatically.** They keep rendering
  and stay editable; folding one into the new interleaved stream is one explicit, hash-guarded,
  per-day action (011). The vault can carry both formats indefinitely.
- **Stance is not persisted anywhere** — chosen per write/ask, by the user's own decision; a
  day's file carries no record of which stance produced which answer.
- **012's interview overlay does not show the day's existing text as context**, though the
  story's own decisions named it — it fell outside the deliverable that shipped it and was
  accepted as a gap rather than fixed in-sprint.
- **010 leaves two pre-existing inline locale ternaries unmigrated** to the `locale()` helper it
  introduced (`DayList.tsx`, `DayEntry.tsx`) — out of that story's scope, worth folding in
  whenever those files are next touched.
- **`tests/core/wiki/module.test.ts` was still red** on every story's build in this sprint,
  confirmed pre-existing and unrelated (see the M1 gap above — resolved by story 023).

### M4 — A finding can be acted on — built, acceptance pending

Stories 014 (the run reports findings, not results), 017 (a finding says how it ends), 016
(orphan page — I pick the target), 015 (resolve a near-duplicate). Cut straight from the
stories, by decision on 2026-08-14 — no concept.

Note: 015, 016 and 017 add new **write** paths into the vault (merging pages, inserting links,
recording a verdict). The AI-proposes/human-confirms guardrail and the hash-guarded write are
the load-bearing part of this milestone, not the screens.

M4 was chosen next at the 2026-08-20 `/ai-scrum:roadmap plan`, now that M3 is accepted.

Sprints:

- [sprints/S05/sprint.md](sprints/done/S05/sprint.md) — a finding can be acted on (014, 015, 016,
  017), `done` — built, live acceptance pending
  ([review](sprints/done/S05/review.md) · [testplan](sprints/done/S05/testplan.md)). Story 020 (M6) rode
  along in the same sprint by direct user decision on 2026-08-21 — see M6 below and the
  sprint's own note.

Gaps/notes:

- **Built, not yet accepted.** All four M4 stories are implemented, reviewed and smoke-tested
  through the running app, but the manual acceptance walk is the user's — see
  [sprints/S05/testplan.md](sprints/done/S05/testplan.md). The milestone is marked accepted only
  after that.
- **The `sources:` frontmatter citation variant (016) is out of scope**, by user decision in
  S05's clarification round. An orphan can be resolved by a body-line link only; citing a source
  through a `sources:` frontmatter list needs its own story (different write path, different
  preview shape).
- **A pre-existing red test blocked a fully green `npm test`**:
  `tests/core/wiki/module.test.ts:150` asserts `MODULE_SCHEMA_TEMPLATE` in
  `src/core/wiki/agents-md.ts` is character-for-character `docs/MODULE-SCHEMA.md`, and the two had
  drifted. Predates S05 and was not this milestone's to fix — resolved by story 023: the code is
  authoritative, the doc is rewritten to match it.
- **Two files sit over the ~300-line soft limit**: `src/main/ipc/gardener.ts` and
  `src/main/gardener-state.ts`, both grown by this milestone's write paths. Reviewed as still
  single-responsibility; splitting them was judged not worth ballooning a story diff.

### M5 — Models without expertise — accepted

Requirement: [019-model-recommendations-for-people-without-expertise.md](requirements/done/019-model-recommendations-for-people-without-expertise.md)
(epic, not buildable itself — split by `/refine` on 2026-08-21 into four child stories after a
requirements interview covering the split, the install shape, the catalogue source and the
cost-estimate scope).

Stories: 019a (machine scan), 019b (per-task recommendation, in money, with the sensitive-task
rule), 019c (guided local Ollama install and pull). All three built and accepted by the user on
2026-08-21, [sprints/done/S06/testplan.md](sprints/done/S06/testplan.md) walked end to end.
019d (Claude/ChatGPT plan instead of a metered key) was refined on 2026-08-21 and **rejected**:
the terms were read at the source and Anthropic forbids third-party apps from using a Claude
subscription without prior approval, while OpenAI documents no path for a third party to drive a
ChatGPT-plan session. The milestone is complete with 019a–019c; the epic is `done`.

Cut directly to a sprint on 2026-08-21, without a separate `/roadmap plan` round.

Sprints:

- [sprints/done/S06/sprint.md](sprints/done/S06/sprint.md) — a machine scan, a recommendation, a
  guided local runtime (019a, 019b, 019c), `done` — accepted
  ([review](sprints/done/S06/review.md) · [testplan](sprints/done/S06/testplan.md))

Gaps/notes:

- 019d (subscription providers instead of a metered key) is **rejected**, not postponed. Using a
  Claude or ChatGPT plan from this app is not officially permitted or documented, so the API-key
  path stays the only way to reach those models. Sources and reasoning:
  [requirements/019d-subscription-providers.md](requirements/done/019d-subscription-providers.md).
  Reopening needs an external trigger (an Anthropic approval, or OpenAI documenting third-party
  plan sessions) — the terms were read on 2026-08-21 and change often.
- Windows VRAM detection (019a) is a known, permanent limitation, not a bug: WMI's 32-bit
  `AdapterRAM` field misreports any card ≥4 GB, so `vramMb` is reported `null` for such cards
  rather than a wrong number. A real fix needs a second data source (registry
  `HardwareInformation.qwMemorySize`).
- OpenRouter policy attribution (019b) is applied per catalogue entry rather than per configured
  provider instance — latent only against the current bundled catalogue; flagged for a follow-up
  rather than a mid-sprint redesign.
- Linux is out of scope for the in-app Ollama installer (019c) by design — the official install
  path is `curl | sh`, which the app's no-shell-strings guardrail forbids constructing.
- **M5 accepted by the user on 2026-08-21**, S06's test plan walked end to end, including the
  steps needing a configured OpenRouter key or a real Ollama install.

### M6 — Journal loose ends — built, acceptance pending

Requirement: [020-journal-loose-ends.md](requirements/done/020-journal-loose-ends.md). A
forward-looking sentence in the journal ("tomorrow is the notary appointment") whose day has
passed with no later entry speaking to it becomes a visible, answerable loose end — surfaced in
the journal conversation and as a reminder, closing itself once a later entry addresses it.

No concept behind M6 — a single user-written story, not cut from a milestone-sized concept.
The six open questions were answered by the user in S05's clarification round on 2026-08-21 and
are recorded in the story under `## Decisions (Sprint)`: loose ends live as a finding kind in
the Maintenance surface (reusing 017's exits framework), the answer is written into today's
entry with a back-reference, state lives in its own place independent of any single day, there
is no automatic expiry, the app may quote the user's own wording back at them, and closing a day
(009) does not suppress its loose ends.

Bundled into **S05** (M4) for scheduling by direct user decision on 2026-08-21, rather than
cutting a fifth sprint for one story — see [sprints/S05/sprint.md](sprints/done/S05/sprint.md).
Tracked as its own milestone here because it is not part of M4's "a finding can be acted on"
scope.

Sprints:

- [sprints/S05/sprint.md](sprints/done/S05/sprint.md) — story 020 rode along in M4's sprint, `done`
  — built, live acceptance pending
  ([review](sprints/done/S05/review.md) · [testplan](sprints/done/S05/testplan.md))

Gaps/notes:

- **Built, not yet accepted.** Story 020 is implemented, reviewed and smoke-tested, but the
  manual acceptance walk is the user's.
- **Only the heuristic path was exercised live.** The model-found (`origin: 'model'`) loose end
  needs a real local model routed; tests cover it with the fake provider and with "no model
  configured", but no live model ran during the sprint.
- **Two accepted low-severity limitations** are documented in the story's Done section:
  unbounded heuristic re-parsing on the dashboard and interview hot paths, and a new
  low-probability coupling between `journal:interviewPlan` and the gardener index.

### M7 — A maintenance run I can see, stop and continue — accepted

Requirement: [021-maintenance-i-can-see-stop-and-continue.md](requirements/done/021-maintenance-i-can-see-stop-and-continue.md)
(container story, split by `/refine` into 021a/021b/021c and not built directly). A maintenance
run stops being an opaque wait: progress is visible from any screen, stopping keeps what the
finished stages found, continuing picks up where it left off, and a run can be scoped to one
kind or one module instead of the whole vault.

No concept behind M7 — a single user-written story from using the maintenance screen, split into
three because the three capabilities have different write paths into the run state.

**Built without a sprint**, directly on `dev` by user decision on 2026-08-22, rather than cutting
S07 for one split story. The `done/INDEX.md` entries carry `· — ·` accordingly. Accepted by the
user on 2026-08-22.

Sprints: none — see above.

Gaps/notes:

- **Accepted, with one honest limitation from 021b**: a stopped run's health score stays frozen
  at the last full run's value, and a first-ever partial run reports "unknown" rather than a
  score computed from half the evidence. Deliberate — a score over a partial vault would be an
  invented number.
- **Scoped runs skip the model stages entirely (021c).** A scope is a heuristic-only run by
  design; the LLM stages always look at the whole vault or not at all.
- **`src/main/ipc/gardener.ts` and `src/main/gardener-state.ts` grew further** past the ~300-line
  soft limit through this milestone's run-state work (already flagged under M4). Now the strongest
  candidate in the repo for a split story.

### M8 — A loose end is its own thing, not a wait — accepted

Requirement: [022-a-loose-end-is-not-a-wait.md](requirements/done/022-a-loose-end-is-not-a-wait.md).
The first real correction that came out of _using_ M6: loose ends had been folded into the
"waiting on" tile, which answers a different question ("who owes me something") and lost its
meaning by carrying them. Loose ends now have their own tile, a row on the journal day they were
announced on, a name taken from what was actually announced, and an `'open'` urgency that stops
a passed announcement from reading like a blown deadline.

No concept behind M8 — a single user-written story, cut and built the same day.

**Built without a sprint**, directly on `dev`, same decision as M7. Accepted by the user on
2026-08-22 against the real vault (the demo vault cannot reproduce the wording being fixed).

Sprints: none — see above.

Gaps/notes:

- **`journal:get` re-derives `openLooseEnds()` on every day fetch** — a full index scan per day
  view. Spec-conformant (the story mandated one source of truth) but a performance follow-up if
  journals grow large.
- **A narrow stale-hash race when answering two loose ends on the same day in quick succession**
  — `refreshDay` does not invalidate today's cached view. `InterviewDialog.tsx` has the identical
  shape and never surfaced it because it asks one loose-end question per run; M8 is the first
  place several rows can stack. Worth a follow-up story if it is ever hit.
- **Two cosmetic i18n defects left in** (`de-dashboard.ts`, `de-journal.ts`): a German opening
  quote closed with a straight quote. Fold in whenever those files are next touched.
- **M6's own acceptance is still open** (see above) even though its correction M8 is accepted —
  M8 was driven from the real vault, M6's full test plan was not walked.

---

### M9 — The gate is green and the small things are right — planned

No concept and no single story behind M9 — it is the collected "pre-existing, needs an owner"
backlog of M1–M8, given an owner. Five stories: the module schema drift that has kept `npm test`
red since M1 (023), the seed script that lets a screenshot run read real Codex sessions (025),
the filing path that writes German headings into an English vault (024), the German catalogue
that opens quotes with `„` and closes them straight (026), and the maintenance run state that
has grown to 788 + 409 lines through M4 and M7 (027).

Chosen over cutting the condensed layer at the 2026-08-22 `/ai-scrum:roadmap plan`, by the user:
four of the five are visible on screen anyway, and the repo's own quality gate has not been
fully green for five sprints.

Sprints:

- [sprints/S07/sprint.md](sprints/S07/sprint.md) — the gate is green and the small things are
  right (023, 025, 024, 026, 027), `planned`

Gaps/notes:

- **All five stories are `draft`.** Each carries three open questions, most of which are content
  or architecture decisions no agent may resolve: what a `languages.documents` switch owes an
  existing vault (024), the German quote convention for the whole catalogue (026), and whether
  the run state belongs in `src/core/` (027). 023's own question — which side of the module
  schema is authoritative — is answered in its Decisions section: the code
  (`src/core/wiki/agents-md.ts`) is authoritative, `docs/MODULE-SCHEMA.md` mirrors it.
- **Story 022's Done section understated the quote defect** as "two i18n strings"; it is 98
  occurrences across 13 files, with zero correct ones. 026 is written to the real number.
- **027 is the drop candidate** if the sprint runs long — it is the only story with no
  user-visible effect.

---

## Open / unprioritised

| Topic                                                         | State                                                                                                                                                                                                                                              | Next step                                                                                                                                                            |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Condensed layer (module / project / area)                     | Concept written 2026-08-18: [concepts/condensed-layer.md](concepts/condensed-layer.md). Supersedes the earlier "project knowledge from agent sessions" entry — that is now one of four project inputs. 40 requirements, 11 open points, no stories | `/ai-scrum:roadmap plan` — strongest M10 candidate, deferred once at the 2026-08-22 cut in favour of M9; depends on story 005 and the Project knowledge tab from 008 |
| MCP interface for projects, knowledge and the condensed layer | Named as an outlook in [concepts/condensed-layer.md](concepts/condensed-layer.md) §14, deliberately without requirements                                                                                                                           | Own `/ai-scrum:concept` once the condensed artifacts exist                                                                                                           |
| German docs migrated to English                               | Decided in `.claude/ai-scrum.md`; `docs/*.md` are still German                                                                                                                                                                                     | Own story once it stops being cosmetic                                                                                                                               |
| Phase 2                                                       | Not defined                                                                                                                                                                                                                                        | Cut after phase 1 has been used                                                                                                                                      |
