/* Applies the confirmed part of a setup plan. The status is recomputed first, so a
 * confirmation can never widen what may be written: only a managed path whose fresh
 * status is missing, outdated or modified is touched, and only while its content is
 * still the one the plan was made from. A help-module collision refuses every path: an
 * Install or Update over a user's module writes nothing at all.
 *
 * Apply never throws for a single step. A file, folder, manifest or chronicle that cannot
 * be written becomes a `failed` row with its errno code and the remaining steps still
 * run, so the caller always learns what landed. The manifest is written after the files
 * and lists only the files whose write returned, so it never records one that is not
 * on disk; a failed file stays due and the next apply writes it. */

import {
  AGENT_SETUP_MANIFEST,
  type AgentSetupApplyRequest,
  type AgentSetupApplyResult,
  type AgentSetupFileStatus,
} from '../../shared/types/agent-setup';
import { HELP_MODULE_SLUG } from '../../shared/help-module';
import { wikiLogPath } from '../vault/paths';
import { VaultConflictError } from '../vault/types';
import { logHelpWrite } from './help/setup';
import { renderSetupFile } from './setup-marker';
import { readSetupManifest, recordSetupFiles, type SetupManifestEntry } from './setup-manifest';
import { inspectSetup } from './setup-status';
import { MANAGED_TEMPLATES } from './managed-templates';
import type { SetupStore, SetupTemplate } from './setup-types';

type Results = AgentSetupApplyResult['results'];
type Result = Results[number];

const WRITABLE: ReadonlySet<AgentSetupFileStatus> = new Set(['missing', 'outdated', 'modified']);

/** Only the errno code leaves this module: an error message carries absolute paths. */
function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : 'unknown';
}

function notWritten(path: string, error: unknown): Result {
  if (error instanceof VaultConflictError) return { path, outcome: 'conflict' };
  return { path, outcome: 'failed', reason: errnoOf(error) };
}

/** Runs one step after the files; an error becomes a row for `path` instead of a throw. */
async function step(results: Results, path: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    results.push(notWritten(path, error));
  }
}

export async function applySetup(
  store: SetupStore,
  request: AgentSetupApplyRequest,
  templates: readonly SetupTemplate[] = MANAGED_TEMPLATES,
): Promise<AgentSetupApplyResult> {
  const { templates: inspected, manifest, state } = await inspectSetup(store, templates);
  if (state.plan.collision !== undefined) {
    return { results: request.confirmed.map(({ path }) => ({ path, outcome: 'refused' })) };
  }
  const byPath = new Map(inspected.map((entry) => [entry.template.path, entry]));
  const handled = new Set<string>();
  const results: Results = [];
  const written: SetupManifestEntry[] = [];

  for (const { path, expectedHash } of request.confirmed) {
    const target = byPath.get(path);
    if (target === undefined || handled.has(path) || !WRITABLE.has(target.status)) {
      results.push({ path, outcome: 'refused' });
    } else if (expectedHash !== target.hash) {
      // Changed since the plan was shown: the user confirmed a different file.
      results.push({ path, outcome: 'conflict' });
    } else {
      const { template } = target;
      try {
        // The undo copy shares the write's try: without a copy the file is not overwritten.
        if (target.exists) await store.snapshot(path);
        const result = await store.writeText(path, renderSetupFile(template), { expectedHash });
        written.push({ path, template: template.id, version: template.version, hash: result.hash });
        results.push({ path, outcome: 'written' });
      } catch (error) {
        results.push(notWritten(path, error));
      }
    }
    handled.add(path);
  }

  for (const dir of state.plan.dirs) await step(results, dir, () => store.mkdir(dir));

  if (written.length > 0) {
    await step(results, AGENT_SETUP_MANIFEST, async () => {
      try {
        await recordSetupFiles(store, manifest, written);
      } catch (error) {
        if (!(error instanceof VaultConflictError)) throw error;
        // Someone else updated the manifest meanwhile: merge onto their version instead.
        await recordSetupFiles(store, await readSetupManifest(store), written);
      }
    });
  }
  // After the manifest, so a failing chronicle never leaves written files unrecorded.
  await step(results, wikiLogPath(HELP_MODULE_SLUG), () => logHelpWrite(store, written));
  return { results };
}
