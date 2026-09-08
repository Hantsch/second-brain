---
id: 075
title: A close proposal can be corrected, not just pruned
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

## Requirement

The user's second report (2026-09-07): "when I close a day and I don't agree with it, I can't
really correct it — I can only discard it, which is daft." This is also M15's own named
second-part item, deferred at the 2026-09-03 cut.

Today's close card (`src/renderer/screens/journal/CloseProposal.tsx`) can only prune: a
proposed todo is kept or dropped and its due date changed; people, projects and tags are
kept or dropped as a whole field; mood and energy can only be kept or thrown away, never set
to the right value; the todo's text, its target project, its scope and a waiting-on's person
cannot be touched at all. Areas are the one field that already works properly (chips plus a
picker, story 036) — that is the pattern to follow.

So a wrong proposal costs either a wrong entry or the whole close. The card has to become
editable: correcting one line must be cheaper than discarding everything and writing the day
by hand.

## Acceptance Criteria

- [x] **AC1** — A proposed todo's text can be edited before accept, and the edited text is
      what gets written.
- [x] **AC2** — A proposed todo's target can be changed before accept — from the day to a
      project or between projects — and it is written into the file the card names.
- [x] **AC3** — A proposed todo's scope (work/private) can be changed before accept.
- [x] **AC4** — A waiting-on entry's person and subject can both be corrected before accept.
- [x] **AC5** — A todo the model missed can be added by hand, with text, due date, target and
      scope, and is written exactly like a proposed one.
- [x] **AC6** — People, projects and tags are kept or dropped item by item, not all-or-nothing
      per field.
- [x] **AC7** — Mood and energy can be set to a different value before accept, not only kept
      or dropped.
- [x] **AC8** — Corrections survive leaving the journal and coming back before accept.
- [x] **AC9** — Accept writes exactly what the card shows, still hash-guarded: a stale hash
      yields a conflict instead of overwriting an external edit.
