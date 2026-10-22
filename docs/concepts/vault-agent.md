# Vault agent — Concept

Status: **Draft** (vision + requirements; cut into stories, see [ROADMAP](../ROADMAP.md)). This document fixes how an
agent CLI — Claude Code in v1 — works _inside_ the vault folder as a curator and as a
worker for LLM jobs that Gaston hands over as files, how Gaston installs and manages that
setup from a new settings tab, which parts of the vault the agent may read, write or only
propose changes to, and how the knowledge about all of this lives in the vault itself so
that Ask can answer "how does this work" from it.

This document follows the architecture rules in [CLAUDE.md](../../CLAUDE.md): the files
stay the truth (the agent works on the same Markdown the app reads, and the hash guard
already covers external edits), the AI proposes and the human confirms (guardrail 2, kept
for everything outside the wiki layer), answers come from the vault only (guardrail 3, which
is why the help content is a vault module), the app stays usable without a model
(guardrail 1, the agent is one more optional model path), and journal content never leaves
the machine for a request it is not meant for (guardrail 6, the agent cannot read
`journal/`). It builds on [MODULE-SCHEMA.md](../MODULE-SCHEMA.md), which already names
Claude Code as a consumer of `modules/<slug>/AGENTS.md`, on the gardener
(`src/core/gardener/`), whose findings and fix mechanics the proposals reuse, on the ingest
queue's `awaiting-llm` state (`src/core/ingest/queue.ts`), and on
[concepts/condensed-layer.md](condensed-layer.md), whose module level becomes one of the
job kinds.

---

## TL;DR

- **Vision.** The vault is self-explaining Markdown. A strong model with a terminal and
  the vault folder as its working directory can curate it better than the local model
  the app routes to today. Gaston does not become that model; it prepares the folder,
  hands over work as files, and reads the results back.
- **Claude Code only in v1.** Gaston writes a vault-level `CLAUDE.md`, a
  `.claude/settings.json` with deny rules, a set of Gaston skills and hooks. Codex later.
- **Gaston never uses the subscription itself.** No `claude -p`, no OAuth token, no
  headless run. The user opens the official CLI; Gaston opens the terminal for them.
- **Protection by deny rules, not by trust.** `journal/` is unreadable to the agent.
  `raw/` is read-only. Everything the agent may write directly is the wiki layer
  (`modules/*/wiki/`), and every direct write carries a `log.md` entry.
- **Everything else is a proposal.** Changes to `module.md`, `AGENTS.md`, projects, areas,
  notes and inbox filings land as proposal files that Gaston shows in the Maintenance
  screen next to the gardener findings, with a badge on the rail that says something is
  waiting.
- **Jobs are files.** The user explicitly hands a task to the agent ("hand to agent"):
  condense a source stuck in `awaiting-llm`, curate a module, interpret gardener
  findings, condense a module. The job lands under `.secondbrain/`, a skill works the
  queue, Gaston validates the result and does the bookkeeping.
- **A run leaves a report.** Each skill run writes one report file; the Agent tab shows
  the last run and the count of waiting proposals comes from the proposal files.
- **Managed files carry a marker and a version.** A newer Gaston shows "outdated" and
  updates them on click; anything the user added themselves is never touched.
- **A help module ships with the vault.** `modules/<help-slug>/` describes all of Gaston
  (screens, vault format, the agent), is normal Ask evidence, visible in Knowledge, and
  excluded from gardener checks. All of it, like the setup files, is English; the chat
  translates when asked.
- **New settings tab "Agent".** CLI status with a link to the official install guide,
  setup status, the protection rules, the skill list, the last run, and buttons that
  open a terminal in the vault with a skill as the first prompt.
- **Biggest open points:** how airtight the deny rules are against shell access, the
  terminal launch per platform, the job and proposal file formats, the help module's slug,
  and the ordering against the condensed layer's module level.

---

## 1. Vision

Gaston is good at taking things in and filing them. What it is weaker at, with the local
model it routes most tasks to today, is judgement over a whole module: is this page filed
where it belongs, which links are missing, which two pages say the same thing, which
source was never condensed. The user noticed this with the local Qwen model and wants a
stronger model for exactly this kind of work — paid for through a subscription they
already have, not through API keys.

