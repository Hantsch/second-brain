---
id: 084
title: Gaston installs and updates the agent setup
status: done # draft -> ready -> in-progress -> done
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

- [x] **AC1** — Without a setup, the Agent tab lists every managed file as missing and offers
      "Install".
- [x] **AC2** — "Install" first shows the list of files it will write; nothing is written until the
      user confirms.
- [x] **AC3** — After confirming, `CLAUDE.md`, `.claude/settings.json`, the Gaston skills and the
      hook scripts exist in the vault, each carrying the Gaston marker and its template version.
- [x] **AC4** — When a shipped template is newer than the installed file, the tab shows that file as
      "outdated" and offers "Update"; Update rewrites only marked files that are outdated or
      missing.
- [x] **AC5** — A file under `.claude/` without the marker is listed as the user's and is
      byte-identical after Install and after Update.
- [x] **AC6** — Each template is a constant in `src/core/`, pinned by a test to its mirror under
      `docs/` (the `agents-md.ts` pattern).
- [x] **AC7** — `CLAUDE.md` names the wiki layer as the only direct write target, requires a
      `log.md` entry per direct write, names proposals as the path for everything else, and names
      `wiki/overview.md` and the help module as not directly writable.
- [x] **AC8** — The setup works on a vault on a removable drive: no absolute machine path appears in
      any installed file.
- [x] **AC9** — A managed file the user edited shows as "modified"; Update lists it as not written
      unless the user ticks it, and a ticked overwrite leaves an undo copy in `.secondbrain/trash/`.
      _(Added at refine to make the (User) decision on Q1 testable.)_

## Open Questions

~~- **Q1 — A marked file the user edited.** Overwrite on Update (it is managed), show it as
"modified" and ask before overwriting, or treat it as the user's from then on? "No write path
silently overwrites the user's edits" argues against the first.~~ answered → Decisions (Sprint)
~~- **Q2 — Marker in JSON.** `settings.json` has no comments. A Gaston key inside the JSON (if the CLI
tolerates unknown keys), or a sidecar manifest under `.claude/` listing managed files and versions?~~ answered → Decisions (Sprint)
~~- **Q3 — Skill names and cut** (concept O4): one queue skill plus a curator skill plus a proposal
skill, or one skill per job kind?~~ answered → Decisions (Sprint)
~~- **Q4 — Folder layout under `.secondbrain/`** (concept O3) for jobs, results, proposals and run
reports — fixed here because `CLAUDE.md` names it; the formats themselves follow in [[088]] to
[[090]].~~ answered → delegated to refine, still must be recorded in Decisions (Sprint)

## Decisions (Sprint)

- **(User)** A marked file the user edited: shown as "modified" on Update and overwritten only after confirmation
- **(User)** Marker in JSON: sidecar manifest under `.claude/` listing managed files and versions; `settings.json` stays plain JSON
- **(User)** Skill names and cut: three skills — one queue skill, one curator skill, one proposal skill
- **(User)** Folder layout under `.secondbrain/`: delegated to refine — the refine agent fixes it and records it in Decisions for S21 ([[088]] to [[090]] depend on it)

**Fixed here, read by 085–092 (S20 and S21 depend on it):**