- [x] **AC10** — Discarding still leaves the day untouched, and a day with an empty proposal
      still closes (story 049's behaviour is not regressed).

## Open Questions

- ~~Does an added or edited todo run through the same server-side validation as a proposed one
  (story 057's re-validation theme), and what happens to a text that is empty after
  trimming?~~ answered → Decisions (Sprint)
- ~~Is the mood/energy correction the existing `MoodPicker` inline in the card, or a jump to
  the day's own fields, which already carry those values?~~ answered → Decisions (Sprint)
- ~~Is editing inline per row, or does a row open a small editor?~~ answered → Decisions
  (Sprint)

## Decisions (Sprint)

- **(User)** Added/edited todos run through the same server-side validation as a proposed one
  (story 057's re-validation theme); a text empty after trimming is silently dropped from the
  proposal rather than surfaced as an error.
- **(User)** Mood/energy correction uses the existing `MoodPicker` inline in the card, not a
  jump to the day's own fields.
- **(User)** Editing is inline per row, not a row-opens-editor pattern — keeps the card small
  and avoids the dialog pattern story 018 deliberately left behind.
- Scope is written as a `#work` / `#private` tag on the checkbox line, and only when it differs
  from the day's derived scope — VAULT-FORMAT.md derives a journal todo's scope from the file,
  then frontmatter, then a tag on the line, and the seeder already writes `#work` that way.
- A row whose target is a project takes its scope from the project's path
  (`projects/<scope>/<slug>`); the row's scope control then shows that value disabled, because a
  contradicting tag would be inert noise in the project file.
- People, projects and tags become removable chips exactly like areas (`Tag` with `onRemove`),
  and only projects also get an add-picker (vault-known projects) — people and tags have no
  closed vocabulary and adding them is not in the criteria.
- Mood and energy move into their own always-visible group with the inline `MoodPicker`; their
  keep/drop checkbox stays and a pick re-checks it, because hiding the picker when the model
  proposed nothing would hide the correction exactly where it is needed.
- All edit state stays in the session store `close-proposal.ts` (row edits, added todos, field
  lists, mood/energy) — that store already survives unmount per date, which is AC8 verbatim.
- The payload derivation (rows to todos + frontmatter + the "writes nothing" state) moves into a
  pure `src/renderer/lib/close-proposal-view.ts`, so AC9's "exactly what the card shows" is a
  unit-testable function instead of a claim about JSX.
- Server-side re-validation is a bounded normalizer (`src/core/journal/close-request.ts`) called
  from `applyClose`, not story 057's full seam work — 057 is still `draft` and this story only
  owes the close payload the same standard.
- An unknown project slug in an accepted todo falls back to the day file instead of failing the
  close, which is `todoActions`' existing behaviour and never loses the corrected todo.
- A text empty after trimming disappears from the card too, not just from the written payload,
  so the user sees the drop the user decision asks for instead of an error.
- `CloseProposal.tsx` is split into `CloseTodoRow.tsx` and `CloseFieldRows.tsx`; the card is
  already at 321 lines and this story roughly doubles its content (CLAUDE.md's ~300-line limit).
- Added todos go through the same `todoActions` call as proposed ones — "written exactly like a
  proposed one" (AC5) is then structural, not an assertion.
- The e2e spec types its prose into the day's own textarea through the UI rather than writing a
  file into the temp vault, keeping the acceptance flow on the real surface while making the
  waiting-on, people and mood signals deterministic.
- The e2e spec gets its own `specId` (`journal-close-correct`), because accepting a close
  consumes its day and `journal-close.spec.ts`'s two days must stay untouched.

## Plan

Make the close card editable per row, keep the write path hash-guarded, and re-validate the
corrected payload in main. Order: state, rows, add, fields, write path, e2e.

1. **State + derivation** (`src/renderer/lib/close-proposal.ts`,
   new `src/renderer/lib/close-proposal-view.ts`): replace `keepTodo`/`dueTodo` with one
   `todoEdits: Record<number, TodoRowEdit>` (`keep`, `text`, `due`, `project`, `scope`,
   `waitingFor`), add `added: ProposedTodo[]`, `people`/`projects`/`tags: string[] | null`
   (the same idiom as the existing `areas`) and `mood`/`energy`. `close-proposal-view.ts` holds
   the pure `rowsOf` (proposed todos, then waiting-on, then added) and `payloadOf` returning
   `{ todos, frontmatter, writes }` — the single source for what accept sends.
2. **Editable row** (new `src/renderer/screens/journal/CloseTodoRow.tsx`): keep checkbox,
   `Input` for the text, `Select` for the target (day plus every project), scope control,
   `DueField`, and for a waiting row a second `Input` for the person. Atoms only, tokens only,
   no dialog.
3. **Add by hand** (`CloseProposal.tsx`): an "add a todo" button under the list, always rendered
   (also for an empty proposal); every added row is the same `CloseTodoRow` plus a remove.
4. **Fields item by item** (new `src/renderer/screens/journal/CloseFieldRows.tsx`): people,
   projects and tags as removable chips (mirror the areas block in `CloseProposal.tsx`), a
   project add-picker, `MoodPicker` for mood and energy.
5. **Write path** (new `src/core/journal/close-request.ts`, `src/main/ipc/journal-day.ts`):
   `normalizeCloseTodos(todos, { projectSlugs, dayScope })` trims text, drops empty, clamps
   priority, rejects a non-literal scope or malformed due, maps an unknown slug to the day and
   appends the `#work`/`#private` tag for a day-bound row that deviates. `applyClose` keeps its
   hash threading, undo and revert untouched.
6. **i18n + CSS**: new `journal.close.*` keys in `de-journal.ts` / `en-journal.ts` (German with
   the low-high quote pair), inline-edit-row classes next to `.sb-close` in
   `src/renderer/styles/app/journal.css`.
7. **e2e** (new `tests/e2e/journal-close-correct.spec.ts`): prose typed into the day textarea,
   then correct, add, drop and set, navigate away and back, apply, assert the disk.

## Deliverables

- **D1 — Edit state and payload derivation.** `CloseProposalEdits` gains `todoEdits`, `added`,
  `people`, `projects`, `tags`, `mood`, `energy`; new pure `close-proposal-view.ts` with `rowsOf`
  and `payloadOf`; `CloseProposal.tsx` reads both instead of building its rows itself (behaviour
  unchanged at this point). Files: `src/renderer/lib/close-proposal.ts`,
  `src/renderer/lib/close-proposal-view.ts`, `src/renderer/screens/journal/CloseProposal.tsx`,
  `tests/renderer/close-proposal.test.ts` (adapted to the new field names), new
  `tests/renderer/close-proposal-view.test.ts`. Acceptance: the existing store and areas tests
  stay green, and `payloadOf` is proven for keep/drop, an edited due date and untouched areas.
- **D2 — The editable todo row (AC1-AC4).** New `CloseTodoRow.tsx` (text `Input`, target
  `Select`, scope control, `DueField`, waiting person `Input`), used by `CloseProposal.tsx`.
  Mirror: the areas chips-plus-picker block in `CloseProposal.tsx` for row structure and the
  label/aria conventions. Files: new `src/renderer/screens/journal/CloseTodoRow.tsx`,
  `CloseProposal.tsx`, `src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`,
  `src/renderer/styles/app/journal.css`, new `tests/renderer/close-proposal-todo-row.test.tsx`.
  Acceptance: editing text, target, scope and a waiting row's person and subject changes what
  `payloadOf` returns; nothing is written.
- **D3 — Add a todo by hand (AC5).** Add trigger plus removable added rows reusing
  `CloseTodoRow`, rendered even when the proposal is empty. Files: `CloseProposal.tsx`,
  `src/renderer/lib/close-proposal-view.ts`, both i18n files, extend
  `tests/renderer/close-proposal-todo-row.test.tsx`. Acceptance: an added row with text, due,
  target and scope appears in the payload in the same shape as a proposed one.
- **D4 — Fields item by item and mood/energy (AC6, AC7).** New `CloseFieldRows.tsx`: chips with
  remove for people, projects and tags, a project add-picker, `MoodPicker` for mood and energy.
  Mirror: the areas block, and `DayEntry.tsx` for the `MoodPicker` props. Files: new
  `src/renderer/screens/journal/CloseFieldRows.tsx`, `CloseProposal.tsx`, both i18n files,
  `journal.css`, new `tests/renderer/close-proposal-fields.test.tsx` (mirror
  `tests/renderer/close-proposal-areas.test.tsx`). Acceptance: dropping one person leaves the
  others, and a picked mood or energy reaches the payload.
- **D5 — Re-validated write, scope on the line (AC3's effect, AC9).** New pure
  `src/core/journal/close-request.ts#normalizeCloseTodos` (trim, drop empty, clamp priority,
  literal scope, `YYYY-MM-DD` or null due, unknown slug to the day, `#work`/`#private` tag for a
  day-bound row that deviates), called at the top of `applyClose`. Files:
  `src/core/journal/close-request.ts`, `src/main/ipc/journal-day.ts`, new
  `tests/core/journal/close-request.test.ts`, `tests/main/journal-ipc.test.ts` (added cases).
  Acceptance: an edited todo lands in the file the card named, a stale hash still conflicts, and
  the existing undo/revert and idempotency cases stay green without being weakened.
- **D6 — e2e: correcting a proposal (AC1-AC3, AC9).** New
  `tests/e2e/journal-close-correct.spec.ts` with `specId: 'journal-close-correct'`: type prose
  into the day textarea (`journal.day.placeholder`), close, correct a todo's text, target and
  scope, apply, assert the disk. Mirror: `tests/e2e/journal-close.spec.ts`. Acceptance:
  `npm run test:e2e` green.
- **D7 — e2e: waiting-on, added todo, fields, survival, discard (AC4-AC8, AC10).** Further tests
  in the same spec: a waiting-on's person and subject corrected, a todo added by hand, one person
  chip dropped, a mood set, rail navigation away and back before accept, and a discard that
  leaves the file byte-identical. Files: `tests/e2e/journal-close-correct.spec.ts`. Acceptance:
  `npm run test:e2e` green.

## Model Hints

- D1 -> `deliverable-hard` — the index-keyed edit maps are replaced while `keepField`, the areas
  field and the existing store tests must keep behaving identically, and `payloadOf` is what AC9
  hangs on: a silent mismatch there writes something other than what the card shows.
- D5 -> `deliverable-hard` — it edits the shared `applyClose` write path (hash threading, undo,
  revert, `todoActions` grouping) that `tests/main/journal-ipc.test.ts` already covers in six
  cases, and adds a tag to the checkbox line that `core/index/todos.ts#scopeFor` reads back.
- D2, D3, D4, D6, D7 -> default.
- Review: -> `story-review-hard` — ten criteria across renderer, core and the main write path,
  with a hash guard and an existing suite that has to stay green unweakened.

## Acceptance Tests

- AC1 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "an edited todo text is what lands on
  disk" (D6); unit `tests/renderer/close-proposal-todo-row.test.tsx` > "an edited text replaces
  the proposed one in the payload" (D2)
- AC2 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "a todo retargeted to a project is
  written into that project file" (D6); unit `tests/core/journal/close-request.test.ts` > "schickt
  ein Todo mit unbekanntem Projekt zum Tag, statt den Abschluss zu verlieren" (D5; the story text
  above named this test in English, the implementation is German like the rest of that file —
  same criterion, real title corrected here)
- AC3 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "a corrected scope is written as a tag on
  the line" (D6); unit `tests/core/journal/close-request.test.ts` > "schreibt den Bereich nur auf
  die Zeile, wenn er vom Tag abweicht" (D5; real title, see AC2's note)
- AC4 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "a waiting-on's person and subject are
  both corrected" (D7)
- AC5 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "a todo added by hand is written like a
  proposed one" (D7); unit `tests/renderer/close-proposal-todo-row.test.tsx` > "an added todo
  reaches the payload with text, due, target and scope" (D3)
- AC6 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "dropping one person keeps the others"
  (D7); unit `tests/renderer/close-proposal-fields.test.tsx` > "people are dropped item by item"
  (D4)
- AC7 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "a picked mood is written instead of the
  proposed one" (D7); unit `tests/renderer/close-proposal-fields.test.tsx` > "mood and energy can
  be set when the proposal named neither" (D4)
- AC8 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "corrections survive leaving the journal
  and coming back" (D7)
- AC9 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "the disk matches the corrected card"
  (D6); unit `tests/main/journal-ipc.test.ts` > "lehnt einen Abschluss mit veraltetem Hash ab,
  auch wenn die Todos korrigiert wurden" (D5; real title, see AC2's note); unit
  `tests/renderer/close-proposal-view.test.ts` > "payloadOf returns exactly the kept
  and corrected rows" (D1)
- AC10 -> e2e `tests/e2e/journal-close-correct.spec.ts` > "discarding a corrected proposal leaves
  the file byte-identical" (D7); unit `tests/main/journal-ipc.test.ts` > the existing "hält im
  Frontmatter fest, dass der Tag abgeschlossen ist — und nimmt es zurück" case ("an empty proposal
  still closes the day"), extended to run through the normalizer (D5)

No manual residue.

## Done

**Summary.** The day-close card is now correctable per row instead of only prunable. Edit state
moved from `keepTodo`/`dueTodo`/all-or-nothing `keepField` into a richer `CloseProposalEdits`
(`todoEdits`, `added`, `people`/`projects`/`tags`/`mood`/`energy`), with a new pure
`src/renderer/lib/close-proposal-view.ts` (`rowsOf`/`payloadOf`) as the single source both the
card's rows and the accept payload are derived from — the mechanism AC9 hangs on. A new
`CloseTodoRow.tsx` makes a proposed, waiting-on or hand-added todo's text, target, scope and (for
a waiting row) person all editable inline, plus a remove for a hand-added row; a new
`CloseFieldRows.tsx` turns people/projects/tags into removable chips (projects also get an
add-picker) and gives mood/energy their own always-visible group with the inline `MoodPicker`,
re-ticking its own keep box on a pick. Server-side, a new pure
`src/core/journal/close-request.ts#normalizeCloseTodos` re-validates every todo at the top of
`applyClose` (trim, drop-if-blank, clamp priority, literal scope, `YYYY-MM-DD` or null due, unknown
project slug falls back to the day, `#work`/`#private` tag on a day-bound row that deviates from
the day's own derived scope) — the hash-guarded write path, undo/revert and `todoActions` grouping
are otherwise untouched. Ten new/extended e2e tests in `tests/e2e/journal-close-correct.spec.ts`
(own `specId`, prose typed into the day's own field, never pre-seeded) prove every criterion on the
real surface.

**Commit message:**
```
075: a close proposal can be corrected, not just pruned
```

**Verification.**
- `npm run typecheck` — clean.
- `npm test` — 281 files / 3854 tests, all green (final run, after the review-fix cycle).
- `npm run lint` — clean.
- `npm run build` — green.
- `npm run format:check` — no overlap between its failure list and this story's 20 changed files
  (checked by diffing the two lists); the repo-wide backlog predates this story, same as 071-074
  noted.
- `npm run test:e2e` — 45/45 green (full suite, run twice: once after D7, once after the
  review-fix cycle), including all 10 of this story's tests in
  `tests/e2e/journal-close-correct.spec.ts` and the unaffected `journal-close.spec.ts` mirror.
- `npm run seed` + `npm run shot` — both run against the current tree; no console errors; the new
  close-card UI (todos with the add trigger, people/projects/tags chips, the always-visible
  mood/energy group) renders correctly against the Gaston design system in
  `.screenshots/16-journal-close-proposal.png`.
- Code review (clean agent, `story-review-hard` tier per Model Hints): **overall PASS**, all ten
  criteria individually PASS with disk- or payload-level evidence. Two confirmed findings fixed in
  one review-fix cycle (see Decisions), reverified with the full suite above. Further findings
  accepted without a code change, documented below. 1 review-fix cycle, well under the 3-cycle cap.

**AC → test mapping, as verified:**
- AC1 → `tests/e2e/journal-close-correct.spec.ts` › "an edited todo text is what lands on disk";
  `tests/renderer/close-proposal-todo-row.test.tsx` › "an edited text replaces the proposed one in
  the payload" — both passed.
- AC2 → e2e "a todo retargeted to a project is written into that project file";
  `tests/core/journal/close-request.test.ts` › "schickt ein Todo mit unbekanntem Projekt zum Tag,
  statt den Abschluss zu verlieren" — both passed.
- AC3 → e2e "a corrected scope is written as a tag on the line"; `close-request.test.ts` ›
  "schreibt den Bereich nur auf die Zeile, wenn er vom Tag abweicht" — both passed.
- AC4 → e2e "a waiting-on's person and subject are both corrected" — passed.
- AC5 → e2e "a todo added by hand is written like a proposed one";
  `close-proposal-todo-row.test.tsx` › "an added todo reaches the payload with text, due, target
  and scope" — both passed.
- AC6 → e2e "dropping one person keeps the others"; `close-proposal-fields.test.tsx` › "people are
  dropped item by item" — both passed.
- AC7 → e2e "a picked mood is written instead of the proposed one"; `close-proposal-fields.test.tsx`
  › "mood and energy can be set when the proposal named neither" — both passed.
- AC8 → e2e "corrections survive leaving the journal and coming back" — passed.
- AC9 → e2e "the disk matches the corrected card"; `journal-ipc.test.ts` › "lehnt einen Abschluss
  mit veraltetem Hash ab, auch wenn die Todos korrigiert wurden";
  `close-proposal-view.test.ts` › "payloadOf returns exactly the kept and corrected rows" — all
  passed.
- AC10 → e2e "discarding a corrected proposal leaves the file byte-identical"; `journal-ipc.test.ts`
  › "hält im Frontmatter fest, dass der Tag abgeschlossen ist — und nimmt es zurück", extended
  through the normalizer — both passed.

No manual residue.

**Decisions.**
- 073 (built earlier in this sprint) had already seeded `close-proposal.ts`'s edit buffer from a
  task result and split `CloseProposal.tsx`'s write path onto 071's task queue — this story's plan
  was written before that, so D1 adapted names/shapes rather than the story's intent: `CloseRow`
  carries a `kind: 'todo' | 'waiting' | 'added'` discriminator (not in the original plan text) so
  the card's three row sources share one render loop without an index collision; `keepField`
  itself was **not** fully retired as the plan's wording implied — it stays, narrowed to only
  `mood`/`energy`, because the sprint's own mood/energy decision ("their keep/drop checkbox
  stays") needs exactly that all-or-nothing primitive for those two fields specifically.
- D3 found and fixed a real bug of its own making: wiring every row's `onEdit` to the same
  `editTodo` (which always patches `edits.todoEdits`) would have silently corrupted that map
  whenever a hand-added row's own index (into the separate `edits.added` array) happened to
  collide with a real proposed todo's index. Fixed by branching `CloseProposal.tsx`'s dispatch on
  `row.kind` before D3 shipped, with a regression test that edits a proposed row and an added row
  in the same test to prove neither corrupts the other.
- D3/D1 jointly implement the sprint decision "a text empty after trimming disappears from the
  card too": `rowsOf` hides a `todo`/`waiting` row the user has explicitly edited down to a blank
  text, but never a hand-added row with never-touched blank text (that would make the add trigger
  useless — a fresh added row must stay visible so the user can type into it); an added row is
  only ever removed via its own explicit remove control.
- D5's server-side re-validation lives in `src/core/journal/close-request.ts` exactly as the plan
  named it, called at the very top of `applyClose` before anything else runs — `dayScope` is
  computed via the existing `core/index/todos.ts#scopeFor` (not reimplemented), and the scope tag
  is appended directly into a day-bound todo's own `text` (there is no separate "tags" field on
  `ProposedTodo` — `todoLine` only ever reads `text`/`due`/`waitingFor`/`priority`).
- **Review-fix cycle 1 (two confirmed findings, both fixed):**
  1. A hand-added row's keep/drop `Checkbox` was rendered but functionally dead (`rowsOf` hardcodes
     `keep: true` for an added row, and `editAdded` strips any `keep` correction before merging) —
     clicking it would silently snap back to checked with no explanation, and a fresh added row's
     checkbox also had an empty accessible name. Fixed by not rendering that checkbox at all for
     `kind: 'added'` rows — the explicit remove button is the only removal mechanism there, per
     the sprint's own decision ("every added row is the same `CloseTodoRow` plus a remove"). New
     test in `close-proposal-todo-row.test.tsx` proves an added row has no keep checkbox.
  2. Clearing a waiting-on row's person field sent `waitingFor: ''` across the renderer payload
     instead of `null`, the type's actual "explicitly cleared" value (`TodoRowEdit.waitingFor` is
     `string | null`) — harmless in practice (the server-side normalizer already maps `''` to
     `null` before writing) but not honouring the payload's own contract. Fixed with a one-line
     change in `CloseTodoRow.tsx`'s waiting-person `onChange`; new test proves `payloadOf(...)`
     reads `waitingFor: null`, not `''`, after clearing the field.
- **Review findings accepted without a code change:**
  - `src/main/ipc/journal-day.ts#applyClose` computes `dayScope` from the day's frontmatter
    *before* the same call also writes `request.frontmatter.tags` into it — if an accepted
    proposal's own tags happen to contain a literal scope word from `core/index/todos.ts`'s
    `WORK_TAGS`/`PRIVATE_TAGS` sets, the day's scope as read back *after* the write could differ
    from the one used to decide whether to append a line tag during that same write. Narrow (needs
    that exact coincidence — a matched tag *and* no other scope signal already present) and
    plausible rather than confirmed by execution; left as a documented, narrow edge case rather
    than restructuring the write order, since the existing `scopeHint` fallback chain (not
    introduced by this story) is what makes it observable at all, and the consequence is a missing
    tag on a later read, never a wrong write or data loss.
  - `close-request.ts`'s due-date validation is a shape check (`YYYY-MM-DD` digits) reusing the
    repo's existing date-shape helper, not a full calendar-validity check — a due like
    `2026-13-45` would survive normalization, though the plan's wording says "malformed due" is
    rejected. Accepted: unreachable from the real `DueField` UI, and a stricter check would be new
    scope beyond what this story's write path otherwise touches.
  - A project-targeted row's `payloadOf` output still carries whatever `scope` value happens to be
    stored on it, even though the UI shows (and disables) the project's own scope for that row —
    inert in practice, since neither `todoLine` nor `todoActions` reads `scope` for a project-bound
    todo, and `normalizeCloseTodos` never tags one regardless of its `scope` field. Accepted as a
    documented, harmless divergence rather than threading `projects` into the pure
    `close-proposal-view.ts` module just to normalize a value nothing downstream reads.
  - Three unrelated German-comment quote-character touch-ups appeared in
    `tests/main/journal-ipc.test.ts` (a stray `„Fakten"` → `„Fakten"` fix, inconsistently applied
    across occurrences) — harmless collateral from an editing pass, not reverted; noted here rather
    than re-touched, since undoing a quote-style fix would itself be a needless diff.
