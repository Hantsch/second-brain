/** The knowledge module Gaston ships to explain itself. Shared so the renderer and tests
 *  name the same folder the core writes. */
export const HELP_MODULE_SLUG = 'gaston-help';

/** The page that explains the agent setup, protection and proposals. */
export const HELP_AGENT_PAGE = `modules/${HELP_MODULE_SLUG}/wiki/concepts/agent.md`;

/** The help module as one row: `collision` (the folder is the user's), `missing` (no
 *  module.md), `outdated` (a page missing, older or modified by the user), `current`. */
export type HelpModuleStatus = 'missing' | 'collision' | 'outdated' | 'current';

export interface HelpModuleState {
  status: HelpModuleStatus;
  /** Version of the installed module.md, `null` when it is absent or not Gaston's. */
  installedVersion: number | null;
  shippedVersion: number;
}
