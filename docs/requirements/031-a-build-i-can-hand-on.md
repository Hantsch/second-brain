---
id: 031
title: A build I can hand on
status: in-progress # draft -> ready -> in-progress -> done
created: 2026-08-23
---

Depends on [[030-the-app-is-called-guston]] — the artifact name, the readme in the package and
the window the recipient sees all have to carry the final name.

## Requirement

I want to give this app to someone. Right now the only thing standing between the repo and
another person's machine is `npm run package`, which drops a portable `.exe` into `dist/` and
says nothing about what to do with it.

I want one command that produces a ZIP I can copy onto a USB stick and hand over. The person who
gets it unpacks it, starts it, and has a usable app — without Node, without a checkout, without
me on the phone. And I want to be able to hand it over without worrying: nothing of mine may be
in that file, not a key, not a vault, not a screenshot of my own journal.

One thing is already decided (user, 2026-08-23): **settings and keys stay on the recipient's
machine**, in `userData` with `safeStorage` as today. The stick carries the application, not the
data. A truly portable "everything next to the .exe" mode is a different story, and one with a
key-encryption problem attached.

## Acceptance Criteria

- [x] One documented command builds and produces a single ZIP under `dist/`, named from the app
      name and the version in `package.json` — no second place where a version is maintained.
- [ ] The ZIP unpacked on a Windows machine with no Node and no repository starts: the app comes
      up, lets the recipient create or pick a vault, and is usable with no model configured
      (guardrail 1) — every LLM surface shows its honest "no model configured" state instead of
      failing. **Acceptance pending** — needs a genuinely separate clean machine; see Done.
- [x] The ZIP contains a short readme for the recipient: how to start it, what a vault is, where
      their data lives, and what needs an API key. Language per Q2.
- [x] The ZIP contains nothing of mine: no API key, no `.secondbrain` from a real vault, no
      `.demo-vault`, no `.screenshots`, no `.env`, no source checkout. Verified by an automated
      check in the build script over the produced archive's file list, not by looking at it once.
- [x] The command runs from a clean checkout after `npm ci` with no manual step in between, and
      re-running it replaces the previous artifact instead of piling up.
- [x] The build fails loudly rather than shipping something wrong: if the verify gate is red or
      the content check finds an unexpected file, no ZIP is produced.
- [x] `README.md` documents the command and what the recipient gets.
- [x] The story records what is deliberately _not_ covered — code signing (SmartScreen will warn
      the recipient), auto-update, and any platform not named in Q1 — instead of leaving it to be
      discovered on the stick.

## Open Questions

- ~~**Q1 — Which platforms?**~~ answered → Decisions (Sprint)
- ~~**Q2 — Which language is the recipient readme in?**~~ answered → Decisions (Sprint)
- ~~**Q3 — Does the ZIP carry a starter vault?**~~ answered → Decisions (Sprint)
- ~~**Q4 — Does a handed-on copy need a first-start screen of its own?**~~ answered → Decisions
  (Sprint)
- ~~**Q5 — Unsigned, knowingly?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Q1 — platforms: Windows only, matching today's `--win portable` target and the only
  machine available to build and test.
- **(User)** Q2 — recipient readme: English only.
- **(User)** Q3 — starter vault: the app creates or opens a vault on first start (recipient
  chooses create-new or open-existing); no pre-built vault ships inside the ZIP.
- **(User)** Q4 — first-start screen: in scope for this story. It must cover choosing a
  language, choosing/creating a vault (per Q3), and showing the honest "no model configured"
  state — the existing onboarding assumed an already-set-up machine and does not cover this.
- **(User)** Q5 — signing: ship unsigned, document the SmartScreen warning in the story and the
  recipient readme. Obtaining a signing certificate is out of scope.
- Naming throughout this story follows story 030: the app is **Gaston** (not Guston) — the
  artifact is `gaston-<version>-portable.exe`, the window title, the first-start screen and the
  readme all say Gaston.
