/* Custom title bar for the frameless window. The left part is the drag
   region; the search field and the buttons on the right explicitly are not. */

import { useEffect, useState } from 'react';
import type { AppIcon } from '@shared/types';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { ICON_ASSETS } from '../lib/customization-assets';
import { SearchTrigger } from './SearchTrigger';

export interface TitleBarProps {
  /** Context to the right of the name, e.g. the open vault. */
  context?: string | null;
  /** Opens the command palette. If missing, the search field stays hidden. */
  onSearch?: () => void;
  /** Opens the capture overlay. Only the shell can do that — without a shell
      (onboarding, no vault) the button stays hidden. */
  onCapture?: () => void;
  appIcon?: AppIcon;
}

export function TitleBar({
  context,
  onSearch,
  onCapture,
  appIcon = 'knowledge-garden',
}: TitleBarProps) {
  const t = useT();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void api.window
      .isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
  }, []);

  const toggle = (): void => {
    void api.window
      .toggleMaximize()
      .then((result) => setMaximized(result.maximized))
      .catch(() => undefined);
  };

  return (
    <header className="sb-titlebar sb-drag">
      <img className="sb-titlebar-icon" src={ICON_ASSETS[appIcon]} alt="" aria-hidden="true" />
      <span className="sb-titlebar-name">{t('app.name')}</span>
      {context ? <span className="sb-titlebar-context">{context}</span> : null}
      {onSearch ? (
        <div className="sb-titlebar-search">
          <SearchTrigger onOpen={onSearch} />
        </div>
      ) : null}
      {/* Capture is the app's reason for existing — it belongs one click away
          on every screen, right next to the way into the palette. */}
      {onCapture ? (
        <IconButton
          icon="zap"
          label={t('titlebar.captureAria')}
          title={t('titlebar.capture')}
          className="sb-no-drag"
          onClick={onCapture}
        />
      ) : null}
      <div className="sb-window-controls sb-no-drag">
        <IconButton
          icon="minus"
          label={t('titlebar.minimize')}
          onClick={() => void api.window.minimize().catch(() => undefined)}
        />
        <IconButton
          icon={maximized ? 'minimize-2' : 'square'}
          label={maximized ? t('titlebar.restore') : t('titlebar.maximize')}
          onClick={toggle}
        />
        <IconButton
          icon="x"
          label={t('titlebar.close')}
          onClick={() => void api.window.close().catch(() => undefined)}
        />
      </div>
    </header>
  );
}
