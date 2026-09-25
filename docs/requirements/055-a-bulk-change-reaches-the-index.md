---
id: 055
title: A bulk change reaches the index
status: ready # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.2-2](../reviews/2026-09-03-architecture-review.md)),
P1. Evidence: the watcher debounce is trailing-only with no maximum wait — every event resets
the 250 ms timer (`src/core/vault/watch.ts:76`); the pending set grows unbounded
(`src/core/vault/watch.ts:64`); chokidar runs without `awaitWriteFinish`; a refresh failure is
warned to console and `event:vault-changed` fires anyway (`src/main/services.ts:257`).

## Requirement

The vault is allowed to live on OneDrive, on a USB stick, in a git repository — that is the
concept's portability promise. But when something external touches many files in a stream — a
OneDrive sync, a `git checkout`, a bulk copy — the watcher's debounce can be reset indefinitely:
as long as events keep arriving more often than every 250 ms, the index update never fires. The
app sits on a stale index for the whole duration and shows stale todos, stale projects, stale
search results, with no sign that anything is pending. On top of that, a file can be read while
the sync tool is still writing it, and if a refresh fails outright, the renderer is told the
vault changed and refetches against the stale index believing it is current.

A bulk change must reach the index in bounded time, half-written files must not be read as
content, and a failed refresh must not report success.

## Acceptance Criteria

- [ ] Under a sustained event stream, the index still updates within a bounded interval — a
      test simulates events arriving faster than the debounce and asserts a flush happens.
- [ ] Files still being written by an external tool are not indexed half-written.
- [ ] A refresh that fails does not emit `event:vault-changed` as if it succeeded; the failure
      is visible (at minimum in the maintenance/health surface, not only on the console).
- [ ] Back-to-back storms do not queue a pile of sequential full rebuilds; pending work
      collapses.
- [ ] Normal single-file editing behaviour (250 ms trailing debounce) is unchanged.

## Open Questions

## Decisions (Sprint)

- **Max wait of 2,000 ms on top of the 250 ms trailing debounce** (`WATCH_MAX_WAIT_MS`) — eight
  debounce windows keep a storm at no more than one flush every 2 s while a single edit never
  reaches the cap.
- **The max wait also bounds the pending set** — no separate path cap; the set can only hold
  what arrives within one 2 s window, and a `Set` already deduplicates repeated paths.
- **Half-written files are held back with chokidar `awaitWriteFinish`** (stability 300 ms, poll
  100 ms, configurable through `WatchOptions.writeStabilityMs` for tests) — this is the
  standard mechanism, and it needs no second read path in the index.
- **AC5 is read as "the batcher's 250 ms trailing semantics are unchanged"** — the AC names the
  debounce explicitly; the ≤300 ms stability wait in front of it is the price of AC2 and does
  not change how events are bundled.
- **Coalescing lives in `IndexService.refresh` (core), not in `Services`** — the core already
  owns the serialization (`serialize`), and a storm that outlasts one run then yields at most
  one running and one queued run, whoever calls.
- **A refresh arriving mid-run joins the *queued* run, never the running one** — a running
  update may already have walked past the new file, so joining it would lose the change.
- **A failed refresh sends no `event:vault-changed` at all** — the renderer invalidating
  against a stale index is the bug; the next successful refresh sends it, with every path the
  failed runs carried.
- **The failure is a timestamp on `VaultStatus` (`indexRefreshFailedAt: string | null`), not
  an error message** — guardrail 6: error text can carry paths or content, a timestamp
  cannot; the raw error stays on `console.warn` as before.
- **Visible in two places: the rail's `VaultIndicator` and the Settings › Vault index-state
  row** — the vault tab is the app's index maintenance surface (index state, last run, rebuild
  button); the Gardener's health card is content health, a different thing.
- **A successful refresh or a successful manual rebuild clears the flag** — the flag must mean
  "the index is behind right now", not "something once went wrong".
- **Only watcher-driven refreshes set the flag** — the open-time build failure already leaves
  `indexedAt: null` ("no index"), and a failed manual rebuild already shows its error in the
  vault tab.
- **No e2e line** — none of the criteria is a user action (no trigger the user performs);
  forcing a refresh failure through the built app would need a fault-injection seam in
  production code. Core and main unit tests plus a renderer test cover them.

## Plan

Order is strict: D1 → D2 → D3 → D4 → D5. 054 lands first and may reshape
`IndexService.refresh(paths)` into a real incremental refresh; D3's build agent reconciles
against that landed shape (coalescing must then union the paths, `undefined` = full walk wins).

1. **Watcher, bounded wait** (`src/core/vault/watch.ts`): `createBatcher` gets a `maxWaitMs`
   (default `WATCH_MAX_WAIT_MS = 2000`). The first `add` after an empty batch starts a max-wait
   timer; the trailing 250 ms timer is reset per event as today; whichever fires first sends
   and clears both. `flush`/`cancel` clear both timers.
2. **Watcher, complete files** (same file): `watchVault` passes
   `awaitWriteFinish: { stabilityThreshold, pollInterval: 100 }` to chokidar, threshold from
   `WatchOptions.writeStabilityMs` (default 300).
