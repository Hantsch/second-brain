---
id: 030
title: The app is called Gaston, everywhere
status: done # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Precondition for [[031-a-build-i-can-hand-on]] — a copy handed to someone else must not
introduce itself under two names.

## Requirement

`package.json` has said `Guston` since the first build config, but almost nothing else does. The
window is titled "Second Brain", the HTML title says "Second brain", the dashboard offers a
"Frage an das Second Brain", the journal writes its own answers under the speaker
`> **Second Brain**`, the prompts tell the model it is filing into a "persönliches Second Brain",
the OpenRouter request header says `Second Brain`, and `README.md` opens with it.

I want one name. Gaston is the app; "second brain" is at most a description of what kind of app
it is, and it stops being used as a product name.

Two things are already decided and are not open questions:

- **The vault directory stays `.secondbrain/`** (user, 2026-08-23). Renaming it is a
  vault-format change with a migration path, and this story is not that. A vault written by the
  old build must open with no migration and no warning.
- **The journal speaker becomes Gaston for new turns, and every existing day stays readable**
  (user, 2026-08-23). Nothing in the vault gets rewritten.

## Acceptance Criteria

- [x] The window title, the taskbar/`setAppDetails` name, the HTML `<title>` and the About tab
      all say Gaston.
- [x] No user-visible string in the app uses "Second Brain" as the product's name any more — in
      both language catalogues.
- [x] New journal turns are written as `> **Gaston**`; days already containing
      `> **Second Brain**` still render, still parse into turns, and still fold correctly. The
      assistant-label sets in `src/core/index/journal.ts` and `src/core/journal/dialog.ts`
      recognise `gaston` in addition to everything they recognise today.
- [x] The prompts sent to models no longer name a different product than the app, and the
      OpenRouter `x-title` header says Gaston.
- [x] `README.md`, `AGENTS.md` and the `docs/` entry points name the app Gaston. Where "second
      brain" is used as a generic category rather than as the product's name, it may stay — that
      is a deliberate call per occurrence, not a blanket replace.
- [x] `.secondbrain/` is untouched everywhere: code, seed scripts, `docs/VAULT-FORMAT.md`. An
      existing vault opens unchanged.
- [x] Seeded demo content that quotes a real external title (the YouTube source in
      `scripts/seed/`) keeps that title. The rename does not falsify sample data.
- [x] Tests: a journal round-trip over an old-label day and a new-label day, and an i18n test
      that no catalogue carries the old product name — the same shape as the quote test story
      026 added.
- [x] `npm run verify` green, and a screenshot run shows the new name in the title bar.

## Open Questions

- ~~**Q1 — Guston or Gaston?**~~ answered → Decisions (Sprint)
- ~~**Q2 — Does the repository name change too?**~~ answered → Decisions (Sprint)
- ~~**Q3 — What is the app's one-line description?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — the app's name is **`Gaston`**, the same string as the vendored design system
  (`src/renderer/styles/gaston/`, the `gs-*` atoms). `package.json` (`name`, `productName`,
  `artifactName`), the `appId` (`app.hantsch.guston` → `app.hantsch.gaston`),
  `src/main/index.ts` and `src/main/window.ts` are renamed as part of this story — this resets
  the Windows taskbar/jump-list identity, which is accepted since the app has never shipped to
  anyone yet. No rename of the vendored design-system directory, `gs-*` imports, or the
  CLAUDE.md design-system chapter — the app now shares that existing name rather than the
  design system being renamed. A short CLAUDE.md note should record that "Gaston" now names
  both the app and the design system, deliberately, so it is not "fixed" apart again later.
- **(User)** Q2 — the repository/checkout folder and git remote stay `second-brain`. Renaming
  them is outside this story's scope.
- **(User)** Q3 — the app's one-line description (package.json, About tab, readme intro) is in
  English, matching this project's `doc-language: en` convention.

Taken during refine (2026-08-23), each with its reason:

- **The appId becomes one constant** (`src/main/app-identity.ts`), imported by `setAppUserModelId`
  and `setAppDetails` — a mismatch between `build.appId` and either call site breaks Windows
  taskbar grouping silently, and no test would catch it.
