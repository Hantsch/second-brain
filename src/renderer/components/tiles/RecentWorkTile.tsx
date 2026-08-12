/* „Woran habe ich zuletzt gearbeitet?" — die erste der drei Fragen.

   Die Spur kommt gemischt aus dem Hauptprozess: Dateiänderungen, Claude-Sessions,
   Tageseinträge und aufgenommene Quellen, neueste zuerst. Der Klick führt dorthin,
   wo weitergearbeitet wird: ins Projekt, wenn eines dranhängt, sonst in die Datei.

   Sitzungen haben keinen Pfad im Vault (die Verlaufsdatei liegt außerhalb). Hängt
   auch kein Projekt dran, bleibt die Zeile Text — ein Klick, der nichts öffnet,
   wäre eine Behauptung. */

import { useNavigate } from 'react-router-dom';
import type { RecentWorkItem } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { useDashboardData } from '../../lib/queries/dashboard';
import { RelativeTime } from '../RelativeTime';
import { TileFrame } from '../TileFrame';

/** So viele Zeilen: genug für einen Überblick, wenig genug zum Lesen. */
const LIMIT = 5;

const KIND_ICONS: Record<RecentWorkItem['kind'], string> = {
  file: 'file-text',
  'claude-session': 'workflow',
  journal: 'notebook-pen',
  ingest: 'download',
};

export function RecentWorkTile() {
  const t = useT();
  const navigate = useNavigate();
  const { data, isPending, error, refetch } = useDashboardData();
  const all = data?.recentWork ?? [];
  const rows = all.slice(0, LIMIT);

  const open = (item: RecentWorkItem): void => {
    if (item.project !== null) {
      void navigate(`/projects?p=${encodeURIComponent(item.project)}`);
      return;
    }
    if (item.path !== null) void api.shell.openPath(item.path).catch(() => undefined);
  };

  return (
    <TileFrame
      id="recent-work"
      title={t('module.recent-work.name')}
      pending={isPending}
      error={error}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      empty={{
        body: t('tile.recent.empty'),
        action: {
          label: t('screen.dashboard.empty.action'),
          onClick: () => void navigate('/capture'),
        },
      }}
      foot={
        all.length > LIMIT ? (
          <span className="sb-tile-rest sb-mono">
            {t('tile.more', { count: all.length - LIMIT })}
          </span>
        ) : undefined
      }
    >
      <ul className="sb-lines">
        {rows.map((item, index) => {
          const target = item.project !== null || item.path !== null;
          return (
            <li key={`${item.at}-${item.title}-${index}`} className="sb-line">
              <span className="sb-line-icon" aria-hidden="true">
                <Icon name={KIND_ICONS[item.kind]} size={13} />
              </span>
              {target ? (
                <button type="button" className="sb-line-open" onClick={() => open(item)}>
                  {item.title}
                </button>
              ) : (
                <span className="sb-line-name">{item.title}</span>
              )}
              <span className="sb-line-detail">{item.detail}</span>
              <RelativeTime at={item.at} className="sb-line-meta" />
            </li>
          );
        })}
      </ul>
    </TileFrame>
  );
}
