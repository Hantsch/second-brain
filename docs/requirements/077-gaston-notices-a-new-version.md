---
id: 077
title: Gaston notices a new version
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

Once [[076]] publishes releases, someone who installed Gaston once has no way of learning that a
newer one exists. Gaston has to find out for them: once a day, at startup, quietly, and then hold
that knowledge until the user decides what to do with it ([[078]]).

Quietly is the requirement, not a nicety. A check that fails — no network, GitHub down, a rate
limit — must cost the user nothing: no dialog, no toast, no delayed startup, no retry storm.
Gaston is useful offline; if it cannot reach the update feed it starts exactly as before. A check
must not run more than once a day just because the app was restarted six times, and must not run
at all in development, where the version is whatever the working tree says.

The check talks to GitHub's release feed and nothing else, and sends nothing but what that request
needs — no vault content, no settings, no keys (guardrail 6).

Both distributions check: the NSIS install and the portable exe. They differ only in what the user
can do with the answer ([[078]]); knowing that an update exists is the same for both, and the state
says which distribution is running.

This story is the knowledge, not the act. Downloading, installing and restarting belong to
[[078]]; showing the notes in About belongs to [[079]]. Reference: `../q2-launcher` story 097
(`src/main/services/update/checker.ts`, `store.ts`, `src/shared/types/update.ts`), built on
`electron-updater`.

## Acceptance Criteria

- [ ] **AC1** — On startup, Gaston checks for a newer published release at most once per 24 hours;
      further starts within that window reuse the last result instead of checking again.
- [ ] **AC2** — When the published release is newer than the running version, Gaston holds an
      "update available" state carrying that version and its release notes; when it is not, the
      state says up to date.
- [ ] **AC3** — A failed check (offline, error response, malformed feed) leaves a state carrying the
      reason, shows the user nothing by itself, and does not delay or block startup.
- [ ] **AC4** — A failed check does not burn the daily window: the next start may check again.
- [ ] **AC5** — No check runs in development, in an unpackaged build, or in demo mode.
- [ ] **AC6** — The state says whether the running copy is the installed or the portable build.
- [ ] **AC7** — The renderer can read the current update state and be told when it changes,
      through the channels in `src/shared/ipc.ts` — no network access and no version comparison in
      the renderer.
- [ ] **AC8** — The user can trigger a check by hand at any time, independently of the daily
      window, and sees its outcome (including a failure reason).
- [ ] **AC9** — The check result survives a restart, persisted in `userData` (never in the vault).

## Open Questions

## Decisions (Sprint)

- **Code lives in `src/main/update/`, not `src/core/`** — it is bound to `electron-updater` and
  `userData`, not to the vault; the pure parts (store, gating, notes, error mapping) still take no
  Electron import so they unit-test without it.
- **The feed is set in code** (`setFeedURL({ provider: 'github', owner: 'Hantsch', repo:
  'second-brain' })` from one constant) instead of relying on a packaged `app-update.yml` — the
  portable exe does not ship that file, and both distributions must check the same way.
- **`allowPrerelease: false`, `autoDownload: false`, `autoInstallOnAppQuit: false`, only
  `checkForUpdates()`** (never `…AndNotify`) — 076 publishes full releases only, downloading is
  078's act, and the native notification would break "shows the user nothing".