- **`journal.turn.assistant` and `SPEAKERS.assistant` are `Gaston` in both languages** — a product
  name is not translated, and one string keeps the write side and the rendered label in step.
- **The old assistant labels stay in the recognition sets, `gaston` is added** — removing them
  would make every existing day stop parsing, which AC3 forbids.
- **The two label lists stay duplicated** (`core/journal/dialog.ts`, `core/index/journal.ts`) —
  the code comment says the duplication exists to avoid an import cycle; a rename story is the
  wrong place to restructure module boundaries.
- **The seed keeps exactly one legacy old-label day** (`> **Second Brain**`) — the backward-compatibility
  criterion needs a real old-label day in the UI, and `ui-acceptance-required: true` rules out
  hand-editing a file as the test path.
- **`onboarding.namePlaceholder` becomes a generic vault name, not `Gaston`** — it names the
  user's vault, not the app; suggesting the app's own name there would be misleading.
- **The prompts describe the vault instead of naming any product** — the model needs the task, not
  a brand, and this removes the drift risk permanently rather than moving it to a new name.
- **Category uses of "second brain" may stay, lowercase, per occurrence** — AC5 asks for a
  deliberate call, and a blanket replace is exactly what would hit `.secondbrain/`.
- **`second-brain-methodik`, `VIDEO_TITLE` and the mock source titles stay verbatim** — they quote
  a real external YouTube video and a demo module about the method, not this product (AC7).
- **Finished stories, finished sprints, the roadmap and the S08 sprint file are not renamed**
  (`docs/requirements/done/`, `docs/sprints/done/`, `docs/ROADMAP.md`,
  `docs/sprints/S08/sprint.md`) — they record what was decided when, and
  rewriting history to match a later decision destroys the record.
- **`package-lock.json` is regenerated rather than hand-edited** — its `name` is derived, and a
  hand edit desynchronises it from npm's own bookkeeping.
- **The About tab gains an app-name row** — AC1 requires the About tab to say Gaston, and today it
  shows version, Electron and platform but never the name.
- **The i18n guard bans `zweites hirn` as well as `second brain`** — the German catalogue carries a
  translated product name (`de-screens.ts:295`) that a `second brain` regex would not find.

## Plan

Triage: **clear and ready**. No new questions — Q1–Q3 are settled above. The work is a rename
with three hard edges: `.secondbrain/` must not move, an external YouTube title must not be
falsified, and old journal days must keep parsing. Everything else is one-line string edits,
enumerated below from an actual repo search rather than guessed.

Order and layers (each D is one layer, so a red build points at one place):

1. **Build/main identity** — `package.json` (`name`/`description`/`appId`/`productName`/
   `artifactName`), `package-lock.json`, `src/main/index.ts:31`, `src/main/window.ts:50,72,77`,
   `src/renderer/index.html:11`. The appId lives in three places today; it becomes one constant
   so only `package.json` can drift.
2. **i18n catalogues** — 10 product-name strings across `de*.ts`/`en*.ts`, plus the German
   `'Zweites Hirn'` placeholder that a `second brain` search does not find.
3. **About tab + guard test** — the About tab does not show the app name at all today; it gets a
   row. The guard test mirrors story 026's shape in `tests/renderer/i18n.test.ts`.
4. **Journal speaker** — `SPEAKERS`/`LABELS` in `src/core/journal/dialog.ts`, `ASSISTANT_LABELS`
   in `src/core/index/journal.ts` (deliberately duplicated, with a sync warning in the code).
   Read side gains `gaston`, keeps everything it recognises. Seed writes the new label but keeps
   one legacy day so the manual walk has a real old-label day.
5. **Outbound text** — four prompt files, `src/core/wiki/rerank.ts`, the OpenRouter `x-title`
   header in `src/core/llm/factory.ts`, three `src/shared` doc comments.