The vault was built for this. It is a folder of Markdown with YAML frontmatter, every
module carries its own `AGENTS.md` that says "any LLM — Claude Code, Copilot, a local
model, the app itself — can maintain this module without needing this app", and the app
detects external edits by hash and never overwrites them. An agent CLI opened in the vault
folder is, from the app's point of view, Obsidian with judgement.

What is missing is the frame around it:

- **Safety.** Nothing today stops an agent in the vault from reading `journal/` or
  rewriting `raw/`. The rules exist in `docs/VAULT-FORMAT.md`; they are not enforced
  inside the folder.
- **Installation.** The user should not hand-write `CLAUDE.md`, deny rules and skills.
  Gaston knows its own format; it installs and updates the setup, like it already writes
  `AGENTS.md` into every new module.
- **Hand-over.** Work that Gaston cannot do without a model — a source waiting for
  condensation, an audit of findings — should be something the user can hand to the agent
  as a file and get back as a result Gaston understands.
- **Explanation.** "What can I do with this, how does the curator work, what does a
  proposal look like" should be answerable by asking Gaston, with the same citations as
  any other question, and readable by the agent in the same place.

How it should feel: the user opens Settings → Agent, sees "Claude Code: installed, setup
current, 3 proposals waiting, last run yesterday", clicks "Curate module", a terminal opens
in the vault with the skill already typed, and afterwards the Maintenance screen shows
what the agent wants to change outside the wiki — accept, reject, undo, as with every
gardener fix today.

## 2. Scope

### In scope (v1)

- The settings tab **Agent** with CLI status, setup status, protection rules, skill list,
  last run, and terminal buttons.
- The **managed setup** in the vault: `CLAUDE.md`, `.claude/settings.json`, Gaston skills,
  Gaston hooks — written, versioned, updated on click.
- The **help module** under `modules/`, shipped and versioned by Gaston, visible in
  Knowledge, Ask evidence, excluded from gardener checks.
- **Direct writes** to the wiki layer by the agent, each with a `log.md` entry.
- **Proposals** for everything else except `journal/` and `raw/`, shown in the Maintenance
  screen with accept, reject and undo, plus a rail badge.
- **Jobs as files**, handed over explicitly per task, for the four kinds: condense source,
  curate module, gardener audit, condense module. Gaston validates results and does the
  bookkeeping.
- **Run reports**, one file per skill run.

### Deliberately not in v1

- **Codex CLI** (OpenAI subscription).
  > Rationale: the user wants one setup that is clean and testable first; Codex uses
  > `AGENTS.md` and a different permission model, so the deny rules and hooks would need a
  > second implementation. It comes once the Claude Code pattern has proven itself.
- **Gaston installing the Claude CLI.**
  > Rationale: the user chose status plus a link to the official guide. A downloader like
  > the local runtime install card would have to follow every installer change upstream.
- **Automatic job routing** (every `awaiting-llm` or locally-routed task becomes a job).
  > Rationale: the user chose explicit hand-over per task. Automatic routing would decide
  > silently what leaves the machine; that contradicts guardrail 2 in spirit.

### Non-goals (permanent)

- **Gaston never calls the subscription.** No `claude -p`, no headless run spawned by the
  app, no reuse of the CLI's OAuth token in Gaston's own gateway. Both Anthropic and OpenAI
  allow subscription login only inside their own tools; a third-party app using it is the
  grey zone this project does not enter (the user's standing rule: no unsanctioned
  integrations). The subscription is used by the user, in the official CLI, in a terminal
  Gaston merely opens.
- **The agent never writes `raw/`.** The vault format's rule, now enforced in the folder.
- **The agent never reads `journal/`.** The most personal content stays with local models,
  as the task routing already recommends.
- **Gaston never writes into the user's own `.claude/` additions.** Managed files are
  marked; everything unmarked belongs to the user.

## 3. Design decisions taken (from the requirements interview)

