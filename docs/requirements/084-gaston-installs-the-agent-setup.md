---
id: 084
title: Gaston installs and updates the agent setup
status: draft # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

An agent opened in the vault folder only behaves if the folder tells it how. Gaston knows its own
format, so Gaston writes that frame: a vault-level `CLAUDE.md`, `.claude/settings.json`, the
Gaston skills and the hook scripts (concept §6, AGT-2 to AGT-5). The user never hand-writes them.

`CLAUDE.md` says what the vault is, the three layers, what the agent may write directly (the wiki
layer, always with a `log.md` entry), what goes through a proposal, what it must never touch, where
jobs and proposals live, and points to each module's `AGENTS.md` and to the help module ([[086]]).
It also says that `wiki/overview.md` is the condensed artifact ([[081]]) and changes only through a
proposal, and that the help module is Gaston's and read-only by convention.

Every managed file carries a marker and the template version. A newer Gaston shows "outdated" and
updates on click; files the user created under `.claude/` are theirs and never written. Install
and update show what they will write before writing, like the runtime install dialog.

The deny rules and hooks themselves — what they block and that the block holds — are [[085]]. This
story delivers the mechanism (templates, marker, version, plan, write) and the skill set.

## Acceptance Criteria

- [ ] **AC1** — Without a setup, the Agent tab lists every managed file as missing and offers
      "Install".
- [ ] **AC2** — "Install" first shows the list of files it will write; nothing is written until the
      user confirms.
- [ ] **AC3** — After confirming, `CLAUDE.md`, `.claude/settings.json`, the Gaston skills and the
      hook scripts exist in the vault, each carrying the Gaston marker and its template version.
- [ ] **AC4** — When a shipped template is newer than the installed file, the tab shows that file as
      "outdated" and offers "Update"; Update rewrites only marked files that are outdated or
      missing.
- [ ] **AC5** — A file under `.claude/` without the marker is listed as the user's and is
      byte-identical after Install and after Update.
- [ ] **AC6** — Each template is a constant in `src/core/`, pinned by a test to its mirror under
      `docs/` (the `agents-md.ts` pattern).
- [ ] **AC7** — `CLAUDE.md` names the wiki layer as the only direct write target, requires a
      `log.md` entry per direct write, names proposals as the path for everything else, and names
      `wiki/overview.md` and the help module as not directly writable.
- [ ] **AC8** — The setup works on a vault on a removable drive: no absolute machine path appears in
      any installed file.

## Open Questions

- **Q1 — A marked file the user edited.** Overwrite on Update (it is managed), show it as
  "modified" and ask before overwriting, or treat it as the user's from then on? "No write path
  silently overwrites the user's edits" argues against the first.
- **Q2 — Marker in JSON.** `settings.json` has no comments. A Gaston key inside the JSON (if the CLI
  tolerates unknown keys), or a sidecar manifest under `.claude/` listing managed files and versions?
- **Q3 — Skill names and cut** (concept O4): one queue skill plus a curator skill plus a proposal
  skill, or one skill per job kind?
- **Q4 — Folder layout under `.secondbrain/`** (concept O3) for jobs, results, proposals and run
  reports — fixed here because `CLAUDE.md` names it; the formats themselves follow in [[088]] to
  [[090]].

## Decisions (Sprint)

## Plan

## Deliverables

## Model Hints

## Acceptance Tests

## Done
