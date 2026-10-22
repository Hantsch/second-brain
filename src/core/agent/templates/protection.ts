/* The protection files: the permission rules and hook registrations in settings.json, and
 * the hook scripts they point at. The settings body is rendered from PROTECTION_RULES so
 * the rules, the installed file and the status check read one list. */

import { AGENT_DIRS, type AgentProtectionRuleId } from '../../../shared/types/agent-setup';
import { INTERNAL_DIRS, VAULT_DIRS } from '../../../shared/types/vault';
import type { SetupTemplate } from '../setup-types';
import { SHELL_GUARD_BODY } from './hook-shell-guard';
import { WIKI_CHECK_BODY } from './hook-wiki-check';

export interface HookRequirement {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop';
  tools: readonly string[];
  /** Vault-relative path of the hook script. */
  script: string;
  /** A failing hook blocks the tool call instead of letting it through. */
  failClosed: boolean;
}

export interface ProtectionRule {
  id: AgentProtectionRuleId;
  deny: readonly string[];
  hooks: readonly HookRequirement[];
}

const SHELL_GUARD_PATH = '.claude/hooks/gaston-shell-guard.ps1';
const WIKI_CHECK_PATH = '.claude/hooks/gaston-wiki-check.ps1';

export const PROTECTION_RULES: readonly ProtectionRule[] = [
  {
    id: 'journal-read',
    // The derived index holds every document body, journal included, and the chat sessions
    // hold journal text: both are as unreadable as journal/ itself.
    deny: [
      `Read(/${VAULT_DIRS.journal}/**)`,
      `Edit(/${VAULT_DIRS.journal}/**)`,
      `Read(/${INTERNAL_DIRS.index}/**)`,
      `Read(/${INTERNAL_DIRS.chats}/**)`,
    ],
    hooks: [],
  },
  { id: 'raw-write', deny: ['Edit(/raw/**)'], hooks: [] },
  { id: 'setup-write', deny: ['Edit(/CLAUDE.md)', 'Edit(/.claude/**)'], hooks: [] },
  { id: 'overview-write', deny: ['Edit(/modules/*/wiki/overview.md)'], hooks: [] },
  {
    id: 'internal-write',
    // Results, proposals and runs under .secondbrain/agent/ stay writable; jobs are
    // Gaston's alone, and everything else in .secondbrain/ is internal state.
    deny: [
      'Edit(/.secondbrain/*.json)',
      ...Object.values(INTERNAL_DIRS).map((dir) => `Edit(/${dir}/**)`),
      `Edit(/${AGENT_DIRS.jobs}/**)`,
    ],
    hooks: [],
  },
  {
    id: 'pre-tool-guard',
    deny: [],
    hooks: [
      {
        event: 'PreToolUse',
        tools: [
          'Bash',
          'PowerShell',
          'Read',
          'Grep',
          'Glob',
          'Write',
          'Edit',
          'MultiEdit',
          'NotebookEdit',
        ],
        script: SHELL_GUARD_PATH,
        failClosed: true,
      },
    ],
  },
  {
    id: 'wiki-check',
    deny: [],
    hooks: [
      {
        event: 'PostToolUse',
        tools: ['Write', 'Edit', 'MultiEdit'],
        script: WIKI_CHECK_PATH,
        failClosed: false,
      },
      { event: 'Stop', tools: [], script: WIKI_CHECK_PATH, failClosed: false },
    ],
  },
];

interface HookGroup {
  matcher?: string;
  hooks: {
    type: 'command';
    command: string;
    args: string[];
    timeout: number;
    onFailure?: 'block';
  }[];
}

/** The settings object for a set of rules. `${CLAUDE_PROJECT_DIR}` stays literal: Claude Code resolves it. */
export function renderSettings(rules: readonly ProtectionRule[]): object {
  const hooks: Partial<Record<HookRequirement['event'], HookGroup[]>> = {};
  for (const hook of rules.flatMap((rule) => rule.hooks)) {
    const group: HookGroup = {
      ...(hook.event === 'Stop' ? {} : { matcher: hook.tools.join('|') }),
      hooks: [
        {
          type: 'command',
          command: 'powershell.exe',
          args: [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            `\${CLAUDE_PROJECT_DIR}/${hook.script}`,
          ],
          timeout: 30,
          ...(hook.failClosed ? { onFailure: 'block' as const } : {}),
        },
      ],
    };
    (hooks[hook.event] ??= []).push(group);
  }
  return { permissions: { deny: rules.flatMap((rule) => rule.deny) }, hooks };
}

export const SETTINGS_TEMPLATE: SetupTemplate = {
  id: 'settings',
  path: '.claude/settings.json',
  version: 1,
  format: 'json',
  body: JSON.stringify(renderSettings(PROTECTION_RULES), null, 2) + '\n',
};

export const HOOK_SHELL_GUARD_TEMPLATE: SetupTemplate = {
  id: 'hook-gaston-shell-guard',
  path: SHELL_GUARD_PATH,
  version: 1,
  format: 'script',
  body: SHELL_GUARD_BODY,
};

export const HOOK_WIKI_CHECK_TEMPLATE: SetupTemplate = {
  id: 'hook-gaston-wiki-check',
  path: WIKI_CHECK_PATH,
  version: 1,
  format: 'script',
  body: WIKI_CHECK_BODY,
};
