/* Dashboard — verschiebbare Module.

   Der Screen selbst hält nur zusammen: Kopfzeile mit der Zusammenfassung des
   Tages, das Gitter, die Auswahl der Module. Die drei Fragen aus CLAUDE.md
   beantworten die Kacheln (`components/tiles/`), das Verschieben macht
   `TileGrid`, gerechnet wird im Hauptprozess.

   Vier Zustände, alle ausdrücklich:
   - **Kein Vault** → dafür sorgt die Hülle (`App.tsx`).
   - **Lädt** → die Anordnung fehlt noch; die Kacheln zeigen ihre Platzhalter.
   - **Leer** → nichts im Vault: dann steht hier die Karte, die sagt, was kommt.
   - **Fehler** → die Anordnung ließ sich nicht laden; das Gitter wäre geraten.

   Ein Fokuspunkt: „Gedanken erfassen" rechts oben. Die Auswahl der Module steht
   daneben und bleibt ruhig. */

import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DashboardLayout, DashboardModuleId } from '@shared/types';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { TileCatalog } from '../../components/TileCatalog';
import { UnfiledStrip } from '../../components/UnfiledStrip';
import { useT } from '../../i18n';
import {
  useDashboardData,
  useDashboardLayout,
  useReminders,
  useSaveLayout,
} from '../../lib/queries/dashboard';
import { DaySummary } from './DaySummary';
import { TileGrid } from './TileGrid';
import { defaultLayout, setTileHidden, visibleTiles } from './layout';
import { renderTile } from './tiles';

export function DashboardScreen() {
  const t = useT();
  const navigate = useNavigate();
  const layout = useDashboardLayout();
  const data = useDashboardData();
  const reminders = useReminders();
  const save = useSaveLayout();
  const [catalog, setCatalog] = useState(false);
  const [focus, setFocus] = useState<{ id: DashboardModuleId; nonce: number } | null>(null);

  const store = useCallback((next: DashboardLayout) => save.mutate(next), [save]);

  const header = (
    <ScreenHeader
      overline={t('screen.dashboard.overline')}
      title={t('screen.dashboard.title')}
      action={
        <>
          <Button variant="secondary" icon="layout-dashboard" onClick={() => setCatalog(true)}>
            {t('dashboard.catalog.open')}
          </Button>
          <Button icon="zap" onClick={() => void navigate('/capture')}>
            {t('screen.dashboard.empty.action')}
          </Button>
        </>
      }
    />
  );

  if (layout.error) {
    return (
      <div className="sb-screen">
        {header}
        <ErrorState
          error={layout.error}
          variant="secondary"
          onRetry={() => void layout.refetch()}
        />
      </div>
    );
  }

  /* Ein wirklich leerer Vault: nichts zu zeigen, also die Karte, die sagt, was
     hier erscheinen wird. Erst wenn die Inhalte geladen haben — vorher wüsste
     niemand, ob der Vault leer ist oder die Abfrage noch läuft. */
  const content = data.data;
  const empty =
    content !== undefined &&
    content.recentWork.length === 0 &&
    content.todos.work.length === 0 &&
    content.todos.private.length === 0 &&
    content.waitingOn.length === 0 &&
    content.reminders.length === 0 &&
    content.sessions.length === 0 &&
    content.inboxCount === 0 &&
    content.journal.lastEntry === null;

  if (empty) {
    return (
      <div className="sb-screen">
        {header}
        <EmptyState
          icon="layout-dashboard"
          title={t('screen.dashboard.empty.title')}
          body={t('screen.dashboard.empty.body')}
          action={{
            label: t('screen.dashboard.empty.action'),
            icon: 'zap',
            onClick: () => void navigate('/capture'),
          }}
        />
      </div>
    );
  }

  if (layout.data === undefined) {
    return (
      <div className="sb-screen">
        {header}
        <Skeleton lines={4} height={120} />
      </div>
    );
  }

  const current = layout.data;
  const visible = new Set(visibleTiles(current).map((tile) => tile.id));

  return (
    <div className="sb-screen">
      {header}
      <DaySummary
        reminders={reminders.data ?? []}
        visible={visible}
        onJump={(id) => setFocus({ id, nonce: Date.now() })}
      />
      <UnfiledStrip count={data.data?.inboxCount ?? 0} />
      {visible.size === 0 ? (
        <EmptyState
          icon="layout-dashboard"
          title={t('dashboard.catalog.title')}
          body={t('dashboard.tiles.empty')}
          action={{ label: t('dashboard.catalog.open'), onClick: () => setCatalog(true) }}
        />
      ) : (
        <TileGrid layout={current} onSave={store} render={renderTile} focus={focus} />
      )}
      <TileCatalog
        open={catalog}
        layout={current}
        onToggle={(id, shown) => store(setTileHidden(current, id, !shown))}
        onReset={() => store(defaultLayout(current.updated))}
        onClose={() => setCatalog(false)}
      />
    </div>
  );
}
