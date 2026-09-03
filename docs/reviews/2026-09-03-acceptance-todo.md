# Acceptance todo — what to walk, what to expect

Companion to the [2026-09-03 architecture review](2026-09-03-architecture-review.md), section
3.7-1. Eight milestones are "built, acceptance pending": M4, M6, M9, M10, M11, M12, M13, M14,
plus S13 (M15 part one). This document says **what** to test and **what to expect** per story —
the how (black-box, exploratory) is yours. Each sprint's `testplan.md` has exact click-by-click
steps if an item is unclear; each story's file has the acceptance criteria and the decisions
behind them. Tick items off here as you go.

## Setup

- `npm run seed` then `npm run dev`. Most items run against the demo vault (`.demo-vault/`);
  **M6 (loose ends) is better against your real vault** — the demo vault cannot reproduce the
  wording it detects.
- **A local model must be configured** (Ollama or llama.cpp, Settings → Models) for the items
  marked _(model)_: the condensation golden paths (037/038, 044/045), the model-found loose end
  (020), and 042's run visibility — the model-less demo run finishes in under a second, too
  fast to observe.
- Suggested order: the journal block first (S13 — smallest, daily use), then maintenance
  (M4, M6), then the condensed layer as one block (M12 → M14 → M13), then machine/models
  (M10, M11), and M9's small checks in passing throughout.

## Known limitations — do not file these as bugs

- A stopped maintenance run keeps the last full run's health score; a first-ever partial run
  says "unknown" (021b, deliberate).
- Scoped maintenance runs skip the model stages entirely (021c, deliberate).
- The condensed panel shows raw YAML frontmatter above the sections — known, filed in S12.
- VRAM shows "unknown" on Windows cards ≥ 4 GB until entered by hand — that is what 028 exists
  for, not a bug.
- 034's full acceptance (engine genuinely absent, weak GPU) needs the test user's laptop; test
  what your machine allows.
- 042's tray-quit close door has no UI path — no tray exists yet (review story 058);
  only title-bar close and `Alt+F4` can be exercised.
- Anything already in the [review's findings](2026-09-03-architecture-review.md) (stories
  050–065) is known — no need to re-report it.

If something else is wrong: note it and cut a correction story, the M8 pattern. Acceptance of
a milestone is yours to mark in the roadmap.

---

## S13 — the day is one text field (M15 part 1)

Testplan: [sprints/S13/testplan.md](../sprints/S13/testplan.md)

- [ ] **047 — day view order** ([story](../requirements/done/047-the-day-view-reads-in-the-order-i-write-in.md)).
      Test: open a journal day (wide and narrow window) and read top to bottom. Expected: head →
      chips → mood → energy → interview (small) → the day's own text field (always editable, no
      pencil mode) → close action → facts → history → coach field last; the close action exists
      exactly once.
- [ ] **048 — fields are visible, send on button only** ([story](../requirements/done/048-the-field-i-write-in-is-visible-and-sends-when-i-say-so.md)).
      Test: type into the day field and the coach field; try `Enter`, `Shift+Enter`,
      `Ctrl+Enter`, `Esc`. Expected: both fields sit on a visibly bordered surface with a focus
      ring; every Enter variant only breaks the line, only the button commits, `Esc` blurs
      without losing the draft. Counter-check: the Ask overlay still submits on plain `Enter`.
- [ ] **049 — one button closes the day** ([story](../requirements/done/049-one-button-closes-the-day.md)).
      Test: close a day with text, a day without text, and reopen a closed day. Expected: "Tag
      abschließen" is the only close path (the old manual switch is gone); it shows a proposal —
      honestly empty on a text-less day or without a model — and marks the day closed on accept;
      a closed day shows a badge plus a "Wieder öffnen" ghost action.

## M4 — a finding can be acted on (S05)