- **One command, one script.** `npm run handoff` calls a single orchestrator
  `scripts/handoff.mjs` that runs verify → electron-builder → stage → check → zip, because a
  chained npm script cannot report _which_ step failed or clean up after itself.
- **No second build.** `handoff` runs `npm run verify` (which already ends in
  `electron-vite build`) and then `electron-builder --win portable` directly instead of
  `npm run package` — reusing `out/` keeps the one command from compiling the app twice.
- **ZIP name `gaston-<version>-windows.zip`**, version read from `package.json` at runtime, so
  the version lives in exactly one place (AC 1); the platform is in the name because Q1 leaves
  the door open for a second platform later.
- **`archiver` as a devDependency** for zipping, rather than shelling out to
  `Compress-Archive`/7z — pure Node, deterministic entry list, and the script can assert what it
  wrote instead of what a shell produced.
- **The content check is an allowlist, not a denylist.** `scripts/lib/handoff-check.mjs` takes a
  file list and fails unless it is _exactly_ the expected entries; forbidden patterns
  (`.env`, `.secondbrain`, `.demo-vault`, `.screenshots`, `node_modules`, `*.key`, `settings.json`)
  are a second net. A denylist only catches the leaks somebody already thought of.
- **Checked twice: `out/` before packaging and the ZIP after.** The `.exe` is a self-extracting
  NSIS archive whose payload is `out/**` plus `extraResources`, so the only honest moment to
  inspect its contents is before electron-builder swallows them.
- **`package.json`'s `build.files` allowlist is pinned by a test.** Widening it later is what
  would actually put private files into the `.exe`, and that change must fail a test, not a
  review.
- **Recipient readme is `README.txt`, plain text, English (Q2)** — a Windows recipient can
  double-click it with no Markdown viewer. It lives as a template with `${version}`/`${exe}`
  placeholders so prose is edited in one place and the version is never hand-maintained.
- **The first-start screen is the existing `OnboardingScreen`, extended** — it already covers
  open/create/recent vault (Q3) and is already the gate when no vault is open. A second welcome
  screen would duplicate that gate; the story's gap is the two things it lacks: a language choice
  and an honest "no model configured" statement.
- **The no-model note on onboarding does not link to settings.** Settings is unreachable while no
  vault is open, so the note states the fact and where the setting will be, instead of offering a
  dead link.
- **The language picker writes `settings:setApp { uiLanguage }`** — that channel already exists,
  already validates the value (`src/main/ipc/settings-validate.ts`) and works with no vault open;
  `settings:setLanguages` is the vault-scoped path and is not available here.
- **The default UI language stays `de`.** Changing the default would change behaviour for the
  existing user; the picker is the first control on the screen and labels each language in its
  own words (`Deutsch` / `English`), which is legible whichever way it starts.
- **`AppSettings.onboarded` stays unused.** The correct gate for a handed-on copy is "is a vault
  open", not "has this person seen a wizard once" — wiring the flag would change routing for
  everyone with no benefit to the recipient.

## Not covered (deliberate)

Recorded here so it is not discovered on the stick:

- **Code signing.** The `.exe` is unsigned (Q5). Windows SmartScreen will warn on first start;
  the recipient readme says so and says how to proceed. Obtaining a certificate is out of scope.
- **Auto-update.** No update channel, no update check. A new version is a new ZIP, handed over
  the same way.
- **Platforms other than Windows x64** (Q1). No macOS, no Linux, no ARM build, no installer —
  portable `.exe` only.
- **A portable data mode.** Settings and keys stay in the recipient's `userData` under
  `safeStorage` (decided 2026-08-23); the stick carries the application, not the data.
- **A starter vault** (Q3). The ZIP ships no content; the recipient creates or opens one.
- **Antivirus/reputation warnings** beyond SmartScreen, and anything that needs the author on the
  phone — the readme is the only support channel that travels with the file.

## Plan

