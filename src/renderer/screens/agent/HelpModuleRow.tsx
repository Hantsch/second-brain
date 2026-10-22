/* The help module as one row of the agent setup: Install and Update write it together
   with the setup files, so its state sits next to theirs. */

import type { HelpModuleState, HelpModuleStatus } from '@shared/help-module';
import { Badge } from '../../atoms/Badge';
import type { BadgeProps } from '../../atoms/Badge';
import { useT } from '../../i18n';

const STATUS_VARIANT: Record<HelpModuleStatus, NonNullable<BadgeProps['variant']>> = {
  current: 'success',
  outdated: 'warning',
  missing: 'warning',
  collision: 'danger',
};

export function HelpModuleRow({ help }: { help: HelpModuleState }) {
  const t = useT();
  return (
    <>
      <ul className="sb-setup-files" aria-label={t('settings.agent.setup.help.title')}>
        <li className="sb-setup-file">
          <span>{t('settings.agent.setup.help.title')}</span>
          <Badge variant={STATUS_VARIANT[help.status]}>
            {t(`settings.agent.setup.help.status.${help.status}`)}
          </Badge>
          {help.installedVersion !== null ? (
            <span className="sb-mono sb-setup-version">
              {`v${help.installedVersion} → v${help.shippedVersion}`}
            </span>
          ) : null}
        </li>
      </ul>
      {help.status === 'collision' ? (
        <p role="status" className="sb-note-detail sb-note-bad">
          {t('settings.agent.setup.help.collision')}
        </p>
      ) : null}
    </>
  );
}
