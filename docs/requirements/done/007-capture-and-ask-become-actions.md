---
id: 007
title: Capture and ask become actions, not places
status: done # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

Capture and Ask are things I *do*, not places I go. Right now they each own a rail
entry, which puts them on the same footing as Projects and Journal and makes the
navigation harder to read than the app actually is.

Capture is also redundant: the global window (`Ctrl+Shift+Space`) does the same thing
from anywhere, including when the app is not in the foreground. It is the better path
and it is already built.

Ask is worse off as a screen than as an overlay: I want to ask *from inside* a
context — in a project, in a module — and have the search scope already right.
Navigating away to a separate screen loses exactly the context that would have made
the question precise.

Target picture: [concepts/navigation.md](../concepts/navigation.md).

## Acceptance Criteria

- [x] The rail entries "Capture" and "Ask" are gone.
- [x] Both are reachable from a visible control in the shell — not by hotkey alone —
      and from the command palette.
- [x] Their hotkeys keep working, including the global `Ctrl+Shift+Space`.
- [x] Ask opens as an overlay over the current screen, with the search scope
      prefilled from where I am: inside a module, that module; inside a project, that
      project; otherwise the whole vault.
- [x] Ask keeps everything it has today: citations with file paths, the honest "no
      evidence found" answer, and filing an answer back as a wiki page.
- [x] Capture keeps stating where the thought landed, with the path, and keeps its
      undo.
- [x] `#/capture` and `#/ask` still land correctly — as the overlay, not a dead route.
- [x] The quick-capture window is untouched.
- [x] The freed hotkeys are either reassigned deliberately or left unassigned; no key
      points at a screen that no longer exists.
- [x] Both have an honest "no model configured" state, as today.
- [x] Both are still reachable from their dashboard tiles.

## Open Questions

- ~~Does the capture *screen* disappear entirely (the global window being the only
  path), or does it stay as an overlay?~~ answered → Decisions (Sprint)
- ~~Ask and the command palette are both `Ctrl+K`-shaped. One control with two modes,
  or two clearly separate controls?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Capture screen vs. overlay: capture stays reachable as an overlay inside
  the shell (in addition to the existing global `Ctrl+Shift+Space` popup), not removed
  entirely.
- **(User)** Ask vs. command palette: one control with two modes behind `Ctrl+K`
  (palette mode and ask mode), not two separate controls.
- Overlay state lives in React state in the shell (a small `ShellOverlays` context),
  not in a search param on the current route — screens rebuild their own params
  (`ModulesScreen.go()` drops what it does not know), which would close the overlay.
- `#/capture` and `#/ask` become tiny opener routes that open the overlay and
  `replace` the URL, keeping `?q=` — the same "no dead route" rule as 002, without a
  second navigation mechanism.
- Entered cold by URL, an overlay opens over the dashboard, because that is already
  the app's default route.
- Every existing in-app link (dashboard tiles, inbox, recent work) keeps navigating to
  `/capture` / `/ask?q=…`; only the opener routes change behaviour, so there is one
  mechanism, not two.
- `Ctrl+K` keeps palette mode as its default and gains ask mode (visible mode chips,
  `Tab` toggles, `?` prefix) — the palette is the established `Ctrl+K` surface and the
  second mode has to be discoverable without knowing a key.
- In ask mode `Enter` hands the question to the ask overlay **and submits it**: the
  keystroke is the user's action, unlike a `?q=` URL, which by AskScreen's existing
  rule only prefills.
