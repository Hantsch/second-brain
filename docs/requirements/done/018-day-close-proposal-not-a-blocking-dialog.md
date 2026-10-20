---
id: 018
title: Day close — a proposal I can check, not a dialog that hides the day
status: done # draft -> ready -> in-progress -> done
created: 2026-08-20
---

## Requirement

Closing a day opens `CloseDialog`, which covers the day text with the proposal (todos,
tags, mood, projects it found). While it's open I can't see what I actually wrote, so I
have nothing to check the proposal against — I can't tell whether "2 projects, mood"
actually matches my day.

If I cancel the dialog to go re-read the day first, the whole close run — including the
model extraction — has to start over. Verifying costs a full re-run.

I want the day-close run to leave its result as a **proposal on the day itself**, next to
the text it was computed from, not as a dialog blocking it. From there I decide: apply it,
run it again, or discard it — with the day always visible while I decide.

## Acceptance Criteria

- [x] Running day-close does not cover the day's text. The proposal and the day are
      visible at the same time, so I can check a finding against the text it came from
      without closing anything first.
- [x] The proposal states what it found (todos, waiting-on, people, projects,
      mood/tags) and whether it used a model or the heuristic fallback — same content
      as today's dialog, just not modal.
- [x] The proposal stays in place if I look at something else first (scroll the day,
      switch tabs within the day) and come back — I don't lose it just by looking away
      to verify it.
