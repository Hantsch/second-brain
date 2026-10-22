/* What the vault's `.claude/settings.json` protects right now, read per rule from the file as
 * it is on disk. The user may edit it by hand, so every shape is treated as untrusted: a hook
 * or deny entry that is not what Gaston writes counts as absent, never as a crash. */

import type { AgentProtectionRule, AgentProtectionState } from '../../shared/types/agent-setup';
import type { VaultStore } from '../vault/types';
import {
  PROTECTION_RULES,
  type HookRequirement,
  type ProtectionRule,
} from './templates/protection';

const SETTINGS_PATH = '.claude/settings.json';
const REASON_LIMIT = 200;

type ProtectionStore = Pick<VaultStore, 'readText' | 'exists'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function denyEntries(settings: Record<string, unknown>): string[] {
  const permissions = settings.permissions;
  if (!isRecord(permissions) || !Array.isArray(permissions.deny)) return [];
  return permissions.deny.filter((entry): entry is string => typeof entry === 'string');
}

/** A registered command hook that runs `script`, and fails closed when the requirement says so. */
function runsScript(group: Record<string, unknown>, hook: HookRequirement): boolean {
  return asArray(group.hooks).some((entry) => {
    if (!isRecord(entry) || entry.type !== 'command') return false;
    const invocation = [entry.command, ...asArray(entry.args)]
      .filter((part): part is string => typeof part === 'string')
      .join(' ');
    if (!invocation.includes(hook.script)) return false;
    return !hook.failClosed || entry.onFailure === 'block';
  });
}

/** `Stop` has no matcher, so any group counts; the other events must name every required tool. */
function coversTools(group: Record<string, unknown>, hook: HookRequirement): boolean {
  if (hook.event === 'Stop') return true;
  const matched = typeof group.matcher === 'string' ? group.matcher.split('|') : [];
  return hook.tools.every((tool) => matched.includes(tool));
}

function hookRegistered(settings: Record<string, unknown>, hook: HookRequirement): boolean {
  const hooks = settings.hooks;
  if (!isRecord(hooks)) return false;
  return asArray(hooks[hook.event]).some(
    (group) => isRecord(group) && coversTools(group, hook) && runsScript(group, hook),
  );
}

async function checkRule(
  store: ProtectionStore,
  settings: Record<string, unknown>,
  denied: ReadonlySet<string>,
  rule: ProtectionRule,
): Promise<AgentProtectionRule> {
  const missing = rule.deny.filter((entry) => !denied.has(entry));
  for (const hook of rule.hooks) {
    if (!hookRegistered(settings, hook)) missing.push(`hook:${hook.event}`);
    const script = `script:${hook.script}`;
    if (!(await store.exists(hook.script)) && !missing.includes(script)) missing.push(script);
  }
  return { id: rule.id, status: missing.length === 0 ? 'installed' : 'missing', missing };
}

export async function readProtection(
  store: ProtectionStore,
  rules: readonly ProtectionRule[] = PROTECTION_RULES,
): Promise<AgentProtectionState> {
  const text = await store.readText(SETTINGS_PATH);
  if (text === null) return { state: 'none' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid JSON';
    return { state: 'unreadable', reason: message.slice(0, REASON_LIMIT) };
  }
  if (!isRecord(parsed)) return { state: 'unreadable', reason: 'settings.json is not an object' };

  const entries = denyEntries(parsed).map((entry) => entry.trim());
  const denied = new Set(entries);
  const known = new Set(rules.flatMap((rule) => rule.deny));
  const checked: AgentProtectionRule[] = [];
  for (const rule of rules) checked.push(await checkRule(store, parsed, denied, rule));
  return {
    state: 'read',
    rules: checked,
    extraDeny: entries.filter((entry) => !known.has(entry)),
  };
}
