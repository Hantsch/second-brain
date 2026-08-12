/* Befehlspalette (Ctrl+K): Screens wechseln, erfassen, suchen.
   Weitere Befehle kommen über `registerCommand` dazu. Esc schließt. */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { api } from '../lib/api';
import type { CommandDef, CommandGroup } from '../lib/commands';
import { useRegisteredCommands } from '../lib/commands';
import { qk } from '../lib/queries/keys';
import { SCREENS } from '../lib/screens';

/* Ab zwei Zeichen wird gesucht: bei einem Buchstaben trifft alles, und die
   Liste wäre Rauschen statt Antwort. */
const MIN_QUERY = 2;
const MAX_HITS = 6;

const GROUP_LABELS: Record<CommandGroup, string> = {
  screens: 'palette.group.screens',
  actions: 'palette.group.actions',
  search: 'palette.group.search',
};

export interface CommandPaletteProps {
  onClose: () => void;
}

/**
 * Wird nur gerendert, solange die Palette offen ist — so startet sie jedes Mal
 * leer, ohne dass ein Effekt Zustand zurücksetzen müsste.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const t = useT();
  const navigate = useNavigate();
  const registered = useRegisteredCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<CommandDef[]>(() => {
    const screens: CommandDef[] = SCREENS.map((screen) => ({
      id: `screen:${screen.id}`,
      group: 'screens',
      labelKey: screen.labelKey,
      icon: screen.icon,
      run: () => void navigate(screen.path),
    }));
    const actions: CommandDef[] = [
      {
        id: 'action:capture',
        group: 'actions',
        labelKey: 'palette.action.capture',
        icon: 'zap',
        run: () => void api.capture.window(true).catch(() => undefined),
      },
    ];
    return [...screens, ...actions, ...registered];
  }, [navigate, registered]);

  /* Echte Volltextsuche über den Index — dieselbe, die `search:query` bedient.
     Ohne Index kommt eine leere Liste zurück, kein Fehler. */
  const needle = query.trim();
  const { data: hits } = useQuery({
    queryKey: qk.search.query(needle),
    queryFn: () => api.search.query(needle, { limit: MAX_HITS }),
    enabled: needle.length >= MIN_QUERY,
    retry: false,
  });

  const visible = useMemo(() => {
    const lower = needle.toLowerCase();
    const matching = lower
      ? commands.filter((command) => t(command.labelKey).toLowerCase().includes(lower))
      : commands;
    const found: CommandDef[] = (hits ?? []).map((hit) => ({
      id: `doc:${hit.path}`,
      group: 'search',
      labelKey: hit.title,
      hint: hit.path,
      icon: 'file-text',
      /* Die Dateien sind die Wahrheit: ein Treffer öffnet sie im Standardeditor,
         solange die App keine eigene Leseansicht hat. */
      run: () => void api.shell.openPath(hit.path).catch(() => undefined),
    }));
    return [...matching, ...found];
  }, [commands, hits, needle, t]);

  const runActive = (): void => {
    const command = visible[active];
    if (!command) return;
    onClose();
    void command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (visible.length === 0 ? 0 : (index + 1) % visible.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) =>
        visible.length === 0 ? 0 : (index - 1 + visible.length) % visible.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runActive();
    }
  };

  let lastGroup: CommandGroup | null = null;

  return (
    <div
      className="gs-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="gs-dialog sb-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onKeyDown={onKeyDown}
      >
        {/* Rohes gs-Markup, weil das Input-Atom keine Referenz nach außen gibt. */}
        <div className="sb-palette-input">
          <div className="gs-inputwrap">
            <span className="gs-input-icon">
              <Icon name="search" size={15} />
            </span>
            <input
              /* Die Palette geht ausschließlich zum Tippen auf — der Fokus gehört
                 sofort ins Feld, sonst tippt der Nutzer ins Leere. */
              autoFocus
              className="gs-input gs-input--withicon"
              placeholder={t('palette.placeholder')}
              aria-label={t('palette.placeholder')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
            />
          </div>
        </div>
        <ul className="sb-palette-list">
          {visible.length === 0 ? (
            <li className="sb-palette-group gs-hint">{t('palette.empty')}</li>
          ) : null}
          {visible.map((command, index) => {
            const showGroup = command.group !== lastGroup;
            lastGroup = command.group;
            const label = t(command.labelKey);
            return (
              <li key={command.id}>
                {showGroup ? (
                  <div className="sb-palette-group gs-overline">
                    {t(GROUP_LABELS[command.group])}
                  </div>
                ) : null}
                <button
                  type="button"
                  className="sb-palette-item"
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => {
                    onClose();
                    void command.run();
                  }}
                >
                  {command.icon ? <Icon name={command.icon} size={15} /> : null}
                  <span className="sb-palette-label">{label}</span>
                  {command.hint ? <span className="sb-palette-hint">{command.hint}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="sb-palette-foot">{t('palette.hint')}</div>
      </div>
    </div>
  );
}
