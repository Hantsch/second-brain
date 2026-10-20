# Sprint S19 review — Gaston ships and updates itself

Branch `sprint/S19` (not merged; the merge into `dev` is the user's decision).

## Overview

| Story | Status | Commit |
| ----- | ------ | ------ |
| 076 A release ships from a changelog | done | `b402629` release from CHANGELOG.md — plan/runner scripts, nsis+portable, workflow |
| 077 Gaston notices a new version | done | `b58ccac` daily quiet update check — state, store, IPC, About updates panel |
| 078 I update when I choose to | done | `c12eea7` download, cancel, guarded restart, title-bar control |
| 079 About tells me what changed | done | `e3d65fb` running + pending release notes, check row, links |

## Implemented stories

- **076:** `scripts/lib/release/` (changelog, version, plan, artifacts, runner), `npm run release` with `--dry-run`, NSIS + portable targets with a `publish` block, `.github/workflows/release.yml` (main only), seeded `CHANGELOG.md`. `npm run handoff` stays a separate local command.
- **077:** `src/main/update/` (store, checker, service) with a daily quiet check, reason-coded errors, portable detection, an e2e fixture seam and the About › Updates panel.
- **078:** staged download / cancel / install-and-restart / dismiss, a main-side restart blocker (running task or LLM stream), a `ProgressBar` atom and a title-bar update control with a second confirmation.
- **079:** bundled changelog section for the running version, pending-update notes converted in main, update-check row, project and changelog links.

## Findings & decisions

- Decisions are recorded per story under `## Decisions (Sprint)` (076: 14, 077: 14, 078: ~12, 079: 14). Notable: portable build gets `notInstallable` and opens the release page; update feed is set in code; notes use the existing `renderMarkdown`, never innerHTML.
- 076 found that `.gitignore` `release/` hid `scripts/lib/release/` and `tests/scripts/release/`; anchored to `/release/`.
- 078 touched `close-guard.test.ts`'s mock (added `hasRunningTask`, no assertion changed), contrary to the story text.
- 079 replaced 077's duplicate HTML-to-markdown helper with the core one.
- Left unfixed, all collected in the draft [080](../../requirements/080-update-follow-ups-from-s19.md): release-runner nits, the installer/quit tick race, download re-check, timed-out check still running, `service.ts` ~320 lines, leftover hand-rolled progress bars, untested `start()`/`isSupported` wiring.
- Process: the build agents' narrow gates did not run `tests/scripts/e2e-wiring.test.ts`'s whole rule for new specs; the gate caught it (see below).
- Late-run progress trail timestamps are minute-granular in the build agents' lines (`HH:MM`), monotonic and not ahead of the clock.

## Blocked / open

Nothing blocked. Open: the real release is untested against github.com (manual residue, below).

## Regression gate

Ran on `e3d65fb`: build green (0.2 min), `npm test` red (2.0 min), e2e green (2.9 min, 97 passed).

- `e2e-wiring` "every spec names its steps" ×3 → stories 078 / 079 (specs without `test.step`) — fixed in `0e17b64`, `2dd04f8`.
- `journal.test.tsx` Enter-combination test — **flaky** (timeout under load, green alone). Named here, not silenced; the project has no unit-test quarantine.
- The full `npm test` was not repeated after the fix; the wiring test and the three specs were re-run green.

## Acceptance

Every criterion has a named test in its story's `## Acceptance Tests` / Done section, and each passed in the story's narrow gate: 076 AC1–AC7 and AC5–AC6 (20 named tests, `tests/scripts/release/`), 077 AC1–AC9 (`tests/main/update/`, `update-check*.spec.ts`), 078 AC1–AC10 (restart-blocker, update-actions/control tests, `update-installed`/`update-portable` specs), 079 (core, main, renderer tests and `about-release-notes.spec.ts`).

Manual residue:

- 076 AC4 — the real `gh release create` against github.com (external service).
- 078 AC10 — the real relaunch into the new build (needs a packaged NSIS install and a published release).

Criteria covered below the real surface: 076's workflow itself is covered by a wiring test and the dry run, not by a GitHub Actions run.

## Tier record

| Story | Ds | hard | review | cycles | agents | build min |
| ----- | -- | ---- | ------ | ------ | ------ | --------- |
| 076 | 6 | 1 | default | 1 | 8 | 16 |
| 077 | 5 | 1 | default | 1 | 9 | 20 |
| 078 | 6 | 1 | default | 1 | 11 | 33 |
| 079 | 4 | 0 | default | 2 | 9 | 24 |
| **Total** | 21 | 3 | default ×4 | 5 | 37 | 93 |

No second-stage review ran, so it found nothing the default missed. Refine took 4.5 min; the gate agent ~6.5 min.
