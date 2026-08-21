---
id: 015
title: A near-duplicate can be resolved, not only compared
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-13
---

## Requirement

The maintenance run reports two pages of the same module as a near-duplicate. In my vault
today that is
`modules/confyui/wiki/sources/s-2026-08-13-the-best-local-ai-video-generator-just-got.md`
and the same file with `-2` appended — one YouTube video, ingested twice, 100 % shared word
sequences. Not two takes on a topic. One of them is waste.

The card offers me exactly one action: "Beide Seiten vergleichen". It opens both files and
writes nothing — which is honest, and which is where the app stops. From there I have no
way forward inside the app:

- I cannot discard one of the two pages. The screen has no such action anywhere.
- I cannot say "both stay, the newer one supersedes the older one" either. That gesture
  exists, but only on the contradiction card
  ([ContradictionCard.tsx](../../src/renderer/screens/garden/ContradictionCard.tsx)) —
  a near-duplicate does not get it.
- And even if I write `supersedes` into the frontmatter by hand, the finding comes back
  unchanged on the next run: the near-duplicate check does not read named relations at all
  ([near-duplicate.ts](../../src/core/gardener/checks/near-duplicate.ts)).

So the only exit the app leaves me is "Passt so" — which says "this is not a problem". It
is a problem. I am being pushed into telling the app a lie so the card goes away.

I want two honest ways out of a near-duplicate, and I want to be the one who picks:

**Discard one of the two.** I say which page goes. It goes to the trash with a way back,
like everything else the app removes. Before I decide, the card tells me what discarding
costs: how many other pages link to that page, so I do not silently create broken links.

**Keep both, name the relation.** The newer page supersedes the older one — written to the
frontmatter, both files stay, exactly the gesture the contradiction card already makes.
And once a pair carries a named relation, the next run does not report it again: the
question "is this already settled?" has an answer in
[relations.ts](../../src/core/gardener/relations.ts), the near-duplicate check just never
asks it.

