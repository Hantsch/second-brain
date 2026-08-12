/* Projekte — der Screen, der „wo war ich stehengeblieben?" beantwortet.

   Zwei Spalten: links die Liste, rechts das Detail. Ausgewählt ist beim Öffnen
   das Projekt mit der jüngsten Spur — die Antwort steht also da, bevor jemand
   klickt.

   Zwei Ansichten, ein Screen: „Projekte" und „Alle Todos". Die Todos bekommen
   keinen eigenen Rail-Platz (die Rail hat zehn feste) und keinen eigenen Screen,
   weil sie dieselbe Frage aus der anderen Richtung beantworten — und weil man
   von einem Todo aus regelmäßig ins Projekt springt. Beides in einem Screen hält
   diesen Sprung bei einem Klick.

   Was ausgewählt und welche Ansicht offen ist, steht in der Adresse
   (`#/projects?p=<slug>&tab=todos`): so führt ein Verweis von außen — Dashboard,
   Pflege, Befehlspalette — direkt in ein Projekt.

   Tastatur: j/k und Pfeile wählen, Enter öffnet die Datei, n legt ein Projekt
   an, t öffnet das Feld für ein Todo, x hakt das fokussierte Todo ab. */

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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

type Tab = 'list' | 'todos';

export function ProjectsScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const projects = useAllProjects();
  const mutations = useProjectMutations();

  const [filter, setFilter] = useState<ProjectFilter>(DEFAULT_FILTER);
  const [stalledOpen, setStalledOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const rows = useRef(new Map<string, HTMLButtonElement>());

  const tab: Tab = params.get('tab') === 'todos' ? 'todos' : 'list';
  const wanted = params.get('p');
  const list = visibleProjects(projects.data ?? [], filter);
  /* Die Auswahl hängt am Slug. Ist er weggefiltert oder gelöscht, gilt die
     jüngste Spur — nie ein leeres Detail neben einer gefüllten Liste. */
  const selected = list.all.find((project) => project.slug === wanted) ?? list.all[0] ?? null;
  const index = selected === null ? -1 : list.all.indexOf(selected);
  const detail = useProject(selected?.slug ?? null);

  const go = useCallback(
    (next: { p?: string | null; tab?: Tab }) => {
      const merged = new URLSearchParams();
      const slug = next.p === undefined ? wanted : next.p;
      const view = next.tab ?? tab;
      if (slug !== null && slug.length > 0) merged.set('p', slug);
      if (view === 'todos') merged.set('tab', view);
      setParams(merged, { replace: true });
    },
    [setParams, tab, wanted],
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
        /* Sekundär, immer: der Fokuspunkt dieses Screens ist der nächste Schritt
           des offenen Projekts — und solange keines offen ist, der Knopf in der
           Leerzustandskarte. Zwei Teal-Flächen auf einer Fläche gibt es nicht. */
        <Button variant="secondary" icon="folder-plus" onClick={() => setDialog(true)}>
          {t('projects.new.title')}
        </Button>
      }
    />
  );

  /* Nur im offenen Zustand im Baum: so sind die Felder beim Öffnen leer. */
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
              /* Der erste nächste Schritt ist ein zweiter Schreibvorgang: `create`
                 legt die Datei an, `patch` trägt das Feld nach. */
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
      value={tab}
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
            grouped={list.grouped}
            stalledOpen={stalledOpen}
            onFilter={setFilter}
            onSelect={(project) => go({ p: project.slug })}
            onStalledOpen={setStalledOpen}
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
            />
          )}
        </div>
      )}

      {dialogNode}
    </div>
  );
}
