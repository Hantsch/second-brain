---
id: 068
title: Adding to a closed day reopens it
status: done # draft -> ready -> in-progress -> done
created: 2026-09-07
---

From the user's own feedback (2026-09-07): adding something to a journal day that is already
marked closed should reopen it automatically, with feedback that this happened — not stay silently
closed. Named in [ROADMAP.md](../ROADMAP.md) M15 as part of the milestone's deferred "second part"
("re-indexing a day that was added to after it was closed"), never cut as its own story until now.

Investigated the same day: `JournalDay.closed` (`src/core/index/journal.ts:162`) is set by
`setClosed()` (`src/core/journal/closed.ts:26-39`), manually via the "Wieder öffnen" ghost button
(`src/renderer/screens/journal/JournalScreen.tsx:274-282`) or automatically on day-close-out accept
(`src/main/ipc/journal-day.ts:184-315`). No write path clears it on new content — checked every
writer in `src/main/ipc/journal.ts`: `journal:append`, `journal:setDay`, `journal:setMood`,
`journal:coach`, `journal:answerLooseEnd` all leave `closed` untouched. `DayEntry.tsx` renders the
text field, mood picker and coach composer unconditionally on a closed day, so writing into one is
possible and produces no reaction at all.

## Requirement

Once a day is closed, adding real content to it — the day's own text, a mood/energy change, a
coach turn, or an answer to a loose end that lands on that day — reopens it automatically, and the
user is told this happened. A closed day that silently absorbs new writing without ever showing
that state changed is misleading: the "finished on …" badge keeps claiming a state that is no
longer true.

## Acceptance Criteria

- [x] **AC1** — Appending new content to a closed day through any of its write paths (day text,
      mood/energy, coach conversation, an answered loose end landing on that day) clears the day's
      `closed` field.
- [x] **AC2** — The reopening is visible without navigating away and back: the "finished on …" badge
      is gone and the day reads as open immediately after the write that caused it.
- [x] **AC3** — The user gets explicit feedback that the day was reopened as a side effect of their
      write (not just the badge disappearing silently) — e.g. a toast or inline notice naming what
      happened.
- [x] **AC4** — A no-op save (re-saving unchanged text, opening the day without editing it) does not
      reopen a closed day — only an actual new write does.

## Plan

1. **Core — the conditional reopen.** New `src/core/journal/reopen.ts` with
   `reopenIfClosed(store, date, { expectedHash })` → `{ reopened: boolean; hash: string }`: reads
   the day, returns `reopened: false` with the unchanged hash when `closed` is already `null`,
   otherwise writes `frontmatter: { closed: null }` hash-guarded (same contract as
   `closed.ts#setClosed`) and hands back the _new_ hash. Exported via `src/core/journal/index.ts`.
   It writes directly instead of calling `setClosed` because the caller needs the post-write hash,
   which `setClosed` does not return.

