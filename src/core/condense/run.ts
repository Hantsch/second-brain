/**
 * The condensation run of one area (story 037, D7).
 *
 * The same shape as `suggestProjectStatus()` in `core/overview/status.ts`: read
 * the inputs, ask the model, hand back a **proposal**. Nothing here writes — the
 * hash-guarded write is `condense/write.ts` (D8), called after the human said yes
 * (Guardrail 2).
 *
 * What makes this run different from the status suggestion is that it has **no
 * heuristic fallback**. Story 037: "there is no mechanical fallback here, because
 * a concatenation of excerpts presented as a synthesis would assert knowledge
 * nobody checked". So every way this run can fail to produce a trustworthy
 * artifact is its own typed result, and none of them carries artifact content:
 *
 * - `no-model`   — nothing is routed to `condense-area`. The run does not start.
 * - `no-inputs`  — the area has no notes, no todos and no day entries in range.
 * - `attribution-failure` — Guardrail 3, enforced in code: a section citing a
 *   path that was not read, or making a claim with no citation at all, fails the
 *   **whole** run. Not a repaired artifact, not a dropped sentence. The prompt
 *   states the rule; this module is what makes it true (Decision D5).
 * - `failed`     — the gateway threw or the reply did not parse. The artifact on
 *   disk is untouched, because nothing here ever touches it (AC 7).
 *
 * The truncation notice (AC 5) is written here from the deterministic selector's
 * own report, never asked of the model (Decision D8).
 */

import type { DocLanguage, TaskKind } from '@shared/types';
import { CONDENSE_AREA_SCHEMA, condenseAreaPrompt, isAbortError, parseJsonLoose } from '@core/llm';
import type { CondenseAreaSourceItem, LlmGateway } from '@core/llm';
import { deriveAreas } from '@core/index/areas';
import type { IndexedDoc } from '@core/index/types';
/* `isoStamp` is this repo's only "ISO-8601 with offset" formatter (it writes
   `ingestedAt` the same way). `condensed_at` needs exactly that shape (Decision
   D6), so it is reused rather than rebuilt. */
