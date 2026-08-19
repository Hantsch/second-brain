---
id: 004
title: Where the project status and next step come from
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-12
---

## Requirement

I look at a project and I cannot tell where its status came from. Did I set it? Did
the app derive it from agent sessions? Is it just the default from the day the
project was created, three weeks stale?

The same for `next_step` — the one line that is supposed to carry my re-entry after a
break. If I do not know whether it is mine, suggested, or leftover, I cannot trust
it. And a next step I do not trust is worse than an empty one, because it stops me
from writing a real one.

The app already knows enough to answer this: the status dropdown writes it, the
`project-status` task suggests it, filing a dump can change it, and the file records
when it last changed. That knowledge just is not shown.

## Acceptance Criteria

- [ ] The project detail view states, for the status, where it comes from and how
      old it is — set by me, accepted from a suggestion, or written by filing —
      with the date.
- [ ] The same for `next_step`.
- [ ] Nothing is invented. If the file does not record where a value came from, the
      screen says only what it actually knows (e.g. "last changed on …") and does
      not guess an author.
- [ ] A stale next step is visible as stale: if the project has been worked on since
      the next step was written (file changes or agent sessions), the screen says so.
      This is the maintenance finding "project without a next step", made visible at
      the place where I can fix it.
- [ ] Accepting a suggestion records that it was a suggestion, so the provenance is
      still right the next time I look.
- [ ] Whatever gets recorded is recorded in the file, not in the index — the index
      stays derivable and deletable.
- [ ] The frontmatter addition is documented in
      [VAULT-FORMAT.md](../VAULT-FORMAT.md), is optional, and a project file without
      it stays valid.
- [ ] Works without a configured model.

## Open Questions

- ~~Where does provenance live? New optional frontmatter keys (e.g.
  `next_step_set: {at, by}`), or derived from `log.md` / the file's history?~~
  answered → Decisions (Sprint)
- ~~"Worked on since" — is that file mtime, indexed changes, agent sessions, or all
  three? Sessions only exist for linked projects.~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Provenance storage: new optional frontmatter keys (e.g.
  `status_set: {at, by}`, `next_step_set: {at, by}`), not derived from log.md/history
  — needed to answer "by whom", which the file-history approach cannot.
- **(User)** "Worked on since" signal for staleness: file mtime, indexed changes, and
  agent sessions combined — any of the three counts as "worked on", covering
  projects without a linked agent too.
- Shape: `status_set: { at: <YYYY-MM-DD>, by: user|suggestion|filing }`, same for
  `next_step_set` — day granularity matches `started`/`deadline`/`updated`, and a
  nested map keeps the two facts of one value together.
- `by` vocabulary is exactly `user` · `suggestion` · `filing`; an unknown value is
  treated like a missing one (fallback copy), so a hand-typed word never becomes a
  claim the app cannot back.
- The app owns the keys: they stay out of the `WRITABLE` allowlist in
  `project-patch.ts` and are stamped by the `projects:patch` handler, so the renderer
  cannot lie about `by`.
- Intent reaches the handler as an optional `origin: 'user' | 'suggestion'` on the
  patch request (default `user`) — manual edit and suggestion-accept are otherwise
  indistinguishable at the IPC boundary.
- Staleness reuses the existing `lastTouch` / `lastTouchSource` (already the max of
  file mtime and external touches incl. agent sessions) instead of a second notion of
  recency — that is exactly the (User) "any of the three" signal, and it keeps 013's
  "no second notion of recency" true.
- Stale is a strict day comparison (`lastTouch` day > `next_step_set.at` day), so
  writing the step and touching the file on the same day is not flagged.
- Placement: a quiet meta line under the status control in `ProjectHead` and under
  the value in `NextStepEditor` — both places already carry a `role="status"` note
  line, so provenance sits where the value is edited.
- Fallback copy when nothing is recorded: "Origin not recorded · file last changed on
  {date}" from `updated` — it names the file, not the field, so it does not imply the
  status changed then.
- The stale next step is one warning `Badge` plus one explaining line, no second
  accent — Gaston keeps the teal on the focal point.

