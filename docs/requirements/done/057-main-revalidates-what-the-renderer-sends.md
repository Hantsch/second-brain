---
id: 057
title: Main re-validates what the renderer sends
status: done # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.4](../reviews/2026-09-03-architecture-review.md)),
P0. Evidence: `shell:openPath` returns any absolute path unchanged — the `..` guard covers only
the relative branch (`src/main/ipc/shell.ts:13`); a citation path the validator rejected still
renders as a clickable file button (`src/renderer/components/Markdown.tsx:83`), so model-authored
text can become a one-click `shell.openPath` on an arbitrary absolute path; `capture:apply`
checks only that `dumpPath` is a string and `primary` is an object
(`src/main/ipc/capture-proposal.ts:103`), then writes to the renderer-chosen path, honouring an
unknown section heading literally (`src/core/capture/sections.ts:76`); `will-navigate` allows
any `file://` URL (`src/main/window.ts:125`).

## Requirement

The Electron setup is tight — sandbox, context isolation, CSP, a preload that exposes three
functions. But three seams trust the renderer (and, one step further back, the model) more than
the rest of the app does. The model-side filing validation is exemplary: a proposed target that
doesn't exist is discarded with its reason. Then the confirmed proposal comes back from the
renderer and is written without being re-checked. And a hallucinated absolute path in an answer
is one click away from asking the OS to open it.

The main process is the trust boundary; it should hold everything the renderer sends to the
same standard the model's output is held to.

## Acceptance Criteria

- [x] `shell:openPath` opens vault-relative paths and a defined set of app-owned locations
      only; an arbitrary absolute path is refused with an error code, not passed to the OS.
- [x] A citation path that failed validation is not rendered as a clickable action.
- [x] `capture:apply` re-validates the proposal server-side: the target path must resolve
      against the current index the same way the proposal builder resolves it, and a section
      heading outside the target's allowed set is normalized, not written literally.
- [x] In-window navigation to arbitrary `file://` URLs is blocked; the app's own entry points
      keep working.
- [x] Tests cover each seam: refused absolute path, rejected-citation rendering, a tampered
      proposal object, a `file://` navigation attempt.
- [x] No legitimate flow regresses: opening a vault file in the OS editor, the ingest folder
      reveal, and filing with an edited (legitimate) target all keep working.

## Open Questions

## Decisions (Sprint)

- **"App-owned locations" = the open vault root and everything under it, nothing else.** The
  only absolute path the renderer sends today is the vault root (`VaultTab.tsx:105`,
  `showInFolder(root)`); `userData` holds the encrypted keys and no renderer flow opens it, so
  it stays out of the set. main's own `shell.openPath` calls (Ollama installer,
  llama.cpp target dir) bypass the IPC channel and are untouched.
- **The containment check is resolved-path based, not prefix based.** `C:\vault-evil` must not
  pass as "inside `C:\vault`", and on win32 the comparison is case-insensitive — a string prefix
  gets both wrong.
- **Relative paths go through the existing `isSafeVaultPath`** instead of the hand-rolled `..`
  split, so drive letters, UNC, reserved names and control characters are refused the same way
  the store refuses them (reuse over a second guard).
- **A refused path fails with the existing code `invalid`** — `errors.ts` has no
  "forbidden" code and the current `..` guard already uses `invalid`; a new code would ripple
  through i18n for no user-visible gain.
- **In a model answer, a path without a validated citation renders as plain text.** Only
  `[n]` marks backed by `validateCitations` stay actionable; "clickable but without accent" is
  exactly the one-click hole the review names.
- **The switch is the presence of `onOpenPath`, and `ChatMessage` stops passing it to
  `Markdown`.** The user's own vault text (`ProjectOverviewTab`) keeps clickable file refs —
  it is not model-authored and main now confines `openPath` anyway; `DialogTurn` and
  `TranscriptEntryRow`, which never passed a handler and rendered dead buttons, become text.
- **A renderer target that does not resolve is refused (`invalid`), not re-routed to the
  inbox.** Silently filing a confirmed proposal somewhere the user did not confirm would break
  guardrail 2 ("nothing gets moved silently").
- **"Resolves the same way the proposal builder resolves it" means against `FilingContext`**
  (`buildFilingContext` over the current index) with the rules of `pathFor`
  (`actions.ts:86`): project/area by indexed path, module by `modulePath(slug)`, inbox ===
  `dumpPath`, new-project by the `projects/<work|private>/<slugified>/project.md` shape.
- **A journal target is accepted for today and for the proposal's `createdAt` day** — a
  proposal built at 23:58 and confirmed at 00:02 is legitimate; any other date is not what the
  builder would produce.
- **The section is normalized with `sectionFor(target, section)`**, and `resolveSection`'s
  unknown-kind branch falls back to the caller's kind instead of writing the heading literally —
  no renderer UI lets the user type a heading, so the literal branch only serves tampered or
  model-invented input.
