---
id: 023
title: The module schema says one thing, not two
status: draft # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

When I create a knowledge module, the app writes a schema file into my vault. What it writes
and what the documentation says it writes are two different texts. They drifted apart when
[docs/MODULE-SCHEMA.md](../MODULE-SCHEMA.md) was migrated to English (commit `e8959d1`) and
`MODULE_SCHEMA_TEMPLATE` in [src/core/wiki/module.ts](../../src/core/wiki/module.ts) was not.

For me that has two consequences. The one I can see: the documentation about my own vault is
wrong, and the vault format is supposed to be the truth of this app. The one I cannot see, but
which costs the project: the test that guards the two against each other
([tests/core/wiki/module.test.ts:150](../../tests/core/wiki/module.test.ts#L150)) is red and has
been for five sprints. `npm test` has not been fully green since M1, so every sprint since has
had to say "one pre-existing failure, unrelated" instead of "green". A gate that is never green
stops being a gate.

Nobody has fixed it because it is not a mechanical fix: whichever text wins gets written into
real vaults from then on. That decision belongs in this story, made once and written down.

Existing modules in my vault must not be rewritten behind my back. If the app's schema changes,
what already sits in `modules/*/AGENTS.md` stays as it is — this is guardrail 2, and a schema
file is content, not derived index.

## Acceptance Criteria

- [ ] The template the app writes and `docs/MODULE-SCHEMA.md` are the same text — the check
      that compares them passes.
- [ ] `npm test` is fully green, with no "known failure" carve-out anywhere in the repo.
- [ ] Which of the two sides was authoritative, and why, is written down where the next reader
      finds it — not only in a commit message.
- [ ] A module I already have in my vault is not touched. Creating a _new_ module writes the
      agreed text.
- [ ] If the winning text is English, the app still writes it into a German-language vault
      without breaking anything that reads it (wiki lint, module view, page maintenance).

## Open Questions

1. **Which side is authoritative — the doc or the code?** The doc is the newer, English text;
   the code is what real vaults already contain. Rewriting the doc to match the code re-germanises
   a document that was deliberately migrated; rewriting the code to match the doc changes what new
   vaults get. Needs one decision.
2. **Does the schema text follow `languages.documents`** (like the rest of the vault content),
   or is it a single fixed text regardless of vault language? Currently it is fixed.
3. **Is the character-for-character comparison the right guard at all**, or should the test
   compare structure (sections present, order) and let wording drift? A byte-exact test is what
   broke; a structural one would not have.

## Plan

## Deliverables

## Model Hints

## Test Plan (manual acceptance)

## Done
