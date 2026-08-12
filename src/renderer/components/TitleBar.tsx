/* Eigene Titelzeile für das rahmenlose Fenster. Der linke Teil ist Ziehfläche,
   das Suchfeld und die Knöpfe rechts sind ausdrücklich keine. */

import { useEffect, useState } from 'react';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { SearchTrigger } from './SearchTrigger';

export interface TitleBarProps {
  /** Kontext rechts vom Namen, z. B. der offene Vault. */
  context?: string | null;
  /** Öffnet die Befehlspalette. Fehlt sie, bleibt das Suchfeld weg. */
  onSearch?: () => void;
}

export function TitleBar({ context, onSearch }: TitleBarProps) {
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
      <span className="sb-titlebar-name">{t('app.name')}</span>
      {context ? <span className="sb-titlebar-context">{context}</span> : null}
      {onSearch ? (
        <div className="sb-titlebar-search">
          <SearchTrigger onOpen={onSearch} />
        </div>
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
