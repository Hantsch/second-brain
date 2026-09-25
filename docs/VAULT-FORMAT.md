# Vault format

The vault is a folder. Everything in it is Markdown with YAML frontmatter,
readable in Obsidian, versionable with Git, copyable to a USB stick. This
document is the contract: what isn't written here doesn't get written.

## Folders

```
<vault>/
  README.md                   explains the folder to anything that isn't Gaston
  inbox/                      dumps, not yet filed
    2026-08-10-1432-short-slug.md
  journal/
    2026/08/2026-08-10.md     one day = one file
  projects/
    work/<slug>/project.md    project file
    work/<slug>/notes/        optional long-form notes for the project
    work/<slug>/condensed.md  condensed state for that project, sibling file
    private/<slug>/project.md
  areas/<slug>.md             ongoing responsibilities with no end
  areas/<slug>.condensed.md   condensed state for that area, sibling file
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
```

`areas/<slug>.condensed.md` is the same kind of exception as
`web/<date>-<slug>.ingest.json` above: a dotted sibling file rather than a
folder, distinguished from `areas/<slug>.md` by the `.condensed.md` suffix. It
belongs to a different document type (`condensed`, not `area`) even though it
lives in the same folder next to the area it condenses.

`projects/<scope>/<slug>/condensed.md` needs no such dotted-name trick: a
project already has its own folder, so the condensed artifact is simply
`condensed.md` next to `project.md` inside it, told apart by its plain
filename rather than by a suffix. It is document type `condensed`, same as
the area's, resolved before the generic `projects/<scope>/<slug>/*` branch
so it never falls back to `project`.

```
  .secondbrain/               derived, safe to delete
    vault.json                marker: version, name, created at
    settings.json              vault settings (travel with it)
    overview.json               reminder quiet periods, deadlines already reported
    gardener.json               latest maintenance report, "dismissed", snoozed days, completed findings
    index/index.json           manifest: file hashes + derived lists, no bodies
    index/index.bodies/<xx>.json  bodies, 256 buckets (xx = first two hex chars of sha256(path))
    index/index.search.json    search state + the hashes it covers
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
filed_into: null # only set once filed: path of the target file
filed_at: null # only set once filed: YYYY-MM-DD
---

The whole raw text, unchanged from what was typed.
```

`status`: `raw` (untouched) → `proposed` (a proposal exists) → `filed` (the
content was written to its target) or `kept` (deliberately left as-is).

**A filed dump stays where it is.** It is neither moved to
`.secondbrain/trash/` nor deleted: it remains in `inbox/` as a receipt of where
its content went, with its body unchanged. Filing writes exactly three fields:

```yaml
status: filed
filed_into: projects/work/kundenportal-relaunch/project.md
filed_at: 2026-08-11
```

Undoing a filing takes the appended block back out of the target file and sets
all three back — the previous status, and `filed_into`/`filed_at` to `null`.
Whatever counts open dumps looks at `status` alone: `raw` and `proposed` are
open, `filed` and `kept` are not, so a receipt never shows up as unfiled again.

## Project (`projects/<scope>/<slug>/project.md`)

```markdown
---
type: project
title: Nyota Auth0 Migration
slug: nyota-auth0-migration
scope: work
status: active
priority: 2
favorite: true
started: 2026-06-12
deadline: 2026-09-01
next_step: Work in Stefan's feedback on the role mapping
status_set: { at: 2026-08-10, by: user }
next_step_set: { at: 2026-08-10, by: user }
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
`status_set` and `next_step_set` are optional — a project file without them stays
valid. Where present, each has the shape `{ at: <YYYY-MM-DD>, by: ... }`, with `by`
exactly one of `user` · `suggestion` · `filing`: set by the user directly, accepted
from a suggestion, or written while filing a dump. An unrecognized value counts as
missing to anything that reads it — a hand-typed word is never trusted as a claim
the app can't back. The app stamps these itself whenever it writes the paired field
(`status` or `next_step`); nothing else writes them.
`favorite` is a plain boolean the user or the app sets to mark a project they want
to see immediately; missing or any value other than `true` counts as not-favourited.
Work and private projects stay separated everywhere else in the app — todo tiles,
todo scoping — but the project list is a documented exception: there, favourites
and last-worked-on produce one single list across scopes, with scope separation
left entirely to the existing scope filter rather than to visual blocks.
`repos` connects the project to Claude Code sessions: if a session lives in this
directory, it counts as a work trace for the project. Filing writes the state and
notes headings in the vault's configured document language (`languages.documents`)
— `## Status`/`## Notes` for English, `## Stand`/`## Notizen` for German — but
re-resolves against whatever heading the target file already has: a
document-language switch never orphans a section already filed under the other
spelling, and a file carrying both appends new content under whichever heading
comes first in the file. The notes section accepts either heading, "Notes" or
"Notizen" — the same tolerance areas have (below).

## Condensed project (projects/<scope>/<slug>/condensed.md)

