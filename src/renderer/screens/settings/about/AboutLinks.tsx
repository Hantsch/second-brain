/* Project page and full changelog, opened in the system browser. */

import { CHANGELOG_URL, PROJECT_URL } from '@shared/release';
import { Button } from '../../../atoms/Button';
import { useT } from '../../../i18n';
import { api } from '../../../lib/api';

export function AboutLinks() {
  const t = useT();
  const open = (url: string) => void api.shell.openExternal(url).catch(() => undefined);

  return (
    <div className="sb-setting-block">
      <Button variant="secondary" size="sm" icon="external-link" onClick={() => open(PROJECT_URL)}>
        {t('settings.about.links.project')}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        icon="external-link"
        onClick={() => open(CHANGELOG_URL)}
      >
        {t('settings.about.links.changelog')}
      </Button>
    </div>
  );
}