- **`extras` are always rebuilt server-side** (`[]` when no todo comes along) — today an empty
  `todos` lets renderer-supplied `extras` with arbitrary paths reach `run.append`, the same hole
  one field over.
- **`dumpPath` must be a safe vault path inside `inbox/`**, because `applyProposal` rewrites the
  dump's frontmatter and a renderer-chosen "dump" could be any vault file.
- **`primary.content` and `waitingOn` are not re-derived.** Editing the text is a legitimate
  user action and content cannot address a location; `waitingOn` lands on the (now verified)
  primary path and was already sanitized when the proposal was built.
- **The navigation guard allows only the app's own entry pages** (`index.html`,
  `quick-capture.html` in the loaded page's directory, or same origin on the dev server);
  other `file://` URLs are blocked, http/https/mailto go to the browser, every other scheme is
  blocked outright — today any non-file URL is handed to `shell.openExternal`, whatever its
  scheme.
- **The quick-capture window gets the same guard.** It has none today
  (`src/main/quick-capture.ts`), and "in-window navigation is blocked" cannot hold for one
  window of two.
- **Acceptance surface:** AC1, AC3 and AC6 are IPC/core behaviour with no user surface, so they
  are proven by `npm test` (main/core tests on a real temp vault). AC2 is a rendering property,
  proven by a jsdom renderer test through `AskPanel` with the mock bridge. AC4 additionally gets
  one e2e spec, because only the built app loads over `file://` — the exact mode the guard must
  get right without breaking the app's own entry point.

## Plan

Four seams, each closed in main (or at the one renderer spot), each with its own tests.

1. **`shell:openPath` / `shell:showInFolder`** (`src/main/ipc/shell.ts`): `resolvePath` accepts
   (a) a relative path that passes `isSafeVaultPath`, joined to the vault root, or (b) an
   absolute path that, after `path.resolve`, is the vault root or inside it (`path.relative`
   check, case-insensitive on win32). Everything else → `fail('invalid', …)`; `shell.*` is
   never called.
2. **Rejected citations** (`src/renderer/components/Markdown.tsx`): an uncited path renders as
   plain text unless the caller passes `onOpenPath`; `ChatMessage` stops passing it (and the
   now-unused prop chain `AnswerFeed` → `ChatMessage` is trimmed; `AskPanel` keeps `openPath`
   for `CitationPanel`). Update the file's header comment (point 2).
3. **`capture:apply`**:
   - core: new `src/core/capture/verify-action.ts` —
     `verifyFilingAction(action, context, { dumpPath, createdAt, docLanguage })` returns the
     action with a normalized section, or a reason string; rules as in the decisions above.
     `resolveSection` (`sections.ts:76`) falls back to `fallback` for an unknown kind.
   - main: `normalize` (`capture-proposal.ts`) gains the index + `now`, checks `dumpPath`
     (safe + inside `inbox/`), verifies `primary` via `verifyFilingAction` against
     `buildFilingContext(index, { now, text })`, throws `fail('invalid', reason)` on a miss, and
     always rebuilds `extras` (`[]` without todos). `capture.ts:196` passes index and `now`.
4. **Navigation** : move `attachNavigationGuards` out of `window.ts` into a new
   `src/main/navigation.ts` with a pure `navigationVerdict(url, currentUrl)` →
   `'allow' | 'external' | 'block'`; `EXTERNAL_PROTOCOLS` lives there and `shell.ts` imports it.
   `window.ts` only swaps the import (lines 117-130 + call at 81 — do not touch the
   `ready-to-show` block at 63-66, story 058 owns it). `quick-capture.ts` attaches the guard.

