/**
 * Re-check a filing action that came back from the renderer before anything is
 * written.
 *
 * The renderer only ever *selects* a target the core built (`buildProposal`,
 * `filingAction` via `withAllTargets`) — but what arrives over IPC is just data,
 * and a `path` in it is a write address. So every action is checked against the
 * same `FilingContext` the builder resolves against, with the rules of `pathFor`
 * in `actions.ts`: an existing project or area by its indexed path, a module by
 * `modulePath(slug)`, the journal entry of the day, `inbox` as the dump itself,
 * a new project by the `projects/<scope>/<slug>/project.md` shape.
 *
 * A target that does not resolve is **refused**, not re-routed to the inbox:
 * filing a confirmed proposal somewhere the user did not confirm would be a
 * silent move (guardrail 2).
 *
 * `content` is deliberately left alone — editing the text is a legitimate user
 * action, and text cannot address a location.
 */

import { SCOPES } from '@shared/types';
import type { DocLanguage, FilingAction, FilingTarget, Scope } from '@shared/types';
import { isoDay, journalPath, modulePath, projectPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import type { FilingContext } from './context';
import { sectionFor } from './sections';

export interface VerifyActionOptions {
  /** The dump being filed — the only file `inbox` may name. */
  dumpPath: string;
  /**
   * When the proposal was built. Its day's journal entry stays a legitimate
   * target: a proposal built at 23:58 and confirmed at 00:02 names yesterday.
   */
  createdAt: DateLike;
  docLanguage?: DocLanguage;
}

const TARGETS: readonly FilingTarget[] = [
  'project',
  'area',
  'module',
  'journal',
  'new-project',
  'inbox',
];

/** `projects/<scope>/<slug>/project.md` — split into the parts `projectPath` takes. */
const NEW_PROJECT_SHAPE = /^projects\/([^/]+)\/([^/]+)\/project\.md$/;

/** A path builder that refuses its input (unsafe name) simply builds nothing. */
function built(build: () => string): string | null {
  try {
    return build();
  } catch {
    return null;
  }
}

/** The journal days a proposal may still name: today and the day it was built. */
function journalPaths(context: FilingContext, createdAt: DateLike): string[] {
  const paths = [journalPath(context.today)];
  const valid = !Number.isNaN(new Date(createdAt).getTime());
  if (valid) paths.push(journalPath(isoDay(createdAt)));
  return paths;
}

/**
 * A new project's path is accepted only in the exact shape `projectPath` builds:
 * a known scope and a slug that is already its own slug. Rebuilding and
 * comparing rules out `..`, extra segments and anything `slugify` would change.
 */
function isNewProjectPath(path: string): boolean {
  const match = NEW_PROJECT_SHAPE.exec(path);
  const scope = match?.[1];
  const slug = match?.[2];
  if (scope === undefined || slug === undefined) return false;
  if (!SCOPES.includes(scope as Scope)) return false;
  return built(() => projectPath(scope as Scope, slug)) === path;
}

/** Does this target, at this path, resolve the way `pathFor` would resolve it? */
function resolves(
  target: FilingTarget,
  path: string,
  context: FilingContext,
  options: VerifyActionOptions,
): boolean {
  switch (target) {
    case 'project':
      return context.projects.some((project) => project.path === path);
    case 'area':
      return context.areas.some((area) => area.path === path);
    case 'module':
      return context.modules.some((module) => built(() => modulePath(module.slug)) === path);
    case 'journal':
      return journalPaths(context, options.createdAt).includes(path);
    case 'new-project':
      return isNewProjectPath(path);
    case 'inbox':
      return path === options.dumpPath;
  }
}

/**
 * The action with its section normalized to one its target allows, or the reason
 * it is refused. The reason never echoes the path or the text — both can carry
 * journal or project content.
 */
export function verifyFilingAction(
  action: FilingAction,
  context: FilingContext,
  options: VerifyActionOptions,
): FilingAction | string {
  if (action === null || typeof action !== 'object') return 'das Ziel fehlt';
  if (!TARGETS.includes(action.target)) return 'unbekannte Zielart';
  if (typeof action.path !== 'string' || action.path.length === 0)
    return 'das Ziel nennt keinen Pfad';
  if (action.section !== null && typeof action.section !== 'string') {
    return 'der Abschnitt ist kein Text';
  }
  if (!resolves(action.target, action.path, context, options)) {
    return 'das Ziel ist im Vault nicht (mehr) bekannt';
  }
  return {
    ...action,
    section: sectionFor(action.target, action.section, options.docLanguage ?? 'de'),
  };
}
