/* Ein Modul von innen: Seiten, Graph, Quellen, Chronik.

   Der Zustand steht in der Adresse (`#/knowledge?m=<slug>&p=<pfad>&tab=graph`).
   Damit ist jede Seite verlinkbar — aus dem Graphen, aus der Chronik, aus einem
   Beleg —, und der Rückweg des Browsers funktioniert.

   Ein Wikilink trägt nur einen Slug. Aufgelöst wird er hier gegen die Seiten des
   Moduls: gibt es das Ziel, wird es geöffnet; gibt es es nicht, war es schon in
   der Anzeige als fehlend markiert und der Klick tut nichts. */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { KnowledgeModule, WikiPage, WikiPageType } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Tabs } from '../../atoms/Tabs';
import { ErrorState } from '../../components/ErrorState';
import { PageList } from '../../components/PageList';
import { Skeleton } from '../../components/Skeleton';
import { WikiGraph } from '../../components/WikiGraph';
import { useT, useLanguage } from '../../i18n';
import { api } from '../../lib/api';
import { formatDate, plural } from '../../lib/format';
import {
  useModuleGraph,
  useModuleLog,
  useModulePage,
  useModulePages,
  useModuleSources,
} from '../../lib/queries/modules';
import { ModuleActions } from './ModuleActions';
import { ModuleCondensedTab } from './ModuleCondensedTab';
import { ModuleLog } from './ModuleLog';
import { PageView } from './PageView';
import { SourceRow } from '../sources/SourceRow';
import { SourceDetailDialog } from '../sources/SourceDetailDialog';

export const MODULE_TABS = ['pages', 'graph', 'sources', 'log', 'condensed'] as const;

export type ModuleTab = (typeof MODULE_TABS)[number];

const TAB_ICONS: Record<ModuleTab, string> = {
  pages: 'file-text',
  graph: 'network',
  sources: 'download',
  log: 'history',
  condensed: 'layers',
};

export interface ModuleDetailProps {
  module: KnowledgeModule;
  tab: ModuleTab;
  /** Pfad der gewählten Seite, oder null. */
  page: string | null;
  onTab: (tab: ModuleTab) => void;
  onPage: (path: string | null) => void;
  onBack: () => void;
  /** Runs after a confirmed rename (063, D5), with the module's slug afterwards. */
  onRenamed: (newSlug: string) => void;
  /** Runs after a confirmed delete (063, D6) — the module no longer exists. */
  onDeleted: () => void;
}

/** Kennung einer Seite im Graphen und in `outbound`/`inbound`: `modul/slug`. */
function idOf(page: WikiPage): string {
  return `${page.module}/${page.slug}`;
}

/** Ein Wikilink-Ziel auf einen Pfad abbilden; `null`, wenn es die Seite nicht gibt. */
function pathOf(pages: readonly WikiPage[], module: string, target: string): string | null {
  const slug = target.includes('/') ? (target.split('/').pop() ?? target) : target;
  const scope = target.includes('/') ? target.slice(0, target.lastIndexOf('/')) : module;
  return pages.find((entry) => entry.module === scope && entry.slug === slug)?.path ?? null;
}

function countOf(pages: readonly WikiPage[], type: WikiPageType): number {
  return pages.filter((entry) => entry.type === type).length;
}

