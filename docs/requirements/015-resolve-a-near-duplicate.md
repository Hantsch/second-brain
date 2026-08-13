---
id: 015
title: A near-duplicate can be resolved, not only compared
status: draft # draft -> ready -> in-progress -> done
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

Still open:

- **Does discarding a page also remove its catalog line?** If not, `wiki/index.md` keeps a
  line pointing at a page that no longer exists, and the very next run reports it as
  `stale-entry` — the resolution creates the next finding. If yes, one action touches two
  files, which is more than the button says.
- **What about the inbound links of a discarded page?** They become broken wikilinks and
  the run will report them. Warn only, offer to repoint them at the surviving page, or
  accept the follow-up findings as honest?
- **Which page is "the newer one"?** For the supersede action the app has to propose a
  direction. `created` in the frontmatter, the file name, or does the user pick both sides?
- **Does the discard action belong only to the near-duplicate card, or to every finding
  that names a page?** An orphaned junk page has the same problem (see 016). One shared
  action would be less UI — but "discard" on a card about a missing link is a strange
  neighbour.
- **Does the raw source under `raw/` go too?** The duplicate wiki page came from a raw
  ingest. Discarding the page but keeping the raw source means the next ingest run can
  recreate it.

## Plan

<Filled by `/ai-scrum:refine 015`.>

## Deliverables

<Filled by `/ai-scrum:refine 015`.>

## Model Hints

<Filled by `/ai-scrum:refine 015`.>

## Test Plan (manual acceptance)

<Filled by `/ai-scrum:refine 015`.>

## Done

<Filled by `/ai-scrum:build 015`.>
