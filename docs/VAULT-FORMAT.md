# Vault format

The vault is a folder. Everything in it is Markdown with YAML frontmatter,
readable in Obsidian, versionable with Git, copyable to a USB stick. This
document is the contract: what isn't written here doesn't get written.

## Folders

```
<vault>/
  README.md                   explains the folder to anything that isn't the Second Brain
  inbox/                      dumps, not yet filed
    2026-08-10-1432-short-slug.md
  journal/
    2026/08/2026-08-10.md     one day = one file
  projects/
    work/<slug>/project.md    project file
    work/<slug>/notes/        optional long-form notes for the project
    private/<slug>/project.md
  areas/<slug>.md             ongoing responsibilities with no end
  modules/<slug>/             one knowledge module = one Karpathy wiki
    module.md                 module description
    wiki/index.md             catalog of all pages
    wiki/log.md               append-only chronicle
    wiki/overview.md           synthesis across the module
    wiki/sources/s-<date>-<slug>.md
    wiki/entities/<slug>.md
    wiki/concepts/<slug>.md
  raw/                        immutable sources
    youtube/<video-id>/       folder from the YouTube pipeline
    files/<date>-<slug>/      uploaded files
    web/<date>-<slug>.md      fetched pages
    web/<date>-<slug>.ingest.json   log as a sibling file, when there's no folder
  .secondbrain/               derived, safe to delete
    vault.json                marker: version, name, created at
    settings.json              vault settings (travel with it)
    overview.json               reminder quiet periods, deadlines already reported
    gardener.json               latest maintenance report, "dismissed" and completed findings
    index/index.json           search index + file hashes
    chats/<id>.json            conversation histories
    logs/                      app logs
    trash/                     copies for undo
```

A folder is a vault exactly when `.secondbrain/vault.json` exists. The marker
carries `version`, `name`, and `createdAt`; the app creates missing folders on
open, without touching existing content. It only writes `README.md` if none
exists.

Two files under `modules/` are structure, not knowledge, and therefore carry
**no** frontmatter: `wiki/index.md` (catalog) and `wiki/log.md` (chronicle).
Links to them count neither as incoming nor as broken. `module.md` carries
`type: note` — `module` is not a document type — plus a `description` field.

## Shared rules

- **Filenames** lowercase, hyphenated, ASCII. Umlauts are transliterated
  (`ä`→`ae`), special characters are dropped.
- **Frontmatter** is always present and starts on line 1 with `---`.
- **Date fields** are `YYYY-MM-DD`, timestamps ISO-8601 with time zone.
- **`updated`** is only set by the app when it writes itself. If the user edits
  externally, `updated` isn't changed retroactively — the file's mtime is what
  counts.
- **Wikilinks** `[[slug]]` point within a module; across module boundaries
  `[[module/slug]]`. Link generously.
- **Unknown frontmatter fields are preserved.** Writes merge, never replace: what
  the user entered themselves survives every app write.

## Dump (`inbox/`)

```markdown
---
type: dump
title: Thought about the deployment pipeline
created: 2026-08-10T14:32:11+02:00
origin: quick-capture
status: raw
tags: []
scope: null
---

The whole raw text, unchanged from what was typed.
```

`status`: `raw` (untouched) → `proposed` (a proposal exists) → `filed` (filed
away, the file moves to `.secondbrain/trash/` or gets deleted) or `kept`
(deliberately left as-is).

## Project (`projects/<scope>/<slug>/project.md`)

```markdown
---
type: project
title: Nyota Auth0 Migration
slug: nyota-auth0-migration
scope: work
status: active
priority: 2
started: 2026-06-12
deadline: 2026-09-01
next_step: Work in Stefan's feedback on the role mapping
tags: [auth0, infrastructure]
modules: [identity-management]
repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure']
waiting_on:
  - who: Stefan
    what: Approval of the role concept
    since: 2026-08-04
    due: 2026-08-12
---

## Status

Where the project stands, in prose. The first paragraph is what shows up in
cards and lists — the re-entry point.

## Todos

- [ ] Document the role mapping @due:2026-08-15 !!
- [ ] Set up a test tenant
- [x] Migrated the Terraform state

## Notes

Attached dumps land here, each with a date as a subheading.

### 2026-08-10

Text of the filed dump.
```

