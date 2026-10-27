---
name: gaston-propose
description: Write a proposal for a change Gaston must confirm before it is applied. Use for any change outside a module wiki.
---

# Propose a change

A proposal is how you change anything you may not write directly. Gaston shows it to the
person, who accepts or rejects it. Nothing is applied silently.

## Steps

1. Read the CLAUDE.md in the vault root, and read the target file in full.
2. Compute the sha256 of the target exactly as you read it.
3. Write one file per change to `.secondbrain/agent/proposals/`, named
   `<YYYYMMDD-HHMMSS>-<short-slug>.md` (for example `20261027-091200-fix-todo-dates.md`).
   Never bundle several changes into one file.
4. Gaston's hook writes the run report when the turn ends; never write to
   `.secondbrain/agent/runs/` yourself.

## Proposal file

A proposal is a Markdown file directly in `.secondbrain/agent/proposals/`: frontmatter, then the
new content.

| Field       | Value                                                              |
| ----------- | ------------------------------------------------------------------ |
| `gaston`    | always `proposal`                                                  |
| `version`   | always `1`                                                         |
| `kind`      | `edit` or `filing`                                                 |
| `target`    | the file the proposal is about, relative to the vault root         |
| `base_hash` | the sha256 of the target exactly as you read it: 64 hex characters |
| `run`       | the start time of this run, as an ISO timestamp                    |
| `reason`    | why the change is right, with the sources it rests on              |

A `filing` proposal adds `file_into`, the existing project, area or module file the text goes
into, and optionally `section`, the section of that file it belongs under.

Everything after the closing `---` line is the content, taken verbatim. For `edit` it is the
target's whole new content, not a patch. For `filing` it is the text to file into `file_into`.

Double-quote every frontmatter value that contains a colon or ` #`, or that starts with a
special character such as `[`, `{`, `*`, `&`, `!`, `%`, `@` or a backtick. This matters most
for `reason` and `run`. An unquoted `a: b` makes the whole proposal unreadable, and an
unquoted ` # …` silently cuts the value off there.

### Edit

```markdown
---
gaston: proposal
version: 1
kind: edit
target: projects/website-relaunch/project.md
base_hash: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
run: 2026-10-27T09:12:00.000Z
reason: "Launch moved: now 14 November, per Anna's 26 October note."
---

(the whole new content of projects/website-relaunch/project.md)
```

An `edit` target must already exist. A new file never comes in through an `edit`.

### Filing

```markdown
---
gaston: proposal
version: 1
kind: filing
target: inbox/2026-10-26-call-notes.md
base_hash: 2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae
run: 2026-10-27T09:12:00.000Z
reason: The call was about the relaunch and names two open decisions.
file_into: projects/website-relaunch/project.md
section: Notes
---

(the text to file into projects/website-relaunch/project.md)
```

A `filing` target is a dump under `inbox/`. New files only come in by filing: file the text
into an existing file instead of creating a new one.

## Never

- Target `journal/`, `raw/`, `.secondbrain/`, `.claude/` or `CLAUDE.md`.
- Target an `.ingest.json` file.
- Write the target itself. Only the proposal file is written.
- Propose a change you cannot justify from the vault.
