/* What's still unfiled: the count, and the three oldest dumps.

   The count comes from `dashboard:data` (the core counts the open dumps
   there), the titles from the inbox list. Oldest first — what's been sitting
   longest is most likely forgotten. */

import { useNavigate } from 'react-router-dom';
import { useT } from '../../i18n';
import { useInbox } from '../../lib/queries/data';
import { useDashboardData } from '../../lib/queries/dashboard';
import { plural } from '../../lib/format';
import { RelativeTime } from '../RelativeTime';
import { TileFrame } from '../TileFrame';

const LIMIT = 3;

export function InboxTile() {
  const t = useT();
  const navigate = useNavigate();
  const dashboard = useDashboardData();
  const inbox = useInbox();

  const count = dashboard.data?.inboxCount ?? 0;
  const oldest = [...(inbox.data ?? [])]
    .sort((a, b) => (a.created < b.created ? -1 : a.created > b.created ? 1 : 0))
    .slice(0, LIMIT);

  return (
    <TileFrame
      id="inbox"
      title={t('module.inbox.name')}
      count={count > 0 ? count : null}
      pending={dashboard.isPending}
      error={dashboard.error}
      onRetry={() => void dashboard.refetch()}
      isEmpty={count === 0}
      empty={{
        body: t('tile.inbox.empty'),
        action: {
          label: t('screen.dashboard.empty.action'),
          onClick: () => void navigate('/capture'),
        },
      }}
      foot={
        <button
          type="button"
          className="sb-textlink"
          onClick={() => void navigate('/notes?filter=unfiled')}
        >
          {t('tile.inbox.open')}
        </button>
      }
    >
      <p className="sb-tile-lead">{plural(count, 'tile.inbox.countOne', 'tile.inbox.countMany')}</p>
      <ul className="sb-lines">
        {oldest.map((dump) => (
          <li key={dump.path} className="sb-line">
            <button
              type="button"
              className="sb-line-open sb-line-name--full"
              onClick={() => void navigate('/notes?filter=unfiled')}
            >
              {dump.title}
            </button>
            <RelativeTime at={dump.created} className="sb-line-meta" />
          </li>
        ))}
      </ul>
    </TileFrame>
  );
}
