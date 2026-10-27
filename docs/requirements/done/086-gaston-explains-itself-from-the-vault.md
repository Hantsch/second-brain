---
id: 086
title: Gaston explains itself from the vault
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

"How does the curator work, what does a proposal look like, what is the Tasks screen for" should
be answerable by asking Gaston — with the same citations as any other question, because Ask
answers only from the vault (guardrail 3). So the help lives in the vault: one module,
`modules/<help-slug>/`, shipped and versioned by Gaston (concept §11, AGT-19 to AGT-22).

It is a normal module — visible in Knowledge, evidence for Ask, readable by the agent — but
Gaston maintains it, so gardener checks and the health score skip it. It is managed like the setup
files from [[084]]: marker, version, update on click, pages the user added left alone. It covers
every rail screen, the vault format and the agent, in English.

## Acceptance Criteria

- [x] **AC1** — After the help module is written, `modules/<help-slug>/` exists with `module.md`,
      `AGENTS.md` and its wiki pages, and is listed in Knowledge.
- [x] **AC2** — Asking how proposals work (fake provider) yields an answer citing a help-module page
      by path; without a model, the search hits include that page.
- [x] **AC3** — A gardener run produces no finding for a help-module page, and the health score is
      the same with and without the help module.
- [x] **AC4** — Each help page carries the Gaston marker and version; the Agent tab shows the help
      module as current, outdated or missing, and Update rewrites only marked pages.
- [x] **AC5** — A page the user added to the help module is byte-identical after an update.
- [x] **AC6** — The help module has a page for every rail screen, one for the vault format and one
      for the agent; a test against the rail's screen list fails when a screen has no page.
- [x] **AC7** — The Agent tab's "About this" links to the agent page, which opens in Knowledge.

## Open Questions

~~- **Q1 — When it is written** (concept O8): with every new vault, or only on the agent setup's
Install?~~ answered → Decisions (Sprint)
~~- **Q2 — Slug and collision** (concept O9): which slug, and what happens when a user module already
has it?~~ answered → Decisions (Sprint)
~~- **Q3 — Keeping it true.** AC6 pins the screen list. Should a test also pin each page to a source
of truth (as `MODULE_SCHEMA_TEMPLATE` is pinned to its doc), or is the per-screen coverage enough?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** When it is written: help module written only on agent Install (not with every new vault)
- **(User)** Slug and collision: slug `gaston-help`; if a user module already has that slug and is not Gaston-marked, Install reports the collision and writes nothing
- **(User)** Keeping it true: per-screen coverage (AC6 screen list) is enough; no per-page source-of-truth pinning
- Help pages are `type: concept` pages under `modules/gaston-help/wiki/concepts/`, plus a managed
  `wiki/overview.md` — concept pages are Ask evidence, while the overview is the condensed artifact
  ([[081]]) and is excluded from evidence (`evidenceTypesFor`, `src/core/wiki/evidence.ts:26`).
- Screen pages are named `screen-<ScreenId>.md` after the ids in `SCREENS`
  (`src/renderer/lib/screens.ts`), plus `vault-format.md` and `agent.md` — the id-keyed name makes
  the AC6 test a mechanical walk over the rail list.
- Marker for files with frontmatter (`module.md`, every wiki page) is two frontmatter keys,
  `managed_by: gaston` and `template_version: <n>`; `AGENTS.md` and `wiki/index.md` (no frontmatter)
  carry the same comment marker 084 uses for its Markdown files — a comment above `---` would break
  YAML frontmatter, and unknown frontmatter keys are preserved by every write (VAULT-FORMAT.md).
- One version for the whole module (`HELP_MODULE_VERSION`) — the pages ship and update together,
  per-page versions would be bookkeeping without a use.
- The help files are entries in 084's managed-file set: same status computation, same plan-before-
  write dialog, same "modified → confirm before overwrite" rule, same writer — "managed like the
  setup files from [[084]]" means one mechanism, not a second planner.
- `wiki/log.md` is not managed: created with `logHeader('en')` if missing, and every Install/Update
  that writes help files appends one entry — the module schema wants a log entry per change, and an
  append never overwrites anything.