```markdown
---
type: condensed
title: Nyota Auth0 Migration — verdichtet
condensed_at: 2026-08-10T09:15:00+02:00
sources: [projects/work/nyota-auth0-migration/project.md]
source_hashes:
  projects/work/nyota-auth0-migration/project.md: 9f2c1b…
---

## Stand

Die knappste, aktuelle Zusammenfassung: wo das Projekt gerade steht.

## Nächster Schritt

Was als Nächstes ansteht.

## Wartet auf

Wer noch etwas liefern muss, und worauf.

## Gelernt

Was sich aus dem Projektverlauf als Erkenntnis festhalten lässt.
```

A condensed project is a derived, periodically refreshed digest of a project —
the short version to read instead of the full history in
`projects/<scope>/<slug>/project.md`. It follows the same frontmatter contract
as a condensed area: `condensed_at` is an ISO-8601 timestamp with time zone,
`sources` lists what the run read, and `source_hashes` records the sha256 of
every **vault** document among those sources at digest time, so a maintenance
run can tell whether a condensation is due without opening a file or calling a
model.

A source is either a vault-relative path or an agent-session citation of the
form `agent:<kind>/<pathKey>` (`<kind>` is `claude` today; `<pathKey>` is the
normalised session-project key from `src/core/claude/paths.ts`) — one entry
per distinct linked agent project whose transcripts the run read, not one per
session. An agent session lives outside the vault, so it appears in `sources`
but never in `source_hashes`; the app resolves such a citation back to the
referenced agent session view.

Input selection is deterministic and covers four groups: `project.md`'s own
state section plus every note under `notes/` verbatim, todos and `waiting_on`
entries (open and closed, with their dates), journal entries mentioning the
project within a 90-day window, and the tail of the most recently active
linked agent sessions. Where a bound left material out, the run states so in
the artifact body, prefixed with `<!-- condense:truncation -->`.

## Area (`areas/<slug>.md`)

```markdown
---
type: area
title: Gesundheit
scope: private
created: 2026-02-11
updated: 2026-08-04
tags: [routine]
lang: de
---

## Todos

- [ ] Termin beim Physiotherapeuten machen @due:2026-08-14
- [x] Schlafzeiten zwei Wochen mitgeschrieben @done:2026-08-04

## Notizen

### 2026-07-28

Der Rücken meldet sich vor allem bei langen Sitzungen. Kurze Pausen alle 45
Minuten haben mehr gebracht als jede neue Übung.
```

An area is an ongoing responsibility with no end — health, a relationship, a
recurring chore — as opposed to a project, which can finish. `scope`: `work` ·
`private`. Filing writes the notes heading in the vault's configured document
language (`languages.documents`) — "Notes" for English, "Notizen" for German —
unless the target file already has one, in which case that heading is reused.
The notes section accepts either heading, "Notizen" or "Notes": reading is
tolerant of both spellings so a document-language switch never orphans notes
already filed under the other one, and if a file somehow carries both, the one
that's already there is the one new notes append to. A note dropped with no
chosen target lands in the default area, `areas/notes.md`,
created on first use.

## Condensed area (areas/<slug>.condensed.md)

```markdown
---
type: condensed
title: Gesundheit — verdichtet
condensed_at: 2026-08-10T09:15:00+02:00
sources: [areas/gesundheit.md, journal/2026/07/2026-07-15.md]
source_hashes:
  areas/gesundheit.md: 9f2c1b…
  journal/2026/07/2026-07-15.md: 4ad07e…
---

## Stand

Die knappste, aktuelle Zusammenfassung: wo die Area gerade steht.

## Muster

Wiederkehrendes, das sich über mehrere Einträge in `sources` bestätigt hat.

## Offen

Was noch unklar ist oder als Nächstes ansteht.

## Direktiven

Handschriftliche Vorgaben des Nutzers. Dieser Abschnitt gehört ihm — ein
Kondensationslauf liest ihn, schreibt ihn aber nie.
```

A condensed area is a derived, periodically refreshed digest of an area — the
short version to read instead of the full history in `areas/<slug>.md`.
`condensed_at` is an ISO-8601 timestamp with time zone, set every time the
file is (re-)written. `sources` reuses the frontmatter key from wiki pages
(see below): a list of vault-relative paths to whatever the digest was built
from — the area file itself plus the journal days carrying the area's slug
within the last 90 days. There is no separate evidence mechanism for condensed
areas; the same `sources` field that backs wiki statements backs this digest.

`source_hashes` annotates that list: for each path, the sha256 of that whole
file as it stood when the digest was written — the same hash the index and the
vault's conflict detection use. It is what lets the maintenance run say a
condensation is due without opening a file and without a model: it compares the
recorded hashes against the current ones. A path in `sources` with **no** entry
in `source_hashes` counts as changed, not as current — that is the case for a
file written before this field existed, and for a path a user added to `sources`
by hand. The app would rather say "I cannot tell this is still current" than
assume freshness. `condensed_at` is not the comparison basis; it is a timestamp
for the reader, and a file touched without being changed is not new material.

