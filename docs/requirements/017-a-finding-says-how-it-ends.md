---
id: 017
title: A finding says how it ends — and "looks fine" stays reversible
status: draft # draft -> ready -> in-progress -> done
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

Still open:

- **Is there a "not now"?** Between "this is not a problem" and "I dealt with it" sits the
  most common case: "not today". The reminders already have a snooze
  (`overview-state.ts`); a third state on every finding may be one too many, or exactly the
  one that is missing.
- **Where do the hidden findings live?** A filter value in the existing finding filter
  ([filter.ts](../../src/renderer/screens/garden/filter.ts)), a collapsed section at the
  bottom of the screen, or its own view? A filter is the least new UI, but it puts hidden
  findings in the same list as open ones.
- **Does listing them need a new IPC channel?** `gardener:report` returns the filtered
  report; the dismissed findings never reach the renderer at all
  ([gardener-state.ts:171-186](../../src/main/gardener-state.ts#L171-L186)). Either the
  report carries them, or a channel serves them.
- **Does "handled in the vault" re-check everything or just this finding?** A full run is
  simple and honest but takes as long as it takes; re-checking one finding means a second,
  narrower code path — a second truth about what a check is.
- **What happens to a dismissed finding whose file was deleted?** It stays in the dismissed
  id list forever. Prune it on a run, or accept a growing list of ids nobody will read?

## Plan

<Filled by `/ai-scrum:refine 017`.>

## Deliverables

<Filled by `/ai-scrum:refine 017`.>

## Model Hints

<Filled by `/ai-scrum:refine 017`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 017`.>

## Done

<Filled by `/ai-scrum:build 017`.>