Testplan: [sprints/done/S05/testplan.md](../sprints/done/S05/testplan.md). Run "Jetzt prüfen"
on the Pflege screen first; the seeded vault ships the fixtures (near-duplicate pair, orphan
page, two journal announcements).

- [ ] **014 — findings, not results** ([story](../requirements/done/014-maintenance-says-befund.md)).
      Test: read the maintenance cards in passing. Expected: the German UI says "Befund/Befunde"
      wherever a maintenance finding is meant — nothing claims to be a "result".
- [ ] **015 — resolve a near-duplicate** ([story](../requirements/done/015-resolve-a-near-duplicate.md)).
      Test: on the near-duplicate card, discard the `-2.md` page, then undo; also try
      "Überholt: A → B". Expected: the dialog shows the exact catalog line to be removed and
      inbound links before anything happens; after discard the file is in
      `.secondbrain/trash/` and Rückgängig restores it byte-for-byte; a re-run finds the pair
      again.
- [ ] **016 — orphan page, I pick the target** ([story](../requirements/done/016-orphan-page-i-pick-the-target.md)).
      Test: on the orphan finding, pick a target page for the link. Expected: the preview shows
      verbatim the body line that will be written into the target; after accept the link exists
      as a body line, and undo takes exactly that line back out.
- [ ] **017 — a finding says how it ends** ([story](../requirements/done/017-a-finding-says-how-it-ends.md)).
      Test: read any finding card's action row; use "Ist kein Problem" and take it back.
      Expected: every card names all its exits (fix, open, done-by-hand, snooze, dismiss);
      anything that writes shows the line first; anything that writes nothing is called "open",
      not "merge"; dismiss is reversible without a new run.

## M6 — journal loose ends (S05, best on the real vault)

Testplan: [sprints/done/S05/testplan.md](../sprints/done/S05/testplan.md), use case 020.

- [ ] **020 — announced and never followed up** ([story](../requirements/done/020-journal-loose-ends.md)).
      Test: write a forward-looking sentence ("morgen ist der Notartermin") on a day, let its
      date pass with no later entry addressing it; then answer it. Expected: it appears as a
      loose end (own tile since M8, journal row on the announcing day, maintenance finding);
      answering writes into **today's** entry with a back-reference; a later entry that speaks
      to it closes it by itself. _(model)_ for the model-found variant — the heuristic variant
      needs none.

## M9 — the small things (S07, mostly in passing)

Testplan: [sprints/done/S07/testplan.md](../sprints/done/S07/testplan.md). 023/025/027 are
gate/dev-side stories — no manual UI step; the M4 walk above covers 027 implicitly.

- [ ] **024 — filing uses my document language** ([story](../requirements/done/024-filing-uses-my-document-language.md)).
      Test: file a dump into a project/area and look at the written headings; switch
      `languages.documents` in settings. Expected: headings match the configured document
      language ("## Status/Notes" vs "## Stand/Notizen"); an existing file's headings are reused,
      never duplicated; the language switch warns and offers a migration instead of silently
      accepting.
- [ ] **026 — German quotes** ([story](../requirements/done/026-german-quotes-and-journal-papercuts.md)).
      Test: read German UI strings anywhere quotes appear. Expected: always the low-high pair
      „…" (never a straight closing quote).

## M10 — it fits my machine, and I can hand it on (S08)

Testplan: [sprints/done/S08/testplan.md](../sprints/done/S08/testplan.md)

- [ ] **028 — I fill in what the scan missed** ([story](../requirements/done/028-i-fill-in-what-the-scan-missed.md)).
      Test: Settings → Models → scan the machine; enter VRAM by hand (also try junk values:
      empty, `0`, `-5`, `abc`). Expected: invalid input shows an inline error and changes
      nothing; a valid value shows with a "Von dir eingetragen" badge, survives a re-scan, and
      the verdict/tier sentence tightens accordingly (it never widens — documented).