3. **Index, collapse** (`src/core/index/service.ts`): `refresh` keeps at most one queued run.
   A call while a run is queued merges into it and returns its promise; a call while a run is
   running queues exactly one follow-up. `rebuild` keeps its own `serialize` slot.
4. **Main, honest failure** (`src/shared/types/vault.ts`, `src/main/services.ts`,
   `src/main/ipc/index.ts`): `VaultStatus.indexRefreshFailedAt`. `handleVaultChange` on failure
   sets it, broadcasts status, keeps the paths for the next success, sends no
   `event:vault-changed`. Success (refresh or `index:rebuild`) clears it.
5. **Renderer** (`VaultIndicator.tsx`, `settings/VaultTab.tsx`, i18n en/de): a warn dot + label
   in the rail and "update failed" in the index-state row. Then `npm run seed` + `npm run shot`.

## Deliverables

- [ ] **D1 — The watcher batch flushes within a bounded wait.** In `src/core/vault/watch.ts`,
      export `WATCH_MAX_WAIT_MS = 2000` and give `createBatcher(onFlush, debounceMs, maxWaitMs =
      WATCH_MAX_WAIT_MS)` a max-wait timer: it starts on the first `add` into an empty batch and
      is not reset by later adds; the existing trailing timer is reset on each add as today;
      whichever timer fires first sends the batch and clears both. `flush()` and `cancel()` clear
      both timers. `WatchOptions` gets `maxWaitMs?: number`, forwarded by `watchVault`. Update the
      file's header comment (English, explains why the cap exists: a sync/checkout storm would
      otherwise reset the debounce indefinitely). Tests in `tests/core/vault/watch.test.ts` under
      `describe('createBatcher')`, with `vi.useFakeTimers()` like the existing cases:
      `"flushes within the max wait under a sustained event stream"` (add a new path every 100 ms
      for 5 s with debounce 250 / max wait 2000 → at least two flushes, the first at ≤ 2000 ms,
      every path reported exactly once across all flushes) and `"a single event still flushes 250
      ms after it, not at the max wait"` (one add → nothing at 249 ms, one flush at 250 ms, no
      second flush at 2000 ms). The existing three `createBatcher` tests stay unchanged and green.
      Files: `src/core/vault/watch.ts`, `tests/core/vault/watch.test.ts`.
- [ ] **D2 — The watcher does not report a file that is still being written.** In
      `src/core/vault/watch.ts`, `WatchOptions` gets `writeStabilityMs?: number` (default 300,
      exported as `WATCH_WRITE_STABILITY_MS`); `watchVault` passes
      `awaitWriteFinish: { stabilityThreshold: writeStabilityMs, pollInterval: 100 }` to
      chokidar's `watch()` options. Add one sentence to the header comment on why (OneDrive,
      bulk copies write in chunks). `src/main/core-bridge.ts` stays untouched — the defaults are
      right for the app. Test in `tests/core/vault/watch.test.ts` under `describe('watchVault')`,
      mirroring the existing real-temp-dir case: `"reports a file written in chunks only once it
      is complete"` — `debounceMs: 50`, `writeStabilityMs: 400`; append three chunks to a new
      `.md` file 150 ms apart (gaps longer than the debounce, shorter than the stability wait, so
      the test fails without `awaitWriteFinish`); in `onChange`, read the file and assert it
      already holds all three chunks, and assert exactly one report for that path.
      Files: `src/core/vault/watch.ts`, `tests/core/vault/watch.test.ts`.