- Digits `2` and `4` stay unassigned — the wholesale rail renumber stays with the
  later navigation stories (002's decision), so there is no interim churn.
- No new in-app capture hotkey: the global `Ctrl+Shift+Space` also fires while the app
  is focused, and capture additionally gets a visible button and a palette entry.
- The visible controls sit in the title bar — a capture button beside the existing
  search trigger, and the trigger relabelled "search or ask" — because the title bar
  is the shell's action row, visible from every screen.
- `palette.action.capture` opens the in-shell capture overlay; a second entry keeps
  the separate quick-capture window, so nothing reachable today is lost.
- Ask gets a real `project` filter through `chat:ask` (shared + main + `retrieve()`,
  mirroring the existing `scope` post-filter over `IndexedDoc.project`) — prefilling a
  project scope that does not actually filter would be a false claim.
- The scope prefill is derived from the URL by one pure helper (`lib/ask-scope.ts`):
  `?m=` on the knowledge route → module, `?p=` on `/projects` → project, else nothing.
- The prefilled project shows as a single clearable chip in the composer, not a
  project picker — a chip per project would drown the composer, but the active filter
  has to stay visible and removable.
- Capture's "no model" state stays exactly as today (the proposal strip's wording, no
  `LlmMissing` card): the criterion says "as today", and a card would add a claim to
  the one screen whose point is speed.
- `Escape` inside a panel becomes an `onEscape` prop (overlay → close, screen and
  journal → today's rail focus), because the hard-coded `.sb-rail-item[aria-current]`
  focus in `CaptureScreen` and `ChatComposer` points at a rail entry that is gone.
- `CapturePanel` / `AskPanel` are pure extractions of today's bodies (mirroring 002's
  `SourcesTab`), so every existing test assertion stays valid.
- Overlay screenshots get explicit names (`capture-overlay`, `ask-overlay`) instead of
  the positional `NN-<screen>.png`, since both leave the ordered `SCREENS` list.
- The i18n families `screen.capture.*` / `screen.ask.*` stay (the overlays use them);
  only `rail.capture` / `rail.ask` go, and the i18n test's rail loop shrinks with them.

## Plan

Renderer, plus one thin vertical slice: the ask **project filter** needs `chat:ask` to
carry `project` (shared contract, main handler, `core/wiki/ask.ts` `retrieve()`). No
new IPC channel, no vault path, no renamed identifier.

Builds on 002 (same sprint branch): the knowledge route is `/knowledge?m=<slug>` by
then, but `#/modules?m=` still redirects — so the scope helper matches on the `m` / `p`
params, not on the pathname alone.

**Shell model.** `AppShell` already hosts the palette and says so in its header
comment. It gains a `ShellOverlays` context with `openCapture()`, `openAsk(prefill)`
and `close()`, plus the two overlay components. `useShellHotkeys` keeps `Ctrl+K` and
`Escape`; the digit keys keep working for the remaining screens.

```
Ctrl+K            palette mode (default) ⇄ ask mode      one control, Tab switches
Ctrl+Shift+Space  global quick-capture window            unchanged
title bar         [search or ask …  Ctrl+K]  [capture]   the two visible entries
#/capture         opens the capture overlay, URL → /dashboard (replace)
#/ask?q=…         opens the ask overlay with q prefilled, URL → /dashboard (replace)
```

**Scope prefill** (`lib/ask-scope.ts`, pure, unit-tested): `?m=<slug>` on
`/knowledge` (or `/modules`) → module filter · `?p=<slug>` on `/projects` → project
filter · otherwise no filter, i.e. the whole vault.

Order of work:

1. Extract `CapturePanel` and `AskPanel` (pure refactor) — mirror 002's `SourcesTab`.
2. Overlay host in the shell + capture overlay + the visible title-bar button.
3. Ask overlay.
4. Rail entries and routes out, opener routes in, links and tests repointed.
5. `Ctrl+K` gets its second mode.
6. `project` through `chat:ask`, then the scope prefill on top of it.
7. Docs, screenshot and a11y scripts.

**Watch out:** `checkScreenList()` in `scripts/lib/screens.mjs` compares its hard-coded
list against `screens.ts`, and `shell.test.tsx` asserts `SCREENS.length` literally —
both break the moment the two entries go (after 002 the count is 8). And `gotoScreen()`
waits for `window.location.hash === '#/<screen>'`, which the opener routes deliberately
no longer satisfy: the overlays need their own helper.

## Deliverables

**D1 — `CapturePanel`: the capture body as a reusable component.**
Pure refactor, zero behaviour change. Everything below the screen header moves out of
`CaptureScreen`; the screen keeps `/capture` for now. New optional `onEscape` prop —
the default is today's rail focus.

