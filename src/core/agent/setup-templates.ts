/* The one list of files Gaston installs into a vault for Claude Code. Nothing else
 * enumerates templates; the help module joins this list in managed-templates.ts, which
 * is what status, plan and apply use. This file stays free of the help renderer because
 * the renderer's browser mock imports it.
 * Each body is mirrored as plain text in docs/agent-setup/<id><extension of path>. */

import type { SetupTemplate } from './setup-types';
import {
  HOOK_SHELL_GUARD_TEMPLATE,
  HOOK_WIKI_CHECK_TEMPLATE,
  SETTINGS_TEMPLATE,
} from './templates/protection';
import {
  SKILL_GASTON_CURATE_TEMPLATE,
  SKILL_GASTON_JOBS_TEMPLATE,
  SKILL_GASTON_PROPOSE_TEMPLATE,
} from './templates/skills';
import { VAULT_CLAUDE_TEMPLATE } from './templates/vault-claude';

export type { SetupTemplate };

export const SETUP_TEMPLATES: readonly SetupTemplate[] = [
  VAULT_CLAUDE_TEMPLATE,
  SETTINGS_TEMPLATE,
  HOOK_SHELL_GUARD_TEMPLATE,
  HOOK_WIKI_CHECK_TEMPLATE,
  SKILL_GASTON_JOBS_TEMPLATE,
  SKILL_GASTON_CURATE_TEMPLATE,
  SKILL_GASTON_PROPOSE_TEMPLATE,
];
