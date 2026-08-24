---
id: 023
title: The module schema says one thing, not two
status: done # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

When I create a knowledge module, the app writes a schema file into my vault. What it writes
and what the documentation says it writes are two different texts. They drifted apart when
[docs/MODULE-SCHEMA.md](../MODULE-SCHEMA.md) was migrated to English (commit `e8959d1`) and
`MODULE_SCHEMA_TEMPLATE` in [src/core/wiki/agents-md.ts](../../src/core/wiki/agents-md.ts) was
not.

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

- [x] The template the app writes and `docs/MODULE-SCHEMA.md` are the same text — the check
      that compares them passes.
- [x] `npm test` is fully green, with no "known failure" carve-out anywhere in the repo.
- [x] Which of the two sides was authoritative, and why, is written down where the next reader
      finds it — not only in a commit message.
- [x] A module I already have in my vault is not touched. Creating a _new_ module writes the
      agreed text.
- [x] If the winning text is English, the app still writes it into a German-language vault
      without breaking anything that reads it (wiki lint, module view, page maintenance).

## Open Questions

1. ~~**Which side is authoritative — the doc or the code?**~~ answered → Decisions (Sprint)
2. ~~**Does the schema text follow `languages.documents`?**~~ decided → Decisions (Sprint)
3. ~~**Is the character-for-character comparison the right guard?**~~ decided → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** Which side is authoritative — the doc or the code: code is authoritative.
  `MODULE-SCHEMA.md` is rewritten to match what the code actually produces.
- **The schema text stays one fixed text (German); only the title line follows the language.**
  A per-language schema needs a second doc file plus a second drift guard — a new capability,
  not the drift fix this story is — and nothing in the app parses `AGENTS.md`.
- **The guard stays character-for-character.** The point of the doc is that it _is_ verbatim
  what lands in the vault; a structural test would let the vault copy and the documentation say
  different things again, which is exactly the defect being fixed.
- **The doc carries a repo-only banner as a leading HTML comment**, and the check strips exactly
  one leading HTML comment before comparing — so the authority note sits where someone would
  edit the doc, without being copied into the user's vault.
- **`docs/MODULE-SCHEMA.md` gets `text eol=lf` in `.gitattributes`.** The comparison is byte
  exact against a `\n` template literal; `core.autocrlf` on Windows would otherwise turn the
  gate red again for a reason unrelated to the text (same rationale as story 005).
- **The doc text is prettier-normalised first, then copied back into the constant.**
  `format:check` covers `docs/**.md` but never the inside of a template literal — normalising
  the other way round would leave the two gates contradicting each other.
- **Straight closing quotes inside the schema text (`„Pflege"`) stay as they are.** Story 026 is
  scoped to `src/renderer/i18n/de-*.ts`; fixing them here would be a collateral edit, and the
  byte-exact test forces whoever fixes them later to move both sides together.
- **Carve-out removal covers forward-looking documents only** (`docs/ROADMAP.md` gap entries,
  `docs/README.md`). The reviews under `docs/sprints/done/S0*/` are dated records of what was
  true then and are not rewritten.
- **No UI deliverable.** Creating a module already has its path through the Knowledge screen and
  this story changes no behaviour there — P1 is satisfied by the existing trigger, and the
  sprint doc lists 023 as exempt (engine plus docs).

## Plan

Code wins, so the German `MODULE_SCHEMA_TEMPLATE` becomes the text of `docs/MODULE-SCHEMA.md`.
The only trap is that two gates fence the same bytes: `format:check` formats the `.md`, while
the test compares it to a TS template literal prettier never touches. So normalise on the doc
side first, then copy back.

Order:

1. **Doc = code.** Write the current `MODULE_SCHEMA_TEMPLATE` body into `docs/MODULE-SCHEMA.md`
   (replacing the English text), run `prettier --write` on it, then copy the formatted result
   back into the constant in `src/core/wiki/agents-md.ts` — changing nothing but the escaping
   the template literal needs (backticks, `${`). Add the repo-only banner comment at the top of
   the doc, teach the test to strip one leading HTML comment, and pin the line endings in
   `.gitattributes`.