- new `src/renderer/screens/capture/CapturePanel.tsx`
- `src/renderer/screens/capture/CaptureScreen.tsx`
- mirror: `src/renderer/screens/sources/SourcesTab.tsx` (from 002)

_Acceptance:_ `tests/renderer/capture.test.tsx` stays green **without changing an
assertion**: count, scope, tags, saved path with undo, proposal strip with and without
a model, "ready for the next thought" after saving.

**D2 — `AskPanel`: the ask body as a reusable component.**
Same cut: `AskScreen` becomes `ScreenHeader` + `AskPanel`. `AskPanel` takes
`prefill?: { question?, module?, project?, scope? }` and `onEscape?`; `ChatComposer`
gains the same optional `onEscape` (default unchanged, so the journal keeps its
behaviour). The field id `sb-ask-field` stays.

- new `src/renderer/screens/ask/AskPanel.tsx`
- `src/renderer/screens/ask/AskScreen.tsx`, `src/renderer/components/ChatComposer.tsx`
- mirror: D1

_Acceptance:_ `tests/renderer/ask.test.tsx` and the journal tests stay green unchanged
— threads, stream, citations, "no evidence", file-back, "no model configured".

**D3 — Overlay host in the shell, capture overlay, visible button.**
`ShellOverlays` context (`openCapture`, `openAsk`, `close`, current state) provided by
`AppShell`; `CaptureOverlay` renders `CapturePanel` in a `gs-scrim` + `gs-dialog`
panel (mirror `CommandPalette`'s hand-rolled overlay with its own `sb-overlay*`
classes; the `Dialog` atom caps at 820 px and is too narrow). Escape and a scrim click
close it. The title bar gets the capture button (`sb-no-drag`, icon `zap`) next to the
search trigger.

- new `src/renderer/lib/shell-overlays.tsx`, new
  `src/renderer/components/CaptureOverlay.tsx`
- `src/renderer/components/AppShell.tsx`, `src/renderer/components/TitleBar.tsx`
- `src/renderer/styles/app/overlays.css`
- `src/renderer/i18n/en.ts`, `de.ts` (`titlebar.capture`, `titlebar.captureAria`)
- `tests/renderer/shell.test.tsx`

_Acceptance:_ from any screen the title-bar button opens the capture overlay over the
current screen; saving states the path and offers undo; Escape closes it; axe on the
open overlay is clean.

**D4 — Ask overlay.**
`AskOverlay` renders `AskPanel` in the same overlay frame, wide
(`sb-overlay--wide`), with `openAsk(prefill)` carrying question, module, project and
scope. The one teal focal point stays "ask question" in the composer.

- new `src/renderer/components/AskOverlay.tsx`
- `src/renderer/lib/shell-overlays.tsx`, `src/renderer/styles/app/overlays.css`
- `tests/renderer/shell.test.tsx`

_Acceptance:_ the overlay opens over the current screen with thread list, composer,
citations and file-back intact, shows the honest "no model configured" note, and closes
with Escape without leaving a running stream in a broken state.

**D5 — Rail entries and routes out, opener routes in.**
`screens.ts`: `capture` and `ask` leave `SCREENS` and `ScreenId`, digits `2` and `4`
stay unassigned. `App.tsx`: `/capture` and `/ask` become opener routes
(`<OpenOverlayRoute kind="capture|ask" />`) that read `useSearchParams()`, call the
shell opener with `q`, and then `<Navigate to="/dashboard" replace />`;
`CaptureScreen.tsx` and `AskScreen.tsx` are deleted.

- `src/renderer/lib/screens.ts`, `src/renderer/App.tsx`
- delete `src/renderer/screens/capture/CaptureScreen.tsx`,
  `src/renderer/screens/ask/AskScreen.tsx`
- `src/renderer/i18n/en.ts`, `de.ts` (`rail.capture`, `rail.ask` removed)
- `tests/renderer/shell.test.tsx` (rail count), `tests/renderer/screens.test.tsx`,
  `tests/renderer/i18n.test.ts` (rail loop), `tests/renderer/dashboard.test.tsx`
  (the ask tile now opens the overlay instead of landing on `#/ask?q=…`)

