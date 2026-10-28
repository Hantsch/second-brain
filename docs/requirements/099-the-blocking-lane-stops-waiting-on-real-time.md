---
id: 099
title: The blocking lane stops waiting on real time
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

As the maintainer, I want the blocking test lane to wait on signals and injected clocks instead of
real time, so that a slow runner cannot turn a correct build red and "green here" keeps meaning
"green on GitHub".

Today ([review 2026-10-27](../reviews/2026-10-27-tests-review.md), F03, F13):
tests/core/vault/watch.test.ts:196-212 runs a real watcher with `writeStabilityMs: 400`, appends
three chunks 150 ms apart (:200-203) and asserts `toHaveLength(1)`; a stall over 400 ms between
appends yields two reports and a red test with no defect. There are 19 sleep-to-wait hits in 13
files outside tests/e2e (`grep -rnE "\bsleep\(|new Promise\(\(?r(esolve)?\)? *=> *setTimeout" tests`),
among them teardown sleeps that stand in for a missing settle signal at ingest-ipc.test.ts:91-102
(comment :94-97), knowledge-flow.test.ts:171-173 and module-lifecycle-ipc.test.ts:139-141. One
elapsed-time assertion remains: llamacpp-lifecycle.test.ts:659
(`expect(Date.now() - startedAt).toBeLessThan(ceilingMs / 2)`, `ceilingMs = 20_000` at :640)
behind an eslint-disable with a same-line reason (:658).

## Acceptance Criteria

- [ ] **AC1** — The chunked-write case in watch.test.ts proves "three chunks, one report" under fake timers or an injected clock; a search for `setTimeout` and `sleep` in that case returns nothing.
- [ ] **AC2** — One real-watcher smoke case remains in watch.test.ts and asserts only that a write is reported at least once, with no timing in its assertion.
- [ ] **AC3** — Seeded defect: setting the product's stability window to 0 turns the fake-clock case red; a 1 s artificial stall in the test body does not change its result.
- [ ] **AC4** — llamacpp-lifecycle.test.ts:636-660 asserts a `fetchImpl` call count (through `fakeFetchOnPort`) below `ceilingMs / pollIntervalMs`, with no `Date.now` and no `eslint-disable-next-line no-restricted-syntax` in that test.
- [ ] **AC5** — Seeded defect: making the poll loop ignore its ceiling turns the call-counter test red.
- [ ] **AC6** — Every test name in the touched files still exists after the change and no assertion is removed; the diff shows it.
- [ ] **AC7** — A search for `Date.now` in tests/main/ipc/runtime/llamacpp-lifecycle.test.ts returns nothing.

## Open Questions

- ~~Second cut (judge: P3, touches product code): give the index settle path an awaitable idle/dispose and replace the three teardown sleeps (ingest-ipc, knowledge-flow, module-lifecycle-ipc) with an await. Include it here or split into its own story? The judge said to leave the remaining sleeps.~~ Answered (User): out of scope.
- ~~Does the watch module already accept a clock, or does the product code need a seam for fake timers?~~ Answered: it needs a seam — see Decisions.
- ~~Alternative from the review: move the real-filesystem watcher cases to a release-prep file instead of rewriting. Where should the single real-watcher smoke live?~~ Answered: stays in watch.test.ts — see Decisions.
- ~~Is the llamacpp bound a hang detector worth keeping in some form once the counter exists, or does the 60 s central test timeout cover it?~~ Answered: the central timeout covers it — see Decisions.

## Decisions (Sprint)

- **(User)** Second cut (awaitable idle/dispose on the index settle path): out of scope; remaining sleeps stay.
- Write stability moves out of chokidar (`awaitWriteFinish` off) into an own pure gate `createWriteStabilityGate` with injected `statSize` and real `setTimeout`s, same semantics (poll size every 100 ms, report once unchanged for `WATCH_WRITE_STABILITY_MS`) — chokidar's internal timers and real `fs.stat` cannot run under fake timers, and AC3 requires the product's own window to be what the fake-clock case exercises.
- The gate lives in `src/core/vault/write-stability.ts` (constants move there, re-exported from `watch.ts` under the same names) — keeps `watch.ts` one responsibility per file and avoids a circular import.
- The real-watcher smoke (AC2) is the existing case "meldet mehrere Aenderungen als eine Liste und laesst sich schliessen", kept in watch.test.ts; it is cheap (one `mkdtemp`) and the PR lane needs one proof that chokidar → gate → batcher is wired, not a release-prep-only proof.
- AC2's "no timing in its assertion" is read as "no assertion a slow runner can turn red": its filter assertions and the post-dispose check stay (AC6 forbids removing them); the 200 ms post-dispose sleep stays per the (User) decision, since slowness can only make that check weaker, never red. Its `vi.waitFor` gets `timeout: 10_000` (hang catch instead of the 1 s default) and `writeStabilityMs: 50`.
- AC4's bound is tightened to "at most one readiness probe after the spawn" (counted through a wrapper around `fakeFetchOnPort(null)`, snapshot taken in `fakeSpawn`'s `onSpawn`), which is far below `ceilingMs / pollIntervalMs` = 4000 — a 20 s wait-out on a coarse-timer Windows machine makes only ~1300 probes, so the literal 4000 bound could not make AC5's seeded defect red deterministically.
- AC5's seeded defect is read as "the poll loop waits out its ceiling although the child died" (delete `if (hasExited()) return 'died';` in `pollUntilReachable`) — that is the regression this test exists for; a loop ignoring its deadline while honouring `hasExited` still exits correctly here.
- No separate hang detector for llamacpp: the central 60 s `testTimeout` (vitest.config.ts) catches a hang, and the 20 s ceiling sits under it.
- AC3 and AC5 seeded defects, AC6 and AC7 are proven by checks `/build` runs once and records in `## Done`, not by permanent tests — a mutation or a diff property has no lasting test form that is not padding.

