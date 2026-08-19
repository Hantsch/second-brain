---
id: 011
title: Journal — one entry instead of day and conversation
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

The split between "Day" and "Conversation" does not match how I use this. For me it is
**one** thing: I write my day. Right now the screen asks me to decide first _where_ I
am writing — into the day text, or into the talk — and the two are separate tabs with
separate fields, separate save behaviour, and separate sections in the file.

The way I actually think about it: there is one field, I write into it, and the
**stance** decides what happens next.

- **Listen** — it is simply filed. No answer, no advice. What I wrote is the entry.
- **Tips** — it gives me feedback on the day, concrete and small.
- **Analyse** — it helps me understand a problem and it builds me up emotionally,
  rather than reporting patterns at me.

So the stance stops being "which conversation am I having" and becomes "what should the
app do with what I just wrote". Writing is always the same act.

This supersedes the line in [systems/navigation.md](../systems/navigation.md) that
says the journal stays untouched: the journal's inner structure changes here, its place
in the rail does not.

**What must not break:** what I wrote is written. My words go into the file before any
model is asked, and nothing the app generates ever overwrites them
([CONCEPT.md](../CONCEPT.md), guardrail 2). The file stays the truth, and it stays
readable in Obsidian.

## Acceptance Criteria

- [x] One writing surface per day. I do not choose a target before writing — no "Day"
      vs "Conversation" decision.
- [x] The stance is picked next to the field (listen / tips / analyse), switchable per
      entry, with the default coming from the journal settings as it does today.
- [x] In "listen" nothing is generated at all. The entry is filed and that is the whole
      interaction — and this works with no model configured, without an error and
      without a dead state.
- [x] "Tips" responds to the day I just wrote with concrete, small steps.
- [x] "Analyse" helps me understand the problem and is emotionally supportive; it stays
      grounded in what is actually in my entries and does not invent history.
- [x] What I wrote is always distinguishable from what the app wrote — in the UI and in
      the file. No answer is ever mixed into my own prose.
- [x] My text reaches the file before the model is called. Model failure, abort, or app
      crash never loses a sentence.
- [x] Existing day files keep working: days that already have both a `## Day` and a
      `## Conversation` section render correctly and stay editable. Nothing is migrated
      behind my back.
- [x] Reading a day in Obsidian still makes sense: the sections are recognisable, and
      the format is documented in [VAULT-FORMAT.md](../VAULT-FORMAT.md).
- [x] Editing the day's prose afterwards still works, still hash-guarded — a stale hash
      yields `conflict`, not an overwrite.
- [x] The day close-out still finds what it reads today, and still does not turn the
      app's own sentences into todos.
- [x] Citations and deep links into a day (`#/journal?d=…`) keep landing.
- [x] Every label goes through `t()`, in `de` and `en`; sentence case, no emoji.

## Open Questions

- ~~**Does the file format change, or only the screen?**~~ answered → Decisions (Sprint)
- ~~Where does a response **appear** if there is one field~~ answered → Decisions (Sprint)
- ~~Can I write several times a day~~ answered → Decisions (Sprint)
- ~~Does the **stance stick per day**~~ answered → Decisions (Sprint)
- ~~Should "tips" and "analyse" still respond immediately~~ answered → Decisions (Sprint)
- ~~Do the mode hints in the settings need rewriting too~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** File format: one continuous chronological stream of entries with the
  app's answers interleaved — a real format change, including a migration story for
  existing `## Day` / `## Conversation` files.
- **(User)** Response placement: inline, directly under the paragraph it answers.
- **(User)** Entry granularity: one growing text per day, not several separate entries.
- **(User)** Stance is not a persisted per-day or per-entry field — it is an ephemeral
  choice made at the moment of writing/asking and does not need to be written into the
  file structure.
- **(User)** Tips/analyse respond only on request, never automatically after saving —
  writing never blocks on a model.
- **(User)** Mode hints in journal settings get their copy updated to match "analyse"
  now being emotionally supportive rather than pattern-finding.

### Decided during refine

- **Heading stays `## Day` / `## Tag`**, and a new day no longer gets a `## Conversation`
  heading at all — every existing reader (index excerpt, capture filing, close-out, todo
  home) already targets that heading, so reusing it keeps legacy files valid and the
  blast radius small.
