# Story history

One line per finished story, appended by `/ai-scrum:build` when it moves the file here.
Format: `- NNN — <title> · <sprint or —> · <one-sentence result>`.

The full texts live next to this file. This index is the fast overview — do not turn it into a
second roadmap.

- 001 — Agent session browser (Claude & Codex) · — · New three-level screen (sources → projects
  → sessions/transcript) reading both Claude Code and Codex CLI session trails, read-only, with
  project linking and honest empty/off/misconfigured states; passed clean-agent review after one
  fix cycle.
- 002 — Knowledge absorbs sources · S01 · Modules screen became Knowledge (`#/knowledge`), Sources
  left the rail and moved in as its input tab with an `into=` module prefill; old `#/modules` and
  `#/sources` deep links redirect with the query string intact.
- 007 — Capture and ask become actions, not places · S01 · Both left the rail and became shell
  overlays: capture from a title-bar button, ask from `Ctrl+K`'s second mode with the scope
  prefilled from the current module or project; `#/capture` and `#/ask?q=…` survive as opener
  routes and `chat:ask` gained a real `project` filter.
- 008 — Agent sessions move inside projects · S01 · The agents rail entry is gone: the
  all-sessions view moved to `#/projects/sessions` (with a query-preserving `#/agents`
  redirect) and every project detail gained an `Overview | Sessions` tab that absorbed the
  work trace and now reads both CLIs, with dismissable unmapped directories and a global
  "show empty tab" switch — both persisted through the existing `settings:setVault`.
- 005 — Notes, a home for the areas · S02 · New rail entry "Notizen"/"Notes" (hotkey `4`)
  reads `areas/` as collapsible sections with dated notes and area-scoped todos; an
  always-visible composer files a note with no target chosen (default `areas/notes.md`,
  created on first use), a header action creates an area, and a per-note action moves it
  between areas — five new hash-guarded IPC channels, the move rolling back on a failed
  target write; search hits and citations for `areas/*` route in-app to `#/notes?a=<slug>`.
- 006 — Inbox becomes the unfiled filter in Notes · S02 · The rail entry "Inbox" is gone
  (final rail numbering 1–7); `#/inbox` and every in-app link redirect to
  `/notes?filter=unfiled`, which runs the unchanged filing workspace inside Notes; filing
  no longer deletes the dump into the trash but leaves it as a `status: filed` receipt
  with `filed_into`/`filed_at`, shown in a collapsed "filed" trail; Today gained a
  "N unfiled" strip. Fixed a review finding (F1): an emptied-out edited proposal now
  raises an error instead of being stamped "filed" with nothing written.
- 003 — Project notes and waiting-on, editable in place · S03 · The project detail view
  gained a hand-typed note composer (`projects:createNote`/`removeNote`, byte-identical to
  the filing path, undoable) and an inline waiting-on composer (who required, what/since/due
  optional, via the existing `projects:patch`), both hash-guarded and reachable via `m`/`w`;
  the notes panel dropped its show/hide toggle and now always shows notes plus the composer.
  Fixed a review finding (F2): the renderer's own heading-alias resolution now agrees with
  the write path on which of "Notizen"/"Notes" wins when a file carries both.
- 004 — Where the project status and next step come from · S03 · Optional
  `status_set`/`next_step_set` frontmatter maps (`{at, by: user|suggestion|filing}`),
  stamped by the app on every write and shown as a quiet provenance line under status and
  next step, plus a "possibly outdated" badge when the project was touched since the step
  was written; the honest fallback shows no author when the file never recorded one.
