/* Fixture-Daten des Dashboard-Tests. Ein kleiner, in sich stimmiger Bestand:
   ein überfälliges und ein heute fälliges Todo in der Arbeit, ein privates ohne
   Frist, ein Warte-auf, eine Sitzung, ein Tagebuch mit Serie.

   Alle Daten hängen an `TODAY` aus `tests/helpers/time.ts` — damit prüft der Test
   morgen dasselbe. */

import type {
  ClaudeSession,
  DashboardData,
  DashboardLayout,
  DashboardModuleId,
  Project,
  Reminder,
  Todo,
} from '@shared/types';
import { DEFAULT_DASHBOARD_TILES } from '@shared/types';
/* Dieselbe feste Gegenwart wie `tests/helpers/time.ts` und die Mock-Brücke.
   Importiert wird sie aus dem Renderer: ein Test unter `tests/renderer/` sieht
   nur `src/renderer`, `src/shared` und sich selbst (tsconfig.web). */
import { NOW, TODAY } from '@renderer/lib/mock-fixtures';

export { NOW, TODAY };

const DAY_MS = 86_400_000;
const TODAY_UTC = Date.parse(`${TODAY}T00:00:00Z`);

/** Kalendertag relativ zu `TODAY`; negativ ist Vergangenheit. */
export function day(offset = 0): string {
  return new Date(TODAY_UTC + offset * DAY_MS).toISOString().slice(0, 10);
}

/** Zeitstempel zu einem Tag, feste Zone — mehr braucht kein Vergleich hier. */
export function stamp(offset = 0, time = '09:00'): string {
  return `${day(offset)}T${time}:00+02:00`;
}

const PROJECT_PATH = 'projects/work/nyota-auth0-migration/project.md';

export const projects: Project[] = [
  {
    path: PROJECT_PATH,
    slug: 'nyota-auth0-migration',
    title: 'Nyota Auth0 Migration',
    scope: 'work',
    status: 'active',
    priority: 2,
    favorite: true,
    deadline: day(2),
    nextStep: 'Rückmeldung von Stefan einarbeiten',
    nextStepStale: false,
    waitingOn: [{ who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: day(-6) }],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: NOW,
    lastTouchSource: 'file',
    ageDays: 0,
    stale: false,
    todoCount: 2,
    openTodoCount: 2,
    excerpt: 'Rollenkonzept liegt bei Stefan.',
  },
  {
    path: 'projects/private/hochbeet-bauen/project.md',
    slug: 'hochbeet-bauen',
    title: 'Hochbeet bauen',
    scope: 'private',
    status: 'paused',
    priority: 4,
    favorite: false,
    deadline: null,
    nextStep: null,
    nextStepStale: false,
    waitingOn: [],
    tags: [],
    modules: [],
    repos: [],
    lastTouch: stamp(-30),
    lastTouchSource: 'file',
    ageDays: 30,
    stale: true,
    todoCount: 1,
    openTodoCount: 1,
    excerpt: 'Bretter liegen im Keller.',
  },
];

function todo(overrides: Partial<Todo> & Pick<Todo, 'id' | 'text' | 'scope'>): Todo {
  return {
    state: 'open',
    path: PROJECT_PATH,
    line: 12,
    project: 'nyota-auth0-migration',
    projectTitle: 'Nyota Auth0 Migration',
    area: null,
    due: null,
    waitingFor: null,
    neededBy: null,
    priority: 0,
    tags: [],
    createdAt: stamp(-4),
    doneAt: null,
    dueInDays: null,
    ...overrides,
  };
}

const workTodos: Todo[] = [
  todo({
    id: 'todo-overdue',
    text: 'Rollen-Mapping dokumentieren',
    scope: 'work',
    due: day(-2),
    dueInDays: -2,
    priority: 2,
  }),
  todo({
    id: 'todo-today',
    text: 'Testmandant aufsetzen',
    scope: 'work',
    due: TODAY,
    dueInDays: 0,
  }),
];

const privateTodos: Todo[] = [
  todo({
    id: 'todo-private',
    text: 'Hochbeet-Erde bestellen',
    scope: 'private',
    path: 'projects/private/hochbeet-bauen/project.md',
    project: 'hochbeet-bauen',
    projectTitle: 'Hochbeet bauen',
  }),
];

