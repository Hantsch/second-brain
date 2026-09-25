/* Knowledge — the vault's knowledge, made visible.

   The screen is the root of everything that has to do with knowledge: one
   tab per way in. `modules` shows the wikis, `sources` is the workbench that
   feeds them. With a module in the address it steps back completely — the
   module's own tabs (pages, graph, sources, log) take over the screen.

   The state is held in the address, so a reference from outside — from a
   citation, from maintenance, from the command palette — can lead directly
   into a page.

   The overview's focal point is "create module": without a module there's
   nothing to read here. In the detail view, the teal belongs to saving a page. */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { Tabs } from '../../atoms/Tabs';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { useModules, useVaultStatus } from '../../lib/queries/data';
import { useModuleMutations } from '../../lib/queries/modules';
import { SourcesTab } from '../sources/SourcesTab';
import { CreateModuleDialog } from './CreateModuleDialog';
import { MODULE_TABS, ModuleDetail } from './ModuleDetail';
import type { ModuleTab } from './ModuleDetail';
import { ModulesTab } from './ModulesTab';

const KNOWLEDGE_TABS = ['modules', 'sources'] as const;

/** The screen's own tab — it only exists while no module is open. */
type KnowledgeTab = (typeof KNOWLEDGE_TABS)[number];

const KNOWLEDGE_TAB_ICONS: Record<KnowledgeTab, string> = {
  modules: 'network',
  sources: 'download',
};

function isModuleTab(value: string | null): value is ModuleTab {
  return value !== null && (MODULE_TABS as readonly string[]).includes(value);
}

function isKnowledgeTab(value: string | null): value is KnowledgeTab {
  return value !== null && (KNOWLEDGE_TABS as readonly string[]).includes(value);
}

export function ModulesScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const { data, error, isPending, refetch } = useModules();
  const vault = useVaultStatus();
  const mutations = useModuleMutations();
  const [dialog, setDialog] = useState(false);

  const wanted = params.get('m');
  const requested = params.get('tab');
  /* `tab` means two different things, told apart strictly by `m`: with a
     module in the address it names the module's tab, without it the screen's.
     `sources` is a legal value in both sets — read in the wrong namespace it
     would silently open the wrong view. */
  const moduleTab: ModuleTab = wanted !== null && isModuleTab(requested) ? requested : 'pages';
  const screenTab: KnowledgeTab =
    wanted === null && isKnowledgeTab(requested) ? requested : 'modules';
  const page = params.get('p');
  const modules = data ?? [];
  const current = wanted === null ? null : (modules.find((entry) => entry.slug === wanted) ?? null);

  /* `into` seeds the target-module picker on the sources tab — a seed, not
     state: inside the tab the user may pick something else, and the then
     stale `into` in the address is simply ignored. A slug that names no
     module falls back to "file later"; nothing is invented here either. */
  const into = params.get('into');
  const seed = into === null ? null : (modules.find((entry) => entry.slug === into)?.slug ?? null);
  /* Until the list is loaded the slug cannot be checked, and seeding from an
     unresolved list would silently start the picker on "file later" — so the
     tab waits for it. Not while the index is being built, though: `useModules`
     is disabled for as long as that runs, so the wait would park the workbench
     behind a skeleton that has nothing to wait for — and a vault that is still
     indexing is exactly the one whose sources tab someone opens. */
  const indexing = vault.data?.indexing === true;
  const seedPending = !indexing && into !== null && data === undefined && error === null;

  /** The address is the state: a target that doesn't exist is never invented. */
  const go = (next: {
    m?: string | null;
    tab?: ModuleTab;
    screenTab?: KnowledgeTab;
    p?: string | null;
  }): void => {
    const merged = new URLSearchParams();
    const slug = next.m === undefined ? wanted : next.m;
    if (slug === null) {
      /* Knowledge root: `tab` is the screen's, the default stays out of the
         address, and `p` names a page inside a module — there is none here. */
      const wantedTab = next.screenTab ?? screenTab;
      if (wantedTab !== 'modules') merged.set('tab', wantedTab);
      /* The seed belongs to the sources tab alone: it survives a move within
         that tab and is dropped everywhere else — in a module's address it
         would read as "sources of this module" and mean nothing. */
      if (wantedTab === 'sources' && into !== null) merged.set('into', into);
    } else {
      const wantedTab = next.tab ?? moduleTab;
      const wantedPage = next.p === undefined ? page : next.p;
      merged.set('m', slug);
      if (wantedTab !== 'pages') merged.set('tab', wantedTab);
      if (wantedPage !== null && wantedTab === 'pages') merged.set('p', wantedPage);
    }
    setParams(merged, { replace: true });
  };

  const header = (
    <ScreenHeader
      overline={t('screen.knowledge.overline')}
      title={current === null ? t('screen.knowledge.title') : current.title}
      action={
        current === null ? (
          /* Secondary: a create action in the header is never the one teal
             focal point of the screen — that belongs to the module tiles
             themselves here (the same reasoning as "capture a thought" on
             the dashboard, "save" on the capture screen, "check again" in
             maintenance). It stays on the sources tab too: a source wants a
             target module, and this is the shortest way to one. */
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

  const frame = (body: ReactNode) => (
    <div className="sb-screen sb-screen--wide">
      {header}
      {body}
      {dialogNode}
    </div>
  );

  if (wanted !== null) {
    /* A module is addressed. It brings its own tab bar, so the screen shows
       none — and until the list is there the slug cannot be resolved, which
       makes loading and failure part of this path, not of a tab. */
    if (error) return frame(<ErrorState error={error} onRetry={() => void refetch()} />);

    if (isPending || data === undefined) return frame(<Skeleton lines={4} height={44} />);

    if (current !== null) {
      return frame(
        <ModuleDetail
          key={current.slug}
          module={current}
          tab={moduleTab}
          page={page}
          onTab={(next) => go({ tab: next })}
          onPage={(next) => go({ tab: 'pages', p: next })}
          onBack={() => go({ m: null, screenTab: 'modules' })}
          onRenamed={(newSlug) => go({ m: newSlug, tab: 'pages', p: null })}
          onDeleted={() => go({ m: null, screenTab: 'modules' })}
        />,
      );
    }
    /* The slug names no module: nothing is invented, the root takes over. */
  }

  return frame(
    <>
      <Tabs
        items={KNOWLEDGE_TABS.map((id) => ({
          id,
          label: t(`knowledge.tab.${id}`),
          icon: KNOWLEDGE_TAB_ICONS[id],
        }))}
        value={screenTab}
        onChange={(id) => {
          if (isKnowledgeTab(id)) go({ m: null, screenTab: id });
        }}
      />
      {screenTab === 'sources' ? (
        seedPending ? (
          <Skeleton lines={4} height={44} />
        ) : (
          /* The key is the seed: a new `into` remounts the tab and reseeds
             the picker, while a choice made inside the tab survives every
             re-render — no effect overwrites the user's input. */
          <SourcesTab key={`into:${seed ?? ''}`} initialModule={seed} />
        )
      ) : (
        <ModulesTab
          onOpen={(slug) => go({ m: slug, tab: 'pages', p: null })}
          onCreate={() => setDialog(true)}
        />
      )}
    </>,
  );
}
