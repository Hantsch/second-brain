---
id: 016
title: An orphaned page can be linked where I say, not only where it is obvious
status: draft # draft -> ready -> in-progress -> done
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

- [ ] When there is exactly one unambiguous place, nothing changes: the card behaves as it
      does today, one click, no picker.
- [ ] When there is no unambiguous place, the card lets me choose the page the reference is
      written into, instead of offering no fix at all.
- [ ] The picker lists the pages of the same module, is searchable by title, and leaves out
      the orphaned page itself and every page that already links it.
- [ ] After I pick, the card shows the exact line that will be appended and names the file
      it goes into — the same promise as today, with my file in it.
- [ ] The line is appended, never inserted into an existing user line
      ([VAULT-FORMAT.md](../VAULT-FORMAT.md), "Was die App niemals tut").
- [ ] For a source page, the card also offers to cite it in the chosen page's `sources:`
      frontmatter — the reference form the check already counts.
- [ ] Both ways are undoable from the outcome strip, land in the module log, and fail with
      `conflict` on a stale hash instead of overwriting.
- [ ] Picking a page whose file changed since the run re-reads and re-checks before
      writing, like every existing fix does.
- [ ] The next run no longer reports the page as orphaned — because the link is really
      there, not because anything was hidden.
- [ ] The card no longer leaves "Passt so" as the only action on an orphan finding.
- [ ] Works with no model configured — this is a link, not a judgement. No model suggests
      the target.
- [ ] Labels go through `t()`, in `de` and `en`. The picker follows Gaston: one accent,
      sentence case, no emoji.
- [ ] Tests: picker writes into the chosen file, `sources:` variant, stale-hash conflict,
      unchanged single-candidate path.

## Open Questions

Decided (2026-08-13): the app does not guess a target · the preview keeps naming the exact
file and line · the single-candidate path stays as it is.

Still open:

- **Does the picker suggest an order?** Overview page first, then pages sharing words with
  the orphan, then the rest — or a plain alphabetical list? A suggestion is not a guess as
  long as I confirm it, but a bad order is a nudge in the wrong direction.
- **Should the module overview be a one-click default?** For a condensed source, "linked
  from the module's overview" is the answer most of the time. A second button
  ("Ins Overview eintragen") would cover the common case without a picker at all.
- **Is the `sources:` variant part of this story or its own?** It writes a frontmatter list
  instead of a body line — a different write path, a different preview shape.
- **Does the picker reach across modules?** A page in `godot` can legitimately be the place
  that references a `confyui` source. The check counts only within the module, so a
  cross-module link would fix the finding without the check ever noticing.
- **What happens to an orphan that should not exist?** Story 015 introduces discarding a
  page. Whether that action shows up here too, and with the same wording, needs one
  decision — not two.

## Plan

<Filled by `/ai-scrum:refine 016`.>

## Deliverables

<Filled by `/ai-scrum:refine 016`.>

## Model Hints

<Filled by `/ai-scrum:refine 016`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 016`.>

## Done

<Filled by `/ai-scrum:build 016`.>
