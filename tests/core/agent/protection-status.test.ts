/* The protection section shows what the installed settings.json really holds, so these
 * tests edit the installed files the way a user would and read back what a user would see. */

import { describe, expect, it } from 'vitest';
import { readProtection } from '@core/agent/protection-status';
import { renderSetupFile } from '@core/agent/setup-marker';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { MemoryVaultStore } from '@core/vault/memory-store';
import type { AgentProtectionState } from '../../../src/shared/types/agent-setup';

const SETTINGS = '.claude/settings.json';
const SHELL_GUARD = '.claude/hooks/gaston-shell-guard.ps1';

interface Settings {
  permissions: { deny: string[] };
  hooks: Record<string, { hooks: { onFailure?: string }[] }[]>;
}

/** A vault with every shipped file installed, `edit` applied to the settings before it is written. */
async function installedVault(edit: (settings: Settings) => void = () => undefined) {
  const store = new MemoryVaultStore();
  for (const template of SETUP_TEMPLATES) {
    let content = renderSetupFile(template);
    if (template.path === SETTINGS) {
      const settings = JSON.parse(content) as Settings;
      edit(settings);
      content = JSON.stringify(settings, null, 2);
    }
    await store.writeText(template.path, content);
  }
  return store;
}

function read(state: AgentProtectionState) {
  if (state.state !== 'read')
    throw new Error(`expected a readable settings file, got ${state.state}`);
  return state;
}

function missingByRule(state: AgentProtectionState) {
  return Object.fromEntries(
    read(state)
      .rules.filter((rule) => rule.status === 'missing')
      .map((rule) => [rule.id, rule.missing]),
  );
}

describe('agent protection status', () => {
  it('a vault without settings reads as unprotected', async () => {
    expect(await readProtection(new MemoryVaultStore())).toEqual({ state: 'none' });
  });

  it('an installed setup reads every rule as installed', async () => {
    const state = read(await readProtection(await installedVault()));

    expect(state.rules.map((rule) => rule.id)).toEqual([
      'journal-read',
      'raw-write',
      'setup-write',
      'overview-write',
      'internal-write',
      'pre-tool-guard',
      'wiki-check',
    ]);
    for (const rule of state.rules) {
      expect(rule, rule.id).toMatchObject({ status: 'installed', missing: [] });
    }
    expect(state.extraDeny).toEqual([]);
  });

  it('a rule removed by hand reads as missing', async () => {
    const store = await installedVault((settings) => {
      settings.permissions.deny = settings.permissions.deny.filter(
        (entry) => entry !== 'Read(/journal/**)',
      );
    });

    expect(missingByRule(await readProtection(store))).toEqual({
      'journal-read': ['Read(/journal/**)'],
    });
  });

  it('a derived-index read rule removed by hand reads as missing', async () => {
    const store = await installedVault((settings) => {
      settings.permissions.deny = settings.permissions.deny.filter(
        (entry) => entry !== 'Read(/.secondbrain/index/**)',
      );
    });

    expect(missingByRule(await readProtection(store))).toEqual({
      'journal-read': ['Read(/.secondbrain/index/**)'],
    });
  });

  it('a guard that no longer fails closed or lost its script reads as missing', async () => {
    const open = await installedVault((settings) => {
      for (const group of settings.hooks.PreToolUse ?? []) {
        for (const hook of group.hooks) delete hook.onFailure;
      }
    });
    expect(missingByRule(await readProtection(open))).toEqual({
      'pre-tool-guard': ['hook:PreToolUse'],
    });

    const scriptless = await installedVault();
    await scriptless.delete(SHELL_GUARD);
    expect(missingByRule(await readProtection(scriptless))).toEqual({
      'pre-tool-guard': [`script:${SHELL_GUARD}`],
    });
  });

  it('deny entries Gaston did not write are listed as the user’s', async () => {
    const store = await installedVault((settings) => {
      settings.permissions.deny.push('Bash(rm -rf *)', '  Read(/raw/**)  ');
    });

    const state = read(await readProtection(store));
    expect(state.extraDeny).toEqual(['Bash(rm -rf *)', 'Read(/raw/**)']);
    expect(state.rules.every((rule) => rule.status === 'installed')).toBe(true);
  });

  it('disableAllHooks turns the hook rules off and leaves the deny rules installed', async () => {
    const store = await installedVault((settings) => {
      (settings as unknown as Record<string, unknown>).disableAllHooks = true;
    });

    const { rules } = read(await readProtection(store));
    const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));
    for (const id of ['pre-tool-guard', 'wiki-check']) {
      expect(byId[id], id).toMatchObject({ status: 'off', missing: ['disableAllHooks'] });
    }
    for (const id of ['journal-read', 'raw-write', 'setup-write']) {
      expect(byId[id], id).toMatchObject({ status: 'installed', missing: [] });
    }
  });

  it('disableAllHooks in the local settings file turns the hook rules off too', async () => {
    const store = await installedVault();
    await store.writeText('.claude/settings.local.json', '{ "disableAllHooks": true }');

    const { rules } = read(await readProtection(store));
    expect(rules.find((rule) => rule.id === 'pre-tool-guard')?.status).toBe('off');
    expect(rules.find((rule) => rule.id === 'journal-read')?.status).toBe('installed');
  });

  it('a disableAllHooks that is not the boolean true changes nothing', async () => {
    for (const value of [false, 'true']) {
      const store = await installedVault((settings) => {
        (settings as unknown as Record<string, unknown>).disableAllHooks = value;
      });
      await store.writeText('.claude/settings.local.json', '{ broken');
      const { rules } = read(await readProtection(store));
      expect(
        rules.every((rule) => rule.status === 'installed'),
        String(value),
      ).toBe(true);
    }
  });

  it('an unreadable settings file is reported, not shown as unprotected', async () => {
    const broken = new MemoryVaultStore();
    await broken.writeText(SETTINGS, '{ "permissions": ');
    const state = await readProtection(broken);
    expect(state.state).toBe('unreadable');
    if (state.state === 'unreadable') {
      expect(state.reason.length).toBeGreaterThan(0);
      expect(state.reason.length).toBeLessThanOrEqual(200);
    }

    const notAnObject = new MemoryVaultStore();
    await notAnObject.writeText(SETTINGS, '["deny"]');
    expect((await readProtection(notAnObject)).state).toBe('unreadable');
  });
});
