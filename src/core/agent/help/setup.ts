/* The help module as part of the managed agent setup. Its files are ordinary setup
 * templates — the same status, plan, writer and manifest as the files under `.claude/` —
 * so this file only adds what is specific to living in a module folder the user may
 * also write to: the slug collision, the one-row status and the module's chronicle. */

import {
  HELP_MODULE_SLUG,
  type HelpModuleState,
  type HelpModuleStatus,
} from '../../../shared/help-module';
import type { AgentSetupCollision } from '../../../shared/types/agent-setup';
import { appendLog } from '../../wiki/log-md';
import type { SetupManifestRead } from '../setup-manifest';
import type { InspectedTemplate } from '../setup-status';
import type { SetupStore, SetupTemplate } from '../setup-types';
import { helpTemplateId, renderHelpModule } from './render';
import { HELP_MODULE_VERSION } from './version';

const HELP_ROOT = `modules/${HELP_MODULE_SLUG}`;
export const HELP_MODULE_FILE = `${HELP_ROOT}/module.md`;

/** Every help file as a setup template; the rendered content already carries its marker. */
export const HELP_TEMPLATES: readonly SetupTemplate[] = renderHelpModule().map(
  ({ path, content }) => ({
    id: helpTemplateId(path),
    path,
    version: HELP_MODULE_VERSION,
    format: 'rendered',
    body: content,
  }),
);

export function isHelpPath(path: string): boolean {
  return path.startsWith(`${HELP_ROOT}/`);
}

async function folderExists(store: SetupStore): Promise<boolean> {
  if (await store.exists(HELP_ROOT)) return true;
  for await (const entry of store.walk({ dir: HELP_ROOT })) {
    if (entry.path.length > 0) return true;
  }
  return false;
}

/**
 * The folder of the help slug is taken by a module that is not Gaston's: it exists, and
 * its module.md is unmarked, or absent while nothing in the folder still carries
 * Gaston's marker. Writing into such a folder would mix Gaston's pages into the user's
 * module, so the whole setup writes nothing until the user renames theirs.
 *
 * Ownership is read from the markers on disk, not the manifest: a manifest entry only
 * says Gaston once wrote that path, and the user may since have deleted the folder and
 * created a module of their own under the same slug.
 */
export async function helpCollision(
  store: SetupStore,
  inspected: readonly InspectedTemplate[],
  manifest: SetupManifestRead,
): Promise<AgentSetupCollision | null> {
  const module = inspected.find((entry) => entry.template.path === HELP_MODULE_FILE);
  if (module === undefined) return null;
  const collision = { module: HELP_MODULE_SLUG, path: HELP_MODULE_FILE };
  if (module.exists) return module.marked ? null : collision;
  if (!(await folderExists(store))) return null;
  // Gaston's own module.md was deleted from a folder whose other help files are still
  // marked as Gaston's: reinstalling it restores Gaston's module.
  const recorded = manifest.files.some((entry) => entry.path === HELP_MODULE_FILE);
  const stillGastons = inspected.some((entry) => isHelpPath(entry.template.path) && entry.marked);
  return recorded && stillGastons ? null : collision;
}

const OUTDATED = new Set(['missing', 'outdated', 'modified']);

/**
 * The help module as one row. A collision outranks a missing module.md: a taken folder
 * cannot be installed into, so reporting it as merely missing would offer an Install
 * that writes nothing. A modified page counts as outdated and still needs confirmation.
 */
export function helpModuleState(
  inspected: readonly InspectedTemplate[],
  collision: AgentSetupCollision | null,
): HelpModuleState {
  const help = inspected.filter((entry) => isHelpPath(entry.template.path));
  const module = help.find((entry) => entry.template.path === HELP_MODULE_FILE);
  let status: HelpModuleStatus = 'current';
  if (collision !== null) status = 'collision';
  else if (module === undefined || !module.exists) status = 'missing';
  else if (help.some((entry) => OUTDATED.has(entry.status))) status = 'outdated';
  return {
    status,
    installedVersion: collision === null ? (module?.installedVersion ?? null) : null,
    shippedVersion: module?.template.version ?? HELP_MODULE_VERSION,
  };
}

/**
 * One chronicle entry for the help files an Install or Update just wrote. The log is
 * not managed: created with its English header when absent, otherwise only appended to.
 */
export async function logHelpWrite(
  store: SetupStore,
  written: readonly { path: string; version: number }[],
): Promise<void> {
  const help = written.filter((entry) => isHelpPath(entry.path));
  if (help.length === 0) return;
  const version = Math.max(...help.map((entry) => entry.version));
  await appendLog(
    store,
    HELP_MODULE_SLUG,
    {
      kind: 'ingest',
      title: `Gaston help, version ${version}`,
      touched: help.map((entry) => entry.path.slice(HELP_ROOT.length + 1)),
      notes: 'written by the Gaston agent setup',
    },
    { language: 'en' },
  );
}
