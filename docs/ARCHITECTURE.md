# Architecture

Gaston is three layers, one direction: **Renderer → Preload → Main → Core → Files.**
The renderer only knows [src/shared/ipc.ts](../src/shared/ipc.ts). The core only
knows files and interfaces. Only main knows both worlds.

```
┌────────────── Renderer (React) ──────────────┐
│ screens/  components/  atoms/  i18n/  lib/   │  no fs access, no net access
└───────────────────┬──────────────────────────┘
                    │ window.sb.invoke(channel, payload)   ← only IPC_CHANNELS
┌───────────────────▼──────────────────────────┐
│ preload  contextIsolation, sandbox, no node  │
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│ main   window · tray · hotkey · secrets ·    │
│        settings · IPC handlers · notifications│
└───────────────────┬──────────────────────────┘
┌───────────────────▼──────────────────────────┐
│ core   vault index llm capture wiki ingest   │  plain TypeScript, testable
│        journal overview gardener claude      │  never imports 'electron'
└───────────────────┬──────────────────────────┘
                    ▼  Markdown files in the vault
```

## The four interfaces

Defined in `src/core/*/types.ts`, wired in main, known everywhere else only as a type.

| Interface        | Responsibility                             | Implementations                                                   |
| ---------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `VaultStore`     | Read/write files, hash, conflicts, watcher | `FsVaultStore`, `MemoryVaultStore` (tests)                        |
| `LlmGateway`     | `complete()` / `stream()` per task         | `RoutingGateway` → Anthropic · OpenAI-compatible · `FakeProvider` |
| `SourceIngestor` | Source → folder under `raw/`               | `YoutubeIngestor`, `FileIngestor`, `UrlIngestor`, `TextIngestor`  |
| `SessionReader`  | Read work traces of an agent CLI           | `ClaudeSessionReader`                                             |

Each of these is mounted at exactly one place: store, index, and watcher in
[core-bridge.ts](../src/main/core-bridge.ts), the gateway in
[llm-bridge.ts](../src/main/llm-bridge.ts) (`createGateway`, rebuilt fresh per call
from routing, providers, and key storage — otherwise there'd be a second truth
that goes stale).

## Responsibilities in core

