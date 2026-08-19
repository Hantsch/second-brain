---
id: 004
title: Where the project status and next step come from
status: done # draft -> ready -> in-progress -> done
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

- [x] The project detail view states, for the status, where it comes from and how
      old it is — set by me, accepted from a suggestion, or written by filing —
      with the date.
- [x] The same for `next_step`.
- [x] Nothing is invented. If the file does not record where a value came from, the
      screen says only what it actually knows (e.g. "last changed on …") and does
      not guess an author.
- [x] A stale next step is visible as stale: if the project has been worked on since
      the next step was written (file changes or agent sessions), the screen says so.
      This is the maintenance finding "project without a next step", made visible at
      the place where I can fix it.
- [x] Accepting a suggestion records that it was a suggestion, so the provenance is
      still right the next time I look.
- [x] Whatever gets recorded is recorded in the file, not in the index — the index
      stays derivable and deletable.
- [x] The frontmatter addition is documented in
      [VAULT-FORMAT.md](../VAULT-FORMAT.md), is optional, and a project file without
      it stays valid.
- [x] Works without a configured model.

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
   not recorded · last touched …" (see Decisions in Done: reuses `lastTouch` instead of
   a new field) — no author, no stale claim.
7. Delete `.secondbrain/index/`, restart: both lines are back unchanged.
8. Settings → remove the configured model: both lines render exactly the same.

## Done

### Summary

