---
id: 088
title: The agent's proposals wait in Maintenance
status: done # draft -> ready -> in-progress -> done
created: 2026-10-22
---

## Requirement

Outside the wiki layer, the agent may not write — it proposes (concept §9, AGT-9 to AGT-11). A
proposal is one file under `.secondbrain/` naming the target path, the content or section-wise
diff the agent wants, its reasoning, the target's hash as the agent read it, and the run that
produced it. Targets may be anything except `journal/` and `raw/`: `module.md`, `AGENTS.md`,
projects, areas, notes, inbox filings.

Gaston shows proposals in the Maintenance screen as a new finding kind next to the gardener's,
reusing the finding card, accept/reject and undo via `trash/`. The Maintenance rail entry carries a
badge with the number waiting, so proposals do not sit unseen. Proposals written while Gaston is
open appear without a restart, which today's watcher does not cover (it ignores only
`.secondbrain/index` and `trash`, but nothing reads the new folders yet; concept O10).

The proposal skill in the setup ([[084]]) learns the format here; its template version goes up, so
an installed setup shows "outdated".

## Acceptance Criteria

- [x] **AC1** — A proposal file placed in the proposals folder while Gaston is open appears in
      Maintenance, without a restart, as a finding showing target, diff and reasoning.
- [x] **AC2** — The Maintenance rail entry shows the number of waiting proposals and updates when
      one is added or resolved.
- [x] **AC3** — Accepting writes the target hash-guarded, leaves an undo copy in
      `.secondbrain/trash/`, and removes the proposal.
- [x] **AC4** — Accepting after the target changed since the agent read it reports a conflict and
      leaves the target unchanged.
- [x] **AC5** — Rejecting removes the proposal and leaves the target unchanged.
- [x] **AC6** — A proposal targeting `journal/`, `raw/`, or a path outside the vault is never
      offered for accepting; it shows as invalid with the reason.
- [x] **AC7** — A proposal file with missing fields shows as invalid with the reason, not as a
      crash or an empty card.
- [x] **AC8** — The installed proposal skill describes the format Gaston reads, and the template
      test pins it.

## Open Questions

- ~~**Q1 — Content form** (concept O3): full new content, section-wise diff, or both allowed?~~ answered → Decisions (Sprint)
- ~~**Q2 — Inbox filing** (concept O6): does a proposal to file a dump go through the existing filing flow in `src/core/capture/` (as a filing proposal), or is it a plain "write this file, delete that one" proposal?~~ answered → Decisions (Sprint)
- ~~**Q3 — Retention.** Are rejected and accepted proposals deleted, or moved aside for the run report?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Content form: full new content; Maintenance shows a diff against the current file.
- **(User)** Inbox filing: goes through the existing filing flow in `src/core/capture/` as a filing proposal.
- **(User)** Retention: accepted and rejected proposals are moved aside under `.secondbrain/` and referenced by the run report.

Refine decisions:

- **Format.** One `.md` file directly in `AGENT_DIRS.proposals`; the id is the file stem. The
  frontmatter has `gaston: proposal`, `version: 1`, `kind` (`edit` | `filing`), `target`,
  `base_hash` (64 hex), `run`, `reason`; `filing` adds `file_into` and an optional `section`. The
  content is everything after the line that closes the frontmatter, verbatim. Snake case and a
  plain frontmatter file, so the format matches every other vault file (VAULT-FORMAT).
- **The target of an `edit` must exist.** A missing target makes the proposal invalid. That way
  every accept has a hash to guard and an old copy to undo to. New files come in only through
  filing (`new-project`).
- **Forbidden targets** go beyond AC6. Besides `journal/`, `raw/` and paths outside the vault,
  these are forbidden: `.secondbrain/`, `.claude/`, root `CLAUDE.md` and any `.ingest.json`. Concept
  §7 allows no proposal for them.
- **Moved aside to `.secondbrain/agent/resolved/<id>.md`**, under the same file name, with
  `resolution` and `resolved_at` (and `undo` when accepted) added. The run report from 089 lists
  proposals by file name, so the reference still resolves. A deny rule
  `Edit(/.secondbrain/agent/resolved/**)` keeps the agent from writing there. The new constant is
  `AGENT_RESOLVED_DIR`, not a new `AGENT_DIRS` key. Install would otherwise plan a folder that only
  accept and reject create.