| Topic                   | Decision                                                                                                                                                                       | Rationale                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Where help lives        | **A help module in the vault**, shipped and versioned by Gaston.                                                                                                               | Ask answers only from the vault (guardrail 3). A module is citable by Ask and readable by the agent; a second evidence source in Ask would weaken the guardrail.            |
| Agent write rights      | **Wiki layer direct, everything else as a proposal.** `modules/*/wiki/` may be changed directly, with a `log.md` entry; anything outside only through a proposal Gaston shows. | The module schema already defines the wiki layer as LLM-led. Guardrail 2 stays intact for user-written content.                                                             |
| Agent CLIs in v1        | **Claude Code only.**                                                                                                                                                          | One setup, cleanly testable. Codex later, once the pattern stands.                                                                                                          |
| Starting the agent      | **Gaston manages the files and opens a terminal in the vault.** Never a headless call.                                                                                         | The subscription runs in the official tool; Gaston never calls the model through it.                                                                                        |
| Read restriction        | **Only `journal/` is unreadable.** `projects/private/`, `inbox/` and `.secondbrain/` stay readable.                                                                            | The user chose the journal as the one hard line. The trade-off that private projects and dumps become visible to a cloud model was named and accepted.                      |
| Managed file updates    | **Managed files carry a marker and a version; Gaston shows "outdated" and updates on click. User-added files are never touched.**                                              | Improvements to rules must reach existing vaults; write-if-missing (the `AGENTS.md` way) would never deliver them. Overwriting everything would forbid user additions.      |
| Place in Settings       | **A seventh tab "Agent".**                                                                                                                                                     | Room for status, installation, protection rules, skills and the description. The Vault tab would get too long; the Models tab would frame it as a runtime, which it is not. |
| CLI presence            | **Check and show status, link to the official install guide.** Gaston does not install the CLI.                                                                                | Enough to make the state honest; no installer to keep in sync.                                                                                                              |
| Jobs                    | **In v1.**                                                                                                                                                                     | This is the actual value when the local model is weak; setup alone would not deliver it.                                                                                    |
| Where proposals show    | **Maintenance screen, next to the gardener findings**, with an indicator that something new is waiting.                                                                        | Reuses the finding card, accept/reject and undo via `trash/`. The user asked for the indicator explicitly: without it, proposals would sit unseen.                          |
| Help module handling    | **A normal module under `modules/`, visible in Knowledge, excluded from gardener checks and the health score.**                                                                | Visible and citable like any module; but findings about Gaston-managed pages would be noise.                                                                                |
| Language                | **Everything English**: help module, `CLAUDE.md`, skills.                                                                                                                      | One template, no localisation to maintain. The chat translates when the user asks in German.                                                                                |
| Job kinds in v1         | **Condense source (`awaiting-llm`), curate module, gardener audit, condense module.**                                                                                          | The four places where today a model is needed and the local one is not good enough.                                                                                         |
| Bookkeeping after a job | **Gaston does it when it reads the job result.** The agent writes content into the wiki and a result file; Gaston validates and updates `.ingest.json`, index and friends.     | The agent needs no write access to app bookkeeping. A model should not write the app's protocol files.                                                                      |
| Run visibility          | **One report file per run.** The Agent tab shows the last run.                                                                                                                 | Hash detection alone would show changed files without saying why; the report carries changed pages, proposals and finished jobs.                                            |
| Terminal buttons        | **One Agent entry in the rail** that opens plain `claude` in the vault. (Revised: the preset-skill buttons were dropped.)                                                      | A preset first prompt runs before the user can pick a model, so a curate job ran on the CLI's default model. The user starts the skill themselves.                          |
| Job trigger             | **Explicit "hand to agent" per task**, in the Tasks screen, at the source, in the gardener.                                                                                    | Nothing reaches the agent without the user's action.                                                                                                                        |
| Help module scope       | **All of Gaston**: screens, vault format, the agent.                                                                                                                           | "How does X work" should work for everything through Ask. The maintenance cost on feature changes was named and accepted.                                                   |
| Proposal targets        | **Everything except `journal/` and `raw/`**: `module.md`, `AGENTS.md`, projects, areas, notes, inbox filings.                                                                  | The curator should be able to suggest a filing or a project note; the human still confirms.                                                                                 |

## 4. Tech decisions

| Area             | Choice                                                                                                                 | Rationale                                                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent CLI        | Claude Code, installed by the user, started in a terminal with the vault as working directory.                         | Interview decision; subscription stays in the official tool.                                                                                    |
| Protection       | Claude Code's own mechanisms in the vault's `.claude/settings.json`: `permissions.deny` for paths, hooks for the rest. | Declarative, travels with the vault (USB stick, external drive), no server, no daemon. See open point O1 for the limits of deny rules.          |
| Hand-over format | Markdown with YAML frontmatter, like everything else in the vault, under `.secondbrain/`.                              | The agent reads it without tooling; Gaston parses it with the existing frontmatter code; it is derived state, so it belongs in `.secondbrain/`. |
| Templates        | Constants in `src/core/`, like `MODULE_SCHEMA_TEMPLATE` in `src/core/wiki/agents-md.ts`, with a test against `docs/`.  | `src/core` knows no filesystem beyond the store, and the packaged app does not ship `docs/`. The existing pattern.                              |
| Terminal launch  | The platform's shell via Electron's main process; the renderer never spawns anything.                                  | Guardrail 5 and `/electron-arch`. Which terminal per platform is open point O2.                                                                 |