| Module      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault/`    | `paths` (vault-relative paths, slugs), `layout` (create/check structure), `frontmatter` (parse/merge/serialize, keeps unknown fields), `store` (atomic write: tmp + rename, sha256, conflict), `watch` (chokidar, 250 ms trailing debounce)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `index/`    | `build` (walk vault → documents), `search` (MiniSearch, snippets), `todos` (parse checkboxes + inline markers), `projects` (frontmatter + derivations: lastTouch, stale, counts), `persist` (`.secondbrain/index/index.json`, hash invalidation, incremental)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `llm/`      | `gateway` (routing, retry, timeout, abort), `providers/*` (HTTP only, no SDK), `registry` (provider CRUD, model list, probe), `tasks` (catalog, suggestions, tier), `prompts/*` (one file per task, document language as a parameter)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `capture/`  | `dump` (text → inbox file), `context` (filing targets, kept small), `heuristic` (filing without a model — the floor, not the fallback path), `classify` (LLM → `FilingProposal`, strictly checked against context), `actions` (paths and Markdown — the single place), `apply`/`undo` (execute and revert, log in trash), `tasks` (todos from text)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `wiki/`     | `ingest` (raw source → source page → entity/concept pages → index.md → log.md), `pages` (read/write, wikilink graph), `ask` (retrieval → answer with citations → optional write-back)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `ingest/`   | Provider chain per source type, writes only to `raw/`, `.ingest.json` as a log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `journal/`  | `day` (create/read/append a daily file — `ensureDay` is the **only** path through which a daily entry is created; `todos:create` goes through it too), `sections` (uses the existing heading, never creates a second one), `dialog` (parse and append turns as a blockquote), `coach` (three stances; the user's own turn is written **before** a model is asked), `facts`/`close` (day close as a proposal — writes nothing), `streak` (streaks, mood history), `labels` via `CloseLabels`                                                                                                                                                                                                                                                                                                                                                                                               |
| `overview/` | `reminders` (deadlines, waiting-on, stagnation — `waiting-overdue` only when it's truly overdue), `recent` (files + sessions + journal + ingest, grouped by project and day), `dashboard` (everything in one pass), `status` (status and next step as a **proposal**; heuristic first, `heuristic: true` tells the UI no model was involved), `labels` (displayable labels — the core doesn't know the UI language)                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `gardener/` | `checks/*` (nine deterministic checks, each synchronous and index-only: orphaned page, broken wikilink, catalog drift, stale page, stranded dump, undigested source, project without a next step, near-duplicate, term without a page), `audit` (optional LLM interpretation: contradictions — only among pages touched by findings, at most 24), `health` (0–100 **plus `healthKnown`**: an empty vault has no score, not a 100), `fixes`/`undo` (preview is verbatim the line that gets written; `merge` and `open-*` provably write nothing and are therefore called "open"), `labels` via `GardenerLabels`, `run-record`/`run-scope`/`run-read`/`run-merge`/`run-present` (the stored run itself — shape, scope predicates, JSON validation, save-time merge and pruning, the report shown for it; pulled out of `main/gardener-state.ts` in 027 because none of it touches Electron) |
| `claude/`   | Reads `~/.claude/projects/*/**.jsonl` (head and tail only, never whole files, opened only with `'r'` — mtime is the sort basis), session → `ClaudeSession`, matched via `repos` in the project frontmatter. The folder name is lossy; `cwd` from the records is the truth                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## The overview, wired

Three channel groups hang off the same bundle and are therefore wired in exactly
one place ([ipc/overview-deps.ts](../src/main/ipc/overview-deps.ts)): `dashboard:*`,
`reminders:*`, and `claude:*`. Four things decided there and nowhere else:

- **`externalTouches` is a live `Map`.** `core-bridge` passes it in on
  `IndexService.open`; after a session run it gets populated and the index catches
  up **without an event** — an `event:vault-changed` would invalidate the dashboard
  that's currently asking. That's how `lastTouch` and `stale` know about sessions.
- **Sessions are buffered for seconds.** Dashboard, reminders, and the sessions
  tile ask almost simultaneously; reading `~/.claude` three times would be waste.
  After `claude:link` the buffer is gone.
- **Quiet periods live in `.secondbrain/overview.json`**, not in settings: a
  growing map of hashed reminder IDs is operational state, not configuration. The
  file may be deleted — then everything reminds again, and that's the honest loss.
- **The health score is never invented.** Without a maintenance run, `gardener: null`
  goes in and `healthKnown: false` comes out.

`projects:suggestStatus` computes in `core/overview/status` — the same routine
that also reads daily entries and work traces. The suggestion is never written;
`projects:patch` does that after confirmation.

## Journal and maintenance, wired

The last two areas. Five decisions you won't find elsewhere in the code:

- **There is exactly one streaming mechanism.** `chat:ask` and `journal:coach`
  both go through [ipc/llm-stream.ts](../src/main/ipc/llm-stream.ts): one token,
  one `event:llm-stream`, one `abort`. The wrapper guarantees that **every** turn
  ends — even the one that throws. Two separate implementations diverged on the
  first edge case, and then the renderer waits forever.
- **The journal's conversation thread is the file**, not `.secondbrain/chats/`. A
  copy of exactly the most sensitive content would be a second truth; the stream
  token is therefore `journal-<date>`, not a conversation object.
- **The user's own turn is in the file before a model is asked.** That's why the
  error path also advances the index: the human's sentence is there even if the
  reply failed — and without a model, no reply turn is invented.
- **Day close writes nothing.** `journal:close` returns a proposal,
  `journal:applyClose` executes what was confirmed, and returns the undo path as a
  list of `vault:write` jobs (each carrying the hash of the state it reverts).
  `capture:apply` doesn't fit here — it would delete the "dump," in this case the
  daily entry, at the end.
- **The maintenance report lives raw in `.secondbrain/gardener.json`.** "Dismissed"
  and completed fixes are only filtered on read, and health is recomputed then —
  which is why both are reversible without re-checking. A new run only clears the
  completed list.
- **`ipc/gardener.ts` holds only the handler map.** The `gardener:run` flow (slot
  claim, resume/scope inheritance, cancel reason, save, report) moved to
  `ipc/gardener-run.ts`; the fix and orphan-link helpers (`findingOf`,
  `assertActionable`, `orphanPick`, the `linkOrphan` apply step) to
  `ipc/gardener-actions.ts` (027) — the same handler-map-plus-siblings split as
  `journal.ts`/`journal-day.ts` and `areas.ts`/`area-note.ts`.

## Screens

One folder per screen under `src/renderer/screens/`. The rail on the left leads in
this order. The agent sessions are no rail entry of their own: they live under
projects — `/projects/sessions` for all of them, `?p=<slug>&tab=sessions` for one
project's — reachable from the dashboard tile and the command palette.

| Screen      | Purpose                                                                         | Hotkey |
| ----------- | ------------------------------------------------------------------------------- | ------ |
| `dashboard` | Movable modules: what happened, what's coming up, what's being waited on        | `1`    |
| `chats`     | History of asked questions: read a conversation, continue it in the ask overlay | —      |
| `inbox`     | Dumps with a filing proposal: accept, edit, discard                             | `3`    |
| `projects`  | List + detail: status, next step, todos, waiting-on, agent sessions             | `5`    |
| `journal`   | Daily entry and coaching dialog                                                 | `6`    |
| `knowledge` | Knowledge modules (pages, graph) and the sources tab (ingest, progress)         | `7`    |
| `tasks`     | The work queue: running, waiting and finished, plus the maintenance run         | —      |
| `garden`    | Maintenance: findings, health, one-click fixes                                  | `9`    |
| `settings`  | Languages, provider/models, task routing, vault, behavior                       | `0`    |

`2`, `4` and `8` are currently unassigned: sources became a tab under `knowledge`,
capture and ask became overlays. The rail gets renumbered wholesale by the later
navigation stories, so there is no interim churn here.

Plus: `onboarding` (no vault open), `quick-capture` (its own frameless window).

Capture and ask are **not** screens but **overlays** over the running screen
(`components/CaptureOverlay.tsx`, `components/AskOverlay.tsx`, hosted by the shell
in `lib/shell-overlays.tsx`). Capture opens from the title-bar button or the
command palette, ask from `Ctrl+K` in ask mode. `#/capture` and `#/ask?q=…` stay as
opener routes: they open the overlay and hand the address straight on to
`/dashboard`. Any change of the path closes an open overlay. The global
`Ctrl+Shift+Space` is unaffected — it opens the separate quick-capture window.