- **`run`** is a free, non-empty string. The skill uses the run's start time. 089's stop hook
  links its report to proposals by path, so the agent never has to know a hook id.
- **Undo reuses the gardener's fix journal.** `writeFixJournal` writes
  `.secondbrain/trash/<token>/gardener.json` with the old content. `gardener:undoFix` and the
  garden's `OutcomeStrip` undo it, which gives one undo path rather than a second one.
- **Filing** (the (User) decision) works as follows. The proposal becomes a `FilingProposal` (from
  `src/shared/types/capture.ts`) and goes through `applyProposal` with the dump's `base_hash` as
  `expectedHashes`. Its undo is capture's own token (`capture:undo`), because that flow already
  journals its steps. The card shows the content to file as added lines. Filing into `journal` is
  invalid.
- **Proposals are their own section in the garden screen** and not a `GardenerFindingKind`.
  Gardener findings come from runs stored in `gardener.json`, while proposals are live files that
  must show without a run. The card reuses the finding card frame.
- **A conflict leaves the proposal waiting.** The user can then reject it. It surfaces as the IPC
  error code `conflict`, like every other hash-guarded write.
- **The badge counts every waiting file, valid or invalid.** Both need the user's hand, either
  accept or reject.
- **Invalid reasons are codes** that the renderer translates with `t()` (guardrail 7). Core never
  sends a sentence.

## Plan

Builds on 084 (`src/shared/types/agent-setup.ts`, `src/core/agent/`, Agent IPC namespace `agent:`)
and 085 (`src/core/agent/templates/protection.ts`). Order: D1 → D2 → D3 → D4 → D5 → D6. D7 is
independent of the others.

1. **Read (D1):** core lists and validates proposal files and builds the diff against the current
   target (`diffLines` from `src/core/condense/diff.ts`).
2. **Resolve (D2, D3):** accept for `edit` (hash guard, fix journal into the trash, then the
   write, then the move aside) and reject. Accept for `filing` runs through `applyProposal`.
3. **IPC (D4):** `agent:proposals`, `agent:proposalAccept`, `agent:proposalReject`. Main takes only
   the id; core re-reads and re-validates the file on every accept.
4. **UI (D5, D6):** a proposal section at the top of the garden screen with cards for diff, reason,
   accept, reject, invalid state and undo, then the rail badge. The `agent` query root is already in
   `VAULT_DEPENDENT_ROOTS`, so the watcher's `event:vault-changed` refreshes both without a restart.
   The watcher does not ignore `.secondbrain/agent/`.
5. **Setup (D7):** the propose skill moves to v2 and describes the format. The settings template
   gets the `resolved/` deny rule and a version bump. VAULT-FORMAT documents the format.

Flow: agent writes file → watcher → `event:vault-changed` → `qk.agent.proposals()` refetches →
badge + card → accept(id) → core re-validates → hash check → journal → write → move aside →
event → list shrinks.

## Deliverables