What must not change: the app never picks a winner. It never merges two pages into one. It
does not decide which of my two files is the real one — that is exactly the decision the
current wording promises to leave to me ("Zusammengeführt wird nichts automatisch — das
entscheidet ein Mensch"), and it stays true.

Note on the cause: two ingests of the same video should not produce two pages in the first
place. That is the ingest pipeline's job
([fingerprint.ts](../../src/core/ingest/fingerprint.ts),
[queue.ts](../../src/core/ingest/queue.ts)) and is being worked on separately. This story is
about the duplicates that are already in the vault — prevention does not clean up.

Related: the delete path exists end to end and no screen uses it —
`vault:delete` ([ipc.ts:165](../../src/shared/ipc.ts#L165)), handler with trash and undo
token ([vault.ts:58-61](../../src/main/ipc/vault.ts#L58-L61)), client
[api.ts:44](../../src/renderer/lib/api.ts#L44).

## Acceptance Criteria

- [ ] The near-duplicate card offers, per page, a way to discard **that** page — the file
      name is visible on the action, so I never discard the wrong one by mistake.
- [ ] Before I discard, the card says how many other pages link to that page. If it is
      linked, discarding is still possible — but not by accident.
- [ ] Discarding moves the file to the trash and is undoable from the outcome strip, with
      the same guarantees as every other maintenance write.
- [ ] The card offers "the newer one supersedes the older one" as the second way out: it
      writes `supersedes` into the newer page's frontmatter, both files stay, and the
      preview names the file and the field before I click.
- [ ] The near-duplicate check does not report a pair again once one page names the other
      via `contradicts`, `supersedes`, or `extends` — using the answer
      [relations.ts](../../src/core/gardener/relations.ts) already gives, not a second
      notion of "settled".
- [ ] A relation typed into the file by hand in Obsidian silences the finding exactly like
      a click in the app does.
- [ ] Nothing is merged, and the app never chooses which page goes. Every action names its
      target file before it runs.
- [ ] Every action that writes or deletes lands in the module log, like the existing fixes
      ([fixes.ts](../../src/core/gardener/fixes.ts)).
- [ ] After the file is gone, a new run no longer reports the pair — the run recomputes
      from the files, and that stays the source of truth.
- [ ] Writing with a stale hash gets a `conflict` instead of overwriting; a file edited
      since the run was made is not silently discarded either.
- [ ] Works with no model configured — this is a decision over files, no judgement.
- [ ] Labels go through `t()`, in `de` and `en`. Sentence case, no emoji, one accent.
- [ ] Tests: discard with undo, supersede with undo, the check staying quiet on a named
      relation, and the stale-hash conflict.

## Open Questions

Decided (2026-08-13): the human picks which page goes · nothing is merged · the trash plus
undo is the delete path · a named relation settles the pair for the check.

~~Does discarding a page also remove its catalog line?~~ answered → Decisions (Sprint)
~~What about the inbound links of a discarded page?~~ answered → Decisions (Sprint)
~~Which page is "the newer one"?~~ answered → Decisions (Sprint)
~~Does the discard action belong only to the near-duplicate card?~~ answered → Decisions (Sprint)
~~Does the raw source under `raw/` go too?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Does discarding a page also remove its catalog line in `wiki/index.md`?: Yes —
  the same action removes the page and its catalog line, so the resolution does not create a
  `stale-entry` finding on the very next run. The confirm step names both files.
- **(User)** What happens to the inbound links of a discarded page?: Offer to repoint them at
  the surviving page as part of the same action, human-confirmed. Not silent, not left broken.
- **(User)** Which page counts as "the newer one" for supersede?: Frontmatter `created` — an
  existing, portable vault field. The user can still flip the direction before confirming.
- **(User)** Does the discard action belong only to the near-duplicate card?: No — it belongs to
  every finding that names a page, with the same wording (shared with [016](016-orphan-page-i-pick-the-target.md)).
- **(User)** Does the raw source under `raw/` get discarded too?: No — `raw/` is the immutable
  ingest archive; only the derived wiki page is cleaned up.
- Both new actions get their **own IPC channels** instead of new `GardenerFix` actions: each one
  is parameterised by the user (which page goes, which direction the supersede runs), so it
  cannot be derived from the finding the way a one-click fix is.
- The **confirm text is computed by the writing code** (`discardPlan`), not assembled in the
  renderer — a preview from a second source of truth is a promise the write does not keep.
- The main handler **only accepts a path the current report names in a finding** — a path coming
  from the renderer must never decide on its own which file is deleted (the same stance as the
  comment in `fixes.ts` about `add-to-index`).
- **One undo token for the whole discard:** the existing fix journal carries the delete token, so
  `gardener:undoFix` restores repointed links, catalog line and file in one step and the outcome
  strip keeps its single way back.
- **Content writes happen before the delete:** a stale hash aborts the action while both files
  are still there, so a `conflict` can never leave a half-discarded pair behind.
- **Supersede runs through the core, not through the renderer's `savePage`** as the contradiction
  card does today — only then does it land in the module log and get the journal-based undo the
  acceptance criteria ask for. The contradiction card's existing path stays untouched here (no
  regression risk) and is recorded as a follow-up.
- If `created` is missing or equal on both pages, the card offers **no default direction** and
  asks which page is the newer one — a guessed direction would be the app picking a winner.
- The **`merge` fix ("compare both pages") stays** on the near-duplicate finding; the two new
  ways out sit beside it, so nothing that works today is taken away.
- **Only whole wikilink targets are repointed** (`[[slug]]`, `[[slug|alias]]`); surrounding user
  text is never rewritten, and `raw/` plus `sources:` frontmatter are left alone.
- The repoint is **opt-in in the dialog**, pre-checked only when a surviving page is named and
  the page really has inbound links; where no surviving page exists (016's orphan case) it is not
  offered and the dialog says plainly which links would break.
- The shared discard action lives in **`src/renderer/components/`**, not in `screens/garden/`,
  because 016 mounts it on another card — a card-local component would have to be moved a sprint
  later.
- The pair is silenced when **either** page names the other, via `namesContradiction`
  (frontmatter fields plus the "Widersprueche"/"Contradictions" section, both document
  languages) — the same helper the contradiction check uses, so a relation typed in Obsidian
  counts exactly like a click.
- The **demo vault gets a near-duplicate pair** in the seed: without one, neither `npm run shot`
  nor the manual acceptance has a finding to act on.
- **No LLM anywhere in these paths** — discard and supersede are decisions over files, so the new
  code never touches the gateway and its tests run with no model configured.

## Plan

Two new ways out of a near-duplicate, both as **core** actions with the guarantees the existing
fixes already have: read fresh, hash-guarded write, journal plus undo token, `lint` entry in the
module log ([fixes.ts](../../src/core/gardener/fixes.ts)). The existing "compare both pages" fix
stays as it is; the new actions sit beside it.

1. **Catalog** — `removeEntries` next to `upsertEntries` in
   [index-md.ts](../../src/core/wiki/index-md.ts): takes one slug out of `wiki/index.md` and
   leaves every other line as written (D1).
2. **Check** — [near-duplicate.ts](../../src/core/gardener/checks/near-duplicate.ts) asks
   `namesContradiction` in both directions and drops the pair when either page names the other
   (D2). The frontmatter it needs is already in `ctx.index.index().byPath`.
3. **Proposal** — new `core/gardener/discard.ts`: `discardPlan(store, { path, keep? })` reads the
   page and says what discarding costs — the inbound pages, the catalog line that goes, the
   repointed link lines (D3). Read-only; this is exactly the text the confirm step shows.
4. **Write** — `discardPage` applies that plan (D4): repoints and catalog line first
   (hash-guarded, a `conflict` aborts before anything is deleted), then `store.delete` into the
   trash. One journal, extended with the delete token, so `undoFix` puts content and file back
   under a single token.
5. **Supersede** — new `core/gardener/supersede.ts` writes `supersedes: [slug]` into the newer
   page, hash-guarded, journal plus log (D5). The direction comes from the caller; the write path
   derives nothing.
6. **Contract** — `gardener:discardPlan`, `gardener:discardPage`, `gardener:supersede` in
   [ipc.ts](../../src/shared/ipc.ts), handlers in
   [gardener.ts](../../src/main/ipc/gardener.ts), client in
   [api.ts](../../src/renderer/lib/api.ts) plus hooks (D6). The handler validates every path
   against the persisted report.
7. **Shared discard action** — `components/DiscardPageAction.tsx` (D7): the file name on the
   button, a dialog with the plan, the inbound count, the opt-in repoint, one confirm. In
   `components/` because [016](016-orphan-page-i-pick-the-target.md) reuses it.
8. **Card** — `screens/garden/NearDuplicateCard.tsx` (D8): both pages side by side, a discard
   action per page, the supersede button with a flip control; wired into
   [FindingList.tsx](../../src/renderer/screens/garden/FindingList.tsx) and the outcome strip.
9. **Demo and tests** — a near-duplicate pair in the seed, renderer tests for both ways out (D9).

Order: D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 → D9. D1–D5 are core only, D6 is the contract,
D7–D9 the surface.

## Deliverables

**D1 — A catalog line can be removed again**
`src/core/wiki/index-md.ts`, `src/core/wiki/index.ts`, `tests/core/wiki/index-md.test.ts`.
Mirror: `upsertEntries` in the same file.
Accepted when: `removeEntries(content, slugs, options)` removes exactly the entry lines of the
given slugs, returns the input unchanged when there is nothing to remove, and keeps headings,
hand-written lines and every other entry byte-identical — with a test for each of the three.

**D2 — A named relation silences the pair**
`src/core/gardener/checks/near-duplicate.ts`, `tests/core/gardener/checks-similarity.test.ts`.
Mirror: how the contradiction check uses `namesContradiction` (`checks-links.test.ts`).
Accepted when: a pair is not reported if either page names the other via `contradicts`,
`supersedes` or `extends` in the frontmatter or in the "Widersprueche"/"Contradictions" section;
the check calls `relations.ts` and introduces no second notion of "settled"; a relation written
by hand into the fixture file has the same effect as one written by the app. (AC 5, AC 6)

**D3 — Discarding says what it costs (proposal only)**
new `src/core/gardener/discard.ts`, `src/core/gardener/index.ts`, new
`tests/core/gardener/discard.test.ts`. Mirror: `readCurrent`/`refOf` in `fixes.ts`.
Accepted when: `discardPlan(store, { path, keep? })` returns the page ref, the inbound pages
(from the index graph), the catalog path plus the exact catalog line that would go, and — when
`keep` is given — one repoint entry per inbound page with the line before and after; it writes
nothing, and it fails with `not-found`/`invalid` for a path that is no wiki page. (AC 2, AC 7)

**D4 — Discarding a page, undoable**
`src/core/gardener/discard.ts`, `src/core/gardener/undo.ts`, `tests/core/gardener/discard.test.ts`.
Mirror: `commit()` in `fixes.ts` for journal, hash guard and `appendLog`.
Accepted when: `discardPage` applies its own plan — repoints and catalog line written with
`expectedHash` from the content just read, then `store.delete` — a stale hash on any file raises
`conflict` **before** the delete, the module log gets one `lint` entry naming the action, and
`undoFix(token)` restores the repointed pages, the catalog line and the file itself (`kept` for
anything edited since). Tests: discard with undo, discard with repoint, stale-hash conflict
leaves both files in place, undo twice changes nothing. (AC 3, AC 8, AC 10)

**D5 — The newer page supersedes the older one**
new `src/core/gardener/supersede.ts`, `src/core/gardener/index.ts`, new
`tests/core/gardener/supersede.test.ts`.
Mirror: `markReviewed` in `fixes.ts` — a frontmatter-only write via `composeContent`.
Accepted when: the caller names newer and older page; the slug is appended to the newer page's
`supersedes` (existing values kept, no duplicate), both files stay, the write is hash-guarded,
the module log gets its `lint` entry, and the journal token undoes it. A pair that already names
the relation returns `invalid` instead of writing. (AC 4, AC 8, AC 10)

**D6 — The three channels**
`src/shared/ipc.ts`, `src/shared/types/overview.ts` (plan and result types),
`src/main/ipc/gardener.ts`, `src/renderer/lib/api.ts`, `src/renderer/lib/queries/gardener.ts`,
IPC coverage test under `tests/main/`.
Mirror: the `gardener:applyFix` / `gardener:undoFix` block in all five files.
Accepted when: `gardener:discardPlan`, `gardener:discardPage` and `gardener:supersede` exist end
to end (contract, handler, preload allowlist via `IPC_CHANNELS`, typed client, hook); every
handler rejects a path that no finding of the persisted report names; after a write it runs
`settle(...)` with the touched **and** the deleted path and wakes the screen, so the next run
recomputes from the files; `undoFix` keeps working unchanged for the existing fixes.
(AC 3, AC 4, AC 9)

**D7 — The shared "discard this page" action**
new `src/renderer/components/DiscardPageAction.tsx`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `src/renderer/styles/app/garden.css`.
Mirror: the `Dialog` usage in `src/renderer/screens/ask/ThreadList.tsx`, card wording in
`FindingCard.tsx`.
Accepted when: the button carries the file name of the page it discards; the dialog shows the
plan from D3 — the inbound count as a sentence, the catalog line, the repoint checkbox (offered
only with a surviving page) — and nothing is written before the confirm; every string goes
through `t()` in `de` and `en`, sentence case, no emoji, one accent, tokens only; the component
takes target and optional surviving page as props, so 016 can mount it on another card.
(AC 1, AC 2, AC 7, AC 11, AC 12)

**D8 — The near-duplicate card**
new `src/renderer/screens/garden/NearDuplicateCard.tsx`,
`src/renderer/screens/garden/FindingList.tsx`, `src/renderer/screens/garden/GardenScreen.tsx`,
`src/renderer/screens/garden/OutcomeStrip.tsx`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`.
Mirror: `ContradictionCard.tsx` (two sides via `useModulePage`, `extraActions`).
Accepted when: the card shows both pages with title, path and `created`; a discard action per
page (D7); a supersede button that names newer and older file with a flip control, and no default
direction when `created` is missing or equal; the outcome strip gets a `discarded` outcome that
says the file went to the trash (not "written") and offers undo via `gardener:undoFix`; the
"compare both pages" fix and "fine as it is" stay reachable. (AC 1, AC 3, AC 4, AC 7, AC 11)

**D9 — A real pair in the demo vault, and tests around the card**
`scripts/seed/wiki.mjs` (or the matching module seed file), `tests/renderer/garden.test.tsx`.
Mirror: the existing seed pages and the card tests in `garden.test.tsx`.
Accepted when: `npm run seed` produces two nearly identical source pages in one module that the
run reports as a near-duplicate; renderer tests cover discard (dialog, confirm, outcome, undo),
supersede (preview names file and field, outcome, undo) and a `conflict` becoming visible;
`npm run verify` is green.

**AC coverage:** AC1 → D7/D8 · AC2 → D3/D7 · AC3 → D4/D6/D8 · AC4 → D5/D6/D8 · AC5 → D2 ·
AC6 → D2 · AC7 → D3/D7/D8 · AC8 → D4/D5 · AC9 → D6 (index and report follow-up) ·
AC10 → D4/D5 · AC11 → D3–D5 (no gateway in these paths, tested without a model) · AC12 → D7/D8 ·
AC13 → D2/D4/D5/D9.

## Model Hints

D1 → default. D2 → default. D3 → default. D5 → default. D6 → default. D7 → default.
D8 → default. D9 → default.

D4 → deliverable-hard — the only new **destructive** path in the vault, and it extends `undo.ts`,
which every existing fix depends on: getting the order (content writes before the delete), the
single token or the hash guard wrong either breaks undo for all current fixes or leaves a
half-discarded pair behind.

Review: → story-review-hard — the story adds a delete path plus two write paths into the user's
vault; a review that misses a missing hash guard or a non-restorable undo costs data, not a
rework.

## Test Plan (manual acceptance)

Prerequisite: `npm run seed`, then start the app with `npm run dev`.

1. Open **Maintenance**, click "Check now". A near-duplicate finding appears for the seeded pair,
   with both files listed on the card.
2. Read the card: both pages side by side with their `created` date, one discard button **per
   page** with the file name on it, a supersede button naming newer and older page, plus the
   existing "compare both pages" and "fine as it is".
3. Click the discard button of the **second** page. The dialog names that file, says how many
   other pages link to it, shows the catalog line that will be removed, and offers the repoint
   checkbox. Cancel — nothing has changed on disk.
4. Open it again, leave the repoint checkbox on, confirm. The outcome strip says the file moved
   to the trash and names the catalog file too. Check in the file manager: the page is gone from
   `modules/<module>/wiki/`, a copy sits under `.secondbrain/trash/<token>/`, its line is out of
   `wiki/index.md`, and `wiki/log.md` has a new `lint` line.
5. Click **undo** in the strip. The page is back, the catalog line is back, the repointed link
   points at the old target again. `wiki/log.md` keeps both entries (append-only).
6. Run the check again — the pair is reported again, because both files are back.
7. Now use **supersede**. Before the click, the preview names the file and the field
   (`supersedes: [...]`). Confirm: both files still exist, the newer one carries the field,
   `wiki/log.md` has an entry. Undo puts the frontmatter back.
8. Confirm supersede again, then run the check: the pair is **not** reported any more.
9. Remove the `supersedes:` line in an editor and instead type `extends: [<other-slug>]` into the
   other page by hand. Run the check: the pair stays silent.
10. Stale hash: run the check, then edit one of the two pages in an editor (add a line) **without**
    running the check again, and click discard on that page. The card shows a conflict; the file
    is still there.
11. Language: switch the UI to German and walk steps 2–4 again — every label is German, sentence
    case, no emoji.
12. No model: set the vault to "no model configured" and repeat steps 2, 4 and 7 — both ways out
    work unchanged.
13. `npm run verify:ui` — the maintenance screenshot shows the new card with both ways out.

## Done

<Filled by `/ai-scrum:build 015`.>