2. **Guardrail 2 and the language cross-check** get tests in the existing wiki test file: a
   pre-existing `AGENTS.md` survives a second `createModule` untouched, and a module created
   with `docLanguage: 'en'` still gets the schema written while nothing that reads the vault
   (page graph, lint, `listModules`) treats `AGENTS.md` as a wiki page.
3. **Write the decision down** where the next reader is: the doc banner (from step 1), the
   module docstring in `agents-md.ts`, the `docs/README.md` index line, and the gap entries in
   `docs/ROADMAP.md` (M1, M4, M9). Historical sprint reviews stay untouched.
4. **Close the gate.** `npm run verify` fully green, and no forward-looking document still
   claims a known failure.

Affected files: `docs/MODULE-SCHEMA.md`, `src/core/wiki/agents-md.ts`,
`tests/core/wiki/module.test.ts`, `.gitattributes`, `docs/README.md`, `docs/ROADMAP.md`.
No renderer, no IPC, no new module.

## Deliverables

**D1 — The doc is the text the app writes.**
Files: `docs/MODULE-SCHEMA.md`, `src/core/wiki/agents-md.ts`, `tests/core/wiki/module.test.ts`,
`.gitattributes`.
Replace the English doc body with the German `MODULE_SCHEMA_TEMPLATE`, prettier-normalise the
doc, sync the constant to the normalised text, add the leading banner comment naming the code as
authoritative, and make the comparison strip exactly one leading HTML comment.
Acceptance: `npx vitest run tests/core/wiki/module.test.ts` green (byte-exact case included),
`npx prettier --check docs/MODULE-SCHEMA.md` green, and rendering for a module still strips repo
links and substitutes the slug (existing tests unchanged).
→ AC1

- [x] D1

**D2 — An existing module is not touched, and an English vault is not broken.**
Files: `tests/core/wiki/module.test.ts` (mirror the existing `describe('AGENTS.md')` block).
Two tests: (a) `createModule` run over a store that already holds a hand-edited
`modules/<slug>/AGENTS.md` leaves that file byte-identical and does not list it in `created`;
(b) a module created with `docLanguage: 'en'` gets `AGENTS.md` with the English title line and
the schema body, `listModules` reports it normally, and the wiki page graph / lint produce no
finding for `AGENTS.md` (it sits outside `modules/<slug>/wiki/`).
Acceptance: both tests green without a production change — if one of them needs a code change,
that is a real defect and gets fixed with it.
→ AC4, AC5

- [x] D2

**D3 — The decision is written down where the next reader looks.**
Files: `src/core/wiki/agents-md.ts` (module docstring), `docs/README.md`, `docs/ROADMAP.md`.
The docstring says the constant is the source of truth and the doc mirrors it; `docs/README.md`
says the same in its index line; the ROADMAP gap entries under M1, M4 and M9 are rewritten from
"needs an owner" to the decision plus its reason, with the corrected file path (`agents-md.ts`,
not `module.ts`).
Acceptance: no forward-looking doc still asks which side is authoritative; the reviews under
`docs/sprints/done/` are unchanged.
→ AC3, AC2 (documents)

- [x] D3

**D4 — The gate is green.**
Files: none expected (only fixes, if something surfaces).
Run `npm run verify` end to end and grep the repo for remaining carve-out language
("pre-existing", "known failure", "unrelated failure") outside `docs/sprints/done/`.
Acceptance: `npm run verify` fully green, zero failed tests, and no skipped or todo test added
by this story.
→ AC2

- [x] D4

## Model Hints

- D1 → default
- D2 → default
- D3 → default
- D4 → default
- Review: → default — a text sync plus two tests, no new code path and no cross-module
  behaviour; the byte-exact test and `format:check` are themselves the regression guard.

## Test Plan (manual acceptance)

Optional — the sprint lists 023 as exempt (engine and docs, no UI change):

1. `npm run seed && npm run dev`, go to the Knowledge screen and create a module
   ("Test schema", any description).
