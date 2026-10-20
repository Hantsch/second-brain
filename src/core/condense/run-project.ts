/**
 * The condensation run of one project (story 044, D8).
 *
 * `condenseArea()` in `./run.ts` one level down, and deliberately its mirror:
 * same guard order, same result union, same "propose, never write". What
 * differs is what a project *is* — four sections instead of three, four input
 * groups instead of three, and one input that does not live in the vault at
 * all (a linked agent session, cited as `agent:<kind>/<pathKey>`, D12).
 *
 * There is **no heuristic fallback** here either: a concatenation of excerpts
 * presented as a synthesis would assert knowledge nobody checked. So every way
 * this run can fail to produce a trustworthy artifact is its own typed result,
 * and none of them carries artifact content:
 *
 * - `no-model`   — nothing is routed to `condense-project`. The run does not
 *   start, names the missing task kind, and reads no input (AC 10).
 * - `no-inputs`  — the project has no state, no notes, no todos, no
 *   `waiting_on`, no mentioning day and no linked session. No file, no
 *   placeholder, no gateway call (AC 1).
 * - `attribution-failure` — Guardrail 3, enforced in code by `./attribution`:
 *   a section citing a source that was not read, or making a claim with no
 *   citation at all, fails the **whole** run.
 * - `failed`     — the gateway threw or the reply did not parse.
 *
 * An existing artifact stays byte-identical through every one of them, because
 * nothing in this module writes (AC 7). The hash-guarded write is
 * `writeCondensedProject()` in `./write`, called after the human said yes
 * (Guardrail 2).
 */

import type { DocLanguage, Scope, TaskKind, Todo, WaitingOn } from '@shared/types';
import {
  CONDENSE_PROJECT_SCHEMA,
  condenseProjectPrompt,
  isAbortError,
  parseJsonLoose,
  promptItemsClampedChars,
} from '@core/llm';
import type { CondenseProjectSourceItem, LlmGateway } from '@core/llm';
/* `isoStamp` is this repo's only "ISO-8601 with offset" formatter, and
   `condensed_at` needs exactly that shape — the same reuse the area run makes. */
import { isoStamp } from '@core/ingest/raw';
import { sha256 } from '@core/vault/hash';
import type { DateLike } from '@core/vault/paths';
import { composeArtifact, emptyArtifact, parseArtifact, PROJECT_SECTIONS } from './artifact';
import type { CondensedProjectArtifact, CondensedProjectSectionKind } from './artifact';
import { attributionProblems, readReplySections } from './attribution';
import type { AttributionProblem } from './attribution';
import { projectInputs, selectProjectCondenseInputs } from './inputs-project';
import type {
  CondenseProjectInputSelection,
  CondenseProjectSession,
  CondenseProjectSources,
  CondenseProjectTruncationReport,
} from './inputs-project';
import { preambleWithoutNotice, projectTruncationNotice } from './notice';
import { condensedProjectPath } from './paths';
import { sourceHashesOf } from './sources';

/** The one task kind this run needs. Named in the `no-model` result, per AC 10. */
export const CONDENSE_PROJECT_TASK: TaskKind = 'condense-project';

/**
 * Everything the run needs. The vault side is `CondenseProjectSources` — the
 * very shape the deterministic selector (D6) takes, passed straight through, so
 * this module never becomes a second place that decides what may be read.
 */
