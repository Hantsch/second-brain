/* Die Screens der Rail — eine Liste, drei Verwender: Rail, Router und
   Befehlspalette. Reihenfolge und Tasten stehen in docs/ARCHITECTURE.md. */

export type ScreenId =
  'dashboard' | 'inbox' | 'projects' | 'notes' | 'journal' | 'knowledge' | 'garden' | 'settings';

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
}

export const SCREENS: readonly ScreenDef[] = [
  {
    id: 'dashboard',
    path: '/dashboard',
    icon: 'layout-dashboard',
    labelKey: 'rail.dashboard',
    hotkey: '1',
  },
  { id: 'inbox', path: '/inbox', icon: 'inbox', labelKey: 'rail.inbox', hotkey: '3' },
  { id: 'projects', path: '/projects', icon: 'folder', labelKey: 'rail.projects', hotkey: '5' },
  { id: 'notes', path: '/notes', icon: 'sticky-note', labelKey: 'rail.notes', hotkey: '4' },
  { id: 'journal', path: '/journal', icon: 'notebook-pen', labelKey: 'rail.journal', hotkey: '6' },
  { id: 'knowledge', path: '/knowledge', icon: 'network', labelKey: 'rail.knowledge', hotkey: '7' },
  { id: 'garden', path: '/garden', icon: 'sprout', labelKey: 'rail.garden', hotkey: '9' },
  { id: 'settings', path: '/settings', icon: 'settings', labelKey: 'rail.settings', hotkey: '0' },
  /* Digits in use: 1, 3, 4, 5, 6, 7, 9, 0. `2` and `8` stay deliberately
     unassigned: sources became a tab under knowledge, capture and ask became
     shell overlays — the rail gets renumbered wholesale by the later
     navigation stories, so no interim churn here.
     No entry for the agent sessions: they hang under projects since story
     008 (`/projects/sessions`), so the rail keeps one entry for the place,
     not two for the same subject. */
];

export function screenByHotkey(key: string): ScreenDef | undefined {
  return SCREENS.find((screen) => screen.hotkey === key);
}
