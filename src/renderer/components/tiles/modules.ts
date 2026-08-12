/* What a dashboard module knows about itself: name, purpose, icon.

   One table, two consumers — the tile takes the name as its title, the
   catalog takes name and purpose. `Record<DashboardModuleId, …>` forces a new
   module to show up here; otherwise nothing translates it. */

import type { DashboardModuleId } from '@shared/types';

export interface ModuleMeta {
  /** i18n key of the name — also the tile's title. */
  nameKey: string;
  /** i18n key of the one sentence that says what the module is good for. */
  purposeKey: string;
  /** Kebab-case name for the icon atom. */
  icon: string;
}

export const MODULE_META: Record<DashboardModuleId, ModuleMeta> = {
  'quick-capture': {
    nameKey: 'module.quick-capture.name',
    purposeKey: 'module.quick-capture.purpose',
    icon: 'zap',
  },
  ask: { nameKey: 'module.ask.name', purposeKey: 'module.ask.purpose', icon: 'message-square' },
  'recent-work': {
    nameKey: 'module.recent-work.name',
    purposeKey: 'module.recent-work.purpose',
    icon: 'history',
  },
  deadlines: {
    nameKey: 'module.deadlines.name',
    purposeKey: 'module.deadlines.purpose',
    icon: 'clock',
  },
  'waiting-on': {
    nameKey: 'module.waiting-on.name',
    purposeKey: 'module.waiting-on.purpose',
    icon: 'users',
  },
  'todos-work': {
    nameKey: 'module.todos-work.name',
    purposeKey: 'module.todos-work.purpose',
    icon: 'circle-check-big',
  },
  'todos-private': {
    nameKey: 'module.todos-private.name',
    purposeKey: 'module.todos-private.purpose',
    icon: 'circle-check-big',
  },
  'active-projects': {
    nameKey: 'module.active-projects.name',
    purposeKey: 'module.active-projects.purpose',
    icon: 'folder-open',
  },
  inbox: { nameKey: 'module.inbox.name', purposeKey: 'module.inbox.purpose', icon: 'inbox' },
  'stale-projects': {
    nameKey: 'module.stale-projects.name',
    purposeKey: 'module.stale-projects.purpose',
    icon: 'folder',
  },
  'journal-streak': {
    nameKey: 'module.journal-streak.name',
    purposeKey: 'module.journal-streak.purpose',
    icon: 'notebook-pen',
  },
  'claude-sessions': {
    nameKey: 'module.claude-sessions.name',
    purposeKey: 'module.claude-sessions.purpose',
    icon: 'workflow',
  },
  gardener: {
    nameKey: 'module.gardener.name',
    purposeKey: 'module.gardener.purpose',
    icon: 'sprout',
  },
};
