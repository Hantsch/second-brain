---
id: 077
title: Gaston notices a new version
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

Once [[076]] publishes releases, someone who installed Gaston once has no way of learning that a
newer one exists. Gaston has to find out for them: once a day, at startup, quietly, and then hold
that knowledge until the user decides what to do with it ([[078]]).

Quietly is the requirement, not a nicety. A check that fails — no network, GitHub down, a rate
limit — must cost the user nothing: no dialog, no toast, no delayed startup, no retry storm.
Gaston is useful offline; if it cannot reach the update feed it starts exactly as before. A check
must not run more than once a day just because the app was restarted six times, and must not run
at all in development, where the version is whatever the working tree says.

The check talks to GitHub's release feed and nothing else, and sends nothing but what that request
needs — no vault content, no settings, no keys (guardrail 6).

Both distributions check: the NSIS install and the portable exe. They differ only in what the user
can do with the answer ([[078]]); knowing that an update exists is the same for both, and the state
says which distribution is running.

This story is the knowledge, not the act. Downloading, installing and restarting belong to
[[078]]; showing the notes in About belongs to [[079]]. Reference: `../q2-launcher` story 097
(`src/main/services/update/checker.ts`, `store.ts`, `src/shared/types/update.ts`), built on
`electron-updater`.

## Acceptance Criteria

- [ ] **AC1** — On startup, Gaston checks for a newer published release at most once per 24 hours;
      further starts within that window reuse the last result instead of checking again.
- [ ] **AC2** — When the published release is newer than the running version, Gaston holds an
      "update available" state carrying that version and its release notes; when it is not, the
      state says up to date.
- [ ] **AC3** — A failed check (offline, error response, malformed feed) leaves a state carrying the
      reason, shows the user nothing by itself, and does not delay or block startup.
- [ ] **AC4** — A failed check does not burn the daily window: the next start may check again.
- [ ] **AC5** — No check runs in development, in an unpackaged build, or in demo mode.
- [ ] **AC6** — The state says whether the running copy is the installed or the portable build.
- [ ] **AC7** — The renderer can read the current update state and be told when it changes,
      through the channels in `src/shared/ipc.ts` — no network access and no version comparison in
      the renderer.
- [ ] **AC8** — The user can trigger a check by hand at any time, independently of the daily
      window, and sees its outcome (including a failure reason).
- [ ] **AC9** — The check result survives a restart, persisted in `userData` (never in the vault).

## Open Questions

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
