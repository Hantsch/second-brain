/* Everything the agent setup manages: the `.claude/` files and CLAUDE.md, then the help
 * module. Status, plan and apply default to this list, so one Install writes both. */

import { HELP_TEMPLATES } from './help/setup';
import { SETUP_TEMPLATES } from './setup-templates';
import type { SetupTemplate } from './setup-types';

export const MANAGED_TEMPLATES: readonly SetupTemplate[] = [...SETUP_TEMPLATES, ...HELP_TEMPLATES];
