---
id: 062
title: Codex work counts as work
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-03
---

From the 2026-09-03 architecture review ([finding 3.6-4](../reviews/2026-09-03-architecture-review.md)),
P2. Evidence: full readers, the session browser, and linking exist for both CLIs
(`src/core/claude/`, `src/core/codex/`, `src/main/ipc/agents.ts:257`), but
`applyExternalTouches` is reached only from `claudeSessions()`
(`src/main/ipc/overview-deps.ts:188`); `codexSessions()` never updates the index;
`dashboardData` takes `ClaudeSession[]` only (`src/core/overview/dashboard.ts:174`) and
`recentWork` emits `kind: 'claude-session'` only (`src/core/overview/recent.ts:200`). The
dashboard reads 20 Claude sessions where the browser reads 100
(`src/main/ipc/overview-deps.ts:36` vs `src/main/ipc/agents.ts:42`).

## Requirement

"What did I last work on, and where did I leave off?" is the first of the three questions the
app exists to answer. For work done through Claude Code it answers well. For work done through
Codex — which the app already reads, lists, and links to projects in the session browser — it
answers wrongly: a Codex session never counts as a project's last touch, so a project worked on
exclusively via Codex still shows as stale, still triggers the stale-project reminder, and never
appears in recent work. The dashboard actively misreports exactly the thing it is for.

Everything that treats an agent session as a work trace — recent work, last touch, staleness,
the sessions tile — should treat both CLIs the same. The plumbing exists; only the overview
wiring is Claude-shaped.

## Acceptance Criteria

- [ ] A Codex session in a linked repo updates the project's last touch and suppresses the
      stale-project reminder, exactly as a Claude session does.
- [ ] Recent work on the dashboard shows Codex sessions, labeled by their agent kind.
- [ ] The sessions tile and counts include both kinds.
- [ ] The dashboard/browser session-limit asymmetry is either removed or justified in a comment
      where the limits live.
- [ ] Tests cover a project whose only recent work is a Codex session: not stale, present in
      recent work.

## Open Questions

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
