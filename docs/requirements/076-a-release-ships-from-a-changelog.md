---
id: 076
title: A release ships from a changelog
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

Gaston can be packaged (`npm run package` builds a portable exe, `npm run handoff` zips one for a
USB stick), but there is no release: no tag, no GitHub release, no artifact anyone could download,
no record of what changed between two builds, and nothing an installed copy could update from.
Version is still `0.1.0`, the repository has no tags, and the `build` block in
[package.json](../../package.json) has no `publish` target.

A release has to be a single deliberate act that produces the same three things every time: a
version, a published set of artifacts, and a human-readable list of what changed. The changelog is
the source for the release notes, not a byproduct of them — whoever writes a user-facing change
writes its line while the change is fresh, and the release only promotes what is already there. A
release with nothing to say is a mistake, not a valid release.

The sibling project `../q2-launcher` already runs exactly this shape (its story 096:
`.github/workflows/release.yml`, `scripts/release.mjs` + `scripts/lib/release/`, a `CHANGELOG.md`
whose `## Unreleased` section gates the run, triggered by a push to `main`) and is the reference to
adapt — not to invent from scratch. Two differences: Gaston is Windows-only (no `build-linux` job,
no plan/build split needed unless it simplifies), and it publishes **two** Windows artifacts — an
NSIS installer, which [[077]]/[[078]] update in place, and the portable exe it ships today, which
cannot update itself but is still what goes on a USB stick.

Artifact names carry no space (Q2's `artifactName` comment explains why: a space breaks the URL in
`latest.yml`).

## Acceptance Criteria

- [ ] **AC1** — The repository has a `CHANGELOG.md` in Keep-a-Changelog shape whose
      `## Unreleased` section is where pending user-facing changes are collected, seeded with the
      entries for what the first release ships with.
- [ ] **AC2** — A release run refuses to publish while `## Unreleased` is empty, with a readable
      reason, and changes nothing in the repository when it refuses.
- [ ] **AC3** — A release run determines the next version from the pending changes, promotes
      `## Unreleased` into a dated version section, writes that version into `package.json`, and
      leaves `## Unreleased` empty again — all in one commit plus a matching tag.
- [ ] **AC4** — A release run produces the NSIS installer, the portable exe and the update
      metadata [[077]] reads (`latest.yml`), and publishes them on a GitHub release of
      `Hantsch/second-brain` whose notes are the promoted changelog section.
- [ ] **AC5** — A dry run performs every step including the build and prints the version it would
      release and the notes it would publish, but commits, tags and publishes nothing.
- [ ] **AC6** — A release can be requested with an explicit version and an explicit bump level,
      overriding what the pending changes would have chosen.
- [ ] **AC7** — Running the release twice on unchanged `main` does not produce a second release,
      and the release commit itself never triggers another run.
- [ ] **AC8** — A real (non-dry) release refuses to run outside CI.
- [ ] **AC9** — The project's own workflow knows about the changelog: `changelog-path` in
      `.claude/ai-scrum.md` points at `CHANGELOG.md` instead of `none`.

## Open Questions

## Decisions (Sprint)

- **`npm run handoff` stays a separate local command, not folded into the release:** the release
  publishes the bare portable exe (the user decided NSIS + portable, not a zip), while the handoff
  ZIP's recipient readme and author-content check serve a hand-to-hand copy; the release reuses
  only `checkBundleContents` from `scripts/lib/handoff-check.mjs`, because a public asset needs the
  same privacy sweep.
- **Node ESM under `scripts/lib/release/` with `.d.mts` declarations, tests under
  `tests/scripts/release/*.test.ts`:** that is this repo's existing shape (`handoff-check.mjs` +
  `.d.mts` + `tests/scripts/handoff-check.test.ts`), so `vitest.config.ts` stays untouched.
- **Pure core, thin shell:** every decision (parse, refuse, version, notes, argv) is a pure
  function; only `runner.mjs` does I/O, through injected `exec`/fs functions, so AC2/3/5/6/7/8 are
  testable without git, GitHub or a real build.
- **Bump derived from Keep-a-Changelog categories, not commit messages:** commit subjects here are
  plain prose (`076: …`); `### Removed` or a `**BREAKING**` bullet → major, `### Added`/`### Changed`
  → minor, otherwise patch.
