/* The release that is offered but not installed. It is its own block, away
   from the running version's notes, so the two can never be read as one. Only
   a real offer renders it; every other state leaves nothing behind. */

import { Badge } from '../../../atoms/Badge';
import { Panel } from '../../../components/Panel';
import { UpdateAction } from '../../../components/update/UpdateAction';
import { useT } from '../../../i18n';
import { useUpdateState } from '../../../lib/queries/update';
import { ReleaseNotesBody } from './ReleaseNotesBody';

export function PendingUpdateBlock() {
  const t = useT();
  const state = useUpdateState().data;
  if (!state || state.status !== 'available' || !state.update) return null;

  const notes = state.update.notes.trim();
  return (
    <Panel title={t('settings.about.update.pending.title')}>
      <div className="sb-setting-block" data-testid="about-pending-update">
        <p>
          <span className="sb-mono" data-testid="about-pending-version">
            {state.update.version}
          </span>{' '}
          <Badge variant="warning">{t('settings.about.update.pending.badge')}</Badge>
        </p>
        {notes.length > 0 ? (
          <ReleaseNotesBody markdown={notes} />
        ) : (
          <p>{t('settings.about.notes.empty.title')}</p>
        )}
        <UpdateAction state={state} />
      </div>
    </Panel>
  );
}
