# Roadmap

The one source of status and planning: where we stand, what comes next, what is not planned yet.

As of: 2026-10-27.

## Where we stand

- S22 done 2026-10-27 (M21 complete): 093, 094, 095 and 080 are built on `dev` — [S22 review](sprints/S22/review.md).
- Waiting on the user: the adversarial pass on the shell guard (093 AC1, [testplan](sprints/S22/testplan.md)) before any release.
- Waiting on the user: the `sprint/S17`–`S20` → `dev` merges and the first real release.
- Next: `/sprint S23` — M22, all seven stories from the 2026-10-27 tests review (096–102).

Rules:

- Milestone granularity; story truth lives in `requirements/`, sprint detail in `sprints/`.
- Concepts are timeless (what/why); when/status lives only here.
- A milestone is `done` when all its stories are done; acceptance runs through automated tests.

## Phase overview

| Phase                | Milestones done / total | Status      |
| -------------------- | ----------------------- | ----------- |
| 1 — Usable every day | 20 / 22                 | in progress |
| 2                    | —                       | not defined |

## Current phase: 1 — Usable every day

| #   | Milestone                                                      | Status          | Sprints                                                               | Note                                                       |
| --- | -------------------------------------------------------------- | --------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| M1  | Navigation: places, actions, systems                           | accepted        | [S01](sprints/done/S01/review.md) · [S02](sprints/done/S02/review.md) | Rail down to seven entries.                                |
| M2  | Projects answer where I left off                               | accepted        | [S03](sprints/done/S03/review.md)                                     |                                                            |
| M3  | The journal becomes one thing                                  | accepted        | [S04](sprints/done/S04/review.md)                                     |                                                            |
| M4  | A finding can be acted on                                      | done            | [S05](sprints/done/S05/review.md)                                     |                                                            |
| M5  | Models without expertise                                       | accepted        | [S06](sprints/done/S06/review.md)                                     | 019d (subscription providers) rejected.                    |
| M6  | Journal loose ends                                             | done            | [S05](sprints/done/S05/review.md)                                     | Rode along in the M4 sprint.                               |
| M7  | A maintenance run I can see, stop and continue                 | accepted        | none                                                                  | Built on `dev` without a sprint.                           |
| M8  | A loose end is its own thing, not a wait                       | accepted        | none                                                                  | Built on `dev` without a sprint.                           |
| M9  | The gate is green and the small things are right               | done            | [S07](sprints/done/S07/review.md)                                     |                                                            |
| M10 | A model that fits this machine, and an app I can hand on       | done            | [S08](sprints/done/S08/review.md)                                     |                                                            |
| M11 | A local engine for a machine that is not mine                  | done            | [S09](sprints/done/S09/review.md)                                     | Story 034 live check waits for a weak test machine.        |
| M12 | An area gathers itself                                         | done            | [S10](sprints/done/S10/review.md)                                     |                                                            |
| M13 | Evidence stays primary, and the gate turns green               | done            | [S11](sprints/done/S11/review.md)                                     |                                                            |
| M14 | A project gathers itself                                       | done            | [S12](sprints/done/S12/review.md)                                     |                                                            |
| M15 | The day is one text field                                      | in progress     | [S13](sprints/done/S13/review.md) · [S14](sprints/done/S14/review.md) | Date picker year/month drill-down not cut.                 |
| M16 | Work in flight is visible, and what it proposes is correctable | done            | [S15](sprints/done/S15/review.md)                                     |                                                            |
| M17 | Nothing enters half-true, and nothing trusts more than it must | done 2026-09-25 | [S16](sprints/done/S16/review.md) · [S17](sprints/done/S17/review.md) |                                                            |
| M18 | The vault can grow, and an answer finds its evidence           | done 2026-09-25 | [S18](sprints/done/S18/review.md)                                     |                                                            |
| M19 | Gaston ships and updates itself                                | done 2026-10-20 | [S19](sprints/done/S19/review.md)                                     |                                                            |
| M20 | An agent curates the vault                                     | done 2026-10-27 | [S20](sprints/done/S20/review.md) · [S21](sprints/done/S21/review.md) |                                                            |
| M21 | Release hardening                                              | done 2026-10-27 | [S22](sprints/S22/review.md)                                          | Adversarial guard pass by the user pending before release. |
| M22 | Test lanes you can trust                                       | planned         | [S23](sprints/S23/sprint.md)                                          | Stories 096–102, tests and CI only.                        |