- **First release is whatever derivation yields from `0.1.0` (expected `0.2.0`), no prerelease
  channel:** no user decision asks for `1.0.0` or a beta, and AC6's `--version` exists for anyone
  who wants another number; a version carrying a `-` identifier still publishes with `--prerelease`.
- **The new version reaches the build via `-c.extraMetadata.version=<v>`, and `package.json`,
  `package-lock.json` and `CHANGELOG.md` are written only after build and asset check succeed, and
  only in a real run:** a dry run then writes nothing at all, avoiding the write-then-revert path
  that was Q2 096's late review bug.
- **Win targets `nsis` + `portable`, per-target `artifactName` (`gaston-${version}-setup.${ext}`,
  `gaston-${version}-portable.${ext}`), no space anywhere:** a space breaks the URL in
  `latest.yml`; the portable name stays what `handoff` and its readme already use.
- **NSIS `oneClick: true`, `perMachine: false`:** a per-user install updates without a UAC prompt,
  which [[078]]'s install-and-restart needs.
- **`build.publish = {provider: github, owner: Hantsch, repo: second-brain}`, building with
  `--publish never`:** the publish config is what makes electron-builder write `latest.yml` and
  `app-update.yml`; `gh release create` keeps notes and upload in the script's hands.
- **Published asset set: setup exe, its `.blockmap`, portable exe, `latest.yml`; the run refuses
  when one is missing or `latest.yml`'s `path` does not name the setup exe:** [[077]] reads exactly
  those, so an incomplete upload would break the next story silently.
- **Release order: commit + tag locally, `git push --atomic origin HEAD:main v<v>`, then
  `gh release create v<v> <assets> --title "Gaston <v>" --notes-file <tmp> --repo
  Hantsch/second-brain`:** if `gh` fails after the push, the run exits 1 and prints the exact `gh`
  command to finish by hand (a rerun would correctly refuse: tag exists, Unreleased empty).
- **Trigger is `push: [main]` plus `workflow_dispatch` (`version`, `bump`, `dry_run`); push runs
  pass `--if-pending`, which turns only the "Unreleased is empty" refusal into exit 0 with a
  notice:** a merge without user-facing changes is normal, not a red run, while a dispatched
  release with nothing to say stays the mistake the requirement calls it; every other refusal
  (tag exists, outside CI, bad version) exits 1 in both modes.
- **AC7 has three independent stops:** `[skip ci]` in `release: <v> [skip ci]` plus a job-level
  `if: !contains(github.event.head_commit.message, '[skip ci]')`, pushes made with `GITHUB_TOKEN`
  never trigger workflows, and the plan's tag-already-exists refusal.
- **A real run requires `CI=true`, otherwise refuses before building:** `main` is a protected
  branch for agents and humans alike; dry runs stay available locally (AC5).
- **Workflow: `windows-latest`, node `20.x` like `verify.yml`, `npm ci` → `npm run verify` →
  `node scripts/release.mjs …`, `permissions: contents: write`, `concurrency: release` without
  cancel, checkout `fetch-depth: 0`, git identity `github-actions[bot]`,
  `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`:** builds stay unsigned as decided for 031, and a stray
  runner certificate must not fail them.
- **Section heading `## <version> — <YYYY-MM-DD>` (UTC date), tag `v<version>`, no
  Keep-a-Changelog link definitions:** nothing to maintain per release beyond the section; the
  promoted text must be prettier-stable so the next PR's `format:check` stays green.
- **No `docs/systems/` doc:** no release system doc exists; the developer-facing description is a
  short `## Releases` section in `README.md`, next to `## Handing it on`.
- **Bundling `CHANGELOG.md` into the app is [[079]]'s change, not this story's:** it widens the
  `build.files` allowlist guarded by `tests/scripts/build-config.test.ts`, and only 079 reads it.
- **AC4's real publish to github.com is a manual residue:** no test may hit an external service;
  sprint notes make the dry run plus unit tests this story's acceptance, and merging to `main`
  stays the user's decision.

## Plan

Port `../q2-launcher` 096 (`scripts/release.mjs`, `scripts/lib/release/`,
`.github/workflows/release.yml`), Windows only, NSIS + portable instead of NSIS + zip.

