/* "About" tab: what's running here, where it lives, and where the keys are
   stored.

   The paragraph about the keys isn't reassurance, it's information: the
   user should know that an API key never leaves this machine and never
   travels with the vault. */

import { useQuery } from '@tanstack/react-query';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { qk } from '../../lib/queries/keys';

/** The format is explained in the vault itself: the app writes the README when creating it. */
const VAULT_README = 'README.md';

export function AboutTab() {
  const t = useT();
  const info = useQuery({ queryKey: qk.app.info(), queryFn: api.app.info });

  return (
    <>
      <Panel title={t('settings.about.title')}>
        {info.data ? (
          <div className="sb-setting-block">
            <dl className="sb-kv">
              <div>
                <dt>{t('settings.about.app')}</dt>
                <dd className="sb-mono">{t('app.name')}</dd>
              </div>
              <div>
                <dt>{t('settings.about.version')}</dt>
                <dd className="sb-mono">{info.data.version}</dd>
              </div>
              <div>
                <dt>{t('settings.about.electron')}</dt>
                <dd className="sb-mono">{info.data.electron || '—'}</dd>
              </div>
              <div>
                <dt>{t('settings.about.platform')}</dt>
                <dd className="sb-mono">{info.data.platform}</dd>
              </div>
            </dl>
            {info.data.demo ? <Badge variant="warning">{t('settings.about.demo')}</Badge> : null}
            <div className="sb-setting">
              <span className="gs-label">{t('settings.about.userData')}</span>
              <p className="sb-mono sb-vault-path">{info.data.userData}</p>
              <p className="sb-setting-example">{t('settings.about.keys')}</p>
            </div>
          </div>
        ) : (
          <Skeleton lines={4} height={20} />
        )}
      </Panel>

      <Panel title={t('settings.about.format.title')} note={t('settings.about.format.body')}>
        <div className="sb-setting-block">
          <Button
            variant="secondary"
            size="sm"
            icon="book-open"
            onClick={() => void api.shell.openPath(VAULT_README).catch(() => undefined)}
          >
            {t('settings.about.format.open')}
          </Button>
        </div>
      </Panel>
    </>
  );
}
