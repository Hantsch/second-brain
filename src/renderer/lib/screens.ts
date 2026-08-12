/* Die Screens der Rail — eine Liste, drei Verwender: Rail, Router und
   Befehlspalette. Reihenfolge und Tasten stehen in docs/ARCHITECTURE.md. */

export type ScreenId =
  | 'dashboard'
  | 'capture'
  | 'inbox'
  | 'ask'
  | 'projects'
  | 'journal'
  | 'modules'
  | 'sources'
  | 'garden'
  | 'agents'
  | 'settings';

export interface ScreenDef {
  id: ScreenId;
  /** Route im HashRouter. */
  path: string;
  /** Kebab-case-Name für das Icon-Atom. */
  icon: string;
  labelKey: string;
  /** Ziffer, die diesen Screen öffnet. Fehlt sie, ist der Screen nur per
   *  Klick und Befehlspalette erreichbar (z. B. "agents" — die Ziffern 1–0
   *  sind an die zehn ursprünglichen Screens vergeben). */
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
  { id: 'capture', path: '/capture', icon: 'zap', labelKey: 'rail.capture', hotkey: '2' },
  { id: 'inbox', path: '/inbox', icon: 'inbox', labelKey: 'rail.inbox', hotkey: '3' },
  { id: 'ask', path: '/ask', icon: 'message-square', labelKey: 'rail.ask', hotkey: '4' },
  { id: 'projects', path: '/projects', icon: 'folder', labelKey: 'rail.projects', hotkey: '5' },
  { id: 'journal', path: '/journal', icon: 'notebook-pen', labelKey: 'rail.journal', hotkey: '6' },
  { id: 'modules', path: '/modules', icon: 'network', labelKey: 'rail.modules', hotkey: '7' },
  { id: 'sources', path: '/sources', icon: 'download', labelKey: 'rail.sources', hotkey: '8' },
  { id: 'garden', path: '/garden', icon: 'sprout', labelKey: 'rail.garden', hotkey: '9' },
  { id: 'settings', path: '/settings', icon: 'settings', labelKey: 'rail.settings', hotkey: '0' },
  /* No hotkey: 1–0 are taken by the ten screens above. Reachable by click
     and command palette only (story 001, resolved Open Questions). */
  { id: 'agents', path: '/agents', icon: 'workflow', labelKey: 'rail.agents' },
];

export function screenByHotkey(key: string): ScreenDef | undefined {
  return SCREENS.find((screen) => screen.hotkey === key);
}