- **The 24 h window runs from `lastSuccessAt`; a failure stamps only `lastCheckedAt`** — that is
  what makes AC4 hold structurally (Q2 097's rule).
- **A stored result is tagged with the version that was running when it was checked**; a start on
  a different version treats it as stale (clears `update` and `lastSuccessAt`) — after an update
  the old "available" must not linger, and no semver library is needed for it.
- **Persisted in `<userData>/update-check.json` via `readJson`/`writeJsonAtomic`
  (`src/main/fs-json.ts`)**, mirroring `machine-scan-cache.ts`; the last error is persisted too,
  because AC9 says the check *result* survives and a failure is a result.
- **Disabled when `!app.isPackaged` (covers development) or in demo mode (`isDemoVault`)** — the
  state then carries `supported: false` plus `disabledReason`, and a manual check returns that
  state without touching the network (AC5 covers manual checks as well).
- **E2E seam `SB_E2E_UPDATE_FIXTURE`** — a comma-separated list of scripted outcomes consumed one
  per check (`offline`, `http`, `up-to-date`, `available`); set, it replaces the checker and
  overrides the unpackaged/demo gate; unset changes nothing. Mirrors `SB_E2E_FETCH_FIXTURE`
  because the e2e app is unpackaged, in demo mode and network-guarded.
- **Errors cross IPC as reason codes only** (`network | http | feed | timeout | unknown`), never a
  raw message — guardrail 6, and the renderer translates them through `t()`.
- **Startup check is deferred 3 s after `start()` and never awaited; one automatic attempt per
  process, no retry, 20 s timeout** — "quietly" means no startup cost and no retry storm.
- **Release notes are normalised to the `### heading` / `- item` subset** (GitHub returns HTML,
  `electron-updater` may return an array), capped at 20 000 characters and stored as an untrusted
  string — rendering and sanitising are 079's job.
- **Distribution = `process.env.PORTABLE_EXECUTABLE_DIR` set → `portable`, else `installed`** —
  electron-builder's portable launcher sets that variable; nothing else distinguishes the two.
- **The manual trigger (AC8) is a minimal "Updates" panel in Settings › About** — status, last
  checked, distribution, "Check now", outcome incl. failure reason; 079 extends that same panel
  with notes and links rather than building a second one.
- **`electron-updater` goes into `dependencies`**, not devDependencies — `externalizeDepsPlugin`
  only packs runtime dependencies.

## Plan

Reference: `../q2-launcher` 097 (`src/main/services/update/{checker,store,service}.ts`,
`src/shared/types/update.ts`, `src/main/ipc/update.ts`). Adapt; add portable detection, the
explicit feed, the demo gate and the e2e seam Q2 does not have.

1. **Contract + store (D1)** — `UpdateState` in `src/shared/types/update.ts`; the
   `update-check.json` store in `src/main/update/store.ts`.
2. **Checker (D2)** — the only importer of `electron-updater`: configure, check, normalise notes,
   classify errors, detect distribution.
3. **Service (D3)** — gating (supported/demo), 24 h window, failure semantics, in-flight dedupe,
   timeout, restore + stale-version rule, persist after every attempt, `onStateChange`,
   non-blocking `scheduleStartupCheck()`.
4. **Wiring (D4)** — IPC `update:state`, `update:check`, event `event:update`; service built in
   `services.ts`, startup check scheduled from `index.ts`, stopped on quit; e2e fixture seam;
   `docs/ARCHITECTURE.md`.
5. **Renderer (D5)** — api client, `useUpdateState` hook fed by the event, the About "Updates"
   panel, i18n, e2e specs and the e2e fixture option.

Order D1 → D2 → D3 → D4 → D5. 076 builds first and adds the `nsis` target and `publish` block;
this story does not touch the `build` block in `package.json` beyond the dependency.

## Deliverables

- **D1 — Update state contract and its store.** Add `src/shared/types/update.ts` (re-export from
  `src/shared/types/index.ts`):
  `UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'`;
  `UpdateFailure = 'network' | 'http' | 'feed' | 'timeout' | 'unknown'`;
  `UpdateDistribution = 'installed' | 'portable'`;
  `UpdateState { status; supported: boolean; disabledReason: 'unpackaged' | 'demo' | null;
  distribution; currentVersion: string; update: { version: string; notes: string; releasedAt:
  string | null } | null; error: UpdateFailure | null; lastCheckedAt: string | null;
  lastSuccessAt: string | null }` (ISO timestamps). Add `src/main/update/store.ts`:
  `loadUpdateRecord(dir)` / `saveUpdateRecord(dir, record)` over `<dir>/update-check.json` using
  `readJson` / `writeJsonAtomic` from `src/main/fs-json.ts`; record = `{ version: 1, checkedWith:
  string, update, error, lastCheckedAt, lastSuccessAt }`. Missing, broken, wrong-`version` or
  wrong-shape file reads as `null` and never throws. No Electron import. Mirror
  `src/main/machine-scan-cache.ts` (shape and header comment) and its test. Test:
  `tests/main/update/store.test.ts` (temp dir via `mkdtemp`).
- **D2 — Checker around `electron-updater`.** `npm i electron-updater` into `dependencies`. Add
  `src/main/update/checker.ts`, the only file that imports `electron-updater`:
  `createUpdateChecker({ autoUpdater? })` returning `check(): Promise<{ kind: 'up-to-date' } |
  { kind: 'available'; version; notes; releasedAt } | { kind: 'failed'; reason: UpdateFailure }>`
  — never throws. Load the real updater with a memoised-on-success dynamic `import`, taking the
  named `autoUpdater` export, else `default.autoUpdater`, else a classified failure (Q2 hit
  "Cannot set properties of undefined" in packaged builds here). Configure once: `autoDownload =
  false`, `autoInstallOnAppQuit = false`, `allowPrerelease = false`, `setFeedURL({ provider:
  'github', owner: 'Hantsch', repo: 'second-brain' })` from an exported `UPDATE_FEED` constant; no
  custom request headers. Use `checkForUpdates()` and `result.isUpdateAvailable`. Notes: string
  passes, array joins each `.note` with blank lines, null → `''`; HTML → `### ` for `<hN>`, `- `
  for `<li>`, strip other tags, decode entities with `&amp;` last; cap 20 000 chars. Errors:
  numeric `statusCode` → `http`; `ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|
  ENETUNREACH` → `network`; YAML/parse/"latest.yml"/`ERR_UPDATER_*` feed errors → `feed`; else
  `unknown`. Also export `detectDistribution(env)` → `portable` iff `PORTABLE_EXECUTABLE_DIR` is a
  non-empty string. Reference: `../q2-launcher/src/main/services/update/checker.ts`. Test:
  `tests/main/update/checker.test.ts` with a fake `AutoUpdaterLike` (no network), including one
  test that, when `package.json` `build.publish` names a github owner/repo, it equals
  `UPDATE_FEED`.
- **D3 — Update service.** Add `src/main/update/service.ts`: `createUpdateService({ dir, now,
  check, currentVersion, distribution, isSupported: () => { supported; disabledReason },
  timeoutMs = 20_000, onStateChange })` with `getState()`, `check({ manual })`,
  `scheduleStartupCheck(delayMs = 3_000)`, `stop()`. Rules: restore from D1's store; if
  `checkedWith !== currentVersion` drop `update` and `lastSuccessAt`; derive status (`error` if
  the last attempt failed, else `available` / `up-to-date` / `idle`). Unsupported → no check
  ever, state carries the reason, manual check returns it unchanged. Startup check runs only if
  `lastSuccessAt` is null, unparseable, in the future or ≥ 24 h old; manual check ignores the
  window. A success sets `lastSuccessAt` + `lastCheckedAt`, clears `error`; a failure sets only
  `lastCheckedAt` + `error` and keeps the last known `update`. A check during a running one joins
  it. A check exceeding `timeoutMs` resolves as `timeout`. Persist after every attempt; emit
  `onStateChange` on every transition (incl. `checking`). `scheduleStartupCheck` returns
  synchronously (`setTimeout` + `void …catch(() => undefined)`), no periodic timer, no retry;
  `stop()` clears the timer. No version comparison here beyond `checkedWith` equality — the
  checker decides "newer". Reference: `../q2-launcher/src/main/services/update/service.ts`.
  Test: `tests/main/update/service.test.ts` with injected `now`, fake `check`, temp dir.
- **D4 — IPC, wiring and the e2e seam.** In `src/shared/ipc.ts` add invoke channels
  `'update:state'` (void → `UpdateState`) and `'update:check'` (void → `UpdateState`, manual)
  to `IpcRoutes` + `IPC_CHANNELS`, and event `'event:update'` (`UpdateState`) to `IpcEvents` +
  `IPC_EVENTS`. Add `src/main/ipc/update.ts` (`updateHandlers(services)` via `defineHandlers`,
  mirror `src/main/ipc/app.ts`) and register it in `src/main/ipc/register-all.ts`. Build the
  service in `src/main/services.ts` with `dir = userDataDir`, `currentVersion =
  app.getVersion()`, `distribution = detectDistribution(process.env)`, `isSupported` = packaged
  and not demo — export and reuse `isDemoVault` from `src/main/ipc/app.ts` (move it to a tiny
  `src/main/demo.ts` if importing from `ipc/` into `services.ts` would cycle), `onStateChange →
  services.sendEvent('event:update', state)`. In `src/main/index.ts` call
  `scheduleStartupCheck()` at the end of `start()` next to `startGardenerAutorun`, and `stop()` in
  the `will-quit` handler. Add `src/main/update/e2e-fixture.ts`: `updateFixtureFor()` reads
  `SB_E2E_UPDATE_FIXTURE` (comma-separated `offline|http|up-to-date|available`; `available` yields
  version `99.0.0`, notes `### Added\n- Fixture release`), returns a scripted `check` that consumes
  one outcome per call (last repeats) or `undefined` when unset/empty/invalid; when set,
  `services.ts` uses it and forces `supported: true`. Mirror
  `src/main/ipc/fetch-e2e-fixture.ts`. Update `docs/ARCHITECTURE.md` (main services + IPC areas)
  so `tests/main/architecture-doc.test.ts` stays green. Tests: `tests/main/update-ipc.test.ts`
  (mirror `tests/main/settings-ipc.test.ts`), `tests/main/update-fixture-seam.test.ts` (mirror
  `tests/main/fetch-fixture-seam.test.ts`); `tests/main/ipc-coverage.test.ts` stays green.
- **D5 — Renderer: state hook and the About "Updates" panel.** In `src/renderer/lib/api.ts` add
  `update.state()` / `update.check()`; add a query key in `src/renderer/lib/queries/keys.ts` and
  `src/renderer/lib/queries/update.ts` with `useUpdateState()` (query on `update:state`, kept
  current by `bridge().on('event:update', …)` writing into the query cache — mirror the
  `event:settings` subscription in `src/renderer/lib/events.ts`) and `useCheckForUpdates()`
  mutation; add the channels to `src/renderer/lib/mock-bridge.ts` if it enumerates channels. In
  `src/renderer/screens/settings/AboutTab.tsx` add an "Updates" panel (Gaston atoms only, sentence
  case, mono for version and timestamp): status line (up to date / version X available / check
  failed: reason / not checked yet / checks off in this build: unpackaged or demo), last checked
  (formatted via `src/renderer/lib/format.ts`), distribution (installed / portable build), and a
  "Check now" button that is busy while `checking`. Every string through `t()` in
  `src/renderer/i18n/de.ts` + `en.ts` (German quotes `„…“`). No version comparison, no network in
  the renderer. Add a worker-scoped `updateFixture: string | undefined` option to
  `tests/e2e/fixtures/app.ts` passed as `SB_E2E_UPDATE_FIXTURE` (mirror `fetchFixture`). Tests:
  `tests/e2e/update-check.spec.ts` (fixture `offline,offline,available`),
  `tests/e2e/update-check-disabled.spec.ts` (no fixture), and
  `tests/renderer/update-boundary.test.ts` (reads `src/renderer/**` source: no `electron-updater`
  / `semver` import, no `compareVersions`-style helper). Run `npm run verify:ui` for the About
  screenshot.

## Model Hints

- D3 → deliverable-hard: the interplay of restore, stale-version rule, 24 h window from
  `lastSuccessAt`, failure-keeps-window-open, in-flight dedupe and timeout is where a
  plausible-looking service rechecks on every start or burns the window on a failed check.
- D1, D2, D4, D5 → default.

Review: → default

## Acceptance Tests

- AC1 → unit `tests/main/update/service.test.ts` › "a start within 24 hours of the last successful
  check reuses the stored result without checking" and › "a start 24 hours or more after the last
  successful check checks again" (D3)
- AC2 → unit `tests/main/update/service.test.ts` › "a newer release yields an available state
  carrying its version and notes" and › "no newer release yields up to date" (D3);
  unit `tests/main/update/checker.test.ts` › "release notes from GitHub HTML become headings and
  list items" (D2); e2e `tests/e2e/update-check.spec.ts` › "check now finds the release and names
  its version" (D5)
- AC3 → unit `tests/main/update/service.test.ts` › "a failed check records its reason" and ›
  "scheduling the startup check returns before the check settles" (D3); unit
  `tests/main/update/checker.test.ts` › "offline, error responses and a malformed feed map to
  reason codes" (D2); e2e `tests/e2e/update-check.spec.ts` › "a failed startup check shows
  nothing by itself" (D5)
- AC4 → unit `tests/main/update/service.test.ts` › "a failed check leaves the daily window open"
  (D3)
- AC5 → unit `tests/main/update/service.test.ts` › "no check runs, automatic or manual, when the
  build is unpackaged or in demo mode" (D3); e2e `tests/e2e/update-check-disabled.spec.ts` › "an
  unpackaged demo build never checks and says so" (D5, network guard active)
- AC6 → unit `tests/main/update/checker.test.ts` › "PORTABLE_EXECUTABLE_DIR marks the portable
  build" (D2); unit `tests/main/update-ipc.test.ts` › "the state names the distribution" (D4)
- AC7 → unit `tests/main/update-ipc.test.ts` › "update:state returns the service state and every
  change is sent as event:update" (D4); unit `tests/main/ipc-coverage.test.ts` (existing, D4);
  unit `tests/renderer/update-boundary.test.ts` › "the renderer neither imports the updater nor
  compares versions" (D5)
- AC8 → e2e `tests/e2e/update-check.spec.ts` › "check now reports a failure reason" and › "check
  now finds the release and names its version" (D5); unit `tests/main/update/service.test.ts` › "a
  manual check ignores the daily window" (D3)
- AC9 → unit `tests/main/update/store.test.ts` › "a saved record is read back from userData" and ›
  "a damaged or foreign-version file reads as nothing known" (D1); unit
  `tests/main/update/service.test.ts` › "a restart restores the last result" and › "a result
  checked on another version is dropped as stale" (D3)

## Done