- [x] **D1 — Read and validate proposals (core).**
  - **New `src/shared/types/agent-proposals.ts`**, re-exported from `src/shared/types/index.ts`:
    - `AGENT_RESOLVED_DIR = '.secondbrain/agent/resolved'`
    - `PROPOSAL_FIELDS = ['gaston', 'version', 'kind', 'target', 'base_hash', 'run', 'reason']`,
      plus `PROPOSAL_FILING_FIELDS = ['file_into']`
    - `ProposalInvalidCode = 'unreadable' | 'missing-field' | 'unknown-kind' | 'bad-hash' | 'forbidden-target' | 'outside-vault' | 'target-missing' | 'filing-invalid'`
    - `AgentProposalView { id; path; kind: 'edit'|'filing'|null; target: string|null; reason: string|null; run: string|null; fileInto: string|null; section: string|null; valid: boolean; invalid: {code: ProposalInvalidCode; detail: string|null}|null; diff: DiffRow[]|null }`.
      Use the `DiffRow` type that `src/renderer/components/CondenseDiff.tsx` already takes; if it
      lives only in core, move it to shared rather than copying it.
  - **New `src/core/agent/proposals.ts`**, pure over the store, with no Electron or `node:fs`:
    - `listProposals(store): Promise<AgentProposalView[]>` reads each `.md` file directly in
      `AGENT_DIRS.proposals`, ignores other extensions, and sorts by id.
    - `readProposal(store, id)` is the same for one file and returns `null` when it is gone.
    - **Parse** with `splitFrontmatterBlock` from `src/core/vault/frontmatter.ts`. The content is
      everything after the closing line, verbatim.
    - **Validate, first failure wins:**
      1. frontmatter that does not parse → `unreadable`
      2. a missing or empty field from `PROPOSAL_FIELDS` → `missing-field` (detail = field). For
         `filing`, the fields from `PROPOSAL_FILING_FIELDS` are checked too.
      3. `kind` that is not `edit` or `filing` → `unknown-kind`
      4. `base_hash` not `/^[0-9a-f]{64}$/` → `bad-hash`
      5. a target that is not a safe vault-relative path (`isSafeVaultPath` / `isInside`) →
         `outside-vault`
      6. a target under `journal/`, `raw/`, `.secondbrain/` or `.claude/`, or equal to `CLAUDE.md`,
         or with the basename `.ingest.json` → `forbidden-target`
      7. a target that does not exist → `target-missing`. For `filing`, the target must also lie
         under `inbox/`, else `forbidden-target`.
    - **Diff.** An `edit` gets `diffLines(current, content)` from `src/core/condense/diff.ts`. A
      `filing` gets `diffLines('', content)`; its `file_into` check is D3's. Invalid proposals get
      `diff: null`.
  - **Index.** Make sure `.secondbrain/agent/**` never enters the index through `refreshPaths`. If
    `src/core/index/refresh.ts` does not already skip `.secondbrain/`, skip it there, as 084 did for
    `.claude/`.
  - **Tests** in the new `tests/core/agent/proposals.test.ts` (`MemoryVaultStore`):
    - "a valid proposal lists with its target, reasoning and a diff against the current file"
    - "a proposal targeting journal, raw, internal folders or outside the vault is invalid with its
      reason"
    - "a proposal with missing fields or unreadable frontmatter is invalid with its reason"
- [x] **D2 — Accept and reject an edit proposal (core).** New file
      `src/core/agent/proposal-resolve.ts`. Mirror the journal-before-write order of `commit()` in
      `src/core/gardener/fixes.ts:132`.
  - **`acceptProposal(store, id, now?)`:**
    1. Re-read and re-validate the proposal with `readProposal` from D1. If it is gone, or invalid,
       throw `GardenerError`-style `invalid` and write nothing. Never trust anything but the id.
    2. Read the target. If its sha256 is not `base_hash`, throw `VaultConflictError` and touch
       nothing. The proposal stays where it is.
    3. Create a token with `createUndoToken` (`src/core/vault/trash.ts`). Write the journal with
       `writeFixJournal` (`src/core/gardener/undo.ts`): kind and action `agent-proposal` (extend
       `FixJournalKind`/`FixJournalAction`), and one step `{path: target, before: current, hashAfter: sha256(content)}`.
    4. Write `store.writeText(target, content, {expectedHash: base_hash})`.
    5. Move the file aside with `store.move` into `AGENT_RESOLVED_DIR/<id>.md`. Then add
       `resolution: accepted`, `resolved_at` and `undo: <token>` with `patchFrontmatterYaml`.
    6. Return `{undo: {via: 'gardener', token}}`.
  - **`rejectProposal(store, id, now?)`** moves the file aside the same way with
    `resolution: rejected`. It never reads or writes the target. An invalid proposal can be
    rejected.
  - **Tests** in the new `tests/core/agent/proposal-resolve.test.ts`:
    - "accepting writes the target, journals the old content in the trash and moves the proposal
      aside"
    - "undoing an accepted proposal restores the target" (calls `undoFix`)
    - "accepting after the target changed is a conflict and writes nothing"
    - "rejecting moves the proposal aside and leaves the target unchanged"
    - "accepting an invalid proposal is refused and writes nothing". It covers a `journal/` target
      and a missing field, with no journal, no write and no move.
