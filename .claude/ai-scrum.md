# AI Scrum — Project Profile

<!--
  Managed by the ai-scrum plugin. Safe to edit by hand — `/ai-scrum:setup` only
  rewrites values you confirm, and never touches your `## Notes`.

  This file holds FACTS the workflow commands need verbatim (verify commands, paths,
  branch strategy). Project RULES and architecture guardrails stay in CLAUDE.md —
  the commands read both.
-->

ai-scrum-version: 4.5.0
project: Gaston

## Verify

Commands the build step runs before a story may be called done. Use `none` when a
step does not exist in this project.

build: npm run build
test: npm test
lint: npm run lint
typecheck: npm run typecheck
format: npm run format:check
e2e: npm run test:e2e
<!--
  `e2e` is the acceptance gate for user-facing stories: a criterion describing something the
  user does is proven here, through the real surface — Playwright driving the built Electron
  app against a disposable, no-model vault (tests/e2e/). `npm run shot` / `npm run a11y` still
  prove that screens render and are a11y-clean, but only `e2e` drives a flow and asserts an
  outcome. `test` covers everything without a user-facing surface (core logic, IPC, parsing).
-->

test-story: npx vitest run --changed HEAD
e2e-story: npx playwright test {files}
e2e-all: none
e2e-cleanup: none
<!--
  Narrow and broad gates. /build runs `test-story` and `e2e-story` instead of the full
  `test`/`e2e` per story; /sprint runs full `test`, full `e2e` and `e2e-all` once after the
  last story. `e2e-all` is `none` because `e2e` already runs the whole Playwright suite —
  there is no separate "every flow" script to run in addition. `e2e-cleanup` is `none`;
  revisit if a leftover Electron instance from a killed run ever blocks the next one (only
  one Electron instance can run at a time on this machine — shared tray icon and hotkey).
-->

test-support: tests/fakes/, tests/fixtures/ <!-- shared fixtures and fakes, pasted into every deliverable prompt by /build so agents reuse them -->
e2e-quarantine: none <!-- no expected-failure list exists; /sprint's regression gate would write one here -->

## Conventions

doc-language: en <!-- language for generated artifacts: stories, sprint reviews, concepts -->
requirements-path: docs/requirements
sprints-path: docs/sprints
roadmap-path: docs/ROADMAP.md
concepts-path: docs/concepts
systems-path: docs/systems
story-id-format: NNN <!-- three digits + slug, e.g. 042-npc-haggling.md -->
sprint-id-format: SNN <!-- e.g. S07 -->

changelog-path: none
<!--
  Optional. Path to a USER-FACING changelog (e.g. version.md, CHANGELOG.md) — not the
  git history. When set, /build and /sprint require an entry for every user-facing
  change; when `none`, the rule is dormant and nothing asks for it.
-->

## Branching

branch-base: dev <!-- branch a sprint is cut from -->
sprint-branch-pattern: sprint/{id}
auto-commit-per-story: true <!-- /ai-scrum:sprint commits once per story ON THE SPRINT BRANCH only -->
protected-branches: main, dev <!-- never commit here, never push, never merge -->

## Acceptance

**Acceptance is the test suite, not a person with a click list** (decided 2026-09-07).
Every acceptance criterion is proven by an automated test the workflow writes as part of the
story. A story is done when those tests pass and the clean-agent review is through — no manual
gate, no "built, acceptance pending", no user tick. What a walk-through finds afterwards becomes
a new story. The old eight-milestone acceptance backlog was dropped for exactly this reason:
`docs/reviews/2026-09-03-acceptance-todo.md`.

ac-tests-required: true
<!--
  true  = every acceptance criterion needs a named automated test before `status: ready`
          (`/refine` writes the AC -> test mapping into `## Acceptance Tests`) and a passing
          one before `status: done`. A criterion that genuinely cannot be automated is
          declared `manual residue` with a reason and blocks nothing.
-->

ui-acceptance-required: true
<!--
  true  = a criterion describing something the USER does is proven through the real surface,
          the `e2e` command from `## Verify`. A console command, a direct call into an internal
          module, or a renderer test with a faked backend is not a substitute. Criteria without
          a surface (core logic, IPC, parsing) are covered by `test`.
-->

manual-residue-allowed: true
<!--
  true  = a criterion that cannot be automated for a real reason (an OS signature dialog, a
          specific machine, a paid external service) is marked `manual residue: <reason>`.
          Listed in the sprint review and the roadmap's Gaps/notes; blocks nothing.
          Known residues in this project: story 034's start/stop behaviour against a real
          llama.cpp install, and story 031's SmartScreen warning on an unsigned build.
-->

testplan: optional
<!--
  optional = `/sprint` writes `testplan.md` only for criteria marked `manual residue`, and
             skips the file entirely when there are none. `required` = the old full plan,
             `off` = never. In no case is `testplan.md` an acceptance gate — the tests are.
-->

## Context to read before coding

Files every implementation and review agent must read before touching code.
Keep this short — it is pasted into every subagent prompt.

- CLAUDE.md
- docs/VAULT-FORMAT.md
- src/renderer/styles/gaston/README.md (for any frontend/screen work)

## Notes

<!-- Free text. Never overwritten by setup/update. Project quirks worth knowing. -->

Existing docs under `docs/` (CONCEPT.md, ARCHITECTURE.md, VAULT-FORMAT.md,
MODULE-SCHEMA.md) are in German, per CLAUDE.md's convention of German comments/docs
with English code identifiers. `doc-language` here is set to `en` regardless — the
user has decided generated ai-scrum artifacts (stories, sprints, concepts) will be
English, with a migration of the existing German docs to English planned as separate
future work. Do not treat the language mismatch as a setup error.

`branch-base` is set to `dev`, but no `dev` branch exists yet in this repo (only
`main`). `/ai-scrum:sprint` will need to create it off `main` the first time it cuts
a sprint branch.