- `wiki/index.md` is managed and lists the managed pages only — user pages still appear in Knowledge
  (the page list is derived from the files), and a user edit to `index.md` falls under 084's
  "modified" rule.
- The collision decision is taken literally: when `modules/gaston-help/` exists and its `module.md`
  is missing or lacks the marker, the plan shows the collision and Install (and Update) write
  **nothing at all**, with a sentence that renaming the user's module frees the slug — the User
  decision says "writes nothing", not "writes nothing of the help module".
- Gardener exclusion requires the marker on `modules/gaston-help/module.md` — an unmarked user module
  with that slug is the user's content and stays checked.
- The exclusion sits in `buildContext` and every `vaultSize` read uses the filtered view — today both
  size sites read the unfiltered `deps.index` (`report.ts:181`, `gardener-deps.ts:577`), so filtering
  only the checks would still change the score.
- Help content describes only behaviour that ships by the end of S20; proposals are described as
  084's `CLAUDE.md` defines them, without claiming a Maintenance review that S21 builds — guardrail 3
  applies to Gaston's own pages; S21 stories extend the agent page with a version bump.
- Slug and agent-page path are constants in `src/shared/help-module.ts` — core and renderer both need
  them, and `src/shared/` is the layer both sides import.
- The Agent tab shows one aggregate row for the help module, worst state wins: missing (`module.md`
  absent) > collision > outdated (any managed file missing, older or modified) > current — AC4 asks
  for a module-level state, the per-file list stays 084's.
- Help pages are English regardless of `languages.documents` — concept §3 ("everything English").
- One new e2e flow walks Install → Knowledge → outdated → Update → About this link — AC1, AC4 and AC7
  are steps on the same user path.

## Plan

Depends on 084 (built before this story): its managed-file registry, marker/version status, plan
dialog and writer under `src/core/agent/`. This story adds a second kind of managed content to it.

1. **Content and renderer (core).** `src/shared/help-module.ts` holds `HELP_MODULE_SLUG =
'gaston-help'` and `HELP_AGENT_PAGE`. `src/core/agent/help/` holds the page constants (split over
   files, each < 300 lines) and `renderHelpModule()` → the full file set (`module.md`, `AGENTS.md`,
   `wiki/index.md`, `wiki/overview.md`, one page per rail screen, `vault-format.md`, `agent.md`), all
   marked with `HELP_MODULE_VERSION`. Reuses `pageFrontmatter` (`src/core/wiki/pages.ts`) and
   `renderAgentsMd` (`src/core/wiki/agents-md.ts`).
2. **Setup integration (core).** Register the help files in 084's managed set; teach the marker
   reader the frontmatter form; collision check; log entry; aggregate status. Update rewrites only
   marked files; unmarked pages in the folder are the user's.
3. **Gardener exclusion (core + one main line).** `withoutHelpModule(view)` filters pages, docs and
   catalog of the marked help module; `buildContext` applies it; both `vaultSize` sites read it.
4. **Agent tab (renderer + main wiring).** Help-module row with aggregate status and the collision
   sentence; "About this" links to `homeOf(HELP_AGENT_PAGE)`; index refreshed after Install/Update
   so Knowledge lists the module at once. One e2e flow.
5. Docs: VAULT-FORMAT.md (reserved slug, marker keys), CHANGELOG.md `## Unreleased`.

Order: D1 → D2 → D3 (independent of D2) → D4.

## Deliverables