- [x] **D3 — Filing proposals through the capture flow (core).** Extend
      `src/core/agent/proposal-resolve.ts` and `src/core/agent/proposals.ts`.
  - **Validation.** A `filing` proposal builds a `FilingAction` with `filingAction` from
    `src/core/capture/actions.ts`, using `path = file_into`, `section` and `content`. It checks the
    action with `verifyFilingAction` (`src/core/capture/verify-action.ts`, plus
    `buildFilingContext`). A failure or a `journal` target gives `filing-invalid` (detail = reason
    code).
  - **Accept** for `kind: filing` builds a `FilingProposal` (`src/shared/types/capture.ts:57`):
    `dumpPath = target`, `primary` = that action, empty `extras`, `todos`, `waitingOn`,
    `alternatives` and `entities`, `reason`, `confidence: 1`, `heuristic: false`. It then calls
    `applyProposal` (`src/core/capture/apply.ts:269`) with `expectedHashes: {[target]: base_hash}`.
    A stale dump surfaces as `VaultConflictError` and nothing moves. On success the proposal moves
    aside as in D2 with `undo: <capture token>`, and the result is `{undo: {via: 'capture', token}}`.
  - **Tests** in `tests/core/agent/proposal-resolve.test.ts`:
    - "a filing proposal files the dump through the capture flow"
    - "a filing proposal into the journal is invalid"
- [x] **D4 — IPC.**
  - **Channels.** In `src/shared/ipc.ts`, add to the route map and `IPC_CHANNELS`:
    - `agent:proposals`: req `void`, res `AgentProposalView[]`
    - `agent:proposalAccept`: req `{id}`, res `{undo: {via: 'gardener'|'capture'; token}}`
    - `agent:proposalReject`: req `{id}`, res `void`
  - **Handlers.** New `src/main/ipc/agent-proposals.ts`, in the shape of
    `src/main/ipc/agent-setup.ts` (`defineHandlers`, `fail`). It calls D1/D2 with
    `services.requireStore()`. `id` must match `/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/`, else the input
    error code. A `VaultConflictError` maps to `conflict` as the other write handlers do.
  - **Wiring.** Register in `src/main/ipc/register-all.ts`. Add `api.agent.proposals()`,
    `proposalAccept`, `proposalReject` in `src/renderer/lib/api.ts`, and stubs in
    `src/renderer/lib/mock-bridge.ts` (an empty list).
  - **Test.** New `tests/main/ipc/agent-proposals.test.ts`: "an accept with a path-like id is
    refused before core sees it". `tests/main/ipc-coverage.test.ts` proves the wiring.
- [x] **D5 — Proposal cards in the garden screen.**
  - **Data.** In `src/renderer/lib/queries/agent.ts`:
    - `useAgentProposals()` with key `qk.agent.proposals()` under the existing `agent` root in
      `src/renderer/lib/queries/keys.ts` (already in `VAULT_DEPENDENT_ROOTS`, so
      `event:vault-changed` refetches it), `enabled: useVaultReady()`
    - mutations `useAcceptProposal` and `useRejectProposal`, which invalidate it and
      `qk.agent.*`
  - **Card.** New `src/renderer/screens/garden/ProposalCard.tsx` using the finding card frame from
    `FindingCards.tsx`, atoms and tokens only (read `src/renderer/styles/gaston/README.md`). It shows:
    - the target in mono
    - the kind (filing: "File {target} into {fileInto}")
    - the reason
    - `CondenseDiff` (`src/renderer/components/CondenseDiff.tsx`) for the rows
    - Accept and Reject

    An invalid card shows the file path, the translated reason (`garden.proposal.invalid.<code>`,
    with the detail) and only Reject. A conflict shows "Changed since the agent read it. Nothing was
    written."

  - **Section.** New `src/renderer/screens/garden/ProposalSection.tsx`: a heading with the count
    and the cards, hidden when the list is empty. After an accept it shows `OutcomeStrip`
    (`./OutcomeStrip.tsx`) with Undo. Undo calls the gardener `undoFix` mutation from
    `src/renderer/lib/queries/gardener.ts` for `via: 'gardener'`, and the capture undo mutation for
    `via: 'capture'`. Mount it with a single line at the top of `GardenScreen.tsx`, which is already
    over 300 lines, so add no logic there.
  - **Text.** Add i18n keys to the garden en/de files, with German quotes `„…“`. Add one
    `### Added` line to `CHANGELOG.md`.
  - **e2e.** New `tests/e2e/agent-proposals.spec.ts` (`test.use({ specId: 'agent-proposals' })`;
    fixtures `app`, `vaultPath` from `tests/e2e/fixtures/app.ts`). Each test writes its files with
    `writeFileSync` **after** the app is up.
    - "a proposal written while Gaston is open waits in maintenance and is accepted with an undo
      copy": write an edit proposal for a seeded project file with the correct `base_hash` →
      navigate to Maintenance → the card shows the target, a diff line and the reason → Accept →
      the file on disk equals the content, `.secondbrain/trash/*/gardener.json` exists, the
      proposal sits in `.secondbrain/agent/resolved/` and the card is gone.
    - "a stale, a rejected and an invalid proposal leave their targets unchanged":
      - a proposal whose target the spec edits before Accept shows the conflict sentence, and the
        target keeps the spec's edit
      - Reject on a second one removes it, and its target is byte-identical
      - a `journal/` target and a file without `reason` show their reasons and no Accept button
