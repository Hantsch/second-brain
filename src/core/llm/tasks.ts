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
  'project-status',
  'gardener-audit',
];

function definition(
  kind: TaskKind,
  suggested: ModelTier,
  flags: { sensitive?: boolean; streams?: boolean; structured?: boolean } = {},
): TaskDefinition {
  return {
    kind,
    labelKey: `task.${kind}.label`,
    hintKey: `task.${kind}.hint`,
    suggested,
    sensitive: flags.sensitive === true,
    streams: flags.streams === true,
    structured: flags.structured === true,
  };
}

/**
 * All tasks with their recommendation and character:
 * - `sensitive`: operates on personal content → prefer local models.
 * - `streams`: chat-like, the answer streams into the UI piece by piece.
 * - `structured`: the answer is JSON against a schema, not prose.
 */
export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  // One sentence of output — a large model would be wasteful here.
  definition('title-tags', 'cheap', { structured: true }),
  // Personal content, a simple decision: small and local.
  definition('classify-dump', 'cheap', { sensitive: true, structured: true }),
  // Structured extraction from personal text.
  definition('extract-tasks', 'cheap', { sensitive: true, structured: true }),
  // Must merge citations correctly and streams into the Ask screen.
  definition('query-answer', 'balanced', { streams: true }),
  // Just sorting: a short list of IDs, no prose.
  definition('query-rerank', 'cheap', { structured: true }),
  // Longer, but straightforward.
  definition('summarize-source', 'balanced'),
  // Linking, spotting contradictions, changing the vault's contents.
  definition('wiki-ingest', 'strong'),
  // The most sensitive thing here — and a conversation.
  definition('journal-chat', 'balanced', { sensitive: true, streams: true }),
  // Judgment on a project's history, presented as a proposal.
  definition('project-status', 'balanced', { structured: true }),
  // Judgment over the entire vault.
  definition('gardener-audit', 'strong', { structured: true }),
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
