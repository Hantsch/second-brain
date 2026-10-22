/* What Gaston's agent setup looks like in a vault right now, and what installing or
 * updating it would do. Ownership comes from the manifest first, the in-file marker
 * second; a file at a managed path that neither claims is the user's (`yours`) and is
 * never planned for writing. A help-module collision empties the plan entirely; who owns
 * the help slug is decided by the markers on disk, never by the manifest alone. */

import type { HelpModuleState } from '../../shared/help-module';
import {
  AGENT_DIRS,
  AGENT_SETUP_MANIFEST,
  type AgentSetupCollision,
  type AgentSetupFile,
  type AgentSetupFileStatus,
  type AgentSetupPlan,
  type AgentSetupState,
} from '../../shared/types/agent-setup';
import { sha256 } from '../vault/hash';
import { helpCollision, helpModuleState } from './help/setup';
import { parseMarker, renderSetupFile } from './setup-marker';
import {
  readSetupManifest,
  type SetupManifestEntry,
  type SetupManifestRead,
} from './setup-manifest';
import { MANAGED_TEMPLATES } from './managed-templates';
import type { SetupStore, SetupTemplate } from './setup-types';

export interface InspectedTemplate {
  template: SetupTemplate;
  status: AgentSetupFileStatus;
  installedVersion: number | null;
  /** sha256 of the file as read now, `''` when absent. */
  hash: string;
  exists: boolean;
  /** The file carries this template's marker, whatever the manifest records. */
  marked: boolean;
}

export interface SetupInspection {
  templates: InspectedTemplate[];
  manifest: SetupManifestRead;
  state: AgentSetupState;
  help: HelpModuleState;
}

const PENDING: ReadonlySet<AgentSetupFileStatus> = new Set(['missing', 'outdated', 'modified']);

function byVersion(installed: number, shipped: number): AgentSetupFileStatus {
  if (installed < shipped) return 'outdated';
  return installed === shipped ? 'current' : 'newer';
}

/** The marker must take the form this template writes: a comment naming its id, or the
 * id-less frontmatter keys only where the shipped file carries them too. */
function templateMarker(template: SetupTemplate, content: string) {
  const marker = parseMarker(content);
  const expected = parseMarker(renderSetupFile(template));
  return marker === null || expected === null || marker.id !== expected.id ? null : marker;
}

function classify(
  template: SetupTemplate,
  content: string,
  entry: SetupManifestEntry | undefined,
): Pick<InspectedTemplate, 'status' | 'installedVersion'> {
  const rendered = renderSetupFile(template);
  if (entry !== undefined) {
    const hash = sha256(content);
    const untouched = hash === entry.hash || hash === sha256(rendered);
    return {
      status: untouched ? byVersion(entry.version, template.version) : 'modified',
      installedVersion: entry.version,
    };
  }
  const marker = templateMarker(template, content);
  if (marker === null) return { status: 'yours', installedVersion: null };
  let status: AgentSetupFileStatus = 'modified';
  if (content === rendered) status = 'current';
  else if (marker.version > template.version) status = 'newer';
  return { status, installedVersion: marker.version };
}

async function inspectTemplate(
  store: SetupStore,
  template: SetupTemplate,
  manifest: SetupManifestRead,
): Promise<InspectedTemplate> {
  const content = await store.readText(template.path);
  if (content === null) {
    return {
      template,
      status: 'missing',
      installedVersion: null,
      hash: '',
      exists: false,
      marked: false,
    };
  }
  const entry = manifest.files.find(
    (candidate) => candidate.path === template.path && candidate.template === template.id,
  );
  return {
    template,
    ...classify(template, content, entry),
    hash: sha256(content),
    exists: true,
    marked: templateMarker(template, content) !== null,
  };
}

async function otherClaudeFiles(store: SetupStore, managed: Set<string>): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of store.walk({ dir: '.claude' })) {
    if (entry.path === AGENT_SETUP_MANIFEST || managed.has(entry.path)) continue;
    paths.push(entry.path);
  }
  return paths;
}

function buildPlan(
  inspected: readonly InspectedTemplate[],
  others: readonly string[],
  collision: AgentSetupCollision | null,
) {
  const plan: AgentSetupPlan = { write: [], optIn: [], leave: [], dirs: [] };
  if (collision !== null) plan.collision = collision;
  for (const { template, status, hash } of inspected) {
    if (collision !== null) {
      plan.leave.push({ path: template.path, status });
    } else if (status === 'missing' || status === 'outdated') {
      plan.write.push({ path: template.path, expectedHash: hash, reason: status });
    } else if (status === 'modified') {
      plan.optIn.push({ path: template.path, expectedHash: hash });
    } else {
      plan.leave.push({ path: template.path, status });
    }
  }
  for (const path of others) plan.leave.push({ path, status: 'yours' });
  return plan;
}

export async function inspectSetup(
  store: SetupStore,
  templates: readonly SetupTemplate[] = MANAGED_TEMPLATES,
): Promise<SetupInspection> {
  const manifest = await readSetupManifest(store);
  const inspected: InspectedTemplate[] = [];
  for (const template of templates)
    inspected.push(await inspectTemplate(store, template, manifest));
  const others = await otherClaudeFiles(store, new Set(templates.map((t) => t.path)));

  const collision = await helpCollision(store, inspected, manifest);
  const plan = buildPlan(inspected, others, collision);
  for (const dir of Object.values(AGENT_DIRS)) {
    if (collision === null && !(await store.exists(dir))) plan.dirs.push(dir);
  }

  const files: AgentSetupFile[] = [
    ...inspected.map(({ template, status, installedVersion }) => ({
      path: template.path,
      status,
      installedVersion,
      shippedVersion: template.version,
    })),
    ...others.map((path) => ({
      path,
      status: 'yours' as const,
      installedVersion: null,
      shippedVersion: null,
    })),
  ];
  const noneGastons = inspected.every((t) => t.status === 'missing' || t.status === 'yours');
  let action: AgentSetupState['action'] = 'none';
  if (noneGastons) action = 'install';
  // From the statuses, not the plan: a collision empties the plan but not what is due.
  else if (inspected.some(({ status }) => PENDING.has(status))) action = 'update';

  const help = helpModuleState(inspected, collision);
  return { templates: inspected, manifest, state: { files, action, plan, help }, help };
}

export async function readSetupState(
  store: SetupStore,
  templates: readonly SetupTemplate[] = MANAGED_TEMPLATES,
): Promise<AgentSetupState> {
  return (await inspectSetup(store, templates)).state;
}

/** The help module as one row, from the same inspection the setup plan is made from. */
export async function readHelpModuleState(
  store: SetupStore,
  templates: readonly SetupTemplate[] = MANAGED_TEMPLATES,
): Promise<HelpModuleState> {
  return (await inspectSetup(store, templates)).help;
}
