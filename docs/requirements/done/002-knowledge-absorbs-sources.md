---
id: 002
title: Knowledge absorbs sources
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

"Modules" names the mechanism, not the content. The screen holds what I know, so it
should be called **Knowledge**.

And **Sources** must not sit beside it. Sources is the entrance to Knowledge — every
ingested video, file, and URL ends up digested in a knowledge module. As two sibling
rail entries, that relationship is invisible: a new user cannot tell that ingesting a
source is how knowledge gets in. Sources belongs *inside* Knowledge, as its input
tab.

Target picture and reasoning: [concepts/navigation.md](../concepts/navigation.md).

This is a UI change only. The vault format is untouched — `modules/`, `raw/`,
frontmatter keys, and every code identifier keep their names. Renaming the folder
would break existing vaults for a label.

## Acceptance Criteria

- [x] The rail entry reads "Knowledge" (de: "Wissen"), in both languages, via `t()`.
- [x] The rail entry "Sources" is gone; the screen is reachable as a tab inside
      Knowledge, alongside the existing module views.
- [x] The sources screen keeps every function it has today: the detecting input
      field, drop zone, yt-dlp status, job list, inventory, detail dialog.
- [x] Ingesting a source from inside Knowledge still lets me pick the target module,
      and the picker is prefilled when I came from a module.
- [x] `#/sources` and every existing deep link into it still arrive at the right
      place (redirect, not a 404 or a blank screen).
- [x] The command palette finds both "Knowledge" and "Sources" and lands correctly.
- [x] Hotkeys stay consistent: no key points at a screen that no longer exists, and
      the freed key is either reassigned deliberately or left unassigned.
- [x] `#/modules?m=<slug>&tab=…` deep links from citations, maintenance findings, and
      the palette keep working — the route moves to `#/knowledge`, so old links land
      via a redirect that preserves the whole query string, with the same result.
- [x] No vault path, frontmatter key, type name, or IPC channel is renamed.
- [x] The screen is usable without a configured model, as before.

## Open Questions

All resolved on 2026-08-13:

- **Tab scope — both, at different levels.** The Knowledge top-level tab "Sources" is
  the full ingest workbench over *all* sources, exactly today's screen. The module
  detail keeps its existing sources tab, filtered to that module.
- **Not the same component.** The top-level tab reuses today's sources screen body
  as-is (extracted into a tab component); the module detail's list stays as it is.
  De-duplicating the two inventory wrappers is explicitly out of scope.
- **Route becomes `#/knowledge`.** `#/modules` and `#/sources` redirect, preserving
  the query string.
- **Hotkey 8 stays unassigned.** The rail is renumbered wholesale by the later
  navigation stories; no interim churn.

## Plan

UI only. No file under `src/core/`, `src/main/`, `src/shared/` is touched — the vault
format, all IPC channels and all `modules.*` / `sources.*` code identifiers stay. The
one identifier that does move is the renderer-local `ScreenId` `'modules'` →
`'knowledge'`, because it is the route/rail id and the route moves with it; the screen
folder `screens/modules/`, the `ModulesScreen` component, `modules.css` and the
`modules.*` i18n key family keep their names.

**URL model** (`ModulesScreen.tsx` already owns `m` / `tab` / `p` via `useSearchParams`
and its `go()` helper — extend it, do not add a second mechanism):

```
#/knowledge                            Knowledge, Modules tab (default, omitted)
#/knowledge?tab=sources                Knowledge, Sources tab
#/knowledge?tab=sources&into=<slug>    ... with the module picker prefilled
#/knowledge?m=<slug>&tab=log&p=<path>  module detail, unchanged semantics
#/modules*  #/sources                  redirect, query string preserved
```

The `tab` param therefore means two different things: with `m` absent it is the
screen-level tab (`modules` | `sources`), with `m` present it is the module tab
(`pages` | `graph` | `sources` | `log`), as today. `go()` currently *drops* `tab`
whenever `m === null` (`ModulesScreen.tsx:52`) — that rule has to be loosened for the
screen level while the `p`-only-on-pages rule stays.

Order of work:

1. Extract the sources screen body into a tab component (pure refactor, no behaviour
   change) — mirror `screens/settings/ModelsTab.tsx`.
2. Give the Knowledge screen its top-level tab bar — mirror
   `screens/settings/SettingsScreen.tsx` (`TAB_IDS` / guard / `<Tabs>` / bodies).
3. Rename the rail entry and move the route to `/knowledge`; add the redirects.
4. Repoint every outgoing link and the screenshot scripts.
5. Add the module prefill and the UI trigger for it.
6. Palette entry for Sources, plus the hotkey/rail table in `docs/ARCHITECTURE.md`.