1. **Pure core** `scripts/lib/release/` (+ `.d.mts` each): `changelog.mjs` (parse, read/validate
   Unreleased, promote, notes), `version.mjs` (derive bump, next version, apply to package.json +
   lockfile), `artifacts.mjs` (expected/collected asset set in `dist/`), `plan.mjs`
   (`planRelease(...)` → `{version, tag, notes, writes, commands}` or `ReleaseRefused`).
2. **Packaging** in `package.json` `build`: nsis + portable targets, per-target artifact names,
   `publish` block; `package` script builds both; `handoff.mjs` reads the portable name.
3. **Runner** `scripts/lib/release/runner.mjs` (I/O via injected deps) + `scripts/release.mjs`
   entry + `npm run release`: plan → `npm run build` → `checkBundleContents(out/**)` →
   electron-builder `--win nsis portable --publish never -c.extraMetadata.version=<v>` → asset
   check → print version + notes → (real, CI only) writes, commit, tag, push, `gh release`.
4. **Workflow** `.github/workflows/release.yml`.
5. **Changelog + wiring:** seeded `CHANGELOG.md`, README `## Releases` + npm-scripts row,
   `changelog-path: CHANGELOG.md` in `.claude/ai-scrum.md`.

Order: D1 → D2 → D3 → D4 → D5 → D6 (D6 independent of D3–D5).

## Deliverables

- **D1 — changelog and version core.** New `scripts/lib/release/changelog.mjs` + `changelog.d.mts`,
  `scripts/lib/release/version.mjs` + `version.d.mts`; tests `tests/scripts/release/changelog.test.ts`,
  `tests/scripts/release/version.test.ts`. Mirror `../q2-launcher/scripts/lib/release/changelog.mjs`
  and `version.mjs` (plain ESM, JSDoc, no deps) and this repo's `scripts/lib/handoff-check.d.mts`
  (declaration shape, no `any`). Functions: `parseChangelog(text)`, `readUnreleased(text)` →
  `{categories, bullets}`, `validateUnreleased` (empty / comment-only / no bullet → reason),
  `promote(text, version, date)` (Unreleased emptied, `## <version> — <date>` inserted directly
  below it, output prettier-stable: blank line around headings), `notesFor(text, version)`;
  `deriveBump(categories, bullets)` (`### Removed` or `**BREAKING**` → major, Added/Changed → minor,
  else patch), `nextVersion(current, bump)`, `isPrerelease(v)`, `isValidVersion(v)`,
  `applyVersion(pkgText, lockText, v)` (top-level `version` in package.json, top-level and
  `packages[""]` version in the lockfile; formatting preserved). _Accepted when:_ the named tests
  below pass.
- **D2 — release plan and asset set.** New `scripts/lib/release/plan.mjs` + `plan.d.mts`,
  `scripts/lib/release/artifacts.mjs` + `artifacts.d.mts`; tests `tests/scripts/release/plan.test.ts`,
  `tests/scripts/release/artifacts.test.ts`. Reuse D1's functions; mirror Q2's `plan.mjs` /
  `artifacts.mjs`. `planRelease({changelogText, pkgText, lockText, tags, requestedVersion, bump,
  dryRun, isCi, today})` returns `{version, tag, notes, prerelease, writes, commands}` or throws
  `ReleaseRefused` with `{kind, reason}`; kinds: `nothing-pending` (empty Unreleased),
  `tag-exists`, `outside-ci` (non-dry and `!isCi`), `bad-version`, `bad-bump`. Explicit version
  beats explicit bump beats derived. Writes: `package.json`, `package-lock.json`, `CHANGELOG.md`.
  Commands (empty in a dry run): `git add` of the three files, `git commit -m "release: <v> [skip ci]"`,
  `git tag -a v<v> -m "Gaston <v>"`, `git push --atomic origin HEAD:main v<v>`, `gh release create
  v<v> <assets…> --title "Gaston <v>" --notes-file <notesPath> --repo Hantsch/second-brain`
  (+ `--prerelease` when the version has a `-` identifier). `expectedAssets(version)` →
  `gaston-<v>-setup.exe`, `gaston-<v>-setup.exe.blockmap`, `gaston-<v>-portable.exe`, `latest.yml`;
  `collectAssets(dir, version)` refuses naming each missing file and when `latest.yml`'s `path`
  is not the setup exe (parse with the `yaml` dependency). artifacts test uses a `node:fs` temp dir.
