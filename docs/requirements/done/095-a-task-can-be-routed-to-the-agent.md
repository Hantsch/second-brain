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

- [x] **AC1** — Every task row in the routing table offers "Agent (job)" next to the providers and
      "no model"; picking it stores the agent route in the vault settings, and it is still the
      task's route after the vault is opened again.
- [x] **AC2** — Triggering a task routed to the agent writes exactly one job file
      `.secondbrain/agent/jobs/<task>-<hash>.json` with `version`, `kind: "llm-task"`, `task`,
      `createdAt` and the task's prompt messages (plus `schema` for structured tasks) — nothing beyond
      what a model would have received; triggering the same request again files no second job; no
      provider is called.
- [x] **AC3** — While the job waits, the screen is never dead: a caller that reports the failure shows
      "waiting as a job for the agent" (journal coach line, shared error sentence), and a caller with a
      heuristic fallback (e.g. filing a dump) shows its heuristic result.
- [x] **AC4** — Once `results/<id>.json` holds `status: "done"`, the next trigger of the same request
      shows the agent's answer as a proposal; nothing is written to the vault before the user accepts
      it. A `failed` / `skipped` result surfaces with the agent's reason quoted in the error sentence.
- [x] **AC5** — The shipped `gaston-jobs` skill documents the `llm-task` job kind, its fields and the
      result format (`done` / `failed` / `skipped`); its template version is higher than the v1 that
      vaults have installed, so the Agent tab offers the update.
- [x] **AC6** — "Test" on an agent-routed row checks whether the agent setup (`gaston-jobs` skill) is
      installed and says so — it calls no model and files no job.
- [x] **AC7** — "Automatisch zuordnen" never proposes "Agent" and never proposes replacing a task's
      agent route.

## Open Questions

- **Q1 — Job identity.** Re-triggering the same task on the same input: new job or reuse the open one?
  → answered under Decisions.
- **Q2 — Stale jobs.** Does a job expire, and can the user cancel it from the UI? → answered under
  Decisions.
- **Q3 — Short tasks.** Titel und Tags / Treffer sortieren are synchronous today; with the agent they
  become asynchronous. Is the heuristic result shown first and replaced later, or does the field stay
  empty until the result arrives? → answered under Decisions.

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
- The job inlines the task's prompt messages instead of vault-path references — the prompt is exactly
  what the task needs, while paths would let the agent read more than the task needs.
- A prompt that embeds today's date (e.g. `classify-dump`) files a fresh job on the next day — accepted,
  because the id must follow the request so a stale answer is never served for a changed prompt.
- "Test" on an agent row is kept (AC6) and reports the `gaston-jobs` skill's install state; the
  `agent-route` "nothing to test" reason it replaces is removed, since main no longer returns it.
- An agent row shows no sensitivity warning — Gaston cannot know which model the agent runs — but the
  task keeps its "Personal" badge, so the sensitivity stays visible.
- The agent's `failed` / `skipped` reason is quoted in the shared error sentence only; callers with a
  heuristic fallback keep showing the fallback (Q3), so the reason has one place, not one per screen.
- AC7's "never proposes Agent" half needs no test of its own: the recommender only picks from
  configured providers, and the agent is none — the routing-diff test proves the other half.
- The e2e flow uses the journal coach line for the waiting state because it is the existing surface
  that names `agent-pending`; the seeded vault has no agent setup, so it walks the "not installed" Test.

## Plan

The routing, job store, gateway branch, skill v2 and most tests landed in c90c483. What is missing:

1. **Test on an agent row (AC6)** — main: `runTestTask` reads the agent setup state instead of
   returning `agent-route`; renderer: the Test button shows on agent rows, with an agent-specific
   result sentence.
2. **Agent's reason in the error sentence (AC4)** — `llmUnavailableCause` carries the `detail`,
   `ErrorState` passes it as `{reason}` into the `agent-failed` sentences.
3. **Proof tests (AC1, AC3, AC4, AC5)** — the round trip through the real capture handlers, settings
   persistence across a reopen, and the shipped skill content/version.
4. **E2E flow + CHANGELOG** — one flow through Settings → Models and the journal; one `Unreleased`
   entry.

Order: D1 → D2 (D2 renders what D1 returns); D3 and D4 independent; D5 last.
No systems doc covers routing (`docs/systems/` only has `navigation.md`), so no doc update.

## Deliverables

