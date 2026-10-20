/* Which artifact a condense request addresses, and which run produces it
 * (story 045, D2). The five `condense:*` handlers next door take a
 * `unit: 'area' | 'project'` discriminator (binding Q2 decision of 045) and are
 * otherwise level-agnostic; everything that differs per level lives here, so
 * `condense.ts` keeps one code path for the pre-check, the snapshot, the
 * hash-guarded write and the trash move.
 *
 * Three decisions that aren't otherwise visible in the code:
 *
 * - **A project's path is resolved, not templated.** An area's artifact is
 *   `condensedAreaPath(slug)` — a pure function of the slug. A project's is
 *   `projects/<scope>/<slug>/condensed.md`, and the scope is not in the request:
 *   it comes from the project index (`findProject()`, the very lookup
 *   `projects:get` uses). A slug that resolves to nothing is `invalid` — never a
 *   guessed path, because the path decides which file gets snapshotted,
 *   overwritten or moved into the trash, and a hash guard cannot notice that it
 *   is guarding the *wrong* file.
 * - **The resolved path must sit in the project's own folder.** `Project.slug`
 *   and `Project.scope` come from frontmatter where the file provides them
 *   (`deriveProjects()`), so they can disagree with the folder the file actually
 *   lies in — `projects/work/alt-name/project.md` carrying `slug: neu` would
 *   send `condensedProjectPath()` into `projects/work/neu/`, a folder belonging
 *   to another project or to nobody. Such a project is refused rather than
 *   condensed into a foreign folder; refusing costs a vault nothing that a
 *   consistent `slug:` doesn't fix.
 * - **The run's own result is normalised here** (`CondenseRunOutcome`).
 *   `condenseArea()` and `condenseProject()` return two distinct unions of the
 *   same five shapes, differing in the fields `condense:run` never reports
 *   (`scope`, the section kind of an attribution problem, the truncation
 *   report's per-group counts). Normalising at this seam keeps the handler from
 *   branching on the level a second time.
 */

import {
  CONDENSE_AREA_TASK,
  CONDENSE_PROJECT_TASK,
  condenseArea,
  condensedAreaPath,
  condensedProjectPath,
  condenseProject,
  parseArtifact,
  parseCondensedArtifact,
  PROJECT_SECTIONS,
} from '@core/condense';
import type { AttributionProblem, CondenseAreaResult, CondenseProjectResult } from '@core/condense';
import type { IndexedDoc } from '@core/index/types';
import type { LlmGateway } from '@core/llm';
import { dirName } from '@core/vault/paths';
import type { CondenseUnit, DocLanguage, Project, TaskKind, Todo } from '@shared/types';
import { fail } from './errors';
import { claudeSessions, claudeTranscriptTail, overviewIndex } from './overview-deps';
import { findProject } from './projects';
import type { Services } from '../services';

/**
 * The one artifact a request addresses, plus what a run of it needs. `project`
 * is the resolved project for `unit: 'project'` and `null` for an area — it is
 * also the discriminator the run branches on, so a project run can never be
 * started without the project it was resolved from.
 */
export interface CondenseTarget {
  unit: CondenseUnit;
  /** The slug as requested — what the renderer can address the unit by again. */
  slug: string;
  /** The artifact path, derived here and never taken from the renderer. */
  path: string;
  /** Which routing entry a run of this level needs; named in `no-model`. */
  task: TaskKind;
  project: Project | null;
}

/** What a run needs from the shell, level-independent. Assembled by `condense.ts`. */
export interface CondenseRunContext {
  docs: readonly IndexedDoc[];
  gateway: LlmGateway;
  docLanguage: DocLanguage;
  /** The artifact as it was just read, or `null` when there is none yet. */
  existing: string | null;
}

/** A run's result, reduced to what `condense:run` reports over IPC. */
export type CondenseRunOutcome =
  | {
      kind: 'proposal';
      /** The run's own view of where its content belongs — checked against the target. */
      path: string;
      content: string;
      baseHash: string | null;
      sources: readonly string[];
      /** Inputs not read in full, or `null` when everything was. */
      truncatedCount: number | null;
    }
  | { kind: 'no-model'; task: TaskKind }
  | { kind: 'no-inputs' }
  | { kind: 'attribution-failure'; problems: readonly AttributionProblem[] }
  | { kind: 'failed'; reason: string };

/**
 * The artifact path for `unit` + `slug`, plus everything the level-specific run
 * needs. Throws `invalid` for a project slug the vault does not resolve.
 */
export async function resolveCondenseUnit(
  services: Services,
  unit: CondenseUnit,
  slug: string,
): Promise<CondenseTarget> {
  if (unit === 'area') {
    return {
      unit,
      slug,
      path: condensedAreaPath(slug),
      task: CONDENSE_AREA_TASK,
      project: null,
    };
  }
  if (unit === 'project') return projectTarget(services, slug);
  /* The channel contract types `unit`, but the value crosses from the renderer
     unchecked. An unknown level must not fall through to the area path: for
     `condense:delete` that would delete an area's artifact on a request that
     never named one. */
  throw fail('invalid', `unbekannte Verdichtungsebene: ${String(unit)}`);
}