- **D3 — packaging publishes update metadata.** `package.json`: `build.win.target` →
  `["nsis", "portable"]`; top-level `build.artifactName` removed; `build.portable.artifactName`
  `gaston-${version}-portable.${ext}`; `build.nsis` `{artifactName: "gaston-${version}-setup.${ext}",
  oneClick: true, perMachine: false}`; `build.publish` `{provider: "github", owner: "Hantsch",
  repo: "second-brain"}`; `package` script → `npm run build && electron-builder --win nsis portable
  --publish never`. `scripts/handoff.mjs` (around line 246) renders `manifest.build.portable.artifactName`
  instead of `manifest.build.artifactName`, still packaging `--win portable`. Extend
  `tests/scripts/build-config.test.ts` (keep its allowlist assertions untouched).
- **D4 — the release runner.** New `scripts/lib/release/runner.mjs` + `runner.d.mts`, new
  `scripts/release.mjs` (entry only: argv/env → `runRelease`, exit code), `package.json` script
  `"release": "node scripts/release.mjs"`; test `tests/scripts/release/runner.test.ts`.
  `runRelease({argv, env, cwd, exec, fs, log, today})`: parses `--dry-run`, `--version <v>`,
  `--bump <level>`, `--if-pending`; reads `CHANGELOG.md`, `package.json`, `package-lock.json`,
  tags (`git tag --list`); calls D2's `planRelease`; on refusal logs the reason and returns 1
  (0 only for `nothing-pending` with `--if-pending`) having executed no build and written nothing.
  Then: `npm run build`; `checkBundleContents` from `scripts/lib/handoff-check.mjs` over `out/**`
  (findings → exit 1); remove stale `dist/` files of D2's asset names; electron-builder via its
  resolved CLI as `scripts/handoff.mjs` `electronBuilderCli` does (shell: false) with `--win nsis
  portable --publish never -c.extraMetadata.version=<v>`; `collectAssets`; print version and notes.
  Dry run stops here. Real run: write D2's `writes`, write notes to a temp file, execute D2's
  `commands` in order; a failure after the push prints the remaining `gh` command and returns 1.
  Fakes for `exec`/`fs` live in the test file (no real git, gh or build). Also run
  `npm run release -- --dry-run` once on this machine and paste its version/notes output into
  `## Done`.
