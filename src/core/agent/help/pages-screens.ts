/* The help page of every rail screen, keyed by screen id. The ids are copied from the
 * renderer's screen list because core never imports the renderer; a test compares the two
 * lists, so a new rail screen without a page fails there. */

import { CHATS_PAGE, DASHBOARD_PAGE, JOURNAL_PAGE, PROJECTS_PAGE } from './pages-screens-a';
import {
  AGENT_SCREEN_PAGE,
  GARDEN_PAGE,
  KNOWLEDGE_PAGE,
  NOTES_PAGE,
  SETTINGS_PAGE,
  TASKS_PAGE,
} from './pages-screens-b';
import type { HelpPageDef } from './types';

export type HelpScreenId =
  | 'dashboard'
  | 'chats'
  | 'projects'
  | 'journal'
  | 'knowledge'
  | 'notes'
  | 'tasks'
  | 'agent'
  | 'garden'
  | 'settings';

export const SCREEN_PAGES: Record<HelpScreenId, HelpPageDef> = {
  dashboard: DASHBOARD_PAGE,
  chats: CHATS_PAGE,
  projects: PROJECTS_PAGE,
  journal: JOURNAL_PAGE,
  knowledge: KNOWLEDGE_PAGE,
  notes: NOTES_PAGE,
  tasks: TASKS_PAGE,
  agent: AGENT_SCREEN_PAGE,
  garden: GARDEN_PAGE,
  settings: SETTINGS_PAGE,
};