## Plan

1. **Write-stability gate (product seam).** New `src/core/vault/write-stability.ts`:
   `createWriteStabilityGate(onStable, statSize, stabilityMs = WATCH_WRITE_STABILITY_MS,
   pollMs = WATCH_WRITE_POLL_MS)` returning `{ touch(path), cancel() }`. Pure: only
   `setTimeout`/`clearTimeout` and the injected `statSize`, so fake timers drive it fully.
2. **Wire it into `watchVault`** (`src/core/vault/watch.ts`): chokidar loses
   `awaitWriteFinish`; `add`/`change` go `gate.touch` → `onStable` → `batcher.add`; all other
   events go straight to the batcher; `dispose()` cancels gate and batcher. Header comment updated.
3. **Rewrite the chunked-write case** in `tests/core/vault/watch.test.ts` against the gate under
   `vi.useFakeTimers()` with an in-memory file; product default window, no `setTimeout`/sleep.
   Same test name, same two assertions (one report; content at report = all chunks).
4. **Harden the real-watcher smoke** (existing first `watchVault` case): `writeStabilityMs: 50`,
   `timeout: 10_000` on its `vi.waitFor`; assertions unchanged.
5. **llamacpp counter**: replace the `Date.now` bound in
   `tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` with a probe counter; drop the
   eslint-disable line.
6. Build-time checks (recorded in Done): seeded defects for AC3/AC5, grep for AC1/AC7, diff check
   for AC6. Run `npx vitest run tests/core/vault tests/main/ipc/runtime/llamacpp-lifecycle.test.ts`
   plus `npm run lint` and `npm run typecheck`.

Order: D1 (gate + wiring + both watch tests), then D2 (llamacpp). Independent; no systems doc
exists for the watcher (`docs/systems/` has only `navigation.md`). No changelog entry: no
user-facing change.

## Deliverables

