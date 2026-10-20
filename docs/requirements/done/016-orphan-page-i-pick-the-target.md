---
id: 016
title: An orphaned page can be linked where I say, not only where it is obvious
status: done # draft -> ready -> in-progress -> done
created: 2026-08-13
---

## Requirement

The maintenance run tells me a page is orphaned: no other wiki page links to it, so nobody
finds it by following links. Fair. Then it offers me nothing to do about it.

The reason is a deliberate rule in the check
([orphan.ts](../../src/core/gardener/checks/orphan.ts)): the "Verweis eintragen" fix only
appears when there is **exactly one** other page in the module that mentions the title
without linking it. One unambiguous place, one line appended. With zero candidates or with
several, the finding comes without a fix — because the app must not guess which file it
writes into.

The rule is right. The consequence is not: for a freshly condensed source page nobody
mentions it yet, so it is always zero candidates, so the card always ends up with "Im
Editor öffnen" and "Passt so". Three of the four findings from my last run look exactly
like that. And "Passt so" is the wrong sentence — the page really is unreachable, I just
have no way to fix it from here.

The app does not need to guess. It needs to ask me. **I** know where the reference belongs:
in the module's overview, in the concept page the video is about, in a related source. So
when there is no unambiguous place, the card should let me pick the page — and then do
exactly what it does today: append the one line it showed me, into the file I chose.

The promise the card makes stays intact either way. The preview is the line that gets
written, and the file named above it is the file it goes into. The only thing that changes
is who names the file.

