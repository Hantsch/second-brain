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

## Result status

Every result carries one status:

- `done` when the work is finished.
- `failed` with a reason when you tried and could not finish.
- `skipped` with a reason when you chose not to do the job.

A job kind this skill does not describe yet gets `skipped` with the reason "unknown job kind".
Do not guess what such a job wants.

## Never

- Edit or delete a job file. Jobs belong to Gaston.
- Write `.ingest.json` files.
- Write a second result for a job, or a result under a different file name.

The exact result and report formats follow in later versions of this skill.
