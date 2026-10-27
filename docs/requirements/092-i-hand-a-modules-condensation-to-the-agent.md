---
id: 092
title: I hand a module's condensation to the agent
status: ready # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

With the module level of the condensed layer in place ([[081]]), the condensation is the kind of
work a strong model does better than a weak local one. The user can hand it to the agent instead
of running `condense-module` through the gateway (concept §10, AGT-16).

The condensed-layer concept wins over "the wiki layer is direct": `overview.md` is a
diff-confirmed artifact, so the agent's result is a proposal, never a direct write — and the deny
rule from [[085]] already keeps the agent's file tools off it. The proposal is confirmed where
every module condensation is confirmed: in the module view, with the same diff, accept and
reject-with-reason as [[081]] (CND-37), not in Maintenance. Job format and validation come from
[[090]].

## Acceptance Criteria

- [ ] **AC1** — The module view offers "Hand to agent" next to "Condense"; one click writes exactly
      one condense-module job.
- [ ] **AC2** — "Hand to agent" is available when no model is configured for `condense-module`.
- [ ] **AC3** — A valid result appears in the module view as the same diff an in-app run produces;
      nothing is written before the user accepts.
- [ ] **AC4** — Accepting and rejecting behave exactly as in [[081]]: hash guard, undo copy,
      reason appended to the directives section.
- [ ] **AC5** — A result missing a section, a section's source line, or citing a path that is not a
      page of the module shows the job as failed with the reason, and no diff is offered.
- [ ] **AC6** — If `overview.md` changed between handing over and the result, the job shows as
      failed with that reason.
- [ ] **AC7** — The installed job-queue skill describes the condense-module kind, including the
      directives section as an instruction it never writes to; the template test pins it.

## Open Questions

- ~~**Q1 — Two pending condensations.** What happens when the user starts an in-app condensation while a condense-module job for the same module is with the agent — block, replace, or allow both and let the hash guard decide?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Two pending condensations: block the in-app condensation with a clear message while a condense-module job for the module is with the agent.
- The job, result, pickup, Tasks-screen state and withdrawal machinery are [[090]]'s; this story only
  adds the `condense-module` kind to it, and the Ds name 090's pieces by role because 090 is refined
  in the same sprint and builds before 092 — `/build` takes the concrete names from 090's Done section.
- A dedicated `condense-module` job kind, not 095's generic `llm-task` route, because AC7 asks the
  skill to describe this kind and AC6 needs the overview hash at hand-over inside the job.
- The job carries the module slug, the input page paths (`moduleInputs()` at hand-over) and the
  overview's hash at hand-over (`null` when the file is absent); it never inlines page content, so the
  agent reads the pages itself (095 AC2: input references, not content).
- The result body carries one fenced `json` block in exactly the shape of `CONDENSE_MODULE_SCHEMA`
  (`decided`/`open`/`contradictions`, each `{ text, sources }`), because then the in-app validators
  (`readReplySections`, `attributionProblems`) and composition run unchanged and AC3's "same diff"
  holds by construction.
- Gaston composes `overview.md`, never the agent: headings follow the document language and the
  directives section, unknown keys and title are carried over by the same code as an in-app run.
- Allowed citations = the job's listed paths that are still pages of the module at validation time;
  `sources:`/`source_hashes` record that set with current hashes, so a page added after the hand-over
  is not claimed as read and the due check still flags it.
- The proposal is stored where an in-app proposal is (task result `{ kind: 'condense', proposal }`
  under subject `module:<slug>`), so the module view, accept, reject and the task-result route work
  unchanged; it lives as long as an in-app proposal (the session), the result file stays in `done/`.
