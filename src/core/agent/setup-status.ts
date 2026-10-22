/* What Gaston's agent setup looks like in a vault right now, and what installing or
 * updating it would do. Ownership comes from the manifest first, the in-file marker
 * second; a file at a managed path that neither claims is the user's (`yours`) and is
 * never planned for writing. */

import {
  AGENT_DIRS,
  AGENT_SETUP_MANIFEST,
  type AgentSetupFile,
  type AgentSetupFileStatus,
  type AgentSetupPlan,
  type AgentSetupState,
} from '../../shared/types/agent-setup';
import { sha256 } from '../vault/hash';
import { parseMarker, renderSetupFile } from './setup-marker';
import {
  readSetupManifest,
  type SetupManifestEntry,
  type SetupManifestRead,
} from './setup-manifest';
import { SETUP_TEMPLATES } from './setup-templates';
import type { SetupStore, SetupTemplate } from './setup-types';

export interface InspectedTemplate {
  template: SetupTemplate;
  status: AgentSetupFileStatus;
  installedVersion: number | null;
  /** sha256 of the file as read now, `''` when absent. */
  hash: string;
  exists: boolean;
}

export interface SetupInspection {
  templates: InspectedTemplate[];
  manifest: SetupManifestRead;
  state: AgentSetupState;
}

function byVersion(installed: number, shipped: number): AgentSetupFileStatus {
  if (installed < shipped) return 'outdated';
  return installed === shipped ? 'current' : 'newer';
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
  const marker = parseMarker(content);
  if (marker === null || marker.id !== template.id) {
    return { status: 'yours', installedVersion: null };
  }
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
    return { template, status: 'missing', installedVersion: null, hash: '', exists: false };
  }
  const entry = manifest.files.find(
    (candidate) => candidate.path === template.path && candidate.template === template.id,
  );
  return { template, ...classify(template, content, entry), hash: sha256(content), exists: true };
}

async function otherClaudeFiles(store: SetupStore, managed: Set<string>): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of store.walk({ dir: '.claude' })) {
    if (entry.path === AGENT_SETUP_MANIFEST || managed.has(entry.path)) continue;
    paths.push(entry.path);
  }
  return paths;
}

function buildPlan(inspected: readonly InspectedTemplate[], others: readonly string[]) {
  const plan: AgentSetupPlan = { write: [], optIn: [], leave: [], dirs: [] };
  for (const { template, status, hash } of inspected) {
    if (status === 'missing' || status === 'outdated') {
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
  templates: readonly SetupTemplate[] = SETUP_TEMPLATES,
): Promise<SetupInspection> {
  const manifest = await readSetupManifest(store);
  const inspected: InspectedTemplate[] = [];
  for (const template of templates)
    inspected.push(await inspectTemplate(store, template, manifest));
  const others = await otherClaudeFiles(store, new Set(templates.map((t) => t.path)));

  const plan = buildPlan(inspected, others);
  for (const dir of Object.values(AGENT_DIRS)) {
    if (!(await store.exists(dir))) plan.dirs.push(dir);
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
  else if (plan.write.length > 0 || plan.optIn.length > 0) action = 'update';

  return { templates: inspected, manifest, state: { files, action, plan } };
}

export async function readSetupState(
  store: SetupStore,
  templates: readonly SetupTemplate[] = SETUP_TEMPLATES,
): Promise<AgentSetupState> {
  return (await inspectSetup(store, templates)).state;
}