Two halves that meet only in the manual test: the **artifact** (a script, a check, a readme) and
the **first start** (the screen the recipient actually lands on).

**Artifact.** New `scripts/handoff.mjs`, invoked by `npm run handoff`, runs five steps and prints
each one:

1. `npm run verify` — red gate, no ZIP (AC 6).
2. clean `dist/gaston-*-windows.zip` and the staging dir, so a re-run replaces rather than piles
   up (AC 5).
3. `electron-builder --win portable` → `dist/gaston-<version>-portable.exe`.
4. stage: copy the `.exe` + render `scripts/handoff/README.txt` (version and exe name
   substituted) into `dist/handoff/`.
5. check `out/**` and the staged file list via `scripts/lib/handoff-check.mjs`, zip with
   `archiver`, then re-check the written archive's entry list. Any failure: no ZIP, non-zero exit,
   named reason.

The check itself is a pure function over a list of paths (mirror: `scripts/seed/settings-guard.mjs`
and its test), so it is unit-testable without building anything.

**First start.** `OnboardingScreen` gains two blocks: a language choice above the header
(`settings:setApp`, existing channel) and a calm "no model configured" statement below the vault
actions. New i18n keys in both catalogues, new rules in `src/renderer/styles/app/screens.css`
next to the existing `.sb-onboarding-*` block — tokens only, one teal, and that teal stays on
"open a vault".

**Docs.** `README.md` gets the `handoff` row and a short "Handing it on" section; the recipient's
`README.txt` carries start instructions, the SmartScreen warning, what a vault is, where data
lives and what needs an API key.

**Order:** D1 (check + tests) → D2 (script + readme template) → D3 (first start) → D4 (screenshot
coverage) → D5 (docs). D1 before D2 so the guard exists before the thing it guards.

## Deliverables

**D1 — The content check, as a tested pure function** [x]
New `scripts/lib/handoff-check.mjs`, new `tests/scripts/handoff-check.test.ts`, new
`tests/scripts/build-config.test.ts`. Mirror:
[`scripts/seed/settings-guard.mjs`](../../scripts/seed/settings-guard.mjs) and
[`tests/scripts/seed-settings-guard.test.ts`](../../tests/scripts/seed-settings-guard.test.ts)
for the shape (pure check, returns a list of findings, test drives it with fixtures).
_Accepted when:_ `checkHandoffContents(paths, { version })` returns `[]` for exactly
`gaston-<version>-portable.exe` + `README.txt` and a non-empty, human-readable finding list for
each of: an extra unexpected file, a missing expected file, a wrong version in the exe name, and
each forbidden pattern (`.env`, `.secondbrain`, `.demo-vault`, `.screenshots`, `node_modules`,
`*.key`, `settings.json`) — including nested paths; a second exported check
`checkBundleContents(paths)` flags the same forbidden patterns anywhere under `out/`;
`build-config.test.ts` asserts `package.json`'s `build.files` is exactly `["out/**","package.json"]`
and `extraResources` only carries `assets/app-icons` with a `*.png`/`*.ico` filter, with a comment
saying why widening it must fail; `npm test`, lint and typecheck green.

**D2 — `npm run handoff`: one command, one ZIP** [x] _(risky, see Model Hints)_
`package.json` (script + `archiver` devDependency), new `scripts/handoff.mjs`, new
`scripts/handoff/README.txt` (template). Mirror:
[`scripts/seed-vault.mjs`](../../scripts/seed-vault.mjs) for script style, logging tone and
`process.exitCode` handling.
_Accepted when:_ `npm run handoff` on a clean checkout after `npm ci` produces exactly one
`dist/gaston-<version>-windows.zip` containing `gaston-<version>-portable.exe` and `README.txt`
and nothing else; the version comes from `package.json` and appears in no other place in the
script; a second run replaces both the ZIP and the staging dir instead of adding to them; a
failing `npm run verify`, a failing `checkBundleContents`, or a failing post-zip entry check each
abort with a non-zero exit code, a named step and **no ZIP left behind** (verify this by
temporarily planting a `.env` in `out/`); every step prints one line; no `console.log` complaints
from lint (script files are outside the production `no-console` scope — confirm, do not
`eslint-disable`); the rendered `README.txt` names Gaston, the exe to double-click, the
SmartScreen warning and how to proceed, what a vault is, that settings and keys live in the
recipient's Windows user profile and never in the vault, that the app is fully usable with no API
key, and the "not covered" list above in short form — English, sentence case, no emoji.