- The handed-over job is a `condense` work task with subject ref `module:<slug>` in 090's agent
  state, so the panel's `useTaskForSubject` finds it; Condense is disabled with a "with the agent" line
  (the user's block, visible before a click) and `condense:run` refuses with `invalid` as backstop.
- "Hand to agent" is refused while an in-app condensation of the module is queued or running, the
  mirror image of the user's block, so two runs never race for one overview.
- "Hand to agent" does not depend on the agent setup being installed: the job waits honestly until
  the user runs `/gaston-jobs`, and the Agent screen already says whether the setup is there.
- Withdrawing (090's user decision) applies unchanged: a withdrawn condensation writes nothing and
  lifts the block on Condense.
- The `gaston-jobs` template version is bumped by one relative to its value at build time, because
  090 and 091 bump the same template in this sprint.
- e2e: one new spec file with two tests (one launch); AC6 is proven at main level, because its
  display is the same failed-with-reason path AC5's e2e step already walks.

## Plan

The fourth job kind on 090's format: Gaston writes a `condense-module` job, the agent writes the
three sections into a result, and Gaston turns a valid result into the very proposal an in-app run
produces — validation, composition and confirmation are 081's code, reused.

1. **Core (D1).** Extract the post-reply half of `condenseModule()` (`run-module.ts` l.181-217) into
   `proposalFromModuleReply()`; the in-app run calls it unchanged. New `job-condense-module.ts`:
   build the job payload; validate a result (JSON block, overview hash, sections, citations) into a
   `CondenseProposal` or a failure reason.
2. **Main (D2).** The `condense-module` kind in 090's hand-over channel (module resolved through
   `moduleTarget()`), its result pickup storing the proposal as a `condense` task result, and the
   guard in `condense:run`.
3. **Renderer (D3).** "Hand to agent" next to Condense in the module's condensed tab, also in the
   no-model state; "with the agent" line; i18n; e2e flow; CHANGELOG.
4. **Skill (D4).** `gaston-jobs` describes the `condense-module` kind; mirror doc, version bump,
   template test; VAULT-FORMAT.md names the kind.

Order: D1 → D2 → D3; D4 is independent (any time after 090).

Out of scope: the job/result format itself, Tasks-screen display, withdrawal, retention (all 090);
curate-module at the module (091).

## Deliverables

- [ ] **D1 — An agent's condensation result becomes the in-app proposal (core).** Files:
      `src/core/condense/run-module.ts`, new `src/core/condense/module-reply.ts`,
      `src/core/condense/index.ts`, new `src/core/agent/job-condense-module.ts` (next to 090's
      per-kind job code in `src/core/agent/`). Tests: new
      `tests/core/agent/job-condense-module.test.ts`; `tests/core/condense/run-module.test.ts` stays
      green unchanged.
  - `module-reply.ts`: `proposalFromModuleReply({ reply, inventory, docs, slug, existing, docLanguage,
now, clampedChars })` = `run-module.ts` l.181-217 moved verbatim (missing section → `failed`
    with the same sentence; attribution problems → `attribution-failure`; else the proposal).
    `condenseModule()` calls it after `parseJsonLoose`; its output must stay byte-identical.
  - `job-condense-module.ts`: `condenseModuleJobPayload(docs, slug, overviewText | undefined)` →
    `{ slug, inputs: string[] (moduleInputs paths), baseHash: sha256 | null }`.
    `validateCondenseModuleResult({ job, resultBody, docs, existing, docLanguage, now })` →
    `{ kind: 'proposal', proposal: CondenseProposal }` | `{ kind: 'failed', reason }`, in this order:
    (1) `sha256(existing) ?? null` differs from `job.baseHash` → failed "overview.md changed since it
    was handed to the agent"; (2) no fenced `json` block or unparsable (`parseJsonLoose`) → failed;
    (3) inventory = `moduleInputs(docs, slug)` filtered to `job.inputs`; (4)
    `proposalFromModuleReply(..., clampedChars: 0)`; a `failed` / `attribution-failure` becomes a
    failed reason naming the section and the offending paths. The proposal maps to
    `CondenseProposal` exactly as `outcomeOf()` in `src/main/ipc/condense-unit.ts` does for an in-app
    run (`unit: 'module'`, `before` = existing or `''`, `after` = content, `baseHash`, `sources`).
    English reasons, no vault content beyond paths (guardrail 6).
  - Tests: "a valid agent result becomes the proposal an in-app run would compose" (same reply JSON
    through `condenseModule()` with the fake gateway from `tests/fakes/llm.ts` and a fixed `now` →
    equal `content`); "a result missing a section fails and names the section"; "a section with text
    and no source line fails"; "a result citing a path that is not a page of the module fails";
    "a result after overview.md changed since the hand-over fails with that reason"; "a page added
    after the hand-over is not recorded as read".

- [ ] **D2 — Main hands a module's condensation over and picks the result up.** Files: 090's agent
      job IPC file under `src/main/ipc/` and its shared request type (add `{ kind: 'condense-module',
slug }`), 090's result-pickup dispatch in main, `src/main/ipc/condense.ts`,
      `src/main/ipc/condense-module-target.ts` (reuse `moduleTarget()`, no second slug check). Test:
      new `tests/main/condense-module-agent.test.ts` (harness and vault helpers as
      `tests/main/condense-module-ipc.test.ts` uses them; seed module with stub overview and two pages).
  - Hand-over: resolve the slug via `moduleTarget()` (unknown → `invalid`, nothing written); refuse
    with `invalid` while a `condense` task with ref `module:<slug>` is queued/running; else write the
    job with D1's payload through 090's writer (an open job for the slug → no second file) and start
    090's agent-state work task with kind `condense`, subject `{ label: <module title>, ref:
module:<slug> }` — literally the ref `condense:run` uses.
  - Pickup: for a `condense-module` result with status `done`, read `existing` from disk and docs from
    the index, call D1's validator; proposal → `getTaskResults().put(taskId, { kind: 'condense',
proposal }, { ref })` and the task done with `hasResult`; failed → task failed with the reason;
    nothing is written to the vault either way. Agent `failed`/`skipped` follow 090's generic path.
  - `condense:run` for `unit: 'module'`: before `enqueue`, refuse with `invalid` and the sentence
    "This module's condensation is with the agent." while 090's store has an open condense-module job
    for the slug.
  - Tests: "handing a module's condensation over writes exactly one job and a second click writes
    none"; "an in-app condensation is refused while the module's condensation is with the agent";
    "a valid agent result waits as the module's condense proposal and nothing is written";
    "an agent result for an overview changed since the hand-over fails the job with that reason";
    "accepting an agent proposal after overview.md changed is a conflict and leaves it
    byte-identical"; "rejecting an agent proposal appends the reason to the directives section and
    changes nothing else".

- [ ] **D3 — "Hand to agent" in the module's condensed tab.** Renderer + changelog. Files:
      `src/renderer/screens/modules/ModuleCondensedTab.tsx`,
      `src/renderer/components/condensed/CondensedUnitPanel.tsx` (optional `agentAction?: ReactNode`,
      rendered in the actions row next to Condense **and** under `LlmMissing` in the no-model state;
      when the current task is in 090's agent state: Condense disabled, no spinner, line
      `<keyPrefix>.withAgent` instead of running/waiting; "Hand to agent" is disabled whenever the
      panel's `busy` is true; if the file passes ~380 lines, move the
      actions row into new `CondensedUnitActions.tsx`), the modules i18n de/en files (find via
      `'modules.condensed.`: `handToAgent`, `withAgent` — de with „…“, sentence case),
      `CHANGELOG.md`, new `tests/e2e/module-condense-agent.spec.ts` (mirror
      `tests/e2e/module-condense.spec.ts`; default no-model vault; the test writes the result file
      itself in 090's format, as the agent would). Use 090's hand-over mutation hook; Gaston atoms only.
  - e2e test 1, "with no model a module's condensation is handed to the agent once and its result is
    accepted as a diff": open `#/knowledge?m=second-brain-methodik&tab=condensed`; no-model note and
    "Hand to agent" visible; click → exactly one file in `.secondbrain/agent/jobs/`; the button and
    Condense are disabled, "with the agent" shown, still one job; write a valid result citing seeded
    pages of `scripts/seed/module-methodik-pages.mjs` → diff with removal and addition rows,
    `overview.md` byte-identical; Accept → `overview.md` has `condensed_at` and the three headings,
    `.secondbrain/trash/` holds the previous file.
  - e2e test 2, "an agent result citing a page outside the module fails with its reason and offers no
    diff": hand over, write a result citing `wiki/sources/x.md` of another module → failed reason
    names the path, no diff rows, `overview.md` unchanged, Condense enabled again.

- [ ] **D4 — The jobs skill describes the condense-module kind.** Files:
      `src/core/agent/templates/skills.ts` (`gaston-jobs` body: a `### condense-module` section under
      "Job kinds"; `version` +1), `docs/agent-setup/skill-gaston-jobs.md` (byte-identical mirror),
      `docs/VAULT-FORMAT.md` (the agent jobs section 090 adds: the kind and its fields),
      `tests/core/agent/templates.test.ts`.
  - The section says: the job names a module slug, its page paths and the overview hash; read every
    listed page and `modules/<slug>/wiki/overview.md` — its directives section is an instruction to
    follow and is **never written**, nor is `overview.md` itself; the result body is one fenced `json`
    block `{ "decided": {text, sources}, "open": …, "contradictions": … }`; every section with text
    cites only listed paths; contradictions between pages are named, never resolved; compress, do not
    append; if it cannot be done, write `failed` with the reason.
  - Test: "the jobs skill describes the condense-module job and never writes the directives section"
    (asserts the kind, the three keys and the never-write sentence); the existing mirror test pins the
    body.

## Model Hints

- D1 → deliverable-hard: it moves the composition half of the shipped in-app `condenseModule()` into
  a shared function while the new agent path must take its base hash and citation set from the job,
  not the run — a slip either changes in-app proposals byte-wise or lets a stale or foreign-cited
  result through as a valid diff.
- Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/module-condense-agent.spec.ts` › "with no model a module's condensation is
  handed to the agent once and its result is accepted as a diff"; unit
  `tests/main/condense-module-agent.test.ts` › "handing a module's condensation over writes exactly
  one job and a second click writes none".
- AC2 → e2e same test (runs on the no-model vault; the button is used under the no-model note).
- AC3 → e2e same test (diff shown, `overview.md` byte-identical until Accept); unit
  `tests/core/agent/job-condense-module.test.ts` › "a valid agent result becomes the proposal an
  in-app run would compose"; unit `tests/main/condense-module-agent.test.ts` › "a valid agent result
  waits as the module's condense proposal and nothing is written".
- AC4 → e2e same test (Accept: trash copy); unit `tests/main/condense-module-agent.test.ts` ›
  "accepting an agent proposal after overview.md changed is a conflict and leaves it byte-identical"
  and › "rejecting an agent proposal appends the reason to the directives section and changes nothing
  else".
- AC5 → e2e `tests/e2e/module-condense-agent.spec.ts` › "an agent result citing a page outside the
  module fails with its reason and offers no diff"; unit `tests/core/agent/job-condense-module.test.ts`
  › "a result missing a section fails and names the section", › "a section with text and no source
  line fails", › "a result citing a path that is not a page of the module fails".
- AC6 → unit `tests/main/condense-module-agent.test.ts` › "an agent result for an overview changed
  since the hand-over fails the job with that reason"; unit
  `tests/core/agent/job-condense-module.test.ts` › "a result after overview.md changed since the
  hand-over fails with that reason".
- AC7 → unit `tests/core/agent/templates.test.ts` › "the jobs skill describes the condense-module job
  and never writes the directives section" and › "every setup template matches its docs mirror".
- User decision (block) → unit `tests/main/condense-module-agent.test.ts` › "an in-app condensation
  is refused while the module's condensation is with the agent"; e2e test 1 (Condense disabled, "with
  the agent" shown).

Coverage gate: AC1 D2/D3 · AC2 D3 · AC3 D1/D2/D3 · AC4 D2/D3 (081's accept/reject reused) · AC5
D1/D2/D3 · AC6 D1/D2 · AC7 D4 — every criterion has a deliverable and a test.

## Done
