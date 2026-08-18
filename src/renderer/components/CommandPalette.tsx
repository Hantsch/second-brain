/* Command palette (Ctrl+K): switch screens, capture, search.
   More commands are added via `registerCommand`. Esc closes it. */

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

/* Search starts at two characters: with a single letter everything matches, and
   the list would be noise instead of an answer. */
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
 * Only rendered while the palette is open — this way it starts empty every
 * time, without an effect having to reset state.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const t = useT();
  const navigate = useNavigate();
  const registered = useRegisteredCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo<CommandDef[]>(() => {
    /* Sources stopped being a screen of its own and became a tab under
       knowledge, so it is no longer in SCREENS. It is still a destination, not
       an action — hence the "screens" group, listed right below the screen that
       now hosts it. */
    const sources: CommandDef = {
      id: 'screen:knowledge-sources',
      group: 'screens',
      labelKey: 'palette.screen.sources',
      icon: 'download',
      run: () => void navigate('/knowledge?tab=sources'),
    };
    const screens: CommandDef[] = SCREENS.flatMap((screen) => {
      const entry: CommandDef = {
        id: `screen:${screen.id}`,
        group: 'screens',
        labelKey: screen.labelKey,
        icon: screen.icon,
        run: () => void navigate(screen.path),
      };
      return screen.id === 'knowledge' ? [entry, sources] : [entry];
    });
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

  /* Real full-text search over the index — the same one that serves
     `search:query`. Without an index an empty list comes back, not an error. */
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
      /* The files are the truth: a hit opens it in the default editor, as long
         as the app doesn't have its own reading view. */
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
        {/* Raw gs markup, because the Input atom doesn't expose a ref. */}
        <div className="sb-palette-input">
          <div className="gs-inputwrap">
            <span className="gs-input-icon">
              <Icon name="search" size={15} />
            </span>
            <input
              /* The palette only opens to be typed into — focus belongs in the
                 field immediately, otherwise the user types into nothing. */
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
