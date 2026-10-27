/* What a job row calls its subject. The job file carries paths and slugs, not titles, so a
   module's slug becomes its title here, and a maintenance run is named by its date. Sources
   already come labelled by main. (story 091) */

import type { AgentJobView, KnowledgeModule, UiLanguage } from '@shared/types';
import { t } from '../i18n';
import { formatDateTime } from './format';

export function labelAgentJobs(
  jobs: readonly AgentJobView[],
  modules: readonly KnowledgeModule[] | undefined,
  language: UiLanguage,
): AgentJobView[] {
  return jobs.map((job) => {
    if (job.kind === 'curate-module') {
      const title = modules?.find((module) => module.slug === job.subject)?.title;
      return title === undefined ? job : { ...job, label: title };
    }
    if (job.kind === 'gardener-audit') {
      const date = formatDateTime(job.subject, language);
      return date === '' ? job : { ...job, label: t('tasks.agent.label.gardener-audit', { date }) };
    }
    return job;
  });
}
