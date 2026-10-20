---
id: 079
title: About tells me what changed
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

Settings' About tab ([AboutTab.tsx](../../src/renderer/screens/settings/AboutTab.tsx)) lists a
version number, the Electron version and the platform — true, and useless for deciding whether to
update. Someone asked by [[078]] to restart Gaston wants to know what they get for it, and someone
who just updated wants to know what they got. Both are the same question asked from two sides, and
the answer is the release notes [[076]] publishes with every release.

So About becomes the place where the version stops being a bare number: what this version brought,
what a pending update would bring, when Gaston last checked, and a way through to the full history.
The notes come from the release (`CHANGELOG.md`, bundled with the app for the running version),
not from a second hand-maintained text in the app.

The notes are written in the changelog's language; everything around them goes through `t()` like
every other string.

Reference: `../q2-launcher` story 099 (`AboutPanel.tsx`, `UpdateCheckRow.tsx`,
`src/main/lib/release-notes.ts`).

## Acceptance Criteria

- [ ] **AC1** — About shows what changed in the currently running version, not only its number.
- [ ] **AC2** — When [[077]] has an update available, About shows that version's notes too, marked
      as not yet installed, next to the same update action [[078]] offers in the app shell.
- [ ] **AC3** — About links out to the project and to the full changelog, opened in the system
      browser through `shell:openExternal`, never in an app window.
- [ ] **AC4** — About says when Gaston last checked for updates and lets the user check now,
      showing the outcome including a failure reason ([[077]] AC8).
- [ ] **AC5** — Notes that are unavailable (never fetched, offline, a dev build) render as a
      readable empty state, never as a blank panel or a crash.
- [ ] **AC6** — The notes render as readable text — headings and list items — not as raw markdown
      source, and cannot inject markup into the renderer.

## Open Questions

None. All detail questions were decided during sprint refinement (below).

## Decisions (Sprint)