## Window, tray and quit

The tray (`src/main/tray.ts`) exists for as long as the app runs, independent of
any setting — menu: open, quick capture, quit. Two app-level settings govern this
area, both declared in `src/shared/types/settings.ts`: `closeToTray` (default on)
governs what closing the window does, `startMinimized` (default off) governs
whether the app starts hidden in the tray. Both are exposed in Settings →
Customization (`src/renderer/screens/settings/TrayPanel.tsx`), each with a hint
next to it stating its effect — the same "no dormant toggle" principle as
"Errors and empty states" below states for the Behavior tab's switches.

Closing the window hides it to the tray instead of quitting when `closeToTray` is
on and a tray exists — the `hideInsteadOfClose` policy inside
`src/main/close-guard.ts`'s one `close` listener. A real quit (the tray's "Quit",
the app menu, or a window close with `closeToTray` off) still goes through that
same module's existing veto: if a maintenance run is going, the quit is prevented,
the window is shown, and `event:close-requested` reaches the renderer, which shows
`src/renderer/components/QuitDuringRunDialog.tsx` — the M13 prompt fires exactly
there, unchanged by the tray's existence.

`showMainWindow` (`src/main/show-main-window.ts`) is the one door back to the
window: the tray, `activate`, `window:show`, a second app start, and a reminder
notification click all call it instead of each keeping its own copy.

Every `BrowserWindow` takes its renderer preferences and the verification-run
flags from `src/main/window-shared.ts`. Under `SB_UI_HARNESS=1` (set by
`scripts/lib/app-harness.mjs` for e2e, shot and a11y runs) every window sits left
of all displays, is unfocusable, and is shown with `showInactive()`. In that mode
reminders send no notification and no global hotkey is registered. Without the
variable nothing changes.

## Update check