_Acceptance:_ no Capture and no Ask entry in the rail, `2` and `4` do nothing;
`#/capture`, `#/ask` and `#/ask?q=Was%20…` all open the right overlay with the question
prefilled, never a blank screen; the inbox and dashboard buttons still lead into
capture. `git diff --stat src/core src/main src/shared` is empty for this D.

**D6 — `Ctrl+K` becomes one control with two modes.**
`CommandPalette` gets `mode: 'palette' | 'ask'`: visible mode chips in the head, `Tab`
toggles, a leading `?` in the query switches to ask mode. Palette mode is unchanged.
Ask mode shows the question field with a hint; `Enter` calls
`openAsk({ question, submit: true })` and closes the palette. Actions:
`action:capture` now opens the capture overlay, new `action:captureWindow` keeps the
quick-capture window, new `action:ask` switches to ask mode.

- `src/renderer/components/CommandPalette.tsx`, `src/renderer/styles/app/overlays.css`
- `src/renderer/i18n/en.ts`, `de.ts` (`palette.mode.*`, `palette.action.ask`,
  `palette.action.captureWindow`, `titlebar.search` → "search or ask")
- `tests/renderer/screens.test.tsx` or `tests/renderer/shell.test.tsx`

_Acceptance:_ `Ctrl+K` → palette as today; `Tab` (or `?`) → ask mode; typing a question
and `Enter` opens the ask overlay with the answer running; the palette finds "capture",
"capture window" and "ask" in both languages.

**D7 — `project` as a filter on `chat:ask`.**
Thin vertical slice, additive only: optional `project?: string | null` in the
`chat:ask` request, passed through the handler into `AskInput` / `RetrieveOptions` and
applied in `retrieve()` exactly like `scope` (post-filter over `doc.project`). No new
channel.

- `src/shared/ipc.ts`, `src/main/ipc/chat.ts`, `src/core/wiki/ask.ts`
- `src/renderer/lib/queries/chat.ts` (pass-through)
- `tests/core/…` for `retrieve()` (with and without `project`), `tests/main/chat-ipc`

_Acceptance:_ a question with `project` only cites documents under that project;
without it nothing changes; verified with the fake provider **and** with no model
configured (the passages themselves are the answer, filtered the same way).

**D8 — The scope comes from where I am.**
New pure helper `askScopeFor(pathname, searchParams)`; `openAsk()` uses it when no
explicit prefill is given. `ChatComposer` shows an active project as one clearable chip
(`project` / `onProject` props; nothing rendered when null).

- new `src/renderer/lib/ask-scope.ts`, `src/renderer/lib/shell-overlays.tsx`
- `src/renderer/components/ChatComposer.tsx`, `src/renderer/screens/ask/AskPanel.tsx`
- `src/renderer/i18n/en.ts`, `de.ts` (`ask.filter.project`, `ask.filter.clear`)
- new `tests/renderer/ask-scope.test.ts`, `tests/renderer/shell.test.tsx`

_Acceptance:_ ask opened inside a module is restricted to that module, inside a project
to that project, elsewhere unrestricted; the active filter is visible in the composer
and can be cleared in one click.

**D9 — Docs, screenshots, a11y run.**
`scripts/lib/screens.mjs`: `capture` / `ask` out of `SCREENS` and `NARROW_SCREENS`, new
`openOverlay(page, kind)` helper that uses the visible title-bar button (the user's
path) and waits for the overlay. `shot.mjs`: the ask flows (`checkLlmMissing`,
`shootAskAnswer`, `shootAskAnswered`, the citation shot) run against the overlay,
screenshots named `capture-overlay` / `ask-overlay`.

- `scripts/lib/screens.mjs`, `scripts/shot.mjs`, `scripts/a11y.mjs`
- `docs/ARCHITECTURE.md` (screen/hotkey table, the "Plus:" line, the `Ctrl+K` sentence)

