---
id: 099
title: The blocking lane stops waiting on real time
status: done # draft -> ready -> in-progress -> done
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

- [x] **AC1** — The chunked-write case in watch.test.ts proves "three chunks, one report" under fake timers or an injected clock; a search for `setTimeout` and `sleep` in that case returns nothing.
- [x] **AC2** — One real-watcher smoke case remains in watch.test.ts and asserts only that a write is reported at least once, with no timing in its assertion.
- [x] **AC3** — Seeded defect: setting the product's stability window to 0 turns the fake-clock case red; a 1 s artificial stall in the test body does not change its result.
- [x] **AC4** — llamacpp-lifecycle.test.ts:636-660 asserts a `fetchImpl` call count (through `fakeFetchOnPort`) below `ceilingMs / pollIntervalMs`, with no `Date.now` and no `eslint-disable-next-line no-restricted-syntax` in that test.
- [x] **AC5** — Seeded defect: making the poll loop ignore its ceiling turns the call-counter test red.
- [x] **AC6** — Every test name in the touched files still exists after the change and no assertion is removed; the diff shows it.
- [x] **AC7** — A search for `Date.now` in tests/main/ipc/runtime/llamacpp-lifecycle.test.ts returns nothing.

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
- AC3 and AC5 seeded defects, AC6 and AC7 are proven by checks `/build` runs once and records in `## Done

Write stability moved out of chokidar into the pure `createWriteStabilityGate` (`src/core/vault/write-stability.ts`), wired into `watchVault`; the chunked-write case now runs under fake timers with the product's default window, two gate cases added (deleted file, cancel). The llamacpp early-death test counts readiness probes instead of reading the clock; the `Date.now` bound and its eslint-disable are gone.

Commit message: `099: write-stability gate under fake timers, llamacpp probe counter instead of Date.now`

Verification (narrow gate): build, lint, typecheck green; `npx vitest run --changed HEAD` green (67 files, 1032 tests); `tests/core/vault` + llamacpp-lifecycle green after seeded-defect reverts. `format:check` red only on `docs/requirements/100-...md`, which is committed and outside this story (pre-existing).
- AC1/AC2/AC4 -> the named watch.test.ts and llamacpp-lifecycle.test.ts cases, passed. AC3: window 0 turns the chunked case red, a 1 s `Atomics.wait` stall keeps it green. AC5: deleting `if (hasExited()) return 'died';` turns the llamacpp test red. AC7: no `Date.now` in the file, lint green. AC6: no `it(` removed; the chunked case's two `vi.waitFor` assertions became the planned two assertions under fake timers.
- Review 1 (default): PASS. Unfixed, deliberate: no test pins the `watch.ts` wiring (add/change via the gate, unlink direct) - the smoke case only needs "at least once", gap accepted; `statSize` rejection handling in the gate - production maps errors to null; a redundant second-path branch in the cancel test - harmless.

Decisions: the llamacpp comment's "hundreds of times" is conservative against the Decisions' ~1300 probes figure; format:check failure on story 100's file left for that story.

tiers: D 2 / hard 1 · review default · cycles 1 · agents 5
