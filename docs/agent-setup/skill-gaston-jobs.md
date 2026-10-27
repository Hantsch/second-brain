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

A job kind this skill does not describe gets `skipped` with the reason "unknown job kind".
Do not guess what such a job wants.

## Never

- Edit or delete a job file. Jobs belong to Gaston.
- Write `.ingest.json` files.
- Write a second result for a job, or a result under a different file name.