## 5. Core terms & model

- **Agent** — an agent CLI the user runs in the vault folder. In v1: Claude Code.
- **Setup** — the managed files Gaston writes into the vault so the agent behaves:
  `CLAUDE.md`, `.claude/settings.json`, `.claude/skills/<gaston-skill>/`, hooks. Each
  managed file carries a marker and the version of the template it came from.
- **Wiki layer** — `modules/<slug>/wiki/`. The one layer the agent may write directly
  (per `MODULE-SCHEMA.md`). Every direct change gets a `log.md` entry.
- **Proposal** — a file under `.secondbrain/` describing a change the agent wants to make
  outside the wiki layer: target path, new content or diff, reasoning. Gaston shows it;
  the human accepts or rejects; accepting writes with the hash guard and an undo copy.
- **Job** — a file under `.secondbrain/` describing work Gaston hands to the agent: kind,
  subject, inputs, what a valid result looks like. The agent writes a **result** next to
  it; Gaston validates the result and does the bookkeeping.
- **Run report** — one file per skill run: when, which skill, changed wiki pages,
  proposals written, jobs finished or failed.
- **Help module** — `modules/<help-slug>/`, shipped by Gaston, describing Gaston itself.

```
  Gaston (Settings → Agent)                          Terminal (user, claude CLI)
  ─────────────────────────                          ──────────────────────────
  installs / updates setup ──► CLAUDE.md, .claude/ ◄── reads rules, skills, hooks
  "hand to agent"          ──► .secondbrain/jobs/  ◄── /jobs skill works the queue
                                                   ──► wiki layer: direct + log.md
  Maintenance screen       ◄── .secondbrain/proposals/ ◄── anything outside wiki
  accept → hash-guarded write + trash/ undo
  Agent tab "last run"     ◄── .secondbrain/agent/runs/ ◄── report at end of run
  bookkeeping (.ingest.json, index) ◄── job result validated by Gaston
```

The folder names in the diagram are working names; the exact layout is open point O3.

## 6. The managed setup

What Gaston writes into the vault when the user clicks "Install" in the Agent tab:

- **`CLAUDE.md`** at the vault root: what the vault is, the three layers, what the agent
  may write directly (wiki layer, with `log.md`), what goes through proposals, what it
  must never touch, where jobs and proposals live, a pointer to the help module and to
  each module's `AGENTS.md`.
- **`.claude/settings.json`**: `permissions.deny` for reading `journal/`, for writing
  `raw/`, and for writing anything outside the wiki layer and the hand-over folders;
  hook registrations.
- **Skills** under `.claude/skills/`: at least one to curate a module, one to work the job
  queue, one to write a proposal in the format Gaston expects. Names are working names
  until refinement (open point O4).
- **Hooks**: what deny rules cannot express — a pre-tool check on shell commands that
  would read `journal/` or modify `raw/`, and a post-write check that a changed wiki page
  still has valid frontmatter and that `log.md` got its entry. The hook scripts must run
  wherever the CLI runs, without a Node install inside the vault (open point O1).

Marker and version: each managed file starts with a comment naming Gaston and the
template version. The Agent tab compares installed versions against the shipped ones
and shows **current**, **outdated** or **missing** per file. Update rewrites only
marked files. A file the user created under `.claude/` without the marker is listed as
"yours" and left alone.

Portability: the setup lives in the vault folder, so it travels with it. The CLI login
does not; on another machine the user logs in again in the CLI. The Agent tab's CLI
status reflects the machine Gaston runs on.

## 7. Protection

| Path                               | Read | Direct write                      | Proposal |
| ---------------------------------- | ---- | --------------------------------- | -------- |
| `journal/`                         | no   | no                                | no       |
| `raw/`                             | yes  | no                                | no       |
| `modules/*/wiki/`                  | yes  | yes + log.md                      | —        |
| `modules/*/module.md`, `AGENTS.md` | yes  | no                                | yes      |
| `projects/`, `areas/`, `inbox/`    | yes  | no                                | yes      |
| `.secondbrain/` hand-over folders  | yes  | yes (results, proposals, reports) | —        |
| `.secondbrain/` everything else    | yes  | no                                | no       |
| `CLAUDE.md`, `.claude/`            | yes  | no                                | no       |

