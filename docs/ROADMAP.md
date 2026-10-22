# Roadmap

**The** one source of status and planning: where we stand, what comes next, what is not planned
at all yet. As of: 2026-10-20.

Where we stand: M19 just finished (S19, `done`) — a push to `main` with a filled `## Unreleased`
publishes the installer, portable exe and `latest.yml`; an installed Gaston notices a release
daily, downloads and restarts only on request, About shows the notes. Next: nothing is cut yet
beyond "Open / unprioritised" below — a `/roadmap plan` picks the next milestone. Waiting on the
user: the `sprint/S17`, `S18` and `S19` → `dev` merges, and the first real release (unverified
against github.com).

Rules (so this document does not drift):

- **Milestone granularity.** Story truth lives in the requirements folder (open = flat folder,
  finished = `done/INDEX.md`); sprint detail in the sprints folder. This file links, it does not
  duplicate.
- **Concepts are timeless** (what/why) — when/status lives **only** here.
- **Defined write moments:** end of `/ai-scrum:sprint` (phase 3), end of `/ai-scrum:concept`,
  and the `/ai-scrum:roadmap` ritual (sync check + sprint cut).
- **A milestone whose stories are all done is `done`** (since 2026-09-07). Acceptance happens
  inside the sprint, through the automated test each acceptance criterion is mapped to — there
  is no separate "accepted" state waiting on the user. Milestones marked `accepted` below are
  history from before that change, kept as written. What a later walk-through finds goes under
  the milestone's "Gaps/notes" and into a **new** story, never into a reopened milestone.

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

Way of working: every milestone ends in an increment whose acceptance criteria are each proven
by an automated test. Between milestones: review and steering by the user, from the sprint's
`review.md`. Stories are cut one milestone at a time, so scope does not balloon up front.

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
  added. Confirmed missing from both `main` and `dev` before the fix — needed the S03 branch
  merged to actually land the core module in history. **Resolved:** `dev` carries the anchored
  `/vault/` rule and all 19 `src/core/vault/` files are tracked (checked 2026-09-02). Still
  missing on `main`, which is ten sprints behind — it lands with the next release merge.
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

### M4 — A finding can be acted on — done

Stories 014 (the run reports findings, not results), 017 (a finding says how it ends), 016
(orphan page — I pick the target), 015 (resolve a near-duplicate). Cut straight from the
stories, by decision on 2026-08-14 — no concept.

Note: 015, 016 and 017 add new **write** paths into the vault (merging pages, inserting links,
recording a verdict). The AI-proposes/human-confirms guardrail and the hash-guarded write are
the load-bearing part of this milestone, not the screens.

M4 was chosen next at the 2026-08-20 `/ai-scrum:roadmap plan`, now that M3 is accepted.

Sprints:

- [sprints/done/S05/sprint.md](sprints/done/S05/sprint.md) — a finding can be acted on (014, 015, 016,
  017), `done`
  ([review](sprints/done/S05/review.md) · [testplan](sprints/done/S05/testplan.md)). Story 020 (M6) rode
  along in the same sprint by direct user decision on 2026-08-21 — see M6 below and the
  sprint's own note.

Gaps/notes:

- **Closed 2026-09-07 without the manual walk**, under the test-based acceptance process. All
  four stories are implemented, reviewed and covered by unit/integration tests; the walk in
  [sprints/done/S05/testplan.md](sprints/done/S05/testplan.md) was started (014 ticked) and then
  retired along with the acceptance backlog. The remaining gap is a level, not a person: the
  write paths (discard + undo byte-for-byte, orphan link insertion, dismiss reversibility) have
  no e2e round trip through the real app, because the project has no functional Playwright
  harness yet. Tracked under M13's harness gap; a defect found later is a new story.
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

### M6 — Journal loose ends — done

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
cutting a fifth sprint for one story — see [sprints/done/S05/sprint.md](sprints/done/S05/sprint.md).
Tracked as its own milestone here because it is not part of M4's "a finding can be acted on"
scope.

Sprints:

- [sprints/done/S05/sprint.md](sprints/done/S05/sprint.md) — story 020 rode along in M4's sprint, `done`
  ([review](sprints/done/S05/review.md) · [testplan](sprints/done/S05/testplan.md))

Gaps/notes:

- **Closed 2026-09-07 without the manual walk**, under the test-based acceptance process. Story
  020 is implemented, reviewed and covered by tests. The walk was never done — it needed a real
  vault with a real forward-looking sentence and a date passing, which the demo vault cannot
  reproduce. That is a fixture gap, not a manual residue: a test can construct exactly that vault
  state, and no test did. Recorded here rather than kept as an open acceptance item.
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
- ~~**Two cosmetic i18n defects left in** (`de-dashboard.ts`, `de-journal.ts`): a German opening
  quote closed with a straight quote.~~ Fixed by story 026 in S07 — and the count was wrong: it
  was 100 occurrences across all 13 `de*.ts` catalogues, not two.
- **M6's own acceptance is still open** (see above) even though its correction M8 is accepted —
  M8 was driven from the real vault, M6's full test plan was not walked.

---

### M9 — The gate is green and the small things are right — done

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

- [sprints/done/S07/sprint.md](sprints/done/S07/sprint.md) — the gate is green and the small things are
  right (023, 025, 024, 026, 027), `done` — all five stories built, none blocked
  ([review](sprints/done/S07/review.md), [test plan](sprints/done/S07/testplan.md))

**The goal is met:** `npm test` reports 190 files / 2707 tests / 0 failed, verified after the last
commit. The decisions taken: the code is authoritative for the module schema (023); a
`languages.documents` switch warns and offers a migration rather than being silently accepted
(024); German low-high quotes `„…“` for the whole catalogue (026); pure run-state logic moves to
`src/core/gardener/` (027).

Gaps/notes:

- **`npm run format:check` is the next never-green gate** — 460 files fail, and it is not this
  sprint's doing: a file last touched before the sprint fails prettier purely because the working
  copy carries CRLF (`core.autocrlf` on Windows against a repo prettier expects in LF). Story 023
  fixed this for one file via `.gitattributes`; the repo needs the same decision made once,
  everywhere. **Wants its own story** — it is exactly the kind of carve-out M9 existed to retire.
- **The maintenance progress bar vanishes** after navigating away from the garden screen and
  back. Found while smoke-testing 027, isolated to `src/renderer/lib/queries/gardener.ts` (which
  027 never touched) and confirmed pre-existing against a HEAD worktree. Small, visible,
  ready to pick up.
- **`src/main/ipc/gardener-deps.ts` is still 635 lines**, over the soft limit. It is run
  orchestration rather than run state, so it fell outside 027's scope.
