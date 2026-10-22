---
sprint: S20
status: in-progress # planned | in-progress | done
branch: sprint/S20
milestone: M20 — An agent curates the vault
---

# Sprint S20 — A module condenses itself, and Claude Code works safely in the vault

## Goal

At the end of this sprint a module's `wiki/overview.md` is its condensed artifact: started in the
module view, confirmed as a diff, never touched by an ingest again. Settings has an Agent tab that
shows whether Claude Code is installed, installs and updates a marked, versioned setup in the vault
(`CLAUDE.md`, deny rules, skills, hooks) that keeps the agent out of `journal/` and off `raw/`,
ships a help module Ask can cite, and opens a terminal in the vault with `claude` and a skill
already typed.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 081 — A module condenses itself
- [x] 082 — The ingest leaves the overview alone
- [ ] 083 — Settings has an Agent tab
- [ ] 084 — Gaston installs and updates the agent setup
- [ ] 085 — The agent cannot read the journal or touch raw
- [ ] 086 — Gaston explains itself from the vault
- [ ] 087 — Open Claude in the vault from Gaston

## Notes

- **Concepts:** [concepts/vault-agent.md](../../concepts/vault-agent.md) (AGT-1 to AGT-8,
  AGT-19 to AGT-22) and the module level of
  [concepts/condensed-layer.md](../../concepts/condensed-layer.md) (CND-2, CND-35, CND-36).
- **Decided at the cut (2026-10-22, user):**
  - As few sprints as possible: the whole vault-agent concept in two sprints (S20, S21); seven
    stories here is above the 3–6 guideline, with S18's eight as precedent.
  - Vault-agent O7: the module level of the condensed layer is **built in this milestone**, not
    deferred — 081/082 here, so that S21's condense-module job (092) has its artifact.
- **Order:** 081 before 082 (082's AC4 needs the module diff). 083 before 084 (the tab hosts the
  setup), 084 before 085/086/087 (marker/version mechanism, skill names, `.secondbrain/` layout).
- **Fixed in 084, read by everything after:** the folder layout under `.secondbrain/` for jobs,
  results, proposals and reports, and the skill names. S21 depends on them — record both in 084's
  `## Decisions (Sprint)`.
- **085 has a hard deliverable:** the shell hook has to hold on Windows; a false allow leaks the
  journal to a cloud model. Verify the deny/hook syntax against the current Claude Code docs at
  refine, not from memory.
- **No real CLI in tests.** Tests never start `claude`; CLI detection and the terminal launch go
  through a fake in `tests/fakes/`. Opening a real terminal window is a candidate manual residue
  for 087.

## Regression gate

<!-- Filled by `/sprint` phase 2b: the commands run, minutes taken, result, commit, and a verdict per failure. -->
