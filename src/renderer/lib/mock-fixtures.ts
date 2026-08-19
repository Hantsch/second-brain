/* Fixture data for the mock bridge. A small, internally consistent
   example vault so the UI has something to show without Electron.
   View data only — none of this touches a file. */

import type {
  Area,
  ChatThread,
  ClaudeSession,
  DumpItem,
  FilingProposal,
  GardenerReport,
  IngestJob,
  JournalDay,
  KnowledgeModule,
  Project,
  Reminder,
  SearchHit,
  Todo,
  VaultDoc,
  VaultStatus,
  WikiPage,
} from '@shared/types';
import type { AppInfo, IndexStats } from '@shared/ipc';

export const NOW = '2026-08-10T14:32:00+02:00';
export const TODAY = '2026-08-10';

export const vaultStatus: VaultStatus = {
  root: 'C:/vaults/demo',
  name: 'Demo-Vault',
  ready: true,
  docCount: 42,
  indexedAt: NOW,
  indexing: false,
};

export const indexStats: IndexStats = {
  docs: 42,
  todos: 11,
  projects: 3,
  modules: 1,
  pages: 8,
  words: 18420,
  builtAt: NOW,
  durationMs: 640,
};

export const appInfo: AppInfo = {
  version: '0.1.0',
  platform: 'browser',
  electron: '',
  userData: '',
  demo: true,
};

export const doc: VaultDoc = {
  path: 'projects/work/nyota-auth0-migration/project.md',
  frontmatter: {
    type: 'project',
    title: 'Nyota Auth0 Migration',
    created: '2026-06-12T09:00:00+02:00',
  },
  body: '## Stand\n\nRollenkonzept liegt bei Stefan zur Freigabe.\n',
  hash: 'demo-hash',
  modified: NOW,
  size: 1240,
};

export const project: Project = {
  path: doc.path,
  slug: 'nyota-auth0-migration',
  title: 'Nyota Auth0 Migration',
  scope: 'work',
  status: 'waiting',
  priority: 2,
  deadline: '2026-09-01',
  nextStep: 'Rückmeldung von Stefan zur Rollenzuordnung einarbeiten',
  nextStepStale: false,
  waitingOn: [
    { who: 'Stefan', what: 'Freigabe des Rollenkonzepts', since: '2026-08-04', due: '2026-08-12' },
  ],
  tags: ['auth0', 'infrastruktur'],
  modules: ['identity-management'],
  repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure'],
  lastTouch: NOW,
  lastTouchSource: 'file',
  ageDays: 0,
  stale: false,
  todoCount: 3,
  openTodoCount: 2,
  excerpt: 'Rollenkonzept liegt bei Stefan zur Freigabe.',
};

/* One area with two entries — enough for a list, a section and a move target.
   `excerpt` is the preview here, exactly as `areas:list` delivers it; the full
   text of an entry comes from `areas:notes`. */
export const area: Area = {
  path: 'areas/gesundheit.md',
  slug: 'gesundheit',
  title: 'Gesundheit',
  scope: 'private',
  hash: 'demo-hash',
  noteCount: 2,
  openTodoCount: 1,
  notes: [
    {
      day: '2026-08-04',
      heading: '2026-08-04',
      line: 22,
      excerpt: 'Zwei Wochen Schlafprotokoll: vor Mitternacht ins Bett zu gehen wirkt mehr.',
    },
    {
      day: '2026-07-28',
      heading: '2026-07-28',
      line: 12,
      excerpt: 'Kurze Pausen alle 45 Minuten haben mehr gebracht als jede neue Übung.',
    },
  ],
};

export const todo: Todo = {
  id: 'todo-1',
  text: 'Rollen-Mapping dokumentieren',
  state: 'open',
  scope: 'work',
  path: project.path,
  line: 24,
  project: project.slug,
  projectTitle: project.title,
  area: null,
  due: '2026-08-15',
  waitingFor: null,
  neededBy: null,
  priority: 2,
  tags: [],
  createdAt: NOW,
  doneAt: null,
  dueInDays: 5,
};

export const dump: DumpItem = {
  path: 'inbox/2026-08-10-1432-deployment-pipeline.md',
  id: 'dump-1',
  title: 'Gedanke zur Deployment-Pipeline',
  text: 'Die Pipeline braucht einen Schritt, der die Migrationen vorher prüft.',
  created: NOW,
  origin: 'quick-capture',
  status: 'raw',
  ageDays: 0,
  wordCount: 12,
  tags: [],
  scope: 'work',
  filedInto: null,
  filedAt: null,
};

export const proposal: FilingProposal = {
  dumpPath: dump.path,
  title: dump.title,
  scope: 'work',
  tags: ['deployment'],
  primary: {
    target: 'project',
    path: project.path,
    section: 'Notizen',
    content: dump.text,
  },
  extras: [],
  alternatives: [],
  confidence: 0.72,
  reason: 'Der Text nennt die Pipeline dieses Projekts.',
  todos: [],
  waitingOn: [],
  entities: ['Deployment-Pipeline'],
  heuristic: true,
  createdAt: NOW,
};

export const journalDay: JournalDay = {
  path: `journal/2026/08/${TODAY}.md`,
  date: TODAY,
  title: 'Montag, 10. August 2026',
  mood: 3,
  energy: 2,
  people: ['Stefan'],
  projects: [project.slug],
  tags: [],
  excerpt: 'Vormittag mit dem Rollenkonzept verbracht.',
  wordCount: 180,
  turns: 2,
};

