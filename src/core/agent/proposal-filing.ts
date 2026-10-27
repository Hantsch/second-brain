/* A `filing` proposal is a dump the agent wants filed somewhere. It goes through the same
   checks as a filing the user confirms in the capture dialog, so the agent can name a
   target but never address a file the capture flow would refuse. */

import {
  buildFilingContext,
  filingAction,
  verifyFilingAction,
  type CaptureIndex,
  type FilingContext,
} from '@core/capture';
import { IndexService } from '@core/index/service';
import { baseName, isInside, isSafeVaultPath, modulePath, toVaultPath } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import { SCOPES } from '@shared/types';
import type { DocLanguage, FilingProposal, FilingTarget } from '@shared/types';

/** Resolves the index once per call chain; building one walks the whole vault. */
export type IndexSource = () => Promise<CaptureIndex>;

export interface FilingOptions {
  /** The index to resolve targets against; built in memory from the store when absent. */
  index?: CaptureIndex;
  docLanguage?: DocLanguage;
  /** The clock for the filing's date header; tests pass a fixed time. */
  now?: DateLike;
}

export function indexSourceFor(store: VaultStore, given?: CaptureIndex): IndexSource {
  let pending: Promise<CaptureIndex> | null = null;
  return () => {
    pending ??= given ? Promise.resolve(given) : IndexService.open(store, { persistence: null });
    return pending;
  };
}

export interface FilingFields {
  dumpPath: string;
  fileInto: string;
  section: string | null;
  content: string;
  reason: string;
}

/** A filing proposal ready for `applyProposal`, or the code of the rule it breaks. */
export type FilingCheck = { proposal: FilingProposal } | { reason: string };

/** Only existing project, area and module files can receive a filed dump. */
function targetOf(path: string, context: FilingContext): FilingTarget | null {
  if (context.projects.some((project) => project.path === path)) return 'project';
  if (context.areas.some((area) => area.path === path)) return 'area';
  const isModule = context.modules.some((module) => {
    try {
      return modulePath(module.slug) === path;
    } catch {
      return false;
    }
  });
  return isModule ? 'module' : null;
}

export async function buildFilingProposal(
  fields: FilingFields,
  source: IndexSource,
  at: DateLike,
  docLanguage: DocLanguage = 'de',
): Promise<FilingCheck> {
  if (!isSafeVaultPath(fields.fileInto)) return { reason: 'unsafe-path' };
  const path = toVaultPath(fields.fileInto);
  if (isInside('journal', path.toLowerCase())) return { reason: 'journal' };
  if (fields.content.trim().length === 0) return { reason: 'empty-content' };

  const context = buildFilingContext(await source(), {
    now: at,
    maxProjects: Infinity,
    maxModules: Infinity,
  });
  const target = targetOf(path, context);
  if (target === null) return { reason: 'unknown-target' };

  const createdAt = new Date(at).toISOString();
  const verified = verifyFilingAction(
    filingAction(target, path, fields.section, fields.content, at),
    context,
    { dumpPath: fields.dumpPath, createdAt, docLanguage },
  );
  if (typeof verified === 'string') return { reason: 'rejected' };

  return {
    proposal: {
      dumpPath: fields.dumpPath,
      title: baseName(fields.dumpPath),
      // Read only when a project is created, which a proposal never does.
      scope: SCOPES[0] ?? 'work',
      tags: [],
      primary: verified,
      extras: [],
      alternatives: [],
      confidence: 1,
      reason: fields.reason,
      todos: [],
      waitingOn: [],
      entities: [],
      heuristic: false,
      createdAt,
    },
  };
}
