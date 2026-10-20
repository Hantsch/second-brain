/* AC8: a project that belongs to no vault project can be linked from here —
   the same way the dashboard tile does it, and with the same undo.

   Why per project and not per session row: `repos` in the project file names a
   working **directory** (docs/VAULT-FORMAT.md). Every session in that directory
   shares the link, so a per-session control would offer the same write several
   times over and suggest a distinction that does not exist.

   The selection itself is `SessionLink` from the dashboard tile, unchanged —
   search field from eight projects on, keyboard-operable `select`, an empty
   result list that says so. A second picker with the same job would be one
   place too many for the same bug.

   The state of `repos` **before** the write is the undo. It is captured here
   before the queries re-run — same pattern as `ClaudeSessionsTile`. */

import { useState } from 'react';
import type { AgentProject } from '@shared/types';
import { useT } from '../../i18n';
import { SessionLink } from '../../components/tiles/SessionLink';
import { useLinkAgentProject } from '../../lib/queries/agents';
import { useProjects } from '../../lib/queries/data';
import { useProjectMutations } from '../../lib/queries/projects';
import { pushToast } from '../../lib/toast';

export interface ProjectLinkPickerProps {
  /** The agent project whose working directory is to be linked. */
  project: AgentProject;
}

export function ProjectLinkPicker({ project }: ProjectLinkPickerProps) {
  const t = useT();
  const projects = useProjects();
  const link = useLinkAgentProject();
  const { patch } = useProjectMutations();
  const [picking, setPicking] = useState(false);

  const linkTo = (slug: string): void => {
    const target = (projects.data ?? []).find((entry) => entry.slug === slug);
    const before = target?.repos ?? [];
    link.mutate(
      { agent: project.agent, projectKey: project.key, project: slug },
      {
        onSuccess: () =>
          pushToast('success', {
            message: 'agents.link.done',
            values: { name: target?.title ?? slug },
            description: 'agents.link.hint',
            action: {
              label: 'common.undo',
              run: () => patch.mutate({ slug, patch: { repos: [...before] } }),
            },
          }),
        /* A failed write must not pass silently as an unchanged screen. */
        onError: () => pushToast('error', 'agents.link.failed'),
      },
    );
  };

  if (picking) {
    return (
      <SessionLink
        name={project.name}
        labelKey="agents.link.for"
        projects={projects.data ?? []}
        onPick={(slug) => {
          setPicking(false);
          linkTo(slug);
        }}
      />
    );
  }

  return (
    <button type="button" className="sb-textlink" onClick={() => setPicking(true)}>
      {t('agents.link.action')}
    </button>
  );
}