export const knowledgeModule: KnowledgeModule = {
  slug: 'identity-management',
  title: 'Identity management',
  description: 'Alles zu Rollen, Rechten und Anmeldeverfahren.',
  created: '2026-07-02T10:00:00+02:00',
  updated: NOW,
  counts: { sources: 3, entities: 4, concepts: 5 },
  findingCount: 2,
  lastIngest: NOW,
  tags: ['auth'],
};

export const wikiPage: WikiPage = {
  path: 'modules/identity-management/wiki/concepts/rollenbasierte-zugriffskontrolle.md',
  module: knowledgeModule.slug,
  slug: 'rollenbasierte-zugriffskontrolle',
  title: 'Rollenbasierte Zugriffskontrolle',
  type: 'concept',
  created: '2026-07-02',
  updated: TODAY,
  tags: ['rbac'],
  sources: ['s-2026-07-02-auth0-rbac-guide'],
  outbound: ['auth0'],
  inbound: ['index'],
  excerpt: 'Rechte hängen an Rollen, nicht an Personen.',
  wordCount: 420,
};

export const searchHit: SearchHit = {
  path: wikiPage.path,
  title: wikiPage.title,
  docType: 'concept',
  module: knowledgeModule.slug,
  score: 0.86,
  snippet: 'Rechte hängen an **Rollen**, nicht an Personen.',
  updated: TODAY,
  tags: ['rbac'],
};

export const chatThread: ChatThread = {
  id: 'thread-1',
  kind: 'ask',
  title: 'Was weiß ich über Rollenkonzepte?',
  created: NOW,
  updated: NOW,
  messages: [
    { id: 'm-1', role: 'user', content: 'Was weiß ich über Rollenkonzepte?', at: NOW },
    {
      id: 'm-2',
      role: 'assistant',
      content: 'Rechte hängen an Rollen, nicht an Personen.',
      at: NOW,
      citations: [{ path: wikiPage.path, title: wikiPage.title, quote: wikiPage.excerpt, line: 7 }],
    },
  ],
  context: null,
};

export const ingestJob: IngestJob = {
  id: 'job-1',
  kind: 'youtube',
  input: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
  label: 'Your AI second brain is slowly rotting',
  module: knowledgeModule.slug,
  stage: 'done',
  progress: 1,
  message: null,
  error: null,
  startedAt: NOW,
  finishedAt: NOW,
  rawPath: 'raw/youtube/xOFkpf9KgKg',
  touchedPages: [wikiPage.path],
};

export const reminder: Reminder = {
  id: 'reminder-1',
  source: 'waiting-overdue',
  urgency: 'soon',
  title: 'Stefan: Freigabe des Rollenkonzepts',
  date: '2026-08-12',
  daysOut: 2,
  scope: 'work',
  path: project.path,
  project: project.slug,
  who: 'Stefan',
};

export const claudeSession: ClaudeSession = {
  id: 'session-1',
  cwd: 'C:/development/Kunde/Nyota-Auth0-Infrastructure',
  projectName: 'Nyota-Auth0-Infrastructure',
  vaultProject: project.slug,
  gitBranch: 'main',
  startedAt: NOW,
  lastActivity: NOW,
  messageCount: 34,
  firstPrompt: 'Terraform-State auf den neuen Mandanten migrieren',
  summary: 'State migriert, Rollen noch offen.',
  files: ['main.tf', 'roles.tf'],
  model: null,
  subagents: null,
  contextTokens: null,
};

/* The mock report carries three kinds of findings, because the maintenance
   screen shows three paths: one without a fix, one with a written line
   (including preview), and a contradiction with its own presentation.
   Without the third, the most important finding type would never show
   up in the browser. */
export const gardenerReport: GardenerReport = {
  ranAt: NOW,
  usedLlm: false,
  findings: [
    {
      id: 'finding-1',
      kind: 'project-without-next-step',
      severity: 'warn',
      title: 'Projekt ohne nächsten Schritt: Nyota Auth0 Migration',
      detail: 'Status wartet. Ohne nächsten Schritt fehlt der Satz, der den Wiedereinstieg trägt.',
      paths: [project.path],
      module: null,
      foundAt: NOW,
      fix: null,
    },
    {
      id: 'finding-2',
      kind: 'stale-page',
      severity: 'info',
      title: 'Seit 200 Tagen nicht geprüft: Rollenbasierte Zugriffskontrolle',
      detail: 'Zuletzt geprüft am 2026-01-23. Ob der Stand noch gilt, weiß nur ein Mensch.',
      paths: [wikiPage.path],
      module: knowledgeModule.slug,
      foundAt: NOW,
      fix: {
        action: 'mark-reviewed',
        label: 'Als geprüft markieren',
        preview: `reviewed: ${TODAY}`,
      },
    },
    {
      id: 'finding-3',
      kind: 'contradiction',
      severity: 'high',
      title: 'Widerspruch: Rollenbasierte Zugriffskontrolle und Mandantentrennung',
      detail:
        'Die eine Seite nennt 15 Minuten, die andere eine Stunde. Beide Fassungen bleiben stehen; benannt wird der Konflikt, nicht geglättet.',
      paths: [wikiPage.path, `modules/${knowledgeModule.slug}/wiki/concepts/mandantentrennung.md`],
      module: knowledgeModule.slug,
      foundAt: NOW,
      fix: {
        action: 'add-links',
        label: 'Widerspruch benennen',
        preview:
          '- [[mandantentrennung]] widerspricht: Die eine Seite nennt 15 Minuten, die andere eine Stunde.',
      },
    },
  ],
  health: 84,
  healthKnown: true,
  healthContributions: [
    { kind: 'contradiction', count: 1, points: 10 },
    { kind: 'project-without-next-step', count: 1, points: 4 },
    { kind: 'stale-page', count: 1, points: 2 },
  ],
  advice: ['Einen nächsten Schritt für ein Projekt festlegen.'],
};