/** `projects/<scope>/<slug>/condensed.md` for a project the index knows. */
async function projectTarget(services: Services, slug: string): Promise<CondenseTarget> {
  if (typeof slug !== 'string' || slug.trim().length === 0) {
    throw fail('invalid', 'slug: darf nicht leer sein');
  }
  const project = await findProject(services, slug);
  if (project === null) throw fail('invalid', `dieses Projekt gibt es nicht: „${slug}“`);

  const path = condensedProjectPath(project.scope, project.slug);
  /* The artifact belongs next to `project.md`, in this project's own folder. If
     the derived path points anywhere else, the project's `slug`/`scope` and its
     location disagree (see the module comment) — and then no write, snapshot or
     delete may proceed on a path nobody can vouch for. */
  if (dirName(path) !== dirName(project.path)) {
    throw fail(
      'invalid',
      `„${slug}“ liegt in ${dirName(project.path)}, meldet aber ${dirName(path)} — ` +
        'slug oder scope im Frontmatter passen nicht zum Ordner',
    );
  }
  return { unit: 'project', slug, path, task: CONDENSE_PROJECT_TASK, project };
}

/**
 * `condensed_at` and `sources:` of an existing artifact — the only two fields
 * `condense:read` reports. Both live in the frontmatter, so the section set the
 * parser is handed changes neither of them; it is passed correctly per level
 * anyway, so nothing here claims a project artifact has an area's sections.
 */
export function artifactHeader(
  unit: CondenseUnit,
  content: string,
): { condensedAt: string; sources: string[] } {
  const artifact =
    unit === 'project' ? parseArtifact(content, PROJECT_SECTIONS) : parseCondensedArtifact(content);
  return { condensedAt: artifact.condensedAt, sources: [...artifact.sources] };
}

/**
 * Runs the level `target` names and normalises its result. Writes nothing —
 * both runs only ever propose (Guardrail 2).
 */
export async function runCondenseUnit(
  services: Services,
  target: CondenseTarget,
  context: CondenseRunContext,
): Promise<CondenseRunOutcome> {
  const outcome = await runLevel(services, target, context);
  /* Both runs derive the proposal's path themselves, from the same two helpers
     `resolveCondenseUnit()` uses. If the two ever disagree, the diff the user
     confirms would describe a different file than the accept writes — so this
     stops instead of picking one of the two paths. */
  if (outcome.kind === 'proposal' && outcome.path !== target.path) {
    throw fail('unknown', 'der Lauf verortet die Verdichtung anders als der Kanal');
  }
  return outcome;
}

async function runLevel(
  services: Services,
  target: CondenseTarget,
  context: CondenseRunContext,
): Promise<CondenseRunOutcome> {
  const existing = context.existing === null ? {} : { existing: context.existing };
  if (target.project === null) {
    return outcomeOf(
      await condenseArea(
        {
          docs: context.docs,
          gateway: context.gateway,
          docLanguage: context.docLanguage,
          ...existing,
        },
        target.slug,
      ),
    );
  }

  /* The gateway is asked before the sessions are read, not only inside
     `condenseProject()`: reading `~/.claude` is the one input that lives outside
     the vault, and a run that cannot happen for want of a model must not touch
     it (story 044, AC 10). The core keeps its own identical guard — this one
     only decides whether an input is fetched at all. */
  if (!context.gateway.isAvailable(CONDENSE_PROJECT_TASK)) {
    return { kind: 'no-model', task: CONDENSE_PROJECT_TASK };
  }
  return outcomeOf(
    await condenseProject({
      project: target.project,
      docs: context.docs,
      todos: projectTodos(services),
      sessions: await claudeSessions(services),
      readTranscriptTail: (session) => claudeTranscriptTail(services, session),
      gateway: context.gateway,
      docLanguage: context.docLanguage,
      ...existing,
    }),
  );
}

/**
 * The index's todos, which the project selector filters down to the project's
 * own folder. `condense.ts` reads the raw document list through its own narrow
 * index view; the todo list needs the wider one — the same
 * `overviewIndex()` view `projects:suggestStatus` asks for, and it refuses
 * honestly when the index derives no todos.
 */
function projectTodos(services: Services): readonly Todo[] {
  return overviewIndex(services).todos();
}

function outcomeOf(result: CondenseAreaResult | CondenseProjectResult): CondenseRunOutcome {
  if (result.kind === 'proposal') {
    return {
      kind: 'proposal',
      path: result.path,
      content: result.content,
      baseHash: result.baseHash,
      sources: result.sources,
      truncatedCount: result.truncated === null ? null : result.truncated.count,
    };
  }
  if (result.kind === 'no-model') return { kind: 'no-model', task: result.task };
  if (result.kind === 'no-inputs') return { kind: 'no-inputs' };
  if (result.kind === 'attribution-failure') {
    return { kind: 'attribution-failure', problems: result.problems };
  }
  return { kind: 'failed', reason: result.reason };
}
