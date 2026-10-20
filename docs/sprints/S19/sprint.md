---
sprint: S19
status: done # planned | in-progress | done
branch: sprint/S19 # set by /sprint
milestone: M19 — Gaston ships and updates itself
---

# Sprint S19 — Gaston ships and updates itself

## Goal

At the end of this sprint a push to `main` with a filled `## Unreleased` in `CHANGELOG.md`
publishes a GitHub release of `Hantsch/second-brain` carrying an NSIS installer, the portable exe
and `latest.yml`. An installed Gaston notices that release once a day without a word, offers it in
the app shell, downloads it on request and restarts into it only on a second confirmation; a
portable Gaston notices it too and opens the release page instead. About shows what the running
version and a pending update bring.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 076 — A release ships from a changelog
- [x] 077 — Gaston notices a new version
- [x] 078 — I update when I choose to
- [x] 079 — About tells me what changed

## Notes

- **Reference implementation:** `../q2-launcher` stories 096–099 built exactly this — release
  pipeline (`scripts/release.mjs`, `scripts/lib/release/`, `.github/workflows/release.yml`),
  update service (`src/main/services/update/`), update UI (`components/about/`). Adapt, do not
  reinvent; leave out everything Linux (Q2's 100/101).
- **Decided by the user before the sprint (2026-10-19), binding:**
  - Distribution: NSIS installer (auto-updates) **plus** the portable exe (notified only, opens
    the release page). Not NSIS + zip.
  - Platform: Windows only.
  - Repo `Hantsch/second-brain` is public; releases are published there, no token in the app.
  - Update UX at Q2's scope: check at startup + by hand, download with progress, cancel,
    install-and-restart with second confirmation, dismiss, release notes in About.
- **Order:** 076 first — 077 needs a `publish` config and `latest.yml`, 079 needs a bundled
  `CHANGELOG.md`. 078 before 079 because About reuses 078's update action.
- **Open for 076's refine:** whether `npm run handoff` stays next to the published portable exe or
  is folded into the release.
- No real release is cut inside the sprint: the release workflow runs only on `main`, and merging
  there stays the user's decision. 076's acceptance is its dry run plus unit tests.

## Regression gate

Ran on `e3d65fb` (all four stories); `e2e-all` is `none`, so no long suite.

- `npm run build` — green, 0.2 min
- `npm test` — red, 2.0 min: 4 failures in 2 files of 351
- `npm run test:e2e` — green, 2.9 min (97 passed)

Failures:

- `tests/scripts/e2e-wiring.test.ts` "every spec names its steps" (3 tests) — story 078
  (`update-installed`, `update-portable` specs) and 079 (`about-release-notes` spec); specs lacked
  `test.step`. Fixed in `0e17b64` (078) and `2dd04f8` (079); wiring test 52/52, the three specs green.
- `tests/renderer/journal.test.tsx` "bricht mit Enter, Shift+Enter und Ctrl+Enter nur die Zeile um"
  — flaky: 5 s timeout under full-suite load, green when re-run alone. Not in the e2e quarantine
  (that list holds e2e flows; it is `none`).

Final state on `2dd04f8`: the three fixed specs were re-run green; the full `npm test` was not run again.
