---
id: 025
title: A screenshot run never reads my real session data
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

`npm run seed` builds a self-contained demo vault so screenshots and smoke runs never touch
what I actually wrote. It does that job for Claude Code sessions — `claudeProjectsDir` is
pinned to a directory inside the demo vault
([scripts/seed/internal.mjs:82](../../scripts/seed/internal.mjs#L82)) — and not for Codex. So a
screenshot run reads my real `~/.codex/sessions`.

That is a privacy leak in the one place the project has decided must not have one: guardrail 6
says my content never lands in the repo, in logs or in a screenshot. Screenshots go into
`.screenshots/`, get looked at during review, and can end up attached to a review document. The
Sessions tab has read both CLIs since story 008, so a run today puts my real project names and
session titles on those PNGs.

The gap is pre-existing (from story 001, surfaced by 008) and has never been the subject of a
story. It is not a feature — it is the seed script keeping the promise it already makes for the
other CLI.

What I want to be able to trust: after `npm run seed`, nothing the app reads points outside the
demo vault. Not "probably nothing" — the run should be able to tell me.

## Acceptance Criteria

- [ ] After `npm run seed`, a screenshot or smoke run reads Codex sessions from inside the demo
      vault only. My real `~/.codex/sessions` is never opened.
- [ ] The Sessions tab in a screenshot run shows demo sessions for **both** CLIs, so the tab is
      actually screenshotable without my data on it.
- [ ] Both CLIs are seeded from the same place in the script — no second, differently-shaped
      mechanism for the second one.
- [ ] If a future setting points outside the demo vault, the seed run says so instead of
      silently reading it.
- [ ] Nothing about how the app behaves against a real vault changes — this is the seed and
      screenshot path only.

## Open Questions

1. **Is `claudeProjectsDir`/Codex the whole surface?** Are there other settings the seed leaves
   at their real-machine default (Ollama host, model paths from 019a/019c, reminder
   notification state)? The list should be established, not guessed.
2. **What shape should the guard take** — an assertion in the seed script, a check in
   `scripts/shot.mjs` before it starts the app, or a test? Cheapest thing that actually
   catches it.
3. **Should the demo Codex sessions be new fixture content or a copy of the Claude ones**
   reshaped to the Codex format? Affects how much fixture text this story has to write.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