- **My prose is plain Markdown, the app's answers are blockquote blocks**
  (`> **Second Brain** — HH:MM`, the existing `formatTurn`) inside that one section —
  the "my words vs. its words" distinction comes for free and stays Obsidian-legible.
- **"Inline under the paragraph it answers" = appended directly after the text I just
  wrote**; there is no "ask about an older paragraph" affordance in this story.
- **One primary action whose label follows the stance** (save / save and ask): the stance
  choice _is_ the request, so nothing is ever generated without me pressing it.
- **Listen goes through `journal:append`, tips/analyse through `journal:coach`** — that
  makes "no model was contacted" verifiable at the IPC boundary, not just in a prompt.
- **My text is written and the field cleared before the gateway is touched**; the
  streaming answer is a live block and only becomes file content when it completes
  (keeps today's `coach()` ordering).
- **`listen` stops calling the LLM entirely**: the listen stance prompt and
  `LISTEN_FORBIDDEN` go, `journalChatSystemPrompt` narrows to tips/analyse.
- **Analyse keeps the earlier-days evidence and its citations**, only the stance copy
  changes — the criterion demands grounding in real entries and no invented history.
- **`## Facts`, day close-out and todo home stay untouched**; `dayText()` additionally
  strips answer blocks so the app's own sentences can never become todos.
- **`JournalDay.turns` now means "number of app answers in the day"** (assistant speaker
  lines, counted in both formats) — the day-list dot keeps meaning "the app said
  something here".
- **`JournalDayView` gains `stream: JournalBlock[]`**; `text` keeps its meaning (the raw
  day section, for the hash-frozen edit-in-place) and `turns` keeps holding only legacy
  `## Conversation` turns.
- **Migration is one explicit per-day action** ("move the conversation into the entry"),
  hash-guarded and confirmed; until then a legacy day just renders its conversation as a
  legacy block — nothing is migrated behind my back.
- **Core exposes `appendEntry` / `appendAnswer` as the writing surface** — 012's
  interview writes its questions as answer blocks and my replies as entry blocks through
  exactly these two, so it has a stable target.
- **Editing keeps the existing `DayText` pencil over the raw day section** (answers
  visible as `> …` lines) with the unchanged `journal:setDay` frozen-hash guard — the
  conflict path stays exactly the one that is already tested.
- **The stance moves out of the composer footer into a labelled row beside the field**
  (still `CoachModeSwitch`, still Ctrl+1..3) — the criterion says "next to the field".
- **Seed keeps one legacy Day/Conversation day** next to new-format days, so the legacy
  render and the fold action are visible in the screenshots.

## Plan

The day file keeps **one** body section (`## Day` / `## Tag`) and that section becomes the
chronological stream: my paragraphs as plain prose, the app's answers as blockquote blocks
between them. `## Facts` is unchanged. `## Conversation` is never written again, but is
still read — and can be folded into the stream on request.

Order of work:

1. **Core, read** — new `src/core/journal/stream.ts`: `JournalBlock`,
   `parseStream(body)`, `formatEntry`, `formatAnswer`. `sections.ts#dayText` learns to
   drop answer blocks (close-out, prompts and excerpts all hang off it).
2. **Core, write** — `day.ts`: `newDayBody` drops the dialogue heading; `appendEntry` /
   `appendAnswer` become the two write primitives (reusing `dialog.ts#formatTurn`).
3. **Core, coach** — `coach()` short-circuits on `listen` without ever resolving a route;
   tips/analyse write my text first, then stream, then append the answer block.
   `journal-chat.ts` prompts: tips = concrete small steps, analyse = understand the
   problem and steady me, grounded in the quoted entries.
4. **Core, derived** — `src/core/index/journal.ts`: excerpt without answer blocks,
   `countTurns` counts answers in both formats.
5. **Core, legacy** — pure `foldLegacyDay(body, lang)`: merges conversation turns into
   the stream in order and removes the section. Nothing calls it automatically.
6. **IPC** — `JournalDayView.stream`, `journal:foldDay`, `journal:append` writes an entry
   block; handlers in `src/main/ipc/journal-day.ts` / `journal.ts`.
7. **Renderer** — `DayEntry` loses the `Tabs`; one `EntryStream` column replaces
   `CoachPanel`; one field with the stance row beside it and a stance-dependent primary
   action; legacy days get a legacy block plus the fold action.
8. **Copy, docs, harness** — journal + settings i18n in `de`/`en`, `VAULT-FORMAT.md`,
   the superseded line in `systems/navigation.md`, `scripts/seed/journal.mjs`,
   `scripts/shot.mjs` (the tab clicks are gone).

Regression watch: `capture/actions.ts` and `main/ipc/todos.ts` file into the raw German
`Tag`/`Fakten` literals — both keep working because the heading name does not change.

## Deliverables

**D1 — Stream format, read side**
Files: `src/core/journal/stream.ts` (new), `src/core/journal/sections.ts`,
`src/core/journal/types.ts`, `src/core/journal/index.ts`,
`tests/core/journal/stream.test.ts` (new), `tests/core/journal/sections.test.ts`,
`tests/core/journal/close.test.ts`. Mirror: `src/core/journal/dialog.ts` (block scanning
over `findSections` + blockquote runs).
Acceptance: `parseStream` returns ordered `entry`/`answer` blocks for a new-format body
and for a legacy body; `formatAnswer` → `parseStream` round-trips; `dayText()` no longer
contains an answer block; `closeDay` on a day whose stream holds an app answer proposes
no todo from that answer.

**D2 — Stream format, write side**
Files: `src/core/journal/day.ts`, `src/core/journal/dialog.ts`,
`src/core/journal/index.ts`, `tests/core/journal/day.test.ts`,
`tests/core/journal/dialog.test.ts`. Mirror: existing `appendToDay` / `appendTurn`.
Acceptance: a fresh day is `## Day` + `## Facts` only, byte-identical on a second
`ensureDay`; `appendEntry` appends plain prose, `appendAnswer` the blockquote block, both
into the day section in write order; a stale `expectedHash` yields `conflict`;
`parseDialog` still reads a legacy `## Conversation`.

**D3 — Coach and prompts**
Files: `src/core/journal/coach.ts`, `src/core/journal/types.ts`,
`src/core/llm/prompts/journal-chat.ts`, `tests/core/journal/coach.test.ts`,
`tests/core/journal/coach-prompt.test.ts`.
Acceptance: `mode: 'listen'` writes the entry and touches neither `isAvailable` nor
`stream` on the fake gateway, and reports no failure; tips/analyse have the entry in the
file before the gateway is called (asserted from inside the fake provider) and append the
reply verbatim as an answer block; `LlmUnavailableError` and abort both leave my text in
the file; analyse still passes earlier days as evidence, tips does not.

**D4 — Derived views**
Files: `src/core/index/journal.ts`, `tests/core/index/journal.test.ts`,
`tests/core/journal/fixtures.ts`.
Acceptance: the excerpt of a new-format day contains none of the app's sentences;
`countTurns` returns the number of app answers for both a new-format and a legacy body;
the date fallback from the filename is unchanged.

**D5 — Legacy fold, pure function**
Files: `src/core/journal/legacy.ts` (new), `src/core/journal/index.ts`,
`tests/core/journal/legacy.test.ts` (new).
Acceptance: `foldLegacyDay(body, lang)` returns a body in which every conversation turn
appears exactly once inside the day stream, in order, my turns as prose and the app's as
answer blocks, with the conversation heading gone and frontmatter plus `## Facts`
byte-identical; a body without a conversation section is returned unchanged.

**D6 — IPC and main handlers**
Files: `src/shared/ipc.ts`, `src/main/ipc/journal-day.ts`, `src/main/ipc/journal.ts`,
`src/renderer/lib/api.ts`, `tests/main/journal-ipc.test.ts`. Mirror: the existing
`journal:setDay` handler for the hash guard.
Acceptance: `journal:get` returns `stream` plus the unchanged `text`/`facts`/legacy
`turns`; `journal:append` writes an entry block; `journal:foldDay` is registered, is
hash-guarded and returns `conflict` on a stale hash; the IPC coverage test stays green.

**D7 — One column: the day as a stream**
Files: `src/renderer/screens/journal/DayEntry.tsx`,
`src/renderer/screens/journal/EntryStream.tsx` (new),
`src/renderer/screens/journal/CoachPanel.tsx` (removed),
`src/renderer/components/DialogTurn.tsx`, `src/renderer/styles/app/journal.css`,
`tests/renderer/journal.test.tsx`.
Acceptance: the journal screen has no `tablist` any more; a day renders one chronological
column in which my prose and the app's answers are visually distinct; the streaming
answer grows at the end of the column; failure state and the evidence list sit under the
last answer and the evidence jump still lands on the earlier day; axe clean.

**D8 — One field, stance, save-or-ask**
Files: `src/renderer/screens/journal/JournalScreen.tsx`,
`src/renderer/screens/journal/CoachComposer.tsx`,
`src/renderer/screens/journal/DayText.tsx`,
`src/renderer/components/CoachModeSwitch.tsx`,
`src/renderer/screens/journal/use-journal-keys.ts`,
`src/renderer/styles/app/journal.css`, `tests/renderer/journal.test.tsx`.
Acceptance: one field, stance row beside it, default from the journal settings, Ctrl+1..3
unchanged; with `listen` the send calls `journal:append` and never `journal:coach`, the
paragraph appears in the column and no answer is invented — also with no model
configured; with tips/analyse the primary label reads "save and ask" and the call carries
the current stance; edit-in-place still sends the frozen hash and still shows the
conflict alert instead of overwriting.

**D9 — Legacy day in the UI**
Files: `src/renderer/screens/journal/LegacyConversation.tsx` (new),
`src/renderer/screens/journal/DayEntry.tsx`,
`src/renderer/lib/queries/journal.ts`, `tests/renderer/journal.test.tsx`.
Acceptance: a day with `## Day` and `## Conversation` renders both, and the entry stays
editable; "move the conversation into the entry" asks first, then the turns show up in
the column and the legacy block is gone; cancelling writes nothing.

**D10 — Copy, both languages**
Files: `src/renderer/i18n/de-journal.ts`, `en-journal.ts`, `de-screens.ts`,
`en-screens.ts`, `de-settings.ts`, `en-settings.ts`.
Acceptance: `journal.tab.*` is gone, the new action/stream/fold keys exist in `de` and
`en`, `screen.journal.overline` no longer says "and conversation", the analyse hints in
both the composer and `settings.behavior.coach.analyze.hint` describe understanding and
support rather than pattern-finding; sentence case, no emoji; the i18n parity test is
green.

**D11 — Format doc, seed, screenshot harness**
Files: `docs/VAULT-FORMAT.md`, `docs/systems/navigation.md`,
`scripts/seed/journal.mjs`, `scripts/shot.mjs`.
Acceptance: `VAULT-FORMAT.md` shows the new day file with an interleaved answer and names
`## Conversation` as read-only legacy; the navigation.md line about the journal's inner
structure is marked as superseded by 011; `npm run seed` produces new-format days plus
one legacy day; `npm run shot` passes without clicking any tab and measures the field,
the stance row and the send button in the narrow window.

## Model Hints

- `D3 → deliverable-hard` — the "my text is in the file before the gateway is touched"
  ordering plus three failure paths (unavailable, abort, empty reply) all have to keep
  holding while the listen branch is cut out of the same function.
- `D5 → deliverable-hard` — the only deliverable that rewrites a whole day body; a
  mistake here silently loses journal content, and it has to merge two turn formats in
  order without touching frontmatter or `## Facts`.
- All other deliverables → default tier.
- `Review: → story-review-hard` — a vault file-format change with guardrail 2 (nothing
  the app generates overwrites my words) and a data-losing migration in the diff.

## Test Plan (manual acceptance)

`npm run seed`, then start the app and go to Journal (rail 3).

1. **One surface.** Pick today. There is no "Day"/"Conversation" tab anywhere, one field,
   and a stance row (listen / tips / analyse) next to it, preselected from settings.
2. **Listen.** With the stance on listen, type two sentences and send. They appear in the
   day's column, the field is empty, and nothing is generated. Open the file from the day
   header: the sentences are plain prose under `## Tag`.
3. **Listen without a model.** Settings → Models, remove the route for the journal chat.
   Back in the journal, repeat step 2 — the text is filed, no error, no dead state.
4. **Tips.** Restore a model, switch to tips, write a sentence about the day, press "save
   and ask". The sentence appears immediately; the answer streams in directly beneath it,
   visually distinct. In the file the answer is a `> **Second Brain** — HH:MM` block
   under my paragraph.
5. **Analyse.** Switch to analyse and ask about a problem. The answer helps you
   understand it, does not assert anything that is not in an entry, and lists the earlier
   days it used; clicking one jumps to that day.
6. **Nothing is lost.** Start an analyse round and cancel it mid-stream. Your paragraph
   is still in the column and in the file, with no half answer.
7. **Editing and conflict.** Click the pencil on the entry, change a word, save — it
   sticks. Then open the day file in an external editor, change the day section, save it,
   and try to save the still-open editor: the conflict alert appears, nothing is
   overwritten.
8. **Legacy day.** Pick the seeded day that still has a conversation (2026-08-06 or the
   day marked as legacy in the list). Entry and conversation both render, the entry is
   editable. Trigger "move the conversation into the entry", confirm: the turns are in
   the column in order, the legacy block is gone, and the file has no `## Gespräch`
   heading left. Cancelling beforehand changes nothing.
9. **Close-out.** Run the day close on the day from step 4. The proposals come from your
   sentences only — nothing the app wrote appears as a todo.
10. **Language.** Settings → switch the UI to English and back: field label, stance
    labels and hints, the action button and the fold action are all translated, sentence
    case, no emoji.
11. **Deep link.** From the dashboard journal tile / a citation into a day, the
    `#/journal?d=…` link still lands on the right day.

## Done

**Summary.** The journal day file now has one body section, `## Day`/`## Tag`, that is
a chronological stream: my prose as plain Markdown paragraphs, the app's answers
interleaved as `> **Second Brain** — HH:MM` blockquote blocks in write order.
`## Conversation`/`## Gespräch` is never written for a new day; existing files that still
have it keep working read-only until an explicit, confirmed, one-way "move the
conversation into the entry" action folds them in. The renderer lost the "Day"/"Talk"
tab split entirely: one column (mood/energy, chips, a small edit-in-place trigger, facts,
the unified entry/answer stream, an optional legacy block), one field, and a stance row
(listen/tips/analyse) next to it whose primary action reads "Sagen"/"Say it" for listen
and "Speichern und fragen"/"Save and ask" for tips/analyse. Listen goes through
`journal:append` and never touches the LLM gateway at all; tips/analyse go through
`journal:coach`, keep writing my words before the model is asked, and never lose a
sentence on failure, abort, or an empty reply.

**Deliverables D1–D11** all landed as planned (core stream format read/write side,
coach short-circuit for listen + reframed analyse prompt, derived index views, pure
`foldLegacyDay`, IPC + main handlers, the renderer's one-column stream, the one-field
composer, the legacy-day UI, the full i18n pass, and the VAULT-FORMAT.md/seed/screenshot
harness update).

**Story-review-hard verdict: PASS**, with 8 findings. Two were confirmed real defects and
are now fixed, with regression tests:

- **F1 (fixed).** `EntryStream`'s "is my pending paragraph already on disk" check compared
  the message against a whole `entry` block by exact equality — but `appendEntry` writes
  plain prose, so a message landing right after existing prose in the same "Day" section
  merges into *one* `entry` block (`parseStream` doesn't split on blank lines within a
  run). The exact-equality check then never matched, and the just-sent paragraph rendered
  twice once the day refetched. Fixed to check `block.text.endsWith(live.message)`
  (`src/renderer/screens/journal/EntryStream.tsx`). Regression test:
  `tests/renderer/journal.test.tsx` → "zeigt die eigene Runde nur einmal, auch wenn sie im
  Strom mit vorheriger Prosa verschmilzt".
- **F2 (fixed).** `toView`'s fallback for a day with no `## Day`/`## Tag` heading at all
  (a hand-edited file) used `dayText()` — which deliberately strips embedded answer blocks
  for *reading* (search, prompts, close-out) — as the *editable* text. Saving such a day
  via the pencil silently deleted any answer block that happened to sit in the heading-less
  prefix: the app's own words, lost with no conflict and no notice. Split `dayText()` into
  a new `rawDayText()` (headings/dialogue/facts stripped, answers kept — the edit surface's
  basis) and `dayText()` (additionally strips answers — the read-only basis), and pointed
  `toView`'s fallback at `rawDayText()` (`src/core/journal/sections.ts`,
  `src/main/ipc/journal-day.ts`). Regression tests: `tests/core/journal/sections.test.ts`
  (`rawDayText` describe block) and `tests/main/journal-ipc.test.ts` → "verliert beim
  Speichern keine eingebettete Antwort, wenn die Datei keine Tag-Überschrift hat".

