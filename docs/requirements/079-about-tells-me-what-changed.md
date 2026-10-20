---
id: 079
title: About tells me what changed
status: draft # draft -> ready -> in-progress -> done
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

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