export const sessions: ClaudeSession[] = [
  {
    id: 'session-1',
    cwd: 'C:/development/Kunde/Nyota-Auth0-Infrastructure',
    projectName: 'Nyota-Auth0-Infrastructure',
    vaultProject: 'nyota-auth0-migration',
    gitBranch: 'feature/rollen',
    startedAt: stamp(-1, '10:00'),
    lastActivity: stamp(-1, '18:20'),
    messageCount: 34,
    firstPrompt: 'Terraform-State auf den neuen Mandanten migrieren',
    summary: null,
    files: ['main.tf'],
    model: null,
    subagents: null,
    contextTokens: null,
  },
  {
    id: 'session-2',
    cwd: 'C:/development/spielwiese',
    projectName: 'spielwiese',
    vaultProject: null,
    gitBranch: null,
    startedAt: stamp(-2, '09:00'),
    lastActivity: stamp(-2, '09:40'),
    messageCount: 4,
    firstPrompt: 'Kurz was ausprobiert',
    summary: null,
    files: [],
    model: null,
    subagents: null,
    contextTokens: null,
  },
];

export const reminders: Reminder[] = [
  {
    id: 'todo-due:overdue',
    source: 'todo-due',
    urgency: 'overdue',
    title: 'Rollen-Mapping dokumentieren',
    date: day(-2),
    daysOut: -2,
    scope: 'work',
    path: PROJECT_PATH,
    project: 'nyota-auth0-migration',
    who: null,
  },
  {
    id: 'todo-due:today',
    source: 'todo-due',
    urgency: 'today',
    title: 'Testmandant aufsetzen',
    date: TODAY,
    daysOut: 0,
    scope: 'work',
    path: PROJECT_PATH,
    project: 'nyota-auth0-migration',
    who: null,
  },
  {
    id: 'project-deadline:nyota',
    source: 'project-deadline',
    urgency: 'soon',
    title: 'Nyota Auth0 Migration',
    date: day(2),
    daysOut: 2,
    scope: 'work',
    path: PROJECT_PATH,
    project: 'nyota-auth0-migration',
    who: null,
  },
  {
    id: 'waiting-overdue:stefan',
    source: 'waiting-overdue',
    urgency: 'overdue',
    title: 'Stefan: Freigabe des Rollenkonzepts',
    date: day(-6),
    daysOut: -6,
    scope: 'work',
    path: PROJECT_PATH,
    project: 'nyota-auth0-migration',
    who: 'Stefan',
  },
];

export const dashboardFixture: DashboardData = {
  reminders,
  recentWork: [
    {
      at: NOW,
      kind: 'file',
      title: 'Nyota Auth0 Migration',
      detail: '2 Dateien geändert',
      path: PROJECT_PATH,
      project: 'nyota-auth0-migration',
      scope: 'work',
    },
    {
      at: stamp(-1, '18:20'),
      kind: 'claude-session',
      title: 'Terraform-State migrieren',
      detail: 'Session, 34 Nachrichten, Branch feature/rollen',
      path: null,
      project: 'nyota-auth0-migration',
      scope: null,
    },
  ],
  staleProjects: ['hochbeet-bauen'],
  todos: { work: workTodos, private: privateTodos },
  waitingOn: [
    {
      who: 'Stefan',
      what: 'Freigabe des Rollenkonzepts',
      since: day(-6),
      project: 'nyota-auth0-migration',
      projectTitle: 'Nyota Auth0 Migration',
      path: PROJECT_PATH,
    },
  ],
  inboxCount: 2,
  journal: { streak: 3, lastEntry: TODAY, moodTrend: [3, 4, 2] },
  health: 0,
  findingCount: 0,
  healthKnown: false,
  sessions,
};

/** Ein Vault, in dem noch nichts steht. */
export const emptyDashboard: DashboardData = {
  reminders: [],
  recentWork: [],
  staleProjects: [],
  todos: { work: [], private: [] },
  waitingOn: [],
  inboxCount: 0,
  journal: { streak: 0, lastEntry: null, moodTrend: [] },
  health: 0,
  findingCount: 0,
  healthKnown: false,
  sessions: [],
};

/** Eine Anordnung, in der genau diese Module sichtbar sind — in dieser Reihenfolge. */
export function layoutOf(visible: readonly DashboardModuleId[]): DashboardLayout {
  const shown = visible.map((id) => ({
    id,
    size: DEFAULT_DASHBOARD_TILES.find((tile) => tile.id === id)?.size ?? 'md',
  }));
  const hidden = DEFAULT_DASHBOARD_TILES.filter((tile) => !visible.includes(tile.id)).map(
    (tile) => ({ ...tile, hidden: true }),
  );
  return { tiles: [...shown, ...hidden], updated: NOW };
}