`src/main/update/` answers "is there a newer Gaston": `checker.ts` is the only
module that talks to `electron-updater`, `service.ts` (`createUpdateService`) owns
the `UpdateState` and the 24 h window, and `store.ts` remembers the last check in
`userData`. `Services.updates()` in `src/main/services.ts` builds it; it is
unsupported when unpackaged or in the demo vault (`src/main/demo.ts`). The IPC
area is `src/main/ipc/update.ts`: `update:state`, `update:check` and the
`event:update` push. `SB_E2E_UPDATE_FIXTURE` (`src/main/update/e2e-fixture.ts`)
scripts the check outcome for e2e runs; unset, it changes nothing.

## State in the renderer

- **TanStack Query** for everything that comes over IPC. One hook per channel in
  `src/renderer/lib/queries/`, keys as constants.
- **Invalidation via events**: `event:vault-changed` and `event:index-progress`
  invalidate affected query keys centrally in `src/renderer/lib/events.ts`.
  No polling.
- **No global store.** Anything that isn't server state (open panels, drafts)
  lives locally or in `localStorage`.
- **Streams**: `event:llm-stream` writes into a local buffer per `messageId`; the
  query is only invalidated at the end. There is **one** event and one buffer for
  all streaming tasks (`lib/llm-stream.ts`); anyone building a new one takes the
  same path.

## Errors and empty states

Every screen handles four states explicitly — that's part of the definition of done:

1. **No vault open** → onboarding card with a single button.
2. **Empty** → explains what will appear here, plus the action that fills it.
   Never an empty box, never "no data."
3. **No LLM configured** → says which task would need a model, and links straight
   into the routing setting. Everything that works without a model stays usable.
4. **Error** → `IpcError.code` determines the wording; technical details go behind
   "show details," never as a raw stack trace.

There used to be a fifth state: "this area is still being built." **It's gone**,
and it must not come back. Every channel in `IPC_CHANNELS` is really implemented;
a test (`tests/main/ipc-coverage.test.ts`) tolerates no handler that only throws a
rejection, and the helper that used to build such rejections has been deleted. The
same applies to settings: **a toggle nobody reads gets removed, not left dormant**
— the Behavior tab notes, next to each one, the place that reads it.

## Usability (binding)

- **Keyboard first.** `Ctrl+K` is one control with two modes — command palette and
  ask; `Tab` or a leading `?` switches between them, `Enter` in ask mode opens the
  ask overlay with the question. `Ctrl+Enter` submits, `Esc` closes, digits switch
  screens. Every focus is visible (`:focus-visible`, teal ring).
- **One focal point per screen.** Exactly one primary action in teal.
- **Make latency visible:** anything over 200 ms gets a skeleton, anything over 2 s
  gets a progress indicator with a cancelable action.
- **No dialog without an escape route**, no action without undo (`undoToken`).
- **Numbers and timestamps in mono**, text in sans.
- A11y: every interactive area ≥ 32 px, contrast ≥ 4.5:1, `aria-label` on icon
  buttons, `axe-core` runs in the renderer tests without violations.

## UI verification

`npm run seed` builds `.demo-vault/` with realistic sample content in German
(several projects in both scopes, todos with and without deadlines, waiting-on,
two modules with wiki pages, daily entries, inbox dumps, maintenance findings) —
**plus its own store of invented Claude Code sessions** under
`.secondbrain/claude-demo/projects`, which `overview.claudeProjectsDir` points to.
Without it, the demo run would read the real `~/.claude`, and foreign session
titles would end up in the screenshots.

`npm run verify:ui` (`scripts/verify.mjs`) rewrites that vault, starts the app against it
via Playwright's `_electron`, visits every screen once, writes a PNG into
`.screenshots/` and runs axe-core over the same state (`a11y.json`). `shot` and `a11y`
are that pass with only one of the two halves. It's checked both wide
(1440×900) **and** narrow (1152×720), the latter also for states behind a detail
address (`NARROW_DEEP_STATES`), because an idle rail screen reveals nothing about
a detail column. Anything taller than the window also gets an extra screenshot
scrolled to the end — if there's nothing to scroll, no second image is created,
instead of naming the same viewport "scrolled to the end" twice.

This makes the UI verifiable without anyone starting the app by hand — and
without any real vault content.