- [x] **D1 — Help pages and their renderer (core).** Files: new `src/shared/help-module.ts`
      (`HELP_MODULE_SLUG = 'gaston-help'`, `HELP_AGENT_PAGE = 'modules/gaston-help/wiki/concepts/agent.md'`),
      new `src/core/agent/help/` with `version.ts` (`HELP_MODULE_VERSION = 1`), `pages-screens.ts` (one
      constant per rail screen, keyed by `ScreenId`: dashboard, chats, projects, journal, knowledge, notes,
      tasks, garden, settings — copy the id list into core, do **not** import `src/renderer/` from core),
      `pages-reference.ts` (`vault-format`, `agent`, overview text) and `render.ts` exporting
      `renderHelpModule(): ReadonlyArray<{ path: string; content: string }>` with vault-relative paths.
      Each page: frontmatter via `pageFrontmatter` (`src/core/wiki/pages.ts:172`) with `type: concept`,
      `module: gaston-help`, `lang: en`, `sources: []`, plus `managed_by: gaston` and
      `template_version: HELP_MODULE_VERSION`; path `modules/gaston-help/wiki/concepts/screen-<id>.md`,
      `vault-format.md`, `agent.md`. `module.md` has the module frontmatter shape `createModule` writes
      (`src/core/wiki/module.ts:101`; title "Gaston help", `lang: en`) plus the two marker keys.
      `wiki/overview.md` is `type: overview`, marked, linking the pages. `AGENTS.md` = 084's Markdown
      comment marker + one paragraph ("maintained by Gaston, treat as read-only, you may add your own
      pages") + `renderAgentsMd('gaston-help', 'Gaston help', 'en')`; `wiki/index.md` = the comment
      marker + one line per managed page (shape of `indexBody`, `module.ts:70`). Content: English,
      sentence case, no emoji; each screen page says what the screen is for and its main actions, read
      from that screen's code under `src/renderer/screens/`; `vault-format.md` summarises
      `docs/VAULT-FORMAT.md` (layers, folders, frontmatter, the index is derived); `agent.md` covers the
      setup, the protection (no `journal/` read, no `raw/` write), direct wiki writes with `log.md`,
      proposals as 084's `CLAUDE.md` template defines them, the terminal buttons and how to ask about
      Gaston. **Only behaviour that exists** — no Maintenance review of proposals, no jobs, no last run.
      Tests: `tests/core/agent/help-module.test.ts` (every rail screen has a page — imports `SCREENS` from
      `@renderer/lib/screens`, as `tests/renderer/i18n.test.ts` does; every rendered file carries marker
      and version) and `tests/core/wiki/ask-help-module.test.ts` using `wikiFixture(extraFiles)`
      (`tests/core/wiki/fixtures.ts:116`) fed with `renderHelpModule()`, `gatewayWithReplies` /
      `emptyGateway` (`tests/helpers/llm.ts`), mirroring `tests/core/wiki/ask.test.ts:128` and `:253`.
      Test names: "every rail screen has a help page", "every help file carries the Gaston marker and
      version", "a question about proposals cites the help module agent page", "without a model the
      search hits include the agent page".

- [x] **D2 — The help module joins the managed setup (core).** Read `src/core/agent/` (built by 084)
      first and extend it; do not write a second status comparator, planner or writer. Files: 084's
      managed-file registry / status / marker module(s) in `src/core/agent/`, new
      `src/core/agent/help/setup.ts`, `docs/VAULT-FORMAT.md`, `CHANGELOG.md`.
      (a) Register every file from `renderHelpModule()` (D1) as a managed entry with version
      `HELP_MODULE_VERSION`. (b) Extend the marker reader with the frontmatter form (`managed_by: gaston`
  - `template_version`) next to 084's comment form — one reader, two forms. (c) Collision: if
    `modules/gaston-help/` exists and its `module.md` is missing or unmarked, the plan carries a
    `collision` for the help module and Install/Update write nothing at all. (d) `wiki/log.md`: created
    with `logHeader('en')` (`src/core/wiki/log-md.ts:93`) if missing; every Install/Update that writes
    help files appends one entry via `appendLog`/`formatLogEntry` naming the version and the pages
    written. (e) Aggregate help status `missing | collision | outdated | current` (worst wins; a
    "modified" file counts as outdated and keeps 084's confirm rule). (f) Update rewrites only marked
    files that are outdated, missing or (after confirm) modified; a file in the folder without the
    marker is never written, moved or deleted. Writes go through the store with `expectedHash` /
    `mustNotExist` like 084's writer. Docs: VAULT-FORMAT.md gets the reserved slug `gaston-help` and the
    two marker keys (German, like the rest of that file); CHANGELOG `## Unreleased` gets one line.
    Tests: `tests/core/agent/help-setup.test.ts` on a temp vault (`createTempVault`,
    `tests/helpers/vault.ts:53`), named "install writes the help module with module.md, AGENTS.md and
    its pages", "the help module reads as missing, outdated or current", "update rewrites only marked
    help files", "a page the user added stays byte-identical after update", "an unmarked user module
    named gaston-help blocks install and nothing is written".

- [x] **D3 — Gardener skips the help module (core + one main line).** Files: new
      `src/core/gardener/help-exclusion.ts` exporting `withoutHelpModule(view: GardenerIndexView):
GardenerIndexView` — drops pages with `module === 'gaston-help'`, docs whose path is under
      `modules/gaston-help/` from `index().docs` and `byPath`, broken links and todos from those paths —
      **only** when `byPath.get('modules/gaston-help/module.md')?.frontmatter.managed_by === 'gaston'`;
      `src/core/gardener/report.ts` (`buildContext` sets `index: withoutHelpModule(deps.index)`; the
      `vaultSize` call at `:181` reads `ctx.index`); `src/main/ipc/gardener-deps.ts` (the `vaultSize` at
      `:577` reads the filtered view). Other users of `gardenerIndex()` (fix actions, loose ends) stay
      unfiltered. Tests: `tests/core/gardener/help-exclusion.test.ts` (fixture helpers in
      `tests/core/gardener/fixtures.ts`) and one case in `tests/main/gardener-ipc.test.ts` through
      `runWithProgress` — the stored run's size and findings must not see the help module. Test names:
      "a defective help-module page yields no finding", "the health score is the same with and without
      the help module", "an unmarked user module named gaston-help is still checked" (core), "a run
      leaves the help module out of findings and vault size" (main).

- [x] **D4 — Agent tab row, About link, Knowledge refresh, e2e (renderer + main wiring).** Files: the
      Agent tab's setup section and "About this" section (built by 083/084 under
      `src/renderer/screens/settings/`), `src/renderer/i18n/en-settings.ts` + `de-settings.ts` (German
      with `„…“`), 084's install/update IPC handler under `src/main/ipc/` only if needed, new
      `tests/e2e/help-module.spec.ts`. Row "Help module" with the aggregate status from D2 (current /
      outdated / missing / collision with its sentence; Install confirm disabled on collision). "About
      this" gets a link built with `homeOf(HELP_AGENT_PAGE)` (`src/renderer/lib/doc-home.ts:27`) that
      navigates in-app to Knowledge. After Install/Update, Knowledge must list the module without a
      manual refresh: if the watcher does not pick the writes up, the handler calls
      `index.refresh(writtenPaths)` (pattern `src/main/ipc/module-lifecycle.ts:106`). Gaston atoms only,
      tokens only. Run `npm run verify:ui` for the tab. e2e test "the help module comes with the agent
      setup and opens from About this" (fixture `tests/e2e/fixtures/app.ts`; deep-link pattern as in
      `tests/e2e/ask-citation-in-app.spec.ts`): open `#/settings?tab=agent` → help row reads missing →
      Install → confirm → row reads current → rail Knowledge lists "Gaston help" → lower one page's
      `template_version` on disk → row reads outdated → Update → current → click the About-this link →
      Knowledge shows the agent page.

