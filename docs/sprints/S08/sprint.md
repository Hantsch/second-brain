---
sprint: S08
status: done # planned | in-progress | done
branch: sprint/S08
milestone: M10 — A model that fits this machine, and an app I can hand on
---

# Sprint S08 — It fits my machine, and I can pass it on

## Goal

Two things that only matter outside the developer's own session. First, the model sizing stops
guessing about hardware it cannot see and stops planning with the whole machine: a fact the scan
misses can be typed in, and a percentage decides how much of the box a recommendation may spend.
Second, the app becomes something that can leave this repository: one name everywhere, and one
command that produces a ZIP for a USB stick that someone else can start.

At the end, `Settings → Models` answers "what can this machine carry, given what I am willing to
give it", and `dist/` holds a file I can hand over.

## Stories (in build order)

<!-- Order = the order the build phase works through. Dependent stories go last. -->

- [x] 028 — I fill in what the scan could not detect
- [x] 029 — I say how much of this machine a model may use
- [x] 030 — The app is called Gaston, everywhere
- [ ] 031 — A build I can hand on (built, acceptance pending — needs a clean Windows machine)

## Notes

**Why this sprint.** Cut on 2026-08-23 by the user, over the condensed layer (still the standing
M10 candidate in "Open / unprioritised", deferred a second time). Two of the four repair
limitations M5 shipped knowingly — 019a's Done section documents the Windows VRAM hole as
permanent "unless a second data source appears", and a human with the number in front of them is
that source. The other two exist because the app is about to have a user who is not its author.

**Why this order.**

- **028 before 029.** A budget percentage over a VRAM figure the app does not know is a
  percentage of nothing: on the main build machine (a 16 GB card reported as `null`, see 019a),
  029 would be untestable end to end without 028. Both touch `src/core/llm/capacity.ts`, the
  machine card and the recommendation path, so they must not run in parallel either.
- **029 second.** It is the only story in the sprint that changes what an already-accepted
  milestone recommends. Doing it while 028's merge of detected and entered facts is fresh keeps
  one reviewer's head on one file.
- **030 before 031.** The handed-on ZIP carries the app name in its file name, its readme and its
  window title. Renaming after packaging would mean building the artifact twice.
- **031 last.** It is the only story whose acceptance happens outside the repo — unpack on a
  machine without Node and start it. If the sprint has to be cut short, this is the story to
  carry over; the other three are complete on their own.

**All four stories are `draft`, not `ready`,** and they carry sixteen open questions between
them. These are the ones an agent must not decide alone:

- **029-Q2** (budget before or after the OS reserve) and **029-Q4** (the default) together decide
  whether an accepted milestone starts recommending different models on day one. That is a
  product decision, not a refactor detail.
- **030-Q1** (Guston vs. Gaston) touches a vendored directory name, an import path in every atom
  and a CLAUDE.md chapter. It is a naming decision about the design system, not about this story.
- **031-Q1** (which platforms) and **031-Q5** (ship unsigned) set the size of the story and what
  the recipient sees on first start.

**Already decided by the user on 2026-08-23**, recorded in the stories and not to be reopened in
the clarification round:

- The vault directory stays `.secondbrain/`. No vault-format migration in this sprint.
- The journal speaker becomes `Guston` for new turns; existing `Second Brain` days stay readable
  and are never rewritten.
- A handed-on copy keeps settings and keys in `userData`/`safeStorage` on the recipient's
  machine. A portable "data next to the .exe" mode is explicitly not this sprint (`safeStorage`
  is bound to the Windows user, so encrypted keys would not survive the trip anyway).

**Acceptance.** `ui-acceptance-required` and `live-smoke-required` are both true. 028 and 029 are
user-facing and need a real path through the running app — entering a VRAM figure and watching
the verdict and the recommendation move, then moving the percentage and watching it move again.
030's live check is the title bar plus one journal day written and re-read. 031 is the one story
whose acceptance cannot happen in the running dev app: it needs the ZIP unpacked somewhere clean
and started, and until that has happened it is "built, acceptance pending".

**Milestone.** M10 is created by this sprint. The condensed layer stays unprioritised; the two
carve-outs S07 left behind (`format:check` never green on Windows, the maintenance progress bar
lost on navigation) are deliberately not in this sprint and stay in the roadmap's open list.
