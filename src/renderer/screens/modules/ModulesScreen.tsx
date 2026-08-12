/* Modules — the knowledge, made visible.

   Two views in one screen: the overview with one card per module, and the
   detail view with pages, graph, sources, and log. Which one applies is
   held in the address (`#/modules?m=<slug>`), so a reference from outside —
   from a citation, from maintenance, from the command palette — can lead
   directly into a page.

   The overview's focal point is "create module": without a module there's
   nothing to read here. In the detail view, the teal belongs to saving a page. */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { useModules } from '../../lib/queries/data';
import { useModuleMutations } from '../../lib/queries/modules';
import { CreateModuleDialog } from './CreateModuleDialog';
import { ModuleCards } from './ModuleCards';
import { MODULE_TABS, ModuleDetail } from './ModuleDetail';
import type { ModuleTab } from './ModuleDetail';

function isTab(value: string | null): value is ModuleTab {
  return value !== null && (MODULE_TABS as readonly string[]).includes(value);
}

export function ModulesScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useModules();
  const mutations = useModuleMutations();
  const [dialog, setDialog] = useState(false);

  const wanted = params.get('m');
  const tab = isTab(params.get('tab')) ? (params.get('tab') as ModuleTab) : 'pages';
  const page = params.get('p');
  const modules = data ?? [];
  const current = wanted === null ? null : (modules.find((entry) => entry.slug === wanted) ?? null);

  /** The address is the state: a target that doesn't exist is never invented. */
  const go = (next: { m?: string | null; tab?: ModuleTab; p?: string | null }): void => {
    const merged = new URLSearchParams();
    const slug = next.m === undefined ? wanted : next.m;
    const wantedTab = next.tab ?? tab;
    const wantedPage = next.p === undefined ? page : next.p;
    if (slug !== null) merged.set('m', slug);
    if (slug !== null && wantedTab !== 'pages') merged.set('tab', wantedTab);
    if (slug !== null && wantedPage !== null && wantedTab === 'pages') merged.set('p', wantedPage);
    setParams(merged, { replace: true });
  };

  const header = (
    <ScreenHeader
      overline={t('screen.modules.overline')}
      title={current === null ? t('screen.modules.title') : current.title}
      action={
        current === null ? (
          /* Secondary: a create action in the header is never the one teal
             focal point of the screen — that belongs to the module tiles
             themselves here (the same reasoning as "capture a thought" on
             the dashboard, "save" on the capture screen, "check again" in
             maintenance). */
          <Button variant="secondary" icon="plus" onClick={() => setDialog(true)}>
            {t('modules.create.action')}
          </Button>
        ) : undefined
      }
    />
  );

  const dialogNode = (
    <CreateModuleDialog
      open={dialog}
      busy={mutations.create.isPending}
      error={mutations.create.error}
      onClose={() => {
        mutations.create.reset();
        setDialog(false);
      }}
      onCreate={(input) =>
        mutations.create.mutate(input, {
          onSuccess: (created) => {
            setDialog(false);
            go({ m: created.slug, tab: 'pages', p: null });
          },
        })
      }
    />
  );

  if (error) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <ErrorState error={error} onRetry={() => void refetch()} />
        {dialogNode}
      </div>
    );
  }

  if (isPending || data === undefined) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <Skeleton lines={4} height={44} />
        {dialogNode}
      </div>
    );
  }

  if (modules.length === 0) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <EmptyState
          icon="network"
          title={t('screen.modules.empty.title')}
          body={t('screen.modules.empty.body')}
          action={{
            label: t('screen.modules.empty.action'),
            icon: 'plus',
            onClick: () => setDialog(true),
          }}
        />
        {dialogNode}
      </div>
    );
  }

  if (current !== null) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <ModuleDetail
          key={current.slug}
          module={current}
          tab={tab}
          page={page}
          onTab={(next) => go({ tab: next })}
          onPage={(next) => go({ tab: 'pages', p: next })}
          onBack={() => go({ m: null, tab: 'pages', p: null })}
        />
        {dialogNode}
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide">
      {header}
      {/* No second frame titled "modules": that already sits in the header.
          The counter appears here as a mono number, like "5 dumps" in the
          inbox or "9 projects" in projects. */}
      <p className="sb-modules-count sb-mono">
        {plural(modules.length, 'modules.countOne', 'modules.count')}
      </p>
      <ModuleCards modules={modules} onOpen={(slug) => go({ m: slug, tab: 'pages', p: null })} />
      {dialogNode}
    </div>
  );
}