**Watch out:** `<Navigate to="/knowledge" />` **drops the query string**. The redirect
must be a small component that reads `useLocation().search` and appends it, otherwise
every existing `#/modules?m=…` deep link silently lands on the module overview — the
single most likely regression in this story.

## Deliverables

**D1 — `SourcesTab`: the sources body as a reusable component.**
Pure refactor, zero behaviour change. Move everything below the screen header out of
`SourcesScreen` into a tab component; the screen becomes `ScreenHeader` + `SourcesTab`
and keeps its `/sources` route for now.

- new `src/renderer/screens/sources/SourcesTab.tsx`
- `src/renderer/screens/sources/SourcesScreen.tsx`
- mirror: `src/renderer/screens/settings/ModelsTab.tsx`

_Acceptance:_ `tests/renderer/sources.test.tsx` stays green **without changing a single
assertion**; input field, drop zone, yt-dlp row, job list, inventory and detail dialog
all behave as before, including with no model configured.

**D2 — Knowledge gets its top-level tab bar.**
`ModulesScreen` becomes the Knowledge root: screen header, then `<Tabs>` with
`modules` | `sources` when `m` is absent, rendering `ModuleCards` or `SourcesTab`.
With `m` present, `ModuleDetail` renders as today (no top-level bar inside a module).
Extend `go()` for the screen-level `tab`; default tab omitted from the URL.

- `src/renderer/screens/modules/ModulesScreen.tsx`
- `src/renderer/i18n/de-wiki.ts`, `en-wiki.ts` (new `knowledge.tab.modules|sources`)
- `tests/renderer/modules.test.tsx` (tab switching; `?m=&tab=` still reaches the
  module tabs)
- mirror: `src/renderer/screens/settings/SettingsScreen.tsx`

_Acceptance:_ `#/modules?tab=sources` shows the full sources workbench;
`#/modules?m=<slug>&tab=log&p=…` still opens the module detail on the log tab.

**D3 — Rail says "Knowledge", Sources leaves the rail, route moves.**
`screens.ts`: screen id `modules` → `knowledge`, path `/knowledge`, labelKey
`rail.knowledge`, hotkey `7` kept; the whole `sources` entry is removed and `8` stays
unassigned. `App.tsx`: route `/knowledge`, plus a query-preserving redirect component
for `/modules` and `/sources` (target `#/knowledge?tab=sources` for the latter);
`SourcesScreen.tsx` is deleted.

- `src/renderer/lib/screens.ts`, `src/renderer/App.tsx`
- delete `src/renderer/screens/sources/SourcesScreen.tsx`
- `src/renderer/i18n/de.ts`, `en.ts` (`rail.knowledge` = "Wissen" / "Knowledge",
  `rail.modules` and `rail.sources` removed)
- `src/renderer/i18n/de-screens.ts`, `en-screens.ts` (`screen.modules.*` →
  `screen.knowledge.*`; `screen.sources.*` stays, the tab still uses it)
- `tests/renderer/i18n.test.ts` (the id list at :71-89), `tests/renderer/screens.test.tsx`

_Acceptance:_ rail entry 7 reads "Knowledge" / "Wissen", no Sources entry, digit `8`
does nothing; `#/sources` and `#/modules?m=x&tab=log` both land correctly.
`git diff --stat src/core src/main src/shared` is empty.

**D4 — Repoint outgoing links and the screenshot scripts.**

- `src/renderer/screens/garden/targets.ts` (`raw/…` → `/knowledge?tab=sources`;
  `/modules?m=…` → `/knowledge?m=…`)
- `src/renderer/screens/sources/SourcesTab.tsx` (`openPage` / `openSourcePage`)
- `scripts/lib/screens.mjs`, `scripts/shot.mjs`
- `tests/renderer/garden.test.tsx`

_Acceptance:_ a maintenance finding on a `raw/` path opens the Sources tab; `npm run
shot` produces the Knowledge screenshots without a blank frame.

**D5 — Module prefill and its UI trigger.**
`ModulesScreen` reads `into=<slug>` and passes it as the initial target module to
`SourcesTab`; `ModuleDetail`'s sources tab gets a button that navigates to
`#/knowledge?tab=sources&into=<slug>`.

- `src/renderer/screens/modules/ModulesScreen.tsx`, `ModuleDetail.tsx`
- `src/renderer/screens/sources/SourcesTab.tsx` (new `initialModule` prop)
- `src/renderer/i18n/de-wiki.ts`, `en-wiki.ts` (button label)
- `tests/renderer/modules.test.tsx`