- [x] **D6 — Rail badge for waiting proposals.**
  - **Rail.** In `src/renderer/components/Rail.tsx`, add a `garden` entry to `badgeCounts` and to
    `ariaLabelWithCount`, from `useAgentProposals().data?.length`. Show nothing at 0.
  - **Text.** Add an i18n key `rail.gardenProposals` (en/de), following `rail.journalOpenDays`.
  - **e2e** in `tests/e2e/agent-proposals.spec.ts`: "the maintenance rail counts waiting proposals".
    Write one proposal → the garden rail badge shows 1. Write a second one → 2. Reject one in
    Maintenance → 1.
- [x] **D7 — The propose skill learns the format; protection guards `resolved/`.**
  - **Skill.** In `src/core/agent/templates/skills.ts`, `skill-gaston-propose` goes to version 2.
    The body describes:
    - the folder `.secondbrain/agent/proposals/` and the file name `<YYYYMMDD-HHMMSS>-<short-slug>.md`
    - every field in `PROPOSAL_FIELDS` and `file_into`/`section`, with one example each for `edit`
      and `filing`
    - that the content after the closing `---` is the target's whole new content
    - `base_hash` = the sha256 of the target exactly as read
    - `run` = the run's start time
    - that it never targets `journal/`, `raw/`, `.secondbrain/`, `.claude/` or `CLAUDE.md`
    - that new files only come in by filing

    Remove the "exact formats follow later" line for proposals. Update the mirror
    `docs/agent-setup/skill-gaston-propose.md` (prettier on that file only, then copy back exactly).

  - **Protection.** In `src/core/agent/templates/protection.ts`, add
    `Edit(/${AGENT_RESOLVED_DIR}/**)` to the `internal-write` rule and bump the settings template
    version. Update `docs/agent-setup/settings.json` and whatever protection test enumerates the
    rules.
  - **Doc.** Add a "Proposals" subsection to the agent section of `docs/VAULT-FORMAT.md`: the
    format, the forbidden targets, and `resolved/` with its added fields.
  - **Test** in `tests/core/agent/templates.test.ts`: "the propose skill describes every field
    Gaston reads". The body contains each of `PROPOSAL_FIELDS`, `PROPOSAL_FILING_FIELDS`,
    `AGENT_DIRS.proposals`, `kind: edit` and `kind: filing`, and the template version is greater
    than 1, so an S20 setup shows outdated. The existing mirror test covers the rest.

## Model Hints

- D2 → deliverable-hard: this is the first path where a file the agent wrote decides what Gaston
  writes into the user's notes. Three things must hold together for "nothing silently overwrites":
  accept re-validates by id instead of trusting the caller, the journal is written before the
  write, and the write is guarded by `base_hash`.

Review: → default

## Acceptance Tests

- AC1 → e2e `tests/e2e/agent-proposals.spec.ts` › "a proposal written while Gaston is open waits in
  maintenance and is accepted with an undo copy"; unit `tests/core/agent/proposals.test.ts` › "a
  valid proposal lists with its target, reasoning and a diff against the current file"
- AC2 → e2e `tests/e2e/agent-proposals.spec.ts` › "the maintenance rail counts waiting proposals"
- AC3 → e2e `tests/e2e/agent-proposals.spec.ts` › "a proposal written while Gaston is open waits in
  maintenance and is accepted with an undo copy"; unit `tests/core/agent/proposal-resolve.test.ts` ›
  "accepting writes the target, journals the old content in the trash and moves the proposal aside"
