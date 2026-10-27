/* The installed settings.json is what keeps the agent out of the journal and away from the
 * files only Gaston writes; these tests read the shipped body, not the rule list. */

import { describe, expect, it } from 'vitest';
import { SETUP_TEMPLATES } from '@core/agent/setup-templates';
import { SETTINGS_TEMPLATE } from '@core/agent/templates/protection';
import { AGENT_RESOLVED_DIR } from '../../../src/shared/types/agent-proposals';
import { AGENT_DIRS } from '../../../src/shared/types/agent-setup';
import { INTERNAL_DIRS } from '../../../src/shared/types/vault';

interface HookEntry {
  command: string;
  args: string[];
  onFailure?: string;
}
interface Group {
  matcher?: string;
  hooks: HookEntry[];
}
interface Settings {
  permissions: { deny: string[] };
  hooks: Record<string, Group[]>;
}

const settings = JSON.parse(SETTINGS_TEMPLATE.body) as Settings;

describe('agent protection settings', () => {
  it('the installed settings deny journal reads and every protected write', () => {
    const deny = settings.permissions.deny;
    for (const entry of [
      'Read(/journal/**)',
      'Edit(/journal/**)',
      'Read(/.secondbrain/index/**)',
      'Read(/.secondbrain/chats/**)',
      'Edit(/raw/**)',
      'Edit(/CLAUDE.md)',
      'Edit(/.claude/**)',
      'Edit(/modules/*/wiki/overview.md)',
      'Edit(/.secondbrain/*.json)',
    ]) {
      expect(deny, entry).toContain(entry);
    }
    for (const dir of [...Object.values(INTERNAL_DIRS), AGENT_DIRS.jobs, AGENT_RESOLVED_DIR]) {
      expect(deny, dir).toContain(`Edit(/${dir}/**)`);
    }
    for (const dir of [AGENT_DIRS.results, AGENT_DIRS.proposals, AGENT_DIRS.runs]) {
      expect(
        deny.filter((entry) => entry.includes(dir)),
        dir,
      ).toEqual([]);
    }
    // The hand-over folders stay readable: no Read rule reaches .secondbrain/agent/.
    expect(deny.filter((entry) => entry.startsWith('Read(') && entry.includes('agent'))).toEqual(
      [],
    );
    for (const entry of deny) {
      expect(entry.startsWith('Read(/') || entry.startsWith('Edit(/'), entry).toBe(true);
    }
  });

  it('the hooks are registered in exec form and the guard fails closed', () => {
    const [guard] = settings.hooks.PreToolUse ?? [];
    expect(guard?.matcher?.split('|')).toEqual([
      'Bash',
      'PowerShell',
      'Read',
      'Grep',
      'Glob',
      'Write',
      'Edit',
      'MultiEdit',
      'NotebookEdit',
    ]);

    const templatePaths = SETUP_TEMPLATES.map((template) => template.path);
    const groups = Object.values(settings.hooks).flat();
    expect(groups.length).toBeGreaterThan(0);
    for (const hook of groups.flatMap((group) => group.hooks)) {
      expect(hook.command).toBe('powershell.exe');
      const target = hook.args.at(-1) ?? '';
      expect(target.startsWith('${CLAUDE_PROJECT_DIR}/')).toBe(true);
      expect(templatePaths).toContain(target.slice('${CLAUDE_PROJECT_DIR}/'.length));
    }

    expect(guard?.hooks[0]?.onFailure).toBe('block');
    expect(settings.hooks.PostToolUse).toHaveLength(1);
    expect(settings.hooks.Stop).toHaveLength(1);
    for (const group of [...(settings.hooks.PostToolUse ?? []), ...(settings.hooks.Stop ?? [])]) {
      expect(group.hooks[0]?.args.at(-1)).toContain('gaston-wiki-check');
      expect(group.hooks[0]?.onFailure).toBeUndefined();
    }
  });
});
