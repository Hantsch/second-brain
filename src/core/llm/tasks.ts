/* The catalog of all LLM tasks. A task = a category the user assigns to a
   provider/model. The recommendations follow the table in docs/CONCEPT.md
   ("LLM: categorized, selectable, honest").

   The strings themselves don't live here but in `src/renderer/i18n/` under the
   keys `task.<kind>.label` and `task.<kind>.hint` — the core doesn't know any
   UI language. */

import type { ModelTier, TaskDefinition, TaskKind } from '@shared/types';

/** Order in which the tasks appear in settings. */
export const TASK_KINDS: readonly TaskKind[] = [
  'title-tags',
  'classify-dump',
  'extract-tasks',
  'query-answer',
  'query-rerank',
  'summarize-source',
  'wiki-ingest',
  'journal-chat',
  'journal-loose-ends',
  'project-status',
  'gardener-audit',
  'condense-area',
];

function definition(
  kind: TaskKind,
  suggested: ModelTier,
  typicalTokens: { in: number; out: number },
  flags: {
    sensitive?: boolean;
    streams?: boolean;
    structured?: boolean;
    minLocalParamsB?: number;
  } = {},
): TaskDefinition {
  return {
    kind,
    labelKey: `task.${kind}.label`,
    hintKey: `task.${kind}.hint`,
    suggested,
    typicalTokens,
    sensitive: flags.sensitive === true,
    streams: flags.streams === true,
    structured: flags.structured === true,
    minLocalParamsB: flags.minLocalParamsB,
  };
}

/**
 * All tasks with their recommendation and character:
 * - `sensitive`: operates on personal content → prefer local models.
 * - `streams`: chat-like, the answer streams into the UI piece by piece.
 * - `structured`: the answer is JSON against a schema, not prose.
 *
 * `typicalTokens` are rough guesses based on each task's shape (chat vs.
 * one-shot, short vs. long input/output) — not measured. They only need to be
 * plausible enough for a cost-per-run estimate in the recommendation screen.
 * Recalibrate once real usage logging exists (see 019b's out-of-scope note on
 * a usage log).
 */
export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  // One sentence of output — a large model would be wasteful here. Input is a
  // short dump text, output a handful of tags/title words.
  definition('title-tags', 'cheap', { in: 500, out: 60 }, { structured: true, minLocalParamsB: 1 }),
  // Personal content, a simple decision: small and local. Input is a dump,
  // output a compact filing verdict.
  definition(
    'classify-dump',
    'cheap',
    { in: 600, out: 120 },
    { sensitive: true, structured: true },
  ),
  // Structured extraction from personal text — input a dump/note, output a
  // short list of todo/deadline/waiting-on entries.
  definition(
    'extract-tasks',
    'cheap',
    { in: 700, out: 200 },
    { sensitive: true, structured: true },
  ),
  // Must merge citations correctly and streams into the Ask screen — the
  // input carries several retrieved snippets, the output a full answer.
  definition('query-answer', 'balanced', { in: 3000, out: 500 }, { streams: true }),
  // Just sorting: a short list of search-hit IDs in, an ordered list out.
  definition(
    'query-rerank',
    'cheap',
    { in: 800, out: 40 },
    { structured: true, minLocalParamsB: 1 },
  ),
  // Longer, but straightforward — a whole source transcript/document in, a
  // condensed wiki source page out.
  definition('summarize-source', 'balanced', { in: 6000, out: 800 }),
  // Linking, spotting contradictions, changing the vault's contents — several
  // existing wiki pages plus new material in, edited pages out.
  definition('wiki-ingest', 'strong', { in: 5000, out: 1500 }),
  // The most sensitive thing here — and a conversation: growing chat history
  // in, a conversational reply out.
  definition(
    'journal-chat',
    'balanced',
    { in: 2500, out: 400 },
    { sensitive: true, streams: true },
  ),
  // Reads journal prose to find things once announced and never mentioned
  // again — resolving a relative date and judging "was this addressed
  // later" needs more than a cheap model, and the input is personal.
  definition(
    'journal-loose-ends',
    'balanced',
    { in: 3000, out: 500 },
    { sensitive: true, structured: true },
  ),
  // Judgment on a project's history, presented as a proposal — a project's
  // notes/todos in, a structured status verdict out.
  definition('project-status', 'balanced', { in: 3000, out: 400 }, { structured: true }),
  // Judgment over the entire vault — the largest input here by far, a report
  // of findings out.
  definition('gardener-audit', 'strong', { in: 15000, out: 1500 }, { structured: true }),
  // Reads an area's own notes, todos and day entries carrying its slug —
  // personal knowledge in, a condensed structured overview out. Sensitive
  // like `journal-chat`.
  definition(
    'condense-area',
    'strong',
    { in: 8000, out: 1200 },
    { sensitive: true, structured: true },
  ),
];

const BY_KIND = new Map<TaskKind, TaskDefinition>(TASK_DEFINITIONS.map((t) => [t.kind, t]));

/** Definition of a task. Throws if the catalog doesn't know a task. */
export function taskDefinition(kind: TaskKind): TaskDefinition {
  const found = BY_KIND.get(kind);
  if (!found) throw new Error(`Unbekannte LLM-Aufgabe: ${kind}`);
  return found;
}

/** Recommended tier — the basis for `defaults[tier]` in routing. */
export function suggestedTier(kind: TaskKind): ModelTier {
  return taskDefinition(kind).suggested;
}

/** Tasks that should only run locally, because they read personal content. */
export function sensitiveTasks(): TaskKind[] {
  return TASK_DEFINITIONS.filter((t) => t.sensitive).map((t) => t.kind);
}