Order: D1 → D2 → D3 → D4 → D5 (D5 edits `shell.ts`'s constant import after D1 landed).

## Deliverables

- [x] **D1 — `shell:openPath` refuses what is not the vault.** `src/main/ipc/shell.ts`, new
      `tests/main/ipc/shell.test.ts` (mirror the `vi.mock('electron')` shell mock of
      `tests/main/ipc/ollama-runtime.test.ts`; fake `Services` with `vaultRoot()` like
      `tests/main/tasks-ipc.test.ts`, real temp dir as root). Acceptance: the AC1/AC6 tests below
      green.
- [x] **D2 — a rejected citation is text.** `src/renderer/components/Markdown.tsx`,
      `src/renderer/components/ChatMessage.tsx`, `src/renderer/screens/ask/AnswerFeed.tsx`,
      `src/renderer/screens/ask/AskPanel.tsx` (only the prop hand-off), tests in
      `tests/renderer/ask.test.tsx` (existing jsdom + mock-bridge harness) and new
      `tests/renderer/markdown.test.tsx` (same setup). No new CSS, no new i18n key. Acceptance: AC2
      tests green, `ask.test.tsx`/`projects.test.tsx` stay green.
- [x] **D3 — core verifies a filing action.** New `src/core/capture/verify-action.ts`,
      `src/core/capture/index.ts` (export), `src/core/capture/sections.ts`, new
      `tests/core/capture/verify-action.test.ts` and `tests/core/capture/sections.test.ts` (mirror
      `captureFixture()` from `tests/core/capture/fixtures.ts`). Reuse `findProject`/`findArea`/
      `findModule`, `modulePath`, `journalPath`, `projectPath`, `slugify`, `sectionFor` — no
      second path builder. Acceptance: every target kind accepted when built by
      `filingAction`/`buildProposal`, every tampered variant refused.
- [x] **D4 — `capture:apply` re-validates.** `src/main/ipc/capture-proposal.ts`,
      `src/main/ipc/capture.ts`, `tests/main/capture-ipc.test.ts` (extend; mirror its existing
      `capture:apply` cases on `createTempVault()`), `tests/main/ipc/capture-proposal.test.ts` if
      `normalize`'s signature change touches it. Acceptance: AC3/AC6 capture tests green,
      `tests/main/capture-flow.test.ts` unchanged and green.
- [x] **D5 — navigation stays in the app.** New `src/main/navigation.ts`, `src/main/window.ts`
      (guard only), `src/main/quick-capture.ts`, `src/main/ipc/shell.ts` (constant import), new
      `tests/main/navigation.test.ts` (pure verdict + `attachNavigationGuards` against a fake
      `webContents` EventEmitter), new `tests/e2e/navigation-guard.spec.ts` (mirror
      `tests/e2e/smoke.spec.ts` + `tests/e2e/fixtures/app.ts`; trigger via
      `page.evaluate(() => { location.href = 'file:///…' })`, assert the URL is still the app's
      `index.html` and the shell still renders). Acceptance: AC4 tests green, `npm run test:e2e`
      green.

## Model Hints

- D3 → deliverable-hard — the verifier must accept every target the builder and
  `withAllTargets` can produce (journal across midnight, new-project, module by slug, inbox ===
  dump) or a legitimate filing regresses into `invalid`, which is AC6's failure mode.
- D1, D2, D4, D5 → default.
- Review: → story-review-hard — a P0 trust-boundary story across four seams where a missed
  bypass (a path shape, an unrebuilt field, a scheme) is invisible in a green suite.

## Test Plan (manual acceptance)

### Acceptance tests

- AC1 → unit `tests/main/ipc/shell.test.ts` › "refuses an absolute path outside the vault with
  invalid and never calls the OS" + "refuses a sibling folder that only shares the vault's
  prefix" + "refuses a relative path that climbs out with .."
- AC2 → renderer `tests/renderer/ask.test.tsx` › "an answer path without a validated citation
  is text, not a button" + `tests/renderer/markdown.test.tsx` › "a validated citation stays a
  clickable mark" and "a file ref stays clickable where the caller passes onOpenPath"
- AC3 → unit `tests/core/capture/verify-action.test.ts` › "refuses a project path the index
  does not know" + "normalizes a section outside the target's allowed set to its default";
  unit `tests/core/capture/sections.test.ts` › "an unknown heading falls back to the kind
  default instead of being written literally"; integration `tests/main/capture-ipc.test.ts` ›
  "capture:apply refuses a tampered primary path and writes nothing" + "capture:apply ignores
  renderer-supplied extras when no todo comes along" + "capture:apply refuses a dumpPath outside
  the inbox"
- AC4 → unit `tests/main/navigation.test.ts` › "blocks a file:// URL that is not an app entry
  page" + "allows the app's own index.html and quick-capture.html" + "hands only
  http/https/mailto to the browser" + "blocks a file:// target with a foreign host even if the
  path matches" + "blocks javascript: and data: targets against an opaque current origin"; e2e
  `tests/e2e/navigation-guard.spec.ts` › "a file:// navigation attempt leaves the app on its own
  page"
- AC5 → covered by the named tests above: refused absolute path (AC1), rejected-citation
  rendering (AC2), tampered proposal (AC3), `file://` navigation attempt (AC4).
- AC6 → unit `tests/main/ipc/shell.test.ts` › "opens a vault file in the OS editor" + "reveals
  an ingested raw file in its folder" + "reveals the vault root itself"; integration
  `tests/main/capture-ipc.test.ts` › "files into an edited target the proposal offered" + "every
  target withAllTargets offers passes re-validation"; existing `tests/main/capture-flow.test.ts`
  stays green unchanged.

No manual residue.

## Done

Main now re-validates every renderer-supplied input at the four named seams:
`shell:openPath`/`showInFolder` accept only vault-relative or vault-contained paths
(resolved-path, case-insensitive containment check); `Markdown` renders an uncited path as text
unless the caller explicitly wires `onOpenPath`, and `ChatMessage` no longer wires it for
model-authored answers; `capture:apply` re-verifies the confirmed proposal's primary target
against the current index via a new `verifyFilingAction`, normalizes an unknown section instead
of writing it literally, and always rebuilds `extras` server-side; in-window navigation only
allows the app's own entry pages (by directory *and* host) or same-origin (excluding opaque
origins), hands http/https/mailto to the browser, and blocks everything else — wired into both
the main window and the quick-capture window.