## Plan

Provenance becomes two optional frontmatter maps that the main process stamps, is
derived into the `Project` record, and is rendered as two quiet meta lines.

1. **Contract** — add `status_set` / `next_step_set` to `ProjectFrontmatter`
   (`src/shared/types/domain.ts`), to the canonical key order
   (`src/core/vault/frontmatter-order.ts`, after `next_step`), and document both in
   `docs/VAULT-FORMAT.md` as optional.
2. **Write** — `projects:patch` gains an optional `origin`; the handler in
   `src/main/ipc/projects.ts` stamps `status_set` / `next_step_set` whenever the patch
   carries `status` / `next_step` (always both sub-keys at once — `setPreserving`
   replaces nested maps wholesale). `src/main/ipc/project-patch.ts` keeps rejecting the
   keys from callers. `projects:create` stamps `by: user`.
3. **Filing** — `src/core/capture/apply.ts` stamps `by: filing` where it writes
   `status` / `next_step` for a project born from a dump.
4. **Derive** — `src/core/index/projects.ts` maps both maps onto new `Project` fields
   and computes `nextStepStale` from `lastTouch` vs `next_step_set.at`. Unknown/absent
   → `undefined`, never a guess. The index stays derivable; the truth is the file.
5. **Show** — `ProjectHead` renders the status line, `NextStepEditor` /
   `ProjectOverviewTab` the next-step line plus the stale badge;
   `ProjectOverviewTab.accept` sends `origin: 'suggestion'`. New `project.provenance.*`
   keys in `de-projects.ts` / `en-projects.ts`, styles in `styles/app/projects.css`.

Order: 1 → 2 → 3 → 4 → 5/6. No LLM is involved anywhere in this path.

## Deliverables

**D1 — Frontmatter contract and documentation**
Optional `status_set` / `next_step_set` (`{ at, by }`) on `ProjectFrontmatter`, placed
in the canonical project key order, documented in VAULT-FORMAT as optional.
_Acceptance:_ a project file without the keys stays valid; a first-time write lands at
the canonical position; VAULT-FORMAT names the `by` vocabulary.
_Files:_ `src/shared/types/domain.ts`, `src/core/vault/frontmatter-order.ts`,
`docs/VAULT-FORMAT.md`, `tests/core/vault/frontmatter-patch.test.ts`.
_Mirror:_ the existing `next_step` entry in `frontmatter-order.ts` and its test at
`frontmatter-patch.test.ts` ("erstmaliges next_step").

**D2 — The main process stamps provenance**
`projects:patch` request gains optional `origin: 'user' | 'suggestion'` (default
`user`); the handler writes `status_set` / `next_step_set` alongside `updated` when the
patch touches `status` / `next_step`. The keys stay out of `WRITABLE`.
_Acceptance:_ a status patch produces `status_set: {at: today, by: user}`; the same
patch with `origin: 'suggestion'` produces `by: suggestion`; a patch that sends
`status_set` itself is rejected; the stale-hash conflict test still fails with
`conflict` and leaves the file untouched; unrelated user frontmatter survives.
_Files:_ `src/shared/ipc.ts`, `src/main/ipc/projects.ts`, `src/main/ipc/project-patch.ts`,
`tests/main/projects-ipc.test.ts`.
_Mirror:_ the existing `updated: isoDay(new Date())` stamping in `projects:patch`.

**D3 — Filing records itself**
Where `src/core/capture/apply.ts` writes `status` / `next_step` for a project created
from a dump, it stamps `by: filing` with the filing date.
_Acceptance:_ filing a dump into a new project yields `next_step_set.by === 'filing'`;
undo of that filing does not leave a provenance stamp behind that contradicts the
restored value.
_Files:_ `src/core/capture/apply.ts`, `tests/core/capture/apply.test.ts`.