## Model Hints

- D2 → deliverable-hard — it extends 084's write path to a second marker form in a folder where user
  pages live next to managed ones; a marker misread (or a collision check that only guards Install)
  overwrites or deletes a user's page, which is the data loss "no write path silently overwrites the
  user's edits" forbids.

Review: → story-review-hard — help pages that describe features S20 does not ship (proposals
reviewed in Maintenance, jobs, a last-run report) or misdescribe a screen pass every test and read
plausibly in a diff; the second pass checks each page's claims against the screen code (guardrail 3
applied to Gaston's own evidence).

## Acceptance Tests

- AC1 → unit `tests/core/agent/help-setup.test.ts` › "install writes the help module with module.md, AGENTS.md and its pages"
  - e2e `tests/e2e/help-module.spec.ts` › "the help module comes with the agent setup and opens from About this" (step: after Install, Knowledge lists "Gaston help")
- AC2 → unit `tests/core/wiki/ask-help-module.test.ts` › "a question about proposals cites the help module agent page" and › "without a model the search hits include the agent page"
- AC3 → unit `tests/core/gardener/help-exclusion.test.ts` › "a defective help-module page yields no finding", › "the health score is the same with and without the help module" and › "an unmarked user module named gaston-help is still checked"; main `tests/main/gardener-ipc.test.ts` › "a run leaves the help module out of findings and vault size"
- AC4 → unit `tests/core/agent/help-module.test.ts` › "every help file carries the Gaston marker and version"; unit `tests/core/agent/help-setup.test.ts` › "the help module reads as missing, outdated or current" and › "update rewrites only marked help files"; e2e `tests/e2e/help-module.spec.ts` › "the help module comes with the agent setup and opens from About this" (steps: row missing → Install → current; a page's `template_version` lowered on disk → outdated → Update → current)
- AC5 → unit `tests/core/agent/help-setup.test.ts` › "a page the user added stays byte-identical after update"
- AC6 → unit `tests/core/agent/help-module.test.ts` › "every rail screen has a help page" (walks `SCREENS`; also asserts the vault-format and agent pages)
- AC7 → e2e `tests/e2e/help-module.spec.ts` › "the help module comes with the agent setup and opens from About this" (step: the About-this link opens the agent page in Knowledge)
- Decision (collision) → unit `tests/core/agent/help-setup.test.ts` › "an unmarked user module named gaston-help blocks install and nothing is written"

Coverage: AC1 D2+D4 · AC2 D1 · AC3 D3 · AC4 D1+D2+D4 · AC5 D2 · AC6 D1 · AC7 D4.

## Done

Built D1–D4: the `gaston-help` module (English pages per rail screen, vault format, agent incl. the shell-check
limits, marker + version in frontmatter or comment), registered in 084's managed set (one Install/Update, collision
guard in plan and apply, log.md entry, aggregate status on `agent:setupStatus`), excluded from gardener findings and
both vault-size reads when marked, and shown in the Agent tab (help row, About-this link to the agent page,
Knowledge refresh after apply).