6. **Docs** — `README.md`, `AGENTS.md`, `CLAUDE.md` (plus the "one name for app and design
   system" note), `docs/CONCEPT.md`, `docs/ARCHITECTURE.md`, `docs/VAULT-FORMAT.md`,
   `.claude/ai-scrum.md`, `.gitignore` comment. Finished stories and sprints stay untouched.
7. **Verify** — `npm run verify`, `npm run seed && npm run shot`, and a grep proving
   `.secondbrain` is untouched and no `guston`/`Guston` remains.

Constraint that applies to **every** deliverable: never touch `.secondbrain`, never touch the
checkout path `second-brain` in `src/core/claude/paths.ts` or its fixtures, never touch the demo
module slug `second-brain-methodik` or the external video title
`Your AI Second Brain Is Slowly Rotting`. No blanket search-and-replace.

## Deliverables

### D1 — One app identity, from `package.json` to the taskbar

Files: `package.json`, `package-lock.json`, `src/main/index.ts`, `src/main/window.ts`,
`src/main/app-identity.ts` (new), `src/renderer/index.html`.

- `package.json`: `name` `guston` → `gaston`, `build.appId` `app.hantsch.guston` →
  `app.hantsch.gaston`, `productName` `Guston` → `Gaston`, `artifactName`
  `guston-${version}-portable.${ext}` → `gaston-…`, `description` rewritten in English (Q3).
- `package-lock.json` regenerated (`npm install --package-lock-only`) so its `name` follows.
- New `src/main/app-identity.ts` exports `APP_ID = 'app.hantsch.gaston'` and
  `APP_NAME = 'Gaston'`; `src/main/index.ts:31` (`setAppUserModelId`) and
  `src/main/window.ts:50,72,77` (BrowserWindow `title`, `setAppDetails`) import them instead of
  repeating the literal. One responsibility, ~5 lines — this removes the silent-mismatch class.
- `src/renderer/index.html:11` `<title>Second brain</title>` → `<title>Gaston</title>`.

Acceptance: `rg -i "guston"` over the repo returns hits only inside `docs/` history; the three
appId call sites are provably one constant; `npm run build` green.
Covers AC1 (window title, `setAppDetails`, HTML title).

### D2 — Both catalogues stop saying "Second Brain"

Files: `src/renderer/i18n/{de,en}.ts`, `{de,en}-journal.ts`, `{de,en}-dashboard.ts`,
`{de,en}-screens.ts`, `{de,en}-settings-runtime.ts`; plus the renderer tests asserting those
strings: `tests/renderer/dashboard.test.tsx:843`, `tests/renderer/journal.test.tsx:824`,
`tests/renderer/screens.test.tsx:194,276`.

Exact sites (all one-liners):

| key                          | file                                                     | now → then                                                               |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `app.name`                   | `de.ts:20`, `en.ts:20`                                   | `Second brain` → `Gaston`                                                |
| `journal.turn.assistant`     | `de-journal.ts:91`, `en-journal.ts:81`                   | `Second Brain` → `Gaston`                                                |
| `module.ask.purpose`         | `de-dashboard.ts:65`, `en-dashboard.ts:57`               | product name → `Gaston`                                                  |
| `tile.ask.label`             | `de-dashboard.ts:101`, `en-dashboard.ts:92`              | product name → `Gaston`                                                  |
| `screen.ask.empty.title`     | `en-screens.ts:128`                                      | `Ask your second brain` → `Ask Gaston`                                   |
| `onboarding.namePlaceholder` | `de-screens.ts:295`, `en-screens.ts:280`                 | `Zweites Hirn` / `Second brain` → a generic vault name, not the app name |
| runtime hint                 | `de-settings-runtime.ts:36`, `en-settings-runtime.ts:35` | `Second brain` → `Gaston`                                                |

German strings keep the `„…“` quote pair (story 026's rule). Sentence case, no emoji.
Acceptance: `npm test` green with the updated assertions; no `de*.ts`/`en*.ts` file contains
`second brain` (any casing/spacing) or `Zweites Hirn`.
Covers AC2.

### D3 — The About tab names the app, and a test keeps it that way

Files: `src/renderer/screens/settings/AboutTab.tsx`, `src/renderer/i18n/de-settings.ts`,
`src/renderer/i18n/en-settings.ts`, `src/shared/types/*` only if a key type list needs the new
key, `tests/renderer/i18n.test.ts`.

- The About tab currently shows version/Electron/platform but never the name. Add an
  `settings.about.app` row as the first `<dt>/<dd>` in the existing `sb-kv` list, value
  `t('app.name')`. Mirror the surrounding rows exactly — no new atom, no new panel.
- Guard test in `tests/renderer/i18n.test.ts`, mirroring the quote test at lines 164–191: it
  already loads every catalogue via `import.meta.glob('../../src/renderer/i18n/*.ts', { query:
'?raw', … })` into `SOURCES`. Add a case iterating `SOURCES` (all `de*`/`en*` files) with
  `expect(source, \`${file} …\`).not.toMatch(/second[\s-]*brain|zweites hirn/i)`.

Acceptance: About tab renders `Gaston`; the guard test fails if the old name is reintroduced into
any catalogue.
Covers AC1 (About tab) and AC2 (the automated half).

### D4 — The journal speaker is Gaston, and old days still work

Files: `src/core/journal/dialog.ts`, `src/core/index/journal.ts`, `scripts/seed/journal.mjs`,
`tests/core/journal/dialog.test.ts`, `tests/core/index/journal.test.ts`, plus the write-side
assertions in `tests/main/journal-ipc.test.ts` and `tests/core/journal/interview-write.test.ts`.

- `dialog.ts:36-38` `SPEAKERS`: `assistant` becomes `Gaston` for **both** `de` and `en`
  (a product name is not translated). `formatTurn` (`dialog.ts:70-83`) is the only writer.
- `dialog.ts:43-46` `LABELS.assistant` and `src/core/index/journal.ts:40` `ASSISTANT_LABELS`
  each gain `'gaston'` **in addition to** `second brain`, `secondbrain`, `brain`, `coach`. The
  code comment at `index/journal.ts:32-39` says the two lists are duplicated on purpose to avoid
  an import cycle — keep the duplication, update both, keep the comment accurate.
- `scripts/seed/journal.mjs:389,420` writes `> **Gaston**`, except **one** older demo day that
  keeps `> **Second Brain**` — a vault written by the old build looks exactly like that, and the
  manual walk needs a real one.
- Tests: extend `tests/core/journal/dialog.test.ts` and `tests/core/index/journal.test.ts` with a
  day containing an old-label turn _and_ a new-label turn — both parse to `role: 'assistant'`,
  turn order and count are correct, and re-serialising does not rewrite the old label.
- **Do not** update the many read-side fixtures that carry `> **Second Brain**` (e.g.
  `tests/fixtures/vault/journal/2026/08/2026-08-10.md:23`, `tests/core/journal/{legacy,coach,
sections,day,close}.test.ts`) — they are the backward-compatibility coverage. Only assertions
  about what is _written_ change.
- `scripts/seed/module-methodik*.mjs`, `scripts/seed/raw-youtube.mjs` (`VIDEO_TITLE`), the slug
  `second-brain-methodik` and the mock titles in `src/renderer/lib/mock-fixtures.ts` /
  `mock-bridge.ts` stay verbatim.

Acceptance: new turns are `> **Gaston**`; the old-label/new-label round-trip test is green; the
demo vault still contains one legacy day; `VIDEO_TITLE` unchanged.
Covers AC3 and AC7.

### D5 — Nothing we send out names another product

Files: `src/core/llm/prompts/query-answer.ts`, `src/core/llm/prompts/classify-dump.ts`,
`src/core/llm/prompts/title-tags.ts`, `src/core/llm/prompts/summarize-source.ts`,
`src/core/wiki/rerank.ts`, `src/core/llm/factory.ts`, plus doc comments in
`src/shared/types/llm.ts:73`, `src/shared/types/knowledge.ts:160`, `src/shared/ipc.ts:76,585`.

- System prompts (`query-answer.ts:64`, `classify-dump.ts:129`, `title-tags.ts:34`,
  `summarize-source.ts:89`, `rerank.ts:55`) currently say `persönliches Second Brain` /
  `persoenliches Second Brain`. Reword so the prompt describes the vault rather than naming a
  product — the model does not need a brand, it needs the task. Keep each prompt's existing
  language; do not restructure prompts beyond the name.
- `src/core/llm/factory.ts:36` OpenRouter header `'x-title': 'Second Brain'` → `'Gaston'`.
- Doc comments follow, so a reader of the IPC contract sees one name.

Acceptance: no file under `src/core/llm/`, `src/core/wiki/` or `src/shared/` contains the old
product name; the OpenRouter provider test (or a new assertion in it) pins `x-title: 'Gaston'`;
existing prompt tests green.
Covers AC4.

### D6 — The documentation says Gaston

Files: `README.md`, `AGENTS.md:1`, `CLAUDE.md`, `docs/CONCEPT.md`, `docs/ARCHITECTURE.md`,
`docs/VAULT-FORMAT.md`, `.claude/ai-scrum.md:13`, `.gitignore:13`.

- Per-occurrence call, not a replace: where "second brain" is the **product**, it becomes Gaston;
  where it is the **category** ("a file-based second brain"), it may stay, lowercase.
- `docs/VAULT-FORMAT.md`: only the prose product-name hits; the `.secondbrain/` path
  documentation and the `> **Second Brain**` example (lines 250, 263) get a sentence saying the
  new label is `> **Gaston**` and the old one is still read.
- `CLAUDE.md` gains the short note from Q1: Gaston deliberately names both the app and the
  vendored design system; the design-system directory, the `gs-*` atoms and the design chapter
  are **not** renamed.
- `.claude/ai-scrum.md:13` `project: Second Brain (Guston)` → `project: Gaston`.
- Out of scope, deliberately untouched: `docs/requirements/done/**`, `docs/sprints/done/**`,
  `docs/ROADMAP.md`, `docs/sprints/S08/sprint.md` — historical records of what was decided when.

Acceptance: the four entry points (`README.md`, `AGENTS.md`, `docs/CONCEPT.md`,
`docs/ARCHITECTURE.md`) open with Gaston; every remaining "second brain" in them is a deliberate
generic use.
Covers AC5.

### D7 — Verified, and the vault is provably untouched

Files: none (verification only) — or the minimal fix a red gate demands.

- `npm run verify` fully green.
- `npm run seed && npm run shot`; the title bar in `.screenshots/` reads Gaston.
- `rg -c "\.secondbrain" ` count identical to before the story (record the number in `## Done`);
  `tests/core/vault/paths.test.ts` and `tests/core/vault/layout.test.ts` green untouched.
- `rg -i "guston"` returns nothing outside `docs/` history.
- Opening a vault created by the previous build produces no migration prompt and no warning.

Covers AC6 and AC8.

## Model Hints

- D1–D7 → default tier. Each is a bounded set of string edits in one layer with an explicit file
  list; none needs Opus.
- D4 is the only one with real logic, and it is still two list additions plus one constant — the
  regression it could cause is covered by the round-trip test it ships with.
- `Review:` → default. The dangerous failure mode of a rename story (a blanket replace hitting
  `.secondbrain`) is loudly covered by ~50 existing tests that assert those paths, and the
  appId/i18n risks each ship with their own guard.

## Test Plan (manual acceptance)

Run `npm run seed`, then start the app (`npm run dev` or the packaged build).

1. **Title bar and taskbar** — the window title bar reads `Gaston`; the Windows taskbar entry and
   the pinned/jump-list name read `Gaston`, not `Guston` or `Second Brain`.
2. **About** — Settings → About: the first row names the app `Gaston`, next to version, Electron
   and platform.
3. **Dashboard** — the ask tile is labelled with Gaston, not "Frage an das Second Brain". Switch
   `languages.ui` between German and English and check both.
4. **New journal turn** — Journal → today → write a line, ask for an answer. The answer appears
   under the speaker `Gaston`. Open the day's `.md` file in an editor: the new turn is
   `> **Gaston** — HH:MM`.
5. **Old journal day** — open the seeded legacy day (the one still carrying
   `> **Second Brain**`). It renders as an assistant turn, folds correctly, the turn count is
   right, and writing a new turn on that day does **not** rewrite the old label.
6. **Vault untouched** — the vault folder still contains `.secondbrain/`; opening a vault created
   before this story shows no migration prompt and no warning.
7. **Demo source** — Knowledge → Sources: the seeded YouTube source still carries its real title
   `Your AI Second Brain Is Slowly Rotting`.

## Done

The app now presents itself as Gaston everywhere it speaks to a human or another service:
`package.json`/appId/window title/taskbar (via one new `src/main/app-identity.ts` constant), the
HTML title, both i18n catalogues, a new About-tab row, new journal turns and their duplicated
recognition lists (which also gained `gaston` without dropping any existing alias), outbound LLM
prompts and the OpenRouter `x-title` header, and the four documentation entry points plus a short
CLAUDE.md note that "Gaston" deliberately names both the app and the vendored design system.
`.secondbrain/`, the external YouTube title, the `second-brain-methodik` module slug and every
old-label journal fixture/backward-compat test were left untouched, and exactly one seeded demo
day still carries `> **Second Brain**` for the manual walk.

**Decisions**

- The three appId/title call sites (`setAppUserModelId`, `BrowserWindow` `title`, both
  `setAppDetails` calls) now import `APP_ID`/`APP_NAME` from `src/main/app-identity.ts` instead of
  repeating literals, per the plan's "one constant" requirement.
- `package.json`'s `description` was rewritten in English per Q3, describing the app rather than
  branding "Second Brain" as a product name.
- `onboarding.namePlaceholder` was changed to a generic vault-name placeholder ("Mein Wissen" /
  "My vault"), not "Gaston" — it names the user's own vault, not the app.
- System prompts (`query-answer.ts`, `classify-dump.ts`, `title-tags.ts`, `summarize-source.ts`,
  `rerank.ts`) now describe the task/vault ("persönliches/persoenliches Wissensarchiv") instead of
  naming any product, removing the drift risk permanently rather than moving it to a new name.
- Three code comments outside the originally listed D1–D6 files (`src/main/ipc/chat.ts`,
  `src/renderer/screens/garden/GardenScreen.tsx`, `src/renderer/screens/journal/EntryStream.tsx`)
  still named "Second Brain" as the app; found by the D7 verification grep and fixed directly by
  the orchestrator as trivial one-line comment edits (not user-visible strings, so not an
  acceptance-criteria gap, but inconsistent with the story's intent).
- `docs/sprints/S08/sprint.md` and `docs/requirements/031-a-build-i-can-hand-on.md` showed as
  modified in the working tree throughout this build; both predate this story's work (unrelated,
  pre-existing dirty state on this branch) and were deliberately left untouched, per the plan's
  explicit rule that the S08 sprint file is not renamed by this story.
- A clean-agent review's own `git stash`-based baseline check for `format:check` surfaced an
  unrelated, pre-existing stash (`stash@{0}`, "WIP on sprint/S04: … journal interview as a
  starting aid", story 009) that predates this session by several sprints; verified the working
  tree still had all 62 expected modified files afterward and left the old stash untouched.

**Verification**

- `npm run build`, `npm run lint`, `npm run typecheck`, `npm test` (2803 tests, 195 files) all
  green.
- `npm run format:check` still fails, but on files and a count (476) unrelated/pre-existing to
  this story's changes (506 fail on unmodified `HEAD`) — confirmed by the review agent via a
  stash-based comparison; not introduced or worsened by this story.
- Live smoke: `npm run seed && npm run shot` completed with no console errors (61 captures);
  visually confirmed in `.screenshots/01-dashboard.png` and `.screenshots/35-settings-about.png`
  that the title bar and the About tab's new "App" row both read "Gaston".
- `rg -i "guston"` returns hits only in `docs/` (the story files themselves, `docs/ROADMAP.md`,
  `docs/sprints/S08/sprint.md` — all explicitly out of scope) and pre-existing `dist/` build
  artifacts from before this story (regenerated on next `npm run handoff`/package).
- `.secondbrain` references: unchanged, 246 git-tracked occurrences before and after.
- Clean-agent code review verdict: **PASS**. All acceptance-criteria rows (including the
  screenshot/verify row, confirmed independently by the orchestrator's own live smoke) PASS or
  resolved. Minor non-blocking findings: no dedicated renderer test asserts the About tab's new
  row text (mitigated by the i18n guard test and the orchestrator's own screenshot check); a
  cosmetic Prettier table-width reflow in `CLAUDE.md`/`README.md` as a side effect of scoped
  formatting; expected `package-lock.json` optional-dependency churn from
  `npm install --package-lock-only`. None required a fix cycle.

**Commit message**

```
030: the app is called Gaston, everywhere
```