**D4 — Derivation into the Project record**
`Project` gains `statusSet?`, `nextStepSet?` and `nextStepStale: boolean`;
`deriveProjects` maps them and computes staleness as `lastTouch` day strictly after
`next_step_set.at`. Unknown `by` values and missing maps derive to `undefined` /
`false`.
_Acceptance:_ unit tests for all four cases (no map · fresh · worked-on-since via file
mtime · worked-on-since via an external touch/agent session); deleting the index and
rebuilding reproduces the same values.
_Files:_ `src/shared/types/domain.ts`, `src/core/index/projects.ts`,
`tests/core/index/projects.test.ts`.
_Mirror:_ the existing `lastTouch` / `lastTouchSource` derivation in the same file.

**D5 — Status provenance in the project head**
A meta line under the status control: "Set by you · {date}" / "Accepted from a
suggestion · {date}" / "Written by filing · {date}", and the honest fallback "Origin
not recorded · file last changed on {date}". Keys in `de` and `en`.
_Acceptance:_ all four states render; no key missing in `en`; no raw Tailwind colour;
renders identically with no model configured.
_Files:_ `src/renderer/screens/projects/ProjectHead.tsx`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`src/renderer/styles/app/projects.css`, `tests/renderer/projects.test.tsx`.
_Mirror:_ `.sb-trace-touch` / `project.trace.*` in `ProjectSessionsTab.tsx` (age +
source, already the house pattern) and `RelativeTime` / `formatAge`.

**D6 — Next-step provenance, stale marker, and the suggestion origin**
The same line under the next step, plus a warning `Badge` "Possibly outdated" with one
explaining line when `nextStepStale`; `ProjectOverviewTab.accept` sends
`origin: 'suggestion'`, the manual save sends nothing (default `user`).
_Acceptance:_ accepting a suggestion and reopening the project still shows "Accepted
from a suggestion"; a project worked on after the step was written shows the stale
marker, a fresh one does not; a project without the map shows neither a stale claim nor
an author; works with no model configured.
_Files:_ `src/renderer/components/NextStepEditor.tsx`,
`src/renderer/screens/projects/ProjectOverviewTab.tsx`,
`src/renderer/lib/api.ts`, `src/renderer/lib/queries/projects.ts`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`tests/renderer/projects.test.tsx`.

**AC coverage:** status provenance → D5 · next_step provenance → D6 · nothing invented
→ D4 (derives `undefined`) + D5/D6 (fallback copy) · stale next step → D4 + D6 ·
suggestion acceptance recorded → D2 + D6 · recorded in the file, not the index → D1 +
D2 + D3 (D4 only derives) · documented in VAULT-FORMAT, optional → D1 · works without a
model → D5 + D6.

## Model Hints

- D2 → `deliverable-hard` — it changes the single write choke point for every project
  edit: a nested map written via `setPreserving` replaces wholesale, and the existing
  stale-hash `conflict` behaviour plus "preserves unknown user frontmatter" must not
  regress.
- D1, D3, D4, D5, D6 → default.
- Review: → `story-review-hard` — a new frontmatter contract plus a change to the
  hash-guarded vault write path; a wrong `by` value is a silent lie in the user's files.

## Test Plan (manual acceptance)

1. `npm run seed`, start the app, open a project from the project list.
2. Change the status in the dropdown. The line under the status reads "Set by you"
   with today's date. Open `project.md` in an editor: `status_set: {at, by: user}`.
3. On a project with an empty next step, fetch a suggestion and accept it (with a model
   configured). The next-step line reads "Accepted from a suggestion"; the file shows
   `by: suggestion`. Leave the project, come back — the line still says it.
4. Type a next step by hand → the line reads "Set by you".
5. In an editor, set `next_step_set.at` to a date before the project's last touch (or
   touch a file in the project folder afterwards). Back in the app the next step shows
   the "possibly outdated" marker; remove the change → the marker disappears.
6. Delete `status_set` / `next_step_set` from the file. The screen shows only "Origin
   not recorded · file last changed on …" — no author, no stale claim.
7. Delete `.secondbrain/index/`, restart: both lines are back unchanged.
8. Settings → remove the configured model: both lines render exactly the same.

## Done

<Filled by `/ai-scrum:build 004`.>