- [ ] **D3 — Back-to-back refreshes collapse instead of queueing.** In
      `src/core/index/service.ts`, `refresh(paths?)` keeps at most one *queued* refresh on top of
      the running one: a call while a refresh is queued (not yet started) merges into it and
      returns that same promise; a call while a refresh is running and none is queued creates the
      queued one. A call arriving mid-run must never join the running run — that run may already
      have walked past the new file. If the refresh signature consumes `paths` (054 may make it
      incremental), the queued run carries the union of all merged paths, and a merged
      `undefined` (full walk) wins. The early return for irrelevant extensions stays in front of
      the merge. `rebuild()` keeps going through `serialize` unchanged. A failed run rejects the
      promise of every caller merged into it; the next queued run still starts. Tests in
      `tests/core/index/service.test.ts` (mirror its existing store setup; count runs by wrapping
      the store's listing/walk method, and hold the first run with a deferred promise):
      `"refresh calls during a running update collapse into one follow-up run"` (start one
      refresh, fire five more while it is held → exactly two runs in total, all six promises
      resolve) and `"a refresh arriving mid-run is not lost"` (write a new file while the first
      run is held, call refresh → after both settle, the new file is searchable).
      Files: `src/core/index/service.ts`, `tests/core/index/service.test.ts`.
- [ ] **D4 — A failed refresh does not report success and marks the vault status.** Add
      `indexRefreshFailedAt: string | null` (ISO timestamp) to `VaultStatus` in
      `src/shared/types/vault.ts` with a doc comment (a timestamp only, never the error text —
      guardrail 6); fill it in `EMPTY_STATUS` and `status()` in `src/main/services.ts`, keep it in
      `indexState`, reset it on `openVault`/`closeVault`, and add it to
      `src/renderer/lib/mock-fixtures.ts` (`null`). In `Services.handleVaultChange`: on a thrown
      `index.refresh`, keep the `console.warn`, set `indexRefreshFailedAt` to now, remember the
      paths (and whether any were external) in a pending set, broadcast `event:vault-status`, and
      send **no** `event:vault-changed`. On the next successful refresh, clear the flag and send
      one `event:vault-changed` carrying the current paths plus the remembered ones. Give
      `Services` a small `clearIndexRefreshFailure()` and call it in `src/main/ipc/index.ts`'s
      `index:rebuild` handler after `index.rebuild` resolves (before the `finally`). Tests in
      `tests/main/services.test.ts` (attach a fake `IndexLike` via `attachIndex` whose `refresh`
      rejects on demand and a fake watcher via `attachWatcher` that captures the `onChange`
      callback): `"a failed refresh sends no vault-changed and marks the status"` (status carries
      a non-null `indexRefreshFailedAt`, no `event:vault-changed` sent, an `event:vault-status`
      with the flag sent) and `"the next successful refresh clears the failure and reports every
      path"`. Extend the existing close-vault `toEqual` expectation with the new field.
      Files: `src/shared/types/vault.ts`, `src/main/services.ts`, `src/main/ipc/index.ts`,
      `src/renderer/lib/mock-fixtures.ts`, `tests/main/services.test.ts`.
- [ ] **D5 — The failed index update is visible in the rail and in Settings › Vault.** In
      `src/renderer/components/VaultIndicator.tsx`, `indexLabel` precedence becomes indexing →
      failed (`status.indexRefreshFailedAt !== null`) → indexed → none; the failed state uses
      `sb-dot--warn` (currently defined in `src/renderer/styles/app/projects.css`; if that file
      is screen-scoped, move the rule next to `.sb-dot--ok`/`--busy` in
      `src/renderer/styles/app/shell.css`, tokens only). In
      `src/renderer/screens/settings/VaultTab.tsx`, `indexStateKey` gets the same precedence with
      a new key `settings.vault.indexFailed`. New i18n keys: `vault.indexFailed` in
      `src/renderer/i18n/en.ts` / `de.ts` (en "Index update failed", de "Index-Update
      fehlgeschlagen") and `settings.vault.indexFailed` in `en-settings.ts` / `de-settings.ts`
      (en "update failed — rebuild the index", de "Update fehlgeschlagen — Index neu bauen").
      Sentence case, no emoji; German quotes, if any, use „…“. Test in a new
      `tests/renderer/index-refresh-failure.test.tsx` (mirror the render/mock-bridge setup of
      `tests/renderer/settings.test.tsx`, with the vault status fixture overridden to a non-null
      `indexRefreshFailedAt`): `"shows a failed index update in the rail and the vault
      settings"` (both texts present, dot carries the warn class) and `"shows the normal state
      once the failure is cleared"`, plus an axe check like the existing settings tests.
      Afterwards `npm run seed` and `npm run shot`.
      Files: `src/renderer/components/VaultIndicator.tsx`,
      `src/renderer/screens/settings/VaultTab.tsx`, `src/renderer/i18n/en.ts`,
      `src/renderer/i18n/de.ts`, `src/renderer/i18n/en-settings.ts`,
      `src/renderer/i18n/de-settings.ts`, optionally `src/renderer/styles/app/shell.css` +
      `projects.css`, `tests/renderer/index-refresh-failure.test.tsx`.

## Model Hints

- D3 → deliverable-hard — promise coalescing on top of the existing `serialize` tail is the
  classic place for a lost update (joining the running run instead of the queued one) or a
  dangling promise, and it has to reconcile with whatever `refresh(paths)` shape 054 has just
  landed in the same file.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/vault/watch.test.ts` › "flushes within the max wait under a sustained
  event stream" (D1)
- AC2 → unit `tests/core/vault/watch.test.ts` › "reports a file written in chunks only once it
  is complete" (D2)
- AC3 → unit `tests/main/services.test.ts` › "a failed refresh sends no vault-changed and marks
  the status" (D4); unit `tests/main/services.test.ts` › "the next successful refresh clears the
  failure and reports every path" (D4); renderer `tests/renderer/index-refresh-failure.test.tsx`
  › "shows a failed index update in the rail and the vault settings" (D5)
- AC4 → unit `tests/core/index/service.test.ts` › "refresh calls during a running update
  collapse into one follow-up run" (D3); unit `tests/core/index/service.test.ts` › "a refresh
  arriving mid-run is not lost" (D3)
- AC5 → unit `tests/core/vault/watch.test.ts` › "a single event still flushes 250 ms after it,
  not at the max wait" (D1), plus the unchanged existing case "meldet erst nach 250 ms Ruhe und
  dann gebuendelt"

## Done
