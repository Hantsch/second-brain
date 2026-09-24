---
id: 059
title: A search hit opens in the app
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-1](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: no search screen exists (`src/renderer/lib/screens.ts:22`); Ctrl+K shows at most
6 hits and a non-area hit runs `api.shell.openPath(hit.path)` — the OS default editor — with
the code's own comment "as long as the app doesn't have its own reading view"
(`src/renderer/components/CommandPalette.tsx:120`); snippets are computed
(`src/core/index/snippet.ts`) but not rendered; scope/type filters exist in `SearchQuery` and
in `retrieve()` but are not exposed anywhere.

## Requirement

"What do I know about X?" has two answers in this app: ask (an LLM answer with citations) and
search (find the note and read it). The second one currently ends outside the app: Ctrl+K shows
six title rows without snippets, and choosing one opens Notepad or Obsidian — for the app's own
journal days, project files, and wiki pages, all of which it can render. Citations in an answer
have the same exit. For a knowledge app, being ejected into an external editor to read your own
note is the most visible gap in the product.

Search needs a real result surface — more than six hits, with snippets, with the scope/type
filters the engine already supports — and a hit needs to open in a reading view inside the app.
Editing can stay external where no in-app editor exists yet; reading must not.

## Acceptance Criteria

- [x] A search has a full result view (reachable from Ctrl+K, e.g. "show all results") with
      snippets and the filters the index already supports (scope, type).
- [x] Selecting a hit opens the document in an in-app reading view: rendered Markdown,
      frontmatter not shown as a raw dump, wikilinks and vault paths navigable in-app.
- [x] Documents that already have an in-app home (areas, journal days, project files, wiki
      pages, condensed artifacts) deep-link to that home instead of a generic view.
- [x] "Open externally" remains available as an explicit secondary action — the default stops
      being the OS editor.
- [x] Citations in an ask answer use the same in-app opening.
- [x] Keyboard-first: the whole path from Ctrl+K to reading a hit works without the mouse.

## Open Questions

## Decisions (Sprint)

- **One "where does this path live" function for the whole renderer.** `targetFor()` in
  `screens/garden/targets.ts` already maps wiki pages, projects, condensed artifacts and areas
  to routes; it moves to `src/renderer/lib/doc-home.ts` as `homeOf(path)`, and garden keeps its
  own overrides on top — reuse over a second mapping (CLAUDE.md "reuse instead of copying").
- **`homeOf` always returns an in-app route.** A path with no home (inbox dumps, `raw/`,
  `projects/*/*/notes/*`, `module.md`, `wiki/index.md`, any other note) goes to the generic
  reader `/read?path=…`, never to the OS — that is the point of AC2/AC4.
- **Home table:** wiki page/overview → `/knowledge?m=&p=<path>`; `wiki/log.md` →
  `/knowledge?m=&tab=log`; `project.md` → `/projects?p=<slug>`; project `condensed.md` →
  `/projects?p=<slug>&tab=knowledge`; `areas/<slug>.md` → `/notes?a=<slug>`;
  `areas/<slug>.condensed.md` → `/notes?a=<slug>&tab=condensed`; journal day →
  `/journal?d=YYYY-MM-DD` — these are the deep links the screens already parse, nothing new.
- **Garden's behaviour is unchanged.** Its "plain area path lands on the condensed tab",
  `inbox/`→unfiled and `raw/`→sources overrides stay garden-local; widening them is not this
  story's scope (karpathy: no collateral edits).
- **Search gets a `scope` filter in `SearchQuery`, applied inside `filterFor()`**, i.e. before
  the limit cut — `IndexedDoc.scope` already exists, and filtering after the cut is exactly the
  bug story 052 exists to fix for ask; 052 can later reuse the same field.
- **The type filter is exposed as user-facing groups, not the ten raw `DocType`s**: journal,
  projects, areas, knowledge (`source|entity|concept|overview`), notes (`note|dump`), condensed —
  ten chips would be noise; the group maps to `SearchQuery.types`.
- **No module/tag/since filter in the UI.** The AC names scope and type; the rest stays
  engine-only until someone needs it.
- **The result view is a route, `/search?q=&scope=&types=`, not a rail entry.** The rail stays at
  its seven places (M1); the address carries the state so Back and a reload keep it, like every
  other screen.
- **Result paging: 50 hits, then "show more" (+50).** More than six, bounded, no virtualisation
  needed at vault sizes this app sees.
- **Snippet highlight is `<strong>`, not the teal accent.** `makeSnippet` marks hits with `**`;
  the one accent belongs to the focal point (the active row), not to every matched word.
- **Ctrl+K gets a "show all results for …" entry at the top of the search group** once the query
  has ≥2 characters — reachable with the arrow keys, no new hotkey to learn.
- **Palette hits navigate via `homeOf`** instead of `shell.openPath`; the palette itself stays a
  single-action list (no external-open there — it has two better places, below).
- **"Open externally" lives in two explicit places:** a secondary icon button per result row,
  and a secondary button in the reader header. The existing homes (day, wiki page, project)
  already carry their own external-open button and are not touched.
- **Frontmatter in the reader:** a facts row of known fields (type, date/created/updated,
  status, scope, module, tags, `sources` as navigable links) plus a collapsed "all fields"
  disclosure rendering the rest as a key/value list — never YAML text; `VaultDoc.body` already
  arrives without the frontmatter block.
- **Link resolution is a core function behind one new batched channel** —
  `resolveLink(target, fromPath, docs)` in `src/core/index/resolve-link.ts`, exposed as
  `search:resolveLinks { from, targets[] } → Record<target, path | null>`. Rules, in order: an
  existing vault path (with `./` and `:line` stripped) → itself; `[[module/slug]]`, or `[[slug]]`
  from inside a module → that module's wiki page (same rule as `derivePages`); a project or area
  slug → its file; otherwise a unique filename-stem match; else `null`. The renderer never
  guesses paths (guardrail 5), and batching keeps one round trip per rendered document.
- **An unresolved link renders as "missing", not as a dead button** — the same visual the wiki
  page view already uses (`WikiRef`), which moves to `components/` for reuse.
- **Citations:** a citation mark still opens `CitationPanel` (quote in context — that is the
  evidence view); its primary button becomes "open in app" via `homeOf`, "open externally"
  becomes secondary. A plain path ref in an answer opens in-app directly. Opening in-app closes
  the ask overlay first. No scroll-to-line in the reader: rendered Markdown has no stable line
  mapping, and the panel already shows the line in context.
- **Keyboard path:** Ctrl+K → type → arrows → Enter (hit or "show all"); results view autofocuses
  its query field, ArrowDown/ArrowUp move the active row, Enter opens it; the reader moves focus
  to its heading on open and every link is a real button in tab order; a "back" button returns.
- **Dependency on 057, not on 058.** 057 changes `Markdown.tsx`/`CitationPanel.tsx` (a rejected
  citation is not clickable) and restricts `shell:openPath` to vault-relative paths — D7 builds on
  that result and must keep it; 059's external-open always passes vault-relative paths, which
  057 keeps allowed. 058 (tray, window lifecycle) shares no file with this story.
- **The Gaston README is a handoff stub** pointing at a `gaston-design-system/project/` bundle
  that is not vendored; the binding design surface is `tokens/*.css`, `components/components.css`
  and the `gs-*` atoms — new screens use those plus existing `sb-*` patterns (`PageList`,
  `CitationList`, `sb-chip`), no raw palette.

## Plan

1. **Core (D1):** `scope?: Scope` in `SearchQuery` (`src/shared/types/knowledge.ts`), applied in
   `filterFor()` (`src/core/index/search.ts`). New pure `src/core/index/resolve-link.ts`
   (reuses `parseWikilinks`/`moduleOfPath` from `pages.ts`).
2. **IPC (D2):** channel `search:resolveLinks` in `src/shared/ipc.ts`, handler in
   `src/main/ipc/search.ts` (same `services.index()` guard: no index → all `null`),
   `api.search.resolveLinks` in `src/renderer/lib/api.ts`.
3. **Routing (D3):** `src/renderer/lib/doc-home.ts` (`homeOf`) extracted from
   `screens/garden/targets.ts`; `useOpenDoc()` hook (close overlays, then `navigate(homeOf(p))`).
4. **Reader (D4):** `/read?path=` screen — header (title, type overline, mono path, back,
   open externally), facts row + disclosure, body via `renderMarkdown` with refs resolved
   through D2; missing links marked; not-found state honest.
5. **Results (D5):** `/search?q=&scope=&types=` screen — query field, scope + type-group chips,
   rows (title, type, mono path/date, snippet), keyboard roving, show-more, external-open per row,
   empty and no-index states.
6. **Palette (D6):** hits via `useOpenDoc`, "show all results" entry; extract hit→command
   mapping out of `CommandPalette.tsx` (already 301 lines).
7. **Citations (D7):** `CitationPanel` primary = open in app; `AskPanel` path refs → `useOpenDoc`.
8. Every UI D adds its screen to `scripts/shot.mjs` and runs `npm run seed` + `npm run shot`.

Order: D1 → D2 → D3 → D4 → D5 → D6 → D7 (D7 after 057 is committed). i18n: new
`src/renderer/i18n/{en,de}-search.ts` (reader + results keys), German with `„…“`.

## Deliverables

- [x] **D1 — search scope + link resolver (core).** Files: `src/shared/types/knowledge.ts`,
      `src/core/index/search.ts`, `src/core/index/resolve-link.ts` (new), tests
      `tests/core/index/search-scope.test.ts`, `tests/core/index/resolve-link.test.ts`. Mirror:
      `filterFor` for the predicate, `derivePages` for module/slug semantics. Accept: scope filter
      applied before `limit`; each resolution rule plus ambiguous-stem → `null` tested.
- [x] **D2 — `search:resolveLinks` channel.** Files: `src/shared/ipc.ts`, `src/main/ipc/search.ts`,
      `src/renderer/lib/api.ts`, `tests/main/search-ipc.test.ts` (extend or new; IPC coverage test
      must stay green). Mirror: `search:query`. Accept: no index → every target `null`, never throws.
- [x] **D3 — `homeOf` + `useOpenDoc`.** Files: `src/renderer/lib/doc-home.ts` (new),
      `src/renderer/lib/use-open-doc.ts` (new), `src/renderer/screens/garden/targets.ts` (delegates,
      behaviour unchanged), `tests/renderer/doc-home.test.ts` (new; full home table incl. condensed
      and fallback to `/read`). Existing garden/filed-trail tests stay green unmodified.
- [x] **D4 — reading view.** Files: `src/renderer/screens/reader/ReaderScreen.tsx`,
      `ReaderFacts.tsx` (new), `src/renderer/components/WikiRef.tsx` (moved from
      `screens/modules/`, import updated), `src/renderer/App.tsx` (route),
      `src/renderer/i18n/{en,de}-search.ts` + `index.ts`, `scripts/shot.mjs`, e2e
      `tests/e2e/reader.spec.ts`. Mirror: `screens/modules/PageView.tsx`/`PageBody.tsx`.
- [x] **D5 — full result view.** Files: `src/renderer/screens/search/SearchScreen.tsx`,
      `SearchFilters.tsx`, `SearchResultRow.tsx`, `src/renderer/components/Snippet.tsx` (new),
      `src/renderer/lib/queries/search.ts` (+ `keys.ts`), `App.tsx` (route), i18n files,
      `scripts/shot.mjs`, e2e `tests/e2e/search-results.spec.ts`. Mirror: `components/PageList.tsx`,
      palette keyboard handling.
- [x] **D6 — Ctrl+K wiring.** Files: `src/renderer/components/CommandPalette.tsx`,
      `src/renderer/lib/use-search-commands.ts` (new, hit→command mapping + "show all" entry),
      `src/renderer/i18n/{en,de}.ts` (`palette.*`), existing palette renderer tests updated only
      where the open-externally expectation changes (never weakened), e2e
      `tests/e2e/search-keyboard.spec.ts`.
- [x] **D7 — citations open in-app.** Files: `src/renderer/components/CitationPanel.tsx`,
      `src/renderer/screens/ask/AskPanel.tsx`, i18n (`ask.citation.*`), renderer test for
      `CitationPanel`, e2e `tests/e2e/ask-citation-in-app.spec.ts`. Built on 057's committed state.

e2e notes for D4–D7 (all specs need `npm run build` first; one app+vault per spec file,
`test.use({ specId })`): the no-model harness vault answers ask with citations built from
excerpts (`askQuestion` fallback), so no fake provider is needed. Documents a spec needs that the
seed lacks (a dump with frontmatter, a `[[module/slug]]` link and a vault path; a condensed
artifact) are written into `vaultPath` by the spec, then waited for with `expect.poll` on the
search result — a missing fixture is work, not a gap. "Open externally" is observed by replacing
`shell.openPath` through `app.evaluate` with a recorder; if Electron's `shell` turns out not to
be patchable, the build names that as a harness gap in this file and covers the click one level
down (renderer test asserting `api.shell.openPath(path)`), never silently.

## Model Hints

- D7 → `deliverable-hard`: it reroutes the citation click right on top of 057's fresh
  rejected-citation guard in `Markdown.tsx`/`CitationPanel.tsx`, and a careless merge re-opens
  exactly the one-click path 057 closed.
- All other Ds: default.
- Review: → default (renderer-heavy, no vault write path, no lifecycle change; the one risky seam
  is D7 and already on the hard tier).

## Test Plan (manual acceptance)

### Acceptance tests

- AC1 → e2e `tests/e2e/search-results.spec.ts` › "the full result view shows snippets and
  narrows by scope and type" (plus unit `tests/core/index/search-scope.test.ts` › "scope filters
  before the limit cut") — D5, D1.
- AC2 → e2e `tests/e2e/reader.spec.ts` › "a hit without a home opens rendered, with facts
  instead of raw frontmatter" and › "a wikilink and a vault path in the reader navigate in-app"
  (plus unit `tests/core/index/resolve-link.test.ts`) — D4, D1, D2.
- AC3 → e2e `tests/e2e/search-results.spec.ts` › "hits with a home deep-link to it" (journal day,
  project, area, wiki page, condensed artifact — each asserted by route) plus unit
  `tests/renderer/doc-home.test.ts` › "every document kind maps to its home" — D3, D5.
- AC4 → e2e `tests/e2e/search-results.spec.ts` › "open externally is a secondary action, the
  default stays in the app" and `tests/e2e/reader.spec.ts` › "the reader offers open
  externally" (shell spy; see e2e notes for the named fallback) — D4, D5.
- AC5 → e2e `tests/e2e/ask-citation-in-app.spec.ts` › "a citation opens in the app, not in the
  OS editor" — D7.
- AC6 → e2e `tests/e2e/search-keyboard.spec.ts` › "Ctrl+K to reading a hit without the mouse"
  (Control+K, type, ArrowDown/Enter to "show all", ArrowDown/Enter to a hit, reader heading
  focused, Tab/Enter on a wikilink) — D6, D5, D4.

No manual residue: every criterion runs through the real app.

## Done

Search gained a real result surface and an in-app reading view. `SearchQuery.scope` filters
before the limit cut; a pure `resolveLink` (core) plus the batched `search:resolveLinks` channel
resolve wikilinks/vault paths without the renderer guessing paths. `homeOf()` (extracted from
garden's `targetFor`) deep-links documents that already have a home; everything else opens in the
new `/read` reader (facts row + disclosure, never raw YAML). The full result view lives at
`/search?q=&scope=&types=` with snippets, scope/type chips, keyboard roving and show-more paging.
Ctrl+K got a "show all results" entry and now opens hits via `homeOf`/`useOpenDoc` instead of
`shell.openPath`; "open externally" became an explicit secondary action everywhere (reader header,
result rows). Ask citations open in-app first (`CitationPanel` primary = open in app), keeping
057's rejected-citation guard in `Markdown.tsx` untouched.

**Commit message:**
```
059: a search hit opens in the app
```

**Verification:**
- `npm run build` — green.
- `npm run typecheck` — green.
- `npm run lint` — green.
- `npm run format:check` — green for every file this story touches; the only warnings are in
  pre-existing, unrelated files (`.claude/commands/*.md`, `docs/requirements/done/051|057|064*.md`,
  `docs/sprints/done/S16/review.md`) — present before this story, not touched by it.
- `npm test` — 304/305 files, 4079/4088 tests green. The one failing file,
  `tests/renderer/quick-capture.test.tsx` (9 tests, `window.localStorage.clear is not a function`),
  is a known pre-existing failure unrelated to this story (confirmed pre-existing by stories 057
  and 058); not touched here.
- `npm run test:e2e` — 71/71 green, including all four specs new to this story
  (`reader.spec.ts`, `search-results.spec.ts`, `search-keyboard.spec.ts`,
  `ask-citation-in-app.spec.ts`).
- Clean-agent review (fresh agent, no prior context): **PASS**, no blockers, no review-fix cycle
  needed. One minor note: `docs/requirements/063-*.md` shows as modified in the working tree —
  that is pre-existing, uncommitted refine-phase work from earlier in the sprint, unrelated to
  this story's deliverables; left untouched per the sprint's git-safety rule.

**AC → test mapping, as verified:**
- AC1 → `tests/e2e/search-results.spec.ts` › "the full result view shows snippets and narrows by
  scope and type" (passed) + `tests/core/index/search-scope.test.ts` › "scope filters before the
  limit cut" (passed).
- AC2 → `tests/e2e/reader.spec.ts` › "a hit without a home opens rendered, with facts instead of
  raw frontmatter" and › "a wikilink and a vault path in the reader navigate in-app" (both
  passed) + `tests/core/index/resolve-link.test.ts` (passed).
- AC3 → `tests/e2e/search-results.spec.ts` › "hits with a home deep-link to it" (passed) +
  `tests/renderer/doc-home.test.ts` › "every document kind maps to its home" (passed).
- AC4 → `tests/e2e/search-results.spec.ts` › "open externally is a secondary action, the default
  stays in the app" and `tests/e2e/reader.spec.ts` › "the reader offers open externally"
  (both passed).
- AC5 → `tests/e2e/ask-citation-in-app.spec.ts` › "a citation opens in the app, not in the OS
  editor" (passed); the review separately confirmed `Markdown.tsx` (057's rejected-citation
  guard) has zero diff.
- AC6 → `tests/e2e/search-keyboard.spec.ts` › "Ctrl+K to reading a hit without the mouse"
  (passed).

No manual residue; no open points or blockers.