Second thing, for source pages: a page counts as referenced when another page cites it in
its `sources:` frontmatter, not only when a wikilink in the body points at it
([orphan.ts:14-16](../../src/core/gardener/checks/orphan.ts#L14-L16)). For a source page,
"this page cites that source" is often the truer statement than a "Bezug:" line at the
bottom of the body. That should be reachable from the card too.

And where nothing links to a page because nothing should — a page that turned out to be
junk — the way out is discarding it, which story 015 introduces. The two cards should offer
that the same way, not two different ones.

Related: the line that gets appended is built in
[relations.ts](../../src/core/gardener/relations.ts) (`relatedLine`), written by
`add-links` in [fixes.ts](../../src/core/gardener/fixes.ts), and the card's promise about
the target file is mirrored in
[garden/fixes.ts](../../src/renderer/screens/garden/fixes.ts) (`writeTargetOf`).

## Acceptance Criteria

- [x] When there is exactly one unambiguous place, nothing changes: the card behaves as it
      does today, one click, no picker.
- [x] When there is no unambiguous place, the card lets me choose the page the reference is
      written into, instead of offering no fix at all.
- [x] The picker lists the pages of the same module, is searchable by title, and leaves out
      the orphaned page itself and every page that already links it.
- [x] After I pick, the card shows the exact line that will be appended and names the file
      it goes into — the same promise as today, with my file in it.
- [x] The line is appended, never inserted into an existing user line
      ([VAULT-FORMAT.md](../VAULT-FORMAT.md), "Was die App niemals tut").
- [ ] ~~For a source page, the card also offers to cite it in the chosen page's `sources:`
      frontmatter — the reference form the check already counts.~~ **Out of scope** by user
      decision (see Decisions (Sprint)) — own story, different write path. Carried as a known
      gap, not delivered here.
- [x] Both ways are undoable from the outcome strip, land in the module log, and fail with
      `conflict` on a stale hash instead of overwriting.
- [x] Picking a page whose file changed since the run re-reads and re-checks before
      writing, like every existing fix does.
- [x] The next run no longer reports the page as orphaned — because the link is really
      there, not because anything was hidden.
- [x] The card no longer leaves "Passt so" as the only action on an orphan finding.
- [x] Works with no model configured — this is a link, not a judgement. No model suggests
      the target.
- [x] Labels go through `t()`, in `de` and `en`. The picker follows Gaston: one accent,
      sentence case, no emoji.
- [x] Tests: picker writes into the chosen file, stale-hash conflict, unchanged
      single-candidate path (the `sources:` variant moves out with the criterion above).

## Open Questions

Decided (2026-08-13): the app does not guess a target · the preview keeps naming the exact
file and line · the single-candidate path stays as it is.

~~Does the picker suggest an order?~~ answered → Decisions (Sprint)
~~Should the module overview be a one-click default?~~ answered → Decisions (Sprint)
~~Is the `sources:` variant part of this story or its own?~~ answered → Decisions (Sprint)
~~Does the picker reach across modules?~~ answered → Decisions (Sprint)
~~What happens to an orphan that should not exist?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Does the picker suggest an order?: Yes — overview page first, then pages sharing
  words with the orphan, then the rest. A suggested order, not a guessed target; the user still
  confirms.
- **(User)** Is the module overview a one-click default?: Yes — a second, explicit button for
  "link from the module overview" covers the common case without opening the picker.
- **(User)** Is the `sources:` frontmatter variant part of this story?: No — own story, out of
  scope here. Different write path, different preview shape. Recorded as a gap in the review.
- **(User)** Does the picker reach across modules?: No — within the module only. The check counts
  only within the module, so a cross-module link would look like a fix without resolving the
  finding.
- **(User)** What happens to an orphan that should not exist?: The shared discard action from
  [015](015-resolve-a-near-duplicate.md) appears here too, with the same wording.
- Candidates are fetched lazily over a new channel `gardener:orphanTargets`, not carried in the
  finding: a module with 200 pages would otherwise bloat every stored run in `gardener.json`.
- The ranking lives in core (`orphan-targets.ts`), not in the renderer: no renderer file imports
  `src/core/` today, and an order is logic, not view.
- `GardenerFinding` gets no new field — picker mode is exactly `kind === 'orphan' && fix === null`,
  which the check already produces, so the shared type and the stored runs stay untouched.
- The write gets its **own channel** `gardener:linkOrphan`, not a `target` on
  `gardener:applyFix` — same reasoning as [015](015-resolve-a-near-duplicate.md): a fix on
  `applyFix` must stay derivable from the finding, and this one is parameterised by the user.
- **Main**, not the renderer, re-derives the allowed target set and builds `paths` + `fix` before
  calling the existing core `addLinks`: a path from the renderer must never decide on its own
  which file is written to (the stance 015 took for its delete path).
- The previewed line comes from the same core call that lists the targets, so "the preview is the
  line that gets written" is true by construction instead of by two matching string builders.
- Ordering inside each rank group is by title, ascending: a stable, explainable order beats a
  score the user cannot reproduce.
- The picker stays within the finding's module and only over indexed wiki pages (`modules:pages`
  data), so it can never offer a `raw/`, journal or project file.
- No `sources:` frontmatter write path is prepared or stubbed — the future story gets a clean
  slate rather than half a mechanism to inherit.
- The discard action is 015's `components/DiscardPageAction.tsx`, mounted **without** a surviving
  page: for an orphan there is nothing to repoint to, and 015 already made that case say plainly
  which links would break (here: none).
- After the write the handler runs `settle(...)` over the touched path and wakes the screen, the
  same way 015's handlers do, so the next run recomputes from the files.
- Known gap to record in the sprint review: a source page cited only via another page's
  `sources:` frontmatter still needs the body-line form here; the check counts both, the card
  writes one.

## Plan

The check stays as it is. `singleMention` keeps its "exactly one" rule, so a finding either
arrives with a fix (unchanged one-click path) or without one — and `kind === 'orphan' && fix ===
null` becomes the signal for "the card asks me". Nothing in `GardenerFinding` changes.

Three seams:

1. **Core, new file `src/core/gardener/orphan-targets.ts`** — pure: takes the module's
   `WikiPage[]` plus the orphan and returns `{ line, targets }`. `line` comes from `relatedLine`
   — the same builder the existing fix uses. `targets` excludes the orphan itself
   and every page whose `outbound` contains its slug, and is ordered: overview page → pages
   sharing a mention word with the orphan (`mentionWords`, exported from `orphan.ts`) → the rest,
   each group by title.
2. **IPC/main** — two channels, mirroring 015's plan/apply pair. `gardener:orphanTargets`
   (`{ findingId }` → `{ line, targets }`) resolves the finding from the stored run, reads the
   module's pages from the index lists and calls the core function. `gardener:linkOrphan`
   (`{ findingId, target }` → the `applyFix` result shape) checks the finding id is known, its
   kind is `orphan`, its `fix` is `null` and the target is in the recomputed set, then builds
   `paths: [orphanPath, target]` plus `buildFix('add-links', relatedLine(...))` itself and calls
   the existing core `applyFix`. Undo token, module log, re-read and hash guard all come from that
   untouched path; `settle(...)` afterwards, like 015's handlers.
3. **Renderer, new `OrphanCard.tsx`** next to `ContradictionCard.tsx`, wired in `FindingList.tsx`
   by kind — `FindingCard`'s `children` slot carries the picker, `extraActions` the buttons. Two
   ways in: "link from the module overview" as one click when an overview target exists, and
   "choose a page" opening a searchable list (mirrors `ProjectLinkPicker` + `SessionLink`). After
   a pick the card shows the exact `line` and the chosen file, and only then the confirm button.

Order: D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8. D6 depends on 015 having shipped the shared discard
action; if 015 already renders it inside `FindingCard`, D6 shrinks to wiring plus its test.

Watch out: `writeTargetOf` in `src/renderer/screens/garden/fixes.ts` reads `paths[1]` for the
orphan kind. In picker mode there is no `paths[1]` — the card must display the picked target, not
fall back to the orphan's own path.

Known gap kept on purpose: the `sources:` frontmatter reference form is not built here (user
decision), so a source page can still only be un-orphaned by a body line.

## Deliverables

**D1 — core: ranked, filtered target list** [x] · files: `src/core/gardener/orphan-targets.ts` (new),
`src/core/gardener/checks/orphan.ts` (export `mentionWords`), `src/shared/types/overview.ts`
(`OrphanTarget`, `OrphanTargets`), `tests/core/gardener/orphan-targets.test.ts` (new).
Mirror: `src/core/gardener/relations.ts` for the pure-function + unit-test shape.
Accepted when: `orphanTargets(pages, orphan, docLanguage)` returns the exact `Bezug:`/`Related:`
line for the doc language, never contains the orphan itself or a page already linking it, and
orders overview → shared-word → rest with titles ascending inside each group. Tests cover the
empty result (module with no other page) and the doc-language switch.

**D2 — IPC + main: `gardener:orphanTargets`** [x] · files: `src/shared/ipc.ts` (entry +
`IPC_CHANNELS`), `src/shared/types/overview.ts`, `src/main/ipc/gardener.ts`,
`src/renderer/lib/api.ts`, `src/renderer/lib/queries/gardener.ts`,
`tests/main/gardener-ipc.test.ts`.
Mirror: 015's `gardener:discardPlan` block across the same files (read-only proposal channel).
Accepted when: the channel answers for a known orphan finding id, rejects an unknown id with
`not-found` and a non-orphan finding with `invalid`, only ever reads pages of the finding's own
module, writes nothing, and `tests/main/ipc-coverage.test.ts` stays green.

**D3 — the write path: `gardener:linkOrphan`** [x] · files: `src/shared/ipc.ts`,
`src/main/ipc/gardener.ts`, `src/renderer/lib/api.ts`,
`src/renderer/lib/queries/gardener.ts`, `tests/main/gardener-ipc.test.ts`.
Mirror: 015's `gardener:discardPage` handler (validate against the persisted report, then
`settle(...)`).
Accepted when: `{ findingId, target }` appends the previewed line to the chosen file and nothing
else; main — not the renderer — builds `paths` and `fix`; a target that is not in the recomputed
set, sits in another module or is any other vault path is rejected with `invalid` and writes
nothing; the append goes through `appendParagraph`, never into an existing line; undo token,
module log entry and `settle(...)` behave exactly as for the existing fix; `gardener:applyFix`
stays untouched and the single-candidate path is covered by a regression test.