- [ ] **029 — resource budget** ([story](../requirements/done/029-how-much-of-this-machine-a-model-may-use.md)).
      Test: change the resource budget (slider since 035, default 80%). Expected: the
      recommendation plans against the budgeted share, and lowering it visibly shrinks what is
      recommended.
- [ ] **030 — the app is called Gaston** ([story](../requirements/done/030-the-app-is-called-guston.md)).
      Test: window title, dashboard, README-visible spots, and a **new** coach turn in the
      journal. Expected: "Gaston" everywhere new; an old journal day with `> **Second Brain**`
      turns still renders correctly — nothing in the vault was rewritten.
- [ ] **031 — a build I can hand on** ([story](../requirements/done/031-a-build-i-can-hand-on.md)).
      Test: run `npm run handoff`; unpack the ZIP somewhere clean and start it. Expected: the
      ZIP carries a recipient readme and nothing of yours (no vault, no keys); first start shows
      language + vault choice and an honest "no model configured"; SmartScreen warning is
      expected (unsigned, documented).

## M11 — a local engine for a machine that is not mine (S09)

Testplan: [sprints/done/S09/testplan.md](../sprints/done/S09/testplan.md)

- [ ] **035 — the machine card remembers** ([story](../requirements/done/035-the-machine-card-remembers-and-speaks-plainly.md)).
      Test: scan, restart the app, read the card. Expected: the scan result survives the
      restart (stored machine-locally, not in the vault); VRAM is asked in GB; the explanation
      is plain language, not parameter counts; the budget is a slider.
- [ ] **032 — a model that fits a weak machine** ([story](../requirements/done/032-a-model-that-fits-a-weak-machine.md)).
      Test: read the recommendation on/for a weak profile (low budget helps simulate).
      Expected: the catalogue offers 1B–4B models as their own class, and tasks beyond the
      machine are named as such — nothing routes to a model that would produce mush.