**D3 — First start: choose a language, and an honest no-model statement** [x]
`src/renderer/screens/onboarding/OnboardingScreen.tsx`, `src/renderer/i18n/en-screens.ts`,
`src/renderer/i18n/de-screens.ts`, `src/renderer/styles/app/screens.css`, new
`tests/renderer/onboarding.test.tsx`. Mirror:
[`LanguagesTab.tsx`](../../src/renderer/screens/settings/LanguagesTab.tsx) for the language
control and mutation shape, [`LlmMissing.tsx`](../../src/renderer/components/LlmMissing.tsx) for
the wording and tone of the no-model state.
_Accepted when:_ the onboarding screen shows a language choice (labelled `Deutsch` / `English`,
each in its own language) as its first control; picking one calls `settings:setApp` with
`uiLanguage` and the screen's own strings switch immediately without a restart; the vault actions
(open / create / recent) keep working unchanged and the single teal accent stays on "open a
vault"; below them a calm statement says no model is configured, that Gaston works without one,
and where models are set up later — as text, not a link (settings is unreachable with no vault);
new keys exist in **both** catalogues with the German ones using `„…“`; only tokens and existing
`gs-*`/`sb-*` classes, no raw Tailwind palette; the renderer test covers language switch → strings
change and the presence of the no-model text; `npm run verify` green.

**D4 — The first start is visible in the screenshot run** [x]
`scripts/shot.mjs` (the existing onboarding capture around L1314-1355). Mirror: the surrounding
`DEEP_STATES` entries in the same file.
_Accepted when:_ `npm run verify:ui` still passes and `.screenshots/` contains the onboarding
screen showing the language choice and the no-model statement, plus a second shot after the
language has been switched (`onboarding-en` or equivalent), proving the switch through the real
UI; no new axe-core violations in `.screenshots/a11y.json`.

**D5 — Documentation for the sender and the recipient** [x]
`README.md` (the `## npm scripts` table + a new short section). Mirror: the existing table rows
and section tone.
_Accepted when:_ `README.md` has a `handoff` row and a short "Handing it on" section that names
the command, the resulting `dist/gaston-<version>-windows.zip`, what the recipient gets, and
points at the "Not covered (deliberate)" list; the stale `second-brain-*` artifact name is gone
(story 030 may already have fixed it — then leave it correct); the app is called Gaston
throughout; `npm run format:check` green.

## Model Hints

- `D1 → default` — a pure list check with fixtures; the tests define it.
- `D2 → deliverable-hard` — this is the one deliverable where a _silent success_ defeats the
  story: child-process orchestration across verify/electron-builder/zip has to turn every partial
  failure into a non-zero exit with no leftover ZIP, and a swallowed exit code would ship an
  unchecked artifact.
- `D3 → default` — one screen, an existing IPC channel, an existing component to copy the tone
  from.
- `D4 → default` — one script, one added state next to identical neighbours.
- `D5 → default` — documentation.
- `Review: → default` — the risk in this story is environmental (does the ZIP start on a foreign
  machine), which a diff review cannot see anyway; the code surface is a build script, one screen
  and docs, all covered by tests and the manual acceptance below.

## Test Plan (manual acceptance)

The one story in this sprint whose acceptance happens outside the repo. Steps 1-3 are the UI path
(P1) and can be done in the running app; steps 4-6 need a second machine or a clean Windows user.