Four lower-severity findings were also fixed:

- **F3.** `journal.mode.listen.hint` and `CoachModeSwitch.tsx`'s header comment still
  promised "I mirror and ask follow-up questions" — behaviour `coach()` no longer has
  (listen just files and returns). Reworded in both languages plus the comment;
  `journal.hasDialogue`'s tooltip ("With conversation") was the same staleness for the
  day-list dot and was reworded to "With an answer from the app".
- **F4.** The fold confirmation dialog claimed "every round of the conversation moves into
  the day text" — `foldLegacyDay` actually drops unparseable hand-written lines inside the
  folded section (documented and tested at the core level, D5). Softened the copy in both
  languages to say what's actually attributable moves, and what isn't is lost.
- **F5.** `src/core/index/journal.ts`'s locally-duplicated blockquote scanner (duplicated
  on purpose to avoid a real `@core/index` → `@core/journal` cycle) used a stricter speaker
  regex than `dialog.ts`'s (no leading-space tolerance), so an indented answer block would
  be read by `parseStream` but miscounted by `countTurns`/left in `dayExcerpt`. Aligned the
  regex and added a regression test in `tests/core/index/journal.test.ts`.
- **F8.** A CSS cleanup pass had silently dropped `gap: var(--space-2)` from the narrow
  composer's media-query override with no explanation. Restored it with a comment.

