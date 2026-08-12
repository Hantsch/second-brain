# Knowledge module: schema

A knowledge module is a self-contained small wiki under `modules/<slug>/`,
maintained following Andrej Karpathy's LLM-wiki pattern. Adopted and adapted from
`../godot-RAG/AGENTS.md`.

This document gets **copied into the vault** as `modules/<slug>/AGENTS.md` when a
module is created (with the module name filled in). That way any LLM — Claude
Code, Copilot, a local model, the app itself — can maintain the module without
needing this app. The vault stays self-explanatory.

## The three layers

1. **`raw/` (at the vault root) — raw sources, immutable.**
   What's here is read, never changed. It's the fixed point every citation is
   backed by. If a source's content changes, a **new, dated folder** is added; the
   old one stays (it was true at the time).
2. **`modules/<slug>/wiki/` — the wiki, LLM-maintained.**
   Digested pages: source summaries, entities, concepts, synthesis, `index.md`,
   `log.md`. The app is allowed to rewrite this layer — with a visible proposal.
3. **`modules/<slug>/AGENTS.md` — this schema.**
   Conventions and workflows. Human and LLM develop it together over time.

## Structure

```
modules/<slug>/
  AGENTS.md          this schema, with the module name filled in
  module.md          title, purpose, scope, linked projects
  wiki/
    index.md         catalog of every page with a one-liner
    log.md           append-only chronicle (ingest | query | lint)
    overview.md       synthesis across the whole module
    sources/         s-YYYY-MM-DD-<slug>.md — one page per ingested source
    entities/        people, companies, products, systems, tools, projects
    concepts/        patterns, procedures, terms, techniques
```

## Page conventions

- **Filenames** lowercase, hyphenated, descriptive: `auth0.md`,
  `role-based-access-control.md`.
- **Wikilinks** `[[page-slug]]`, across module boundaries `[[module/page-slug]]`.
  Link generously — the connections are as valuable as the pages.
- **Frontmatter** per [VAULT-FORMAT.md](VAULT-FORMAT.md), always with `type`,
  `title`, `module`, `created`, `updated`, `tags`, `sources`.
- **Citations:** every non-trivial statement names its source:
  `(source: [[s-2026-08-10-auth0-rbac-guide]])`. Trust is reconstructed from
  citations, not asserted.
- **Record version and context** wherever they carry the statement (product
  version, date, environment). Don't generalize a version-specific technique into
  universal advice.
- **Separate what's backed by evidence from recommendation.** Measured, cited, and
  experienced are different things; the source's conditions stay attached.
- **Language:** the document language from settings (`languages.documents`).
  Sources may be in any language; when digesting, content gets carried over into
  the document language. A verbatim quote stays in the original when the exact
  wording matters (proper noun, defined term, contract clause) — with a
  translation alongside it.
- **Source pages** are named `s-YYYY-MM-DD-<slug>` and link to the folder under
  `raw/`.

## Workflows

### Ingest (a source comes in)

1. The raw source sits in `raw/` and is unchanged.
2. Create a source page in `wiki/sources/`: what it's about, the key claims,
   what's new relative to existing content, where it contradicts existing content.
3. Create or extend entities and concepts. A source typically touches 5–15 pages.
   For each: work in what's new, add cross-references, name contradictions and
   anything superseded.
4. Update `wiki/index.md` (rewrite touched entries).
5. Append an entry to `wiki/log.md`.
6. Update `wiki/overview.md` if the synthesis has genuinely changed.

**Always search before adding a new page to the wiki.** Extending an existing page
is almost always better than creating a near-duplicate.

### Query (a question comes in)

1. Read `wiki/index.md` first, then follow into the relevant pages.
2. Answer with citations to wiki pages and raw sources.
3. If the answer was valuable, file it as a page — otherwise the exploration
   disappears in the chat history. The app offers this with one click.

### Maintenance (regularly, see the "Garden" screen)

Machine checks first, then judgment: orphaned pages, broken wikilinks, index
drift, outdated statements, frequently mentioned terms without their own page,
missing cross-references, undigested sources. Findings are **reported, not
silently corrected.**

## Contradictions

A contradiction is not a defect to be smoothed away. When two sources disagree:

- Both statements stay, each with its citation.
- A short note describes the kind of conflict: `contradicts`, `supersedes`,
  `extends`.
- For factual statements superseded by a newer source: mark the old one as
  `superseded` and date it — don't delete it.

## Log format

`wiki/log.md` is append-only. Every entry starts with the same prefix so it stays
greppable (`grep "^## \[" wiki/log.md | tail -5`):

```
## [2026-08-10] ingest | Auth0 RBAC Guide
- summary: wiki/sources/s-2026-08-10-auth0-rbac-guide.md
- touched: [[auth0]], [[role-based-access-control]], index.md
- notes: contradicts [[old-role-concept]] on role inheritance

## [2026-08-10] query | How do roles inherit in Auth0?
- answered from: [[auth0]], [[role-based-access-control]]
- filed back: wiki/concepts/role-inheritance.md

## [2026-08-11] lint
- findings: 2 orphaned pages, 1 broken link, index.md missing 1 entry
```

## Principles

- The human curates and asks; the LLM does the bookkeeping.
- Knowledge is **digested once at ingest** and then kept current — not re-derived
  on every question.
- Cite everything, preserve provenance.
- Link generously, but extend existing pages instead of creating duplicates.
- A wiki that only grows and is never maintained rots. Maintenance is part of the
  work.
