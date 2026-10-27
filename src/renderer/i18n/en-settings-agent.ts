/* English texts for the Agent tab's Last run section — same key set as
   `de-settings-agent.ts`, enforced by the type. */

import type { SettingsAgentKey } from './de-settings-agent';

export const enSettingsAgent: Record<SettingsAgentKey, string> = {
  'settings.agent.lastRun.title': 'Last run',
  'settings.agent.lastRun.loading': 'Reading the last run',
  'settings.agent.lastRun.error': 'The last run could not be read: {reason}',
  'settings.agent.lastRun.none': 'No agent run yet.',
  'settings.agent.lastRun.finished': 'Finished',
  'settings.agent.lastRun.skill': 'Skill',
  'settings.agent.lastRun.pages': 'Pages changed',
  'settings.agent.lastRun.proposals': 'Proposals written',
  'settings.agent.lastRun.jobsDone': 'Jobs finished',
  'settings.agent.lastRun.jobsFailed': 'Jobs failed',
  'settings.agent.lastRun.jobsSkipped': 'Jobs skipped',
  'settings.agent.lastRun.unreadable': 'The last run report cannot be read.',
  'settings.agent.lastRun.reason': 'Reason',
  'settings.agent.lastRun.waitingOne': '1 proposal waits in Maintenance',
  'settings.agent.lastRun.waiting': '{count} proposals wait in Maintenance',
};
