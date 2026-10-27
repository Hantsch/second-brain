---
id: 095
title: A task can be routed to the agent instead of a model
status: done # draft -> ready -> in-progress -> done
created: 2026-10-27
---

## Requirement

Task routing (Settings, "Aufgaben-Routing") offers a provider/model or "no model" per task. The user
wants a third target: **Agent**. A task routed to the agent is not run through the `LlmGateway`;
Gaston files it as a job in `.secondbrain/agent/jobs/` and the agent (Claude Code, Codex) works it the
next time it runs the `gaston-jobs` skill. The result comes back through `.secondbrain/agent/results/`
and is shown as a proposal, like any model answer — the human still confirms (guardrail 2).

Selectable for all 14 tasks. The folder layout and the `gaston-jobs` skill already exist; the job and
result formats are announced there as "follow in later versions" — this story defines them.

## Acceptance Criteria

<Sketch for refine — rewrite as numbered, observable criteria.>

- [ ] **AC1** — Every task row in the routing table offers "Agent" next to the providers and
      "no model"; the choice persists in settings and survives a restart.
- [ ] **AC2** — Triggering a task routed to the agent writes exactly one job file with kind, input
      references (vault paths, no inlined journal content beyond what the task needs) and creation time;
      no LLM request is made.
- [ ] **AC3** — The UI states honestly that the job is waiting for the agent (no spinner, no dead
      screen); the heuristic fallback, where the task has one, still applies meanwhile.
- [ ] **AC4** — A `done` result for a job surfaces as a proposal the user can accept or reject; nothing
      is written to the vault before acceptance. `failed` / `skipped` show the agent's reason.
- [ ] **AC5** — The `gaston-jobs` skill template documents every job kind and the result format; its
      template version is bumped so the Agent tab offers the update.
- [ ] **AC6** — "Test" on an agent-routed row checks that the agent setup is installed instead of
      calling a model.
- [ ] **AC7** — "Automatisch zuordnen" never assigns "Agent" on its own.

## Open Questions

- **Q1 — Job identity.** Re-triggering the same task on the same input: new job or reuse the open one?
- **Q2 — Stale jobs.** Does a job expire, and can the user cancel it from the UI?
- **Q3 — Short tasks.** Titel und Tags / Treffer sortieren are synchronous today; with the agent they
  become asynchronous. Is the heuristic result shown first and replaced later, or does the field stay
  empty until the result arrives?

## Decisions (Sprint)

- **Q1** — Same task on the same input reuses the open job: the job id is `<task>-<sha256 of task,
  messages, schema>`.
- **Q2** — No expiry and no cancel button in this story. A finished job stays answered; a result the
  user does not want is deleted from `results/` by hand.
- **Q3** — Generic, no per-task code: the first call files the job and reports `agent-pending`, so every
  caller shows its existing fallback or honest state. The next call with the same request returns the
  agent's result as the answer, which the caller presents as a proposal as before.
- The agent route is the reserved `ModelRef` `{ providerId: 'agent', model: 'agent' }`
  (`AGENT_ROUTE`), so settings, IPC and the routing table carry it unchanged.

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done

- `src/core/agent/jobs.ts` — job/result format, job id, fs store; `RoutingGateway` takes `agentJobs`.
- Routing table: "Agent (job)" in every row, hint line, no model test; auto-assign skips agent rows.
- New `LlmUnavailable` reasons `agent-pending` / `agent-failed` with their own sentences.
- `gaston-jobs` skill v2 documents the `llm-task` job kind and the result format.
- Tests: `tests/core/agent/jobs.test.ts`, `tests/renderer/routing-table.test.tsx`.
