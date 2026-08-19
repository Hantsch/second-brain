/* Die Screens der Rail — eine Liste, drei Verwender: Rail, Router und
   Befehlspalette. Reihenfolge und Tasten stehen in docs/ARCHITECTURE.md. */

export type ScreenId =
  'dashboard' | 'projects' | 'notes' | 'journal' | 'knowledge' | 'garden' | 'settings';

export interface ScreenDef {
  id: ScreenId;
  /** Route im HashRouter. */
  path: string;
  /** Kebab-case-Name für das Icon-Atom. */
  icon: string;
  labelKey: string;
  /** Digit that opens this screen. Without one the screen is reachable by
   *  click and command palette only. */
  hotkey?: string;
  /** `place` renders in the main rail list, `system` in the rail foot,
   *  visually separated above the vault indicator. */
  group: 'place' | 'system';
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    icon: 'layout-dashboard',
    labelKey: 'rail.dashboard',
    hotkey: '1',
    group: 'place',
  },
  {
    id: 'projects',
    path: '/projects',
    icon: 'folder',
    labelKey: 'rail.projects',
    hotkey: '2',
    group: 'place',
  },
  {
    id: 'journal',
    path: '/journal',
    icon: 'notebook-pen',
    labelKey: 'rail.journal',
    hotkey: '3',
    group: 'place',
  },
  {
    id: 'knowledge',
    path: '/knowledge',
    icon: 'network',
    labelKey: 'rail.knowledge',
    hotkey: '4',
    group: 'place',
  },
  {
    id: 'notes',
    path: '/notes',
    icon: 'sticky-note',
    labelKey: 'rail.notes',
    hotkey: '5',
    group: 'place',
  },
  {
    id: 'garden',
    path: '/garden',
    icon: 'sprout',
    labelKey: 'rail.garden',
    hotkey: '6',
    group: 'system',
  },
  {
    id: 'settings',
    path: '/settings',
    icon: 'settings',
    labelKey: 'rail.settings',
    hotkey: '7',
    group: 'system',
  },
];

export function screenByHotkey(key: string): ScreenDef | undefined {
  return SCREENS.find((screen) => screen.hotkey === key);
}