Commit message: `086: gaston-help module — managed help pages, collision guard, gardener skips it, Agent tab row + About link`

Verification (narrow gate, last run all green): `npm run build`, `lint`, `typecheck`, `format:check`;
`npx vitest run --changed HEAD` (261 files, 3579 tests); `npx playwright test tests/e2e/help-module.spec.ts` plus
`agent-setup.spec.ts` and `agent-protection.spec.ts` (4 passed). `verify:ui` run by a fix agent: no blocking axe
violation on the Agent tab or dialogs. Review: stage 1 (default) and stage 2 (hard) both ran; findings fixed.
AC → test (all ran and passed): AC1 help-setup "install writes…" + e2e; AC2 ask-help-module (both); AC3
help-exclusion (three) + gardener-ipc "a run leaves the help module out…"; AC4 help-module "every help file carries…"

- help-setup "reads as missing, outdated or current", "update rewrites only marked help files" + e2e; AC5 help-setup
  "a page the user added stays byte-identical…"; AC6 help-module "every rail screen has a help page"; AC7 e2e. Collision
  decision: help-setup "an unmarked user module named gaston-help blocks install…" (+ three further collision edges).
  Manual residue: none.

Decisions: help status rides on `agent:setupStatus` (no new channel). Collision is reported as `collision` (not `missing`)
whenever the help folder exists and `module.md` is not Gaston-marked, whatever the manifest says (hard review found the
manifest-first path); a manifest-recorded `module.md` that is only deleted reads `missing`. Marker ids are `help-<path>`
(marker grammar disallows `:`). `tsconfig.node.json` gets the `@renderer/*` path for the SCREENS walk. Generic
`.gs-dialog` max-height + scrolling body (a 22-file plan pushed the confirm button out of the window) — e2e labels
"Write 7 files" → "Write 22 files" in agent-setup/agent-protection specs. help-setup describe has a 20 s timeout
(parallel-load stalls). Tasks screen is the background-work queue; no terminal buttons exist, so the agent page says
the user opens Claude Code themselves. Unfixed on purpose: `settle` helper copied a third time in `agent-setup.ts`,
the missing/outdated/modified set repeated 3x, `indexFile` vs non-exported `indexBody`, 084's `vault-claude.ts` and
`en-settings.ts` wording about jobs/confirmation in Gaston (084's text; S21 extends the agent page with it).
Flaky once under load: `tests/renderer/journal.test.tsx` 5 s timeout (passes alone, 77 tests).

tiers: D 4 / hard 1 · review default+hard · cycles 3 · agents 14