**D4 — guardrail tests: hash guard and honest failure** [x] · files:
`tests/core/gardener/fixes.test.ts`, `tests/main/gardener-ipc.test.ts`, plus
`src/main/ipc/errors.ts`/`src/core/gardener/fixes.ts` only if a code gets swallowed.
Accepted when: a store whose content changes between read and write makes the fix fail with
`code: 'conflict'`, the target file keeps its user content, and that code survives the preload
wire into the renderer (`decodeIpcError`). Plus: a target file edited externally after the run is
re-read and gets the line appended without losing the edit (round-trip).

**D5 — renderer: the orphan card, picker and preview** [x] · files:
`src/renderer/screens/garden/OrphanCard.tsx` (new), `FindingList.tsx`, `GardenScreen.tsx`,
`src/renderer/screens/garden/fixes.ts`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `src/renderer/styles/app/garden.css`,
`tests/renderer/garden.test.tsx`.
Mirror: `ContradictionCard.tsx` (card composition) and `ProjectLinkPicker.tsx` +
`components/tiles/SessionLink.tsx` (toggle plus searchable list).
Accepted when: an orphan finding without a fix shows "link from the module overview" (only if an
overview target exists) and a searchable picker over the rest; picking shows the exact line and
the target file before the confirm button; the confirm is the only accent on the card; every
label goes through `t()` in `de` and `en`, sentence case, no emoji, no raw Tailwind palette; a
module with no other page says so honestly instead of showing an empty list.

