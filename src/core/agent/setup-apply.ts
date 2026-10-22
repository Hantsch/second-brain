/* Applies the confirmed part of a setup plan. The status is recomputed first, so a
 * confirmation can never widen what may be written: only a managed path whose fresh
 * status is missing, outdated or modified is touched, and only while its content is
 * still the one the plan was made from. The manifest is written last, so it only ever
 * records files that actually landed. */

import type {
  AgentSetupApplyRequest,
  AgentSetupApplyResult,
  AgentSetupFileStatus,
} from '../../shared/types/agent-setup';
import { VaultConflictError } from '../vault/types';
import { renderSetupFile } from './setup-marker';
import { readSetupManifest, recordSetupFiles, type SetupManifestEntry } from './setup-manifest';
import { inspectSetup } from './setup-status';
import { SETUP_TEMPLATES } from './setup-templates';
import type { SetupStore, SetupTemplate } from './setup-types';

type Outcome = AgentSetupApplyResult['results'][number]['outcome'];

const WRITABLE: ReadonlySet<AgentSetupFileStatus> = new Set(['missing', 'outdated', 'modified']);

export async function applySetup(
  store: SetupStore,
  request: AgentSetupApplyRequest,
  templates: readonly SetupTemplate[] = SETUP_TEMPLATES,
): Promise<AgentSetupApplyResult> {
  const { templates: inspected, manifest, state } = await inspectSetup(store, templates);
  const byPath = new Map(inspected.map((entry) => [entry.template.path, entry]));
  const handled = new Set<string>();
  const results: AgentSetupApplyResult['results'] = [];
  const written: SetupManifestEntry[] = [];

  for (const { path, expectedHash } of request.confirmed) {
    const target = byPath.get(path);
    let outcome: Outcome;
    if (target === undefined || handled.has(path) || !WRITABLE.has(target.status)) {
      outcome = 'refused';
    } else if (expectedHash !== target.hash) {
      // Changed since the plan was shown: the user confirmed a different file.
      outcome = 'conflict';
    } else {
      const { template } = target;
      try {
        if (target.exists) await store.snapshot(path);
        const result = await store.writeText(path, renderSetupFile(template), { expectedHash });
        written.push({ path, template: template.id, version: template.version, hash: result.hash });
        outcome = 'written';
      } catch (error) {
        if (!(error instanceof VaultConflictError)) throw error;
        outcome = 'conflict';
      }
    }
    handled.add(path);
    results.push({ path, outcome });
  }

  for (const dir of state.plan.dirs) await store.mkdir(dir);

  if (written.length > 0) {
    try {
      await recordSetupFiles(store, manifest, written);
    } catch (error) {
      if (!(error instanceof VaultConflictError)) throw error;
      // Someone else updated the manifest meanwhile: merge onto their version instead.
      await recordSetupFiles(store, await readSetupManifest(store), written);
    }
  }
  return { results };
}