- AC4 → e2e `tests/e2e/agent-proposals.spec.ts` › "a stale, a rejected and an invalid proposal leave
  their targets unchanged"; unit `tests/core/agent/proposal-resolve.test.ts` › "accepting after the
  target changed is a conflict and writes nothing"
- AC5 → e2e `tests/e2e/agent-proposals.spec.ts` › "a stale, a rejected and an invalid proposal leave
  their targets unchanged"; unit `tests/core/agent/proposal-resolve.test.ts` › "rejecting moves the
  proposal aside and leaves the target unchanged"
- AC6 → unit `tests/core/agent/proposals.test.ts` › "a proposal targeting journal, raw, internal
  folders or outside the vault is invalid with its reason"; unit
  `tests/core/agent/proposal-resolve.test.ts` › "accepting an invalid proposal is refused and writes
  nothing"; e2e `tests/e2e/agent-proposals.spec.ts` › "a stale, a rejected and an invalid proposal
  leave their targets unchanged"
- AC7 → unit `tests/core/agent/proposals.test.ts` › "a proposal with missing fields or unreadable
  frontmatter is invalid with its reason"; e2e `tests/e2e/agent-proposals.spec.ts` › "a stale, a
  rejected and an invalid proposal leave their targets unchanged"
- AC8 → unit `tests/core/agent/templates.test.ts` › "the propose skill describes every field Gaston
  reads"

All three e2e tests live in one spec file, which means one app launch and one new flow for the one
new user path.

Coverage gate:

| AC  | Delivered by |
| --- | ------------ |
| AC1 | D1, D4, D5   |
| AC2 | D6 (+ D4)    |
| AC3 | D2, D4, D5   |
| AC4 | D2, D5       |
| AC5 | D2, D5       |
| AC6 | D1, D2, D5   |
| AC7 | D1, D5       |
| AC8 | D7           |

D3 implements the (User) filing decision. Its own unit tests prove it, and no criterion names it.

## Done

The agent's proposals are now files under `.secondbrain/agent/proposals/` that Gaston lists in the
Maintenance screen. Edit proposals accept hash-guarded with a gardener undo copy, filing proposals
go through the capture flow, invalid ones show their reason and only offer Reject, and the garden
rail entry carries a badge with the waiting count. The propose skill (v2) and the settings template
(v2, `resolved/` deny rule) describe and protect the format.

Commit message: `088: agent proposals wait in Maintenance (list, accept/reject, filing, rail badge, skill v2)`

Verification (narrow gate): `npm run build`, `lint`, `typecheck`, scoped `prettier --check` green;
`npx vitest run --changed HEAD` green (307 files, 4193 tests); `npx playwright test
tests/e2e/agent-proposals.spec.ts` green (3/3). AC → test as verified: AC1, AC3 first e2e + unit
`proposals`/`proposal-resolve`; AC2 rail e2e; AC4, AC5, AC6, AC7 second e2e + the named unit tests;
AC8 `templates.test.ts` (all passed). No manual residue. Review: stage 1 (default) PASS, one fix
cycle (skill YAML-quoting advice, `.ingest.json` and case tests, two weak IPC tests dropped,
refreshPaths pin), narrow gate re-run green.

Decisions: `kind: filing` validation infers the target as an existing project, area or module file,
anything else is `filing-invalid` (`unknown-target`). Handlers use `wikiStore(services)` because
`requireStore()` returns the narrower `VaultStoreLike`. New i18n bundles `{en,de}-garden-proposals.ts`
because the garden bundles sit at the file limit. `DiffRow` moved to shared (re-exported from core).
Unfixed, deliberately: `gaston`/`version` values are only checked for presence (a `version: 2` file
is read as v1); a failed archive after a successful write leaves the proposal showing as a conflict
(undo and Reject still work); symlinks inside the vault are not resolved by any store (predates the
story). Timing note: `tests/core/index/perf.test.ts` and two `journal.test.tsx` tests time out under a
parallel full-changed run but pass alone. Format red outside this story: `089-*.md` and `095-*.md`
in docs/requirements fail `prettier --check`.

tiers: D 7 / hard 1 · review default · cycles 1 · agents 11
