/* Die Screens der Rail — eine Liste, drei Verwender: Rail, Router und
   Befehlspalette. Reihenfolge und Tasten stehen in docs/ARCHITECTURE.md. */

export type ScreenId =
  | 'dashboard'
  | 'chats'
  | 'projects'
  | 'notes'
  | 'journal'
  | 'knowledge'
  | 'tasks'
  | 'agent'
  | 'garden'
  | 'settings';

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
    /* The conversations you already had. Asking itself stays an overlay; this is
       where its history becomes reachable. No digit hotkey: the digits 1–7 are
       taken, and renumbering them for one entry would break muscle memory. */
    id: 'chats',
    path: '/chats',
    icon: 'message-square',
    labelKey: 'rail.chats',
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
    /* 072, D1: the place for what needs doing — sits directly above
       maintenance in the rail's system group. No digit hotkey: it is
       reachable by click and by rail focus (Tab/Enter), the same as every
       other system entry that doesn't carry one. */
    id: 'tasks',
    path: '/tasks',
    icon: 'list-checks',
    labelKey: 'rail.tasks',
    group: 'system',
  },
  {
    /* Claude Code on this vault: right after Tasks, where the work it picks up is
       listed. No digit hotkey, like Tasks. */
    id: 'agent',
    path: '/agent',
    icon: 'bot',
    labelKey: 'rail.agent',
    group: 'system',
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