- **024 turned out wider than written.** Its review found four more places that hardcoded or
  only matched the German heading (`ProjectOverviewTab.tsx`, `main/ipc/todos.ts`,
  `main/ipc/projects.ts`, plus a `stand`-only read side). All fixed with tests; worth remembering
  that "which write paths are in scope" was under-answered at refine time.
- **Live acceptance is still the user's.** 024, 026 and 027 were each driven through the running
  app during their builds, but no story has had a full manual walk-through. Two honest caveats
  from 026: the demo vault has no unresolvable loose end (that branch is accepted on unit tests),
  and the English due-date string is an `aria-label`, not visible text.
- **`applyFiling` in `core/capture/filing.ts` has no live caller** (pre-existing dead export); its
  new `docLanguage` option is correct but exercised by no live path.

---

### M10 — A model that fits this machine, and an app I can hand on — done

No concept behind M10. Four user-written stories, cut on 2026-08-23, along two lines that only
matter outside the author's own session.

**The machine gets a say.** M5 shipped the sizing heuristic with a documented hole: on Windows,
WMI's 32-bit `AdapterRAM` misreports any card ≥4 GB, so `vramMb` stays `null` and the verdict
falls back to the RAM ceiling. Story 028 makes the human the second data source 019a said would
be needed — a fact the scan misses can be typed in, is marked as entered rather than measured,
and is read by the verdict and the recommendation alike, with conflicts between a later scan and
the entered value surfaced rather than silently resolved. Story 029 adds the number that was
missing underneath all of it: the share of the machine a recommendation may plan with (default
80%, applied after the existing OS/headroom reserves), so a model is chosen against what the
user is willing to give it rather than against the whole box.

**The app leaves the repository.** Story 030 finishes a rename that only ever happened in
`package.json`: the window, the HTML title, the dashboard, the journal speaker, the prompts and
the README no longer say "Second Brain" — the app is **Gaston**, the same name as the vendored
design system, deliberately. Story 031 turns `npm run package` into something that can be handed
over — `npm run handoff` produces one ZIP for a USB stick, a readme for the recipient, an
automated check that nothing of the author's is inside it, and a first-start screen (language,
vault, honest "no model configured") for someone who isn't the app's author.

Sprints:

- [sprints/done/S08/sprint.md](sprints/done/S08/sprint.md) — it fits my machine, and I can pass it on
  (028, 029, 030, 031), `done`

Decisions taken at the cut (2026-08-23, user):

- **The vault directory stays `.secondbrain/`.** Renaming it is a vault-format change with a
  migration path; M10 is not that. A vault written by the old build opens unchanged.
- **The journal speaker becomes `Gaston` for new turns**, and every existing `Second Brain` day
  stays readable. Nothing in the vault is rewritten.
- **A handed-on copy keeps settings and keys in `userData`/`safeStorage`** on the recipient's
  machine. A portable "data next to the .exe" mode is explicitly out — `safeStorage` is bound to
  the Windows user, so encrypted keys would not survive the trip.

Decisions taken during S08's clarification round (2026-08-23, user):

- **029 — resource budget:** applies after the existing OS/headroom reserves (100% still isn't
  "all of it"); one global percentage, not separate RAM/VRAM budgets; default **80%**, a
  deliberate day-one behaviour change rather than a pure opt-in.
- **030 — one name:** `Gaston` and the design system's `Gaston` are the _same_ name, deliberately
  — not two names that needed disambiguating. `package.json`, the `appId`
  (`app.hantsch.guston` → `app.hantsch.gaston`) and both `src/main` call sites were renamed with
  it; the repository/checkout folder stays `second-brain`.
- **031 — scope:** Windows only; English-only recipient readme; the app creates/opens a vault on
  first start rather than shipping one in the ZIP; a first-start screen is in scope; shipped
  unsigned, SmartScreen's warning documented rather than resolved.