import { isoStamp } from '@core/ingest/raw';
import { sha256 } from '@core/vault/hash';
import { toVaultPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import {
  CONDENSED_SECTIONS,
  composeCondensedArtifact,
  emptyCondensedArtifact,
  parseCondensedArtifact,
} from './artifact';
import type { CondensedArtifact, CondensedSectionContent, CondensedSectionKind } from './artifact';
import { CONDENSE_DAY_WINDOW_DAYS, selectCondenseInputs } from './inputs';
import type { CondenseInputSelection, CondenseTruncationReport } from './inputs';
import { condensedAreaPath } from './paths';

/** The one task kind this run needs. Named in the `no-model` result, per AC 10. */
export const CONDENSE_AREA_TASK: TaskKind = 'condense-area';

/**
 * Marks the run's own truncation sentence in the artifact preamble. An HTML
 * comment because it must be invisible when the file is rendered, yet
 * recognisable to the next run: without it, each truncated run would stack
 * another notice onto the preamble the artifact module carries through verbatim.
 */
const TRUNCATION_MARKER = '<!-- condense:truncation -->';

export interface CondenseAreaDeps {
  /** The indexed docs — the same `readonly IndexedDoc[]` the selector takes. */
  docs: readonly IndexedDoc[];
  gateway: LlmGateway;
  /**
   * The existing `areas/<slug>.condensed.md`, whole file, or `undefined` when the
   * area has never been condensed. The caller reads it; this module has no
   * filesystem.
   */
  existing?: string;
  /** Language the artifact is written in — the document language, not the UI one. */
  docLanguage?: DocLanguage;
  /** "Now": the selector's 90-day window and `condensed_at`. Tests pass a fixed date. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** A section whose citations did not survive the subset check. */
export interface CondenseAttributionProblem {
  section: CondensedSectionKind;
  /**
   * `unknown-source`: cited a path that was not among the inputs read.
   * `no-source`: wrote prose and cited nothing — a claim without evidence.
   */
  reason: 'unknown-source' | 'no-source';
  /** The offending paths; empty for `no-source`. */
  sources: readonly string[];
}

export interface CondenseAreaProposal {
  kind: 'proposal';
  slug: string;
  /** `areas/<slug>.condensed.md` — where D8's write helper puts `content`. */
  path: string;
  /** The whole file, frontmatter included, ready to be written unchanged. */
  content: string;
  /** ISO-8601 with offset; the same value stands in `content`'s frontmatter. */
  condensedAt: string;
  /**
   * sha256 of the artifact as it was read, or `null` when none existed. D8 passes
   * it as `expectedHash` so a file that moved on in between gets a `conflict`
   * instead of an overwrite; `null` means "must not exist yet".
   */
  baseHash: string | null;
  /** Every input path the run read — the same list as the artifact's `sources:`. */
  sources: readonly string[];
  /** What the selector left out, or `null`. Already stated in `content`. */
  truncated: CondenseTruncationReport | null;
}

export interface CondenseAreaNoModel {
  kind: 'no-model';
  slug: string;
  /** Always `condense-area`: which routing entry is missing (AC 10). */
  task: TaskKind;
}

export interface CondenseAreaNoInputs {
  kind: 'no-inputs';
  slug: string;
}

export interface CondenseAreaAttributionFailure {
  kind: 'attribution-failure';
  slug: string;
  problems: readonly CondenseAttributionProblem[];
}

export interface CondenseAreaFailed {
  kind: 'failed';
  slug: string;
  /** Why the run could not complete. Never carries vault content (Guardrail 6). */
  reason: string;
}

export type CondenseAreaResult =
  | CondenseAreaProposal
  | CondenseAreaNoModel
  | CondenseAreaNoInputs
  | CondenseAreaAttributionFailure
  | CondenseAreaFailed;

/** One `{ path, text }` item per note, todo and day — D6's prompt shape. */
interface MappedInputs {
  notes: CondenseAreaSourceItem[];
  todos: CondenseAreaSourceItem[];
  days: CondenseAreaSourceItem[];
  /** Every distinct path above, in reading order. The set the check tests against. */
  paths: string[];
}

/**
 * D5's selection into D6's prompt input. The two shapes differ on purpose: the
 * selector returns domain objects (`AreaNote`, `Todo`, `JournalDay`), the prompt
 * wants `{ path, text }` — and the path is what the model may later cite.
 *
 * Notes and todos both come out of `areas/<slug>.md`, which is why they share one
 * path. Days are read from their doc body, not from `JournalDay.excerpt`: that
 * field is a card preview, and condensing a preview would lose the day.
 */
function mapInputs(
  selection: CondenseInputSelection,
  docs: readonly IndexedDoc[],
  areaFile: string | null,
): MappedInputs {
  const byPath = new Map(docs.map((doc) => [doc.path, doc]));
  const paths: string[] = [];
  const remember = (path: string): string => {
    if (!paths.includes(path)) paths.push(path);
    return path;
  };

  const notes: CondenseAreaSourceItem[] = [];
  if (areaFile !== null) {
    for (const note of selection.notes) {
      const text = note.heading === null ? note.excerpt : `${note.heading}\n${note.excerpt}`;
      if (text.trim().length === 0) continue;
      notes.push({ path: remember(areaFile), text });
    }
  }

  const todos = selection.todos.map((todo) => ({
    path: remember(todo.path),
    text: `[${todo.state}] ${todo.text}${todo.due === null ? '' : ` (${todo.due})`}`,
  }));

  const days = selection.days.map((day) => ({
    path: remember(day.path),
    text: `${day.date} ${day.title}\n${byPath.get(day.path)?.body ?? day.excerpt}`,
  }));

  return { notes, todos, days, paths };
}

/** One section of the model reply, or `null` when it does not match the schema. */
function readSection(raw: unknown): CondensedSectionContent | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = record['text'];
  const sources = record['sources'];
  if (typeof text !== 'string' || !Array.isArray(sources)) return null;
  return {
    text: text.trim(),
    sources: sources
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => toVaultPath(entry))
      .filter((entry) => entry.length > 0),
  };
}

/**
 * Guardrail 3, in code. Every cited path must be a member of the set actually
 * read — "some input" is not enough — and prose without any citation is a claim
 * nobody can check. Both make the run fail as a whole.
 */
function attributionProblems(
  sections: Record<CondensedSectionKind, CondensedSectionContent>,
  read: readonly string[],
): CondenseAttributionProblem[] {
  const allowed = new Set(read);
  const problems: CondenseAttributionProblem[] = [];
  for (const kind of CONDENSED_SECTIONS) {
    const section = sections[kind];
    const unknown = section.sources.filter((path) => !allowed.has(path));
    if (unknown.length > 0) {
      problems.push({ section: kind, reason: 'unknown-source', sources: unknown });
      continue;
    }
    if (section.text.length > 0 && section.sources.length === 0) {
      problems.push({ section: kind, reason: 'no-source', sources: [] });
    }
  }
  return problems;
}