export interface CondenseProjectDeps extends CondenseProjectSources {
  gateway: LlmGateway;
  /**
   * The existing `projects/<scope>/<slug>/condensed.md`, whole file, or
   * `undefined` when the project has never been condensed. The caller reads it;
   * this module has no filesystem.
   */
  existing?: string;
  /** Language the artifact is written in — the document language, not the UI one. */
  docLanguage?: DocLanguage;
  /** "Now": the selector's 90-day window and `condensed_at`. Tests pass a fixed date. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** A section whose citations did not survive the subset check, project level. */
export type CondenseProjectAttributionProblem = AttributionProblem<CondensedProjectSectionKind>;

export interface CondenseProjectProposal {
  kind: 'proposal';
  scope: Scope;
  slug: string;
  /** `projects/<scope>/<slug>/condensed.md` — where `./write` puts `content`. */
  path: string;
  /** The whole file, frontmatter included, ready to be written unchanged. */
  content: string;
  /** ISO-8601 with offset; the same value stands in `content`'s frontmatter. */
  condensedAt: string;
  /**
   * sha256 of the artifact as it was read, or `null` when none existed. `./write`
   * passes it as `expectedHash` so a file that moved on in between gets a
   * `conflict` instead of an overwrite; `null` means "must not exist yet".
   */
  baseHash: string | null;
  /**
   * Every input the run read: the vault documents `projectInputs()` yields,
   * then one `agent:` ref per distinct agent project (D12). The same list as
   * the artifact's `sources:`.
   */
  sources: readonly string[];
  /**
   * The `source_hashes:` map that stands in `content` — **vault documents
   * only** (D18). An agent session lives outside the vault and has no vault
   * hash, so it is cited but never hashed. Carried here as well so a caller
   * does not have to re-parse the artifact to know what was recorded.
   */
  sourceHashes: Record<string, string>;
  /** What the selector left out, or `null`. Already stated in `content`. */
  truncated: CondenseProjectTruncationReport | null;
}

export interface CondenseProjectNoModel {
  kind: 'no-model';
  scope: Scope;
  slug: string;
  /** Always `condense-project`: which routing entry is missing (AC 10). */
  task: TaskKind;
}

export interface CondenseProjectNoInputs {
  kind: 'no-inputs';
  scope: Scope;
  slug: string;
}

export interface CondenseProjectAttributionFailure {
  kind: 'attribution-failure';
  scope: Scope;
  slug: string;
  problems: readonly CondenseProjectAttributionProblem[];
}

export interface CondenseProjectFailed {
  kind: 'failed';
  scope: Scope;
  slug: string;
  /** Why the run could not complete. Never carries vault content (Guardrail 6). */
  reason: string;
}

export type CondenseProjectResult =
  | CondenseProjectProposal
  | CondenseProjectNoModel
  | CondenseProjectNoInputs
  | CondenseProjectAttributionFailure
  | CondenseProjectFailed;

/** The selection as the prompt wants it: `{ path, text }` per input. */
interface MappedInputs {
  state: CondenseProjectSourceItem;
  notes: CondenseProjectSourceItem[];
  todos: CondenseProjectSourceItem[];
  waitingOn: CondenseProjectSourceItem[];
  days: CondenseProjectSourceItem[];
  sessions: CondenseProjectSourceItem[];
  /**
   * Every distinct source token the prompt shows, in reading order — vault
   * paths and `agent:` refs alike. This is the set a section may cite, and
   * nothing else (Guardrail 3).
   */
  paths: string[];
  /** Whether any input carries text at all; `false` means nothing to condense. */
  material: boolean;
}

/** `[state] text (due …, done …)` — the dates matter, per D17. */
function todoLine(todo: Todo): string {
  const dates = [
    todo.due === null ? '' : `due ${todo.due}`,
    todo.neededBy === null ? '' : `needed by ${todo.neededBy}`,
    todo.waitingFor === null ? '' : `waiting for ${todo.waitingFor}`,
    todo.doneAt === null ? '' : `done ${todo.doneAt}`,
  ].filter((part) => part.length > 0);
  const suffix = dates.length === 0 ? '' : ` (${dates.join(', ')})`;
  return `[${todo.state}] ${todo.text}${suffix}`;
}

/** One `waiting_on` entry, resolved ones included and marked as such (D17). */
function waitingLine(entry: WaitingOn): string {
  const parts = [`since ${entry.since}`];
  if (entry.due !== undefined) parts.push(`due ${entry.due}`);
  parts.push(entry.resolved === true ? 'resolved' : 'open');
  return `${entry.who}: ${entry.what} (${parts.join(', ')})`;
}

/** One session: when it last ran, on what branch, its own summary, its tail. */
function sessionText(session: CondenseProjectSession): string {
  const head = session.branch === null ? session.at : `${session.at} (${session.branch})`;
  return [head, session.text, session.tail].filter((part) => part.trim().length > 0).join('\n');
}

/**
 * D6's selection into D7's prompt input. The two shapes differ on purpose: the
 * selector returns domain objects (`Todo`, `WaitingOn`, `ClaudeSession`), the
 * prompt wants `{ path, text }` — and the path is what the model may later cite.
 *
 * The state section and the `waiting_on` entries both come out of `project.md`,
 * which is why they share one path. A session's "path" is its `agent:` ref, the
 * only citable form it has (D12). `hasProjectDoc` says whether `project.md` was
 * actually among the indexed documents: if it was not, nothing was read from it,
 * so it is neither shown as an input nor citable.
 */
function mapInputs(
  selection: CondenseProjectInputSelection,
  projectPath: string,
  hasProjectDoc: boolean,
): MappedInputs {
  const paths: string[] = [];
  const remember = (path: string): string => {
    if (!paths.includes(path)) paths.push(path);
    return path;
  };

  const state: CondenseProjectSourceItem = {
    path: hasProjectDoc ? remember(projectPath) : projectPath,
    text: hasProjectDoc ? selection.state : '',
  };
  const notes = selection.notes.map((note) => ({ path: remember(note.path), text: note.text }));
  const todos = selection.todos.map((todo) => ({
    path: remember(todo.path),
    text: todoLine(todo),
  }));
  const waitingOn = hasProjectDoc
    ? selection.waitingOn.map((entry) => ({
        path: remember(projectPath),
        text: waitingLine(entry),
      }))
    : [];
  const days = selection.days.map((day) => ({
    path: remember(day.path),
    text: `${day.date}\n${day.text}`,
  }));
  const sessions = selection.sessions.map((session) => ({
    path: remember(session.ref),
    text: sessionText(session),
  }));

  /* A project folder that exists but says nothing is not something to condense:
     four sections written from a title alone would be exactly the invention
     Guardrail 3 forbids. So the emptiness test is "does any input carry text",
     not "does any input exist" — the same rule the area run applies by only
     ever remembering a path for an item that had text. */
  const material = [state, ...notes, ...todos, ...waitingOn, ...days, ...sessions].some(
    (item) => item.text.trim().length > 0,
  );

  return { state, notes, todos, waitingOn, days, sessions, paths, material };
}

/** The artifact's title: the project's own, else the previous one, else the slug. */
function titleOf(selection: CondenseProjectInputSelection, current: string): string {
  if (selection.title.length > 0) return selection.title;
  return current.length > 0 ? current : selection.slug;
}

/**
 * Condenses one project into a proposed `projects/<scope>/<slug>/condensed.md`,
 * or says why it cannot. Writes nothing, ever.
 */
export async function condenseProject(deps: CondenseProjectDeps): Promise<CondenseProjectResult> {
  const { scope, slug } = deps.project;

  // The guard comes before every read: without a model the run does not start
  // at all, and says which routing entry is missing (AC 10, Guardrail 1).
  if (!deps.gateway.isAvailable(CONDENSE_PROJECT_TASK)) {
    return { kind: 'no-model', scope, slug, task: CONDENSE_PROJECT_TASK };
  }

  const docLanguage = deps.docLanguage ?? 'de';
  const now = deps.now ?? new Date();
  const selection = await selectProjectCondenseInputs(deps, { now });
  const hasProjectDoc = deps.docs.some((doc) => doc.path === deps.project.path);
  const inputs = mapInputs(selection, deps.project.path, hasProjectDoc);

  if (!inputs.material) return { kind: 'no-inputs', scope, slug };

  const current: CondensedProjectArtifact =
    deps.existing === undefined
      ? emptyArtifact(PROJECT_SECTIONS)
      : parseArtifact(deps.existing, PROJECT_SECTIONS);
  const title = titleOf(selection, current.title);

  let reply: Record<string, unknown>;
  try {
    const result = await deps.gateway.complete({
      task: CONDENSE_PROJECT_TASK,
      messages: condenseProjectPrompt(
        {
          title,
          scope,
          slug,
          current,
          state: inputs.state,
          notes: inputs.notes,
          todos: inputs.todos,
          waitingOn: inputs.waitingOn,
          days: inputs.days,
          sessions: inputs.sessions,
          truncated: selection.truncated !== null,
        },
        docLanguage,
      ),
      schema: CONDENSE_PROJECT_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    reply = parseJsonLoose<Record<string, unknown>>(result.text);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { kind: 'failed', scope, slug, reason: reasonOf(error) };
  }

  const read = readReplySections(reply, PROJECT_SECTIONS);
  if ('missing' in read) {
    return {
      kind: 'failed',
      scope,
      slug,
      reason: `The reply has no usable "${read.missing}" section.`,
    };
  }

  const problems = attributionProblems(read.sections, PROJECT_SECTIONS, inputs.paths);
  if (problems.length > 0) return { kind: 'attribution-failure', scope, slug, problems };

  const condensedAt = isoStamp(now);
  /* The prompt itself caps what it shows per item (`CONDENSE_PROJECT_ITEM_CHARS`)
     so a long, verbatim-read note still fits the model's input budget — a bound
     independent of the selector's own (D6). Both feed the same notice, so the
     artifact never claims to have shown the model more than it actually saw. */
  const promptClamped = promptItemsClampedChars([
    inputs.state,
    ...inputs.notes,
    ...inputs.todos,
    ...inputs.waitingOn,
    ...inputs.days,
    ...inputs.sessions,
  ]);
  const notice =
    selection.truncated === null && promptClamped === 0
      ? ''
      : projectTruncationNotice(selection.truncated, docLanguage, promptClamped);
  const kept = preambleWithoutNotice(current.preamble);
  /* Two lists, and the split is D18: `projectInputs()` is the **document**
     inventory — the same one 046's staleness check asks — so its paths get a
     hash, while an agent session has no vault hash and appears in `sources:`
     only. Recording the prompt's own view instead would leave `project.md`
     unhashed whenever it held nothing citable, and the check would then call
     the artifact due forever. Same selector on both sides. */
  const inventory = projectInputs(deps, { now });
  const sourceHashes = sourceHashesOf(inventory);
  const recorded = [...inventory.map((input) => input.path), ...selection.agentRefs];
  const artifact: CondensedProjectArtifact = {
    ...current,
    title,
    condensedAt,
    sources: recorded,
    sourceHashes,
    sections: read.sections,
    preamble: [notice, kept].filter((part) => part.length > 0).join('\n\n'),
  };

  return {
    kind: 'proposal',
    scope,
    slug,
    path: condensedProjectPath(scope, slug),
    content: composeArtifact(artifact, PROJECT_SECTIONS, docLanguage),
    condensedAt,
    baseHash: deps.existing === undefined ? null : sha256(deps.existing),
    sources: recorded,
    sourceHashes,
    truncated: selection.truncated,
  };
}

/** An error's message, without ever quoting vault content back (Guardrail 6). */
function reasonOf(error: unknown): string {
  return error instanceof Error && error.message.length > 0 ? error.message : 'Unknown error.';
}