- [ ] **033 — llama.cpp installs from inside the app** ([story](../requirements/done/033-llama-cpp-is-a-runtime-the-app-can-install.md)).
      Test: in provider setup, add llama.cpp as a managed runtime and let the app fetch it plus
      a model file; cancel once mid-download, then retry. Expected: named in the runtime list
      next to Ollama, download with progress and working cancel (019c's shapes), nothing lands
      in the vault.
- [ ] **034 — the engine starts with fitting settings** ([story](../requirements/034-the-engine-starts-with-settings-that-fit-this-machine.md), still `in-progress`).
      Test: start/stop the engine from settings; read the derived values. Expected: layer
      count, context size, and threads derive from machine facts and budget, each with one
      sentence naming its trade-off; an already-running foreign llama.cpp is detected, not
      doubled. **Partially blocked:** full acceptance needs the test-user laptop (engine absent,
      weak GPU) — walk what your machine allows and leave the story open.

## M12 — an area gathers itself (S10)

Testplan: [sprints/done/S10/testplan.md](../sprints/done/S10/testplan.md)

- [ ] **036 — a day says which areas it belongs to** ([story](../requirements/done/036-a-day-says-which-areas-it-belongs-to.md)).
      Test: close a day whose text touches an area; edit the proposed area chips before
      accepting. Expected: the close proposal carries an areas row (honestly empty without a
      model), the picker can add an area the model did not propose, and accept writes `areas:`
      into the day's frontmatter without touching anything else.
- [ ] **037 — an area can be condensed** _(model)_ ([story](../requirements/done/037-an-area-can-be-condensed-into-one-file.md)).
      Test: on an area with notes and tagged days, trigger the condensation from its tab.
      Expected: a proposal with state/patterns/open sections, each with a source line; without a
      model an honest empty state with a settings link — never a mechanical fake; a reply citing
      a file the run never read is rejected deterministically.
- [ ] **038 — I see the diff before it is written** _(model)_ ([story](../requirements/done/038-i-see-what-a-condensation-changes-before-it-is-written.md)).
      Test: accept one run; reject another with a reason; edit the artifact by hand and run
      again. Expected: old vs new diff with removals as visible as additions; accept is
      hash-guarded with an undo copy in `.secondbrain/trash/`; a reject requires a reason that
      lands in the directives section and is never rewritten by a later run; a hand edit is
      flagged in the diff, never silently overwritten.
- [ ] **039 — maintenance says a condensation is due** ([story](../requirements/done/039-maintenance-says-a-condensation-is-due.md)).
      Test: change an area's source file after condensing, run maintenance. Expected: a
      "condensation due" finding (info severity, no fix action, no model needed); an area with
      material but no artifact reports "missing"; "open" routes in-app to the area's tab, not
      the OS editor.

## M13 — evidence stays primary, the run stays visible (S11)

Testplan: [sprints/done/S11/testplan.md](../sprints/done/S11/testplan.md). 041 (line endings)
is a gate story: `npm run verify` green on Windows is its acceptance, no UI step.

- [ ] **040 — an answer cites the source, never the condensation** ([story](../requirements/done/040-an-answer-cites-the-source-never-the-condensation.md)).
      Test: condense an area, then ask a question whose answer is in the artifact's content.
      Expected: the answer cites the primary sources (area file, journal days), never
      `*.condensed.md` — with and without a model; the artifact still appears in Ctrl+K search;
      the condensed tab carries one line saying it is not cited as evidence.
- [ ] **042 — the run stays visible wherever I am** _(model, so the run is slow enough)_ ([story](../requirements/042-a-maintenance-run-stays-visible-wherever-i-am.md)).
      Test: start a maintenance run, navigate across screens, stop it from elsewhere, and close
      the app mid-run. Expected: progress lives in the shell and survives navigation (the old
      vanishing-bar bug is the thing being fixed); stop works from any screen and keeps finished
      stages; closing warns and offers stop-and-close. Tray-quit path: not testable yet (no
      tray).
- [ ] **043 — I can delete a condensed artifact** ([story](../requirements/043-i-can-delete-a-condensed-artifact.md)).
      Test: delete an artifact from the condensed tab; undo it; delete again and run
      maintenance. Expected: the dialog names what goes — explicitly that the directives die
      with it; undo restores via trash; after a real delete the tab is honestly "never
      condensed", search drops the document, and 039 reports "material, no artifact"; works
      without a model.

## M14 — a project gathers itself (S12)

Testplan: [sprints/done/S12/testplan.md](../sprints/done/S12/testplan.md)

- [ ] **044 — a project can be condensed** _(model)_ ([story](../requirements/done/044-a-project-can-be-condensed-into-one-file.md)).
      Test: condense a project that has notes, todos/waiting-on, journal mentions, and a linked
      agent session. Expected: four sections (state, next step, waiting on, learned), each with
      source lines; agent sessions cited as `agent:claude/<key>`; truncation, where inputs were
      bounded, is stated in the artifact.
- [ ] **045 — the project's diff before the write** ([story](../requirements/done/045-i-see-what-a-projects-condensation-changes-before-its-written.md)).
      Test: repeat the 038 walk on the project's "Knowledge" tab (`?tab=knowledge`). Expected:
      identical behaviour to the area tab — diff, hash-guarded accept, reject-with-reason into
      directives, delete — and a same-named area and project never leak into each other.
- [ ] **046 — maintenance says a project's condensation is due** ([story](../requirements/done/046-maintenance-says-a-projects-condensation-is-due.md)).
      Test: change project inputs after condensing, run maintenance; check a `done` project.
      Expected: due/missing findings per project, distinct from same-slug area findings; "open"
      routes to the project's Knowledge tab; `done`/`dropped` projects are skipped, `paused`
      is not.

---

When a milestone's items are all green, mark it accepted in [ROADMAP.md](../ROADMAP.md) — the
"accepted" marker is yours alone to set. If a walk finds something real, cut it as a correction
story rather than fixing inline; that is the M8 pattern and it worked.