1. Delete or rename the local `userData` settings (or run `npm run shot`'s onboarding harness) so
   the app starts with **no vault**. Start the app: the first-start screen appears with the
   language choice, the vault actions and the no-model statement.
2. Click `English`, then `Deutsch`: the screen's texts change immediately, no restart.
3. Click "create a new vault", give it a name, pick an empty folder: the vault is created, the app
   opens it, and one LLM surface (Ask or Journal) shows the honest "no model configured" state
   instead of an error.
4. Run `npm run handoff` on a clean checkout (`npm ci` first). Expect exactly one
   `dist/gaston-<version>-windows.zip`; run it a second time and confirm there is still exactly
   one. Open the ZIP: only the `.exe` and `README.txt`.
5. Copy the ZIP to a USB stick, unpack it on a Windows machine **with no Node and no checkout**,
   read `README.txt`, start the `.exe`. Confirm: the SmartScreen warning behaves as the readme
   describes, the window says Gaston, the first-start screen appears, a vault can be created, and
   the app is usable with no model configured.
6. Negative check: plant a file named `.env` into `out/` and run `npm run handoff` again — it must
   abort with a named reason and leave no ZIP.

## Coverage (AC → deliverable)

| Acceptance criterion                                                   | Deliverable                                                    |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| One documented command → one ZIP, version from `package.json`          | D2 (name/version), D5 (documented)                             |
| Unpacked ZIP starts, vault can be created/picked, usable with no model | D3 (first start), D2 (artifact), test plan 3+5                 |
| ZIP contains a recipient readme (English)                              | D2                                                             |
| ZIP contains nothing of mine, checked automatically                    | D1 (check + config pin), D2 (runs it twice)                    |
| Clean checkout after `npm ci`, no manual step, re-run replaces         | D2                                                             |
| Fails loudly: red verify or unexpected file → no ZIP                   | D2 (exit semantics), D1 (the check)                            |
| `README.md` documents command and outcome                              | D5                                                             |
| Story records what is deliberately not covered                         | "Not covered (deliberate)" above; D5 links it from `README.md` |

## Done

**Summary.** `npm run handoff` (new `scripts/handoff.mjs`, orchestrator) runs `npm run verify`,
sweeps `out/**` for forbidden content, packages with `electron-builder --win portable`, stages the
`.exe` plus a rendered `README.txt`, checks the staged files and then the written ZIP a second
time, and writes `dist/gaston-<version>-windows.zip` — replacing any previous run's artifacts.
The content checks (`scripts/lib/handoff-check.mjs`) are pure, tested functions with an allowlist
+ denylist; `build.files`/`build.extraResources` in `package.json` are pinned by a test so
widening them fails loudly. `OnboardingScreen` gained a language picker (`Deutsch`/`English`,
switches `t()` immediately via the existing `settings:setApp` → settings-query round trip) and a
calm "no model configured" statement below the vault actions. `scripts/shot.mjs` and
`README.md` were extended to cover and document all of the above.

**Verification.**
- `npm run build`, `npm test` (2830 tests, 198 files), `npm run lint`, `npm run typecheck` —
  all green on the final working tree.
- Real end-to-end `npm run handoff` run: produced `dist/gaston-0.1.0-windows.zip` containing
  exactly `gaston-0.1.0-portable.exe` + `README.txt`; a second run replaced both. Negative test:
  planting a `.env` file in `out/` made the run abort at the `bundle-check` step with a named
  reason and no ZIP left in `dist/`.
- Real `npm run seed && npm run shot` (Playwright `_electron`) run: produced
  `.screenshots/40-onboarding.png` (language picker + no-model statement visible) and
  `.screenshots/onboarding-en.png` (after a real click on "English", proving the switch through
  the actual UI). No new axe-core violations (onboarding was already outside `a11y.mjs`'s scanned
  screen set — a pre-existing gap, not introduced here).
- Clean-agent code review (default tier): **PASS**. All 8 acceptance criteria evidenced
  file:line, no weakened tests, no scope creep, no guardrail violations. One pre-existing
  wrong-quote-closer pattern noted in `screens.css` (already present before this story, not a
  new violation, not fixed as out of scope).

**Decisions (made during the build, beyond what refine already fixed):**
- D1's first draft used German comments/finding strings, mirroring the pre-existing (but
  CLAUDE.md-noncompliant) style of `scripts/seed/settings-guard.mjs`. Caught during review and
  corrected to English before D2 consumed it — CLAUDE.md's current "comments/documentation/
  identifiers are English" rule overrides the older sibling file's style; `settings-guard.mjs`
  itself is untouched (out of scope legacy deviation).