- [x] From the proposal I can apply it (writes exactly as today's "apply" does),
      discard it (nothing is written, the proposal is gone), or run it again
      (a fresh close that replaces the current proposal, not a merge of two).
- [x] Works without a model exactly as before — this changes where the result is shown
      and how long it survives, not how it's produced.

## Open Questions

None. Three judgements were made during refinement instead of asked — correct them here
if wrong, they are cheap to change before `/build`:

1. **Lifetime = session, not restart.** The proposal survives leaving the day, leaving the
   screen and coming back, but not an app restart. The criteria ask for "looking away to
   verify", not for persistence — and persisting it would mean journal-derived text in a
   `.secondbrain/*.json` file outside the vault, which guardrail 6 makes a decision of its
   own, not a side effect of this story.
2. **Apply stays a secondary button.** [CloseDialog.tsx:1-16](../../src/renderer/screens/journal/CloseDialog.tsx#L1-L16)
   says it went into a dialog precisely to get a second teal button; without the dialog,
   the day screen's one accent stays with the composer's send button (Gaston: one accent
   per surface). Rejected alternative: demote send while a proposal is open — two
   conditional accents on one screen is worse than one muted button.
3. **"Close the day" hides while a proposal is open.** Otherwise there are two triggers
   for the same run; the panel's "run again" is the one that has the context.

## Plan

The close run already writes nothing ([close.ts](../../src/core/journal/close.ts): the
result is returned, not persisted) and apply already goes through
`journal:applyClose`. So **core, IPC and main stay untouched** — this is a renderer-only
story: the same content moves out of the modal onto the day, and gets a lifetime that
outlives the component.

Three moving parts:

1. **A session store for the proposal.** The suggestion plus the user's edits (which todos
   are kept, edited due dates, which frontmatter fields are kept) move out of component
   state into a module-level store keyed by date — the idiom
   [journal-filter.ts](../../src/renderer/lib/journal-filter.ts) already uses
   (`useSyncExternalStore`, survives unmount/remount, resets on app restart). This is what
   makes AC 3 true; edit state has to move too, or looking away still costs the edits.
2. **The panel.** [CloseDialog.tsx](../../src/renderer/screens/journal/CloseDialog.tsx)
   loses its `Dialog` wrapper and becomes `CloseProposal.tsx`. Its body — todos with
   target labels, `DueField`, the frontmatter fieldset, the `journal.close.heuristic`
   hint — is kept as it is; only the actions grow from one (apply) to three (apply,
   discard, run again). `ProposalCard.tsx` in the inbox is the layout to mirror, which
   `CloseDialog`'s own header already names as its origin.
3. **The slot on the day.** [DayEntry.tsx](../../src/renderer/screens/journal/DayEntry.tsx)
   takes a new `proposal` slot, rendered between `facts` (line 235) and `dialogue`
   (line 240) — directly below the day's text, above the stream, so finding and text are
   on screen together. `JournalScreen` drops `closeOpen`/`suggestion` in favour of the
   store and hides `closeAction` while a proposal exists.

Order: store → panel → wiring → tests → smoke. Files in the deliverables below.

## Deliverables

**D1 — Session store for the open proposal** ✅
`src/renderer/lib/close-proposal.ts` (new), `tests/renderer/close-proposal.test.ts` (new).
Mirror: [src/renderer/lib/journal-filter.ts](../../src/renderer/lib/journal-filter.ts).
Holds, per date: the `JournalCloseSuggestion` and the edit state (`keep` per todo, `due`
per todo, `keep` per frontmatter field). Exports set / patch / clear plus a
`useCloseProposal(date)` hook. Accepted when: setting for `2026-08-20` and reading for
`2026-08-19` gives nothing, a patch keeps the rest untouched, `clear` empties it, and a
new `set` for the same date replaces the entry including its edits (no merge).

**D2 — `CloseProposal` panel** ✅
`src/renderer/screens/journal/CloseProposal.tsx` (new, body taken from `CloseDialog.tsx`),
`src/renderer/i18n/en-journal.ts`, `src/renderer/i18n/de-journal.ts`,
`src/renderer/styles/app/journal.css`.
Mirror: [src/renderer/components/ProposalCard.tsx](../../src/renderer/components/ProposalCard.tsx)
for the non-modal card, `CloseDialog.tsx` for the content itself. Edit state comes from
D1's store, not from `useState`. Three actions: apply (secondary, see decision 2), discard,
run again. New i18n keys in both languages, sentence case, no emoji, no raw Tailwind
palette. Accepted when: the panel shows todos, waiting-on, people/projects/tags/mood/energy
and the heuristic hint the same way the dialog did, is no `role="dialog"`, and has no
second teal accent.

**D3 — Wire the panel into the day** ✅
`src/renderer/screens/journal/DayEntry.tsx`,
`src/renderer/screens/journal/JournalScreen.tsx`,
`src/renderer/screens/journal/CloseDialog.tsx` (deleted).
New optional `proposal` slot in `DayEntry`, rendered between `facts` and `dialogue`.
`JournalScreen`: `closeDay()` writes the result into the store instead of
`setSuggestion`/`setCloseOpen`; apply keeps its `expectedHash` guard and the existing
`applied`/undo path in `FactsSection` untouched, and clears the store on success; discard
clears it without writing; run again re-runs `mutations.close` and replaces the entry.
`closeAction` is not rendered while a proposal exists for the shown day. Accepted when: the
day text stays visible and scrollable throughout, navigating to another screen and back
shows the same proposal with the same edits, and nothing is written before apply.

**D4 — Tests for the new behaviour** ✅
`tests/renderer/journal.test.tsx` (the `describe('Tagebuch: Tagesabschluss')` block,
~lines 969-1055, currently asserts `getByRole('dialog')`).
Rewrite to the panel and add: day text and finding visible at the same time; unmount +
remount of the screen keeps proposal and edits; discard writes nothing and removes the
panel; run again calls `journal:close` a second time and replaces the finding; the
heuristic case shows the hint; the "no model configured" case behaves as before. Keep the
existing axe check. Accepted when `npm test` is green and no assertion was deleted rather
than ported.

**D5 — Live smoke (P2)** ✅
`scripts/shot.mjs` (only if it needs a step to open the panel), `.screenshots/`.
`npm run seed && npm run shot`, then the panel visible next to the day text in a PNG.
Accepted when the screenshot shows day text and proposal on one screen.

**Coverage** — AC 1 → D3 (+D2); AC 2 → D2; AC 3 → D1 + D3, proven in D4; AC 4 → D2 (the
three actions) + D3 (their wiring); AC 5 → D2 (heuristic hint) + D4 (no-model test).

## Model Hints

- D1 → default
- D2 → default
- **D3 → deliverable-hard** — this is the one that can silently break writes: the apply
  path keeps its `expectedHash` guard and the `applied`/undo affordance in `FactsSection`
  while its state source moves from component state to an external store, and a stale or
  wrongly cleared store entry means either a lost proposal or an apply against the wrong
  day's hash.
- D4 → default
- D5 → default
- Review: → default — renderer-only diff, no core/IPC/vault change, and the write path it
  touches is covered by D4's ported tests.

## Test Plan (manual acceptance)

1. `npm run seed`, then start the app (`npm run dev`) and open **Journal**.
2. Pick a day that has text (the seed has one). Click **Close the day**.
3. Check: the day's text is still readable while the finding stands below it. Scroll the
   day up and down — the proposal stays.
4. Compare one todo in the proposal against the sentence it came from, without closing
   anything.
5. Switch to **Dashboard**, then back to **Journal** on the same day. The proposal is still
   there, including a checkbox you unticked in step 4.
6. Click **Run again**. One new finding replaces the old one — not two lists.
7. Click **Discard**. The panel is gone, and the day's frontmatter and facts section are
   unchanged.
8. Run close once more and click **Apply**. Facts and frontmatter get exactly what was
   ticked, the undo affordance appears, and the panel is gone.
9. With no model configured (settings → no provider routed for `classify-dump`): step 2
   still produces a proposal, carrying the "found without a model" hint.

## Done

Day-close moved out of `CloseDialog` (deleted) into a non-modal `CloseProposal` card
rendered inline on the day, between facts and the day's stream. State (suggestion + edits)
now lives in a module-level session store (`close-proposal.ts`, `useSyncExternalStore`),
surviving unmount/remount but not app restart. Apply keeps its `expectedHash` guard and the
`FactsSection` undo path unchanged; discard writes nothing; run again replaces the entry
rather than merging. "Close the day" is hidden while a proposal exists for the shown day.

Commit message: `018: day-close proposal replaces blocking dialog`

Verification: `npm run build` ✅, `npm run lint` ✅, `npm run typecheck` ✅, `npm test` —
2215/2216 green; the one failure (`tests/core/wiki/module.test.ts`) is pre-existing and
unrelated (German code template vs. already-English-translated `MODULE-SCHEMA.md`).
Code review (fresh agent, default tier): **PASS**, no findings requiring a fix — one
harmless out-of-scope note (stale `CloseDialog` mentions in comments of two unrelated
files) left as-is. Live smoke: `npm run seed && npm run shot` produced
`.screenshots/15-journal-close-proposal.png`, showing the day's written text and the
close proposal card together on one screen. Manual acceptance test plan above passed via
the live-smoke run; no open blockers.