Commit message: `057: main revalidates what the renderer sends`

### Verification

- build: green (`npm run build`)
- test: green — `npm test` 293/294 files, 3994/4003 tests pass; the one failing file
  (`tests/renderer/quick-capture.test.tsx`, 9 tests, `window.localStorage.clear is not a
  function`) is a pre-existing jsdom/environment issue in code this story never touched, and was
  confirmed unaffected by this diff during review
- lint: green (`npm run lint`)
- typecheck: green (`npm run typecheck`)
- format: green on every file this story touches; unrelated pre-existing formatting drift
  remains in `.claude/commands/*.md` and a few `docs/` files this story did not create or edit
- e2e: green — `npm run test:e2e`, including `tests/e2e/navigation-guard.spec.ts` › "a file://
  navigation attempt leaves the app on its own page" (AC4). One spec
  (`quit-during-digestion.spec.ts`) failed once with a Playwright `evaluate: promise was garbage
  collected` / Windows temp-dir `EPERM` cleanup error unrelated to this story's files; re-run in
  isolation and passed both cases, confirming flakiness rather than a regression
- review: clean-agent review (story-review-hard) found one confirmed bypass (finding 1) and one
  lower-severity gap (finding 2) in D5's `navigationVerdict`; both fixed in a single review-fix
  cycle (host comparison added to the file:// same-directory branch; opaque origins excluded
  from the same-origin allow branch) with two new tests, then build/typecheck/lint/format/tests
  re-verified green. Six lower-severity/documentation findings (7 total) were left unfixed — see
  Decisions below.

AC → test mapping as verified:
- AC1 → `tests/main/ipc/shell.test.ts` (3 refusal cases + OS-never-called assertions) — passed
- AC2 → `tests/renderer/ask.test.tsx` + `tests/renderer/markdown.test.tsx` (3 cases) — passed
- AC3 → `tests/core/capture/verify-action.test.ts`, `tests/core/capture/sections.test.ts`,
  `tests/main/capture-ipc.test.ts` (6 cases across core + integration) — passed
- AC4 → `tests/main/navigation.test.ts` (5 unit cases, including the two added in the review-fix
  cycle) + `tests/e2e/navigation-guard.spec.ts` (1 e2e case) — passed
- AC5 → satisfied by the AC1–AC4 tests above (no separate test named)
- AC6 → `tests/main/ipc/shell.test.ts` (3 regression cases), `tests/main/capture-ipc.test.ts` (2
  regression cases), `tests/main/capture-flow.test.ts` (unchanged, still green) — passed

No manual residue.

### Decisions

- Findings 3–8 from the review were left unfixed as documentation-level or narrow-scope gaps,
  not correctness bugs:
  3. no unit test exercises a foreign-host or opaque-current-origin case beyond what the
     review-fix cycle added, and nothing directly tests that `quick-capture.ts` wires the same
     guard function (confirmed by code inspection instead — mocking `BrowserWindow`/`screen`
     construction for that module would be a separate, larger test-infrastructure change);
  4. `shell.test.ts` does not exercise win32 case-insensitivity with a differently-cased vault
     root — the containment logic is shared with the already-tested resolved-path check and the
     case-folding is a one-line `toLowerCase()`, judged low-risk to leave for a future pass;
  5. `navigation.ts` logs the full blocked URL via `log.warn` on a block — acceptable severity
     for a security-relevant audit trail, but noted for a future privacy pass per guardrail 6;
  6. `verifyFilingAction`'s journal-day check trusts renderer-supplied `createdAt` beyond exact
     "today or build day", but `journalPath` still requires the day's file to exist, so this
     cannot address an arbitrary location — no fix needed;
  7. `shell.ts`'s redundant `..` prefix check after `rel.startsWith('..')` is dead code, not a
     bug — left as-is rather than risking an unrelated edit to a security-critical function
     during a review-fix cycle;
  8. the plan's note to trim the now-unused `AnswerFeed`/`AskPanel` `onOpenPath` prop chain
     turned out not to apply: `ChatMessage` still needs `onOpenPath` for `CitationList` (the
     validated-citation panel), so the prop chain is not unused and nothing was trimmed. This is
     a plan assumption that didn't hold once the code was read, not a missed deliverable.
