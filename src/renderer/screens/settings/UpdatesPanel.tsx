/* The "Updates" panel in the About tab: what the last check found, and a
   button to run one. A failed check is only ever shown here, on request —
   nothing in the app announces it by itself. */

import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { useUpdateState } from '../../lib/queries/update';
import { UpdateCheckRow } from './about/UpdateCheckRow';

export function UpdatesPanel() {
  const t = useT();
  const data = useUpdateState().data;

  return (
    <Panel title={t('settings.about.updates.title')}>
      {data ? (
        <div className="sb-setting-block">
          <UpdateCheckRow state={data} />
          <dl className="sb-kv">
            <div>
              <dt>{t('settings.about.updates.distribution')}</dt>
              <dd>{t(`settings.about.updates.distribution.${data.distribution}`)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <Skeleton lines={3} height={20} />
      )}
    </Panel>
  );
}
