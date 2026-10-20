/* Projects — the screen that answers "where did I leave off?"

   Two columns: the list on the left, the detail on the right. On open, the
   project with the most recent trail is selected — so the answer is already
   there before anyone clicks.

   Two views, one screen: "Projects" and "All todos". The todos get no rail
   slot of their own (the rail has ten fixed ones) and no screen of their
   own, because they answer the same question from the other direction — and
   because you regularly jump from a todo into its project. Having both in
   one screen keeps that jump to a single click.

   What's selected and which view is open lives in the address
   (`#/projects?p=<slug>&tab=todos`): that way a link from outside —
   dashboard, maintenance, command palette — leads straight into a project.

   The detail has tabs of its own (Overview | Sessions), and they use the same
   `tab` parameter: `tab=sessions` is still this list-plus-detail layout, only
   with the detail's second tab open. Its state — the chosen CLI (`a`) and the
   open session (`s`) — hangs in the address too, because this screen owns the
   address; `go` carries all four parameters, and a `go` that dropped `s`
   would strand every link into a transcript.

   Keyboard: j/k and arrows select, Enter opens the file, n creates a
   project, t opens the field for a todo, x checks off the focused todo. */

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AgentKind } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Tabs } from '../../atoms/Tabs';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useProject, useProjectMutations, useAllProjects } from '../../lib/queries/projects';
import { AllTodos } from './AllTodos';
import { NewProjectDialog } from './NewProjectDialog';
import { ProjectDetail } from './ProjectDetail';
import { ProjectList } from './ProjectList';
import { DEFAULT_FILTER, visibleProjects } from './filter';
import type { ProjectFilter } from './filter';
import { useListKeys } from './use-project-keys';

/* `sessions` and `knowledge` are the detail's own tabs, not a third layout:
   they fall into the same list-plus-detail branch as `list`, and the
   screen's own tab bar shows `list` as the selected one. */
type Tab = 'list' | 'todos' | 'sessions' | 'knowledge';

/** What `go` may change; an omitted field keeps its current value. */
interface Nav {
  p?: string | null | undefined;
  tab?: Tab | undefined;
  a?: AgentKind | undefined;
  s?: string | null | undefined;
}

function tabOf(value: string | null): Tab {
  if (value === 'todos') return 'todos';
  if (value === 'sessions') return 'sessions';
  return value === 'knowledge' ? 'knowledge' : 'list';
}

function agentOf(value: string | null): AgentKind {
  return value === 'codex' ? 'codex' : 'claude';
}