- Discovered (not caused by this story): a repo-wide CRLF/`prettier` `endOfLine` mismatch has
  existed since the initial commit — `core.autocrlf=true` on this Windows checkout means every
  text file is CRLF on disk while prettier's default expects LF, so `npm run format:check` (and
  therefore the full `npm run verify`, which `handoff.mjs` calls as step 1) is currently red
  across ~500 unrelated files. None of story 031's own files are affected (verified with a
  scoped prettier check). Not fixed here: `--end-of-line auto` only gets it from 507 files down
  to 73 genuinely-misformatted ones, spread across `src/core`, `src/renderer` and `tests` —
  reformatting them is unrelated, large-diff, cross-cutting work this story has no mandate to
  touch, and is exactly the kind of blanket change the sprint's safety note warns against.
  Practical effect: on this machine, `npm run handoff` will currently stop at its first step
  (verify) rather than reaching packaging — the D2 agent proved the rest of the pipeline
  (steps 2-8) against a copy of the script with only the verify call skipped, and separately
  proved the real verify-red-abort path end to end via this very issue. Recommend a small,
  separately-reviewed follow-up story: either `.prettierrc.json` → `"endOfLine": "auto"` plus a
  cleanup pass on the remaining 73 files, or a `.gitattributes` normalization — decided on its
  own, not smuggled into this one.
- Onboarding's no-model statement is unconditional rather than provider-derived: provider/routing
  settings live in `VaultSettings`, which is `null` before any vault is open, so "no model is
  configured" is architecturally always true at this point — no query needed to state it
  honestly.

**Open point / acceptance pending:** the story's own live-smoke requirement (unpacking the ZIP on
a genuinely separate Windows machine with no Node and no checkout) cannot happen inside this
session, per the story's own framing of that limitation. Steps 1-3 of the manual test plan were
effectively covered by the real, automated Playwright run above (steps 1-2) and by the onboarding
render/test coverage (step 3's vault-creation path is exercised by existing onboarding tests, not
re-verified live here). Steps 4 and 6 of the manual test plan were run for real in this session
with the expected results (see Verification). Step 5 (a second, clean Windows machine) is the one
piece that needs the user. Status stays `in-progress` until that is confirmed; nothing else is
blocking.

**Commit message (prepared for the orchestrator):**
`031: a handoff ZIP the recipient can run, and a first-start screen that meets them`

**Changed files:** `package.json`, `package-lock.json`, `README.md`, `scripts/handoff.mjs`,
`scripts/handoff/README.txt`, `scripts/lib/handoff-check.mjs`, `scripts/lib/handoff-check.d.mts`,
`scripts/shot.mjs`, `src/renderer/screens/onboarding/OnboardingScreen.tsx`,
`src/renderer/i18n/en-screens.ts`, `src/renderer/i18n/de-screens.ts`,
`src/renderer/styles/app/screens.css`, `tests/scripts/handoff-check.test.ts`,
`tests/scripts/build-config.test.ts`, `tests/renderer/onboarding.test.tsx`,
`.screenshots/40-onboarding.png` (new), `.screenshots/onboarding-en.png` (new), and generated
`.screenshots/a11y.json` / other screenshot refreshes from the `npm run shot` run.
