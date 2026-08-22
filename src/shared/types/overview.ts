/* Overview: dashboard modules, reminders, Claude sessions, maintenance findings. */

import type { Scope } from './vault';
import type { Todo, WaitingOn } from './domain';

/** All building blocks that can live on the dashboard. */
export type DashboardModuleId =
  | 'quick-capture'
  | 'ask'
  | 'recent-work'
  | 'stale-projects'
  | 'todos-work'
  | 'todos-private'
  | 'waiting-on'
  | 'deadlines'
  | 'inbox'
  | 'journal-streak'
  | 'gardener'
  | 'claude-sessions'
  | 'active-projects';

/**
 * The same set at runtime. Both main and renderer need it: main uses it to
 * validate an incoming layout, the renderer builds the module picker from it.
 * The order is the catalog's default order.
 */
export const DASHBOARD_MODULES: readonly DashboardModuleId[] = [
  'quick-capture',
  'ask',
  'recent-work',
  'deadlines',
  'waiting-on',
  'todos-work',
  'todos-private',
  'active-projects',
  'inbox',
  'stale-projects',
  'journal-streak',
  'claude-sessions',
  'gardener',
];

export type ModuleSize = 'sm' | 'md' | 'lg' | 'xl';

/** From narrow to wide — the picker in the tile menu follows this order. */
export const MODULE_SIZES: readonly ModuleSize[] = ['sm', 'md', 'lg', 'xl'];

export interface DashboardTile {
  id: DashboardModuleId;
  size: ModuleSize;
  /** Hidden, but present in the picker. */
  hidden?: boolean;
  /** Module-specific settings, e.g. number of rows. */
  options?: Record<string, unknown>;
}

export interface DashboardLayout {
  /** Order = position in the grid, from top left to bottom right. */
  tiles: DashboardTile[];
  updated: string;
}

/**
 * The starting layout: **signal first.** Five modules are visible: the three
 * questions from CLAUDE.md (what's due, what's being waited on, what was last
 * worked on, the open todos of the work sphere) — and the maintenance health
 * score. It lives here and not in `main/settings-defaults` because the
 * renderer needs it too: "reset layout" must produce the same order as a
 * fresh vault.
 *
 * Eight modules start hidden, and for a reason: **space is the scarce
 * resource.** The default grid must stay within 1152×720 across two screens
 * (checked in `scripts/shot.mjs`), otherwise the screen only answers its one
 * question after scrolling. Two empty input fields ("quick capture", "ask")
 * on the most valuable real estate would be the worst trade for that: both
 * are one keypress away (`Ctrl+Shift+Space`, digit 4) and sit as a button in
 * the header.
 *
 * **"Maintenance" is visible** ever since the maintenance run exists: the
 * tile shows the health score and the two most urgent categories — and
 * without a run it says "not checked yet" instead of a made-up number. No
 * other module carries the signal "can I still trust my archive?".
 *
 * By contrast **"Todos private" starts hidden**, and not out of taste: at
 * 1152 px there are two columns, six visible modules make four rows, and four
 * rows blow the budget of two screens. Of the five candidates, this was the
 * most dispensable — anything private with a deadline shows up in "Due"
 * anyway (reminders cover both spheres), and the full list is one checkbox in
 * the picker or one click in the projects screen away.
 *
 * Hidden doesn't mean gone: all thirteen appear in the picker ("modules"),
 * with a checkbox and immediate effect. Each module appears exactly once.
 */
export const DEFAULT_DASHBOARD_TILES: readonly DashboardTile[] = [
  { id: 'deadlines', size: 'md' },
  { id: 'waiting-on', size: 'md' },
  { id: 'recent-work', size: 'xl' },
  { id: 'todos-work', size: 'md' },
  { id: 'gardener', size: 'sm' },
  { id: 'todos-private', size: 'md', hidden: true },
  { id: 'active-projects', size: 'xl', hidden: true },
  { id: 'inbox', size: 'sm', hidden: true },
  { id: 'stale-projects', size: 'md', hidden: true },
  { id: 'journal-streak', size: 'sm', hidden: true },
  { id: 'claude-sessions', size: 'md', hidden: true },
  { id: 'quick-capture', size: 'md', hidden: true },
  { id: 'ask', size: 'md', hidden: true },
];

/** What triggers a reminder. */
export type ReminderSource =
  'todo-due' | 'project-deadline' | 'waiting-overdue' | 'stale-project' | 'loose-end';

export type ReminderUrgency = 'overdue' | 'today' | 'soon' | 'upcoming';

export interface Reminder {
  id: string;
  source: ReminderSource;
  urgency: ReminderUrgency;
  title: string;
  /** When it's due (or was), ISO date. */
  date: string;
  daysOut: number;
  scope: Scope;
  /** File it's backed by. */
  path: string;
  project: string | null;
  who: string | null;
}

/** A Claude Code session, read from `~/.claude/projects`. */
export interface ClaudeSession {
  id: string;
  /** Working directory of the session. */
  cwd: string;
  /** Short project name derived from the path. */
  projectName: string;
  /** Linked vault project, if one can be matched. */
  vaultProject: string | null;
  gitBranch: string | null;
  startedAt: string;
  lastActivity: string;
  messageCount: number;
  /** First user message, truncated — what was being worked on. */
  firstPrompt: string;
  /** Session summary, if Claude wrote one. */
  summary: string | null;
  /** Files touched by the user, most frequent first. */
  files: string[];
  /** Model name from the most recent assistant record, or unknown. */
  model: string | null;
  /** Distinct subagent types invoked, first-seen order; `null` means none seen. */
  subagents: string[] | null;
  /** Approximate context size from the most recent assistant record's token usage. */
  contextTokens: number | null;
}

/** Work from recent days, mixed from file changes and Claude sessions. */
export interface RecentWorkItem {
  at: string;
  kind: 'file' | 'claude-session' | 'journal' | 'ingest';
  title: string;
  detail: string;
  path: string | null;
  project: string | null;
  scope: Scope | null;
}

/* Maintenance findings (`GardenerFinding`, `GardenerReport`, discard/supersede
   plans and results) live in `./gardener` — the report/discard/supersede
   shapes together pushed this file past the soft line limit. */

/** Everything the dashboard needs in one go. */
export interface DashboardData {
  reminders: Reminder[];
  recentWork: RecentWorkItem[];
  staleProjects: string[];
  todos: { work: Todo[]; private: Todo[] };
  waitingOn: (WaitingOn & { project: string; projectTitle: string; path: string })[];
  inboxCount: number;
  journal: { streak: number; lastEntry: string | null; moodTrend: number[] };
  health: number;
  findingCount: number;
  /**
   * Does a maintenance run exist? `false` means: `health` and `findingCount`
   * are unknown, not null — the card says "not checked yet" instead of
   * claiming a number.
   */
  healthKnown?: boolean;
  sessions: ClaudeSession[];
}
