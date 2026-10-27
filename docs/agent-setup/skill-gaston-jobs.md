---
name: gaston-jobs
description: Work through the open Gaston jobs in .secondbrain/agent/jobs/ and write one result per job. Use when asked to process Gaston jobs.
---

# Work the Gaston jobs

Gaston leaves jobs for you in `.secondbrain/agent/jobs/`. This skill works through them and
reports back through `.secondbrain/agent/results/`.

## Steps

1. Read the CLAUDE.md in the vault root first. Its rules apply to everything below.
2. List only the files directly in `.secondbrain/agent/jobs/`. Never look into
   `.secondbrain/agent/jobs/done/`: those jobs are finished. Sort the jobs oldest first by their
   `created` value (`createdAt` for a JSON job).
3. Skip every job that already has a result with the same file name in
   `.secondbrain/agent/results/`.
4. For each remaining job, in that order, do the work the job asks for, then write exactly one
   result to `.secondbrain/agent/results/`. The result name is the job's file name: a `.md` job gets
   a `.md` result, a `.json` job gets a `.json` result.
5. Gaston's hook writes the run report when the turn ends; never write to
   `.secondbrain/agent/runs/` yourself.

## Job files

A job is `.secondbrain/agent/jobs/<id>.md` (or `<id>.json` for `llm-task`). A Markdown job has
frontmatter with `gaston: agent-job`, `version: 1`, `id`, `kind`, `created` and
`subject`, plus the fields of its kind. Its result is `.secondbrain/agent/results/<id>.md` with
frontmatter `job: <id>`, `status`, `reason` and `sourcePage`, described under "Result format".

Double-quote every frontmatter value that contains a colon or ` #`, or that starts with a
special character such as `[`, `{`, `*`, `&`, `!`, `%`, `@` or a backtick. This matters most for
`title` and `reason`. An unquoted `a: b` makes the whole file unreadable, and an unquoted
` # …` silently cuts the value off there.

## Job kinds

### `llm-task`

A task the user routed to you instead of a language model. The job is JSON:

```json
{
  "version": 1,
  "id": "classify-dump-1a2b3c4d5e6f7a8b",
  "kind": "llm-task",
  "task": "classify-dump",
  "createdAt": "2026-10-27T09:12:00.000Z",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "schema": { "type": "object" }
}
```

Answer the conversation in `messages` as the assistant would: follow the system message, use
only what the messages contain, and do not change any vault file for it — Gaston turns your
answer into a proposal the user confirms. When `schema` is set, the answer must be JSON that
matches it.

### `condense-source`

A source that waits in `raw/` to be condensed into a wiki page. The job is Markdown, with these
fields besides the common ones:

| Field        | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| `raw`        | the source file, relative to the vault root                       |
| `module`     | the module the page belongs to, or null when you choose one       |
| `language`   | the language the page is written in                               |
| `title`      | the working title of the source                                   |
| `ingestHash` | the hash of the source when the job was written; do not change it |

1. Read the raw source at `raw`, in full. Never change it.
2. Write the page under `modules/<module>/wiki/sources/`. When `module` is null, use any
   existing module that fits. Never create a module.
3. The page has frontmatter `type: source`, `title`, `module` and `raw` (the path you read), and
   its text is in `language`. Use only what the source says.
4. Add the page to `modules/<module>/wiki/index.md` and add one entry to
   `modules/<module>/wiki/log.md`, as the module schema in `modules/<module>/AGENTS.md` asks.
5. Write the result with `status: done` and `sourcePage`, the path of the page you wrote.

### `curate-module`

A whole module that waits to be curated. The job is Markdown; its `subject` and its `module`
field are the module slug.

1. Work the module the way `/gaston-curate <slug>` does: read `modules/<slug>/AGENTS.md`, run the
   checklist of that skill and write only inside `modules/<slug>/wiki/`. Anything that needs a
   decision from the person goes through `/gaston-propose`.
2. Write the result with `status: done` when the module is curated.

The run report lists the pages you changed; the stop hook writes it, so you do not.

### `gardener-audit`

A maintenance run that waits to be interpreted. The job is Markdown; its `subject` is the run
and its fields are:

- `ranAt`: the time of the maintenance run.
- `findings`: a list of `id`, `kind`, `title` and `paths`, one entry per finding.
- `candidateIds`: the finding ids you may confirm or reject.
- `pages`: the wiki pages the findings touch.