2. **Main — wire it behind every content write** (`src/main/ipc/journal.ts`, one local helper
   `reopenAfterWrite(services, store, date, hash)`): call `reopenIfClosed` after the content write
   succeeded, **before** `settle()` so the index refresh already sees the cleared field, then emit
   `event:toast` (`kind: 'info'`, `message: 'toast.journalReopened'`) once when it reopened. The
   helper's returned hash replaces the `hash` in the channel's response, so the renderer never
   keeps a pre-reopen hash.
   Wired into: `journal:append`, `journal:setDay`, `journal:setMood`, `journal:answerLooseEnd`,
   `journal:interviewAnswer`, and the coach path (`runCoach` plus the `onFailure` branch — the
   user's own turn is written before the model is asked).
   Change-guard for AC4: `setDay` only reopens when `withDayText(...)` differs from the body
   `ensureDay` just read; `setMood` only when a mood/energy value actually differs from the day it
   just read. The other four refuse empty text upstream, so a successful call is new content.
   Not touched: `journal:applyClose`, `journal:foldDay`, `journal:setClosed`.

3. **Renderer — text only.** New key `toast.journalReopened` in `src/renderer/i18n/de.ts` and
   `en.ts`, next to the existing `toast.*` block. No component change: the toast host
   (`lib/events.ts:88` → `pushToast`) and the badge refresh via `event:vault-changed` /
   `refreshDay` already exist; AC2 is verified, not built.

4. **Tests** — unit for the core helper, main-level per-write-path coverage in
   `tests/main/journal-ipc.test.ts` (real temp vault, fake `sendEvent`), and one e2e spec over the
   seeded closed days (offsets -7 and -13 in `scripts/seed/journal.mjs`).

## Deliverables

- [x] **D1 — `reopenIfClosed` in the core.** New `src/core/journal/reopen.ts`, exported from
      `src/core/journal/index.ts`. Mirror `src/core/journal/closed.ts` (hash contract, doc-comment
      style). Test: `tests/core/journal/reopen.test.ts` — a closed day loses `closed` and reports the
      new hash, an already-open day is not written at all, a stale `expectedHash` raises `conflict`, a
      missing day raises the same error `requireDay` already raises.
      Acceptance: those four cases green, no other file touched.

- [x] **D2 — every journal write path reopens and says so.** `src/main/ipc/journal.ts` only (plus the
      local helper in it): `journal:append`, `journal:setDay`, `journal:setMood`,
      `journal:answerLooseEnd`, `journal:interviewAnswer`, `journal:coach` (success **and**
      `onFailure`). Response hashes replaced with the post-reopen hash; `event:toast`
      (`toast.journalReopened`) emitted exactly once per reopening write. Change-guards per plan step 2
      for `setDay` and `setMood`. Test in `tests/main/journal-ipc.test.ts` (mirror its existing
      append/setDay/setMood/coach cases and their temp-vault setup): one case per write path that a
      closed day ends up `closed: null` and the toast event fired; plus the two AC4 cases (identical
      day text, identical mood) leaving `closed` untouched and no toast; plus one case that the hash
      returned by `journal:setDay` on a closed day is usable for the next save (no false `conflict`).
      Acceptance: `npm test` green including the pre-existing journal IPC and gardener-flow tests.

- [x] **D3 — the feedback the user sees.** `src/renderer/i18n/de.ts`, `src/renderer/i18n/en.ts` (key
      `toast.journalReopened`; German with `„…“` if it ever needs quotes) and new
      `tests/e2e/journal-reopen.spec.ts` (mirror `tests/e2e/journal-close.spec.ts`: `specId`,
      `isoDayOffset`, `dayPath`, the `app`/`vault` fixtures).
      Acceptance: e2e — on the seeded closed day at offset -7, typing into the day text and saving
      makes the "finished on …" badge disappear without navigating away, shows the reopened toast, and
      leaves `closed: null` on disk; on the closed day at offset -13, focusing and leaving the text
      field without editing keeps the badge and `closed` on disk unchanged.

## Model Hints

- D2 → `deliverable-hard` — the hash chain: the reopen is a second write on the same file, so every
  one of the six paths has to hand the _post_-reopen hash back or the renderer's next save turns
  into a false `conflict` on the app's most sensitive file, and the coach path does its write inside
  a background stream with a separate failure branch.
- D1, D3 → default.
- Review: → `story-review-hard` — the diff sits on the write path of every journal channel; the
  failure this has to catch is a silently broken stale-hash guard (guardrail: no write path
  overwrites the user's edits), which a cheap review reads past.

## Acceptance Tests

- AC1 → unit `tests/core/journal/reopen.test.ts` › "a closed day loses its closed field" and main
  `tests/main/journal-ipc.test.ts` › "every journal write path reopens a closed day" (one case per
  path: append, setDay, setMood, coach, answerLooseEnd, interviewAnswer) — the IPC layer against a
  real temp vault, no user surface involved.
- AC2 → e2e `tests/e2e/journal-reopen.spec.ts` › "writing into a closed day drops the finished badge
  without navigating away".
- AC3 → e2e `tests/e2e/journal-reopen.spec.ts` › "the reopening is announced as a toast", plus main
  `tests/main/journal-ipc.test.ts` › "a reopening write emits one journal-reopened toast".
- AC4 → main `tests/main/journal-ipc.test.ts` › "an unchanged day text and an unchanged mood leave
  the day closed" and e2e `tests/e2e/journal-reopen.spec.ts` › "opening a closed day without editing
  keeps it closed".

No manual residue.

## Open Questions

- ~~Exact definition of "new content" per write path — does an empty/whitespace-only day-text save
  count, does a mood-only touch with no text change count?~~ answered → Decisions (Sprint)
- ~~The close-out summary itself (the proposal text generated when the day was closed) — is it
  regenerated by this story or left as historical record?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Close-out summary: leave it as the historical record of that close-out; regenerating
  or correcting it is a separate, already-named M15 item, not folded into this story.
- "New content" means the write actually changed something: `journal:setDay` reopens only when the
  resulting body differs from the one just read, `journal:setMood` only when a mood/energy value
  differs from the stored one — that is exactly AC4's "no-op save", and it settles the
  empty-stays-empty case without a special rule.
- Clearing existing day text counts as a change and reopens the day, because after the content
  changed the badge's claim "finished on …" is no longer true either.
- `journal:append`, `journal:coach`, `journal:answerLooseEnd` and `journal:interviewAnswer` reopen
  unconditionally, since each already refuses empty text upstream, so any successful call is new
  content by construction.
- `journal:append` and `journal:interviewAnswer` are covered too although AC1 names only four
  surfaces: both write the user's own prose into the day, and leaving them out would keep exactly
  the silently-closed hole this story exists to close.
- `journal:applyClose`, `journal:foldDay` and `journal:setClosed` are excluded: the first two add no
  new content (close-out result, restructuring of text that is already there), the last is the
  manual switch itself.
- The feedback for AC3 travels as the existing `event:toast` event with a new i18n key instead of a
  new field on the write responses, because the coach path writes inside a background stream and has
  no response to carry a flag — this keeps one mechanism for all six paths and the IPC contract
  unchanged.
- The reopen is a second, hash-guarded frontmatter write after the content write, and its resulting
  hash replaces the hash in the channel's response — otherwise the renderer keeps the pre-reopen
  hash and the user's next save fails as a false `conflict`.
- The toast text names no date: `event:toast` carries no `values`, and the day being reopened is the
  one on screen, so a generic sentence stays honest without extending the event payload.
- The coach failure branch (`onFailure`, no model configured or a stream error) reopens as well,
  because the user's own turn is written to the file before the model is asked and is new content
  regardless of whether an answer ever arrives.

## Done

New `src/core/journal/reopen.ts` clears a closed day's `closed` field hash-guarded and returns the
post-write hash. `src/main/ipc/journal.ts` wires it behind all six content write paths
(`append`, `setDay`, `setMood`, `answerLooseEnd`, `interviewAnswer`, `coach` success + `onFailure`)
via a local `reopenAfterWrite` helper, replacing each response's hash with the post-reopen one and
emitting `event:toast` (`toast.journalReopened`) exactly once per reopening write. `setDay` and
`setMood` are change-guarded so a no-op save leaves a closed day closed (AC4). New i18n key
`toast.journalReopened` in `de.ts`/`en.ts`, new e2e spec `tests/e2e/journal-reopen.spec.ts` over
the seeded closed days (offsets -7/-13).

**Commit message:** `068: adding to a closed day reopens it`

**Verification:**

- `npm run build` — green.
- `npm test` — 254 files / 3607 tests, all green (incl. 4 new core unit tests, 10 new main IPC
  tests).
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run format:check` — the seven files this story touched are prettier-clean; the command
  reports 240 pre-existing files repo-wide with CRLF-related warnings, unrelated to this story
  and present before it started.
- `npm run test:e2e` — 9/9 passed, including the 2 new `journal-reopen.spec.ts` cases.
- Review: `story-review-hard` agent, verdict **PASS**. Independently re-ran the full test suite,
  the e2e spec, typecheck and lint.

**AC → test mapping, as verified:**

- AC1 → `tests/core/journal/reopen.test.ts` ("a closed day loses its closed field") + one case per
  write path in `tests/main/journal-ipc.test.ts` — all green.
- AC2 → `tests/e2e/journal-reopen.spec.ts` › "new content in the field reopens the day, visibly and
  on disk" — passed.
- AC3 → same e2e spec (toast visible) + `tests/main/journal-ipc.test.ts` (toast fired exactly once
  per reopening write) — both green.
- AC4 → `tests/main/journal-ipc.test.ts` (unchanged day text / unchanged mood leave `closed`
  untouched, no toast) + `tests/e2e/journal-reopen.spec.ts` › "leaving the field untouched reopens
  nothing" — all green.

No manual residue.

**Findings from review, left unfixed with reasons (verdict was PASS, not blocking):**

- The AC4 e2e case exercises "no interaction" rather than "identical text re-saved" (the Save
  button only enables on an actual draft change), so it proves the editor doesn't autosave rather
  than exercising the `setDay`/`setMood` change-guards directly. Not fixed: those guards are
  already proven directly, with real same-value saves, by the two AC4 cases in
  `tests/main/journal-ipc.test.ts`; the e2e case still correctly proves the user-facing behaviour
  the AC describes.
- `coach`'s `onFailure` branch reopens unconditionally, but `coach()` can in theory throw before
  writing the user's turn (e.g. `ensureDay` failing before the write, in `tips`/`analyze` mode) —
  in that narrow case a closed day would reopen without new content actually landing. Not fixed:
  this requires a store-level failure on an otherwise-successful precondition, is not the AC4
  scenario (no-op save with normal input), and threading a "did we write" flag through `coach()`'s
  result type for this edge case was judged a larger, separate change than this story's scope.
  Left as a known limitation.
- A narrow race exists where an external file change between the content write and the reopen
  write makes `reopenIfClosed` throw `conflict` after the user's content already landed, surfacing
  as a failed response for what was actually a successful write. Not fixed: this is the same
  hash-guard behaviour the rest of the app relies on for conflict detection, the window is a single
  IPC round-trip, and loosening the guard would reopen the exact silent-overwrite risk guardrail 2
  exists to prevent.
- The hash-chain "reused for a follow-up save without a false conflict" case is asserted only for
  `journal:setDay`, not for all six paths. Not fixed: no renderer consumer reads the response hash
  of the other five paths today (they invalidate via query instead), so the risk is currently
  theoretical; noted for whoever adds such a consumer later.
- The added `console.warn` log line is German, matching the existing sibling message in
  `llm-stream.ts`. Not fixed: consistent with local precedent at the point it was added; the
  broader German-comments-in-core pattern predates this story and is out of scope here.