export function ProjectsScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const projects = useAllProjects();
  const mutations = useProjectMutations();

  const [filter, setFilter] = useState<ProjectFilter>(DEFAULT_FILTER);
  const [stalledOpen, setStalledOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const rows = useRef(new Map<string, HTMLButtonElement>());

  const tab: Tab = tabOf(params.get('tab'));
  const agent = agentOf(params.get('a'));
  const sessionId = params.get('s');
  const wanted = params.get('p');
  const list = visibleProjects(projects.data ?? [], filter);
  /* The selection hangs off the slug. If it's filtered out or deleted, the
     most recent trail applies — never an empty detail next to a full list. */
  const selected = list.all.find((project) => project.slug === wanted) ?? list.all[0] ?? null;
  const index = selected === null ? -1 : list.all.indexOf(selected);
  const detail = useProject(selected?.slug ?? null);

  const go = useCallback(
    (next: Nav) => {
      const merged = new URLSearchParams();
      const slug = next.p === undefined ? wanted : next.p;
      const view = next.tab ?? tab;
      const kind = next.a ?? agent;
      /* The open session belongs to one project on one tab: a different
         project or another tab drops it, everything else carries it. */
      const session = next.s !== undefined ? next.s : slug === wanted ? sessionId : null;
      if (slug !== null && slug.length > 0) merged.set('p', slug);
      if (view !== 'list') merged.set('tab', view);
      if (kind !== 'claude') merged.set('a', kind);
      if (view === 'sessions' && session !== null && session.length > 0) merged.set('s', session);
      setParams(merged, { replace: true });
    },
    [agent, sessionId, setParams, tab, wanted],
  );

  const select = useCallback(
    (at: number, focus = false): void => {
      const project = list.all[at];
      if (project === undefined) return;
      go({ p: project.slug });
      if (focus) rows.current.get(project.slug)?.focus();
    },
    [go, list.all],
  );

  useListKeys({
    count: list.all.length,
    index: Math.max(0, index),
    select,
    open: () => {
      if (selected !== null) void api.shell.openPath(selected.path).catch(() => undefined);
    },
    create: () => setDialog(true),
    enabled: tab === 'list' && !dialog,
  });

  const header = (
    <ScreenHeader
      overline={t('screen.projects.overline')}
      title={t('screen.projects.title')}
      action={
        /* Secondary, always: the focal point of this screen is the next step
           of the open project — and as long as none is open, the button in
           the empty-state card. There is no such thing as two teal surfaces
           on one screen. */
        <Button variant="secondary" icon="folder-plus" onClick={() => setDialog(true)}>
          {t('projects.new.title')}
        </Button>
      }
    />
  );

  /* Only in the tree while open: that way the fields are empty when it opens. */
  const dialogNode = !dialog ? null : (
    <NewProjectDialog
      open={dialog}
      scope={selected?.scope ?? 'work'}
      busy={mutations.create.isPending}
      error={mutations.create.error}
      onClose={() => {
        mutations.create.reset();
        setDialog(false);
      }}
      onCreate={(input) =>
        mutations.create.mutate(
          { title: input.title, scope: input.scope, status: input.status },
          {
            onSuccess: (created) => {
              setDialog(false);
              /* The first next step is a second write: `create` creates the
                 file, `patch` adds the field afterward. */
              if (input.nextStep !== null) {
                mutations.patch.mutate({
                  slug: created.slug,
                  patch: { next_step: input.nextStep },
                });
              }
              setFilter((current) => ({ ...current, scope: created.scope, query: '' }));
              go({ p: created.slug, tab: 'list' });
            },
          },
        )
      }
    />
  );

  const tabs = (
    <Tabs
      items={[
        { id: 'list', label: t('projects.tab.list'), icon: 'folder' },
        { id: 'todos', label: t('projects.tab.todos'), icon: 'circle-check-big' },
      ]}
      /* `sessions` is a tab of the detail — here the list stays lit, because
         that is what the layout below shows. */
      value={tab === 'todos' ? 'todos' : 'list'}
      onChange={(next) => go({ tab: next as Tab })}
    />
  );

  if (projects.error) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
        {dialogNode}
      </div>
    );
  }

  if (projects.isPending || projects.data === undefined) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        {tabs}
        <Skeleton lines={6} height={48} />
        {dialogNode}
      </div>
    );
  }

  if (projects.data.length === 0) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <EmptyState
          icon="folder"
          title={t('screen.projects.empty.title')}
          body={t('screen.projects.empty.body')}
          action={{
            label: t('screen.projects.empty.action'),
            icon: 'folder-plus',
            onClick: () => setDialog(true),
          }}
        />
        {dialogNode}
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      {header}
      {tabs}

      {tab === 'todos' ? (
        <AllTodos onNewProject={() => setDialog(true)} />
      ) : (
        <div className="sb-projects">
          <ProjectList
            current={list.current}
            stalled={list.stalled}
            selected={selected?.slug ?? null}
            filter={filter}
            latest={list.latest}
            stalledOpen={stalledOpen}
            onFilter={setFilter}
            onSelect={(project) => go({ p: project.slug })}
            onStalledOpen={setStalledOpen}
            onToggleFavorite={(project) =>
              mutations.patch.mutate({ slug: project.slug, patch: { favorite: !project.favorite } })
            }
            rowRef={(slug, element) => {
              if (element === null) rows.current.delete(slug);
              else rows.current.set(slug, element);
            }}
          />

          {selected === null ? (
            <p className="sb-panel-empty">{t('projects.detail.none')}</p>
          ) : detail.error ? (
            <ErrorState
              error={detail.error}
              subject={selected.title}
              variant="secondary"
              onRetry={() => void detail.refetch()}
            />
          ) : detail.data === undefined || detail.data === null ? (
            <Skeleton lines={8} height={32} />
          ) : (
            <ProjectDetail
              key={selected.slug}
              project={detail.data.project}
              doc={detail.data.doc}
              view={{
                tab:
                  tab === 'sessions' ? 'sessions' : tab === 'knowledge' ? 'knowledge' : 'overview',
                agent,
                sessionId,
                go: (next) =>
                  go({
                    tab:
                      next.tab === undefined
                        ? undefined
                        : next.tab === 'sessions'
                          ? 'sessions'
                          : next.tab === 'knowledge'
                            ? 'knowledge'
                            : 'list',
                    a: next.a,
                    s: next.s,
                  }),
              }}
            />
          )}
        </div>
      )}

      {dialogNode}
    </div>
  );
}