_Acceptance:_ from a module's sources tab, one click lands on Knowledge/Sources with
that module already selected in the picker; without `into`, the picker still starts on
"file later".

**D6 — Palette entry for Sources, and the docs.**
The palette derives its screen entries from `SCREENS`, so Sources disappears with D3.
Add a static command next to the existing `action:capture` entry
(`CommandPalette.tsx:49-57`) that navigates to `/knowledge?tab=sources`.

- `src/renderer/components/CommandPalette.tsx`
- `docs/ARCHITECTURE.md` (rail order + hotkey table at :108-124)
- `tests/renderer/screens.test.tsx` or a palette test

_Acceptance:_ Ctrl+K, "know" → Knowledge; "sour" / "quel" → Sources, landing on the
Sources tab.

**Coverage** — every acceptance criterion, in order: rail label → D3 · Sources off the
rail, in as a tab → D3 + D2 · every function kept → D1 + D2 · module picker and
prefill → D5 · `#/sources` and its deep links → D3 + D4 · palette finds both → D6 ·
hotkeys → D3 + D6 · `#/modules?m=&tab=` deep links → D3 + D2 · nothing renamed outside
the renderer → D3 · usable without a model → D1.

## Model Hints

D2 → deliverable-hard — the `tab` search param changes meaning depending on whether
`m` is set, and `go()` currently deletes `tab` whenever `m === null`; getting that
rewrite subtly wrong breaks every existing `#/modules?m=…&tab=…` deep link without
failing an obvious test.

D1, D3, D4, D5, D6 → default.

Review: → story-review-hard — the story is a rename spread across routes, rail,
palette, hotkeys, garden targets and screenshot scripts, where one missed link is a
dead screen that a green test run will not catch.

## Test Plan (manual acceptance)

`npm run seed`, then start the app.

1. Rail: entry 7 reads "Knowledge", there is no "Sources" entry. Settings → switch UI
   language to German → it reads "Wissen".
2. Press `7` → Knowledge, Modules tab. Press `8` → nothing happens.
3. Click the **Sources** tab: input field, drop zone, yt-dlp status row, job list and
   inventory are all there. Paste a YouTube URL → the kind badge appears. Open the
   module picker → "file later" plus the module list. Open a source row → detail
   dialog.
4. Open a module card → detail with Pages / Graph / Sources / Log. On its **Sources**
   tab, click "ingest into this module" → lands on Knowledge/Sources with that module
   preselected.
5. Reload the app on `#/sources` → Knowledge, Sources tab. Reload on
   `#/modules?m=<slug>&tab=log` → that module's detail, log tab.
6. `Ctrl+K` → "know" finds Knowledge, "sour" (de: "quel") finds Sources; both land
   correctly.
7. Maintenance: open a finding on a `raw/…` path → lands on the Sources tab.
8. Settings → remove the configured model → the Sources tab still renders and the
   input field still accepts a URL.

## Done

Sources is no longer a sibling of Knowledge but its input tab. `ModulesScreen` became the
Knowledge root with a top-level `Module | Quellen` tab bar, the sources body moved into a
reusable `SourcesTab`, the route moved from `#/modules` to `#/knowledge`, and `#/modules` /
`#/sources` stayed alive as query-preserving redirects. The rail is down to ten entries, digit
`8` is deliberately unassigned. Nothing outside `src/renderer/` and the screenshot scripts
changed — no vault path, frontmatter key, type name or IPC channel was renamed.

**Commit message**

```
002: knowledge absorbs sources
```

### Decisions

Made during the build (the sprint ran without a reachable user), each checked against the plan,
the acceptance criteria and CLAUDE.md:

- **`go()` got a separate `screenTab` field instead of overloading `tab`.** `sources` is a legal
  value in both namespaces, so a single field could not be disambiguated by value. Both readings
  are derived separately and each is gated on `m`, which is what keeps `#/knowledge?m=…&tab=log`
  and `#/knowledge?tab=sources` from ever being read as each other.
- **The early returns moved into `ModulesTab`.** `ModulesScreen` used to return early on error,
  loading and "no modules". Those states belong to the modules tab, not to the screen — otherwise
  a fresh vault would answer `#/knowledge?tab=sources` with "create your first module", which is
  the opposite of what someone opening the sources tab wants.
- **`SourcesTab` owns the `DropZone`.** A drop feeds exactly the state the tab owns (input, target
  module, ingest mutations); hoisting the zone into the screen would have hoisted that state with
  it. The zone is stretched to the bottom of the screen column via
  `.sb-screen:has(> .sb-dropzone)`, so the droppable area stays what it was before the split.
