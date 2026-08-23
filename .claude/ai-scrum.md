# AI Scrum — Project Profile

<!--
  Managed by the ai-scrum plugin. Safe to edit by hand — `/ai-scrum:setup` only
  rewrites values you confirm, and never touches your `## Notes`.

  This file holds FACTS the workflow commands need verbatim (verify commands, paths,
  branch strategy). Project RULES and architecture guardrails stay in CLAUDE.md —
  the commands read both.
-->

ai-scrum-version: 2.1.1
project: Gaston

## Verify

Commands the build step runs before a story may be called done. Use `none` when a
step does not exist in this project.

build: npm run build
test: npm test
lint: npm run lint
typecheck: npm run typecheck

## Conventions

doc-language: en <!-- language for generated artifacts: stories, sprint reviews, concepts -->
requirements-path: docs/requirements
sprints-path: docs/sprints
roadmap-path: docs/ROADMAP.md
concepts-path: docs/concepts
systems-path: docs/systems
story-id-format: NNN <!-- three digits + slug, e.g. 042-npc-haggling.md -->
sprint-id-format: SNN <!-- e.g. S07 -->

## Branching

branch-base: dev <!-- branch a sprint is cut from -->
sprint-branch-pattern: sprint/{id}
auto-commit-per-story: true <!-- /ai-scrum:sprint commits once per story ON THE SPRINT BRANCH only -->
protected-branches: main, dev <!-- never commit here, never push, never merge -->

## Acceptance

ui-acceptance-required: true
<!--
  true  = P1 applies: every user-facing capability needs a real path through the
          actual UI. An acceptance or test-plan step for a user action that requires
          a console command or a direct internal call is a story gap, not a valid
          test. Pure engine/backend stories without a UI are exempt.
-->

live-smoke-required: true
<!--
  true  = P2 applies: for a story with visible UI, a green build/test run is not
          enough — the real flow must be driven through the running app before the
          story may be set to done. If the session cannot do that, the story stays
          in-progress and is handed over as "built, acceptance pending".
-->

live-smoke-how: npm run seed && npm run shot (Playwright `_electron` harness in scripts/shot.mjs, screenshots land in .screenshots/)

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