**D6 — reuse 015's discard action on the orphan card** [x] · files:
`src/renderer/screens/garden/OrphanCard.tsx`, `tests/renderer/garden.test.tsx`.
Reuse: `src/renderer/components/DiscardPageAction.tsx` from 015, mounted with the orphan's path
and **no** surviving page.
Accepted when: the orphan card offers that action with identical wording and identical confirm
behaviour, the dialog is honest about there being nothing to repoint, and the diff contains **no**
second discard implementation and no new i18n key for it.

**D7 — regression: the finding really goes away** [x] · files:
`tests/core/gardener/report.test.ts`, `tests/core/gardener/checks-links.test.ts`,
`tests/renderer/garden.test.tsx`.
Accepted when: after the picker write a fresh report no longer reports the page as orphaned (the
run recomputes from the files, nothing is hidden); the single-candidate finding still carries its
fix; no path in this story touches the LLM gateway — the card is fully usable with no model
configured, asserted with the "no model configured" setup; the orphan card never renders "Passt
so" as its only action.

**D8 — the case exists in the demo vault, and the flow is smoked** [x] · files:
`scripts/seed/wiki.mjs` (or the matching module seed file), `.screenshots/` output.
Mirror: the seed pages 015's D9 adds for its near-duplicate pair.
Accepted when: `npm run seed` produces a module containing an orphaned page with **zero**
mention candidates plus an overview page, `npm run shot` captures the maintenance screen with the
orphan card and the open picker, the full pick → preview → confirm → undo path has been driven
through the running app, and `npm run verify` is green.

**AC coverage** (in order of the criteria above): single unambiguous place unchanged → D3, D7 ·
picker instead of no fix → D1, D2, D5 · module pages, searchable, exclusions → D1, D5 · exact line
plus target file named → D1, D5 · appended, never inserted → D3, D4 · `sources:` variant → **out
of scope** by user decision, carried as a known gap · undo, module log, `conflict` on stale hash →
D3, D4 · re-read before writing → D3, D4 · next run no longer reports it → D7 · not "Passt so"
alone → D5, D6 · works with no model → D7 · `t()` in `de`/`en` plus Gaston → D5 · tests → D3, D4,
D7 (and the manual path in D8).

