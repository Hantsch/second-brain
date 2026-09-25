# Sprint S18 review — The vault can grow, and an answer finds its evidence

## Overview

Goal: saving one file costs one file, a bulk external change reliably reaches the index,
loose ends are derived once per index instead of once per screen, a Codex session counts as
work exactly like a Claude session, a scoped question retrieves inside its scope, a long
transcript answers by passage instead of by whole file, a PDF becomes a readable source, and
the heuristic floor speaks the vault's document language.

| Story | Status | Commit |
| --- | --- | --- |
| 054 — Saving one file costs one file | done | 901b2c0 |
| 055 — A bulk change reaches the index | done | 45742df |
| 056 — Loose ends are derived once per index | done | 11130d4 |
| 062 — Codex work counts as work | done | d70bc77 |
| 052 — A scoped question searches its scope | done | 045d2bf |
| 053 — Long sources answer by passage, not by file | done | ffb28ab |
| 060 — A PDF becomes a readable source | done | 941b15f |
| 061 — The heuristic floor speaks the document language | done | 47f33c9 |

All 8 stories done, none blocked. Regression gate green apart from one pre-existing,
unrelated failure (see below).

## Implemented stories

**054 — Saving one file costs one file.** Split persistence into a body-free manifest plus
256 sha256-keyed body buckets and a separate search file with a coverage map; refresh now
stats and reads only the touched paths (falling back to a full walk above 256 paths); startup
on an unchanged vault skips re-derivation and re-persistence; files over 2 MiB are indexed by
name only. Added the per-index-state `derived()`/`generation()` hook 056 leans on.

**055 — A bulk change reaches the index.** The watcher's 250 ms debounce now has a 2000 ms
max-wait ceiling so a sustained change storm can't postpone the flush forever; chokidar's
`awaitWriteFinish` keeps half-written files out; `IndexService.refresh` collapses concurrent
calls into one running plus one queued run; a failed refresh sets an honest
`indexRefreshFailedAt` timestamp (no error text, per the privacy guardrail), visible in the
rail and in Settings › Vault, cleared on the next success.

**056 — Loose ends are derived once per index.** A single `looseEndsDerived(index, today)`,
memoized on `VaultIndex` object identity in a `WeakMap`, now backs `journal:get`,
`dashboard:data`, `reminders:list`, the interview plan, the gardener check and the reminder
notifier — one derivation per index state instead of one per caller.

**062 — Codex work counts as work.** A shared `AgentWorkSession` type carries both CLIs;
Claude and Codex touches merge (newest wins, Claude breaks a tie) into one
`applyExternalTouches` call, so a Codex-only project is no longer flagged stale. The sessions
tile (renamed "Agent sessions") shows both kinds, labeled by agent, and is "off" only when
both CLIs are off.

**052 — A scoped question searches its scope.** The project/scope filter now runs inside
`SearchEngine.filterFor`, before the top-24 candidate cut, instead of on the already-cut
result — so a weak but correct in-scope hit is no longer discarded before it's seen.

**053 — Long sources answer by passage, not by file.** Bodies over ~4k chars split into
line-anchored passages (~3k chars, no overlap); each passage is its own search entry, merged
back to one hit per file before the candidate cut; `ask` retrieves up to 3 passages per
document instead of one whole-file excerpt window. New `raw` doc type for `raw/` sources.

**060 — A PDF becomes a readable source.** Text-layer PDFs extract via `unpdf` (pure JS, no
native dependency) into `source.md`; a scanned PDF ends `no-content` with a distinct note;
damaged/encrypted PDFs keep `pdf-not-read`; PDFs over 5 MB fail visibly before anything is
written. A lockfile test pins the no-native-module guardrail.

**061 — The heuristic floor speaks the document language.** English mood/task/scope/date
lexicons and reason strings sit alongside the German ones; `docLanguage: 'en'` selects
English + German, `'de'` stays byte-identical to before. Loose-end detection reads both
languages at once. The single-module fallback that mis-filed any URL dump is removed.

## Findings & decisions

- **052 AC6 (thread-context follow-up retrieval) was deliberately deferred** — it needs its
  own design call on topic changes and ranking, and overlaps 053's query rewrite. Not built
  as a new story yet; worth cutting in a future sprint.
- **054's manifest is still rewritten in full on every save** (~438 KB at test scale); only
  the 256 body buckets are scoped. Accepted as matching AC2's own wording (body cost), but a
  future story could shard the manifest too if save cost on very large vaults matters.
- **Two real regressions were caught and fixed inside 054's own review**, not by the gate:
  path-scoped refresh wasn't dropping a renamed/deleted module's old docs, and
  `IndexService.dispose()` (the deferred search-state flush) was unreachable on a normal app
  quit — now wired into `will-quit`.
