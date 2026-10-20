---
id: 042
title: A maintenance run stays visible wherever I am
status: done # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. Cut as the carve-out found while smoke-testing 027 in S07 — the progress bar lost on
navigation, isolated to `src/renderer/lib/queries/gardener.ts` and confirmed pre-existing. The
2026-09-02 plan widened it: the progress moves into the shell, and closing the app during a run
has to warn. Keeps the promises [[021a-a-run-i-can-see]] and [[021b-stop-and-continue]] made.

## Requirement

I start a maintenance run and go somewhere else while it works — that is the whole point of a run
I am allowed to leave. Today the progress bar is gone when I come back to maintenance. The run
itself is healthy: the backend keeps answering `gardener:runStatus` correctly and the run finishes
normally. Only the display has forgotten that anything is happening.

So the screen lies twice. It suggests no run is going when one is, and it takes away the stop
button — I cannot stop what I cannot see, which is precisely what 021b built.

Repairing the bar where it stands would only patch the symptom. A run I am invited to walk away
from should be visible from wherever I walked to, so the progress belongs to the shell rather than
to one screen — which also makes the original bug structurally impossible instead of merely fixed.
And when a run is going as I close the app, the app has to say so and offer to stop it properly,
instead of letting the process die in the middle of a write.

## Acceptance Criteria

- [x] While a run is going, a progress strip is visible from every screen, not only from
      maintenance.
- [x] Starting a run and navigating anywhere keeps it visible with current values — the original
      bug is gone because nothing unmounts, not because a remount re-seeds in time.
- [x] Stop and continue (021b) are reachable from the strip itself.
- [x] A run that finishes while I am elsewhere reads as finished, and the strip then goes away.
- [x] With no run going there is no strip. The fix does not trade this bug for a phantom bar.
- [x] The strip introduces no second Teal accent: the current screen's primary action keeps the one
      focus point.
- [x] Closing the app during a run warns and offers stop-and-close; the run ends through 021b's
      stop path rather than being killed mid-write.
- [x] Cancelling that warning leaves both the run and the window alone.
- [x] The warning covers the real window close — the title bar's close, `Alt+F4`, a tray quit —
      not only an in-app button.
- [x] No polling is introduced; the strip stays on the existing seed-plus-event mechanism.
- [x] Regression tests cover unmount/remount during a run, and close-during-a-run.
- [x] The cause of the original navigation bug is named in the Done section, not just the symptom,
      so the next screen that needs live progress does not repeat it.
- [x] All new strings exist in `de` and `en`.

## Open Questions

- ~~Q1 — The cause of the original bug is located but not established.~~
  established → Decisions (Sprint)
- ~~Q2 — Should progress survive an app restart, or only navigation?~~
  answered → Decisions (Sprint)
- ~~Q3 — Does the bar belong to the maintenance screen, or to the shell?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding. Both answers widen this story past the carve-out it was cut as.

- **(User)** Q3 — **the strip lives in the shell**, visible from every screen, not on maintenance
  alone. This is a design change and not only a bug fix: it touches the shell and must respect the
  one-focus-point rule. It is also what makes "a run I am allowed to leave" actually true.
- **(User)** Q2 — **navigation only, but closing the app during a run must warn.** The run is
  in-process, so after a restart there is nothing left to reattach to and promising otherwise
  would mean inventing state. The close is caught instead.
- **(User)** The warning **offers stop-and-close.** Stopping goes through 021b's existing stop path
  so a write in flight ends rather than being cut. A plain "close anyway" was rejected for that
  reason; blocking the close outright was rejected as a dialog without an escape route, which the
  architecture doc forbids.
- Consequence for refine to carry: this story now reaches into `src/main/` (window close and quit)
  and into the shell, where it was cut as a renderer-only hook fix. Its build is larger than the
  roadmap's carve-out framing suggests, and it is the one story in S11 whose scope grew at the
  plan.

### Q1 — the established cause

Not the third candidate, and not `useVaultReady()`. Two defects that only bite together:

