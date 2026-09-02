---
id: 042
title: A maintenance run stays visible wherever I am
status: draft # draft -> ready -> in-progress -> done
created: 2026-09-02
---

Part of M13. Cut as the carve-out found while smoke-testing 027 in S07 — the progress bar lost on
navigation, isolated to `src/renderer/lib/queries/gardener.ts` and confirmed pre-existing. The
2026-09-02 plan widened it: the progress moves into the shell, and closing the app during a run
has to warn. Keeps the promises [[021a-a-run-i-can-see]] and [[021b-stop-and-continue]] made.

## Requirement

I start a maintenance run and go somewhere else while it works — that is the whole point of a run
I am allowed to leave. Today the progress bar is gone when I come back to maintenance. The run
itself is healthy: the backend keeps answering `gardener:runStatus` correctly and the run finishes
normally. Only the display has forgotten that anything is happening.

So the screen lies twice. It suggests no run is going when one is, and it takes away the stop
button — I cannot stop what I cannot see, which is precisely what 021b built.

Repairing the bar where it stands would only patch the symptom. A run I am invited to walk away
from should be visible from wherever I walked to, so the progress belongs to the shell rather than
to one screen — which also makes the original bug structurally impossible instead of merely fixed.
And when a run is going as I close the app, the app has to say so and offer to stop it properly,
instead of letting the process die in the middle of a write.

## Acceptance Criteria

- [ ] While a run is going, a progress strip is visible from every screen, not only from
      maintenance.
- [ ] Starting a run and navigating anywhere keeps it visible with current values — the original
      bug is gone because nothing unmounts, not because a remount re-seeds in time.
- [ ] Stop and continue (021b) are reachable from the strip itself.
- [ ] A run that finishes while I am elsewhere reads as finished, and the strip then goes away.
- [ ] With no run going there is no strip. The fix does not trade this bug for a phantom bar.
- [ ] The strip introduces no second Teal accent: the current screen's primary action keeps the one
      focus point.
- [ ] Closing the app during a run warns and offers stop-and-close; the run ends through 021b's
      stop path rather than being killed mid-write.
- [ ] Cancelling that warning leaves both the run and the window alone.
- [ ] The warning covers the real window close — the title bar's close, `Alt+F4`, a tray quit —
      not only an in-app button.
- [ ] No polling is introduced; the strip stays on the existing seed-plus-event mechanism.
- [ ] Regression tests cover unmount/remount during a run, and close-during-a-run.
- [ ] The cause of the original navigation bug is named in the Done section, not just the symptom,
      so the next screen that needs live progress does not repeat it.
- [ ] All new strings exist in `de` and `en`.

## Open Questions

- Q1 — The cause of the original bug is located but not established. The hook seeds from
  `gardener:runStatus` with `staleTime: Infinity` and `gcTime: 0` and layers live events on top;
  candidates are the seed not refetching on remount, `useVaultReady()` being false for the first
  render after navigation, or the bar being rendered by a component that does not hold the hook.
  Refine establishes which before moving anything — hoisting the strip into the shell would hide
  the cause without ever naming it, and the next live-progress screen would meet it again.
- ~~Q2 — Should progress survive an app restart, or only navigation?~~
  answered → Decisions (Sprint)
- ~~Q3 — Does the bar belong to the maintenance screen, or to the shell?~~
  answered → Decisions (Sprint)

## Decisions (Sprint)

Settled with the user at the 2026-09-02 `/roadmap plan`, ahead of refine — not in a later
clarification round. Binding. Both answers widen this story past the carve-out it was cut as.

- **(User)** Q3 — **the strip lives in the shell**, visible from every screen, not on maintenance
  alone. This is a design change and not only a bug fix: it touches the shell and must respect the
  one-focus-point rule. It is also what makes "a run I am allowed to leave" actually true.
- **(User)** Q2 — **navigation only, but closing the app during a run must warn.** The run is
  in-process, so after a restart there is nothing left to reattach to and promising otherwise
  would mean inventing state. The close is caught instead.
- **(User)** The warning **offers stop-and-close.** Stopping goes through 021b's existing stop path
  so a write in flight ends rather than being cut. A plain "close anyway" was rejected for that
  reason; blocking the close outright was rejected as a dialog without an escape route, which the
  architecture doc forbids.
- Consequence for refine to carry: this story now reaches into `src/main/` (window close and quit)
  and into the shell, where it was cut as a renderer-only hook fix. Its build is larger than the
  roadmap's carve-out framing suggests, and it is the one story in S11 whose scope grew at the
  plan.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