- **D1 — Main: "Test" on an agent route checks the agent setup.** In `src/main/llm-bridge.ts`,
  `runTestTask`: when `isAgentRoute(gateway.routeFor(task))`, read
  `readSetupState(services.requireStore())` (`@core/agent/setup-status`, as `src/main/ipc/agent-setup.ts`
  does) and find the file whose path is the `gaston-jobs` skill (`AGENT_SKILLS.jobs` in
  `src/shared/types/agent-setup.ts`). Installed (status not `missing`) → `{ ok: true, latencyMs: 0,
sample: '' }`; otherwise `{ ok: false, latencyMs: 0, sample: '', error: 'agent-setup-missing' }`. Never
  call the gateway on this path (a test prompt must not land in the job queue). Test in
  `tests/main/llm-bridge.test.ts` › "testing an agent-routed task reports the agent setup and files no
  job" (both branches: with and without the skill installed; assert `.secondbrain/agent/jobs/` stays
  empty).
- **D2 — Renderer: the Test button on agent rows.** `src/renderer/components/RoutingTable.tsx`: render
  the Test button on agent rows too; for an agent row an ok result shows `settings.routing.agentReady`
  instead of `testOk` (no latency), a failure shows `settings.routing.reason.agent-setup-missing`.
  Replace `'agent-route'` in `REASONS` with `'agent-setup-missing'` and drop the
  `settings.routing.reason.agent-route` keys. i18n in `src/renderer/i18n/en-settings-models.ts` and
  `de-settings-models.ts`: `agentReady` ("The agent setup is installed. The job waits for its next
  /gaston-jobs run.") and `reason.agent-setup-missing` ("The agent setup is not installed. Install it
  under Settings → Agent."); German with `„…“` if quoting. Update the existing test in
  `tests/renderer/routing-table.test.tsx` "a row routed to the agent explains the job, drops the model
  test and the sensitivity warning" — its "no Test button" assertion is now wrong per AC6 — into
  "a row routed to the agent explains the job, offers the setup test and drops the sensitivity warning",
  asserting the button is present, `onTest` fires, and both result sentences render.
- **D3 — The agent's reason in the error sentence.** `src/renderer/lib/ipc-error.ts`:
  `llmUnavailableCause` also returns `detail` (string, `''` when absent). `src/renderer/components/ErrorState.tsx`:
  pass it as `reason` in the sentence values. `src/renderer/i18n/en.ts` / `de.ts`: the
  `error.code.llm-unavailable.agent-failed` and `error.about.llm-unavailable.agent-failed` sentences
  quote it (en: `… for “{task}”: “{reason}”`, de with `„{reason}“`). Test in
  `tests/renderer/error-state-llm.test.tsx` › "a failed agent job quotes the agent's reason".
- **D4 — Proof tests through the real handlers (no production code expected).**
  - `tests/main/capture-flow.test.ts` › "a dump routed to the agent is filed by heuristic, then by the
    agent's answer once it is accepted": route `classify-dump` via `llm:setRoute` to
    `{ providerId: 'agent', model: 'agent' }`; dump + propose → heuristic proposal and exactly one file in
    `.secondbrain/agent/jobs/` (no provider exists, so none is called); write
    `.secondbrain/agent/results/<same id>.json` `{ "status": "done", "text": <verdict JSON targeting a
seeded project> }` (mirror the verdict of "nimmt einen angelegten Provider samt Route …"); propose
    again → proposal carries the agent's target; no vault file outside the dump and `.secondbrain/`
    changed; accept → filed into the agent's target. Reuse the file's existing `app` harness.
  - `tests/main/llm-ipc.test.ts` › "keeps a route to the agent through a reopen of the vault":
    `llm:setRoute` with the agent route, open the same vault in a fresh settings store, the task's route
    is still the agent route.
  - `tests/core/agent/jobs.test.ts` › "the shipped gaston-jobs skill documents the llm-task job and every
    result status, and a v1 install is offered the update": the template from
    `src/core/agent/templates/skills.ts` contains `llm-task`, the job fields, `done`, `failed`,
    `skipped`; `readSetupState` against a store whose manifest says v1 reports it `outdated`
    (mirror `shippedWith`/`install` in `tests/core/agent/setup.test.ts`).
- **D5 — E2E flow + changelog.** New `tests/e2e/agent-task-route.spec.ts` (`specId:
'agent-task-route'`, no fake provider; selectors as in `tests/e2e/settings-models-dead-end.spec.ts`,
  `#routing-select-<task>`): Settings → Models → select "Agent (job)" in the `journal-chat` row → the
  agent hint shows → click Test → the "not installed" sentence shows (seeded vault has no agent setup) →
  the vault's settings file carries the agent route for `journal-chat` → Journal: write an entry that
  triggers the coach reply (`journal:coach`, rendered by `src/renderer/screens/journal/EntryStream.tsx`)
  → the line "The reply is waiting as a job for the agent" shows → exactly one `*.json` in
  `.secondbrain/agent/jobs/` with `kind: "llm-task"`, `task: "journal-chat"`, `createdAt`. Plus a
  `CHANGELOG.md` `## Unreleased` entry: tasks can be routed to the agent as a job; Test on such a row
  checks the agent setup.

## Model Hints

- All Ds default tier.
- Review: → default

## Acceptance Tests

- AC1 → unit `tests/renderer/routing-table.test.tsx` › "offers the agent in every row and hands it back
  as the agent route"; unit `tests/main/llm-ipc.test.ts` › "keeps a route to the agent through a reopen
  of the vault"; e2e `tests/e2e/agent-task-route.spec.ts` › "a task routed to the agent waits as a job
  and its test checks the agent setup"
- AC2 → unit `tests/core/agent/jobs.test.ts` › "files one job with the full request and reports it as
  pending — no model is called" and › "triggering the same request again reuses the open job"; e2e
  `tests/e2e/agent-task-route.spec.ts` › "a task routed to the agent waits as a job and its test checks
  the agent setup"
- AC3 → e2e `tests/e2e/agent-task-route.spec.ts` › "a task routed to the agent waits as a job and its
  test checks the agent setup" (journal line); unit `tests/main/capture-flow.test.ts` › "a dump routed to
  the agent is filed by heuristic, then by the agent's answer once it is accepted" (heuristic first)
- AC4 → unit `tests/main/capture-flow.test.ts` › "a dump routed to the agent is filed by heuristic, then
  by the agent's answer once it is accepted"; unit `tests/core/agent/jobs.test.ts` › "reports a failed or
  skipped result with the agent's reason"; unit `tests/renderer/error-state-llm.test.tsx` › "a failed
  agent job quotes the agent's reason"
- AC5 → unit `tests/core/agent/jobs.test.ts` › "the shipped gaston-jobs skill documents the llm-task job
  and every result status, and a v1 install is offered the update"
- AC6 → unit `tests/main/llm-bridge.test.ts` › "testing an agent-routed task reports the agent setup and
  files no job"; unit `tests/renderer/routing-table.test.tsx` › "a row routed to the agent explains the
  job, offers the setup test and drops the sensitivity warning"; e2e
  `tests/e2e/agent-task-route.spec.ts` › "a task routed to the agent waits as a job and its test checks
  the agent setup"
- AC7 → unit `tests/renderer/routing-table.test.tsx` › "a model proposal never replaces a task routed
  to the agent"

Coverage: AC1 D4+D5 (+c90c483) · AC2 c90c483, D5 · AC3 D4+D5 · AC4 D3+D4 · AC5 D4 (+c90c483) ·
AC6 D1+D2+D5 · AC7 c90c483.

## Done

- Job store, gateway branch, routing table "Agent (job)", skill v2 landed in c90c483; this pass adds the rest: "Test" on an agent row checks the `gaston-jobs` install state (no model, no job), the agent's `failed`/`skipped` reason is quoted in the error sentence, proof tests through the real handlers, an e2e flow and a CHANGELOG entry.
- `ProposalCache.resolve` (`src/main/ipc/capture.ts`) no longer caches a heuristic proposal while `classify-dump` is routed to the agent, so the next propose can pick up the agent's result (AC4).

Commit message: `095: agent route - setup test on agent rows, agent reason in error sentence, no heuristic caching while a job waits, e2e flow`

Verification (narrow gate): format:check, lint, typecheck, build green; `npx vitest run --changed HEAD` green (107 files, 1566 tests); `npx playwright test tests/e2e/agent-task-route.spec.ts` green. AC -> test mapping verified as in `## Acceptance Tests`, all named tests ran and passed. No manual residue. Review (default tier, 1 cycle): PASS.

Decisions:
- The planned "no production code" D4 needed one production fix in `capture.ts` (see above); the reviewer judged it needed and correct.
- The CHANGELOG has `### Added` only, no Features/Fixes headings; entry placed first, matching the newest-first order.
- Unfixed review notes (minor, accepted): the skill-content test's generic `toContain` terms are weak but 'llm-task', 'createdAt', 'messages', 'schema', 'failed', 'skipped' carry the proof; the llm-bridge test mocks `readSetupState` (e2e covers the missing branch against a real vault); an `agent-failed` without a reason renders empty quotes, unreachable because core always sets the reason.

tiers: D 5 / hard 0 · review default · cycles 1 · agents 7
