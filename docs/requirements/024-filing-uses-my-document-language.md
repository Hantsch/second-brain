---
id: 024
title: Filing writes headings in my document language
status: ready # draft -> ready -> in-progress -> done
created: 2026-08-22
---

## Requirement

I can set the language of my documents separately from the language of the interface
(`languages.documents`). The filing path ignores it. When a dump is filed onto a project or an
area, the section it appends to is called **`Notizen`** — hardcoded
([filing.ts:24](../../src/core/capture/filing.ts#L24),
[actions.ts:26](../../src/core/capture/actions.ts#L26)) — no matter what my vault is written in.

For an English vault that means my project file ends up with two notes sections: the `## Notes`
I wrote and the `## Notizen` the app added. Two sections for one thing, in two languages, in a
file I own. Every later note lands in whichever one the app finds, and I have to clean it up by
hand.

The machinery for this already exists and works: `src/core/vault/sections.ts` and
`src/core/areas/sections.ts` match headings folded, so "Notizen" and "Notes" already count as
the same section on the paths that use them — the note composer from story 003 and the areas
write path from story 005 both do. The general filing path was deliberately left out of both
stories (recorded as a gap under M1 and M2 in the roadmap). This story closes it.

It must not break the vault I already have. A file that carries `## Notizen` today keeps it —
the app appends to the section that is there and does not rename or migrate anything.

## Acceptance Criteria

- [ ] With `languages.documents: en`, filing a dump onto a project or an area that has no notes
      section yet creates `## Notes`, not `## Notizen`.
- [ ] With `languages.documents: de` it creates `## Notizen`, as today.
- [ ] Filing onto a file that already has a notes section appends to **that** section, whichever
      language it is written in, and never creates a second one.
- [ ] My existing files are not rewritten, renamed or migrated by this change — the only writes
      are the appends I trigger.
- [ ] The filing preview shows the heading it is going to write, so I see it before I confirm.
- [ ] Works without a model configured — filing is a heuristic path and stays one.

## Open Questions

1. ~~**Which write paths are in scope?**~~ answered → Decisions (Sprint)
2. ~~**What happens when the setting changes after files exist?**~~ answered → Decisions (Sprint)
3. ~~**Is `Notes`/`Notizen` the only pair?**~~ answered → Decisions (Sprint)

## Decisions (Sprint)

- **(User)** What happens when `languages.documents` changes after files exist: not a silent
  accept. The settings screen warns at the point of the language switch that existing vault
  files keep their old-language section headings, and offers a migration (rename/fold old
  section headings to the new language) the user can trigger. Folded matching still applies as
  the fallback for anything the user doesn't migrate. This is in scope for this story, not
  deferred — the warning + offer is a UI surface, so `ui-acceptance-required` applies to it.
- **Scope is the capture/filing write path only** (`core/capture/actions.ts`, `filing.ts`,
  `apply.ts`, `main/ipc/capture-proposal.ts`) — those are the four places that write a heading
  without knowing the document language; `journal/`, `areas/` and `projects/` already resolve
  theirs, and `gardener/`/`overview/` write no headings at all.
- **`ingest/youtube` stays out of scope** (`## Description`, `## Kapitel` in
  `transcript.ts`/`writer.ts`): those headings structure generated `raw/` files, not
  user-owned project/area/journal sections, so no dual-language section can grow there.
- **`wiki/` stays out of scope**: wiki pages carry their own schema headings from
  `docs/MODULE-SCHEMA.md` with their own language tables — a different contract than the
  vault's note sections, and story 023 owns that schema.
- **`Notes`/`Notizen` is not the only pair.** In scope are exactly the kinds the filing path
  can write: notes, todos, state, day, facts. `Quellen`/`Sources` and `Offene Punkte` are not
  written by filing and stay untouched.
- **`Todos` stays `Todos` in both languages**, as `areas/sections.ts` already records — that is
  the vault format, not an oversight.
- **The English state heading is `Status`**, per `docs/VAULT-FORMAT.md` (the project example
  shows `## Status`); the read side is widened to accept `stand`/`status`/`state`, because
  `index/projects.ts:29` accepts only `stand` today and would silently empty the re-entry
  excerpt of an English project file.
- **One shared name table** in `src/core/vault/section-names.ts` instead of a fourth private
  one: `capture/` may not import `journal/` (journal already imports `SECTION_DAY` from
  capture), so the table has to sit below both.
- **The heading is resolved twice, and the write wins.** The proposal carries a resolved
  heading for the preview (from the indexed body, so it costs no file read), but
  `apply`/`filing` re-resolve against the freshly read target file — otherwise a stale index
  would create a second section, and AC 3 has to hold even then.
- **Migration folds, it does not duplicate**: where a file has both headings, the old section's
  content moves under the target heading and the emptied heading goes; where it has only the
  old one, it is renamed. Writes go through `expectedHash`, so a conflict beats an overwrite.
- **The migration offer stays visible as long as the plan finds old-language headings**, not
  only in the seconds after the switch — an offer that disappears on reload would be a worse
  promise than none.

## Plan

Thread the document language through the one filing write path, on top of the resolver pattern
`journal/`, `areas/` and `projects/` already use — plus the settings-side warning and migration
the user asked for.

1. **One name table below everything** (`core/vault/section-names.ts`): kinds
   notes/todos/state/day/facts/dialogue → per-language names + folded aliases, with
   `sectionNameFor`, `sectionKindOf`, `sectionHeadingIn`. `journal/sections.ts`,
   `areas/sections.ts`, `projects/sections.ts` and `capture/actions.ts` read from it; their
   public APIs stay exactly as they are.
2. **Filing becomes language-aware** (`capture/actions.ts`, `filing.ts`, `apply.ts`,
   `heuristic.ts`, `classify.ts`): `docLanguage` (optional, default `'de'` — the house
   convention) reaches `SECTIONS`/`sectionFor`/`todoHome`/`alternativesFor`, replaces
   `DEFAULT_SECTION`, and `projectBody` writes the three sections in that language. At write
   time the heading is re-resolved against the target file that was just read, so an existing
   `## Notizen` keeps winning over the setting.
3. **The proposal carries the heading it will write** (`main/ipc/capture-proposal.ts`,
   `capture.ts`): `withAllTargets` resolves per target from the indexed body — no extra file
   reads — and `normalize` gets the language for the todo blocks.
4. **The preview names it** (`ProposalCard.tsx`): the target line says which heading the text
   lands under, before the confirm.
5. **Migration** (`core/vault/section-migration.ts`): plan (which file, which rename, which
   fold) → two `vault:` channels → a card in the languages tab that warns at the switch, shows
   the count and lets the user trigger it.
6. **Close the gap in the docs**: `VAULT-FORMAT.md` gets the rule for the filing path and the
   English state heading; the two gap notes in `ROADMAP.md` (~line 72 and ~line 109) go.

Order: 1 → 2 → 3 → 4 are one chain; the migration (D6–D8) is independent of 3/4 and can run in
parallel; docs last.

## Deliverables

- **D1 — the shared name table.** New `src/core/vault/section-names.ts` (kinds, per-language
  names, folded aliases, `sectionNameFor` / `sectionKindOf` / `sectionHeadingIn`).
  `src/core/journal/sections.ts`, `src/core/areas/sections.ts`,
  `src/core/projects/sections.ts` and `src/core/capture/actions.ts` source their tables from it
  — no exported signature changes. Mirror: `src/core/journal/sections.ts` is the pattern.
  _Accepted when:_ the existing journal/area/project section tests stay green unchanged, and
  new tests cover `sectionKindOf('Notizen') === 'notes'`, `sectionKindOf('Facts') === 'facts'`,
  unknown heading → `null`.
- **D2 — filing writes in the document language.** `src/core/capture/actions.ts`, `filing.ts`,
  `apply.ts`, `heuristic.ts`, `classify.ts`: `docLanguage` reaches every place that names a
  section; `apply`/`filing` re-resolve the heading against the target body they just read.
  Mirror: `src/core/areas/write.ts` (how a write path takes `docLanguage`). _Accepted when:_
  tests show `en` + no notes section → `## Notes`; `de` → `## Notizen`; existing `## Notizen` +
  `en` → appends there with no second section; existing `## Notes` + `de` → likewise; a new
  project file under `en` carries `## Status` / `## Todos` / `## Notes`; and a filing with the
  fake "no model configured" gateway takes the same path.
- **D3 — the read side accepts the English state heading.** `src/core/index/projects.ts`
  (`stand` → `stand`/`status`/`state`) and `src/core/overview/status.ts` (`STATE_SECTIONS`),
  both via D1's aliases. _Accepted when:_ a project file with `## Status` yields the same
  re-entry excerpt and status prose as one with `## Stand`.
- **D4 — the proposal names its heading.** `src/main/ipc/capture-proposal.ts` (resolve per
  target from the indexed body in `withAllTargets`, language into `normalize`) and
  `src/main/ipc/capture.ts` (pass `services.settings.vault()?.languages.documents`).
  _Accepted when:_ a test with an indexed doc containing `## Notizen` returns that heading in
  `primary.section` under `documents: 'en'`, and a doc without one returns `Notes`.
- **D5 — the preview shows the heading.** `src/renderer/components/ProposalCard.tsx` plus one
  key each in `src/renderer/i18n/de.ts` / `en.ts` (e.g. `proposal.section`). Gaston: no second
  accent, mono for the heading token, sentence case. _Accepted when:_ the card states the
  heading the text will land under, for the primary target and after switching target.
- **D6 — the migration engine.** New `src/core/vault/section-migration.ts`:
  `planSectionMigration(docs, to)` → `{ path, hash, renames, folds }[]` and
  `applySectionMigration` over a narrow store interface (read + write with `expectedHash`).
  _Accepted when:_ tests cover rename-only, fold (both headings present → content merged under
  the target heading, not a line lost), nothing to do → empty plan, and a stale hash →
  `conflict` instead of an overwrite.
- **D7 — the channels.** `src/shared/ipc.ts` (`vault:sectionPlan`, `vault:sectionMigrate` plus
  the runtime allowlist), new `src/main/ipc/section-migration.ts`, registration in
  `src/main/ipc/register-all.ts`, client in `src/renderer/lib/api.ts`. Mirror:
  `src/main/ipc/areas.ts`. _Accepted when:_ the IPC coverage test is green and the plan channel
  returns a count for the seeded demo vault.
- **D8 — the warning and the offer.** New
  `src/renderer/screens/settings/SectionMigrationCard.tsx`, wired into
  `src/renderer/screens/settings/LanguagesTab.tsx`, keys in
  `src/renderer/i18n/de-settings.ts` / `en-settings.ts`, query hook alongside the existing
  settings queries. The warning appears at the point of the `languages.documents` change; the
  card shows how many files carry old-language headings, asks for a confirm before writing, and
  reports what it changed. Mirror:
  `src/renderer/screens/settings/LocalRuntimeInstallDialog.tsx` (dialog + result),
  `src/renderer/atoms/Dialog.tsx`. _Accepted when:_ changing the document language in the
  running app shows the warning, and the migration can be triggered and reports its result.
- **D9 — docs.** `docs/VAULT-FORMAT.md` (the filing path writes in the document language;
  `## Status` is the English state heading) and `docs/ROADMAP.md` (drop the two gap notes at
  ~72–75 and ~109). _Accepted when:_ no gap note in the roadmap still claims the filing path
  hardcodes German.

### Coverage

| Acceptance criterion                               | Deliverable                                               |
| -------------------------------------------------- | --------------------------------------------------------- |
| `en` creates `## Notes`                            | D2 (+D1, D4 for the target list)                          |
| `de` creates `## Notizen`                          | D2                                                        |
| existing section wins, never a second one          | D2 (re-resolve at write) + D1 (aliases)                   |
| existing files are not rewritten or migrated       | D2 / D6 (migration only on explicit trigger), tests       |
| the preview shows the heading                      | D4 + D5                                                   |
| works without a model                              | D2 (heuristic path test with the fake "no model" gateway) |
| (User) warning + migration offer at the switch     | D6 + D7 + D8                                              |
| the state heading stays readable in both languages | D3                                                        |

## Model Hints

- `D2 → deliverable-hard` — the single filing write path, shared by the heuristic and the model
  route, with `revertFiling`/`undo` hanging off the same blocks: a heading resolved one step too
  early or too late either splits the user's notes section or breaks the undo of a block that
  was already written.
- `D6 → deliverable-hard` — folding two sections into one must not lose a line of the user's
  content and must still fail on a stale hash: subtle text surgery over files the app does not
  own.
- All other deliverables: default tier.
- `Review: → story-review-hard` — the story spans core, IPC and renderer and changes a path
  that writes into files the user owns; a regression here is silent and lands in their vault.

## Test Plan (manual acceptance)

1. `npm run seed`, then start the app (`npm run shot` for the screenshots).
2. Settings → Languages: set the document language to English. **Expect:** a warning that
   existing files keep their old-language headings, plus the migration offer with a count.
3. Quick capture: dump a sentence. Open the inbox, open the dump. **Expect:** the preview names
   the heading it will write (`Notes` for a project that has no notes section).
4. File it, open the project file. **Expect:** the text sits under `## Notes`, and there is only
   one notes section.
5. Take a project file that already carries `## Notizen` (the seed has German ones) and file a
   dump onto it while the document language is English. **Expect:** appended under
   `## Notizen`, no `## Notes` created.
6. Settings → trigger the migration. **Expect:** a confirm, then a summary of the files it
   changed; the previously German headings now read English, content unchanged.
7. Switch the document language back to German and file another dump. **Expect:** it lands
   under the migrated English heading — the file's word wins over the setting.

## Done