## Model Hints

- D3 → `deliverable-hard` — main has to synthesize a write target from renderer input without
  breaking the existing single-candidate `add-links` path; a hole here lets the renderer name any
  vault file as a write target.
- D4 → `deliverable-hard` — the conflict has to be forced at the read/write seam and the code
  traced across core, IPC envelope and preload wire, where today staleness surfaces as `invalid`.
- D1, D2, D5, D6, D7, D8 → default tier.
- Review: → `story-review-hard` — a new write path into the vault whose target comes from the
  renderer; the confirm-before-write and hash-guard guarantees are the story's load-bearing part.

## Test Plan (manual acceptance)

Preparation: `npm run seed && npm run build`, then start the app (`npm run shot` for the
screenshot run, or `npm run dev` for the walkthrough).

1. Open **Maintenance**, start a run. An orphan finding for the seeded source page appears
   **without** a fix button.
2. The card shows two ways out plus discard — and not "Passt so" as the only action.
3. Click **link from the module overview**. The card names the module overview file and the exact
   line before anything is written. Confirm.
4. Open the overview file in the editor (button on the card): the line stands at the end as its
   own paragraph, the previous content is untouched, and the module log has a new entry.
5. **Undo** from the outcome strip. The line is gone, the file is otherwise unchanged.
6. Run again, then use **choose a page** on the same finding: search by title, confirm the
   orphaned page itself and the overview page you just linked from are not offered. Pick a
   concept page, check the preview names _that_ file, confirm.
7. External edit: before confirming, open the chosen file in Obsidian or VS Code, add a sentence
   and save. Then confirm in the app — the line is appended below your sentence, nothing is lost
   (the fix re-reads the file). A genuine stale-hash `conflict` cannot be produced by hand at
   this speed; it is covered by D4's tests.
8. Start a fresh run: the page is no longer reported as orphaned.
9. Discard: on a fresh run, use the discard action on the orphan card. The dialog is 015's, names
   the orphaned file, and says plainly that no other page links it. Confirm, then undo from the
   strip — the page is back.
10. Settings → remove every configured model, repeat steps 1–3: the card behaves identically, no
    "no model configured" state appears anywhere on it.
11. Switch UI language to English and back: every label on the card and in the picker changes,
    no German string remains.

## Done

**Summary:** An orphan finding with no unambiguous fix (`kind: 'orphan', fix: null`) now
lets the user pick the target page themselves. Core: `orphanTargets()` in
`src/core/gardener/orphan-targets.ts` ranks a module's other pages (overview → shared
mention word → rest, title-ascending) and returns the exact `Bezug:`/`Related:` line, never
including the orphan itself or a page that already links it. Two new IPC channels mirror
015's plan/apply pair: `gardener:orphanTargets` (read-only preview) and `gardener:linkOrphan`
(write) — the latter is the load-bearing new surface, since it takes a renderer-picked
`target` path and must never trust it: main recomputes the allowed set itself before
building `paths`/`fix` and calling the existing, untouched core `applyFix`/`addLinks`. The
renderer's new `OrphanCard` offers a one-click "link from module overview" plus a searchable
picker (mirrors `SessionLink`), shows the exact line and target file before confirm, and
reuses 015's `DiscardPageAction` unmodified so an orphan that should not exist can be
discarded from the same card. The demo vault gained a genuine zero-mention-candidate orphan
alongside the existing single-candidate one, and the full pick → preview → confirm → undo
path plus the discard dialog were driven through the real running app (see Verification).

**Commit message:**

```
016: orphan page — I pick the target
```

**Verification:**