1. **The seed is frozen for the whole app session.** `useGardenerProgress`
   (`src/renderer/lib/queries/gardener.ts:185-193`) reads `gardener:runStatus` with
   `staleTime: Infinity` **and** `gcTime: 0`. `GardenerIndicator`
   (`src/renderer/components/GardenerIndicator.tsx:15`) sits in the rail foot
   (`src/renderer/components/Rail.tsx:69`) and therefore holds a **permanent observer** of that
   same query key. So `gcTime: 0` never fires — the entry is never evicted — and `staleTime:
Infinity` means the second observer that `GardenScreen` mounts on remount gets the **cached**
   value and triggers **no refetch**. That cached value is the one fetched once at boot, when no
   run was going: `null`. The 021a D4 seed is effectively dead for every consumer except the
   first one at startup.
2. **The live layer is per-component-instance.** The `useState`/`liveEventSeen` pair
   (`gardener.ts:179-183`) is local to each hook instance. Navigating away unmounts
   `GardenScreen`, and the remount starts at `progress === null` with `liveEventSeen === false`.
   `bridge().on` does not replay (`src/renderer/lib/bridge.ts:11` → `src/preload/index.ts:47`),
   so the fresh instance sees nothing until the **next** `event:gardener-progress`. The ten
   mechanical checks emit within milliseconds; the `audit` stage then emits nothing for as long
   as the model thinks. That gap is the whole visible bug.

`busy` is lost the same way — `useGardenerRun`'s mutation observer dies with the screen
(`GardenScreen.tsx:68`, `:212`), so `RunBar`'s second reason to render is gone too.

Corroboration that this is the real cause and not a plausible story: the **same hook** in the
rail keeps working across navigation, because `GardenerIndicator` never unmounts. The variable
is component lifetime, not the hook.

**Structural consequence.** Hoisting markup alone would not fix it — a shell component holding
`useState` would still lose everything on a vault switch or any future remount, and the frozen
seed would stay frozen. The state has to leave React: a module-level store fed by
`wireEvents` (`src/renderer/lib/events.ts:71-78`, which is wired once in `main.tsx:19` and never
unmounts), exactly like `pullStore.ts` and `llm-stream.ts` already do — `pullStore.ts:1-12`
names this identical problem in its own header. With no query cache entry and no component
state, defect 1 and defect 2 both become unreachable by construction.

### Further decisions taken at refine

- **The store, not a shell hook.** Progress moves to `src/renderer/lib/gardener-progress.ts`
  mirroring `pullStore.ts`, because that is the pattern this repo already uses for
  many-events-per-second state and it is the only shape in which the cause cannot recur.
- **The seed becomes a plain one-shot call, not a query.** `gardener:runStatus` is fetched
  imperatively into the store on the transition to vault-ready, guarded by a generation counter
  so a slow answer can never overwrite a newer live event — a cached query is what froze it.
- **The strip is neutral, not teal.** `sb-grun` currently paints `--accent-soft` plus an
  `--accent` fill (`src/renderer/styles/app/garden.css:235-236`, `:281`). On every screen that
  would be a second focus point, which CLAUDE.md forbids; progress reports state and is
  therefore status, not accent. The strip gets surface/border/fog tokens and a muted fill.
- **One bar, not two.** `RunBar` moves out of the garden screen into the shell rather than
  being duplicated — otherwise the maintenance screen would show the strip twice.
- **The rail indicator goes.** `GardenerIndicator` exists only to say "a run is going, from any
  screen" (021a D5). The strip says that, with values and a stop button. Two chrome elements
  reporting one fact is noise.
- **"Continue" on the strip = the stopped-partway state.** A run going offers stop; a run the
  user stopped **in this session** leaves the strip in a dismissible "stopped partway, continue"
  state. Gating it on the session flag rather than on `report.complete === false` is what keeps
  AC 5 true — otherwise every app start after a stopped run would come up with a phantom bar.
- **The close warning is a Gaston dialog in the renderer, not `dialog.showMessageBox`.** There
  is no native message box anywhere in `src/main/` today, and a native box cannot be styled,
  translated through `t()`, or tested with the renderer suite.
