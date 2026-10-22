/* Browser-mode answer for `agent:setupStatus`: a vault with no agent setup yet.
   The paths are listed here because the renderer must not import the core's
   template list. */

import { AGENT_DIRS, AGENT_SKILLS } from '@shared/types';
import type { AgentSetupState } from '@shared/types';

const PATHS = [
  'CLAUDE.md',
  '.claude/settings.json',
  '.claude/hooks/gaston-shell-guard.ps1',
  '.claude/hooks/gaston-wiki-check.ps1',
  `.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`,
  `.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`,
  `.claude/skills/${AGENT_SKILLS.propose}/SKILL.md`,
];

export const agentSetupNotInstalled: AgentSetupState = {
  files: PATHS.map((path) => ({
    path,
    status: 'missing',
    installedVersion: null,
    shippedVersion: 1,
  })),
  action: 'install',
  plan: {
    write: PATHS.map((path) => ({ path, expectedHash: '', reason: 'missing' })),
    optIn: [],
    leave: [],
    dirs: Object.values(AGENT_DIRS),
  },
};
