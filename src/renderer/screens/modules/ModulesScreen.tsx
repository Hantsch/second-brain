/* Module — das Wissen, sichtbar gemacht.

   Zwei Ansichten in einem Screen: die Übersicht mit einer Karte je Modul und das
   Detail mit Seiten, Graph, Quellen und Chronik. Welche gilt, steht in der
   Adresse (`#/modules?m=<slug>`), damit ein Verweis von außen — aus einem Beleg,
   aus der Pflege, aus der Befehlspalette — direkt in eine Seite führen kann.

   Der Fokuspunkt der Übersicht ist „Modul anlegen": ohne Modul gibt es hier
   nichts zu lesen. Im Detail gehört das Teal dem Speichern einer Seite. */

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

  /** Die Adresse ist der Zustand: ein Ziel, das nicht existiert, wird nicht erfunden. */
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
          /* Sekundär: eine Anlegen-Aktion in der Kopfzeile ist nie der eine
             Teal-Fokuspunkt des Screens — der gehört hier den Modul-Kacheln
             selbst (dieselbe Zeile wie bei „Gedanken erfassen" im Dashboard,
             „Speichern" im Erfassen-Screen, „Neu prüfen" in der Pflege). */
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
      {/* Kein zweiter Rahmen mit dem Titel „Module": der steht schon in der
          Kopfzeile. Der Zähler steht als Mono-Zahl hier, wie „5 Dumps" in der
          Inbox oder „9 Projekte" bei den Projekten. */}
      <p className="sb-modules-count sb-mono">
        {plural(modules.length, 'modules.countOne', 'modules.count')}
      </p>
      <ModuleCards modules={modules} onOpen={(slug) => go({ m: slug, tab: 'pages', p: null })} />
      {dialogNode}
    </div>
  );
}