The table is the interview outcome; whether every row can be enforced by deny rules
alone or needs a hook is open point O1. The help module is a normal module for the agent:
its wiki layer is writable like any other, but Gaston's update overwrites managed pages,
so a skill should treat it as read-only — this belongs in `CLAUDE.md`.

## 8. Direct writes and the log

A direct write to the wiki layer follows the module schema as it stands: the page keeps
its frontmatter, the change is one entry in `wiki/log.md` naming the skill, the pages
touched and the reason, `index.md` is kept in sync when a page is added or removed. The
app sees the change through the watcher and the hash, exactly as it sees an Obsidian
edit. Nothing new is needed in the app for this path.

The module lock (`src/core/wiki/module-lock.ts`) is process-local; an agent run is
another process. The answer is the same as for Obsidian: Gaston's own write checks the
hash and reports `conflict` instead of overwriting. A curator run while a digestion is
writing into the same module is therefore safe for the files but may produce a conflict
for the digestion. Whether the Agent tab should warn when Gaston has a run going in the
same module is open point O5.

## 9. Proposals

A proposal is the agent's way to change something it may not write. One file per
proposal, with: target path, the content as the agent wants it (or a section-wise diff),
the reasoning, the hash of the target as the agent read it, the run that produced it.

Gaston reads proposals into the Maintenance screen as findings of a new kind, next to
the gardener's. The finding card shows the diff and the reasoning; **accept** writes with
the hash guard (a stale hash is a `conflict`, as with every write) and an undo copy in
`.secondbrain/trash/`; **reject** removes the proposal. The Maintenance rail entry carries
a badge with the number of waiting proposals, in the same per-screen count mechanism the
rail already has for Journal and Tasks.

What the proposals may target: everything except `journal/` and `raw/`. What a proposal
to file an inbox dump looks like against the existing filing flow (`src/core/capture/`)
is open point O6.

## 10. Jobs

A job is written by Gaston when the user clicks "hand to agent" on something Gaston
would otherwise send to a model:

| Kind            | Where the button lives                                      | Result the agent writes                                    | Bookkeeping Gaston does                                                             |
| --------------- | ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Condense source | At a source in `awaiting-llm` (Sources, Tasks screen)       | The source page under `wiki/sources/` plus a result file   | `sourcePage` and `modules` in `.ingest.json`, `index.md`, `log.md` check            |
| Curate module   | At a module (Knowledge), in the Agent tab                   | Wiki changes directly, proposals for the rest, result file | Reads the report; nothing to protocol                                               |
| Gardener audit  | In the Maintenance screen, at a run without audit           | A result file with the interpretation per finding          | Validated hard against the index like today's `audit.ts`; stored in `gardener.json` |
| Condense module | At a module, once the condensed layer's module level exists | `wiki/overview.md` as a **proposal**, not a direct write   | Per [condensed-layer.md](condensed-layer.md): diff, directives, trash               |

The last row deliberately deviates from "wiki layer is direct": the condensed layer
defines `overview.md` as a diff-confirmed artifact, and that concept wins. Whether the
module condensation job can exist before the module level of the condensed layer is built
is open point O7.

The queue skill works jobs in order, writes a result per job (done, failed with reason,
or skipped with reason), and never deletes a job file. Gaston marks a job done after
validating the result; a result that does not validate stays visible as failed with the
reason, in the Tasks screen like any other task outcome. Job and result formats are open
point O3.

## 11. The help module

Gaston ships one module, `modules/<help-slug>/`, written on install (and on vault
creation once the agent setup is installed — whether it comes with every new vault or
only with the agent setup is open point O8). Its pages describe Gaston: one page per
screen, the vault format, the agent (setup, protection, proposals, jobs, skills, the
terminal buttons), and how to ask about all this.

- It is a normal module: visible in Knowledge, evidence for Ask like any other, readable
  by the agent.
- It is excluded from gardener checks and from the health score, because Gaston
  maintains it, not the user.
- It is managed like the setup files: marker, version, update on click, user pages left
  alone (a user may add pages to it).
- It is English. Ask with a German question gets a German answer with English citations,
  as today with any English source.