Gap carried out of S08: `npm run handoff`'s first step is the repo-wide `npm run verify`, which
inherits the `format:check`-never-green-on-Windows carve-out tracked under M9's Gaps/notes above
(CRLF checkout vs. prettier's LF default) — unrelated to M10, not fixed by it, noted again here
because it now also blocks the one command this milestone's second half is built around.

---

### M11 — A local engine for a machine that is not mine — done

No concept behind M11. Four user-written stories, cut on 2026-08-23 from one observation while
looking at the provider setup: the app manages exactly one local runtime, and the first test user
will not have strong hardware. M10 gives the sizing heuristic better facts; M11 gives it something
small to recommend and a way to actually run it.

**A model the machine can carry.** The bundled catalogue knows a 7B and an 8B, and
`classifyModelTier` puts everything up to 8B into one `cheap` bucket — so on a laptop without a
discrete GPU the recommendation can only suggest something that crawls or say nothing fits. Story
032 adds the 1B–4B class, makes the tier distinction the recommendation needs, and has the app say
outright which tasks are beyond this machine instead of routing them to a model that will produce
mush. It is the one story of the three that needs no new runtime and is useful on its own.

**A card that remembers what it found.** Added to the milestone on 2026-08-23 after using what
M10 built: the machine card forgets its scan on every app start, asks for VRAM in megabytes, and
explains the machine in parameter counts to the person these stories exist for. Story 035 persists
the scan machine-locally, moves the field to GB, replaces the parameter sentence with plain
language, and makes the resource budget a slider. It runs first in S09 because it splits the file
032 and 034 edit next.

**An engine that installs itself.** Ollama is llama.cpp underneath, so this is not a better
engine — it is the three knobs Ollama decides for you and that decide everything on a weak GPU:
how many layers go to the GPU, how large the context is, which quantisation you take. Reaching
them today means a GitHub release, a Hugging Face file, an invented command line and the
"own OpenAI-compatible URL" preset. Story 033 makes llama.cpp a second managed runtime next to
Ollama — named in the list, fetched from inside the app, model file included, progress and cancel
reusing 019c's shapes. Story 034 starts it from the settings screen with the layer count, context
size and thread count derived from the machine facts (028) and the resource budget (029), each
value shown with one sentence on what it traded away.

Sprints:

- [sprints/done/S09/sprint.md](sprints/done/S09/sprint.md) — a small model, an engine that installs itself,
  and a start I can see (035, 032, 033, 034), `done`

Decisions taken at the cut (2026-08-23, user):

- **AirLLM is rejected, not postponed.** Read at the source
  ([lyogavin/airllm](https://github.com/lyogavin/airllm)): it keeps one layer on the GPU at a time
  and is explicitly disk-loading bound, needs Python and PyTorch inside the Electron bundle, and
  exposes no OpenAI-compatible server. It buys model size with speed, and this milestone needs the
  opposite — many short prompts on a slow machine. Reopening would need a different design, not a
  newer version.
- **Ollama stays.** llama.cpp is a second option for the machines where it is the better one, and
  Ollama remains fully managed as it is today. Which of the two a given machine should get is an
  open question in 033, not a foregone conclusion.
- **Nothing about the engine enters the vault.** Binaries and GGUF files live in a place the app
  owns; a vault on a USB stick stays a folder of Markdown files.
- **Cut after S08, not folded into it.** Stories 028 and 029 rewrite exactly the heuristic
  (`src/core/llm/capacity.ts`) and the recommendation path this milestone builds on. Two sprints
  editing one heuristic in parallel is the failure mode the sprint order exists to avoid.

Open at the cut, to be decided in S09's clarification round: which concrete small models go into
the catalogue and whether `ModelTier` gains a fourth value (032 — a type change in
`@shared/types`, not a local edit), which llama.cpp build the app fetches and where model files
come from (033 — a curated pin is small, a Hugging Face search is its own sprint), whether 019c's
~700 lines of install/pull/status code get extracted behind an interface both runtimes implement
(033-Q6, the architectural call of the sprint), and whether the engine starts automatically and
what happens when nothing fits even entirely on the CPU (034 — the two cases the test user meets
first).

Risk carried knowingly: 033 and 034 have 019c's acceptance problem in a sharper form. Their real
test needs a machine where the engine is genuinely absent and the graphics card genuinely weak,
and the build machine is neither. That turned out to be exactly right for 034 — and under the
process from 2026-09-07 it is a **manual residue**, not an open acceptance: no test on this
machine can cover a machine this machine is not. Story 031 in S08 exists to make that run
possible once a real test machine shows up.

**S09 result (2026-09-01).** 035, 032, 033 are `done` and moved to
[requirements/done/](requirements/done/). 034 is built and reviewed (a story-review-hard pass
found and fixed a process-lifecycle race between manual start and the D6 on-demand auto-start
guard) but stays `in-progress`: this milestone's own risk note above came true — the author's
machine cannot exercise "engine genuinely absent" or a real GPU/CPU-only start, so 034's live
acceptance (start/stop, override row, foreign-runtime detection) is pending the test user's
laptop, per story 031. See [sprints/done/S09/review.md](sprints/done/S09/review.md) and
[sprints/done/S09/testplan.md](sprints/done/S09/testplan.md).

**Gaps/notes.** Same two carry-overs from S07/S08, still open (see "Open / unprioritised" below):
`format:check` not green on Windows (CRLF), and the maintenance progress bar lost on navigation.

---

### M12 — An area gathers itself — done

Concept: [concepts/condensed-layer.md](concepts/condensed-layer.md) — the first slice of it, cut
on 2026-09-01 after the concept had been deferred three times (M9, M10, M11). One level only: the
**area**, chosen by the user over the project level (greenfield, tab already reserved) and the
module level (replaces the existing bullet mechanism).

Four stories: the link between a day and an area that does not exist today (036), the artifact and
the run that writes it (037), the diff that has to be read before anything is written (038), and
the deterministic check that says a condensation has gone stale (039).

What the choice of level costs and buys: the journal→area link has to be built first (036), and
the artifact's file name collides with VAULT-FORMAT.md's no-dots rule (037-Q2) — but nothing has
to be migrated. `wiki/overview.md`, CND-2, CND-17 and CND-35/36 belong to the module and project
levels and are explicitly out of M12.

Sprints:

- [sprints/done/S10/sprint.md](sprints/done/S10/sprint.md) — an area gathers itself (036, 037, 038, 039),
  `done` ([review](sprints/done/S10/review.md) · [testplan](sprints/done/S10/testplan.md))

Decisions taken at the cut (2026-09-01, user):

- **The area level goes first**, not the project or module level.
- **One level, not three.** The concept's reversal trigger for per-level sections (§7) is
  evaluated when the second level is built, not in M12.
- **The two open carve-outs do not ride along** — `format:check` never green on Windows (which
  also blocks `npm run handoff`) and the maintenance progress bar lost on navigation stay in
  "Open / unprioritised". M9 was the carve-out milestone two sprints ago.

Decisions taken in S10's clarification round (2026-09-01, user) — the concept's open points O1–O4,
O7, O8 and O9, plus two of the stories' own open questions:

- **Artifact `type:`:** a new `DocType` (`condensed`), not a reuse of `overview` (O2).
- **File name:** `areas/<slug>.condensed.md`, with an explicit dotted-file exception added to
  VAULT-FORMAT.md (O7).
- **Soft size cap:** ~2000 words / ~12k characters per artifact, not per section (O1).
- **Input bounds:** the last ~90 days of tagged day entries, plus the area's full notes and todos
  section (O3).
- **Human edit vs. rewrite:** flagged in the diff, the user decides each time — never silently
  overwritten (O8).
- **Contradictions (O4):** a rule for the _state_ section, not their own section — the concept's
  stated default, unchanged.
- **Condensed artifacts as evidence (O9):** never cited when answering a question — always the
  primary source. Not yet enforced in code (see Blocked / open in
  [sprints/done/S10/review.md](sprints/done/S10/review.md)); carried below.
- **Diff granularity:** whole-artifact, not per-section.
- **Trigger placement:** its own tab on the area, next to notes and todos.
- **Day-close area picker:** the close dialog can add an area the model did not propose, not
  accept/remove only.
- **Deleting a condensed artifact from the UI:** out of scope for M12; carried below.

**S10 result (2026-09-02).** All four stories are `done` and moved to
[requirements/done/](requirements/done/). Built on branch `sprint/10`, `npm run verify` green
after every story; two review passes (037, 038) found and fixed real bugs before they shipped —
see [sprints/done/S10/review.md](sprints/done/S10/review.md) for the full list. Live acceptance
(manual walkthrough of [sprints/done/S10/testplan.md](sprints/done/S10/testplan.md)) is pending the user;
the golden-path condensation run itself also needs a reachable local model to verify beyond the
fake-provider tests, which the test plan flags explicitly.

Risk that came true: this is a write path that **deletes**, and both stories built for it —
undo copy in `.secondbrain/trash/`, the hash guard, the reject-with-reason path — turned out to be
exactly where review found real issues (a reject-path hash-guard race, an orphaned trash entry on
conflict, reject silently rewriting section headings). All fixed before the story closed; nothing
outstanding.

---

### M13 — Evidence stays primary, and the gate turns green — done

The follow-ups M12 left behind, plus the two never-green carve-outs this table has been carrying
since S07. One of the four closes a guardrail: an answer can cite a condensed artifact today,
because `core/index/build.ts` indexes it as an ordinary document and the answer path never checks a
document's type. The other three are papercuts with a long tail — a gate that is red before the
first test runs, a progress bar that forgets a maintenance run that is still going, and an artifact
that can only be deleted from outside the app.

Four stories: the guardrail (040), the run made visible wherever I am (042), the delete (043), and
the line-ending decision (041) last, because it rewrites up to 1077 files in one commit.

Sprints:

- [sprints/done/S11/sprint.md](sprints/done/S11/sprint.md) — evidence stays primary, and the gate
  turns green (040, 042, 043, 041), `done`. 040 and 041 done outright; 042 and 043 were held at
  built/acceptance-pending under the retired P2 live-smoke policy and closed `done` on 2026-09-07
  (see [review.md](sprints/done/S11/review.md) and each story's closing note).

Decisions taken at the cut (2026-09-02, user):

- **Carve-outs before the condensed layer's second level.** The module and project levels stay
  gated on M12 being accepted; nothing in M13 depends on an unaccepted milestone.
- **All four candidate stories ride along**, including the delete (043), which this table had
  suggested holding back until the pattern could be shared across levels.
- **The clarification round was pulled forward into the plan.** Twelve open questions were
  settled the same day, recorded per story under `## Decisions (Sprint)` and marked `(User)`. The
  four that shape the milestone: LF becomes the repository's canonical byte via repo-wide
  `* text=auto eol=lf` (041-Q1); the evidence rule covers `condensed` only and leaves a module's
  `overview.md` as it is, held in one named list so a second type is one entry (040-Q3); the
  artifact stays findable in search and is excluded from citations only, with one line on the
  condensed tab saying so (040-Q2/Q4); and deleting an artifact takes the directives section with
  it (043-Q1).
- **042 was widened past its carve-out framing.** Progress moves into the shell and is visible
  from every screen, and closing the app mid-run warns and offers stop-and-close through 021b's
  stop path — so the story now reaches the shell and `src/main/` instead of one renderer hook.

Gaps/notes:

- **The live acceptance backlog was retired on 2026-09-07**, together with the manual acceptance
  gate itself. It had grown to eight milestones and never shrank; several of its items needed a
  second machine, a signed build or a configured model to attempt at all. Acceptance is now the
  test each criterion is mapped to, and
  [reviews/2026-09-03-acceptance-todo.md](reviews/2026-09-03-acceptance-todo.md) is retired.
- **The real remainder is one missing test level: there is no functional e2e harness.**
  `npm run shot` and `npm run a11y` prove that screens render and are a11y-clean; nothing drives
  a flow through the built app and asserts an outcome. Everything the old walk-throughs were meant
  to catch — write paths with undo, cross-screen behaviour, dialogs — is currently covered one
  level down, by unit/renderer/main tests. **Story 066** cuts that harness; until it lands,
  `e2e: none` in `.claude/ai-scrum.md` and every user-facing criterion is covered below the real
  surface, which the workflow now has to state per story.
- **042's cross-screen behaviour needs the harness, not a person**: the demo vault's model-less
  run finishes in under a second, too fast to race navigation-persistence, stop-from-elsewhere or
  the close-during-a-run dialog. A fixture that holds a run open is work an e2e suite can do;
  `tests/renderer/run-strip.test.tsx`, `tests/main/close-guard.test.ts` and
  `tests/renderer/quit-during-run-dialog.test.tsx` cover it deterministically in the meantime.
- **043's delete round trip needs the harness too** (confirm + undo inspection in
  `.secondbrain/trash/`, index drop, conflict, no-model, German strings). Pinned today by
  `tests/main/condense-ipc.test.ts` plus renderer tests and one screenshot of the dialog.
- **042's tray-quit close door has no UI path**: no `Tray` is created anywhere in `src/main/`, so
  only the title-bar close and `Alt+F4` can be exercised live; the `before-quit` guard is covered
  by automated tests only until a tray exists.
- Three questions stay open on purpose, and all three are refine's to answer rather than the
  user's: the vendored Gaston stylesheet under the new line-ending rule (041-Q4), the actual cause
  of the navigation bug — which must be established and named before the strip is hoisted, or it
  gets hidden instead of fixed (042-Q1), and whether the delete gets its own `condense:delete`
  channel or a generic vault delete (043-Q2).
- 041 adding `format:check` to the verify list in `.claude/ai-scrum.md` (041-Q3) means every story
  from S12 on has a fourth gate to pass. Intended: a gate no story may rely on is how this one
  went red in the first place.

---

### M14 — A project gathers itself — done

Concept: [concepts/condensed-layer.md](concepts/condensed-layer.md) — the second slice, cut on
2026-09-02. The area level (M12) is built; the module and project levels were both still open. The
project level is chosen over the module level: the module level replaces the existing
`wiki/overview.md` ingest mechanism (CND-2, CND-35, CND-36), a behaviour change on every existing
vault, while the project level is purely additive into a tab
([systems/navigation.md](systems/navigation.md)) already reserved for it.

Three stories: the artifact and the run that writes it (044, reading state, notes, todos/
waiting-on, agent sessions and journal mentions — the project's four inputs per the concept), the
diff that has to be read before anything is written (045), and the deterministic check that says a
project's condensation has gone stale or was never done (046). No fourth "link" story is needed —
unlike the area level, the project level needs no new day→project frontmatter link; `mentions()`
already finds journal entries naming a project.

Sprints:

- [sprints/done/S12/sprint.md](sprints/done/S12/sprint.md) — a project gathers itself (044, 045, 046),
  `done` (built 2026-09-02; [review](sprints/done/S12/review.md),
  [testplan](sprints/done/S12/testplan.md))

Decisions taken at the cut (2026-09-02, user):

- **Cut ahead of any live acceptance walkthrough.** M4, M6, M9, M10, M11 and M12 were all still
  "built, acceptance pending"; the roadmap had stated the project/module level should wait for
  M12's acceptance. The user chose to proceed anyway — no time for the walkthroughs now, more
  features preferred over pausing, corrections to be filed as new stories once a walkthrough finds
  something wrong. Named risk, accepted knowingly: M4/M6/M9/M10/M11 add write paths into the real
  vault exercised so far only by fake-provider tests and short demo-vault smoke runs, not a full
  walkthrough against real data — this sprint adds more surface on top without reducing that risk.
  **Resolved differently on 2026-09-07:** the walkthroughs were dropped rather than done, and the
  risk was reframed as one missing test level (story 066's e2e harness) — something a test can
  close, which a growing backlog of click lists never did.
- **The module level stays open**, no longer gated on a live-acceptance question (there is none
  any more), but on its own added cost (retiring `updateOverview()`). Revisit after M14.
- Six open questions carried into refine — all resolved with the user in `/sprint 12`'s
  clarification round (bundled `AskUserQuestion`), recorded under each story's
  `## Decisions (Sprint)`: sensitivity, agent-session citation form, size cap/input bounds,
  contradictions handling, human-edit-vs-rewrite, delete affordance, IPC channel shape (the five
  `condense:*` channels were generalised with a `unit` discriminator rather than duplicated per
  level), and the due-ness badge scope (Maintenance only, no project-overview badge this sprint).

Gaps/notes:

- The concept's §7 reversal trigger (per-level sections vs. a uniform shape) was evaluated at
  044's refine and did **not** flip: the project prompt carries rules the area prompt does not
  (a fourth input group, the session citation form, `waiting_on`), so per-level sections stay.
- 044 shipped `condense-project`'s core/run/write layer without the shell dependency for reading
  an agent session transcript (`readTranscriptTail`); 045 had to add `claudeTranscriptTail()` to
  make the citation carry real content. A cross-story interface handoff that should have been
  named explicitly in 044's Done section.
- A project-overview "possibly outdated" badge (mirroring story 004's area badge) was deliberately
  deferred — candidate follow-up story if due-ness should be visible outside Maintenance.
- One pre-existing, unrelated finding surfaced: the condensed panel renders raw YAML frontmatter
  as a text dump, present identically in the area tab before this sprint — filed, not fixed.

---

### M15 — The day is one text field — in progress

No concept behind it: the milestone comes from the user's own feedback after really using the
journal (2026-09-03). The journal's capability is complete — day text, mood/energy, interview,
close-out, facts, coaching stream — but the day view does not read in the order a day is written,
two buttons both claim to end the day, a keypress can file an entry mid-thought, and the field
that should carry the writing does not look like a field. Nothing here adds capability; all of it
makes the capability that exists usable.

Ten feedback points, cut into three groups:

- **S13 (first part, cut 2026-09-03):** the section order the user named (047), the fields'
  visibility plus click-only filing (048), and one close action instead of two (049).
- **Second part (stories cut after S13's review):** re-indexing a day that was added to after it
  was closed ("Tag nochmal indizieren"), correcting the close summary instead of only deselecting
  items, and a date picker that zooms out to years and then months
  ([MonthCalendar.tsx](../src/renderer/components/MonthCalendar.tsx) pages months only today).
- **Off the plan** (see Open / unprioritised): the medication tracker and the data-import merge
  rule.

Sprints:

- [sprints/done/S13/sprint.md](sprints/done/S13/sprint.md) — the day is one text field (047, 048, 049),
  `done` ([review](sprints/done/S13/review.md) · [testplan](sprints/done/S13/testplan.md))
- [sprints/done/S14/sprint.md](sprints/done/S14/sprint.md) — a closed day and a loose end both tell the
  truth (068, 069, 070, 067), `done` ([review](sprints/done/S14/review.md), no testplan — no criterion
  was marked manual residue) — cut 2026-09-07 from three fresh user bug reports, each investigated
  before cutting. 068 is the milestone's own named second-part item (reopen on new content);
  069/070 are a split of one confusing moment the user described into read-time visibility vs.
  write-time detection; 067 rides along (Settings/LLM papercut, out of M15's own scope). All four
  stories built and merged into `sprint/S14` the same day.

Decisions taken at the cut (2026-09-03, user):

- **The day's own text field becomes the primary input; the coach composer stays.** It moves below
  the history and is labelled as talking to the coach. The radical variant (drop the composer from
  the day view) was offered and rejected — no capability is removed to simplify.
- **One close action.** "Tag abschliessen" analyses, proposes, and marks the day closed on accept;
  the separate manual "mark as finished" switch stops being a primary path. Reopening stays
  possible as a correction.
- **The medication tracker is postponed** until the idea is riper — no story, no concept yet.
- **The data-import merge rule has no story yet:** the import it refers to does not exist in the
  code at all, so the source (old journal files? another app's export?) has to be named before a
  merge-not-overwrite rule can be cut. The rule itself is agreed: an existing day is added to,
  never replaced.

Gaps/notes:

- **Cut while eight milestones were still "built, acceptance pending"** (M4, M6, M9, M10, M11,
  M12, M13, M14). Unlike the M14 cut, this milestone is itself a correction round from real use —
  the feedback it comes from _is_ a partial live acceptance of the journal. That pending set was
  retired wholesale on 2026-09-07: acceptance is the test each criterion is mapped to, the one
  remaining gap is story 066's e2e harness, and anything a later walk-through finds is a new
  story.
- Three stories in a row edit the same handful of files under
  `src/renderer/screens/journal/`. Sequential build only, and the S08 git-safety rule for build
  agents (no unscoped `git restore`/`git clean`) matters more here than usual. S13 built all three
  in strict order (047 → 048 → 049) with no file collisions.
- **S13's build was interrupted once by an infrastructure rate limit** mid-review-fix on 047, not a
  code problem — a resumed build agent picked up the existing uncommitted diff, re-verified it, and
  closed the story clean. Left here because a future sprint hitting the same limit should know
  resuming (not restarting) is the right move.
- **047 kept a pre-existing quirk**, not introduced by this story: the day's save button disables
  itself when the draft is empty after trimming — now the sole write path for the day's text since
  the edit-mode gate is gone. Not a regression; changing save-when-empty semantics was out of scope.
- **049 left one dead i18n key** on purpose: `journal.finish.markFinished` has no consumer after the
  "als abgeschlossen markieren" button was removed. Left in place to keep the diff scoped to the
  acceptance criteria; candidate cleanup for the second part of M15 or a future gardener pass.
- The second part of M15 (re-indexing a day after close, correcting the close summary, the date
  picker's year/month drill-down) is not cut yet — own `/roadmap plan` once S13 is accepted.
  **Update 2026-09-07:** the first of the three (reopen-on-new-content) is now cut as story 068 in
  S14, and the close-summary correction is cut as story 075 in S15 — under M16, because the user's
  report that a proposal can only be discarded belongs to that milestone's theme, not to "the day
  is one text field". The date picker's year/month drill-down is the one item of M15's second part
  still not cut.
- **S14 (cut and built 2026-09-07):** two more fresh bug reports from real journal use — a loose
  end's answer is invisible from the day it was raised on (069), and a forward-looking mention is
  only ever surfaced after its day has already passed, never at write time (070). A third,
  unrelated Settings papercut (067, a sensitive task's recommendation dead-ending with no
  explanation) rode along in the same sprint rather than waiting for its own cut. All four stories
  done; acceptance proven by tests, see [S14's review](sprints/done/S14/review.md).
- **S14 e2e harness gap:** story 067's guided-recommendation dead end (AC1, and AC2's e2e half)
  could not be reproduced through the real Electron surface — the no-model e2e vault's local
  models always satisfy `condense-area`'s capacity + sensitivity policy, so `pick === null` never
  occurs there. Covered one level below the real surface (a renderer test against the real
  component tree) instead. Candidate follow-up: a deterministic capacity/provider override for the
  e2e harness, or a dedicated fixture that forces `pick === null`.

---

### M16 — Work in flight is visible, and what it proposes is correctable — done

No concept behind it either: like M15, this milestone comes from the user's own feedback after
really using the app (2026-09-07). Two reports, one theme — the app does work on the user's
behalf and the user loses sight of, and control over, that work.

- **Background work is assumed, not seen.** Condensing an area or a project and closing a day
  are awaited mutations inside the renderer component that started them
  ([queries/condense.ts:43](../src/renderer/lib/queries/condense.ts#L43), `journal:close`).
  Navigate away mid-run and the run is invisible and its proposal lands nowhere — on a local
  model, minutes of work thrown away. Maintenance already does it right
  ([gardener-run-state.ts](../src/main/gardener-run-state.ts) plus
  [RunStrip.tsx](../src/renderer/components/RunStrip.tsx)); imports already have a job shape
  (`IngestJob`). The milestone generalises those two instead of adding a third mechanism.
- **A close proposal can only be pruned, never corrected.** Todos are kept or dropped, fields
  are kept or dropped whole, mood and energy cannot be set to the right value, and a todo's
  text, target project, scope or a waiting-on's person cannot be touched at all. So a wrong
  proposal costs either a wrong entry or the whole close. This is M15's own deferred
  second-part item, now cut here.

Decisions taken at the cut (2026-09-07, user):

- **All long runs, one list.** Condensations, the day's close, the interview plan, imports and
  the maintenance run — not just the two that are invisible today. Two mechanisms for one
  problem was explicitly rejected.
- **A real queue, not just a monitor.** One model-bound task at a time; further requests wait
  visibly with their position. That protects a local model from computing two condensations at
  once and makes "still running" an honest statement.
- **The result stays with the task.** A finished task holds its proposal and offers a way back
  to it; the proposal survives navigation. Toast-plus-badge, with the result only retrievable
  where it started, was offered and rejected.
- **Every line and every field of a close proposal becomes editable** — todo text, target,
  scope, a waiting-on's person, plus adding a line by hand, per-item people/projects/tags, and
  mood/energy set to another value. Re-running the model with a correction hint was offered as
  the cheap alternative and rejected: it is worthless without a model and the result stays
  guessed.
- **The rail entry sits directly above maintenance**, as the user asked.

Sprints:

- [sprints/done/S15/sprint.md](sprints/done/S15/sprint.md) — work in flight has a place, and a
  proposal can be corrected (071, 072, 073, 074, 075), `done`
  ([review](sprints/done/S15/review.md), no testplan — no criterion was marked manual residue) —
  all five stories built and merged into `sprint/S15` in strict order (071 → 072 → 073 → 074, then
  075 independently), as planned.

Gaps/notes:

- **074's close/quit-during-run dialog e2e coverage** is real only for the maintenance run; the
  condensation/import broadening is proven at main level (registry cancel semantics), not through
  the dialog itself — the no-model e2e vault cannot hold either producer in a genuinely long
  `running` state on demand. Same class of gap as story 067 (S14). Candidate follow-up: the same
  deterministic capacity/provider override already named as a candidate after S14.
- **074's model lane is not actually shared across producer kinds.** The maintenance run and
  imports (via the new `WorkRegistry.startExternal()`) never compete for lane capacity, so a
  condensation enqueued while a maintenance run is going starts immediately rather than queuing
  behind it — no acceptance criterion covers this cross-producer ordering. Left as a known,
  accepted gap for whichever story next needs real cross-producer model-lane protection.
- **073's cancelled condense/close tasks don't thread a real `AbortSignal`** — `runCondenseUnit`/
  `closeDay` don't check the signal the registry hands them, so a cancelled task's underlying
  model call can still finish and store an orphaned, unreachable result. Bounded and
  non-corrupting (evicted by the result store's own retention or cleared on vault close); left for
  whichever story next hardens cancellation broadly.
- **074's ingest/vault-switch boundary has a low-probability race**: a terminal import publish
  arriving after a vault switch can mint one ephemeral, mislabelled, already-terminal task row
  that self-resolves. Bounded, no vault write, no persisted state; left for whichever story next
  hardens that boundary.
- Three of the five stories (071, 073, 074) had their build stalled mid-review-fix once each by
  infrastructure (a session rate limit, a sub-agent backgrounding its own verification rather than
  blocking on it) — not a code problem. Resuming the same agent with an explicit
  "verify synchronously" instruction closed each one clean, same lesson S13 already recorded for a
  different infra hiccup.

Gaps/notes:

- **074 is the risky story.** It migrates the maintenance run and the ingest progress path onto
  the new registry and touches `gardener-run-state.ts`, `gardener-autorun.ts`,
  `close-guard.ts` and every consumer of `event:ingest-progress` — all covered by existing
  tests (including story 042's e2e cross-screen check) that have to stay green without being
  weakened.
- **075 is independent** of the four queue stories and could be built first if they run long.
- **Persistence is deliberately an open question,** not a decision: the recommendation in 071
  is a session-only queue (derived, like the index), so a run interrupted by a quit is
  restarted by the user rather than resurrected half-done.
- The date picker's year/month drill-down — M15's third deferred second-part item — is still
  not cut. It is unrelated to this milestone's theme and waits for its own cut.

---

### M17 — Nothing enters half-true, and nothing trusts more than it must — done 2026-09-25

No concept behind it: M17 and M18 are the [2026-09-03 architecture
review](reviews/2026-09-03-architecture-review.md) turned into plan. Its sixteen draft stories
(050–065) sat in `requirements/` with no milestone line for five days; cut into four sprints by
theme on 2026-09-08, in the review's own priority order — P0 first, process gate first of all.

M17 is the trust half: what the app writes into the vault at the entrance, and what it believes
from the renderer and the model. Two parts.

- **The entrance tells the truth (S16).** The CI gate (065) so no red test rides along for five
  sprints again, then the three P0/P2 ingest findings: a digestion is a transaction or it is
  nothing (050), a video without a transcript is an honest state instead of a condensed
  placeholder (051), and a bot wall, a consent page and a genuinely empty extraction stop
  masquerading as each other and as "no model configured" (064).
- **Nothing trusts more than it must (S17, not cut yet).** Main re-validates what the renderer
  sends and a hallucinated absolute path stops being a one-click `shell.openPath` (057, the
  review's second P0); the app stays reachable and keeps its hotkey and reminder notifier alive
  from the tray (058); a search hit and a citation open in the app instead of ejecting into
  Notepad (059); and a knowledge module can be renamed and deleted, not only created (063).

Sprints:

- [sprints/done/S16/sprint.md](sprints/done/S16/sprint.md) — the entrance tells the truth, and
  the gate never sleeps (065, 050, 051, 064), `done 2026-09-08`
  ([review](sprints/done/S16/review.md) · [testplan](sprints/done/S16/testplan.md))
- [sprints/done/S17/sprint.md](sprints/done/S17/sprint.md) — nothing trusts more than it must
  (057, 058, 059, 063), `done 2026-09-25`
  ([review](sprints/done/S17/review.md) · [testplan](sprints/done/S17/testplan.md))

Decisions taken at the cut (2026-09-08, user):

- **Four sprints of four, not one 15-story hardening sprint** — the shape the "Open /
  unprioritised" row already prescribed.
- **065 is the first story of the first sprint.** The gate lands before the code it is supposed
  to guard, so S16's own stories are the first ones gated.
- **050 and 054 are the risky stories** of their sprints and are marked as such at refine, so
  the hard-deliverable and clean-review passes apply.
- **Priority beats convenience in the sprint order:** the review's P0s (050, 051, 057) are in
  the first two sprints even though the index work (054–056) is what the user feels daily.

**S16 result (2026-09-08).** All four stories done and moved to
[requirements/done/](requirements/done/); every acceptance criterion proven by a named,
passing test, see [S16's review](sprints/done/S16/review.md). Reuse held across the three ingest
stories as planned: 051 extended 050's failure-reason mechanism, 064 reused 051's `no-content`
terminal state — no third mechanism was invented.

**S17 result (2026-09-25).** All four stories done and moved to
[requirements/done/](requirements/done/); every acceptance criterion proven by a named, passing
test, see [S17's review](sprints/done/S17/review.md). M17 is now fully built: both its halves
(S16, S17) are done. Reuse held again: 057 reused `isSafeVaultPath`, 059's `homeOf()` came out of
garden's existing `targetFor()`, and 063 built on 015/066's discard/undo framework rather than a
fourth write path. Two review passes (058, 063) each caught a real bug before it shipped — see
S17's review for both. Two criteria (058's hotkey-while-hidden, notification-click) are manual
residue, named with reasons in [S17's testplan](sprints/done/S17/testplan.md); every other
criterion in the sprint runs through the real app via `npm run test:e2e`.

Gaps/notes:

- **Two files are now over CLAUDE.md's ~300-line soft limit**: `src/core/wiki/ingest.ts` (435+
  lines) and `src/main/ipc/ingest.ts` (530+ lines), grown by 050's transaction/lock/progress
  work. Reviewed as still single-responsibility; splitting them is a candidate follow-up story,
  [S16 review](sprints/done/S16/review.md).
- **050 left two narrower gaps, documented not fixed**: `WikiTransaction.rollback()` runs
  outside the module lock, so a failing digestion's own catalog/chronicle entries can dangle one
  level below AC1 if a concurrent sibling has already advanced past it; `findSourcePageForRaw`'s
  idempotent retry can only see pages the derived index already knows about, so a retry
  immediately after a hard kill can still mint a `…-2` in a narrow window. Candidate follow-up,
  [S16 review](sprints/done/S16/review.md).
- **065's real-CI-run observations are manual residue**, not open acceptance: whether
  `verify.yml`/`ui-smoke.yml` actually run correctly on GitHub's Windows runner, and the
  cold/warm runtime budget, are only observable once `sprint/S16` is pushed — see
  [S16 testplan](sprints/done/S16/testplan.md).
- **050's AC5 and 051's AC1/AC5 are named e2e-harness gaps**, called out at refine rather than
  found late: the e2e fake provider answers instantly, so no test can hold a producer in a long
  `running` state on demand — the same S14/S15 harness limit. See
  [S16 testplan](sprints/done/S16/testplan.md) for the one walk-through this enables (050's AC5).
- **A real Windows bug surfaced by 063's e2e run**: the live vault watcher (chokidar) blocks
  `fs.rename()` on any directory beneath it, so the first real folder move failed with `EPERM`
  even though every watcher-less unit test was green. Fixed with `Services.withoutWatcher()`.
  Worth checking for the same class of bug in any future story that moves or deletes a directory
  under vault watch.
- **063 deliberately left two narrow "undo after the world moved on" gaps, documented not
  fixed**: `modules:undo` has no lock/digestion-check on the slug it restores, and restoring a
  deleted module after its slug has been reused could mispoint protocols/projects at the wrong
  module. Both narrow and already an accepted class of risk elsewhere in the codebase; candidate
  follow-up if either is ever seen in practice. See [S17 review](sprints/done/S17/review.md).
- **Two more files are now over CLAUDE.md's ~300-line soft limit**: `src/core/wiki/module-lifecycle/plan.ts`
  (357 lines) and `rename.ts` (338 lines), added by 063. Same class of gap as `ingest.ts` above;
  candidate for the same future split-only pass.
- **058's one accepted low-severity residual**: reopening a hidden-started window from the tray
  loses its maximized flag on the next close until manually re-maximized. Cosmetic, session-scoped,
  not vault data.

### M18 — The vault can grow, and an answer finds its evidence — done 2026-09-25

The second half of the architecture-review backlog: the findings that only bite as the vault
gets bigger. Cut 2026-09-08 together with M17; both sprints follow S17.

- **The vault can grow (S18, not cut yet).** Saving one file stops costing a full tree walk,
  a re-derivation over every document and a rewrite of an index that holds every body (054); a
  bulk change from OneDrive, `git checkout` or a copy actually reaches the index instead of
  resetting the debounce forever (055); loose ends are derived once per index instead of on
  every screen that asks (056). Story 062 (Codex work counts as a project's last touch) rides
  along — same overview surface, disjoint files.
- **An answer finds its evidence (S19, not cut yet).** A scoped question runs its scope inside
  retrieval instead of filtering after the top-24 cut (052); a two-hour transcript competes as
  passages rather than as one document with one 700-character window (053); a PDF yields its
  text to the same pipeline as every other source (060); and the heuristic floor speaks the
  document language instead of only German (061).

Sprints:

- [sprints/done/S18/sprint.md](sprints/done/S18/sprint.md) — the vault can grow, and an answer
  finds its evidence (054, 055, 056, 062, 052, 053, 060, 061), `done 2026-09-25`
  ([review](sprints/done/S18/review.md)) — cut 2026-09-25 as one sprint covering all eight of
  the milestone's stories, by user decision to try a larger sprint instead of the two
  four-story sprints (S18/S19) originally planned at the 2026-09-08 cut.

Decisions taken at the cut (2026-09-08, user):

- **054 → 055 → 056 build strictly sequentially** and alone in their sprint bar one ride-along:
  all three edit `src/core/index/` and `src/core/vault/watch.ts`, and two sprints (or two
  parallel stories) editing one index is the failure mode the build order exists to avoid.
- **052 before 053** — both rewrite the query path in `src/core/wiki/ask.ts` and
  `excerpts.ts`; scope-inside-retrieval is the smaller change and defines the candidate set
  053 then splits into passages.
- **Not in scope for either milestone:** the condensed layer's module level, the MCP interface,
  the medication tracker and the data import — they stay under "Open / unprioritised" and get
  their own cut.

Decision taken at the 2026-09-25 re-cut (user): one sprint (S18) instead of two. The original
split protected against two sprints editing the same index files in parallel — moot within one
sequential sprint — so all eight stories run in one branch, one review and one regression gate,
in the same pairwise order (054→055→056, 052→053) the 2026-09-08 cut already fixed. See
[S18's own notes](sprints/done/S18/sprint.md) for the full ordering rationale, including two
file overlaps (053/054 on `index/build.ts`, 056/061 on `journal/loose-ends.ts`) the original
two-sprint split had also crossed.

**S18 result (2026-09-25).** All eight stories done and moved to
[requirements/done/](requirements/done/); every acceptance criterion proven by a named, passing
test, see [S18's review](sprints/done/S18/review.md). The regression gate ran once across all
eight stories and came back green apart from one pre-existing, unrelated jsdom failure
(`tests/renderer/quick-capture.test.tsx`, confirmed red at the sprint's own start commit). No
manual residue in this sprint — every criterion has a passing automated test, no `testplan.md`
was written. Two real bugs were caught inside story reviews before they shipped: 054's
path-scoped refresh wasn't dropping a renamed/deleted module's old docs, and 060's PDF text
extraction silently failed on every real PDF (`Buffer` vs `Uint8Array`) until fixed — see S18's
review for both.

Gaps/notes:

- **052's AC6 (thread-context follow-up retrieval) was deliberately deferred**, not built. It
  needs its own design call on topic changes and ranking, and overlaps 053's query rewrite.
  Candidate follow-up story once that design call happens, see
  [S18 review](sprints/done/S18/review.md).
- **054's manifest is still rewritten in full on every save**; only the 256 body buckets are
  scoped. Matches AC2's own wording (body cost), but worth revisiting if save cost on very
  large vaults becomes a felt problem.
- **`src/core/index/service.ts` (599 lines) and `build.ts` are now over CLAUDE.md's ~300-line
  soft limit**, reshaped across 054/055/056/053; `src/core/journal/loose-ends.ts` stays ~500
  lines even after 061 split `forward.ts` out of it. Same class of gap as M17's `ingest.ts`
  split candidates — worth one future split-only pass across all of them.

### M19 — Gaston ships and updates itself — done 2026-10-20

Gaston can be packaged but not released: no tag, no GitHub release, no changelog, nothing an
installed copy could update from. Modelled on `../q2-launcher`'s stories 096–099, Windows only.
Cut 2026-10-19.

- **A release ships from a changelog (076).** `## Unreleased` gates the run; a push to `main`
  publishes NSIS installer, portable exe and `latest.yml`.
- **Gaston notices and offers an update (077, 078).** Once a day, quietly; download and restart
  only when the user says so, never under a running task. The portable build opens the release
  page instead.
- **About tells me what changed (079).** Notes of the running and the pending version.

Sprints:

- [sprints/S19/sprint.md](sprints/S19/sprint.md) — Gaston ships and updates itself (076, 077,
  078, 079), `done` ([review](sprints/S19/review.md))

---

## Open / unprioritised

| Topic                                                         | State                                                                                                                                                                                                                                                                                                                                               | Next step                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Condensed layer (module level)                                | Concept written 2026-08-18: [concepts/condensed-layer.md](concepts/condensed-layer.md). The **area** level was built in M12 (S10, done 2026-09-02); the **project** level was built as M14 (S12, done 2026-09-02). The **module** level — CND-2, CND-17 (agent-session citation), CND-35/36 (retiring the ingest's overview append) — is still open | Own `/roadmap plan` for the module level. The concept's §7 reversal trigger was evaluated at M14's refine and did not flip (see M14's Gaps/notes) |
| MCP interface for projects, knowledge and the condensed layer | Named as an outlook in [concepts/condensed-layer.md](concepts/condensed-layer.md) §14, deliberately without requirements                                                                                                                                                                                                                            | Own `/ai-scrum:concept` once the condensed artifacts exist                                                                                        |
| German docs migrated to English                               | Decided in `.claude/ai-scrum.md`; only `docs/MODULE-SCHEMA.md` is still German now — and story 023 pinned it `eol=lf` and byte-exact against `MODULE_SCHEMA_TEMPLATE`, so migrating it means changing code too                                                                                                                                      | Own story once it stops being cosmetic                                                                                                            |
| Medication tracker                                            | Named in the user's journal feedback (2026-09-03) and postponed at the M15 cut by the user: the idea is not ripe enough to cut. Open shape questions: preparations, dose, schedule, adherence, correlation with mood/energy, own screen or a day section                                                                                            | Own `/ai-scrum:concept` once the user wants it — no story until then                                                                              |
| Data import merges into an existing day                       | Rule agreed at the M15 cut (2026-09-03): an import must add to a day that already has content, never replace it. But no import path exists in the code, so the story has no subject yet                                                                                                                                                             | Name the source (old journal files, another app's export, a folder of Markdown), then cut one story with the merge rule as its acceptance         |
| Vault agent (Claude Code in the vault)                        | Concept drafted 2026-10-22: [concepts/vault-agent.md](concepts/vault-agent.md), 11 open points                                                                                                                                                                                                                                                      | `/roadmap plan`                                                                                                                                   |
| Phase 2                                                       | Not defined                                                                                                                                                                                                                                                                                                                                         | Cut after phase 1 has been used                                                                                                                   |