## Open / unprioritised

| Topic                                                         | State                                                                                                             | Next step                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| MCP interface for projects, knowledge and the condensed layer | Outlook only, no requirements ([concepts/condensed-layer.md](concepts/condensed-layer.md) §14).                   | Own `/ai-scrum:concept`             |
| German docs migrated to English                               | Only `docs/MODULE-SCHEMA.md` is still German; it is byte-pinned to `MODULE_SCHEMA_TEMPLATE`, so code changes too. | Own story                           |
| Medication tracker                                            | Postponed at the M15 cut; idea not ripe.                                                                          | Own `/ai-scrum:concept`             |
| Data import merges into an existing day                       | Merge rule agreed (add, never replace), but no import path exists to attach it to.                                | Name the source, then cut one story |
| Phase 2                                                       | Not defined.                                                                                                      | Cut after phase 1 has been used     |

## Follow-ups worth doing

- Close the guard gaps 093 left: relative paths with the cwd inside `modules/gaston-help/`, commands on the parent `modules/` (same for `raw/web`), regression rows for help-dir case / 8.3 / trailing-dot variants, and the .NET vs JS `\d` / `\s` Unicode edge in the wiki heading regex — [S22 review](sprints/S22/review.md)
- Tighten 095's tests: concrete terms in the skill-content test, and let the llm-bridge test use a real `readSetupState` instead of a mock — [S22 review](sprints/S22/review.md)
- Update install: revoke the quit grant after a successful `quitAndInstall`, treat a missing or differently formatted feed version as unknown rather than superseded, stop a stale `check.isError` overriding later event state, and bring `close-guard.ts` (~312 lines) under 300 — [S22 review](sprints/S22/review.md)
- Pull the repeated `isRecord` / non-empty-string helpers in `src/core/agent/` into one module and split `condense-source-job.ts` and `CondensedUnitPanel.tsx` under 300 lines — [S21 review](sprints/done/S21/review.md)
- Give agent job ids sub-second resolution, and show an agent `skipped` result's reason in the condensed panel — [S21 review](sprints/done/S21/review.md)
- Split `src/main/ipc/condense.ts` (312 lines), extract the third copy of `reasonOf`, drop the unused `moduleSlugFromOverviewPath` — [S20 review](sprints/done/S20/review.md)
- Make `pages.ts` resolve a page whose `slug:` differs from its file name to the same graph ref — [S20 review](sprints/done/S20/review.md)
- Point the gardener's orphan fix at a module's `index.md`, not at `## Seiten` in the condensed `overview.md` — [S20 review](sprints/done/S20/review.md)
- Update [concepts/vault-agent.md](concepts/vault-agent.md) (AGT-1 and §12: Agent tab is `PATH`-only, derived index and chats are protected like `journal/`) — [S20 review](sprints/done/S20/review.md)
- Widen the Agent tab tests: About-text e2e checks every sentence; default `PATHEXT` and `UNKNOWN` branches of `cli-presence.ts` — [S20 review](sprints/done/S20/review.md)
- Add the `agent/` row to `docs/ARCHITECTURE.md` — [S20 review](sprints/done/S20/review.md)
- Fold the duplicated `settle` / status-set shapes in `agent-setup.ts` into one; unify `indexFile` with `indexBody` in the help module — [S20 review](sprints/done/S20/review.md)
- Mount the real terminal section in `settings-agent-tab.test.tsx`, show a failed setup lookup as its own sentence, report an unstable-slug module as such — [S20 review](sprints/done/S20/review.md)
- Stop `tests/core/ingest/queue.test.ts` timing out once under full-suite load (isolate the wait, not a longer timeout) — [S20 review](sprints/done/S20/review.md)

## History

No phase is complete yet; phase 1's milestones are listed under the current phase.