The slug is reserved; a user module with the same slug is open point O9.

## 12. The Agent tab

Settings gets a seventh tab, **Agent**, after Customization and before About, following
the tab pattern in `SettingsScreen.tsx` (tab id, icon, i18n label, panel):

- **CLI status** — `absent` or `installed <version>`, checked via the CLI in `PATH` from
  the main process. Absent: a sentence and a link to the official install guide, opened
  via the existing external-link path.
- **Setup status** — per managed file: current, outdated, missing, yours. Buttons
  **Install** (nothing there) or **Update** (something outdated). Both show what they
  will write before they write it, like the runtime install dialog shows its plan.
- **Protection** — the table from §7 in words, as it is installed, not as it should be.
- **Skills** — the list of installed Gaston skills with one line each and the user's own
  skills under `.claude/skills/` marked as theirs.
- **Last run** — from the newest report: when, skill, pages changed, proposals written,
  jobs finished. A link to the Maintenance screen when proposals wait.
- **About this** — a short description of what the agent does and does not do, with a
  link into the help module's agent page in Knowledge.

Without a CLI and without setup, the tab is still complete: every state has its
sentence, nothing is a dead screen (guardrail 1).

## 13. Without a model

The agent is optional on top of an already optional model. Nothing in this concept
changes a path that works today: jobs are only created on the user's click; proposals
only appear when a run wrote them; the help module answers through Ask with or without
a model (without one, the search hits are the answer, as today). A vault without the
setup behaves exactly as it does now.

## 14. Integration with existing systems (architecture notes)

- **Vault layout** (`src/core/vault/layout.ts`): new internal folders under
  `.secondbrain/` for jobs, proposals and reports; `VAULT_DIRS`/`INTERNAL_DIRS` in
  `src/shared/types/vault.ts` extended accordingly. Whether the watcher covers
  `.secondbrain/` today or has to be extended for result and proposal pickup is open
  point O10.
- **Templates** (`src/core/`): `CLAUDE.md`, settings, skills, hooks and help pages as
  constants with a test against `docs/`, the `agents-md.ts` pattern. A new core module
  (working name `src/core/agent/`) owns template rendering, marker/version comparison,
  job and proposal reading and validation, and report reading. It never imports
  Electron.
- **Main**: CLI detection, terminal launch, and the IPC handlers, in a new `src/main/ipc/`
  file. Paths from the renderer are validated as everywhere else.
- **IPC** (`src/shared/ipc.ts`): new channels for agent status, setup plan and install/
  update, terminal launch, job creation, proposal list/accept/reject, last report. One
  main-to-renderer event when proposals or reports change, so the rail badge and the
  Agent tab update without polling.
- **Gardener** (`src/core/gardener/`): proposals as a new finding kind, reusing the
  finding card, accept/reject, undo via `trash/`, and the dismissed/snoozed state in
  `gardener.json`. The audit job reuses the hard validation in `audit.ts`. The help
  module is excluded from checks and the health score.
- **Ingest** (`src/core/ingest/`, `src/core/wiki/raw-protocol.ts`): the condense-source
  job result feeds the same bookkeeping a digestion does today; `.ingest.json` is
  written by Gaston only.
- **Work queue** (`src/core/work/`, `src/main/work-queue.ts`): "hand to agent" is a
  state next to the existing lanes, so the Tasks screen shows handed-over jobs and their
  outcome. Today's queue is session-only; job files are the persistent part.
- **Settings screen**: the Agent tab; i18n keys in `en-settings.ts`/`de-settings.ts`
  (the UI stays bilingual; only the vault files are English-only).
- **Rail** (`src/renderer/components/Rail.tsx`): the per-screen badge map gets a
  Maintenance count.
- **Task routing** (`src/core/llm/tasks.ts`): unchanged. The agent is not a provider in
  the gateway and never appears in the routing table; that is the line from §2.

## 15. Requirements

Setup and management

- **AGT-1** — The Agent tab shows whether the Claude CLI is in `PATH` and, if so, its
  version. If absent, it links to the official installation guide and installs nothing.
- **AGT-2** — "Install" writes `CLAUDE.md`, `.claude/settings.json`, the Gaston skills
  and hooks into the vault. Each managed file carries a marker and the template version.
- **AGT-3** — The tab shows, per managed file, current / outdated / missing; "Update"
  rewrites only marked files. Files under `.claude/` without the marker are listed as the
  user's and never written.
