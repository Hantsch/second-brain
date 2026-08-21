---
id: 017
title: A finding says how it ends — and "looks fine" stays reversible
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-13
---

## Requirement

I ran a maintenance run, got four findings, and did not know what to do with any of them.
Not because the findings were unclear — they were precise — but because the screen shows me
only two ways out, and neither of them is the one I want:

1. **Apply the fix.** Only exists when the check could name an unambiguous place. On half
   of my findings there is no fix at all.
2. **"Passt so".** Says "this is not a problem". Permanent, by design — the finding id is
   stable across runs ([types.ts:146](../../src/core/gardener/types.ts#L146)), so a
   dismissed finding stays gone.

There is a third way out and the screen never mentions it: **fix it in the vault and check
again**. The run recomputes from the files every time, and the dismissed set survives while
the resolved list is cleared
([gardener-state.ts:192-197](../../src/main/gardener-state.ts#L192-L197)). So a finding I
really resolved — by linking the page, by deleting the duplicate, in Obsidian or in the app
— is simply gone on the next run. That is the honest resolution, and it is invisible.

Because it is invisible, "Passt so" becomes the button people press for everything. It is
the only thing left. That quietly corrupts two things: the finding list stops being a list
of open work, and the health score stops meaning anything — a dismissed finding no longer
counts against it ([gardener-state.ts:171-186](../../src/main/gardener-state.ts#L171-L186)),
so a vault with twenty dismissed findings reports a clean score.

And once dismissed, a finding is unreachable. The way back exists —
`gardener:undismiss` ([ipc.ts:579](../../src/shared/ipc.ts#L579)) — but only as a button in
the outcome strip, for as long as the strip is on screen. Once I navigate away or run
again, there is no screen anywhere that shows what I dismissed, and no way to bring one
back. A permanent decision made with one click and no way back is the wrong shape for a
knowledge base that is supposed to stay trustworthy over years.

So three things:

**A card says how it ends.** Every finding — especially one without a fix — names the ways
out it actually has, instead of leaving "Passt so" as the last thing standing.

**"Handled in the vault" is a first-class exit.** Distinct from "this is not a problem": I
say I dealt with it in the files, the app checks again, and the finding is gone because it
is really gone — or it comes back, which is the truth I want to see.

**What I hid stays visible and stays reversible.** I can see how many findings are hidden,
which ones, and bring any of them back at any time. And the health score says out loud that
it is computed without them.

## Acceptance Criteria

- [ ] A finding card names the ways out it has. A card with no fix does not end with
      "Passt so" as its only action.
- [ ] The screen offers "handled in the vault, check again" as an exit distinct from
      "Passt so" — one leads to a fresh run, the other hides the finding.
- [ ] The wording of the two exits makes the difference unmistakable: "this is not a
      problem" versus "I dealt with it". No user has to infer which one is which.
- [ ] Dismissed findings are visible: the maintenance screen shows how many are hidden and
      lets me see them.
- [ ] Any dismissed finding can be brought back at any time, not only while the outcome
      strip is on screen.
- [ ] The health card states that the score is computed without the dismissed findings, and
      how many that is. A score of 100 next to twelve hidden findings never reads as a clean
      vault.
- [ ] A new run keeps my "Passt so" decisions — they are statements about the subject
      matter, not about a run — and that stays true.
- [ ] A dismissed finding that is genuinely resolved in the files does not silently pile up
      in the hidden list forever; it is simply not found again.
- [ ] Works with no model configured. Every state is honest without one.
- [ ] Labels go through `t()`, in `de` and `en`. One accent on the screen, sentence case,
      no emoji, statements instead of encouragement.
- [ ] Tests: undismiss after a reload, the hidden count in the health card, the dismissed
      set surviving a run, the exit that triggers a re-check.

## Open Questions

Decided (2026-08-13): "Passt so" stays permanent and stays a statement about the subject
matter · the health score keeps ignoring dismissed findings, but says so · the third exit is
a re-check, not a second hidden state.

~~Is there a "not now"?~~ answered → Decisions (Sprint)
~~Where do the hidden findings live?~~ answered → Decisions (Sprint)
~~Does listing them need a new IPC channel?~~ answered → Decisions (Sprint)
~~Does "handled in the vault" re-check everything or just this finding?~~ answered → Decisions (Sprint)
~~What happens to a dismissed finding whose file was deleted?~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Is there a "not now" state?: Yes — add a snooze state between "not a problem" and
  "handled", reusing the snooze mechanism that already exists for reminders
  ([overview-state.ts](../../src/main/overview-state.ts)).
- **(User)** Where do hidden findings live in the UI?: A filter value in the existing finding
  filter ([filter.ts](../../src/renderer/screens/garden/filter.ts)) — least new UI.
- **(User)** Does listing them need a new IPC channel?: No — extend `gardener:report` so
  dismissed findings travel with the report behind a flag/filter. One channel, one truth.
- **(User)** Does "handled in the vault" re-check everything or just this finding?: A full run.
  Simple and honest, and it avoids a second, narrower definition of what a check is.
- **(User)** What happens to a dismissed finding whose file was deleted?: Prune it automatically
  on the next run, so the dismissed-id list cannot grow without bound.
- **Snooze lives in `gardener.json`, not in `overview.json`.** One `snoozed: Record<id,
'YYYY-MM-DD'>` map next to `dismissed`, pruned on load exactly like
  [overview-state.ts](../../src/main/overview-state.ts) prunes reminder snoozes — the state
  file's own header already argues why a report and the reminder snoozes must not share a file.
- **Snooze reuses `SnoozeMenu` and the `{ id, days }` request shape of `reminders:snooze`.**
  "Not now" then asks the same question in the same words everywhere in the app.
- **Two new channels `gardener:snooze` / `gardener:unsnooze`.** The (User) decision to add no
  channel is about _listing_ hidden findings; a new state needs its own write channel, mirrored
  1:1 on [reminders.ts](../../src/main/ipc/reminders.ts).
- **The hidden findings ride in a separate `hidden` field of the report, not behind a request
  flag.** The health card must always know the count, and a request parameter would make the
  number depend on who asked.
- **`report.findings` stays the open findings only.** The dashboard tile and the per-module
  counts read that field and must not start counting hidden findings.
- **A snoozed finding is excluded from the health score like a dismissed one.** The score has to
  match the list standing next to it (`gardener-state.ts`, `present()`); honesty is restored by
  naming both counts in the health card, not by two scores.
- **The hidden view is a fourth `Select` in the filter** (`open` by default, `dismissed`,
  `snoozed`, `all`). The axis has four values, and
  [FindingFilter.tsx](../../src/renderer/components/FindingFilter.tsx) rejects segments for
  exactly that reason.
- **Pruning is keyed on the kind encoded in the id.** `findingId` is `kind:hash`
  ([types.ts:146](../../src/core/gardener/types.ts#L146)), so a dismissed id whose kind the run
  covered but which the run did not find is dropped. Without that "could the run have found it"
  test a single machine-only run would silently delete every dismissal of a model finding.
- **The kinds a run without a model cannot produce are one named list in core**
  (`LLM_ONLY_KINDS`, today just `contradiction`), not an `=== 'contradiction'` comparison —
  [020](020-journal-loose-ends.md) adds a model-gated kind of its own and must be able to join
  that list with one line.
- **Pruning happens in `save()` only, i.e. after a completed run.** A cancelled run never
  reaches `save()`, and its partial finding list must not be allowed to delete a decision.
- **"Handled in the files" triggers the existing full `gardener:run` and writes no state at
  all.** The outcome strip afterwards says whether this finding is in the new report or gone —
  a verifiable answer is the whole point of that exit.
- **The findings panel renders as long as there is any finding, open or hidden.** Today the
  screen short-circuits to an empty state at `findings.length === 0`
  ([GardenScreen.tsx:262](../../src/renderer/screens/garden/GardenScreen.tsx#L262)), which would
  make the hidden list unreachable exactly when everything is hidden.
- **The exits are additive, not a rewrite.** `exits.ts` derives the generic ways out from the
  finding's shape (has a fix? names a file? is it hidden?); the parameterised actions from
  [015](015-resolve-a-near-duplicate.md) (discard, supersede) and
  [016](016-orphan-page-i-pick-the-target.md) (pick a target) keep using the existing
  `extraActions` slot and their own channels. Nothing built earlier in the sprint is rewritten,
  and [020](020-journal-loose-ends.md)'s new kind gets every generic exit for free.
- **The generic exits never re-implement 015's discard.** 015 already made discard available on
  every finding that names a page; `exits.ts` orders the exits and leaves that action where 015
  put it, so there is one discard, not two.
- **The action handlers move into `useFindingActions.ts`.** `GardenScreen.tsx` sits at 299 lines
  against the ~300-line soft limit before this story adds three more write paths.
- **Dismiss and snooze stay one click with a visible way back, no confirm dialog.** They write
  derived state under `.secondbrain/` and never a vault file; the AI-proposes/human-confirms
  guardrail binds the exits that write Markdown (015/016), which keep their preview and their
  hash guard — asserted in D6 rather than assumed.
- **New English strings avoid the noun where they can and otherwise keep this file's current
  vocabulary.** [014](014-maintenance-says-befund.md) deliberately left the English "result"
  rename as a follow-up; a half-renamed screen reads worse than a consistent one.
- **The dashboard tile keeps counting open findings only.** The hidden count belongs on the
  screen that can act on it; a second surface for it is out of scope.
- **Snooze gets no acceptance criterion of its own.** The (User) decision post-dates the
  criteria list, so its acceptance is fixed in D3/D4 and in the manual test plan instead of
  editing criteria in flight.
- **`docs/VAULT-FORMAT.md` is updated with the new `snoozed` map.** The file documents
  `gardener.json` (line 38), and state that outlives the app is described where the vault format
  is described.

## Plan

Three layers, in this order: the state learns "snoozed" and "hidden", the contract carries both
to the renderer, then the card, the filter and the health card say it out loud.

**1 — State ([gardener-state.ts](../../src/main/gardener-state.ts), 265 lines).**
`StoredGardener` gains `snoozed: Record<string, string>` (id -> the day it returns).
`present(today)` splits the run into `findings` (open) and `hidden` (dismissed plus
still-snoozed, each with its state and its `until`) and computes the health score over the open
list exactly as before. `save(run)` prunes only what it can judge: a dismissed or snoozed id the
completed run did not find is dropped, unless its kind is in `LLM_ONLY_KINDS` and
`run.usedLlm` is `false`. `kindOf(id)` — the part before the first `:` — is added next to `findingId` in
[core/gardener/types.ts](../../src/core/gardener/types.ts). `pruneSnoozes(today)` drops expired
days, the way `overview-state.ts` does.

**2 — Contract ([shared/types/overview.ts](../../src/shared/types/overview.ts),
[shared/ipc.ts](../../src/shared/ipc.ts)).** `GardenerReport` gains
`hidden: GardenerHiddenFinding[]` (`{ finding, state: 'dismissed' | 'snoozed', until?: string }`);
the unused `GardenerFinding.dismissed?` flag goes. Two channels next to the existing dismiss
pair, modelled on `reminders:snooze`: `gardener:snooze` `{ id, days }` and `gardener:unsnooze`
`{ id }` — both in `IPC_CHANNELS`, both handled in
[main/ipc/gardener.ts](../../src/main/ipc/gardener.ts) with the `knows(id)` / `not-found` check
and the `event:vault-changed` wake-up, both wired through
[lib/api.ts](../../src/renderer/lib/api.ts) and `useGardenerMutations`.

**3 — The card names its exits.** New pure module `screens/garden/exits.ts`: from a finding and
its hidden state it returns the ordered generic exits — `fix` (only when `finding.fix !== null`),
`handled` (re-check), `snooze`, `dismiss`, `open`, and for a hidden finding `restore` in place of
snooze and dismiss. [FindingCard.tsx](../../src/renderer/components/FindingCard.tsx) renders that
list, keeps `extraActions` for 015's and 016's parameterised ways out, and shows one calm note
when there is no fix. `GardenScreen.tsx` hands over three new handlers, moved together with the
existing five into `screens/garden/useFindingActions.ts`; `Outcome` gains `snoozed`, `unsnoozed`
and `rechecked` (`gone: boolean`).

**4 — Hidden stays visible.** `filter.ts` gains a `state` axis (`open` default / `dismissed` /
`snoozed` / `all`) plus `stateCounts`; `FindingFilter` gets its fourth `Select`; `FindingList`
receives `hidden` and renders those cards with their state note and the restore action. The panel
renders whenever `findings.length + hidden.length > 0`, and `HealthCard` states that the score is
computed without the hidden ones, with the split count and a control that switches the filter.

Files, in build order: `core/gardener/types.ts` · `shared/types/overview.ts` ·
`main/gardener-state.ts` · `docs/VAULT-FORMAT.md` -> `shared/ipc.ts` · `main/ipc/gardener.ts` ·
`renderer/lib/api.ts` · `renderer/lib/queries/gardener.ts` -> `screens/garden/exits.ts` ·
`components/FindingCard.tsx` · `screens/garden/useFindingActions.ts` ·
`screens/garden/GardenScreen.tsx` · `screens/garden/OutcomeStrip.tsx` ->
`screens/garden/filter.ts` · `components/FindingFilter.tsx` · `screens/garden/FindingList.tsx`
-> `screens/garden/HealthCard.tsx` · `i18n/de-garden.ts` · `i18n/en-garden.ts` ·
`tests/main/gardener-ipc.test.ts` · `tests/renderer/garden.test.tsx`.

## Deliverables

**D1 — The state knows "snoozed", "hidden" and how to forget**
Files: `src/core/gardener/types.ts` (add `kindOf` and `LLM_ONLY_KINDS`, next to `findingId`),
`src/shared/types/overview.ts` (`GardenerHiddenFinding`, `GardenerReport.hidden`, drop the unused
`GardenerFinding.dismissed`), `src/main/gardener-state.ts`, `docs/VAULT-FORMAT.md` (line 38),
`tests/main/gardener-state.test.ts` (new).
Mirror: `src/main/overview-state.ts` for the snooze map and its `prune(today)`.
Acceptance: `present(today)` returns the open findings in `findings` and dismissed plus snoozed in
`hidden` with `state` and `until`, the health score unchanged over the open list; a snooze whose
day has passed counts as open again; `save()` keeps a dismissed id the run found again, drops one
it did not, and keeps a dismissed `contradiction` (an `LLM_ONLY_KINDS` kind) when `usedLlm` is
`false`; a stored file without
`snoozed` still loads. `npm test` and `npm run typecheck` green.

**D2 — Snooze and unsnooze have a channel**
Files: `src/shared/ipc.ts`, `src/main/ipc/gardener.ts`, `src/renderer/lib/api.ts`,
`src/renderer/lib/queries/gardener.ts`, `tests/main/gardener-ipc.test.ts`.
Mirror: `src/main/ipc/reminders.ts` (`reminders:snooze` / `reminders:unsnooze`, including
`MAX_SNOOZE_DAYS` and the `invalid` / `not-found` errors).
Acceptance: both channels are in the map and in `IPC_CHANNELS`; `gardener:snooze` on an unknown id
gives `not-found`, `days` outside 1..365 gives `invalid`; `gardener:unsnooze` on a finding that is
not snoozed gives `not-found`; after a snooze the persisted `gardener.json` carries the day and
`gardener:report` puts the finding in `hidden`; the report prunes expired snoozes. The IPC
coverage test stays green without being loosened.

**D3 — A card names its ways out; "not now" and "handled in the files" work**
Files: `src/renderer/screens/garden/exits.ts` (new),
`src/renderer/screens/garden/useFindingActions.ts` (new),
`src/renderer/components/FindingCard.tsx`, `src/renderer/screens/garden/GardenScreen.tsx`,
`src/renderer/screens/garden/OutcomeStrip.tsx`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `tests/renderer/garden.test.tsx`.
Mirror: the `SnoozeMenu` usage in `src/renderer/components/tiles/DeadlinesTile.tsx`.
Acceptance: a finding without a fix shows the note plus its ways out and never ends with the
dismiss button as the only action; the dismiss button reads "this is not a problem", the re-check
button reads "I dealt with it in the files"; "not now" opens `SnoozeMenu` and the strip names the
day it returns; the re-check starts a full run and the strip says whether the finding is gone or
still there; `GardenScreen.tsx` stays under 300 lines; every new label goes through `t()` and
exists in `de` and `en` (`tests/renderer/i18n.test.ts` green); the existing assertions on the two
changed dismiss strings are updated, not loosened.

**D4 — What I hid stays visible and reversible**
Files: `src/renderer/screens/garden/filter.ts`, `src/renderer/components/FindingFilter.tsx`,
`src/renderer/screens/garden/FindingList.tsx`, `src/renderer/screens/garden/GardenScreen.tsx`,
`src/renderer/i18n/de-garden.ts`, `src/renderer/i18n/en-garden.ts`,
`tests/renderer/garden.test.tsx`.
Acceptance: the filter has a fourth field with counted values `open` / `dismissed` / `snoozed` /
`all`, `open` preselected; a hidden card says why it is hidden (and until when, if snoozed) and
offers "show it again", which restores it without the outcome strip being involved; the panel and
its filter still render when every finding is hidden; the panel's meta line names the hidden
count; the pure filter functions are unit-tested including their counts.

**D5 — The health card says what it ignored**
Files: `src/renderer/screens/garden/HealthCard.tsx`,
`src/renderer/screens/garden/GardenScreen.tsx`, `src/renderer/i18n/de-garden.ts`,
`src/renderer/i18n/en-garden.ts`, `tests/renderer/garden.test.tsx`.
Acceptance: with at least one hidden finding the card carries a line naming the total and the
split (marked as no problem / snoozed) plus a control that switches the filter to them;
`garden.health.perfect` ("nothing pulls the score down") never appears while something is hidden;
without hidden findings the card is unchanged; one accent on the screen stays intact.

**D6 — The guardrails are asserted, and the flow runs in the app**
Files: `tests/main/gardener-ipc.test.ts`, `tests/renderer/garden.test.tsx`, `.screenshots/` (via
`npm run shot`).
Acceptance: a test proves dismiss, snooze and restore change no Markdown file in the vault (only
`.secondbrain/gardener.json`); a test proves a writing exit reached from the generic card still
fails with `conflict` on a stale hash and that the screen shows that error instead of a success
strip; a test proves the whole screen — cards, exits, hidden list, health note — works with no
model configured; dismissed findings survive a run and stay restorable after a fresh
`gardener:report` (reload); `npm run verify` green; `npm run seed && npm run shot` shows the
maintenance screen with a hidden finding and the health note.

## Model Hints

- D1 -> `deliverable-hard`. The prune rule deletes persisted user decisions: getting the
  `LLM_ONLY_KINDS` / `usedLlm` exception or the "only after a completed run" condition wrong
  silently destroys dismissals, and no screen would ever show it.
- D2 -> default
- D3 -> `deliverable-hard`. Eight files, a new pure module and the extraction of five existing
  write handlers out of a 299-line screen — the regression risk is the existing fix, dismiss and
  supersede paths with their outcome strip, not the new buttons.
- D4 -> default
- D5 -> default
- D6 -> default
- Review: -> `story-review-hard`. New persisted state, a pruning rule that can delete user
  decisions, and the milestone's load-bearing guardrails (AI proposes / human confirms,
  hash-guarded write) all in one story.

## Test Plan (manual acceptance)

Preparation: `npm run seed`, start the app on the demo vault, open **Maintenance**, click "Check
now" and wait for the run to finish.

1. **A card names its ways out.** Find a finding without a fix (an orphaned page is the usual
   case). Expect: a note that there is nothing to write automatically, plus the ways out — "I
   dealt with it in the files", "not now", "this is not a problem", "open in editor". The dismiss
   button is not the last thing standing.
2. **Not now.** Click "not now" on that card and choose "next week". Expect: the card leaves the
   list, the strip names the date it returns.
3. **This is not a problem.** Click it on a second finding. Expect: the strip says so and offers
   "show it again" — do not use it here.
4. **The health card is honest.** Look at the health card. Expect: a line stating the score is
   computed without the two hidden findings, split into one marked as no problem and one snoozed.
   No "nothing pulls the score down".
5. **Getting to them.** Click the control in that line. Expect: the filter's fourth field jumps to
   the hidden findings and both cards appear with their reason (the snoozed one with its date).
6. **Reversible at any time.** Switch to Dashboard and back to Maintenance, set the filter to the
   dismissed findings again, click "show it again" on the one from step 3. Expect: it is back in
   the open list and the health score drops accordingly.
7. **Handled in the files.** Pick an orphan finding and note its file, open the page it should be
   linked from in an external editor, add a `[[wikilink]]` to the orphan by hand, save. Back in
   the app click "I dealt with it in the files" on that card. Expect: a full run starts and
   afterwards the strip says the finding is gone. Repeat on another card without editing
   anything: the strip says it is still there.
8. **Survives a restart.** Quit the app, start it again, open Maintenance. Expect: the same
   report, the snoozed and dismissed findings still hidden, still listed under the filter, still
   restorable.
9. **Without a model.** In Settings switch the interpretation off (or run on a vault with no
   route) and check again. Expect: the same cards, the same ways out, the same hidden list — one
   note about what a model would additionally find, no dead area.
10. **Language.** Switch the UI language to English and back. Expect: every new label and every
    strip sentence is translated, sentence case, no emoji.

## Done

<Filled by `/ai-scrum:build 017`.>