- 013 — Favourite projects (star) and an order that matches how I work · S03 · New
  frontmatter field `favorite: boolean`, toggleable from the list and the detail; the
  project list's default sort now shows the last-touched project, then favourites, then
  the rest as one list (scope stacking removed, documented as this list's exception), with
  a starred stale project pulled into the current section; dashboard tiles
  (`ActiveProjectsTile`/`StaleProjectsTile`) and the filing/agent-link pickers put
  favourites first via a shared `favoritesFirst()` helper. Fixed a review finding: added
  the missing D1 test coverage for `favorite`'s derivation and patch allowlist.
- 011 — Journal: one entry instead of day and conversation · S04 · The day file's
  `## Day`/`## Conversation` split became one chronological stream (my prose plain,
  the app's replies as interleaved blockquote blocks); the screen lost its "Day"/"Talk"
  tabs for one column, one field, and a stance row (listen/tips/analyse) whose primary
  action reads "save" or "save and ask" — listen writes via `journal:append` and never
  touches the LLM gateway. Legacy `## Conversation` files stay readable and get an
  explicit, confirmed, one-way "move into the entry" fold (`journal:foldDay`), never
  automatic. Fixed two review findings: a duplicate-paragraph render when a new entry
  merged into existing prose in the stream, and a silent loss of an embedded answer
  block when editing a heading-less day.
- 012 — Journal: the interview, for when I do not know what to write · S04 · A fixed
  five-question interview (work/events/people/open/feeling) as a starting aid, run as a
  `Dialog` overlay with an optional one-question model follow-up on `journal-chat`; each
  answer writes as a question/answer pair into 011's day stream before the next question
  appears, skips write nothing, and the overlay honestly names whether it's running the
  fixed set or a routed model. Fixed four review findings after a first FAIL: a possible
  double-write on a fast double Ctrl+Enter, an unbacked "day is covered" closing claim,
  the engine line trusting client-side routing instead of the plan's own server-decided
  mode, and a missing `todosDue` follow-up context; also added D2's missing
  external-edit round-trip test and restored focus to the composer on close.
- 009 — Journal: filter for days that are not finished · S04 · New frontmatter field
  `closed: YYYY-MM-DD` (missing/null = not finished), set by the day close-out and by a
  new manual mark/reopen switch in the day header (`journal:setClosed`); the day list
  gained an "only open days" filter (off by default) built on a pure `isDayOpen`
  module and a session-scoped toggle store — today always first and never counted as
  open, no gap rows while filtered, a "nothing open" line at zero — plus a rail badge
  showing the open-days count that hides at zero. `JournalDay.closed` and `isDayOpen()`
  are the contract story 010's calendar marker builds on. Passed clean-agent review;
  fixed two findings (a wording note documented as a decision, wrong story-number
  comments corrected).
- 010 — Journal calendar view · S04 · A month grid (`MonthCalendar.tsx`) now sits above
  the day list, filtering the same `journal:list` data the list already reads — no new
  IPC, no vault-format change. Keyboard grid navigation (roving tabindex, arrows crossing
  month boundaries, PageUp/PageDown, Home/End) coexists with the existing day-list arrow
  handling via one added bail-out in `use-journal-keys.ts`; mood and 009's unfinished
  marker show per cell, a future day is only unselectable without an entry. Passed
  story-review-hard after one fix cycle (a wide-layout toolbar overflow plus five smaller
  findings); a narrow-layout overflow found during live smoke was fixed separately.
- 018 — Day close: a proposal I can check, not a dialog that hides the day · — · The
  blocking `CloseDialog` is gone; day-close now leaves its result as a non-modal
  `CloseProposal` card next to the day's own text, backed by a session store
  (`close-proposal.ts`) that survives navigating away and back but not an app restart.
  Apply/discard/run-again all wire through unchanged write paths (`expectedHash` guard,
  undo affordance); live smoke confirmed day text and proposal visible together.
- 019a — The app looks at my machine and tells me what it can carry · S06 · Permanent "This
  machine" card in the models tab: main detects RAM/VRAM/GPU/CPU/disk with per-platform
  timeouts degrading to "unknown", core's `judgeCapacity` turns facts into a heuristic
  capacity verdict, renderer assembles the plain-language sentence; passed clean-agent
  review with no fix cycle.
- 019b — One recommended model per task, in plain language and in money · S06 · New "Model
  recommendation" panel in the models tab: curated + live-enriched catalogue, reachability
  filter over the 019a capacity verdict, a hard sensitive-task rule (local or `no-training`
  only, `unknown` refused) with per-request OpenRouter enforcement, cost-per-run and
  needs-download labelling; accept-row/accept-all commit through the existing routing writer.
  Two clean-agent review-fix cycles, including a privacy-relevant reachability fix.
- 019c — A local runtime without typing a command · S06 · New "Local runtime (Ollama)" card in
  the models tab: install/start/pull entirely through confirmed proposals (download size,
  installer path, model dir, no-uninstall fact named upfront), progress and clean cancel for both
  the installer download and the NDJSON model-pull stream, pull list fed by 019b's
  reachable-after-download models. `story-review-hard` returned FAIL with 6 confirmed findings
  (partial file on cancel, dropped progress event, raw byte counts, silent plan-read failure,
  missing "no write permission" case, stale routing after a pull); one fix cycle resolved all six.
- 019 — Models without expertise (epic) · S06 · Umbrella for 019a–019d: machine scan,
  per-task recommendation with the sensitive-task rule, and guided local Ollama install all
  built and accepted; 019d (Claude/ChatGPT plan instead of a metered key) refined and
  **rejected** on 2026-08-21 — neither vendor permits or documents the path, so the epic closes
  with the API-key route as the only one.
- 019d — Use my Claude and ChatGPT plans instead of a second metered bill · — · **Rejected**,
  not built. Terms read at the source: Anthropic forbids third-party apps from using a Claude
  plan without prior approval; OpenAI documents no path for a third party to drive a
  ChatGPT-plan session. Full research record kept in the file for a future reopen.
- 014 — The maintenance run reports findings, not results · S05 · Renamed "Ergebnis" to "Befund"/"Befunde" across the German maintenance UI (screen, health card, dashboard tile, module view, settings, task label); English untouched; verified with a live smoke run.
- 015 — A near-duplicate can be resolved, not only compared · S05 · Discard-to-trash and supersede added as two honest ways out, both undoable, hash-guarded against stale runs; the check silences a pair once either page names the other; verified with a live smoke run of discard, undo and the stale-run conflict.
- 016 — An orphaned page can be linked where I say, not only where it is obvious · S05 · An orphan finding with no unambiguous fix now offers a searchable picker plus a one-click "link from module overview", with main (not the renderer) deciding the write target; reuses 015's discard action; verified with a live smoke run of pick, preview, confirm, undo and the stale-hash conflict.
- 017 — A finding says how it ends — and "looks fine" stays reversible · S05 · Cards now name every real way out (fix, handled-in-the-files re-check, snooze, dismiss, restore); dismissed/snoozed findings stay visible and reversible via a fourth filter axis, and the health card states what it excluded; verified with a live smoke run showing the hidden list and health note.
- 020 — Journal — announced and never followed up · S05 · Forward-looking sentences that no later entry addresses now surface as a loose-end finding, reminder and interview question, with an answer path that writes into today's entry, hash-guarded; verified with a live smoke run showing the loose-end group and count.
- 021 — A maintenance run I can see, stop and continue · — · Container story, split into
  021a/021b/021c (below) rather than built directly; all eleven acceptance criteria delivered
  across the three.
- 021a — A run I can see, from any screen · — · Progress is now visible from any screen and mid-run mount, weighted so the bar no longer freezes at ~83%, one owner for "a run is going" so the autorun is visible and cancellable too; a stale-event race found in review was fixed; verified with a live smoke run against the no-model demo vault.
- 021b — Stopping keeps what was found, and I can continue · — · Stopping a run now persists the findings the finished stages produced instead of throwing them away; the frozen health score and its date stand until a full run completes; continuing skips finished stages and feeds their findings back in as the base for the model stages; a `'shutdown'` cancel (vault close, quit) keeps nothing. A review-fix cycle closed three bugs: a first-ever partial run showing a computed score instead of "unknown", `closeVault()` not cancelling a running check, and resume clearing an already-fixed finding. Verified by manual acceptance against the test plan.
- 021c — I can check only a part · — · `gardener:run` now accepts a scope (kind/module); a scoped run merges its findings over the previous run's instead of replacing them, keeps the frozen health score and advice, skips out-of-scope checks and model stages, and stays scoped across resume; screen, health card and dashboard tile all name a scoped last check distinctly from a stopped one; a review-fix cycle closed a silent-data-loss bug where a scope naming only an unmodeled kind deleted prior findings; verified with a live smoke run against the no-model demo vault.
- 022 — A loose end is its own thing, not a wait · — · Loose ends left the "waiting on" tile (which is again only about what others owe me) and got their own dashboard tile plus an answerable row on the journal day they were announced on; the subject is now taken from the words nearest the date label instead of the sentence's first six, which also repaired the dated-todo subtraction, and a new `'open'` urgency stops a passed announcement from reading as overdue. `story-review-hard` returned FAIL with 3 confirmed bugs (wrong day's hash on answer, stale 2-arg `settled()` call on the model path, over-narrowed later-day match); one fix cycle resolved all three. Accepted by the user against the real vault on 2026-08-22.
- 023 — The module schema says one thing, not two · S07 · `docs/MODULE-SCHEMA.md` now mirrors `MODULE_SCHEMA_TEMPLATE` byte-for-byte behind a repo-only banner, closing the five-sprint-old red test; guardrail 2 (existing modules untouched) and the English-vault path got dedicated tests, and the decision is documented in the code docstring, `docs/README.md` and `docs/ROADMAP.md`.
- 025 — A screenshot run never reads my real session data · S07 · Codex sessions now seeded and pinned into the demo vault the same way Claude sessions already were, via one shared helper, guarded by a new settings check that fails the seed if a session dir points outside the vault, locked by tests; verified with a live smoke run of seed/build/shot plus a negative-path smoke.
- 024 — Filing writes headings in my document language · S07 · Filing, the capture proposal preview and a new settings migration card now all resolve the notes/todos/state/day/facts heading through one shared, document-language-aware table, re-resolving against the target file so an existing heading always wins over the setting; `story-review-hard` found four more gaps after the first fix cycle (renderer state panel, todo:add and new-project-creation still hardcoding German), all closed in a second fix cycle; verified with `npm run seed`/`shot` plus a targeted live drive of the proposal-heading preview and the migration card/dialog.
- 026 — German text closes its quotes, and three journal papercuts · S07 · The German i18n catalogue (100 occurrences across 13 files) now closes every `„` with `“` instead of a straight `"`, the convention is documented in `index.ts` and CLAUDE.md guardrail 7 and guarded by a new i18n test; a loose end with an unresolvable day now renders as plain text instead of a dead link; `DayList.tsx`, `DayEntry.tsx` and `HealthCard.tsx` now format dates via the shared `locale()` helper; verified with a full test/build/lint/typecheck pass plus a live smoke run (seed/shot and a targeted `_electron` drive of the Lose-Enden tile and Settings → Sprachen).
- 027 — The maintenance run state stops being one big file · S07 · `src/main/gardener-state.ts` (788 lines) and `src/main/ipc/gardener.ts` (409 lines) split along their five and two seams respectively; pure run-state logic (stored shapes, scope predicates, JSON reading, save-time merge/pruning, `present()`) moved into `src/core/gardener/`, Electron-facing glue (`gardener-run.ts`, `gardener-actions.ts`) stayed thin in `src/main/ipc/`; exported names, handler map and IPC contract untouched, all 021a/021b/021c tests pass unedited; `story-review-hard` found one real defect (a table-padding format:check break, fixed) and surfaced an unrelated pre-existing renderer bug (progress bar lost on screen remount, proven not to be this story's regression, left as a follow-up); verified with typecheck/lint/test/build plus a live-driven run of start/stop/continue/scope/close-vault-mid-run.
