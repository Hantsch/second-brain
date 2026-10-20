---
id: 076
title: A release ships from a changelog
status: draft # draft -> ready -> in-progress -> done
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

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