- **D5 — the workflow.** New `.github/workflows/release.yml` (mirror
  `../q2-launcher/.github/workflows/release.yml`, drop every Linux job; setup/caching as in this
  repo's `.github/workflows/verify.yml`): triggers `push: branches [main]` and `workflow_dispatch`
  inputs `version` (string), `bump` (choice '', patch, minor, major), `dry_run` (boolean);
  `permissions: contents: write`; `concurrency: {group: release, cancel-in-progress: false}`; job
  `if: ${{ !contains(github.event.head_commit.message, '[skip ci]') }}`; `runs-on: windows-latest`;
  checkout `fetch-depth: 0`; node `20.x`; `npm ci`; `npm run verify`; git identity
  `github-actions[bot]`; `node scripts/release.mjs` with `--if-pending` on push events and the
  inputs mapped to flags on dispatch; env `CI: 'true'`, `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`,
  `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`. Test `tests/scripts/release/wiring.test.ts` parses it
  with `yaml` and asserts every invariant above.
- **D6 — the changelog and the project knowing about it.** New `CHANGELOG.md` (Keep-a-Changelog
  header, `## Unreleased` with `### Added` bullets for what the first release ships, grouped by
  feature area from `docs/ROADMAP.md` milestones M1–M18 — capture/filing, search and answers with
  citations, journal, wiki, ingest, overview/todos, gardener, Claude sessions, local models,
  handoff, and the release + update pipeline of this sprint; no story numbers, sentence case, no
  emoji); `README.md` gains a `## Releases` section after `## Handing it on` (write your line under
  `## Unreleased` with the change; a push to `main` releases; `npm run release -- --dry-run`
  locally) and a `release` row in `## npm scripts`; `.claude/ai-scrum.md` `changelog-path: none` →
  `CHANGELOG.md`. Test `tests/scripts/release/changelog-file.test.ts` reads the real files and uses
  D1's `readUnreleased`/`validateUnreleased`.

## Model Hints

- D4 → **deliverable-hard** — the only D with irreversible side effects (a pushed tag on `main`, a
  public GitHub release): refusal, dry-run and outside-CI paths must provably execute no git/gh
  command and write no file, and the post-push failure path must not leave a silent half-release.
- D1, D2, D3, D5, D6 → default.
- Review: → default

## Acceptance Tests

No criterion describes an action in the app UI — the surface is a CLI script and a CI workflow, so
every criterion maps to `npm test` (no e2e line).

- AC1 → unit `tests/scripts/release/changelog-file.test.ts` › "CHANGELOG.md is Keep-a-Changelog
  shaped and Unreleased carries the first release's entries" _(D6)_
- AC2 → unit `tests/scripts/release/plan.test.ts` › "an empty Unreleased section refuses with a
  reason and plans no writes" _(D2)_; unit `tests/scripts/release/runner.test.ts` › "a refused
  run builds nothing, writes no file and runs no git or gh command" _(D4)_; unit
  `tests/scripts/release/changelog.test.ts` › "a comment-only or bullet-less Unreleased is
  invalid" _(D1)_
- AC3 → unit `tests/scripts/release/plan.test.ts` › "a release promotes Unreleased into a dated
  section, writes the version to package.json and the lockfile, and plans one commit and one
  tag" _(D2)_; unit `tests/scripts/release/changelog.test.ts` › "promote leaves Unreleased empty
  and inserts the dated section below it" _(D1)_; unit `tests/scripts/release/version.test.ts` ›
  "the bump follows the changelog categories" _(D1)_
- AC4 → unit `tests/scripts/release/artifacts.test.ts` › "the asset set is setup exe, its
  blockmap, portable exe and latest.yml, and a missing one refuses" _(D2)_; unit
  `tests/scripts/release/plan.test.ts` › "the gh call publishes every asset to
  Hantsch/second-brain with the promoted section as notes" _(D2)_; unit
  `tests/scripts/build-config.test.ts` › "electron-builder builds nsis and portable, publishes to
  Hantsch/second-brain, and no artifact name has a space" _(D3)_.
  manual residue: the real `gh release create` against github.com — an external-service side
  effect no test may perform, and merging to `main` is the user's decision.
- AC5 → unit `tests/scripts/release/runner.test.ts` › "a dry run builds and checks the assets,
  prints version and notes, and writes nothing and runs no git or gh command" _(D4)_; unit
  `tests/scripts/release/plan.test.ts` › "a dry run yields the version and the notes but no
  commands" _(D2)_
- AC6 → unit `tests/scripts/release/plan.test.ts` › "an explicit version and an explicit bump
  each override the derived one" _(D2)_
- AC7 → unit `tests/scripts/release/plan.test.ts` › "a second run on an unchanged tree refuses:
  Unreleased is empty and the tag already exists" _(D2)_; unit
  `tests/scripts/release/wiring.test.ts` › "the release commit carries [skip ci] and the
  workflow skips such a commit" _(D5)_; unit `tests/scripts/release/runner.test.ts` › "with
  --if-pending only an empty Unreleased exits 0" _(D4)_
- AC8 → unit `tests/scripts/release/plan.test.ts` › "a real release outside CI refuses" _(D2)_;
  unit `tests/scripts/release/runner.test.ts` › "a non-dry run without CI=true refuses before
  building" _(D4)_
- AC9 → unit `tests/scripts/release/changelog-file.test.ts` › "changelog-path in
  .claude/ai-scrum.md points at CHANGELOG.md" _(D6)_

Coverage: AC1 D6 · AC2 D1/D2/D4 · AC3 D1/D2 · AC4 D2/D3 (+residue) · AC5 D2/D4 · AC6 D2 ·
AC7 D2/D4/D5 · AC8 D2/D4 · AC9 D6.

## Done
