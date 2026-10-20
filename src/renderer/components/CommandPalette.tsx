/* Command palette (Ctrl+K): one control with two modes.

   Palette mode is the established Ctrl+K surface — it switches screens, runs
   actions and searches the vault. Ask mode hands a question to the ask
   overlay. The visible mode chips make the second mode discoverable without
   knowing a key; `Tab` and a leading `?` are the shortcuts for those who do.
   More commands are added via `registerCommand`. Esc closes it. */

import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { api } from '../lib/api';
import type { CommandDef, CommandGroup } from '../lib/commands';
import { qk } from '../lib/queries/keys';
import { useShellOverlays } from '../lib/shell-overlays';
import { usePaletteCommands } from '../lib/use-palette-commands';
import { useSearchCommands } from '../lib/use-search-commands';

/* Search starts at two characters: with a single letter everything matches, and
   the list would be noise instead of an answer. */
const MIN_QUERY = 2;
const MAX_HITS = 6;

/** The two modes behind Ctrl+K. Palette mode stays the default. */
type PaletteMode = 'palette' | 'ask';

/* Commands that reshape the palette instead of leaving it — everything else
   closes it before it runs. */
const KEEP_OPEN: ReadonlySet<string> = new Set(['action:ask']);

const GROUP_LABELS: Record<CommandGroup, string> = {
  screens: 'palette.group.screens',
  actions: 'palette.group.actions',
  search: 'palette.group.search',
};

/** Only the text field toggles the mode with `Tab`; buttons keep tabbing. */
function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.tagName === 'INPUT';
}

interface ModeChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

/** A real, operable control — the mode is switchable by mouse and keyboard. */
function ModeChip({ active, label, onClick }: ModeChipProps) {
  return (
    <button
      type="button"
      className={`sb-chip ${active ? 'sb-chip--active' : ''}`.trim()}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export interface CommandPaletteProps {
  onClose: () => void;
}

/**
 * Only rendered while the palette is open — this way it starts empty and in
 * palette mode every time, without an effect having to reset state.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const t = useT();
  /* Outside a provider this hands back no-ops, so the palette still renders
     standalone in a test that has no overlay host. */
  const overlays = useShellOverlays();
  const [mode, setMode] = useState<PaletteMode>('palette');
  const [query, setQuery] = useState('');
  const [question, setQuestion] = useState('');
  const [active, setActive] = useState(0);

  const onAsk = useCallback(() => setMode('ask'), []);
  const commands = usePaletteCommands({ onAsk });

  /* Real full-text search over the index — the same one that serves
     `search:query`. Without an index an empty list comes back, not an error.
     Ask mode has no result list, so it asks nothing of the index either. */
  const needle = query.trim();
  const { data: hits } = useQuery({
    queryKey: qk.search.query(needle),
    queryFn: () => api.search.query(needle, { limit: MAX_HITS }),
    enabled: mode === 'palette' && needle.length >= MIN_QUERY,
    retry: false,
  });

  /* Hit→command mapping (opens via `useOpenDoc`, plus the "show all results"
     entry) lives in its own hook — extracted out of this file to keep it
     under the soft line limit; see `use-search-commands.ts`. */
  const searchCommands = useSearchCommands({ query, hits });

  const visible = useMemo(() => {
    const lower = needle.toLowerCase();
    const matching = lower
      ? commands.filter((command) => t(command.labelKey).toLowerCase().includes(lower))
      : commands;
    return [...matching, ...searchCommands];
  }, [commands, searchCommands, needle, t]);

  const runCommand = (command: CommandDef): void => {
    if (!KEEP_OPEN.has(command.id)) onClose();
    void command.run();
  };

  const runActive = (): void => {
    const command = visible[active];
    if (!command) return;
    runCommand(command);
  };

  /* The keystroke is the user's own action, so the question goes off right
     away — unlike a `?q=` address, which only prefills. */
  const askNow = (): void => {
    const text = question.trim();
    if (!text) return;
    onClose();
    overlays.openAsk({ question: text, submit: true });
  };

  /* One rule for the mode: it only ever changes on an explicit action — `Tab`,
     a chip, the "ask" command, or a leading `?`. Erasing the question back to
     empty stays in ask mode; a field that changes mode while the user deletes
     in it fights the user. Both texts survive a switch, so tabbing back and
     forth loses nothing. */
  const toggleMode = (): void => setMode((current) => (current === 'palette' ? 'ask' : 'palette'));

  const onQueryChange = (value: string): void => {
    /* A leading `?` is the typed way into ask mode. The `?` is the switch, not
       part of the question — everything behind it is. */
    if (value.startsWith('?')) {
      setQuestion(value.slice(1));
      setMode('ask');
      return;
    }
    setQuery(value);
    setActive(0);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    /* `Tab` normally moves the focus, and taking it over is a deliberate
       trade-off: inside this dialog it is the shortest way between the two
       modes, and it only applies in the text field and only without shift.
       `Shift+Tab` therefore still steps back onto the mode chips, the list is
       driven by the arrow keys as a palette should be, and Esc always closes —
       nothing here traps the focus. */
    if (event.key === 'Tab' && !event.shiftKey && isTextField(event.target)) {
      event.preventDefault();
      toggleMode();
      return;
    }
    if (mode === 'ask') {
      if (event.key === 'Enter') {
        event.preventDefault();
        askNow();
      }
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

  const asking = mode === 'ask';
  const fieldKey = asking ? 'palette.ask.placeholder' : 'palette.placeholder';
  let lastGroup: CommandGroup | null = null;

  return (
    <div
      className="gs-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={asking ? 'gs-dialog sb-palette sb-palette--ask' : 'gs-dialog sb-palette'}
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onKeyDown={onKeyDown}
      >
        <div className="sb-palette-modes" role="group" aria-label={t('palette.mode.label')}>
          <ModeChip
            active={!asking}
            label={t('palette.mode.palette')}
            onClick={() => setMode('palette')}
          />
          <ModeChip active={asking} label={t('palette.mode.ask')} onClick={() => setMode('ask')} />
        </div>
        {/* Raw gs markup, because the Input atom doesn't expose a ref. */}
        <div className="sb-palette-input">
          <div className="gs-inputwrap">
            <span className="gs-input-icon">
              <Icon name={asking ? 'message-square' : 'search'} size={15} />
            </span>
            {/* One field for both modes, deliberately without a `key`: the node
                survives the switch, so the caret stays where it was and typing
                after a leading `?` simply continues. Label, icon and value come
                from the mode. */}
            <input
              /* The palette only opens to be typed into — focus belongs in the
                 field immediately, otherwise the user types into nothing. */
              autoFocus
              className="gs-input gs-input--withicon"
              placeholder={t(fieldKey)}
              aria-label={t(fieldKey)}
              value={asking ? question : query}
              onChange={(event) => {
                if (asking) setQuestion(event.target.value);
                else onQueryChange(event.target.value);
              }}
            />
          </div>
        </div>
        {/* No result list in ask mode: the answer belongs in the ask overlay,
            and nothing here may pretend to be one. */}
        {asking ? null : (
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
                    onClick={() => runCommand(command)}
                  >
                    {command.icon ? <Icon name={command.icon} size={15} /> : null}
                    <span className="sb-palette-label">{label}</span>
                    {command.hint ? <span className="sb-palette-hint">{command.hint}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="sb-palette-foot">{t(asking ? 'palette.ask.hint' : 'palette.hint')}</div>
      </div>
    </div>
  );
}
