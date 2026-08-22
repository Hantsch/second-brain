---
id: 025
title: A screenshot run never reads my real session data
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

`npm run seed` builds a self-contained demo vault so screenshots and smoke runs never touch
what I actually wrote. It does that job for Claude Code sessions — `claudeProjectsDir` is
pinned to a directory inside the demo vault
([scripts/seed/internal.mjs:82](../../scripts/seed/internal.mjs#L82)) — and not for Codex. So a
screenshot run reads my real `~/.codex/sessions`.

That is a privacy leak in the one place the project has decided must not have one: guardrail 6
says my content never lands in the repo, in logs or in a screenshot. Screenshots go into
`.screenshots/`, get looked at during review, and can end up attached to a review document. The
Sessions tab has read both CLIs since story 008, so a run today puts my real project names and
session titles on those PNGs.

The gap is pre-existing (from story 001, surfaced by 008) and has never been the subject of a
story. It is not a feature — it is the seed script keeping the promise it already makes for the
other CLI.

What I want to be able to trust: after `npm run seed`, nothing the app reads points outside the
demo vault. Not "probably nothing" — the run should be able to tell me.

## Acceptance Criteria

- [x] After `npm run seed`, a screenshot or smoke run reads Codex sessions from inside the demo
      vault only. My real `~/.codex/sessions` is never opened.
- [x] The Sessions tab in a screenshot run shows demo sessions for **both** CLIs, so the tab is
      actually screenshotable without my data on it.
- [x] Both CLIs are seeded from the same place in the script — no second, differently-shaped
      mechanism for the second one.
- [x] If a future setting points outside the demo vault, the seed run says so instead of
      silently reading it.
- [x] Nothing about how the app behaves against a real vault changes — this is the seed and
      screenshot path only.

## Open Questions

All three questions of this story are resolved — see `## Decisions (Sprint)`.

## Decisions (Sprint)

1. **The surface is "settings that make the app read data from outside the demo vault", and today
   that is exactly `overview.codexSessionsDir` plus its gate `overview.useCodexSessions`.** Reason:
   they are the only settings the seed leaves at a real-machine default that resolve to personal
   content (`src/core/codex/reader.ts:49-52` falls back to `~/.codex/sessions`), while the other
   outward-facing defaults reach a service instead of reading my data — `providers: []` keeps every
   LLM task off, the Ollama localhost default and its model path only matter once a provider exists,
   and `notifications: true` writes an OS notification rather than reading anything — so those get a
   generic guard instead of a hand-pinned value.
2. **The guard is an assertion inside the seed's own self-check, not a check in `scripts/shot.mjs`
   and not only a unit test.** Reason: the seed is the single place that writes
   `.secondbrain/settings.json` and it already has a failure channel (`problems` →
   `process.exitCode = 1` in `scripts/seed-vault.mjs:127-143`), and every screenshot run passes
   through it via `ensureDemoVault` — one assertion there catches the case at the cheapest point.
3. **The demo Codex sessions are newly written fixture content in the real rollout layout, not a
   reshaped copy of the Claude sessions.** Reason: identical titles in both tabs of the Sessions
   screenshot would read as a bug rather than as demo data, and the cost stays small by reusing the
   demo repos from `projects-work.mjs` and keeping it to three sessions plus one empty file.

## Plan

Scripts only — no file under `src/` is touched (AC 5).

1. **`scripts/seed/codex.mjs` (new)**, mirroring `scripts/seed/claude.mjs`:
   `CODEX_DIR = '.secondbrain/codex-demo/sessions'`, one rollout file per session at
   `YYYY/MM/DD/rollout-<iso>-<uuid>.jsonl`. Record shape from `tests/core/codex/fixtures.ts:118-170`
   and the real examples in `tests/fixtures/codex/sessions/2026/08/12/`: `session_meta`
   (`payload.session_id`, `cwd`, `git.branch`, `context_window`), `turn_context` (`model`, `cwd`),
   `response_item` turns, a closing `token_count`. Plus the sibling
   `.secondbrain/codex-demo/session_index.jsonl` with `{session_id, thread_name}` per session — the
   reader derives that path by stripping the trailing `sessions` segment
   (`src/core/codex/reader.ts:62-66`), so the file sits next to the `sessions` root, not inside it.
   `cwd` values come from the demo repos in `scripts/seed/projects-work.mjs` (same reason as
   `claude.mjs`: otherwise the overview cannot attribute the sessions).
2. **`scripts/seed-vault.mjs`**: call `seedCodexSessions` right after `seedClaudeSessions` (before
   the projects), and add its counter to `formatSummary`.
3. **`scripts/seed/internal.mjs`**: replace `claudeDirOf` with one helper that resolves a
   vault-relative demo history root to an absolute path, and use it for **both** CLIs; pin
   `useClaudeSessions`/`claudeProjectsDir` and `useCodexSessions`/`codexSessionsDir` in the same
   settings block (AC 3).
4. **`scripts/seed/settings-guard.mjs` (new)**: pure function over the written settings object plus
   the vault root. Fails when a required session dir is missing, empty or outside the root, and
   sweeps every other string value for absolute-path shape pointing outside the root (that is the
   "future setting" case). Wired into the existing `problems` list in `scripts/seed-vault.mjs`.
5. **Test + comment sync**: unit test for the guard; update the now-stale comment in
   `scripts/lib/screens.mjs` (the `agents` deep state claims its proof holds regardless of the real
   `~/.codex`) and the demo vault README text in `internal.mjs`.
6. **Smoke**: `npm run seed && npm run build && npm run shot`, then look at the Sessions screenshot.

## Deliverables

**D1 — demo Codex sessions in the seed** (done) — `scripts/seed/codex.mjs` (new),
`scripts/seed-vault.mjs`. Mirror: `scripts/seed/claude.mjs` (structure, German comments, exported
`CODEX_DIR`); fixture shape: `tests/fixtures/codex/sessions/2026/08/12/*.jsonl` and
`tests/core/codex/fixtures.ts:118-170`.
_Acceptance:_ `npm run seed` writes three rollout files under
`.demo-vault/.secondbrain/codex-demo/sessions/YYYY/MM/DD/`, one intentionally empty file (reader
tolerance, as `leer.jsonl` does for Claude) and `.../codex-demo/session_index.jsonl`; the summary
line reports the count; every `cwd` is a demo repo from `projects-work.mjs`.

**D2 — both CLIs pinned from one place** (done) — `scripts/seed/internal.mjs`.
_Acceptance:_ the seeded `.secondbrain/settings.json` holds absolute in-vault paths for
`overview.claudeProjectsDir` **and** `overview.codexSessionsDir` plus both `use*Sessions: true`,
produced by a single shared helper; no second, differently-shaped mechanism for the second CLI.

**D3 — seed guard against outward-pointing settings** (done) — `scripts/seed/settings-guard.mjs` (new),
`scripts/seed-vault.mjs`. Mirror: `scripts/seed/check.mjs` (returns problem strings, no throw).
_Acceptance:_ with the seed as shipped the guard reports nothing; if `codexSessionsDir` is emptied
or set to a path outside the vault root, `npm run seed` prints the problem and exits non-zero.

**D4 — the guard is locked by a test** (done) — `tests/scripts/seed-settings-guard.test.ts` (new),
`scripts/seed/settings-guard.d.mts` (new, so the `.mjs` import typechecks — `scripts/` is outside
`tsconfig.node.json`'s `include`, so the declaration sits next to the module).
_Acceptance:_ four cases green — in-vault settings pass; an empty session dir fails; a
home-directory path fails; an unrelated absolute path outside the root in any other setting fails.
`npm test` and `npm run typecheck` green.

**D5 — comments truthful and the run proven** (done) — `scripts/lib/screens.mjs` (the `agents` deep state
comment), `scripts/seed/internal.mjs` (README text).
_Acceptance:_ `npm run seed && npm run build && npm run shot` runs green, the Sessions screenshot
shows demo sessions in the Codex tab as well, `git diff --name-only` lists no file under `src/`
(AC 5), and `npm run verify` is green.

## Model Hints

D1 → default
D2 → default
D3 → default
D4 → default
D5 → default
Review: → default — a scripts-only change with no `src/` surface; the one real risk is a wrong
fixture shape, and the seed self-check plus the screenshot run catch that better than an
expensive reviewer.

## Test Plan (manual acceptance)

1. `npm run seed` — the summary reports Codex sessions, the run exits 0.
2. `grep codexSessionsDir .demo-vault/.secondbrain/settings.json` — the path points into
   `.demo-vault/.secondbrain/codex-demo/sessions`.
3. `npm run build && npm run shot`, then open `.screenshots/agents.png`: the Sessions view under
   Projects shows the Claude/Codex switch; switching to Codex shows demo sessions (invented repo
   names such as `kundenportal-web`), nothing from the real machine.
4. In the running app against `.demo-vault`: Projects → Sessions → Codex tab lists the demo
   sessions; open one and the transcript comes from the demo file.
5. Negative check: set `codexSessionsDir` to `''` inside `scripts/seed/internal.mjs` (editing the
   vault file is pointless, the seed rewrites it), run `npm run seed`, confirm it fails with the
   guard's message, then revert.

### AC coverage

- AC 1 (no real `~/.codex` read) → D2 (pinned dir), D1 (something to read instead)
- AC 2 (both CLIs on the screenshot) → D1, D5 (screenshot proof)
- AC 3 (one mechanism for both) → D2
- AC 4 (seed says so when a setting points outside) → D3, locked by D4
- AC 5 (real-vault behaviour unchanged) → D5 (no `src/` file in the diff, `npm run verify` green)

## Done

Codex sessions now get the same treatment Claude sessions already had: a new
`scripts/seed/codex.mjs` writes three believable demo rollout files plus one empty
tolerance file under `.secondbrain/codex-demo/sessions/YYYY/MM/DD/`, with
`session_index.jsonl` sitting as a sibling of `sessions/` exactly where
`defaultSessionIndexPath` (`src/core/codex/reader.ts`) expects it. `scripts/seed/internal.mjs`
pins `overview.codexSessionsDir`/`useCodexSessions` the same way it already pinned
`claudeProjectsDir`/`useClaudeSessions`, through one shared `absoluteDirOf` helper — no
second mechanism. A new `scripts/seed/settings-guard.mjs`, wired into the seed's existing
`problems` gate, fails the run if a required session dir is missing, empty, or outside the
vault root, and sweeps every other setting string for the same "points outside the vault"
shape, locked by four unit tests (`tests/scripts/seed-settings-guard.test.ts`) plus a
`.d.mts` so the `.mjs` import typechecks. The stale `agents` screen comment in
`scripts/lib/screens.mjs` was corrected to state that both CLIs now show seeded demo
content, never the real machine's `~/.claude`/`~/.codex`. No file under `src/` was touched.

**Decisions:**
- The settings-guard's generic sweep skips the two dedicated session-dir fields by
  matching on their *value*, not their key path (flagged by review as a latent,
  low-probability finding: a future unrelated setting whose value happened to equal one
  of the two session-dir paths would be silently skipped by the sweep too). Left unfixed:
  the settings schema is small and known, no such collision exists today, and tracking by
  key path through the recursive walk would add real complexity for a risk that doesn't
  currently exist. Worth a key-based rewrite if the settings schema grows enough that a
  coincidental value collision becomes plausible.
- The story's status line and empty `## Done` section flagged by review as "process
  incompleteness, not a code defect" are exactly what this section closes out.

Commit message: `025: demo vault seeds and guards Codex sessions too`

**Verification:** `npm run typecheck`, `npm run lint`, `npm test` (185 files / 2645 tests),
and `npm run build` all green. Manual smoke (`npm run seed && npm run build && npm run shot`)
ran green during D5, plus a separate negative-path smoke (temporarily emptied
`codexSessionsDir`, confirmed non-zero exit with the guard's message, then reverted).
Clean-agent review verdict: **PASS**, no blocking findings; one PLAUSIBLE low-probability
finding (see Decisions above) left deliberately unfixed. Per the sprint's Acceptance note,
this story has no UI surface of its own (it is the seed/screenshot harness itself) and is
exempt from `ui-acceptance-required`/`live-smoke-required` — the D5 smoke run stands in
for that gate.
