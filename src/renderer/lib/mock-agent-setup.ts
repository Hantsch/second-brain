/* Browser-mode answer for `agent:setupStatus`: a vault with no agent setup yet.
   The paths are listed here because the renderer must not import the core's
   template list. */

import { AGENT_DIRS, AGENT_SKILLS } from '@shared/types';
import type { AgentSetupState } from '@shared/types';

/** Path → shipped template version, mirroring the core's templates. */
const SHIPPED: Record<string, number> = {
  'CLAUDE.md': 1,
  '.claude/settings.json': 1,
  '.claude/hooks/gaston-shell-guard.ps1': 1,
  '.claude/hooks/gaston-wiki-check.ps1': 1,
  [`.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`]: 2,
  [`.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`]: 1,
  [`.claude/skills/${AGENT_SKILLS.propose}/SKILL.md`]: 1,
};
const PATHS = Object.keys(SHIPPED);

export const agentSetupNotInstalled: AgentSetupState = {
  files: PATHS.map((path) => ({
    path,
    status: 'missing',
    installedVersion: null,
    shippedVersion: SHIPPED[path] ?? 1,
  })),
  action: 'install',
  plan: {
    write: PATHS.map((path) => ({ path, expectedHash: '', reason: 'missing' })),
    optIn: [],
    leave: [],
    dirs: Object.values(AGENT_DIRS),
  },
  help: { status: 'missing', installedVersion: null, shippedVersion: 6 },
};
