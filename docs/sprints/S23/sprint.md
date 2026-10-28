---
sprint: S23
status: in-progress # planned | in-progress | done
branch: dev # user decision: commits directly on dev, no sprint branch
milestone: M22 — Test lanes you can trust
---

# Sprint S23 — Test lanes you can trust

## Goal

At the end of this sprint every test file belongs to a named lane that CLAUDE.md lists, the
release starts the built app before it publishes, CI stays on pull requests into `main` (a recorded
deviation) and reports the PR lane's minutes, and the blocking lane no longer waits on real time. A stray test file, a broken
package or a late `file://` navigation turns something red instead of passing silently.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 096 — Lane map in CLAUDE.md and a guard that every test file has a lane
- [ ] 097 — The release starts the built app before it publishes (blocked: D2 needs an app-harness.mjs change, Playwright drops NODE_OPTIONS)
- [x] 098 — CI stays PR-only, recorded as a deviation, and the PR lane reports its minutes
- [x] 099 — The blocking lane stops waiting on real time
- [x] 100 — e2e absence checks wait on a signal; the quit test gets its own spec
- [ ] 101 — Hook tests keep one cheap case per hook in the PR lane; eol test fails honestly
- [ ] 102 — Test and config drift drive-bys

## Notes

- **Source:** [tests review 2026-10-27](../../reviews/2026-10-27-tests-review.md) — story map, lane
  table and findings F01–F14 (F09 is closed by `/roadmap check`, no story).
- **Scope decision:** all seven stories in one sprint (user decision at the cut), instead of the
  review's Sprint A / Sprint B / opportunistic split. Seven is above the 3–6 guideline; 100–102 are
  small.
- **Order:** 096 first — 097, 098 and 101 depend on its `## Test lanes` table. 100 follows 097
  (smoke wiring). 099 and 102 are independent; they sit late so the lane work lands first.
- **Tests only:** no user-facing change, so no changelog entry is expected.
- **Gate honesty:** 098 measures the PR lane's minutes; the budget cell in 096's table is filled
  from that measurement, so refine 096 with a placeholder and revisit after 098.

## Regression gate

<!-- Filled by `/sprint` phase 2b: the commands run, minutes taken, result, commit, and a verdict per failure. -->