- **R1 — Bundling:** `CHANGELOG.md` is inlined into the main bundle with Vite's `?raw` import
  (Q2's approach). There is no `extraResources` entry, so dev, packaged and vitest all read the
  same text and nothing has to be resolved at runtime.
- **R2 — Scope of the installed notes:** About shows only the running version's own section. The
  full history is one link away (AC3), which keeps About short.
- **R3 — Where the extraction lives:** section extraction is a pure function in
  `src/core/release/`. It is plain logic with no Electron, so it can be unit-tested against
  fixture text.
- **R4 — Channel:** a separate `app:releaseNotes` channel, not a field on `AppInfo`, so the notes
  are fetched only when About opens and the `app:info` payload stays small (Q2's R).
- **R5 — Rendering:** the notes go through the existing `renderMarkdown`
  (`src/renderer/components/markdown-render.tsx`: marked lexer → React elements, no innerHTML),
  not Q2's custom parser. Reuse beats a second parser, and raw HTML already renders as text there
  (AC6).
- **R6 — Pending-update notes are markdown by the time they reach the renderer:** GitHub's feed
  delivers HTML, so main normalizes it with a core `htmlReleaseNotesToMarkdown` at the point where
  [[077]]'s state is built, unless 077 already does that. The renderer never parses HTML.
- **R7 — Links:** the project is `https://github.com/Hantsch/second-brain` and the changelog is
  `https://github.com/Hantsch/second-brain/blob/main/CHANGELOG.md`. Both are shared constants
  (reused if 077/078 already define the repo URL) and open via `api.shell.openExternal`, whose
  existing protocol allowlist is sufficient.
- **R8 — Proving "system browser" in e2e:** the spec replaces `shell.openExternal` in the main
  process via `evaluateMain` (`scripts/lib/app-harness.mjs`) and records the URLs. No browser
  opens during tests, and no production seam is needed.
- **R9 — `SB_E2E_CHANGELOG` seam:** this env var points at a changelog file read instead of the
  bundled text. The running version of an e2e build usually has no section in the real
  changelog, and AC1/AC6 need deterministic notes plus an injection probe.
- **R10 — One update action:** the pending-update block reuses [[078]]'s update action component
  unchanged. AC2 asks for "the same update action", not a second implementation.
- **R11 — No own check logic:** "last checked" and "check now" read [[077]]'s state and call its
  manual-check channel. About adds no network or version logic (077 AC7).
- **R12 — Language:** the notes are shown as written. Every surrounding string goes through `t()`
  in both `de.ts` and `en.ts`.
- **R13 — Empty state:** a missing section, a dev build, an update without notes and a failed
  fetch all render one sentence. The changelog link stays visible, so the user is never stuck.
- **R14 — e2e update state:** AC2/AC4 e2e use the env seam [[077]]/[[078]] add to put the update
  service into a known state (078 AC1's e2e needs the same seam). If it is missing at build time,
  D4 adds it first.

## Plan

1. **Core (D1).** Add `src/core/release/release-notes.ts` with two pure functions:
   `extractVersionSection(changelog, version)` and `htmlReleaseNotesToMarkdown(html)`. Both have
   length caps, and both truncate rather than throw.
2. **Main + IPC (D2).** Inline `CHANGELOG.md?raw` in `src/main/release-notes.ts` and add the
   `SB_E2E_CHANGELOG` override. Add the `app:releaseNotes` channel (ipc.ts, handler, api.ts, mock
   bridge). Normalize the pending-update notes in main if 077 has not.
3. **Renderer, installed side (D3).** About gets a "What's new in <version>" panel (notes via
   `renderMarkdown`), an empty state, and project + changelog links.
4. **Renderer, update side (D4).** Add a pending-update block (version, "not yet installed"
   badge, notes, 078's action) and an update-check row (last checked, "Check now", outcome
   including the failure reason).
5. Each renderer D carries its renderer test and its e2e test in
   `tests/e2e/about-release-notes.spec.ts`. D4 also runs `npm run verify:ui` and updates
   `docs/systems/update.md` if 077 created it.

Order: D1 → D2 → D3 → D4. D4 needs 077's state/check channels and 078's action component, both
built before 079.

## Deliverables

- **D1 — Release-note extraction (core).** New `src/core/release/release-notes.ts`, plus
  `src/core/release/index.ts` if the other core folders use barrels:
  - `extractVersionSection(changelog: string, version: string): string | null` returns the body
    of the Keep-a-Changelog section for `version`. It accepts both `## [1.2.3] - 2026-10-20` and
    `## 1.2.3` headings and returns the text up to the next `## ` heading, trimmed. It returns
    `null` when there is no such section, when the body is empty, or for `## Unreleased`. The
    input is capped (e.g. 50k chars) and the result is truncated, never thrown.
  - `htmlReleaseNotesToMarkdown(html: string): string` maps GitHub-rendered release HTML to
    markdown: `h1`–`h6` become `### `, `li` becomes `- `, `<br>`/`</p>` become newlines, all
    other tags are stripped, and the common entities are decoded. Plain markdown input passes
    through unchanged.

  No Electron imports; the ESLint core boundary must stay green. Tests:
  `tests/core/release/release-notes.test.ts` › "picks one version's section without bleeding into
  the next", "returns null for an unknown version and for Unreleased", "maps GitHub release HTML
  to headings and list items", "keeps raw script and img markup out of the converted text as
  tags", "caps oversized input without throwing".

- **D2 — Notes channel (main + IPC).**
  - New `src/main/release-notes.ts`: `import changelog from '../../CHANGELOG.md?raw'` (add an
    ambient `declare module '*.md?raw'` in a `.d.ts` that the node tsconfig includes).
    `installedReleaseNotes(version)` returns `{ version, markdown: string | null }` via D1's
    `extractVersionSection`.
  - The text comes from the file named by `SB_E2E_CHANGELOG` when that env var is set. Read it
    with `readFileSync` inside try/catch; a failure means `markdown: null`. Follow the convention
    documented in `src/main/ipc/fetch-e2e-fixture.ts`: unset means no behaviour change.
  - Add the channel `'app:releaseNotes': { req: void; res: ReleaseNotes }` to `src/shared/ipc.ts`
    (map + allowlist array, next to `'app:info'`). `ReleaseNotes = { version: string; markdown:
string | null }` goes in the same place as `AppInfo`.
  - Add the handler in `src/main/ipc/app.ts` (version from `app.getVersion()`),
    `api.app.releaseNotes()` in `src/renderer/lib/api.ts`, and a mock in
    `src/renderer/lib/mock-bridge.ts` (+ `mock-fixtures.ts`).
  - **Pending notes:** check whether [[077]]'s checker already turns `UpdateInfo.releaseNotes`
    (string or array) into markdown. If not, apply D1's `htmlReleaseNotesToMarkdown` where 077
    builds its update-available state (`src/main/` update service).

  Tests: `tests/main/release-notes.test.ts` › "the bundled text is the repository's CHANGELOG.md",
  "SB_E2E_CHANGELOG replaces the bundled text", "an unreadable SB_E2E_CHANGELOG yields null notes,
  not a throw". `tests/main/ipc-coverage.test.ts` must stay green with the new channel.

- **D3 — About: running version's notes, empty state, links (renderer).**
  - Split `src/renderer/screens/settings/AboutTab.tsx` into small parts under
    `src/renderer/screens/settings/about/` (stay below ~300 lines per file):
    `ReleaseNotesBody.tsx` renders a markdown string via `renderMarkdown` from
    `src/renderer/components/markdown-render.tsx`, with no `onOpenPath` and never
    `dangerouslySetInnerHTML`. D4 reuses it.
  - `InstalledNotesPanel.tsx` uses `useQuery` with a new key `qk.app.releaseNotes()` in
    `src/renderer/lib/queries/keys.ts` → `api.app.releaseNotes()`. It renders the
    `ReleaseNotesBody` under the title "What's new in {version}" (version in mono). Notes `null`,
    a query error or empty text show `EmptyState` (`src/renderer/components/EmptyState.tsx`) with
    one calm sentence, never a blank panel.
  - `AboutLinks.tsx` has two secondary `Button`s, "Project page" and "Full changelog", that call
    `api.shell.openExternal(url).catch(() => undefined)`. The URLs are constants in
    `src/shared/` (e.g. `src/shared/release.ts`: `PROJECT_URL`, `CHANGELOG_URL`; reuse an
    existing repo-URL constant from 077/078 if present). These links stay visible in the empty
    state.
  - Add i18n keys `settings.about.notes.*` and `settings.about.links.*` to both
    `src/renderer/i18n/de.ts` and `en.ts`. German uses `„…“`. Sentence case, no emoji, tokens
    only.

  Tests:
  - `tests/renderer/settings-about.test.tsx` › "renders the running version's notes as headings
    and list items", "a raw HTML line in the notes renders as text and adds no img element", "null
    notes show the empty state and keep the changelog link", "the links call shell.openExternal
    with the project and changelog URLs". The existing about case in
    `tests/renderer/settings.test.tsx` stays green.
  - e2e `tests/e2e/about-release-notes.spec.ts` › "about shows the running version's notes"
    writes a fixture changelog containing the app's `package.json` version (a `### Added`
    heading, a list item and a `<img src=x onerror=…>` line) and launches with
    `SB_E2E_CHANGELOG`. It opens `#/settings?tab=about` and asserts the heading and the item are
    visible, the literal markup is shown as text, and the panel has no `img`.
  - e2e › "about without notes shows an empty state": the fixture changelog has no section for
    the version.
  - e2e › "about links open in the system browser": stubs `shell.openExternal` via
    `evaluateMain`, clicks both links, and asserts both URLs were recorded and
    `app.windows().length` is unchanged.

  The e2e fixture needs an `AppOptions` passthrough for `SB_E2E_CHANGELOG` in
  `tests/e2e/fixtures/app.ts`, written like `stageDelayMs`.

- **D4 — About: pending update and update check (renderer).**
  - New `src/renderer/screens/settings/about/PendingUpdateBlock.tsx` reads [[077]]'s update state
    through its existing renderer hook/query (do not add a second one). When the state is
    "update available", it shows the version (mono), a `Badge` "Not yet installed", the notes via
    D3's `ReleaseNotesBody`, and [[078]]'s update action component unchanged. Empty notes show
    the D3 empty-state sentence. The block is absent otherwise.
  - New `src/renderer/screens/settings/about/UpdateCheckRow.tsx` shows "Last checked" with
    `RelativeTime` (`src/renderer/components/RelativeTime.tsx`) or "Never checked", plus a
    "Check now" button that calls 077's manual-check API, is disabled while checking, and fires
    one call per click.
  - The outcome region (`data-testid="about-update-outcome"`) shows up to date, the found version,
    or the failure reason from the state.
  - Mount both in `AboutTab.tsx` and add i18n keys `settings.about.update.*` to de/en.
  - If 077/078 provide no env seam to start the update service in a given state, add one first
    (`SB_E2E_UPDATE_STATE` = path to a JSON update state, same never-throw convention as D2) with
    a test in `tests/main/`.
  - If `docs/systems/update.md` exists, add a short "About" section to it: where the notes come
    from and that the pending notes are normalized in main.
  - Run `npm run verify:ui`.

  Tests:
  - `tests/renderer/settings-about.test.tsx` › "a pending update shows its version, the not yet
    installed badge and its notes", "the pending block is absent when up to date", "the pending
    block uses the shared update action", "never checked and a relative last-checked time
    render", "check now calls the manual check once and shows a failure reason".
  - e2e `tests/e2e/about-release-notes.spec.ts` › "about shows a pending update next to the
    update action" (seeded update-available state with notes).
  - e2e › "about checks for updates on demand and shows the outcome": clicks "Check now" and
    asserts `about-update-outcome` shows a non-empty outcome. In the unpackaged e2e build that is
    077's "checks are off in this build" failure reason, through the real path.

## Model Hints

- D1 → default
- D2 → default
- D3 → default
- D4 → default

Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/about-release-notes.spec.ts` › "about shows the running version's notes";
  unit `tests/core/release/release-notes.test.ts` › "picks one version's section without bleeding
  into the next"; unit `tests/main/release-notes.test.ts` › "the bundled text is the repository's
  CHANGELOG.md" (D1, D2, D3)
- AC2 → e2e `tests/e2e/about-release-notes.spec.ts` › "about shows a pending update next to the
  update action"; renderer `tests/renderer/settings-about.test.tsx` › "a pending update shows its
  version, the not yet installed badge and its notes", › "the pending block uses the shared update
  action", › "the pending block is absent when up to date" (D2 pending normalization, D4)
- AC3 → e2e `tests/e2e/about-release-notes.spec.ts` › "about links open in the system browser";
  renderer `tests/renderer/settings-about.test.tsx` › "the links call shell.openExternal with the
  project and changelog URLs" (D3)
- AC4 → e2e `tests/e2e/about-release-notes.spec.ts` › "about checks for updates on demand and shows
  the outcome"; renderer `tests/renderer/settings-about.test.tsx` › "never checked and a relative
  last-checked time render", › "check now calls the manual check once and shows a failure reason"
  (D4)
- AC5 → e2e `tests/e2e/about-release-notes.spec.ts` › "about without notes shows an empty state";
  renderer `tests/renderer/settings-about.test.tsx` › "null notes show the empty state and keep the
  changelog link"; unit `tests/main/release-notes.test.ts` › "an unreadable SB_E2E_CHANGELOG yields
  null notes, not a throw" (D2, D3, D4 empty pending notes)
- AC6 → e2e `tests/e2e/about-release-notes.spec.ts` › "about shows the running version's notes"
  (literal markup shown as text, no `img`); renderer `tests/renderer/settings-about.test.tsx` › "a
  raw HTML line in the notes renders as text and adds no img element"; unit
  `tests/core/release/release-notes.test.ts` › "maps GitHub release HTML to headings and list
  items", › "keeps raw script and img markup out of the converted text as tags" (D1, D3)

Coverage gate: AC1 D1+D2+D3 · AC2 D2+D4 · AC3 D3 · AC4 D4 · AC5 D2+D3+D4 · AC6 D1+D3. Every
AC has a deliverable and a named test; no manual residue.

## Done