The body has four sections, in this order: `Stand`/`Status` holds the current
state in prose; `Muster`/`Patterns` holds what recurs across sources;
`Offen`/`Open` holds what's still unresolved. `Direktiven`/`Directives` is the
one section a condensation run never touches — it is human-owned, exactly
like the user's own paragraphs in a journal `Day`: whatever the user writes
there survives every re-run untouched, the same way an area's `Notizen`
section survives filing. Section headings follow the vault's configured
document language, with the same de/en tolerance on read as the other
sections in this document.

## Todos

A todo is a GFM checkbox in any vault file — no dedicated format, so Obsidian and
any editor can work with it. Optional inline markers:

| Marker               | Meaning                                   |
| -------------------- | ----------------------------------------- |
| `@due:2026-08-15`    | Due on                                    |
| `@wait:Stefan`       | Waiting on a person                       |
| `@needed:2026-08-20` | Reply must be there by then at the latest |
| `!` `!!` `!!!`       | Low, medium (default), high priority      |
| `#tag`               | Tag                                       |
| `@done:2026-08-09`   | Set when checked off                      |

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
areas: [health]
tags: [stress]
---

## Day

This sprint feels impossible. Three things at once, and everyone is waiting
on me.

> **Second Brain** — 18:40
> Two of the three aren't waiting on you — they're waiting on someone else.
> What actually depended on you today is done.

Fair. Doesn't change how it feels, but it helps to see it written down.

## Facts

- [ ] Follow up with Stefan about the role concept @due:2026-08-12
```

`Day` is one continuous, chronological stream: my own paragraphs are plain
Markdown, exactly as typed, and the app's replies are the same blockquote
block, `> **Second Brain** — HH:MM`, interleaved between them in write order.
Nothing marks my own words specially — they're just prose — but an answer is
never merged into one of my paragraphs; the two stay visually and structurally
distinct. `Facts` holds what day close extracted — proposals the user
confirmed.

The app was renamed to Gaston after this format was established: a fresh entry
now writes `> **Gaston** — HH:MM`, but the `> **Second Brain** — HH:MM` label
above — and any day already written with it — is still read and recognized
the same way, for backward compatibility. Nothing rewrites old entries to
relabel them.

`closed: YYYY-MM-DD` marks the day as finished — the calendar day, not a
timestamp. Missing or `closed: null` means the day is still open.

`people`, `projects`, `areas`, and `tags` are all optional, all merged rather
than overwritten: day close only ever adds to whatever's already there, never
removes an entry a previous close or a hand edit put in. `areas` holds slugs
of `areas/<slug>.md`, the same way `projects` holds project slugs. A day
without one of these keys — or without any of them — is exactly as valid as
one with all four; nothing requires them to be present.

The interview (story 012) is a scripted way of producing exactly this shape,
not a new one: each of its fixed questions is written as the app's blockquote,
immediately followed by my own prose as the answer, one pair at a time as each
question gets answered. No new section, no new heading — the same `Day` stream
above, just filled in by the interview's five-question flow instead of free
typing. A day that opened with the interview and nothing else reads as a
sequence of these pairs, back to back.

`Conversation`/`Gespräch` is legacy: a day written before this format kept the
coaching dialog in its own section, separate from `Day`. That section is
still valid to **read** — an existing file with one keeps working, untouched,
and stays editable — but a new day never gets one again, and nothing folds it
into the stream automatically. Moving a legacy conversation into the stream
is one explicit, user-confirmed, one-way action ("move the conversation into
the entry").

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

**The source payload is immutable.** Once ingested, transcripts, fetched pages,
and original files are never overwritten — they are the fixed point citations
are backed by. A new version = a new, dated folder. Two companions may grow:
`.ingest.json` records app bookkeeping, and a YouTube folder's `sources/`
contains files the user supplies manually. Every source carries `.ingest.json`:

```json
{
  "kind": "youtube",
  "origin": "https://www.youtube.com/watch?v=xOFkpf9KgKg",
  "ingestedAt": "2026-08-10T14:40:00+02:00",
  "title": "Your AI Second Brain Is Slowly Rotting",
  "fingerprint": "youtube:xOFkpf9KgKg",
  "sourcePage": "s-2026-08-10-ai-second-brain-rotting",
  "modules": ["second-brain-methodik"],
  "provenance": { "transcript": "yt-dlp", "metadata": "yt-dlp" }
}
```

YouTube folders follow the structure from `../yougrab`: `metadata.md`,
`metadata.json`, `transcript.md` (prose, for ingest), `transcript.timestamped.md`
(citable, with deep links), and `sources/` for manually supplied workflows,
models, or other files. During condensation, `resourceReport` in `.ingest.json`
records resources mentioned in the transcript or description and preserves all
description links. Re-running ingestion never removes or overwrites `sources/`.

Files under `raw/` index as type `raw`, derived from the path, without any
frontmatter change.

## What the app never does

- Change or delete an ingested source payload under `raw/`; bookkeeping in
  `.ingest.json` and files explicitly added to `sources/` are the two exceptions.
- Rewrite a user's line in a Markdown file it didn't create itself.
- Remove frontmatter fields it doesn't recognize.
- Write without checking the hash first.
- Write an API key into a vault file.