`status`: `idea` · `active` · `waiting` · `paused` · `done` · `dropped`.
`repos` connects the project to Claude Code sessions: if a session lives in this
directory, it counts as a work trace for the project.

## Todos

A todo is a GFM checkbox in any vault file — no dedicated format, so Obsidian and
any editor can work with it. Optional inline markers:

| Marker                | Meaning                                  |
| ---------------------- | ------------------------------------------ |
| `@due:2026-08-15`     | Due on                                     |
| `@wait:Stefan`        | Waiting on a person                        |
| `@needed:2026-08-20`  | Reply must be there by then at the latest  |
| `!` `!!` `!!!`        | Priority 1–3                               |
| `#tag`                | Tag                                        |
| `@done:2026-08-09`    | Set when checked off                       |

Scope comes from the file: todos in `projects/work/...` are work, in
`projects/private/...` private. In `journal/` and `areas/`, `scope` in the
frontmatter decides, otherwise a `#work`/`#private` tag, otherwise private.

## Daily entry (`journal/YYYY/MM/YYYY-MM-DD.md`)

```markdown
---
type: journal
title: Monday, August 10, 2026
date: 2026-08-10
mood: 3
energy: 2
people: [Stefan, Anna]
projects: [nyota-auth0-migration]
tags: [stress]
---

## Day

What happened, in prose.

## Conversation

> **Me** — 18:40
> This sprint feels impossible.

> **Second Brain** — 18:40
> ...

## Facts

- [ ] Follow up with Stefan about the role concept @due:2026-08-12
```

The `Conversation` section is the coaching dialog, recorded verbatim. `Facts`
holds what day close extracted — proposals the user confirmed.

## Wiki pages (`modules/<slug>/wiki/`)

Schema follows Karpathy's LLM wiki, adopted from `../godot-RAG/AGENTS.md`:

```markdown
---
type: concept # source | entity | concept | overview
title: Role-Based Access Control
module: identity-management
created: 2026-07-02
updated: 2026-08-10
reviewed: 2026-08-10
tags: [auth, rbac]
sources: [s-2026-07-02-auth0-rbac-guide]
---

A statement backed by evidence (source: [[s-2026-07-02-auth0-rbac-guide]]).

## Contradictions

- [[s-2026-08-01-new-whitepaper]] contradicts the above on X. Both versions
  stay, the older one is marked `superseded`.
```

- Every non-trivial statement carries `(source: [[s-...]])`. No evidence, no
  statement.
- Source pages are named `s-YYYY-MM-DD-<slug>`.
- Contradictions are **kept and named**, not flattened: `contradicts`,
  `supersedes`, `extends`.
- `wiki/index.md` lists every page with a one-liner. `wiki/log.md` is
  append-only:

```
## [2026-08-10] ingest | Auth0 RBAC Guide
- summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
- touched: [[auth0]], [[role-based-access-control]], index.md
- notes: contradicts [[old-role-concept]] on inheritance
```

## Raw sources (`raw/`)

**Immutable.** A source, once ingested, is never overwritten — it's the fixed
point citations are backed by. A new version = a new, dated folder. Every source
carries `.ingest.json`:

```json
{
  "kind": "youtube",
  "origin": "https://www.youtube.com/watch?v=xOFkpf9KgKg",
  "ingestedAt": "2026-08-10T14:40:00+02:00",
  "title": "Your AI Second Brain Is Slowly Rotting",
  "sourcePage": "s-2026-08-10-ai-second-brain-rotting",
  "modules": ["second-brain-methodik"],
  "provenance": { "transcript": "yt-dlp", "metadata": "yt-dlp" }
}
```

YouTube folders follow the structure from `../yougrab`: `metadata.md`,
`metadata.json`, `transcript.md` (prose, for ingest), `transcript.timestamped.md`
(citable, with deep links).

## What the app never does

- Change or delete a file under `raw/`.
- Rewrite a user's line in a Markdown file it didn't create itself.
- Remove frontmatter fields it doesn't recognize.
- Write without checking the hash first.
- Write an API key into a vault file.