- [ ] **D1 — The write-stability window runs on the product's own gate, proven under fake timers.**
      Files: new `src/core/vault/write-stability.ts`, `src/core/vault/watch.ts`,
      `tests/core/vault/watch.test.ts`. Mirror `createBatcher` in `src/core/vault/watch.ts:80-122`
      (pure, timer-based, exported for fake-timer tests; its tests at
      `tests/core/vault/watch.test.ts:12-109` show the style).
  - `write-stability.ts`: move `WATCH_WRITE_STABILITY_MS = 300` here, add
    `WATCH_WRITE_POLL_MS = 100`; export
    `createWriteStabilityGate(onStable: (path: string) => void, statSize: (path: string) => Promise<number | null>, stabilityMs = WATCH_WRITE_STABILITY_MS, pollMs = WATCH_WRITE_POLL_MS): { touch(path: string): void; cancel(): void }`.
    Semantics = chokidar's `awaitWriteFinish`: `touch` on a path not yet pending starts a poll
    every `pollMs`; each poll stats; a size different from the last poll's records the time of
    change; once the size has been unchanged for `>= stabilityMs`, the path leaves the pending set
    and `onStable(path)` fires once. `touch` on an already pending path does nothing (the poll sees
    the growth). `statSize` returning `null` (file gone) drops the path silently — the `unlink`
    event reports it. `cancel()` clears every timer and the pending set; nothing fires afterwards.
    No `Date.now` in the gate: count elapsed time as polls × `pollMs`, so fake timers need not
    fake `Date`.
  - `watch.ts`: re-export `WATCH_WRITE_STABILITY_MS` (same public name; `core-bridge.ts` and tests
    keep compiling). Remove `awaitWriteFinish` from the chokidar options. In the `'all'` handler,
    after the existing ignore checks: `event === 'add' || event === 'change'` → `gate.touch(relative)`,
    every other event → `batcher.add(relative)`. Gate built with
    `onStable = (p) => batcher.add(p)`, `statSize = (p) => stat(join(root, p)).then((s) => s.size, () => null)`
    (`node:fs/promises`, `node:path`), window `options.writeStabilityMs ?? WATCH_WRITE_STABILITY_MS`.
    `dispose()` calls `gate.cancel()` before `batcher.cancel()`. Update the header comment (lines
    15-17): the stability check is the own gate, and why (testable under fake timers).
  - Test "reports a file written in chunks only once it is complete" (keep the name, keep both
    assertions): rewrite to `vi.useFakeTimers()`, an in-memory `content` string, `statSize`
    returning `content.length`, a gate built **without** a window argument (the product default —
    this is what makes AC3's seeded defect bite). Append each of the three chunks, `touch` the
    path, `await vi.advanceTimersByTimeAsync(150)`; then advance by `WATCH_WRITE_STABILITY_MS + 2 * WATCH_WRITE_POLL_MS`.
    Assert `reportsForFile` has length 1 and the content captured in `onStable` equals
    `chunks.join('')`. No `setTimeout`, no sleep, no real filesystem in this case.
    Add one case "a file deleted while still being written is not reported" (`statSize` → `null`
    after the first chunk; no report after advancing past the window) and one case "nothing is
    reported after cancel".
  - Smoke "meldet mehrere Aenderungen als eine Liste und laesst sich schliessen": pass
    `writeStabilityMs: 50` alongside `debounceMs: 80`, and `timeout: 10_000` to its first
    `vi.waitFor`. Assertions and the post-dispose sleep stay untouched.
  - Checks to run and record in Done: (a) set `WATCH_WRITE_STABILITY_MS` to 0 → the chunked case
    is red; revert. (b) insert a real synchronous 1 s stall between the second and third append —
    `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)`, not a `Date.now`
    busy-wait (that loops forever under faked `Date`) → the chunked case stays green; revert. (c) the chunked case's body contains neither
    `setTimeout` nor `sleep`. (d) `npx vitest run tests/core/vault` green.
- [ ] **D2 — The llamacpp early-death test counts probes instead of reading the clock.**
      File: `tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` only (test
      "reports a child that dies during the poll at once, without waiting out the ceiling",
      lines 636-660). Reuse `fakeFetchOnPort` (line 78) and `fakeSpawn`'s `onSpawn` option
      (line 105).
  - Wrap `fakeFetchOnPort(null)` in a local counting function (`let probes = 0`; the wrapper
    increments and delegates). Pass `onSpawn: () => { probesAtSpawn = probes; }` with
    `diesAfterSpawn: true`. Keep `ceilingMs = 20_000`, `pollIntervalMs: 5` and the result
    assertion. Replace lines 647 and 656-659 with
    `expect(probes - probesAtSpawn).toBeLessThanOrEqual(1)` and a one-line comment: one readiness
    probe, then the exit is seen; a wait for the ceiling would probe hundreds of times — far below
    `ceilingMs / pollIntervalMs`. No `Date.now`, no `eslint-disable` in the test.
  - Checks to run and record in Done: (a) delete `if (hasExited()) return 'died';` in
    `pollUntilReachable` (`src/main/ipc/runtime/llamacpp-engine-start.ts:177`) → this test is red;
    revert. (b) `grep -n "Date.now" tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` returns
    nothing. (c) `npx vitest run tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` and
    `npm run lint` green.

## Model Hints

- D1 → deliverable-hard: it replaces chokidar's `awaitWriteFinish` on the path that detects the
  user's external edits — a gate that leaks timers after `dispose`, reports a growing file twice,
  or delays `unlink` events would silently break the "files are the truth" round-trip.
- D2: default.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/core/vault/watch.test.ts` › "reports a file written in chunks only once it is complete" (plus D1 check (c): no `setTimeout`/`sleep` in that case)
- AC2 → unit `tests/core/vault/watch.test.ts` › "meldet mehrere Aenderungen als eine Liste und laesst sich schliessen"
- AC3 → unit `tests/core/vault/watch.test.ts` › "reports a file written in chunks only once it is complete", with D1 checks (a) and (b) run once by `/build` and recorded in Done (seeded defect, not a permanent test)
- AC4 → unit `tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` › "reports a child that dies during the poll at once, without waiting out the ceiling"
- AC5 → unit `tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` › "reports a child that dies during the poll at once, without waiting out the ceiling", with D2 check (a) run once by `/build` and recorded in Done
- AC6 → diff check by `/build`'s review: `git diff HEAD -- tests/core/vault/watch.test.ts tests/main/ipc/runtime/llamacpp-lifecycle.test.ts` removes no `it(` line, and the only removed `expect(` is the `Date.now` bound replaced per AC4
- AC7 → D2 check (b), plus `npm run lint` (the `no-restricted-syntax` disable is gone)

## Done

<Leave empty. Filled by `/build <id>` after implementation:

- Short summary (2–5 lines): what was done.
- Commit message (1–2 lines, keywords are enough).
- Verification: build/test/lint result + review outcome; open points/blockers, if any.>
