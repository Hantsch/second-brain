/* Tray switches: whether closing the window quits the app or sends it to the
   tray, and whether it starts hidden there right away.

   Both go through `settings:setApp`, not `settings:setVault` — these are
   app-level settings (`AppSettings`, machine-bound), not vault fields. That's
   why this panel lives in the Customization tab, which already renders
   without an open vault, instead of the Behavior tab, which shows an empty
   state without one (058, decision D-j).

   Like the Behavior tab: every switch carries a comment naming where it's
   read — both spots sit in the main process, not the renderer. */

import type { IpcRequest } from '@shared/ipc';
import type { AppSettings } from '@shared/types';
import { Switch } from '../../atoms/Switch';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';

export interface TrayPanelProps {
  app: AppSettings;
  onSave: (patch: IpcRequest<'settings:setApp'>['patch']) => void;
}

export function TrayPanel({ app, onSave }: TrayPanelProps) {
  const t = useT();

  return (
    <Panel title={t('settings.customization.tray.title')}>
      <div className="sb-setting-block">
        {/* Read in `main/index.ts` (`closeGuardOptions.hideInsteadOfClose`). */}
        <Switch
          label={t('settings.customization.tray.closeToTray.label')}
          description={t('settings.customization.tray.closeToTray.hint')}
          checked={app.closeToTray}
          onChange={(event) => onSave({ closeToTray: event.target.checked })}
        />

        {/* Read in `main/window.ts` (`shouldStartHidden`). */}
        <Switch
          label={t('settings.customization.tray.startMinimized.label')}
          description={t('settings.customization.tray.startMinimized.hint')}
          checked={app.startMinimized}
          onChange={(event) => onSave({ startMinimized: event.target.checked })}
        />
      </div>
    </Panel>
  );
}