- **Hand-over layout (Q4):** everything the agent exchanges with Gaston sits under one parent,
  `.secondbrain/agent/`:
  - `jobs/` (Gaston writes, agent only reads)
  - `results/` (agent writes one result per job, **same file name as its job**)
  - `proposals/` (agent writes, one file per proposal)
  - `runs/` (agent writes one report per skill run)

  Every item is one Markdown file with YAML frontmatter named `<id>.md`; id format, fields and
  retention belong to [[088]] (proposals), [[089]] (runs) and [[090]] (jobs/results). One parent
  lets [[085]] allow agent writes by prefix (Claude Code deny rules beat allow rules, so "deny
  `.secondbrain/**` except…" cannot be expressed). Results get their own folder so `jobs/` stays
  read-only for the agent and a job can never be edited or deleted by it.

- **Skill names (Q3):** `gaston-jobs` (works the job queue), `gaston-curate` (curates one module,
  argument = module slug), `gaston-propose` (writes a proposal), under
  `.claude/skills/<name>/SKILL.md`. The prefix marks them as Gaston's next to the user's own
  skills, and [[087]] types `/gaston-jobs` and `/gaston-curate <slug>` as the first prompt.
- **Constants** live in `src/shared/types/agent-setup.ts`: `AGENT_DIRS`, `AGENT_SKILLS`,
  `AGENT_SETUP_MANIFEST`, so core, main, renderer and later stories read one source. The help
  module's slug constant belongs to [[086]] (`src/shared/help-module.ts`). 084's `CLAUDE.md` names
  the literal `modules/gaston-help/` (slug per 086's (User) decision) and defines no second
  constant.

Further decisions:

- The manifest `.claude/gaston-manifest.json` is the one source of ownership, template version and
  written hash for **every** managed file; the in-file marker is the human/agent-readable tag and
  only a fallback when the manifest has no entry — one source avoids two versions disagreeing.
- Marker line `gaston:managed id=<template-id> version=<n>`: first line as `<!-- … -->` in plain
  Markdown, the line right after the closing `---` in a `SKILL.md` (Claude Code needs the
  frontmatter first), a `# …` line after the shebang in a script, none in JSON (manifest only).
- Statuses are `current`, `outdated`, `missing`, `modified`, `newer`, `yours`; `newer` (written by
  a newer Gaston, e.g. the vault on a USB stick used on two machines) is never downgraded.
- Implementing the (User) Q1 decision: a `modified` file appears in the plan dialog as an unticked
  opt-in; only a ticked one is overwritten, after a snapshot into `.secondbrain/trash/`. Every
  overwrite of an existing file takes that snapshot, because the old template version is not
  shipped anymore and could not be restored otherwise.
- An unmarked file at a managed path (a user's own `.claude/settings.json` or root `CLAUDE.md`) is
  `yours` and never written or merged; the plan says so. Guardrail "no write path silently
  overwrites the user's edits" applies at the vault root as well as under `.claude/`.
- `settings.json` (v1: `{"permissions": {"deny": []}}`) and two hook scripts are shipped as
  placeholders: deny rules, hook runtime, hook file names and registration are [[085]]'s, which
  replaces `src/core/agent/templates/protection.ts` and bumps the versions. The story text puts
  rules and hooks in 085, and 084 only needs files to carry the mechanism.
- Template mirrors live at `docs/agent-setup/<template-id><ext>` (e.g. `vault-claude.md`,
  `skill-gaston-jobs.md`), never at their vault names. A nested `CLAUDE.md` or `.claude/` folder in
  this repo would be loaded by Claude Code while it works on Gaston.
- `.claude/` is kept out of the index (full build and path refresh): skills and hooks are tool
  config like `.obsidian/`, and indexing them would make Ask cite them and the gardener flag them.
  The root `CLAUDE.md` is indexed like `README.md`, and Ask citing the vault's own rules is
  correct.
- The `.secondbrain/agent/*` folders are created on Install, not added to `INTERNAL_DIRS`. A vault
  without the setup stays exactly as today (concept §13).
- All installed files are English regardless of `languages.documents` (concept §3, "Language").
- Core returns the plan inside the status response, so there is no separate plan channel. Apply
  re-reads each file and writes with the hash the plan showed: a file changed in between is a
  per-file `conflict`, the others proceed, and the manifest is written last.
- The IPC namespace is `agent:` as in [[083]] (`agent:setupStatus`, `agent:setupApply`). `agents:*`
  is the existing session browser and stays separate.

## Plan

Builds on [[083]] (Agent tab, `AgentTab.tsx`, `src/renderer/lib/queries/agent.ts`, `qk.agent`).
Order D1 → D2 → D3 → D4 → D5 → D6 → D7. D4 is independent and only needs to land before D7.

1. **Templates (D1, D2):** shared constants and types in `src/shared/types/agent-setup.ts`. A
   registry `SETUP_TEMPLATES` in `src/core/agent/setup-templates.ts` is the one list that 085/086
   later extend. Bodies are constants:
   - `templates/vault-claude.ts`: the vault `CLAUDE.md`.
   - `templates/protection.ts`: settings and hook placeholders.
   - `templates/skills.ts`: the three skills.

   Each body is pinned to its mirror `docs/agent-setup/<id><ext>` by one generic test.

2. **Mechanism (D3):** `src/core/agent/`:
   - `setup-marker.ts`: render and parse the marker.
   - `setup-manifest.ts`: `.claude/gaston-manifest.json`.
   - `setup-status.ts`: status per file plus the plan.
   - `setup-apply.ts`: hash-guarded writes, snapshots, folders, manifest last.

   Pure core over `VaultStore`.

3. **Index guard + doc (D4):** `.claude/` excluded in `scanVault` and `refreshPaths`, and a
   `docs/VAULT-FORMAT.md` section on the setup and the hand-over layout.
4. **IPC (D5):** `agent:setupStatus`, `agent:setupApply`, with a handler file
   `src/main/ipc/agent-setup.ts` that validates the request in main.
5. **UI (D6, D7):** a Setup panel in the Agent tab (status list, Install/Update), then the plan
   dialog with opt-in for modified files. One e2e spec `tests/e2e/agent-setup.spec.ts` with two
   tests (one app launch).

Write flow: status → plan shown → user confirms (ticks modified files) → apply with plan hashes →
per-file outcome → status refetched.

## Deliverables

- **D1 — Constants, template registry, vault `CLAUDE.md`, protection placeholders.**
  - **Shared types.** New `src/shared/types/agent-setup.ts`, re-exported from
    `src/shared/types/index.ts`. Constants:
    - `AGENT_DIRS = { jobs, results, proposals, runs }`, each `.secondbrain/agent/<key>`
    - `AGENT_SKILLS = { jobs: 'gaston-jobs', curate: 'gaston-curate', propose: 'gaston-propose' }`
    - `AGENT_SETUP_MANIFEST = '.claude/gaston-manifest.json'`

    No help-slug constant: story 086 adds it in `src/shared/help-module.ts`. The template uses the
    literal `modules/gaston-help/`.

    Types:
    - `AgentSetupFileStatus = 'current'|'outdated'|'missing'|'modified'|'newer'|'yours'`
    - `AgentSetupFile { path; status; installedVersion: number|null; shippedVersion: number|null }`
    - `AgentSetupPlan { write: {path; expectedHash; reason: 'missing'|'outdated'}[]; optIn: {path; expectedHash}[]; leave: {path; status}[]; dirs: string[] }`
    - `AgentSetupState { files: AgentSetupFile[]; action: 'install'|'update'|'none'; plan: AgentSetupPlan }`
    - `AgentSetupApplyRequest { confirmed: {path; expectedHash}[] }`
    - `AgentSetupApplyResult { results: {path; outcome: 'written'|'conflict'|'refused'}[] }`

  - **Registry.** New `src/core/agent/setup-templates.ts` with
    `SetupTemplate { id; path; version; format: 'markdown'|'markdown-frontmatter'|'script'|'json'; body }`
    and `SETUP_TEMPLATES` (readonly array). Header comment: this is the one list that 085 and 086
    extend.
  - **`templates/vault-claude.ts`.** New `src/core/agent/templates/vault-claude.ts` exports
    `VAULT_CLAUDE_TEMPLATE` (id `vault-claude`, path `CLAUDE.md`, version 1, format `markdown`).
    The body is English and calm, and contains:
    - What the vault is.
    - The three layers per `docs/MODULE-SCHEMA.md` (`raw/` immutable, `modules/<slug>/wiki/`
      LLM-maintained, `AGENTS.md` schema).
    - The **only** direct write target, `modules/<slug>/wiki/`. Every direct change gets one entry
      in that module's `wiki/log.md` (skill, pages, reason), and `index.md` is kept in sync.
    - Not directly writable: `wiki/overview.md` (the condensed artifact, only via proposal) and
      `modules/gaston-help/` (Gaston's, read-only by convention).
    - Everything else is a proposal into `.secondbrain/agent/proposals/` via `/gaston-propose`:
      `module.md`, `AGENTS.md`, `projects/`, `areas/`, `inbox/`.
    - Never: read `journal/`; write `raw/`, `CLAUDE.md`, `.claude/`, `.ingest.json`, or anything in
      `.secondbrain/` except `results/`, `proposals/`, `runs/` under `.secondbrain/agent/`.
    - Jobs are read from `.secondbrain/agent/jobs/`, and each result goes into `results/` under the
      job's file name. Every skill run ends with one report in `runs/`.
    - The three skills by name, and pointers to each module's `AGENTS.md` and to
      `modules/gaston-help/`.
  - **`templates/protection.ts`.** New `src/core/agent/templates/protection.ts`. Header comment:
    content, runtime and file names belong to story 085. It holds:
    - `SETTINGS_TEMPLATE`: id `settings`, path `.claude/settings.json`, format `json`, body
      `{"permissions": {"deny": []}}` formatted the way prettier formats it.
    - Two hook placeholders: ids `hook-gaston-shell-guard` and `hook-gaston-wiki-check`, paths
      `.claude/hooks/gaston-shell-guard.sh` and `.claude/hooks/gaston-wiki-check.sh`, format
      `script`. The body is `#!/usr/bin/env bash`, one comment line ("Placeholder. The check
      arrives with Gaston's protection rules."), then `exit 0`.

    Register all four in `SETUP_TEMPLATES`.

  - **Mirrors.** Body only, without the marker:
    - `docs/agent-setup/vault-claude.md`
    - `docs/agent-setup/settings.json`
    - `docs/agent-setup/hook-gaston-shell-guard.sh`
    - `docs/agent-setup/hook-gaston-wiki-check.sh`

    The mirror path is always `docs/agent-setup/<id>` plus the extension of the vault path.
    Mirrors must pass `npm run format:check`. Run prettier on these files only, never repo-wide,
    then copy the result back into the constant exactly. All bodies use LF and contain no absolute
    path.

  - **Tests.** New `tests/core/agent/templates.test.ts`, mirroring the pin in
    `tests/core/wiki/module.test.ts`: `readFileSync(new URL('../../../docs/agent-setup/…', import.meta.url), 'utf8')`,
    exact `toBe`.
    - "every setup template matches its docs mirror": iterates `SETUP_TEMPLATES`.
    - "the vault CLAUDE.md names the only direct write target, the log rule, proposals and the
      protected files": the body contains `modules/<slug>/wiki/`, `wiki/log.md`,
      `AGENT_DIRS.proposals`, `wiki/overview.md`, `modules/gaston-help/`, `journal/`, `raw/`,
      `.claude/`, and each `AGENT_SKILLS` value.
- **D2 — The three Gaston skills.** New `src/core/agent/templates/skills.ts` with three templates,
  registered in `SETUP_TEMPLATES` (`src/core/agent/setup-templates.ts`):
  - id `skill-gaston-jobs`, `skill-gaston-curate`, `skill-gaston-propose`
  - path `.claude/skills/<name>/SKILL.md`
  - format `markdown-frontmatter`, version 1

  Each body opens with YAML frontmatter `name: <skill>` and a one-line `description:` saying when
  to use it, followed by English instructions:
  - **gaston-jobs** works `.secondbrain/agent/jobs/` oldest first. For each job it writes exactly
    one result to `.secondbrain/agent/results/` under the job's file name, with status `done`,
    `failed` + reason, or `skipped` + reason. It never edits or deletes a job and never writes
    `.ingest.json`. A job kind this skill does not describe yet gets `skipped`, reason "unknown job
    kind".
  - **gaston-curate** takes the module slug as its argument and reads `modules/<slug>/AGENTS.md`
    first. Its checklist is filing, links, index completeness and contradictions. It changes the
    wiki directly, with one `wiki/log.md` entry per change, and never writes `wiki/overview.md` or
    `modules/gaston-help/`. Anything outside the wiki goes through `/gaston-propose`.
  - **gaston-propose** writes one file per change to `.secondbrain/agent/proposals/`. The file
    names the target path, the new content, the reasoning, the sha256 of the target as read, and
    the run. It never targets `journal/` or `raw/`.

  All three end the run with one report in `.secondbrain/agent/runs/`. The exact formats follow in
  later versions of these templates. Mirrors are `docs/agent-setup/skill-gaston-{jobs,curate,propose}.md`
  (prettier-clean, LF). Test in `tests/core/agent/templates.test.ts`: "every Gaston skill opens with
  frontmatter naming it and saying when to use it", parsed with the frontmatter parser under
  `src/core/vault/`. The mirror test from D1 then covers them without change.

- **D3 — Status, plan and apply over the store.** New files in `src/core/agent/`:
  - **`setup-marker.ts`.** `renderSetupFile(t)` injects `gaston:managed id=<id> version=<n>` per
    format:
    - `markdown`: first line `<!-- … -->`
    - `markdown-frontmatter`: the line after the closing `---`
    - `script`: `# …` after a `#!` line, else first line
    - `json`: unchanged

    `parseMarker(content)` returns `{id, version}` or null.

  - **`setup-manifest.ts`.** Reads and writes `AGENT_SETUP_MANIFEST` as
    `{"gaston": "agent-setup-manifest", "files": [{"path", "template", "version", "hash"}]}`
    (2-space JSON, LF, trailing newline). Unreadable or invalid JSON counts as no manifest.
  - **`setup-status.ts`.** `readSetupState(store, templates = SETUP_TEMPLATES): Promise<AgentSetupState>`.

    Status per template path, in this order:
    1. Absent → `missing`.
    2. Manifest entry → hash equal to the entry hash or to the current render's sha256 gives
       `outdated` / `current` / `newer` by version. Any other hash gives `modified`.
    3. No entry, but a marker with the same id → `current` if the content equals the current
       render, `newer` if the marker version is higher, else `modified`.
    4. Otherwise → `yours`.

    Then every other file found by `store.walk({ dir: '.claude' })`, except the manifest, is listed
    as `yours`.

    Plan:
    - `write` gets `missing` and `outdated`, with `expectedHash` = current sha256, or `''` when
      missing.
    - `optIn` gets `modified`.
    - `leave` gets `yours`, `newer` and `current`.
    - `dirs` gets the `AGENT_DIRS` entries that are absent.

    `action` is `install` when no file is Gaston's, `update` when anything is in `write` or
    `optIn`, else `none`.

  - **`setup-apply.ts`.** `applySetup(store, req, templates = SETUP_TEMPLATES): Promise<AgentSetupApplyResult>`.
    1. Recompute the state.
    2. For each confirmed path: refuse it unless it is a template path whose fresh status is
       `missing`, `outdated` or `modified`. Otherwise snapshot an existing file
       (`store.snapshot`), then `store.writeText(path, renderSetupFile(t), { expectedHash })`. A
       `VaultConflictError` gives `conflict` and processing continues.
    3. `mkdir` the plan's `dirs`.
    4. Write the manifest last, merged and hash-guarded on its read hash, with the sha256 of each
       written file.

  Use `sha256` from `src/core/vault/hash.ts`. Never import Electron or `node:fs`.

  New `tests/core/agent/setup.test.ts`, using `MemoryVaultStore` plus `createTempVault` from
  `tests/helpers/vault.ts`:
  - "a vault without a setup reports every managed file missing and plans an install"
  - "install writes every managed file with its marker and records its version in the manifest"
  - "update rewrites only managed files that are outdated or missing"
  - "a file without the marker is the user's and stays byte-identical through install and update".
    Covers both a user skill and a user `.claude/settings.json` at a managed path.
  - "an edited managed file is overwritten only when confirmed and leaves an undo copy"
  - "a file changed after the plan is a conflict and is not overwritten"
  - "a file from a newer Gaston is never downgraded"
  - "installed setup files contain no absolute machine path". Uses a real temp vault: no file
    contains the vault root, `os.homedir()`, `/^[A-Za-z]:[\\/]/m`, `/Users/` or `/home/`.

- **D4 — Keep `.claude/` out of the index; document the format.**
  - Add `isAgentConfigPath(path)` to `src/core/vault/paths.ts`. It is true for `.claude` and
    anything inside it at the vault root (use `isInside`).
  - Skip such paths in `scanVault` (`src/core/index/build.ts`, the `store.walk()` loop) and in
    `refreshPaths` / `refreshDirectory` (`src/core/index/refresh.ts`).
  - Add a section "Agent setup" to `docs/VAULT-FORMAT.md` (English). It covers:
    - root `CLAUDE.md`, `.claude/` with the manifest, skills and hooks
    - marker and manifest
    - `.secondbrain/agent/{jobs,results,proposals,runs}` and who writes which
    - that `.claude/` is not indexed

  Test in `tests/core/index/refresh-paths.test.ts`: "agent config under .claude is never indexed,
  neither by a build nor by a path refresh". A `.claude/skills/x/SKILL.md` stays out of
  `buildIndex` and out of a `refreshPaths` call naming it. A root `CLAUDE.md` is indexed.

- **D5 — IPC `agent:setupStatus` and `agent:setupApply`.**
  - In `src/shared/ipc.ts`, add to the route map and `IPC_CHANNELS`: `'agent:setupStatus'` (req
    `void`, res `AgentSetupState`) and `'agent:setupApply'` (req `AgentSetupApplyRequest`, res
    `AgentSetupApplyResult`).
  - New `src/main/ipc/agent-setup.ts`, in the shape of `src/main/ipc/section-migration.ts`
    (`defineHandlers`, `fail` from `src/main/ipc/registry.ts`). Both handlers call
    `readSetupState` / `applySetup` from `src/core/agent/` with `services.requireStore()`.
  - Apply validates the request in main before core sees it: `confirmed` is an array of at most 64
    entries, `path` passes `isSafeVaultPath`, and `expectedHash` matches `/^([0-9a-f]{64})?$/`.
    Anything else fails with the input error code the other handlers use.
  - Register it in `src/main/ipc/register-all.ts`. Add `api.agent.setupStatus()` /
    `api.agent.setupApply(req)` in `src/renderer/lib/api.ts`, and stubs in
    `src/renderer/lib/mock-bridge.ts` (all seven templates `missing`, `action: 'install'`).

  New `tests/main/ipc/agent-setup.test.ts`: "a malformed apply request is refused before anything
  is written". The existing `tests/main/ipc-coverage.test.ts` proves the wiring.

- **D6 — Setup panel in the Agent tab.**
  - **Data.** Hook `useAgentSetupState()` in `src/renderer/lib/queries/agent.ts` (created by 083)
    with key `qk.agent.setupState()` in `src/renderer/lib/queries/keys.ts`,
    `enabled: useVaultReady()`, `staleTime: 0`.
  - **Panel.** New `src/renderer/screens/settings/agent/AgentSetupPanel.tsx`, mounted in
    `AgentTab.tsx` between the CLI status and About this panels. Gaston atoms and tokens only, read
    `src/renderer/styles/gaston/README.md`.
    - One intro sentence: Gaston writes these files so Claude Code knows the vault's rules, and
      files it did not write are yours and stay untouched.
    - One row per file: the path in mono, a `Badge` with the status label, and installed → shipped
      version in mono when both exist.
    - The button "Install" when `action === 'install'`, "Update" when `'update'`, and the sentence
      "Setup is current." when `'none'`. The button is wired in D7.
    - Loading shows a skeleton. A query error shows a sentence with the reason, never a blank
      panel.
  - **Labels.** English: Current, Outdated, Missing, Changed by you, From a newer Gaston, Yours.
    German: Aktuell, Veraltet, Fehlt, „Von dir geändert“, „Von einem neueren Gaston“, Deine Datei.
    Keys `settings.agent.setup.*` go in `src/renderer/i18n/en-settings.ts` / `de-settings.ts`. If
    either file passes 300 lines, move them into an `*-settings-agent.ts` pair spread in the way
    `de-settings-models.ts` spreads `deSettingsRuntime`.
  - **e2e.** New `tests/e2e/agent-setup.spec.ts` (`test.use({ specId: 'agent-setup' })`, navigation
    as in `about-release-notes.spec.ts`). Test "the agent tab lists the setup as missing and offers
    install": all seven managed paths are shown as Missing and the "Install" button is visible.
- **D7 — Plan dialog and write.**
  - **Dialog.** New `src/renderer/screens/settings/agent/AgentSetupPlanDialog.tsx`, mirroring the
    Dialog + `useMutation` + `decodeIpcError` flow of `SectionMigrationCard.tsx`, with atoms
    `Dialog`, `Button`, `Checkbox`, `Badge`. Title: "Install the agent setup" or "Update the agent
    setup". Sections:
    - "Will write": `plan.write`
    - "Changed by you": `plan.optIn`, one unticked `Checkbox` each, with "Overwrite. A copy goes to
      the trash."
    - "Left alone": `plan.leave` with its status label. A `yours` entry at a managed path adds
      "Gaston does not write this file."
    - "Creates folders": `plan.dirs`

    Confirm "Write {n} files" sends `confirmed` = `write` plus the ticked `optIn` entries with
    their `expectedHash`. Cancel writes nothing.

    After apply, show the outcome in the dialog:
    - "Setup written. {n} files."
    - per conflict, "Changed on disk since the plan: {path}. Nothing written to it."
    - refused entries listed

  - **Wiring.** Mutation `useApplyAgentSetup` in `src/renderer/lib/queries/agent.ts` invalidates
    `qk.agent.setupState()`. Wire the Install/Update button in `AgentSetupPanel.tsx`. Add i18n keys
    to the same files as D6. Add one `### Added` line to `CHANGELOG.md`.
  - **e2e test** in `tests/e2e/agent-setup.spec.ts`: "install and update write only what the plan
    shows and leave the user's files alone".
    1. Click Install. The dialog lists all seven files, and `CLAUDE.md` / `.claude/` do not exist
       on disk yet.
    2. Confirm. Every file exists: `CLAUDE.md` line 1 and each `SKILL.md` carry `gaston:managed`,
       and the manifest lists `.claude/settings.json` with version 1. The tab shows all Current.
    3. The spec then edits the vault directly:
       - adds `.claude/skills/mine/SKILL.md`
       - rewrites `CLAUDE.md` with a `version=0` marker and sets its manifest entry to version 0
         and that content's sha256
       - deletes `.claude/skills/gaston-propose/SKILL.md`
       - appends a line to `.claude/skills/gaston-curate/SKILL.md`
    4. Re-navigate to the tab. It shows Outdated, Missing, Changed by you and Yours, and offers
       "Update".
    5. Click Update. The dialog lists `CLAUDE.md` and the propose skill under "Will write", the
       curate skill unticked under "Changed by you", and `mine` under "Left alone". Confirm.
       `CLAUDE.md` is at version 1, the propose skill exists, and the curate skill and `mine` are
       byte-identical.
    6. Update again, tick the curate skill, confirm. It is rewritten, and a copy of the edited
       version lies under `.secondbrain/trash/`.

## Model Hints

- D3 → deliverable-hard: this is the one write path into folders the user also owns (`.claude/`,
  the vault root). A wrong ownership or hash rule silently overwrites a user's own skill,
  `settings.json` or edit, which breaks the guardrail "no write path silently overwrites the user's
  edits" and AC5. The subtle cross-file parts are the manifest/marker fallback, the stale-plan
  hash, and the manifest written last.

Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/agent-setup.spec.ts` › "the agent tab lists the setup as missing and offers
  install"
- AC2 → e2e `tests/e2e/agent-setup.spec.ts` › "install and update write only what the plan shows
  and leave the user's files alone"
- AC3 → e2e `tests/e2e/agent-setup.spec.ts` › "install and update write only what the plan shows
  and leave the user's files alone"; unit `tests/core/agent/setup.test.ts` › "install writes every
  managed file with its marker and records its version in the manifest"
- AC4 → e2e `tests/e2e/agent-setup.spec.ts` › "install and update write only what the plan shows
  and leave the user's files alone"; unit `tests/core/agent/setup.test.ts` › "update rewrites only
  managed files that are outdated or missing"
- AC5 → e2e `tests/e2e/agent-setup.spec.ts` › "install and update write only what the plan shows
  and leave the user's files alone"; unit `tests/core/agent/setup.test.ts` › "a file without the
  marker is the user's and stays byte-identical through install and update"
- AC6 → unit `tests/core/agent/templates.test.ts` › "every setup template matches its docs mirror"
- AC7 → unit `tests/core/agent/templates.test.ts` › "the vault CLAUDE.md names the only direct
  write target, the log rule, proposals and the protected files"
- AC8 → unit `tests/core/agent/setup.test.ts` › "installed setup files contain no absolute machine
  path"
- AC9 → e2e `tests/e2e/agent-setup.spec.ts` › "install and update write only what the plan shows
  and leave the user's files alone"; unit `tests/core/agent/setup.test.ts` › "an edited managed
  file is overwritten only when confirmed and leaves an undo copy"

Coverage gate:

| AC  | Delivered by   |
| --- | -------------- |
| AC1 | D6 (+ D3, D5)  |
| AC2 | D7             |
| AC3 | D1, D2, D3, D7 |
| AC4 | D3, D6, D7     |
| AC5 | D3, D7         |
| AC6 | D1, D2         |
| AC7 | D1             |
| AC8 | D1, D2, D3     |
| AC9 | D3, D7         |

D4 adds no criterion. It guards against a regression: skills in the index would surface in Ask and
the gardener.

## Done

**Summary.** Gaston installs and updates the vault's agent setup: root `CLAUDE.md`, `.claude/settings.json`,
two hook placeholders and the three skills (`gaston-jobs`, `gaston-curate`, `gaston-propose`). Core
(`src/core/agent/setup-*.ts`) derives status and plan from the manifest/marker and applies it
hash-guarded with undo copies; IPC `agent:setupStatus` / `agent:setupApply`; the Agent tab gets a Setup
panel and a plan dialog with opt-in for modified files. `.claude/` is kept out of the index and out of
section migration; `docs/VAULT-FORMAT.md` documents the format.

**Commit message:** `084: agent setup — templates + marker/manifest, status/plan/apply, agent:setup IPC, setup panel + plan dialog, .claude out of index`

**Verification (narrow gate).** build, lint, typecheck, format:check green. `npx vitest run --changed HEAD`:
3549 tests; one load-dependent timeout in `tests/renderer/journal.test.tsx` (untouched by this story, passed alone
in 1.0 min, 77/77, in both verification runs). e2e: `npx playwright test tests/e2e/agent-setup.spec.ts tests/e2e/settings-agent-tab.spec.ts`
5/5. Review: default stage PASS, 6 findings fixed in one cycle, re-verified.
AC → test (all passed): AC1/AC2/AC3/AC4/AC5/AC9 → e2e `agent-setup.spec.ts` (both tests); AC3/AC4/AC5/AC8/AC9 →
`tests/core/agent/setup.test.ts` (names as in Acceptance Tests); AC6/AC7 → `tests/core/agent/templates.test.ts`.
No manual residue.

**Decisions.**
- `SETUP_TEMPLATES` has 7 entries (CLAUDE.md, settings, 2 hooks, 3 skills). A `SetupStore` type in `setup-types.ts` and `snapshot`/`mkdir` on `VaultStoreLike` let core accept `requireStore()`.
- Renderer mock paths (`src/renderer/lib/mock-agent-setup.ts`) are literal, since the web tsconfig cannot reach core; `tests/renderer/mock-agent-setup.test.ts` pins them to `SETUP_TEMPLATES` (core template files added to `tsconfig.web.json` include).
- Section migration now skips `.claude/` and root `CLAUDE.md` (review finding): managed files must not turn `modified` by a heading rewrite.
- German badge labels for modified/newer carry no „…“ quotes (badge text); Install/Update/"Setup is current." translated to German.
- Confirm is disabled at 0 selected files; an empty result says "Nothing was written."
- Known, unfixed (low risk): a `modified` file from a newer Gaston is an opt-in and ticking it downgrades it after a snapshot; a hard write error mid-apply throws away earlier per-file results and skips the manifest (marker fallback recovers); `docs/ARCHITECTURE.md` has no `agent/` row (module predates this story).

tiers: D 7 / hard 1 · review default · cycles 1 · agents 11