- `npm run build` — green.
- `npm run lint` / `npm run typecheck` — green.
- `npm test` — 2435 passed, 1 failed. The 1 failure is the pre-existing
  `tests/core/wiki/module.test.ts:150` (`MODULE_SCHEMA_TEMPLATE` vs the now-English
  `docs/MODULE-SCHEMA.md`), confirmed present on the branch before this story's builds
  started (per the sprint orchestrator's briefing) — not a regression from this story.
- `npm run format:check` — repo-wide CRLF drift predates this sprint (also called out by
  015's own Done section); not this story's regression. No content-format issue found in
  the touched files.
- **Live smoke (P2):** `npm run seed && npm run shot` — 60 screenshots, no console errors;
  the health card correctly counts "2 verwaiste Seiten" (the pre-existing single-candidate
  `scim` orphan plus D8's new zero-candidate one). A temporary, non-committed Playwright
  `_electron` driver (deleted after the run, same approach 015 used) then drove the real
  built app against the seeded vault: the orphan card showed both the "link from module
  overview" one-click and the searchable picker (never "Passt so" alone); "link from module
  overview" showed the exact preview (`+ Bezug: [[s-...-notiz-communities-interview]]`)
  naming `overview.md` before any write; confirming wrote exactly that line to disk; the
  outcome strip showed the write with undo; undo restored `overview.md` to its byte-exact
  original content; the discard button opened 015's dialog with the honest "no other page
  links here" wording (closed via cancel, not exercised, so as not to remove the fixture).
  The vault was verified unchanged end-to-end.
- **Code review (story-review-hard):** verdict **PASS**. One review-fix cycle:
  - A test comment in `tests/main/gardener-ipc.test.ts` claimed the middle rank group was
    empty because "no page mentions SCIM in the text" — the actual mechanism is title-word
    overlap with the orphan's own title, not a body-text scan. **Fixed**: comment corrected.
  - `tests/core/wiki/module.test.ts:150` is red on this tree — **not fixed**, pre-existing
    per the sprint briefing; documented here rather than glossed over.
  - The searchable picker only renders an actual search input from 8 candidates up
    (mirrors `SessionLink`'s `SEARCH_FROM` threshold); below that it's a plain `<select>`,
    which is still literally "searchable by title" via the select's own type-ahead but not
    via a dedicated text field. **Not fixed** — deliberate mirror of the established pattern
    elsewhere on this screen, and a list that short needs no separate filter; documented as
    an accepted low-severity gap rather than a violation.
  - `src/main/ipc/gardener.ts` grew to ~342 lines, past `CLAUDE.md`'s ~300-line soft limit.
    **Not fixed** — reviewer's own assessment was "still one responsibility, a check-it note
    rather than a violation"; a split was judged riskier at the end of a review-fix cycle
    than the size overrun itself. Left as a known follow-up if the file grows further.

**Decisions made during the build (none required user input beyond what the story's
`Decisions (Sprint)` section already settled):**

- `OrphanTarget`/`OrphanTargets` were placed in `src/shared/types/gardener.ts`, not
  `overview.ts` as the story's own D1 file list literally named — `overview.ts`'s header
  comment explicitly says gardener finding/discard/supersede shapes live in `gardener.ts`
  since they already pushed `overview.ts` past its line limit; both are re-exported from the
  same barrel, so this is purely a "which file" choice with no consumer-visible effect.
- D2's inline finding-validation was refactored into a shared `orphanPick()` helper when D3
  needed the identical checks, rather than duplicating them — same behavior, confirmed by
  D2's own tests still passing unchanged.
- The overview-page candidate is identified by the fixed, documented path suffix
  `/wiki/overview.md` (one per module, per `docs/VAULT-FORMAT.md`) rather than adding a
  `type`/`isOverview` field to the wire-level `OrphanTarget` — avoids widening the IPC
  contract for a fact already guaranteed by the vault format.
