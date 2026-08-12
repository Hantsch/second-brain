/* Was noch unsortiert liegt: die Zahl, und die drei ältesten Dumps.

   Die Zahl kommt aus `dashboard:data` (dort zählt der Kern die offenen Dumps),
   die Titel aus der Inbox-Liste. Ältester zuerst — was am längsten liegt, ist am
   ehesten vergessen. */

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
        <button type="button" className="sb-textlink" onClick={() => void navigate('/inbox')}>
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
              onClick={() => void navigate('/inbox')}
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