- **055's review caught a cross-vault leak**: a failed refresh's `pendingFailedChange` paths
  weren't reset on vault close/reopen, so a closed vault's held-back paths could leak into the
  next vault's first `event:vault-changed`. Fixed with a regression test.
- **053's structural risk was verified, not just tested**: the hard-tier review confirmed no
  leftover whole-document search entry survives next to the passages, and refresh still stays
  path-scoped rather than falling back to a full rebuild — the exact failure mode the sprint
  plan flagged as one that would pass every functional test.
- **060 caught a real extraction bug during build**, not refine: `bytes.slice()` returned a
  Node `Buffer` subclass that `unpdf` silently rejects, so every real PDF would have landed as
  `pdf-not-read`. Fixed to `new Uint8Array(bytes)`. Also fixed two stale exhaustive error-code
  allowlists that would have downgraded the new `too-large` error to `unknown` in the renderer.
- **`src/core/index/service.ts` (599 lines) and `build.ts` now exceed the ~300-line soft
  limit**, reshaped across 054/055/056/053. Flagged in three separate story reviews as a
  split candidate; not addressed in this sprint — worth a small refactor story.
- **`src/core/journal/loose-ends.ts` stays ~500 lines** even after 061 extracted `forward.ts`
  out of it. Same follow-up class as above.
- **061 found a minor dead-code nit** (`TASK_VERBS_EN` exported but unused) — left as-is, not
  worth a fix cycle.
- **overview-deps.ts grew to ~409 lines** from 062's Codex read-path move — accepted as one
  coherent responsibility by its review, flagged as a future-split candidate.

## Blocked / open

None. All 8 stories done; no story left `in-progress` or `draft`.

## Regression gate

Ran once on HEAD (47f33c9), after all 8 stories:

- `npm run build` — green, ~0.5 min
- `npm test` — red, ~1 min — 9 failures, all in `tests/renderer/quick-capture.test.tsx`
  (`window.localStorage.clear is not a function`, one root cause for all 9)
- `npm run test:e2e` — green, ~2.2 min
- `e2e-all` — `none` in the project profile (`e2e` already runs the whole Playwright suite)

**Attribution:** checked against the merge-base with `dev` (e74528f, the sprint's own
starting commit) in an isolated worktree — identical error, identical lines. **Pre-existing**,
predates the sprint (a jsdom/localStorage mocking gap in the quick-capture test setup); none
of the 8 sprint commits introduced it. Not fixed here, not a merge blocker.

**Do not merge before fixing this test setup gap separately** is not required — the gate is
green for everything the sprint touched; this is an unrelated, already-existing crack in an
unrelated test file's jsdom mock.

## Acceptance

Every acceptance criterion in all 8 stories is proven by a named automated test — see each
story's `## Acceptance Tests` / Done section in `docs/requirements/done/0{52,53,54,55,56,60,
61,62}-*.md` for the full AC → test mapping. No manual residue was declared by any story
(`grep -r "manual residue"` across the 8 files returns only the two explicit "no manual
residue" confirmations in 053 and 060).

No criterion in this sprint was covered a level below the real surface — the stories that
needed e2e coverage (053's Ctrl+K collapse, 060's PDF ingest flow) got it; the rest are core
logic, IPC, or classification with no user-facing surface, correctly proven at unit level per
the project's own acceptance policy.

## Tier record

| Story | D | hard D | Review | Cycles | Agents | Build time |
| --- | --- | --- | --- | --- | --- | --- |
| 054 | 7 | 1 | default | 1 | 13 | 83 min |
| 055 | 5 | 1 | default | 1 | 10 | 28 min |
| 056 | 3 | 1 | default | 0 | 5 | 26 min |
| 062 | 3 | 1 | default | 1 | 5 | 29 min |
| 052 | 2 | 0 | default | 0 | 4 | 19 min |
| 053 | 5 | 1 | default+hard | 0 | 8 | 42 min |
| 060 | 5 | 0 | default | 0 | 7 | 29 min |
| 061 | 6 | 1 | default | 1 | 9 | 23 min |
| **Total** | **36** | **6** | **1 of 8 hard** | **4** | **61** | **279 min** |

The second-stage (hard) review ran once, on 053, and found nothing beyond what the default
review already would have flagged structurally — but it was the review that *specifically
verified* the no-leftover-whole-document-entry / no-full-rebuild-fallback risk the sprint plan
called out, which the default review alone does not check for by design. One hard review in
eight stories, doing exactly the job it was scoped for, is not yet a pattern to retire —
revisit if a future sprint's hard reviews keep coming back clean on stories where the
structural risk was real.