- **AGT-4** — Install and update show what they will write before writing.
- **AGT-5** — Templates are constants in `src/core/` with a test that pins them to their
  `docs/` mirror.

Protection

- **AGT-6** — With the setup installed, the agent cannot read `journal/` and cannot write
  `raw/`, `CLAUDE.md`, `.claude/`, or anything under `.secondbrain/` except the hand-over
  folders. The rules are in `.claude/settings.json` and, where deny rules do not reach,
  in hooks.
- **AGT-7** — The only direct write target outside the hand-over folders is
  `modules/*/wiki/`. A direct write that leaves a page without valid frontmatter or
  without a `log.md` entry is reported by the post-write hook.
- **AGT-8** — Gaston never spawns the CLI headless and never uses its credentials. The
  only process Gaston starts is the user's terminal.

Proposals

- **AGT-9** — A proposal file names target, content or diff, reasoning, the target's hash
  as read, and the run. Targets under `journal/` or `raw/` are rejected by Gaston on
  read.
- **AGT-10** — Proposals appear in the Maintenance screen as findings with diff and
  reasoning; accept writes with the hash guard and an undo copy; reject removes the
  proposal.
- **AGT-11** — The Maintenance rail entry shows the number of waiting proposals.

Jobs

- **AGT-12** — "Hand to agent" exists at a source in `awaiting-llm`, at a module, and at
  a gardener run; each click writes exactly one job file. No job is created without a
  click.
- **AGT-13** — A job result is validated by Gaston before any bookkeeping; a result that
  fails validation is shown as failed with the reason and changes nothing.
- **AGT-14** — After a valid condense-source result, `.ingest.json` carries `sourcePage`
  and `modules` as after a digestion; the agent never writes `.ingest.json`.
- **AGT-15** — A valid gardener-audit result passes the same hard check against the index
  as `audit.ts` and is stored like an audit.
- **AGT-16** — The condense-module job yields a proposal for `wiki/overview.md`, confirmed
  as a diff per the condensed-layer concept, never a direct write.

Reports and the tab

- **AGT-17** — Every skill run ends with one report file; the Agent tab shows the newest.
- **AGT-18** — The terminal buttons open a terminal in the vault folder with `claude` and
  the chosen skill as the first prompt; disabled with a reason when CLI or setup is
  missing.

Help module

- **AGT-19** — The help module exists under `modules/<help-slug>/`, is visible in
  Knowledge, and is evidence for Ask like any other module.
- **AGT-20** — Gardener checks and the health score skip the help module.
- **AGT-21** — The help module is managed like the setup: marker, version, update on
  click, user-added pages untouched.
- **AGT-22** — The help module covers every rail screen, the vault format and the agent.

## 16. Open points

1. **O1 — Airtightness of deny rules.** `permissions.deny` on `Read(journal/**)` stops
   the Read tool, not a `cat journal/...` through the shell. Whether a shell deny pattern,
   a pre-tool hook, or both are needed, and how hook scripts run on a vault that ships no
   Node — to be verified against the CLI's current documentation during refinement.
2. **O2 — Terminal launch per platform.** Which terminal on Windows (Windows Terminal,
   PowerShell, cmd), macOS and Linux, and how the first prompt is passed.
3. **O3 — File formats and folder names** for jobs, results, proposals and reports under
   `.secondbrain/`. Frontmatter fields, naming, retention of finished jobs and old
   reports.
4. **O4 — Skill names and cut.** One skill per job kind, or one queue skill plus one
   curator skill; name of each.
5. **O5 — Concurrent runs.** Whether the Agent tab warns when Gaston has a digestion or
   condensation going in the module the user is about to curate.
6. **O6 — Inbox filing as a proposal.** How a proposal to file a dump maps onto the
   existing filing flow in `src/core/capture/`.
7. **O7 — Ordering against the condensed layer.** Whether the condense-module job waits
   for the module level (CND-2, CND-35/36) or becomes the first implementation of it.
8. **O8 — When the help module is written.** With every new vault, or only when the
   agent setup is installed.
9. **O9 — The help module's slug** and what happens when a user module already has it.
10. **O10 — Watcher coverage of `.secondbrain/`**, needed so results, proposals and
    reports are picked up while Gaston is open.
11. **O11 — The curator's checklist.** What "curate a module" concretely checks beyond
    the user's examples (filing, links, index completeness, contradictions) — the skill's
    content, decided at refinement.