- **`into=` is a seed, not state.** It survives only on the Knowledge root's sources tab, never in
  a module address. An unknown or deleted slug falls back to "file later" instead of inventing a
  target. The seed is applied through a `key`-based remount rather than an effect, so a choice
  made inside the picker is never overwritten. While the index is still being built the workbench
  renders unseeded rather than waiting behind a skeleton — `useModules` is disabled during a build
  and the list would never arrive.
- **`screen.knowledge.overline` is new wording.** The old overline literally was "Wissen", which
  would have duplicated the new title; it now reads "Module und Quellen" / "Modules and sources",
  following the overline-is-a-category convention of the neighbouring screens.
- **The English button label reads "Take in a source for this module", not "Ingest into …".** The
  existing English strings translate *aufnehmen* as "take in" throughout; a second vocabulary for
  the same act would have been the more expensive choice.
- **`scripts/a11y.mjs` got a deep-state → screen lookup table.** The old ternary mapped anything
  not starting with `module` to `settings`, so the new `knowledge-sources` state could not be
  bolted on without also fixing the mapping. As a side effect the `project-*` states are now
  checked under `projects` instead of `settings`.

### Verification

- `npm run build` green · `npm run lint` green · `npm run typecheck` green.
- `npm test`: 1743 passed, 1 failed. The failure is `tests/core/wiki/module.test.ts`
  ("bleibt Zeichen fuer Zeichen die Vorlage aus docs/MODULE-SCHEMA.md") and is **pre-existing and
  unrelated**: `MODULE_SCHEMA_TEMPLATE` in `src/core/wiki/` has drifted from the German
  `docs/MODULE-SCHEMA.md`, and neither file is in this story's diff
  (`git diff --stat HEAD -- src/core src/main src/shared` is empty).
- `npm run format:check`: 15 offenders, all pre-existing markdown under `docs/` and `.claude/`,
  none introduced here. Every touched source, test and doc file is prettier-clean.
- **Live smoke (P2), passed.** `npm run seed && npm run shot` produced 53 screenshots with no
  console errors, including the new `knowledge-sources` deep state. On top of that the built app
  was driven through all eight steps of the test plan below via the Playwright `_electron`
  harness — 18 assertions, all green, zero console errors: rail reads "Wissen" with digit 7 and
  no "Quellen" entry; `7` opens Knowledge and `8` does nothing; the sources tab has input,
  YouTube detection, module picker, drop zone, yt-dlp row, inventory and detail dialog; the
  module detail's "Quelle in dieses Modul aufnehmen" lands on
  `#/knowledge?tab=sources&into=identity-management` with the picker preselected; `#/sources`,
  `#/modules?m=…&tab=log` and `#/modules?m=…&p=…` all redirect with the query string intact;
  `Ctrl+K` finds "Quellen" and "Wissen"; a `raw/` maintenance finding opens the sources tab. The
  demo vault has no LLM provider configured, so the whole run was in the "no model" state.
- **Code review by a clean agent (`story-review-hard`): PASS**, all ten acceptance criteria PASS,
  no blockers, no weakened tests, no scope creep.

### Findings from the review

Fixed:

- The `into=` seed waited on `useModules`, which is disabled while the index is being built — the
  workbench sat behind a skeleton that had nothing to wait for. Now gated on `indexing`, with a
  test that pins it (`tests/renderer/modules.test.tsx`).
- `.sb-dropzone` lost its full-height drop area when it became a flex item of `.sb-screen`, so a
  file dropped below the last panel landed nowhere. Restored via
  `.sb-screen:has(> .sb-dropzone) { min-height: 100% }`.

Deliberately not fixed (all graded "nit", none of them acceptance-relevant):

- A new `into` remounts `SourcesTab`, so typed input would be discarded if the seeded module were
  deleted externally mid-edit. Fixing it means an effect, which is exactly what the plan warned
  against; the trade is worse than the case.
- A stale `into=` and an `m=` naming no module both stay in the address. The screen falls through
  correctly in both cases; rewriting the URL behind the user's back is the worse habit.
- `screen.sources.overline` / `.title` lost their consumer when `SourcesScreen`'s header was
  deleted, and `tests/renderer/i18n.test.ts` still requires the whole family. Left for the
  follow-up navigation stories, which touch these keys anyway.
- `tests/renderer/modules.test.tsx` still uses `/modules…` as its `MemoryRouter` entry. Harmless
  (the component is rendered directly, only the search params matter), but worth tidying.

### Open points

- `checkScreenList()` in `scripts/lib/screens.mjs` warns that `agents` is missing from the
  script's screen list. Pre-existing from story 001 and out of scope here: adding it would make
  `shootScreens` and `shootDeepStates` both write `agents.png` for the same route.