- **The veto lives on `window.on('close')`, plus `app.on('before-quit')`.** The title bar's
  close goes through `window:close` → `window.close()` (`src/main/ipc/window.ts:27`), and
  `Alt+F4` raises the same `close` event — one guard covers both. `before-quit` covers paths
  that quit without closing the window first (a future tray item, the macOS menu). There is no
  tray today; guarding both events is what makes the AC's "a tray quit" true in advance instead
  of per-entry-point.
- **The veto has a timeout.** If the renderer does not answer within ~5 s the close proceeds.
  A guard that can trap the user in an unclosable window is worse than a killed run, and the
  architecture doc forbids a dialog without an escape route.
- **Strings go into the existing `de-garden.ts`/`en-garden.ts`** under `garden.run.*` /
  `garden.quit.*` — they are gardener strings, and a new i18n partial would need index wiring
  for four keys.

## Plan

Order matters: the store first, then the surface, then main.

1. **`src/renderer/lib/gardener-progress.ts`** (new, mirror `src/renderer/lib/pullStore.ts`):
   module-level `GardenerProgress | null` + a `stoppedInSession` flag, `subscribers` set,
   `useGardenerProgress()` via `useSyncExternalStore`, `setGardenerProgress`,
   `markGardenerStopped`, `dismissGardenerStopped`, `seedGardenerProgress()` (one-shot
   `api.gardener.runStatus()` with a generation guard).
2. **`src/renderer/lib/events.ts`**: feed the store from the existing
   `event:gardener-progress` subscription (extend the block at `:71-78`; keep its `phase ===
'done'` invalidations). Nothing new is subscribed and nothing polls.
3. **`src/renderer/lib/queries/gardener.ts`**: delete the `useQuery` seed, the `useState` and
   the `useRef` from `useGardenerProgress`; re-export the store hook so call sites keep their
   import. Rewrite the header comment — the "subscription lives only as long as the screen"
   justification is now the bug.
4. **`RunBar` → `src/renderer/components/RunStrip.tsx`**: same text/a11y contract, plus the
   stopped-partway state and its own stop/continue/dismiss buttons; restyled neutral. Mounted in
   `src/renderer/components/AppShell.tsx` between `TitleBar` and `sb-body`. CSS moves from
   `styles/app/garden.css` to `styles/app/shell.css` as `sb-runstrip`.
5. **`src/renderer/screens/garden/GardenScreen.tsx`**: drop `<RunBar>`, `useGardenerCancel` and
   the `RunBar` import; keep `running` (it still guards `start`/`resume`/`checkOnly`).
   Delete `screens/garden/RunBar.tsx`. Remove `GardenerIndicator` from `Rail.tsx` and delete it.
6. **`src/shared/ipc.ts`**: add `event:close-requested` (payload `void`) to `IpcEvents` +
   `IPC_EVENTS`, and `window:confirmClose` (req `void`, res `void`) to `IpcRoutes` +
   `IPC_CHANNELS`. Preload derives its allowlist from those arrays — nothing to edit there.
7. **`src/main/close-guard.ts`** (new): `attachCloseGuard(services)` — on the main window's
   `close` and on `app.on('before-quit')`, if `gardenerRunning()` and not already confirmed,
   `preventDefault()` and `sendEvent('event:close-requested')`; a `confirmed` flag plus a ~5 s
   timer let the next close through. Wired from `src/main/index.ts:80-86`; `window:confirmClose`
   in `src/main/ipc/window.ts` sets the flag and closes. `will-quit`'s
   `cancelGardenerRun('shutdown')` stays as the last-resort net.
8. **`src/renderer/components/QuitDuringRunDialog.tsx`** (new, `atoms/Dialog` + `atoms/Button`,
   mirror `screens/journal/InterviewDialog.tsx`): listens for `event:close-requested`, offers
   "stop run and close" (→ `api.gardener.cancel()`, then `api.window.confirmClose()`) and
   "cancel" (→ close the dialog, nothing else). Mounted in `AppShell` next to `ToastHost`.
9. Strings in `src/renderer/i18n/de-garden.ts` / `en-garden.ts`; German quotes `„…“`.

## Deliverables