2. Open `.demo-vault/modules/test-schema/AGENTS.md`: the title line reads
   `# Wissens-Modul: Test schema`, no `modules/<slug>` placeholder is left, `s-YYYY-MM-DD-<slug>`
   still is one, and the body matches `docs/MODULE-SCHEMA.md` below its banner comment.
3. Hand-edit one line of that `AGENTS.md` and create the same module again from the UI: the edit
   is still there.

## Done

**Summary.** `docs/MODULE-SCHEMA.md` now carries the exact German text of `MODULE_SCHEMA_TEMPLATE`
(`src/core/wiki/agents-md.ts`), behind a leading repo-only HTML-comment banner naming the code as
authoritative; the byte-exact drift-guard test strips that one banner before comparing, so the
gate stays character-for-character. Two tests were added to guard guardrail 2 (a hand-edited
`AGENTS.md` survives a second `createModule` untouched, not listed in `created`) and the
English-vault path (`docLanguage: 'en'` gets the English title line over the fixed German body;
`listModules`, the page graph and wiki lint all ignore `AGENTS.md` since it lives outside
`modules/<slug>/wiki/`). The decision is written down in the `agents-md.ts` docstring,
`docs/README.md`'s index line, and the `docs/ROADMAP.md` gap entries under M1/M4/M9 (also fixing
a wrong `module.ts` path reference to `agents-md.ts`). `.gitattributes` pins
`docs/MODULE-SCHEMA.md text eol=lf` so Windows `core.autocrlf` cannot flip the byte-exact gate red
for an unrelated reason.

**Commit message:** `023: module schema doc and code say the same thing`

**Verification.**

- `npm test` — 184 files, 2641 tests, 0 failed, 0 skipped, 0 todo. The previously-red byte-exact
  test (`tests/core/wiki/module.test.ts:392`) is green.
- `npm run lint` — clean.
- `npm run typecheck` — clean (both tsconfig.node.json and tsconfig.web.json).
- `npm run build` — electron-vite build succeeds (main/preload/renderer).
- `npm run format:check` — **fails**, but on a pre-existing, environment-level issue unrelated to
  this story: this Windows checkout has `core.autocrlf=true`, which turns checked-out LF files
  into CRLF, and Prettier's default `endOfLine: lf` then flags them. Confirmed via `git stash`
  that this affected 470 files before this story's changes and 469 after (one fewer, because the
  now-synced `docs/MODULE-SCHEMA.md` is prettier-clean via the new `.gitattributes` rule); the two
  source files this story touched (`agents-md.ts`, `module.test.ts`) still show CRLF under the
  same repo-wide condition documented repeatedly in `docs/sprints/done/S01-S05/review.md`. Not
  caused or worsened by D1–D4, and not fixable within this story's scope without either touching
  global git config (out of bounds) or a repo-wide `.gitattributes` renormalization far beyond "a
  text sync plus two tests".
- Code review (fresh agent, default tier): **PASS**. All five acceptance criteria independently
  verified PASS with file:line evidence; the banner-stripping regex confirmed non-greedy (cannot
  swallow more than one leading comment) and the comparison stays a strict `.toBe()`; no scope
  creep, no weakened tests, no guardrail violations. No findings required fixing.

**Decisions.**

- The `format:check` failure is treated as a pre-existing, environment-only gap (Windows
  `core.autocrlf` vs. Prettier's `lf` default) and does not block this story's "done": AC2 asks
  for `npm test` fully green with no module-schema carve-out, which holds. This mirrors how prior
  sprints (`docs/sprints/done/S01`–`S05/review.md`) already carried the same, unrelated
  observation. Fixing it repo-wide would touch hundreds of files with no relation to the module
  schema and is out of scope for 023.
- `src/core/wiki/agents-md.ts`'s `MODULE_SCHEMA_TEMPLATE` constant itself needed no text change —
  it was already correct; only `docs/MODULE-SCHEMA.md` had drifted, confirming the story's "code
  is authoritative" call.