export function ModuleDetail({
  module,
  tab,
  page,
  onTab,
  onPage,
  onBack,
  onRenamed,
  onDeleted,
}: ModuleDetailProps) {
  const t = useT();
  const language = useLanguage();
  const navigate = useNavigate();
  const pages = useModulePages(module.slug);
  const graph = useModuleGraph(tab === 'graph' ? module.slug : null);
  const sources = useModuleSources(tab === 'sources' ? module.slug : null);
  const log = useModuleLog(tab === 'log' ? module.slug : null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  /* Eine stabile Liste: sonst rechnet jeder Rendervorgang Graph-Kennungen neu. */
  const known = useMemo(() => pages.data ?? [], [pages.data]);
  const current = useModulePage(page);

  const exists = useMemo(() => {
    const ids = new Set(known.map(idOf));
    const slugs = new Set(known.map((entry) => entry.slug));
    return (target: string): boolean =>
      target.includes('/')
        ? ids.has(target)
        : slugs.has(target) || ids.has(`${module.slug}/${target}`);
  }, [known, module.slug]);

  /** Die gelesene Seite als Graph-Kennung — sie wird dort hervorgehoben. */
  const activeId = useMemo(() => {
    if (page === null) return null;
    const found = known.find((entry) => entry.path === page);
    return found === undefined ? null : idOf(found);
  }, [known, page]);

  const openTarget = (target: string): void => {
    const path = pathOf(known, module.slug, target);
    if (path !== null) onPage(path);
  };

  /* The shortest way from "a source is missing here" to the workbench:
     `into` preseeds the target module there. No state of its own — the
     address carries it. */
  const takeInSource = (): void => {
    void navigate(`/knowledge?tab=sources&into=${encodeURIComponent(module.slug)}`);
  };

  const items = MODULE_TABS.map((id) => ({
    id,
    label: t(`modules.tab.${id}`),
    icon: TAB_ICONS[id],
    ...(id === 'pages' ? { count: known.length } : {}),
  }));

  return (
    <div className="sb-moduledetail">
      <div className="sb-moduledetail-head">
        <div className="sb-moduledetail-headrow">
          <Button variant="ghost" size="sm" icon="chevron-left" onClick={onBack}>
            {t('modules.back')}
          </Button>
          <ModuleActions module={module} onRenamed={onRenamed} onDeleted={onDeleted} />
        </div>
        {/* Der Modultitel steht im Kopf des Screens — hier wäre er ein Echo. */}
        <div className="sb-moduledetail-title">
          <p className="sb-empty-body">
            {module.description.trim().length === 0
              ? t('modules.noDescription')
              : module.description}
          </p>
          <span className="sb-moduledetail-meta">
            <span className="sb-mono">
              {t('modules.counts', {
                sources: countOf(known, 'source'),
                entities: countOf(known, 'entity'),
                concepts: countOf(known, 'concept'),
              })}
            </span>
            <span className="sb-mono">
              {module.lastIngest === null
                ? t('modules.neverIngested')
                : t('modules.lastIngest', { date: formatDate(module.lastIngest, language) })}
            </span>
            {module.findingCount === 0 ? null : (
              <Badge variant="warning">
                {plural(module.findingCount, 'modules.findingsOne', 'modules.findings')}
              </Badge>
            )}
          </span>
        </div>
      </div>

      <Tabs items={items} value={tab} onChange={(id) => onTab(id as ModuleTab)} />

      {tab === 'pages' ? (
        pages.error ? (
          <ErrorState error={pages.error} onRetry={() => void pages.refetch()} />
        ) : pages.isPending ? (
          <Skeleton lines={5} height={40} />
        ) : (
          <div className="sb-modulepages">
            <PageList pages={known} selected={page} onSelect={(path) => onPage(path)} />
            <div className="sb-modulepage">
              {page === null ? (
                <div className="sb-modulepage-hint">
                  <h2 className="sb-empty-title">{t('pages.choose')}</h2>
                  <p className="sb-empty-body">{t('pages.chooseBody')}</p>
                </div>
              ) : current.error ? (
                <ErrorState
                  error={current.error}
                  subject={page}
                  onRetry={() => void current.refetch()}
                />
              ) : current.isPending || current.data === undefined ? (
                <Skeleton lines={6} height={20} />
              ) : current.data === null ? (
                <p className="sb-panel-empty">{t('error.code.not-found')}</p>
              ) : (
                <PageView
                  key={page}
                  page={current.data.page}
                  doc={current.data.doc}
                  pages={known}
                  onOpenTarget={openTarget}
                  onReload={() => void current.refetch()}
                />
              )}
            </div>
          </div>
        )
      ) : null}

      {tab === 'graph' ? (
        graph.error ? (
          <ErrorState error={graph.error} onRetry={() => void graph.refetch()} />
        ) : graph.isPending || graph.data === undefined ? (
          <Skeleton lines={4} height={40} />
        ) : (
          <div className="sb-graphwrap">
            <p className="sb-row-meta">
              <span className="sb-mono">
                {t('graph.meta', {
                  nodes: graph.data.nodes.length,
                  edges: graph.data.edges.length,
                })}
              </span>
            </p>
            <WikiGraph
              nodes={graph.data.nodes}
              edges={graph.data.edges}
              active={activeId}
              onOpen={openTarget}
            />
          </div>
        )
      ) : null}

      {tab === 'sources' ? (
        sources.error ? (
          <ErrorState error={sources.error} onRetry={() => void sources.refetch()} />
        ) : sources.isPending || sources.data === undefined ? (
          <Skeleton lines={3} height={40} />
        ) : (
          <div className="sb-modulesources">
            {sources.data.length === 0 ? (
              <p className="sb-panel-empty">{t('modules.sourcesTab.empty')}</p>
            ) : (
              <ul className="sb-rows">
                {sources.data.map((source) => (
                  <SourceRow
                    key={source.path}
                    source={source}
                    onOpen={setSelectedSource}
                    onOpenPage={openTarget}
                  />
                ))}
              </ul>
            )}
            {/* Visible in both states — most urgently in the empty one.
                Secondary: the teal belongs to the source rows here and to
                "take in" over there, not to this shortcut. */}
            <Button variant="secondary" icon="download" onClick={takeInSource}>
              {t('modules.sourcesTab.ingest')}
            </Button>
          </div>
        )
      ) : null}

      {tab === 'log' ? (
        <ModuleLog
          doc={log.data}
          pending={log.isPending}
          error={log.error}
          onRetry={() => void log.refetch()}
          onOpenTarget={openTarget}
          exists={exists}
        />
      ) : null}

      {tab === 'condensed' ? <ModuleCondensedTab module={module} /> : null}

      <SourceDetailDialog
        key={selectedSource ?? 'closed'}
        path={selectedSource}
        modules={[module]}
        jobs={[]}
        onClose={() => setSelectedSource(null)}
        onOpenRaw={(path) => void api.shell.showInFolder(path).catch(() => undefined)}
        onOpenPage={(sourcePage) => openTarget(sourcePage)}
      />
    </div>
  );
}