**D1 — the progress store, outside React** — [x]
Files: new `src/renderer/lib/gardener-progress.ts`; `src/renderer/lib/events.ts`;
`src/renderer/lib/queries/gardener.ts`. Mirror: `src/renderer/lib/pullStore.ts`.
Acceptance: no `useQuery` and no `useState` left in the progress path; a live event received
while no component is mounted is still readable afterwards; the one-shot seed can never
overwrite a newer live event (generation guard); `tests/renderer/queries.test.ts`'s
"useGardenerProgress seeds from gardener:runStatus" block (from line 242) is rewritten against
the store and stays green.

**D2 — seed on vault-ready, still no polling** — [x]
Files: `src/renderer/lib/gardener-progress.ts`, `src/renderer/lib/queries/gardener.ts`
(read `useVaultReady` from `lib/queries/data.ts:55`).
Acceptance: a screen opened mid-run shows values after one `gardener:runStatus` round-trip; the
seed fires once per ready-transition, not per mount; no `refetchInterval`, `setInterval` or
`refetchOnMount` anywhere in the path (grep-checkable).

**D3 — `RunStrip` in the shell, neutral tokens** — [x]
Files: new `src/renderer/components/RunStrip.tsx` (moved from
`src/renderer/screens/garden/RunBar.tsx`, deleted), `src/renderer/components/AppShell.tsx`,
`src/renderer/styles/app/shell.css`, `src/renderer/styles/app/garden.css` (remove `sb-grun`),
`src/renderer/screens/garden/GardenScreen.tsx`.
Acceptance: strip visible on every route while a run is going and absent with none; keeps
`role="progressbar"` with `aria-valuenow` plus the wording next to it; **no `--accent*` token in
its CSS**; the maintenance screen shows exactly one strip; `tests/renderer/garden.test.tsx`
adjusted.

**D4 — stop and continue on the strip** — [x]
Files: `src/renderer/components/RunStrip.tsx`, `src/renderer/lib/gardener-progress.ts`,
`src/renderer/i18n/de-garden.ts`, `src/renderer/i18n/en-garden.ts`.
Acceptance: stop from any screen goes through `gardener:cancel` (021b's `'user'` path, partial
report kept); the strip then shows "stopped partway" with continue (`gardener:run
{ resume: true }`) and a dismiss; after dismiss, continue, or a fresh app start the strip is
gone. Reuses `garden.stopped.*` / `garden.run.continue`.

**D5 — retire the rail indicator** — [x]
Files: `src/renderer/components/Rail.tsx`, delete
`src/renderer/components/GardenerIndicator.tsx`, `tests/renderer/rail.test.tsx`, i18n
(`garden.run.railIndicator` removed from both languages).
Acceptance: no rail entry for a run, no orphan i18n key, rail test green.

**D6 — main-process close and quit guard** — [x]
Files: new `src/main/close-guard.ts`, `src/main/index.ts`, `src/main/ipc/window.ts`,
`src/shared/ipc.ts`. Mirror: `src/main/index.ts:120-143` (`will-quit`) for the
best-effort/`finally` style, `tests/main/will-quit.test.ts` for the test shape.
Acceptance: with a run going, `close` and `before-quit` are vetoed once and
`event:close-requested` goes out; `window:confirmClose` lets the very next close through; with
no run going nothing is vetoed; the renderer staying silent for ~5 s lets the close proceed;
`tests/main/ipc-coverage.test.ts` green with the new channel and event.

**D7 — the warning dialog** — [x]
Files: new `src/renderer/components/QuitDuringRunDialog.tsx`,
`src/renderer/components/AppShell.tsx`, `src/renderer/lib/api.ts`,
`src/renderer/i18n/de-garden.ts`, `src/renderer/i18n/en-garden.ts`. Mirror:
`src/renderer/screens/journal/InterviewDialog.tsx`.
Acceptance: "stop run and close" cancels via `gardener:cancel` and only then calls
`window:confirmClose`; "cancel" leaves run and window untouched and the strip still running;
`Escape` behaves as cancel; both `garden.quit.*` keys exist in `de` and `en`.

