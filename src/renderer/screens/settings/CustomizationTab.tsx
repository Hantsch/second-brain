import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_BACKGROUNDS, APP_ICONS } from '@shared/types';
import type { SettingsSnapshot } from '@shared/types';
import { ImageRadio } from '../../atoms/ImageRadio';
import { ErrorState } from '../../components/ErrorState';
import { Panel } from '../../components/Panel';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { BACKGROUND_ASSETS, ICON_ASSETS } from '../../lib/customization-assets';
import { qk } from '../../lib/queries/keys';

export function CustomizationTab() {
  const t = useT();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  const save = useMutation({
    mutationFn: api.settings.setApp,
    onSuccess: (snapshot: SettingsSnapshot) =>
      client.setQueryData(qk.settings.snapshot(), snapshot),
  });

  if (settings.error) {
    return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  }
  if (!settings.data) {
    return (
      <Panel title={t('settings.customization.background.title')}>
        <Skeleton lines={4} height={96} />
      </Panel>
    );
  }

  const customization = settings.data.app.customization;

  return (
    <>
      <Panel
        title={t('settings.customization.background.title')}
        note={t('settings.customization.background.note')}
      >
        <fieldset className="sb-customization-fieldset">
          <legend className="sb-visually-hidden">
            {t('settings.customization.background.title')}
          </legend>
          <div className="sb-customization-grid sb-customization-grid--backgrounds">
            {APP_BACKGROUNDS.map((background) => (
              <ImageRadio
                key={background}
                name="app-background"
                value={background}
                label={t(`settings.customization.background.${background}`)}
                checked={customization.background === background}
                preview={
                  background === 'none' ? (
                    <span className="sb-customization-none">
                      {t('settings.customization.background.none.preview')}
                    </span>
                  ) : (
                    <img src={BACKGROUND_ASSETS[background]} alt="" />
                  )
                }
                onChange={() => save.mutate({ customization: { background } })}
              />
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel
        title={t('settings.customization.icon.title')}
        note={t('settings.customization.icon.note')}
      >
        <fieldset className="sb-customization-fieldset">
          <legend className="sb-visually-hidden">{t('settings.customization.icon.title')}</legend>
          <div className="sb-customization-grid sb-customization-grid--icons">
            {APP_ICONS.map((appIcon) => (
              <ImageRadio
                key={appIcon}
                name="app-icon"
                value={appIcon}
                label={t(`settings.customization.icon.${appIcon}`)}
                checked={customization.appIcon === appIcon}
                preview={<img src={ICON_ASSETS[appIcon]} alt="" />}
                onChange={() => save.mutate({ customization: { appIcon } })}
              />
            ))}
          </div>
        </fieldset>
      </Panel>
    </>
  );
}
