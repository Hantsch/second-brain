---
id: 065
title: The gate runs on every push
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.7-2](../reviews/2026-09-03-architecture-review.md)),
P2 process. Evidence: no `.github/` directory exists; `npm run verify` (format, lint, typecheck,
251 test files, build) runs only when a developer or an agent chooses to run it. The repo spent
five sprints with a red test (`module.test.ts`, M1–M9) and a never-green `format:check` (until 041) — both exactly the kind of drift a gate on push would have surfaced on day one.

## Requirement

The repository has a strict verify pipeline and an unusually strong test suite — and nothing
enforces any of it. Every gate is opt-in on the developer's machine, and the project's own
history shows what that costs: a known-red test rode along for five sprints, a never-green
format check for four. Both were eventually given a story; a CI gate would have refused them at
the first commit.

`npm run verify` should run automatically on every push and every pull request, on a Windows
runner (the platform the app ships on — the CRLF story existed because only Windows showed it),
and a red run should be visible where the code lands. The sprint workflow doesn't change; the
gate is a net under it, not a new process.

## Acceptance Criteria

- [ ] A workflow runs `npm run verify` on every push and pull request, on a Windows runner.
- [ ] A red verify is visibly red on the commit/PR; the workflow's status is the signal, no
      extra tooling.
- [ ] The run needs no secrets and touches no network beyond installing dependencies —
      consistent with "tests never call real LLM APIs".
- [ ] Runtime is kept reasonable (dependency caching); the exact budget is recorded in the
      story's Done section.
- [ ] Optional, refine decides: a second lane runs `npm run seed && npm run shot` and uploads
      the screenshots as artifacts, closing the "renderer is only tested against the mock"
      gap with a real boot smoke.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