1. Read every page in `pages`, in full. Change no file other than the result.
2. Judge the run and write the result with `status: done` and these frontmatter lists. Each is
   optional, and a missing one counts as empty.
   - `contradictions`: entries of `pathA`, `pathB` and `note` (one sentence on what conflicts).
     Both paths are existing wiki pages in the vault, and they differ.
   - `confirmed`: ids from `candidateIds` you confirm.
   - `rejected`: ids from `candidateIds` you reject as false alarms.
   - `advice`: at most three short sentences for the person.
3. Take paths only from the vault and ids only from the job. One path that is not in the vault,
   or one id that is not in the job, makes Gaston fail the whole result and book nothing.

### `condense-module`

A module whose overview waits to be condensed from its wiki pages. The job is Markdown; its
`subject` is the module slug, and its fields are:

- `module`: the module slug.
- `inputs`: the wiki pages of the module at hand-over, relative to the vault root.
- `baseHash`: the hash of `modules/<slug>/wiki/overview.md` when the job was written, or
  null when there was none. Do not change it.

1. Read every page in `inputs`, in full, and `modules/<slug>/wiki/overview.md` when it exists.
   Its directives section is an instruction to follow when you condense. It is never written,
   and neither is `overview.md` itself: Gaston turns your result into a proposal the person
   confirms. Change no file other than the result.
2. Write the result with `status: done` and, after the frontmatter, one fenced `json` block:
   `{ "decided": …, "open": …, "contradictions": … }`. Each section is
   `{ "text": string, "sources": string[] }`.
   - `decided`: what the pages settle.
   - `open`: what is still unanswered.
   - `contradictions`: where pages disagree. Name each contradiction and both pages; never
     resolve it.
3. Compress, do not append: the sections state the module as it stands now and replace the old
   overview text, in the language of the pages.
4. Every section with text cites only paths from `inputs` in its `sources`. One section that
   cites another path makes Gaston fail the whole result and propose nothing.
5. When it cannot be done, write the result with `status: failed` and a `reason`.

## Result format

A `condense-source` job gets a Markdown result: frontmatter, nothing required after it.

```markdown
---
job: condense-source-1a2b3c4d5e6f7a8b
status: done
sourcePage: modules/website-relaunch/wiki/sources/launch-brief.md
---
```

- `status: done` when the page is written, with `sourcePage` as above.
- `status: failed` with `reason` when you tried and could not finish.
- `status: skipped` with `reason` when you chose not to do the job.

An `llm-task` job keeps a JSON result with one status:

- `{ "status": "done", "text": "<the answer>" }` when the work is finished. For a job with a
  `schema`, `text` is the JSON answer, as a string or as the object itself.
- `{ "status": "failed", "reason": "<why>" }` when you tried and could not finish.
- `{ "status": "skipped", "reason": "<why>" }` when you chose not to do the job.

A `curate-module` job gets a Markdown result with the same frontmatter as above, without
`sourcePage`:

```markdown
---
job: curate-module-1a2b3c4d5e6f7a8b
status: done
---
```

A `gardener-audit` job gets a Markdown result that also carries the lists:

```markdown
---
job: gardener-audit-1a2b3c4d5e6f7a8b
status: done
contradictions:
  - pathA: modules/website-relaunch/wiki/launch-plan.md
    pathB: modules/website-relaunch/wiki/sources/launch-brief.md
    note: The plan says 14 November, the brief says 21 November.
confirmed:
  - orphan-3f9a1c
rejected:
  - stale-77b2e0
advice:
  - Settle the launch date before the next review.
---
```

A `condense-module` job gets a Markdown result whose body is the json block:

````markdown
---
job: condense-module-1a2b3c4d5e6f7a8b
status: done
---

```json
{
  "decided": {
    "text": "The relaunch is set for 14 November.",
    "sources": ["modules/website-relaunch/wiki/launch-plan.md"]
  },
  "open": { "text": "", "sources": [] },
  "contradictions": {
    "text": "The plan says 14 November, the brief says 21 November.",
    "sources": [
      "modules/website-relaunch/wiki/launch-plan.md",
      "modules/website-relaunch/wiki/sources/launch-brief.md"
    ]
  }
}
```
````

A job kind this skill does not describe gets `skipped` with the reason "unknown job kind".
Do not guess what such a job wants.

## Never

- Edit or delete a job file. Jobs belong to Gaston.
- Write `.ingest.json` files.
- Write a second result for a job, or a result under a different file name.
