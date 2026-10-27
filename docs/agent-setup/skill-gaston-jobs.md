---
name: gaston-jobs
description: Work through the open Gaston jobs in .secondbrain/agent/jobs/ and write one result per job. Use when asked to process Gaston jobs.
---

# Work the Gaston jobs

Gaston leaves jobs for you in `.secondbrain/agent/jobs/`. This skill works through them and
reports back through `.secondbrain/agent/results/`.

## Steps

1. Read the CLAUDE.md in the vault root first. Its rules apply to everything below.
2. List the files in `.secondbrain/agent/jobs/` and sort them oldest first.
3. Skip every job that already has a result with the same file name in
   `.secondbrain/agent/results/`.
4. For each remaining job, in that order, do the work the job asks for, then write exactly one
   result to `.secondbrain/agent/results/` under the job's file name.
5. End the run with one report in `.secondbrain/agent/runs/`.

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

## Result format

Every result is JSON with one status:

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