_Acceptance:_ `npm run seed && npm run shot` runs through without a skipped ask step and
without a `checkScreenList()` warning; both overlays appear in the a11y run.

**Coverage** — every acceptance criterion, in order: rail entries gone → D5 · visible
control plus palette → D3 + D6 · hotkeys incl. global `Ctrl+Shift+Space` → D5 (digits)
+ D6 (`Ctrl+K`) + untouched `main/hotkey.ts` · ask as overlay with prefilled scope → D4
+ D8 (+ D7 for the project filter) · ask keeps citations, "no evidence", file-back → D2
+ D4 · capture keeps path and undo → D1 + D3 · `#/capture` / `#/ask` still land → D5 ·
quick-capture window untouched → D5 (nothing under `src/main`; the quick-capture tests
stay green) · freed hotkeys deliberate → D5 · honest "no model configured" → D2/D4
(ask) and D1/D3 (capture, unchanged) · dashboard tiles still reach both → D5.

## Model Hints

D5 → deliverable-hard — it removes two routes and two rail entries at once while every
dashboard tile, the inbox and `?q=` deep links point at them; the opener route has to
preserve the query string and hand it to an overlay, and a wrong `replace` leaves the
user on a blank screen that no unit test necessarily catches.

D1, D2, D3, D4, D6, D7, D8, D9 → default.

Review: → story-review-hard — the change is spread over shell, routes, rail, palette,
hotkeys, screenshot scripts and one cross-layer filter; a single missed entry point is a
capability that is no longer reachable, which a green test run does not show.

## Test Plan (manual acceptance)

`npm run seed`, then start the app.

1. Rail: no "Capture" and no "Ask" entry. Press `2`, press `4` → nothing happens.
2. Title bar: the capture button is visible on every screen. Open it on Projects → the
   overlay lies over the project screen. Type a thought, `Ctrl+Enter` → the path is
   stated, "undo" puts the text back. Escape closes.
3. `Ctrl+Shift+Space` (also with the app in the foreground) → the quick-capture window,
   exactly as before.
4. `Ctrl+K` → palette. Type "capture" → both entries (overlay and window). `Tab` → ask
   mode; type "What do I know about token lifetime?" and `Enter` → the ask overlay
   answers, with citations and file paths.
5. Open a module (Knowledge → module), `Ctrl+K`, ask mode, ask a question → the module
   filter is preselected in the composer. Clear it → the filter is gone.
6. Open a project (Projects → a project) and ask → the project chip is preselected and
   the citations come from that project.
7. Ask a question with no evidence in the vault → the honest "nothing found", no
   invented answer. File an answer back as a wiki page → the path is stated.
8. Reload the app on `#/ask?q=Was%20wei%C3%9F%20ich%20%C3%BCber%20X` → the ask overlay
   opens over the dashboard with the question in the field, not a dead route. Same for
   `#/capture`.
9. Dashboard: the ask tile and the capture buttons (tile, inbox, recent work) all open
   the overlays.
10. Settings → remove the configured model → ask still answers with passages and shows
    the honest note; capture works unchanged.
11. Settings → switch UI language to German → title-bar button, palette modes and the
    filter chips are all German.

## Done

Capture and ask stopped being places. Both bodies were extracted as reusable panels
(`CapturePanel`, `AskPanel`), the shell gained a `ShellOverlays` context that hosts them as
overlays, and the two rail entries plus their routes and screens are gone. `#/capture` and
`#/ask?q=…` survive as opener routes that read the query string, open the overlay and hand the
address on to `/dashboard`. `Ctrl+K` became one control with two modes (palette and ask, `Tab`
or a leading `?`), capture got a title-bar button and both a palette entry for the overlay and
one for the separate quick-capture window. Ask now derives its scope from where you are and
carries a real `project` filter down through `chat:ask` into `retrieve()`.

Commit message:

```
007: capture and ask become overlays, not rail screens
```

### Decisions

- `AskPanel` exposes its screen-level actions through an `onControls` registration slot
  (`newThread`, `ask`, `fill`) rather than a render prop, so the host — screen header or
  overlay header — keeps control over where those buttons sit.