Two findings were reviewed and left as documented, deliberate non-issues, not fixed:

- **F6.** Day prose now renders as plain text (`white-space: pre-wrap`) instead of through
  the Markdown renderer the old `DayText` view used. This is a real, undeclared rendering
  change, but it makes `entry` blocks consistent with how `DialogTurn` has always rendered
  a user's own words ("no one formats their journal") — reverting it would mean treating
  the same kind of content differently depending on which write path produced it.
- **F7.** Refine decided the stance should move "out of the composer footer into a labelled
  row beside the field" as part of D8. `CoachModeSwitch`/`use-journal-keys.ts` were listed
  in D8's files but not touched, because the existing placement (`CoachModeSwitch` in
  `ChatComposer`'s `extra` slot, immediately beside the field) already satisfied the
  criterion — a no-op decision, not a defect.

**Verification (after the review fixes, run directly, not self-reported by a sub-agent):**
`npm run format:check` — red repo-wide (246 files) on a pre-existing CRLF-vs-LF
environment condition (`core.autocrlf=true` vs. Prettier's `lf` default) that predates
this story and touches files this story never modified; every file this story *did* touch
passes `npx prettier --check` individually. `npm run lint` — clean. `npm run typecheck` —
clean. `npm test` — 2069/2070 passing; the one failure
(`tests/core/wiki/module.test.ts`, a docs/MODULE-SCHEMA.md drift check) is confirmed
pre-existing and unrelated (no wiki file is in this story's diff). `npm run build` —
clean.

**Live smoke (P2): done, confirmed visually.** `npm run seed && npm run shot` passes with
exit code 0 and zero journal-related findings. Verified by opening the actual PNGs:
`04-journal.png` (wide) shows one field, the stance row, and "Speichern und fragen" with
no tabs; `journal-narrow.png`/`journal-narrow-end.png` (1152×720) show the day's
mood/chips/facts at the top and, after scrolling to the end (the same `-narrow-end.png`
convention already used for `project-detail`/`project-todos`/`notes-unfiled`), the
composer fully visible and unobstructed. This surfaced and fixed a real bug along the
way: D7's CSS made the composer `position: sticky` uniformly, which — once real seeded
content made the one-column day taller than 720px — pinned the composer over the
mood/energy/chips block instead of at the bottom of the page. Fixed by making the
composer `position: static` (flows at the end of the column) in the narrow window only,
and by reworking `scripts/shot.mjs`'s journal gate to check composer reachability *after*
scrolling to the end rather than requiring it to fit unscrolled — the same standard this
script already applies to other long narrow-window screens.

**Decisions made during implementation** (beyond what refine had already settled):

- `JournalBlock`/`JournalStreamBlock` shape: `{ kind: 'entry'; text; line }` /
  `{ kind: 'answer'; text; at; line }` (core), `{ kind; text; at }` (IPC, `at` only
  meaningful for `answer`).
- An unrecognized/broken blockquote inside "Day" (no speaker, foreign speaker, empty
  text) stays verbatim inside the surrounding `entry` block's raw text — neither promoted
  to a real answer nor stripped.
- `appendEntry`/`appendAnswer` live in `stream.ts`, not `day.ts`, to avoid a real import
  cycle (`day.ts` → `dialog.ts` → `stream.ts` → `day.ts` would have closed one).
- `coach()`'s `dayHistory()` merges legacy `## Gespräch` turns (always older, since 011
  writes nothing there) with the current stream's blocks for tips/analyse context on a
  day with more than one round — deliberately accepting bounded redundancy (a paragraph
  may appear both as "current entry" and as a history turn) over any scheme that could
  drop one.
- `foldLegacyDay` is a pure function (`body`, `lang`) → `body`; a folded answer with no
  parseable timestamp gets the fixed placeholder `00:00` rather than a guessed time or
  `Date.now()` (which would make the migration unassertable byte-for-byte).
- `EntryStream` reuses `DialogTurn` with a new `plain` prop (suppresses the speaker
  header) rather than a second rendering path for `entry` blocks.
- `DayText`'s old "inviting" empty-day field and whole-text clickable view are both gone;
  it is now only a compact edit-in-place trigger, shown only when there's something to
  edit. The single composer field is the only entry point for a fresh day.
- Demo seed (`scripts/seed/journal.mjs`): the day at `offset: -2` stays a legacy
  `## Gespräch` day; the day at `offset: -9` was converted to the new interleaved format,
  via a new `streamBlock()` helper alongside the untouched `dialogueBlock()`.

**Changed files** (story 011 only — five other files in the working tree were already
modified before this story's implementation began and are unrelated:
`docs/requirements/009-journal-open-days-filter.md`, `010-journal-calendar-view.md`,
`012-journal-interview-as-a-start.md`, `docs/sprints/S04/sprint.md`):

New: `src/core/journal/stream.ts`, `src/core/journal/legacy.ts`,
`src/renderer/screens/journal/EntryStream.tsx`,
`src/renderer/screens/journal/LegacyConversation.tsx`,
`tests/core/journal/stream.test.ts`, `tests/core/journal/legacy.test.ts`.

Removed: `src/renderer/screens/journal/CoachPanel.tsx`.

Modified: `docs/VAULT-FORMAT.md`, `docs/systems/navigation.md`,
`scripts/seed/journal.mjs`, `scripts/shot.mjs`, `src/core/index/journal.ts`,
`src/core/journal/coach.ts`, `src/core/journal/day.ts`, `src/core/journal/dialog.ts`,
`src/core/journal/index.ts`, `src/core/journal/sections.ts`, `src/core/journal/types.ts`,
`src/core/llm/prompts/index.ts`, `src/core/llm/prompts/journal-chat.ts`,
`src/main/ipc/journal-day.ts`, `src/main/ipc/journal.ts`,
`src/renderer/components/DialogTurn.tsx`, `src/renderer/components/CoachModeSwitch.tsx`,
`src/renderer/i18n/de-journal.ts`, `src/renderer/i18n/en-journal.ts`,
`src/renderer/i18n/de-screens.ts`, `src/renderer/i18n/en-screens.ts`,
`src/renderer/i18n/de-settings.ts`, `src/renderer/i18n/en-settings.ts`,
`src/renderer/lib/api.ts`, `src/renderer/lib/mock-bridge.ts`,
`src/renderer/lib/queries/journal.ts`, `src/renderer/screens/journal/CoachComposer.tsx`,
`src/renderer/screens/journal/DayEntry.tsx`, `src/renderer/screens/journal/DayText.tsx`,
`src/renderer/screens/journal/JournalScreen.tsx`, `src/renderer/styles/app/journal.css`,
`src/shared/ipc.ts`, and their corresponding test files under `tests/core/journal/`,
`tests/core/index/`, `tests/core/llm/`, `tests/helpers/`, `tests/main/`,
`tests/renderer/`.

**Commit message prepared for the orchestrator:**
`011: journal — one entry instead of day and conversation`

**Status:** all acceptance criteria met, story-review-hard passed, live smoke confirmed
visually. Set to `done`.
