import { applySetup } from '@core/agent/setup-apply';
import { readSetupState } from '@core/agent/setup-status';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import type { SetupTemplate } from '@core/agent/setup-types';
import type { VaultStore } from '@core/vault/types';
import { AGENT_SETUP_MANIFEST, type AgentSetupState } from '../../src/shared/types/agent-setup';

export function template(path: string): SetupTemplate {
  const found = SETUP_TEMPLATES.find((candidate) => candidate.path === path);
  if (found === undefined) throw new Error(`no template at ${path}`);
  return found;
}

/** The shipped templates with `path` raised to `version` and a changed body. */
export function shippedWith(path: string, version: number): SetupTemplate[] {
  return SETUP_TEMPLATES.map((t) =>
    t.path === path ? { ...t, version, body: `${t.body}\nAdded in version ${version}.\n` } : t,
  );
}

export function confirmEverything(state: AgentSetupState) {
  return {
    confirmed: [...state.plan.write, ...state.plan.optIn].map(({ path, expectedHash }) => ({
      path,
      expectedHash,
    })),
  };
}

export async function install(store: VaultStore, templates = SETUP_TEMPLATES) {
  const state = await readSetupState(store, templates);
  return applySetup(store, confirmEverything(state), templates);
}

export function statusOf(state: AgentSetupState, path: string) {
  return state.files.find((file) => file.path === path);
}

export async function manifestEntries(store: VaultStore) {
  const text = await store.readText(AGENT_SETUP_MANIFEST);
  return (JSON.parse(text ?? '{}') as { files: { path: string; version: number; hash: string }[] })
    .files;
}