**D8 — regression tests and the named cause** — [x]
Files: `tests/renderer/queries.test.ts`, new `tests/renderer/run-strip.test.tsx`, new
`tests/main/close-guard.test.ts`.
Acceptance: a test unmounts and remounts the strip's host mid-run and asserts the values are
still there (this is the story's actual regression); a test asserts the seed never overwrites a
newer live event; a main test covers close-during-a-run for both events and the no-run case;
the `## Done` section names the cause from "Q1 — the established cause" above, not the symptom.

## Model Hints

- `D6 → deliverable-hard` — a veto on `close`/`before-quit` with a confirm flag is the one
  change here that can make the app unclosable: a flag not reset, a second `preventDefault` on
  the confirmed close, or an interaction with `window.on('closed') → app.quit()` and
  `will-quit`'s `cancelGardenerRun` turns a display bug into "cannot quit Gaston".
- `D1 → deliverable-hard` — this is the fix's load-bearing piece and touches a hook three
  screens and two test files read; the seed-versus-live-event ordering is exactly the subtlety
  that produced the original bug, and getting it wrong reintroduces it silently.
- D2, D3, D4, D5, D7, D8 → default.
- `Review: → story-review-hard` — the story spans main, the IPC contract and the shell, and its
  two riskiest properties (the cause is structurally gone; the app is still closable) are both
  the kind that a green test run does not prove on its own.

## Test Plan (manual acceptance)

`npm run seed`, then start the app on `.demo-vault/` with a model configured (the `audit` stage
is where the gap used to be).

1. **The original bug.** Maintenance → "check now". While the strip runs, click through to
   dashboard, journal, a project, back to maintenance. Expected: the strip stays visible the
   whole way, values keep advancing, elapsed keeps ticking, stop stays clickable. It must not
   blink, empty, or vanish at any point — least of all during the audit stage, where the number
   stands still for seconds. (AC 1, AC 2)
2. **Stop from elsewhere.** Start a run, navigate to the dashboard, press stop **in the strip**.
   Expected: the run ends, the strip switches to "stopped partway" with "continue". Press
   continue there. Expected: the run resumes without repeating the finished stages. Dismiss the
   notice. Expected: gone, and it does not come back on navigation. (AC 3)
3. **Finishing while away.** Start a run, go to the journal, wait it out. Expected: the strip
   reports finished and then disappears by itself; maintenance shows the new report and score
   without a manual reload. (AC 4)
4. **No phantom bar.** Restart the app with no run going — including right after test 2's stop.
   Expected: no strip on any screen. (AC 5)
5. **One focus point.** With the strip up, look at maintenance, dashboard and settings. Expected:
   exactly one teal element per screen, and it is that screen's primary action — the strip is
   grey. Compare `.screenshots/` from `npm run shot`. (AC 6)
6. **Close during a run — all three doors.** Start a run, then in turn: (a) the title bar's ×,
   (b) `Alt+F4`, (c) a quit from the OS/menu. Each time the warning appears, the window stays
   open, and the run keeps going behind it. Choose "stop run and close": the app closes and
   maintenance, on the next start, shows a stopped-partway report with "continue" — not a
   truncated or missing one. (AC 7, AC 9)
7. **Cancelling the warning.** Start a run, press ×, choose cancel. Expected: window still there,
   run still going, strip still advancing. Then let the run finish and press × again. Expected:
   no warning at all, the app closes immediately. (AC 8)
8. **UI language.** Switch UI language to German and repeat steps 2 and 6 far enough to read
   every new string. Expected: no key names, no English leftovers, `„…“` quotes. (AC 13)

## Coverage gate

| AC                                            | Deliverable                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| 1 strip visible from every screen             | D3                                                                       |
| 2 navigation keeps it, nothing unmounts       | D1, D2, D3                                                               |
| 3 stop and continue on the strip              | D4                                                                       |
| 4 finishes while away, then goes away         | D1 (store + existing `phase === 'done'` invalidation in `events.ts`), D3 |
| 5 no run, no strip                            | D3, D4                                                                   |
| 6 no second teal accent                       | D3                                                                       |
| 7 close during a run warns, stops via 021b    | D6, D7                                                                   |
| 8 cancelling leaves run and window alone      | D7                                                                       |
| 9 covers ×, `Alt+F4`, a tray quit             | D6                                                                       |
| 10 no polling introduced                      | D2                                                                       |
| 11 regression tests unmount/remount and close | D8                                                                       |
| 12 the cause is named in Done                 | D8                                                                       |
| 13 all strings in `de` and `en`               | D4, D5, D7                                                               |

## Done

### Summary

Maintenance-run progress moved out of React entirely into a module-level store
(`src/renderer/lib/gardener-progress.ts`, mirroring `pullStore.ts`), fed once by
`wireEvents` and seeded imperatively (with a generation guard) on the vault-ready
transition. `RunStrip` (replacing `RunBar`) mounts once in `AppShell`, between the
title bar and the body, so a run started on the garden screen stays visible — with
live values, a stop button, and a "stopped partway / continue" offer — from every
route, and disappears cleanly when nothing is running. On the main side, a new
`close-guard.ts` vetoes `window.close()` and `app.on('before-quit')` exactly once
while a run is going, asks the renderer via `event:close-requested`, and lets the
close through on `window:confirmClose`, drops it cleanly on `window:cancelClose`
(added mid-build — see Decisions), or lets it proceed after a 5s dead-man timeout
if the renderer never answers. `QuitDuringRunDialog` is the renderer side of that
conversation, routing "stop run and close" through 021b's own cancel path before
ever confirming the close.

### The established cause (AC 12)

Two defects that only bit together (full analysis in "Q1 — the established cause"
above, kept here as the short form the AC asks for):

1. **A frozen query cache.** The old `useGardenerProgress` seeded via `useQuery`
   with `staleTime: Infinity` and `gcTime: 0`, and the rail's permanent
   `GardenerIndicator` held one observer of that query alive for the app's entire
   session — so `gcTime: 0` never actually evicted the entry, and a remounted
   screen was handed the `null` fetched once at boot, with no refetch ever firing.
2. **Component-lifetime live state.** The live layer was a `useState` local to
   each hook instance. Unmounting the garden screen threw it away; `bridge().on`
   does not replay past events, so the next mount saw nothing until the next
   `event:gardener-progress` — which, during the model-backed `audit` stage, can
   be many seconds away.

Hoisting markup alone would not have fixed either half — a shell component with
its own `useState` still loses everything on remount, and the frozen query cache
stays frozen regardless of where its JSX lives. The fix moves the state out of
React altogether: no query cache that can go stale, no component lifetime that
can take the state with it.

### Decisions

- **`window:cancelClose` was added mid-build, not in the original D6 plan.**
  D6's first pass only wired `window:confirmClose` (stop-and-close). The story's
  own review (round 1) caught the gap: without an explicit "leave me alone"
  channel, the ~5s dead-man timer would close the window anyway a few seconds
  after the user pressed "cancel" — silently violating AC 8. Added `endCycle()`
  as the one place a veto cycle is ever torn down; `cancelClose()` runs it without
  setting `confirmed`, so the next close is judged fresh.
- **The `cancelled` outcome (OutcomeStrip/useFindingActions) was retired, not
  restored**, after the review found the maintenance screen no longer announced
  a stop. `RunStrip`'s stop button is deliberately screen-agnostic (mountable
  once in the shell) and cannot reach into one screen's local outcome state — the
  strip's own error-surfaced "stopped partway" message is the one confirmation
  now, replacing the old per-screen toast. The dead type/i18n key were removed
  end to end (zero remaining references, confirmed by grep and by
  `tests/renderer/i18n.test.ts`'s exact key↔source check).
- **`RunStrip` suppresses only its static "stopped partway" view on `/garden`**,
  because `GardenScreen`'s own persisted `canContinue` banner (from the saved
  report, not the session flag) already says the same thing there with its own
  working continue button — showing both would repeat the exact "two chrome
  elements, one fact" mistake the rail indicator's retirement (D5) was written
  to avoid. Live progress still renders on `/garden` (D3's "exactly one strip"
  requirement), only the idle stopped-offer is hidden there.