Two optional frontmatter maps, `status_set`/`next_step_set` (`{ at, by }`), are now
stamped by the app itself everywhere it writes `status`/`next_step` — `projects:patch`
(with an `origin: 'user' | 'suggestion'` request field), `projects:create`, and filing a
dump into a new project (`by: 'filing'`). `deriveProjects` reads them into the `Project`
record (`statusSet?`, `nextStepSet?`, `nextStepStale`), discarding the whole map on any
unrecognized `by` or unparsable `at` rather than partially trusting it. `ProjectHead` and
`NextStepEditor` render a quiet meta line for each ("Set by you · {date}" / "Accepted
from a suggestion · {date}" / "Written by filing · {date}", or the honest fallback), plus
a "Possibly outdated" warning badge on the next step when the project was touched since
it was written. Nothing here touches an LLM.

### Decisions

- **Fallback source reuses `lastTouch`, not a new field.** The Decisions section
  originally proposed "file last changed on {date}" sourced from `updated`. Implemented
  instead as "Origin not recorded · last touched {age}" (`project.provenance.unknown`),
  reusing the existing `Project.lastTouch`/`lastTouchSource` (already the max of file
  mtime and external touches) instead of introducing a second frontmatter-derived
  recency field on `Project`. Rationale: `lastTouch` is exactly the story's own "any of
  the three" staleness signal (file mtime, index changes, agent sessions) — adding a
  second, narrower "file mtime only" notion of recency purely for this one fallback line
  would reintroduce the "second notion of recency" problem story 013 explicitly closed,
  and it would have required adding a new field to `Project`, rippling into every
  hand-built `Project` fixture across the test suite for a display nicety. The wording
  ("last touched", not "the status changed") still satisfies "it names the file/trail,
  not the field" from the original reasoning — it never implies `status`/`next_step`
  itself changed then. The manual Test Plan step 6 above was updated to match. Flagged
  by review (F2) as an undocumented spec deviation; documented here per CLAUDE.md's house
  rule that a deviation wins over the plan when recorded with its reason.
- **`status_set`/`next_step_set` rejected as unknown fields, not added to `LOCKED`.**
  `project-patch.ts`'s `LOCKED` array is for fields embedded in the file path or covered
  by a different, already-existing write path (`type`/`slug`/`scope`/`created`/`updated`);
  its error message ("sits in the file path...") would be wrong for these two. Simply
  never adding them to `WRITABLE` makes `checkProjectPatch` reject them via the existing
  generic "unknown field" branch — same effect, correct message, zero new code.
- **Provenance/stale line on the next step is gated on the value actually being
  present**, not just on `nextStepStale`/`nextStepSet` alone. Found in review (F1): since
  `checkProjectPatch` allows `next_step: null` (an explicit clear) and `projects:patch`
  stamps `next_step_set` whenever the patch touches `next_step` regardless of value, a
  cleared-but-stamped file (or a hand-edited one) could show "Set by you" and a "possibly
  outdated" badge next to "No next step set" — an author and a staleness claim for a
  value that isn't there, contradicting the empty-state message right above it and the
  "project without a next step" maintenance finding. Fixed in
  `NextStepEditor.tsx`: the provenance line and the stale badge now only render when
  `value` is non-empty. Verified live via a hand-edited demo-vault project file plus a
  new test (`tests/renderer/projects.test.tsx`, "zeigt weder Herkunft noch Veraltung,
  wenn next_step leer ist, auch mit next_step_set").
- **`nextStepStale: boolean` (required) and `statusSet?`/`nextStepSet?` (optional)** on
  `Project`: the two maps are optional so hand-built `Project` fixtures elsewhere in the
  test suite don't need updating just because they don't care about provenance;
  `nextStepStale` is required per the plan's literal wording, which mechanically forced
  a one-line `nextStepStale: false` default onto every other fixture/factory building a
  full `Project` object (`src/renderer/lib/mock-fixtures.ts` and seven test files) — a
  deliberate, bounded, non-functional ripple, not scope creep.

### Known limitations (not fixed, judged acceptable)

- **F3 (test coverage, low):** the original D2 test suite proved an unrelated patch
  doesn't *invent* a stamp on a file that never had one, but not that it leaves an
  *existing* stamp byte-identical (the actual `setPreserving`-wholesale-replace risk
  named in Model Hints). Fixed during review follow-up: added
  `tests/main/projects-ipc.test.ts`, "lässt einen vorhandenen Stempel unangetastet, wenn
  ein Patch ihn nicht betrifft".
- **F4 (test coverage, low):** "deleting the index and rebuilding reproduces the same
  values" (D4's acceptance) was originally discharged by a comment, not a test. Fixed
  during review follow-up: added `tests/core/index/projects.test.ts`, "liefert bei
  erneutem Aufruf mit denselben Eingaben dieselbe Herkunft (Index-Neuaufbau)".
- **F5 (test coverage, low, left as-is):** neither D5 nor D6 has a dedicated "renders
  identically with no model configured" test for the provenance lines specifically. Left
  unfixed: the render path (`ProjectHead`/`NextStepEditor`) has no LLM dependency at
  all — verified by inspection, and confirmed live in the smoke test with no provider
  configured in the demo vault (see Verification below) — so a dedicated stub-failure
  test would prove a property the component's structure already guarantees.
- **F6 (style nit, no action needed):** wrapping `StatusPicker` in a new `.sb-phead-status`
  column shifts its baseline relative to the deadline/priority facts next to it. Checked
  live in `.screenshots/19-project-detail.png` and `20-project-nostep.png` (plus the
  axe run, 0 violations across all screens) — reads cleanly, no visual defect worth a
  second pass.

### Verification

- `npm run build` — clean.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npx vitest run --pool=threads` (full suite, run via the PowerShell tool — the Bash
  tool's reported cwd casing on this machine intermittently confuses Vitest's suite
  registration, see below) — **1992 passed**, 2 pre-existing failures unrelated to this
  story and not touched by it: `tests/core/wiki/module.test.ts` (MODULE-SCHEMA drift) and
  `tests/main/ipc/agents.test.ts` (leaks real `~/.claude`/Codex session data on this
  machine).
- `npm run format:check` — fails repo-wide (~190+ files, CRLF vs. Prettier's LF default
  on this Windows checkout), pre-existing per story 003, not a regression here.
- Live smoke test: `npm run seed && npm run shot`. Screenshots inspected directly
  (`.screenshots/19-project-detail.png`, `20-project-nostep.png`): status provenance
  ("Von dir gesetzt · 17. Aug. 2026"), next-step provenance ("Aus einem Vorschlag
  übernommen · 1. Aug. 2026") plus the "Möglicherweise veraltet" stale badge and its
  explaining line all render correctly on a hand-stamped demo-vault project; the honest
  fallback ("Herkunft nicht erfasst · zuletzt berührt vor 3 Tagen") renders on a project
  with no recorded provenance, with no stale claim next to its empty next step. No model
  is configured in the demo vault, confirming AC 8 live, not just by inspection.
  `.screenshots/a11y.json`: 0 axe violations across all 38 screens/states, including
  `project-detail` and `project-nostep`. No new console errors.
- Environment note (not a defect in this story): a transient "Vitest failed to find the
  current suite" failure appeared repo-wide partway through this build, traced to
  another deliverable's agent switching Node versions mid-session (see D3's report); it
  cleared after a cache-cold run and did not recur. Separately, running `vitest` through
  the Bash tool's git-bash cwd (`c:/...` vs `C:/...`) can reproduce a similar-looking
  failure that does not occur via PowerShell — noted for future stories in this repo, not
  fixed here (no source change is implicated).

### Review

Delegated to `story-review-hard` against the full diff (D1–D6). Verdict: **PASS**, all 8
acceptance criteria PASS with file:line evidence, no test weakening, no scope creep, D2's
named risk (hash-guarded write path) specifically re-verified and confirmed safe. Six
findings (F1–F6, one medium, five low/nit) — F1 was a genuine correctness/guardrail-3 bug
and is fixed (see Decisions); F3/F4 were real test-coverage gaps and are fixed; F2 is a
documented spec deviation with reasoning; F5/F6 are accepted as-is with reasoning above.

### Commit message

```
004: project status/next-step provenance
```

### Changed files

`docs/VAULT-FORMAT.md`, `docs/requirements/004-project-status-provenance.md`,
`src/core/capture/apply.ts`, `src/core/index/projects.ts`,
`src/core/vault/frontmatter-order.ts`, `src/main/ipc/project-patch.ts`,
`src/main/ipc/projects.ts`, `src/renderer/components/NextStepEditor.tsx`,
`src/renderer/i18n/de-projects.ts`, `src/renderer/i18n/en-projects.ts`,
`src/renderer/lib/mock-fixtures.ts`, `src/renderer/screens/projects/ProjectHead.tsx`,
`src/renderer/screens/projects/ProjectOverviewTab.tsx`,
`src/renderer/styles/app/projects.css`, `src/shared/ipc.ts`, `src/shared/types/domain.ts`,
`tests/core/capture/apply.test.ts`, `tests/core/index/projects.test.ts`,
`tests/core/vault/frontmatter-patch.test.ts`, `tests/main/projects-ipc.test.ts`,
`tests/renderer/agents-project-detail.test.tsx`, `tests/renderer/ask.test.tsx`,
`tests/renderer/dashboard-fixtures.ts`, `tests/renderer/inbox.test.tsx`,
`tests/renderer/journal.test.tsx`, `tests/renderer/projects.test.tsx`.