/** The truncation sentence (AC 5), written from the selector's report, not by the model. */
function truncationNotice(report: CondenseTruncationReport, docLanguage: DocLanguage): string {
  const sentence =
    docLanguage === 'en'
      ? `This condensation did not read every available input: ${report.count} day ${report.count === 1 ? 'entry' : 'entries'} older than ${CONDENSE_DAY_WINDOW_DAYS} days were left out.`
      : `Diese Verdichtung hat nicht alle verfügbaren Eingaben gelesen: ${report.count} ${report.count === 1 ? 'Tageseintrag' : 'Tageseinträge'} älter als ${CONDENSE_DAY_WINDOW_DAYS} Tage blieben außen vor.`;
  return `${TRUNCATION_MARKER} ${sentence}`;
}

/** Preamble without the previous run's notice, so notices do not stack up. */
function preambleWithoutNotice(preamble: string): string {
  return preamble
    .split('\n')
    .filter((line) => !line.trimStart().startsWith(TRUNCATION_MARKER))
    .join('\n')
    .trim();
}

/**
 * Condenses one area into a proposed `areas/<slug>.condensed.md`, or says why it
 * cannot. Writes nothing, ever.
 */
export async function condenseArea(
  deps: CondenseAreaDeps,
  slug: string,
): Promise<CondenseAreaResult> {
  // The guard comes before every read: without a model the run does not start
  // at all, and says which routing entry is missing (AC 10, Guardrail 1).
  if (!deps.gateway.isAvailable(CONDENSE_AREA_TASK)) {
    return { kind: 'no-model', slug, task: CONDENSE_AREA_TASK };
  }

  const docLanguage = deps.docLanguage ?? 'de';
  const now = deps.now ?? new Date();
  const selection = selectCondenseInputs(deps.docs, slug, { now });
  const area = deriveAreas(deps.docs).find((candidate) => candidate.slug === slug) ?? null;
  const inputs = mapInputs(selection, deps.docs, area === null ? null : area.path);

  if (inputs.paths.length === 0) return { kind: 'no-inputs', slug };

  const current =
    deps.existing === undefined ? emptyCondensedArtifact() : parseCondensedArtifact(deps.existing);

  let reply: Record<string, unknown>;
  try {
    const result = await deps.gateway.complete({
      task: CONDENSE_AREA_TASK,
      messages: condenseAreaPrompt(
        {
          title: area?.title ?? (current.title.length > 0 ? current.title : slug),
          slug,
          current,
          notes: inputs.notes,
          todos: inputs.todos,
          days: inputs.days,
          truncated: selection.truncated !== null,
        },
        docLanguage,
      ),
      schema: CONDENSE_AREA_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    reply = parseJsonLoose<Record<string, unknown>>(result.text);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { kind: 'failed', slug, reason: reasonOf(error) };
  }

  const sections = {} as Record<CondensedSectionKind, CondensedSectionContent>;
  for (const kind of CONDENSED_SECTIONS) {
    const section = readSection(reply[kind]);
    if (section === null) {
      return { kind: 'failed', slug, reason: `The reply has no usable "${kind}" section.` };
    }
    sections[kind] = section;
  }

  const problems = attributionProblems(sections, inputs.paths);
  if (problems.length > 0) return { kind: 'attribution-failure', slug, problems };

  const condensedAt = isoStamp(now);
  const notice =
    selection.truncated === null ? '' : truncationNotice(selection.truncated, docLanguage);
  const kept = preambleWithoutNotice(current.preamble);
  const artifact: CondensedArtifact = {
    ...current,
    title: area?.title ?? (current.title.length > 0 ? current.title : slug),
    condensedAt,
    sources: [...inputs.paths],
    sections,
    preamble: [notice, kept].filter((part) => part.length > 0).join('\n\n'),
  };

  return {
    kind: 'proposal',
    slug,
    path: condensedAreaPath(slug),
    content: composeCondensedArtifact(artifact, docLanguage),
    condensedAt,
    baseHash: deps.existing === undefined ? null : sha256(deps.existing),
    sources: [...inputs.paths],
    truncated: selection.truncated,
  };
}

/** An error's message, without ever quoting vault content back (Guardrail 6). */
function reasonOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error.';
}
