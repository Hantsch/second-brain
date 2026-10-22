---
id: 085
title: The agent cannot read the journal or touch raw
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Protection by rules, not by trust (concept §7). With the setup from [[084]] installed, the agent in
the vault cannot read `journal/` and cannot write `raw/`, `CLAUDE.md`, `.claude/`, or anything in
`.secondbrain/` outside the hand-over folders (AGT-6). The only direct write target beyond the
hand-over folders is `modules/*/wiki/`, minus `wiki/overview.md` (the condensed artifact, [[081]]).

`permissions.deny` stops the CLI's file tools but not a `cat journal/…` through the shell
(concept O1). What deny rules cannot express goes into hooks: a pre-tool check on shell commands
that would read `journal/` or modify `raw/`, and a post-write check that a changed wiki page still
has valid frontmatter and that `log.md` got its entry (AGT-7). The hooks must run wherever the CLI
runs, without a Node install inside the vault.

The Agent tab's **Protection** section shows the rules as installed, read back from the vault —
not as Gaston thinks they should be.

## Acceptance Criteria

- [ ] **AC1** — The installed `settings.json` denies reading `journal/**` and writing `raw/**`,
      `CLAUDE.md`, `.claude/**`, `modules/*/wiki/overview.md` and `.secondbrain/**` outside the
      hand-over folders.
- [ ] **AC2** — The pre-tool hook, given a shell command that reads a file under `journal/`, blocks
      it with a reason; given one that only reads under `raw/`, it allows it.
- [ ] **AC3** — The pre-tool hook blocks a shell command that writes, moves or deletes under `raw/`.
- [ ] **AC4** — The post-write hook reports a wiki page written without valid frontmatter.
- [ ] **AC5** — The post-write hook reports a wiki page change in a module whose `log.md` got no new
      entry, and stays silent when it did.
- [ ] **AC6** — The Protection section lists each rule as read from the installed files; a rule
      removed by hand from `settings.json` shows as missing there.
- [ ] **AC7** — Without a setup, the Protection section says that nothing protects the vault yet
      and points to "Install".

## Open Questions

- **Q1 — Hook runtime** (concept O1): shell script, PowerShell, or a script the CLI's own runtime
  executes — what runs on Windows without Node in the vault? Verify against the current CLI
  documentation at refine.
- **Q2 — How far the shell check reaches.** A pattern check on the command line cannot catch every
  indirection (variables, scripts). Is "the obvious paths blocked, the limit documented in the help
  module" acceptable, or must shell access be denied entirely?

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

D (hook scripts) → deliverable-hard: the block has to hold against real command shapes on
Windows, and a false allow leaks the journal to a cloud model.

## Acceptance Tests

## Done
