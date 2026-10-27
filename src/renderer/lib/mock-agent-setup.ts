/* Browser-mode answer for `agent:setupStatus`: a vault with no agent setup yet.
   The paths are listed here because the renderer must not import the core's
   template list. */

import { AGENT_DIRS, AGENT_SKILLS } from '@shared/types';
import type { AgentSetupState } from '@shared/types';

/** Path → shipped template version, mirroring the core's templates. */
const SHIPPED: Record<string, number> = {
  'CLAUDE.md': 2,
  '.claude/settings.json': 3,
  '.claude/hooks/gaston-shell-guard.ps1': 2,
  '.claude/hooks/gaston-wiki-check.ps1': 2,
  '.claude/hooks/gaston-run-report.ps1': 1,
  [`.claude/skills/${AGENT_SKILLS.jobs}/SKILL.md`]: 6,
  [`.claude/skills/${AGENT_SKILLS.curate}/SKILL.md`]: 3,
  [`.claude/skills/${AGENT_SKILLS.propose}/SKILL.md`]: 3,
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
  help: { status: 'missing', installedVersion: null, shippedVersion: 7 },
};
