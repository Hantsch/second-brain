---
id: 078
title: I update when I choose to
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-19
---

## Requirement

[[077]] knows an update exists; the user has to be able to see that and act on it — or not. An app
that updates itself behind the user's back interrupts a capture or a running import, and an app
that only mentions it in a settings tab nobody opens is one nobody updates. The middle is a single,
calm control in the app shell ([AppShell.tsx](../../src/renderer/components/AppShell.tsx)), visible
from every screen, that appears only when there is something to update and says what it is.

The user decides both _whether_ and _when_. On the installed build, choosing to update downloads the
release and then waits — Gaston restarts into the new version only on a second, deliberate
confirmation. On the portable build there is nothing to install in place: the same control opens
the release page in the system browser instead. Dismissing leaves Gaston running exactly as before;
nothing nags again in the same session.

One hard rule: Gaston never restarts itself out from under work the user can see — a task in the
shared queue (maintenance, imports, ingests) or an LLM response being written.

Reference: `../q2-launcher` story 098 (`src/main/services/update/service.ts`, `PendingUpdate.tsx`).

## Acceptance Criteria

- [ ] **AC1** — When [[077]]'s state says an update is available, an update control appears in the
      app shell; when no update is available it is not there at all.
- [ ] **AC2** — The control names the available version before the user commits to anything, and
      offers a way to see what changed ([[079]]'s notes).
- [ ] **AC3** — On the installed build, starting the update downloads the release with visible
      progress, and Gaston stays fully usable while it downloads.
- [ ] **AC4** — A running download can be cancelled; the installed app stays untouched.
- [ ] **AC5** — Nothing is installed and nothing restarts until the user confirms a second time,
      after the download has finished.
- [ ] **AC6** — Dismissing the update leaves Gaston running unchanged and does not show the prompt
      again in the same session; the update stays reachable from About ([[079]]).
- [ ] **AC7** — Install-and-restart is refused, with a readable reason, while a queued task is
      running or an LLM response is streaming — it does not abort either.
- [ ] **AC8** — A failed download (offline, checksum mismatch) leaves the installed app untouched
      and says why, with the update still offerable afterwards.
- [ ] **AC9** — On the portable build the control does not download anything; it opens the
      release's page in the system browser through the existing `shell:openExternal` path.
- [ ] **AC10** — After a successful restart Gaston runs the new version and the update control is
      gone (automated half; the real restart is manual residue).

## Open Questions

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