- The overlay frame is hand-rolled (`.sb-overlay`, `.sb-overlay--wide`) mirroring
  `CommandPalette`, because the `Dialog` atom caps at 820 px and the ask body needs 1080 px and
  a defined height for its two columns.
- Closing an overlay never aborts a running answer: the main process finishes the stream and
  writes the answer as a file. An abort would write nothing, which is worse than a background
  completion.
- Beyond the written plan, `ShellOverlaysProvider` closes an open overlay on a pathname change
  (opener routes `/capture` and `/ask` exempted, since they navigate away by design right after
  opening). Without it, "set up routing" in ask's no-model note and capture's "to inbox" left
  the user on a new screen behind the scrim. Two acceptance criteria depend on those links.
- `Escape` closes the topmost surface only: with the palette over an overlay it closes the
  palette and leaves the overlay standing.
- The palette's `Enter` submit is deferred by one microtask. React StrictMode tears down and
  re-creates every effect in the same flush, and TanStack Query's mutation observer detaches on
  unsubscribe without ever re-attaching — firing `mutate()` straight from the mount effect wedged
  the whole panel in every development build.
- `CommandPalette` and `AskPanel` were split (`lib/use-palette-commands.ts`,
  `screens/ask/FileBack.tsx`) to stay near the ~300-line limit. `AskPanel.tsx` is still 326
  lines; the remainder is one responsibility, so it was left whole rather than cut arbitrarily.
- `checkScreenList()` now measures against the union of `SCREENS` and the `DEEP_STATES` ids.
  That also silences a pre-existing false warning about `agents`, which is covered as a deep
  state rather than as a rail screen.
- The dead i18n key `capture.window` was removed; `screen.capture.*` and `screen.ask.*` stay, as
  the sprint decisions require, because the overlays use them.
- Every in-app link keeps navigating to `/capture` and `/ask?q=…` — one mechanism, not two.

### Verification

- `npm run build` green, `npm run lint` green, `npm run typecheck` green.
- `npm test`: 1792 passed, 1 failed. The single failure is `tests/core/wiki/module.test.ts`, a
  pre-existing char-for-char drift check between `MODULE_SCHEMA_TEMPLATE` and
  `docs/MODULE-SCHEMA.md`; it fails on a clean tree too and was not touched.
- `npm run format:check` reports only pre-existing offenders. Verified per file that this story
  adds no content-level formatting debt (the flagged files differ from prettier's output solely
  by CRLF line endings, a `core.autocrlf=true` artefact of this machine).
- Live smoke (`npm run seed && npm run shot`): ran through, 53 shots, no console errors, no
  skipped ask step, no `checkScreenList()` warning. `capture-overlay.png` and `ask-overlay.png`
  were looked at: capture lies over the projects screen with "save" as the single teal accent,
  ask lies over the dashboard with thread list, examples, the honest no-model note and "ask
  question" as the single teal accent. The rail shows eight entries, without capture and ask.
- `npm run a11y`: 0 violations, both overlays in the run (`capture-overlay`, `ask-overlay`),
  plus the palette in ask mode and the visible project filter.
- Code review by a clean agent (Opus tier): FAIL on the first pass. Two real bugs — a second
  question from the palette was silently dropped while the ask overlay was already open, and
  `Escape` in the palette tore down the overlay underneath it — plus three comment/dead-key
  findings. All five fixed with regression tests. A second clean verifier confirmed the fixes and
  surfaced the StrictMode wedge described above, which was then fixed at its root; the regression
  test now runs under StrictMode like every other test in the file.

### Open points

- The screenshot run reports one skipped step (journal, narrow, "say"): three warning toasts
  "the quick-capture key combination is taken" cover the composer, because another application
  holds `Ctrl+Shift+Space` on this machine. Environment-caused, unrelated to this story —
  nothing under `src/main/` other than `ipc/chat.ts` was touched.
- `AskPanel.tsx` sits at 326 lines, over the ~300 soft limit.