- **`stoppedInSession` clears itself whenever a live run starts**, not only via
  the strip's own continue/dismiss buttons. The review's first pass found the
  flag surviving a run that finished normally some other way (a plain "check
  now" click, a resume from the persisted banner) and showing a phantom
  "stopped partway" afterwards — a direct AC 5 violation. It also clears on a
  vault becoming not-ready, so a stop in one vault cannot offer "continue" into
  a different one.
- **A close-warning window/quit-path fix beyond the plan's letter:** `guard()`
  now restores/shows/focuses the main window before sending
  `event:close-requested`, so a `before-quit` fired while the window is hidden
  or minimized (the macOS-menu / future-tray path AC 9 anticipates) still shows
  a visible prompt instead of silently running out the dead-man timer.

### Verification

- `npm run build`, `npm test` (243 files / 3389 tests), `npm run lint`,
  `npm run typecheck` — all green. (`format:check` is not yet part of this
  sprint's gate per 041; a pre-existing repo-wide CRLF/`endOfLine` mismatch
  affects ~1070 untouched files and is unrelated to this story.)
- Clean-agent review (`story-review-hard`): round 1 **FAIL** with 8 findings
  (one AC-breaking: the phantom "stopped partway" strip; one guardrail-1
  violation: no error surface on stop/continue; a coverage loss from deleted
  `RunBar` tests; dead code from the retired `cancelled` outcome; a duplicate
  "stopped partway" banner; an untested `before-quit` confirm path; an untested
  `QuitDuringRunDialog`; a window-visibility gap on `before-quit`). All 8 fixed
  in one parallel fix cycle across disjoint files, plus a small follow-up for a
  vault-switch edge case the fix itself surfaced. Round 2 **PASS**, all 13 ACs
  individually verified PASS with file:line evidence; no scope creep, no
  weakened tests, no layering violations.
- **Live smoke: partial pass, manual acceptance still open.** Ran the built app
  via a bespoke Playwright `_electron` script against `.demo-vault/` (seeded,
  no LLM configured, per the seed's own design). Confirmed live: the strip
  appears the moment a run starts, uses neutral tokens (`rgb(7, 11, 17)`
  background, grey border — nowhere near the teal accent), and disappears
  cleanly with no phantom bar once a run settles; the close guard correctly
  does **not** veto a close when no run is active. Could **not** confirm live:
  the strip surviving navigation, stop/continue from another screen, and the
  close-during-a-run dialog actually appearing — because the demo vault's
  gardener run (ten mechanical checks, no `audit`/`loose-ends` stage without a
  model) completes in well under a second, faster than a scripted multi-step
  interaction can reliably race against. This is exactly why the story's own
  `## Test Plan (manual acceptance)` opens with "start the app on `.demo-vault/`
  **with a model configured** — the `audit` stage is where the gap used to be":
  these specific properties need real wall-clock duration to observe, which
  only a configured model provides. All of them are covered by targeted,
  deterministic automated tests instead
  (`tests/renderer/run-strip.test.tsx`, `tests/main/close-guard.test.ts`,
  `tests/renderer/quit-during-run-dialog.test.tsx`), and were independently
  re-verified by the round-2 review. Status is left `in-progress`; the manual
  acceptance owner should configure a model and run the 8 steps already
  written in `## Test Plan (manual acceptance)` above before flipping this to
  `done`.

### Commit message

042: strip lives in the shell; close guard warns during a run

### Closed 2026-09-07 — covered by tests, e2e coverage is a named gap

The acceptance process changed on 2026-09-07: acceptance criteria are proven by automated
tests, and no story is held open waiting for a person to walk a test plan (the old
`live-smoke-required` P2 gate is gone). All 13 criteria were verified PASS by the round-2 clean
review, and the three properties the scripted live check could not race against
(strip surviving navigation, stop/continue from another screen, the close-during-a-run dialog)
are covered by `tests/renderer/run-strip.test.tsx`, `tests/main/close-guard.test.ts` and
`tests/renderer/quit-during-run-dialog.test.tsx`.

What is genuinely missing is not a manual walk but an **e2e level**: a functional Playwright
`_electron` suite that can hold a run open long enough to drive these across screens. The
project has no such harness yet (`e2e: none`), which is recorded as a gap under M13's
"Gaps/notes" and is the subject of its own story. Not a manual residue — a fixture is work, not
an impossibility. Status set to `done`.
