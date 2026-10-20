/* The right column: everything about a project, in two tabs.

   The head stays put — title, scope, status, deadline: that is the project's
   identity, and it belongs above both tabs, not inside one of them. Below it
   the view splits: "Overview" answers "where did I leave off?" (next step,
   waiting-on, todos, status, notes), "Sessions" answers "what actually ran,
   and where?" (the work trail plus the agent CLIs' sessions).

   Which tab is open lives in the address, not here (`?p=<slug>&tab=sessions`),
   so a link leads straight into a project's sessions. The screen above owns
   the address and hands the derived state down as `view`.

   This component keeps the write paths whose controls sit in the head
   itself — the status and the favourite star. Their failure is reported
   right below the head — where the change was made. Every other write
   belongs to the Overview tab and reports itself there.

   The Knowledge tab (story 045, D4) is unconditional, unlike Sessions: every
   project can be condensed, whether or not it has an agent working directory,
   so it is always offered.

   The Sessions tab is only offered when there is something in it: a project
   with no agent working directory would carry an empty tab forever. What
   counts as "there is something" is decided from what the project itself
   declares (`repos`) plus any agent project a CLI has already matched to it —
   never from a CLI's silence, see the rule below. Whoever wants the tab
   anyway turns on `overview.showEmptySessionsTab` in the projects filter bar
   — one switch for all projects, revealing the tab with the way to link a
   directory inside it.

   The screen gives this component the project slug as `key`: on a switch it
   is recreated, which automatically clears out whatever belonged to the
   previous project. */

import { useState } from 'react';
import type { AgentKind, Project, ProjectStatus, VaultDoc } from '@shared/types';
import { Tabs } from '../../atoms/Tabs';
import { ErrorState } from '../../components/ErrorState';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useAgentProjects } from '../../lib/queries/agents';
import { useOverviewSettings } from '../../lib/queries/dashboard';
import { useProjectMutations } from '../../lib/queries/projects';
import { ProjectHead } from './ProjectHead';
import { ProjectKnowledgeTab } from './ProjectKnowledgeTab';
import { ProjectOverviewTab } from './ProjectOverviewTab';
import { ProjectSessionsTab } from './ProjectSessionsTab';

export type ProjectTab = 'overview' | 'knowledge' | 'sessions';

/** Where the detail stands, and how it gets somewhere else. */
export interface ProjectView {
  tab: ProjectTab;
  /** The selected CLI of the Sessions tab. */
  agent: AgentKind;
  /** The open session of the Sessions tab, or null. */
  sessionId: string | null;
  /** An omitted field keeps its current value, `null` clears it. */
  go: (next: {
    tab?: ProjectTab | undefined;
    a?: AgentKind | undefined;
    s?: string | null | undefined;
  }) => void;
}

export interface ProjectDetailProps {
  project: Project;
  doc: VaultDoc;
  view: ProjectView;
  now?: Date;
}

export function ProjectDetail({ project, doc, view, now }: ProjectDetailProps) {
  const t = useT();
  const mutations = useProjectMutations();
  const overview = useOverviewSettings();
  const claudeProjects = useAgentProjects('claude');
  const codexProjects = useAgentProjects('codex');
  const [savedStatus, setSavedStatus] = useState<ProjectStatus | null>(null);

  /* Does an agent working directory belong to this project? Two things say
     yes, and nothing says no.

     `repos` is the field the matching itself goes by (docs/VAULT-FORMAT.md),
     and the index carries it in the very first frame, without any CLI. A
     project that names a working directory has therefore declared the link:
     no interim value, no flash, no tab that appears late or is taken away
     again.

     A matched agent project of either CLI counts as well, because a link can
     be made by name instead of by path — and Codex alone is reason enough,
     just like Claude Code alone.

     Deliberately not part of this: a CLI that reports nothing. An empty
     `agents:projects` means "reading is switched off" or "the configured
     directory is gone" just as much as "nothing there" — reading "not linked"
     out of it would hide the tab exactly when the user needs the state inside
     it, the one that names the broken setting. A read that says nothing
     changes nothing. */
  const hasAgentProject =
    project.repos.length > 0 ||
    [...(claudeProjects.data ?? []), ...(codexProjects.data ?? [])].some(
      (entry) => entry.vaultProject === project.slug,
    );
  const offersSessions = hasAgentProject || (overview?.showEmptySessionsTab ?? false);

  /* A tab that isn't offered must not be open either: `?tab=sessions` on a
     project without a link shows the overview instead of a body no click can
     get back out of. The address stays as it is — it belongs to the screen,
     and with the switch on, the same link leads into the tab again. Knowledge
     carries no such condition — it is unconditional, so `view.tab` applies to
     it as-is. */
  const tab: ProjectTab = view.tab === 'sessions' && !offersSessions ? 'overview' : view.tab;

  const setStatus = (status: ProjectStatus): void => {
    setSavedStatus(null);
    mutations.patch.mutate(
      { slug: project.slug, patch: { status }, expectedHash: doc.hash },
      { onSuccess: (written) => setSavedStatus(written.status) },
    );
  };

  /* Same write path as the status, with the doc hash: a stale hash surfaces
     through the shared error state below `ProjectHead`, not as a silent
     no-op. No confirmation line — the story asks for one click, nothing
     more, unlike the status's `savedStatus`. */
  const setFavorite = (): void => {
    mutations.patch.mutate({
      slug: project.slug,
      patch: { favorite: !project.favorite },
      expectedHash: doc.hash,
    });
  };

  return (
    /* A named `section`, not a `div` with `aria-label`: on an element without
       a role, the name is invalid — and invisible to assistive tech. */
    <section className="sb-pdetail" aria-label={t('project.detail.aria')}>
      <ProjectHead
        project={project}
        statusBusy={mutations.patch.isPending}
        savedStatus={savedStatus}
        onStatus={setStatus}
        onFavorite={setFavorite}
        onOpenFile={() => void api.shell.openPath(project.path).catch(() => undefined)}
        {...(now === undefined ? {} : { now })}
      />

      {mutations.patch.error === null || mutations.patch.error === undefined ? null : (
        <ErrorState
          error={mutations.patch.error}
          variant="secondary"
          subject={project.title}
          scrollIntoView
        />
      )}

      <Tabs
        aria-label={t('project.tab.label')}
        items={[
          { id: 'overview', label: t('project.tab.overview'), icon: 'file-text' },
          { id: 'knowledge', label: t('project.tab.knowledge'), icon: 'layers' },
          ...(offersSessions
            ? [{ id: 'sessions', label: t('project.tab.sessions'), icon: 'workflow' }]
            : []),
        ]}
        value={tab}
        onChange={(id) =>
          view.go({
            tab: id === 'sessions' ? 'sessions' : id === 'knowledge' ? 'knowledge' : 'overview',
          })
        }
      />

      {tab === 'sessions' ? (
        <ProjectSessionsTab
          project={project}
          agent={view.agent}
          sessionId={view.sessionId}
          go={(next) => view.go(next)}
          {...(now === undefined ? {} : { now })}
        />
      ) : tab === 'knowledge' ? (
        <ProjectKnowledgeTab project={project} />
      ) : (
        <ProjectOverviewTab project={project} doc={doc} {...(now === undefined ? {} : { now })} />
      )}
    </section>
  );
}
