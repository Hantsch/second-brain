/* The protection files: the permission rules and hook registrations in settings.json, and
 * the hook scripts they point at. The settings body is rendered from PROTECTION_RULES so
 * the rules, the installed file and the status check read one list. */

import { AGENT_DIRS, type AgentProtectionRuleId } from '../../../shared/types/agent-setup';
import { AGENT_RESOLVED_DIR } from '../../../shared/types/agent-proposals';
import { INTERNAL_DIRS, VAULT_DIRS } from '../../../shared/types/vault';
import type { SetupTemplate } from '../setup-types';
import { RUN_REPORT_BODY } from './hook-run-report';
import { SHELL_GUARD_BODY } from './hook-shell-guard';
import { WIKI_CHECK_BODY } from './hook-wiki-check';

export interface HookRequirement {
  event: 'PreToolUse' | 'PostToolUse' | 'Stop' | 'UserPromptSubmit';
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
const RUN_REPORT_PATH = '.claude/hooks/gaston-run-report.ps1';

/** Claude Code fires these on every occurrence and ignores a matcher, so none is written. */
export function hookHasMatcher(event: HookRequirement['event']): boolean {
  return event !== 'Stop' && event !== 'UserPromptSubmit';
}

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
    // Results and proposals under .secondbrain/agent/ stay writable, and runs/ has no rule (the
    // hook writes it, the agent never does); jobs and resolved proposals are Gaston's alone, and everything else in .secondbrain/ is internal state.
    deny: [
      'Edit(/.secondbrain/*.json)',
      ...Object.values(INTERNAL_DIRS).map((dir) => `Edit(/${dir}/**)`),
      `Edit(/${AGENT_DIRS.jobs}/**)`,
      `Edit(/${AGENT_RESOLVED_DIR}/**)`,
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

/** The run-report registrations. They record and protect nothing, so they stay out of
 * PROTECTION_RULES and the protection status does not list them. */
export const REPORT_HOOKS: readonly HookRequirement[] = [
  { event: 'UserPromptSubmit', tools: [], script: RUN_REPORT_PATH, failClosed: false },
  { event: 'PostToolUse', tools: ['Skill'], script: RUN_REPORT_PATH, failClosed: false },
  { event: 'Stop', tools: [], script: RUN_REPORT_PATH, failClosed: false },
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

/** The settings object for a set of rules plus the report hooks; an event registered by both
 * gets one group per script. `${CLAUDE_PROJECT_DIR}` stays literal: Claude Code resolves it. */
export function renderSettings(
  rules: readonly ProtectionRule[],
  reportHooks: readonly HookRequirement[] = REPORT_HOOKS,
): object {
  const hooks: Partial<Record<HookRequirement['event'], HookGroup[]>> = {};
  for (const hook of [...rules.flatMap((rule) => rule.hooks), ...reportHooks]) {
    const group: HookGroup = {
      ...(hookHasMatcher(hook.event) ? { matcher: hook.tools.join('|') } : {}),
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
  version: 3,
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

export const HOOK_RUN_REPORT_TEMPLATE: SetupTemplate = {
  id: 'hook-gaston-run-report',
  path: RUN_REPORT_PATH,
  version: 1,
  format: 'script',
  body: RUN_REPORT_BODY,
};
