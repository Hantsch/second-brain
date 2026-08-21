/* All query keys in one place. Anyone creating a query takes a key from
   here — otherwise `events.ts` can't invalidate it selectively. */

export const qk = {
  vault: {
    status: () => ['vault', 'status'] as const,
    recent: () => ['vault', 'recent'] as const,
    doc: (path: string) => ['vault', 'doc', path] as const,
    tree: (dir: string) => ['vault', 'tree', dir] as const,
  },
  index: {
    stats: () => ['index', 'stats'] as const,
  },
  search: {
    query: (text: string) => ['search', text] as const,
  },
  capture: {
    inbox: () => ['capture', 'inbox'] as const,
    proposal: (path: string) => ['capture', 'proposal', path] as const,
  },
  projects: {
    list: (scope?: string) => ['projects', 'list', scope ?? 'all'] as const,
    detail: (slug: string) => ['projects', 'detail', slug] as const,
  },
  todos: {
    list: (scope?: string) => ['todos', 'list', scope ?? 'all'] as const,
    /* Same root as the list: a file change affects both. */
    project: (slug: string) => ['todos', 'project', slug] as const,
    area: (slug: string) => ['todos', 'area', slug] as const,
  },
  areas: {
    list: () => ['areas', 'list'] as const,
    notes: (slug: string) => ['areas', 'notes', slug] as const,
  },
  journal: {
    list: () => ['journal', 'list'] as const,
    day: (date: string) => ['journal', 'day', date] as const,
    /** The interview plan (012): read once per opening of the overlay, never
        invalidated by a file change — a run's step list is fixed for its
        duration (Decisions: "the five topics are never extended"). */
    interview: (date: string) => ['journal', 'interview', date] as const,
  },
  modules: {
    list: () => ['modules', 'list'] as const,
    pages: (module: string) => ['modules', 'pages', module] as const,
    page: (path: string) => ['modules', 'page', path] as const,
    sources: (module?: string) => ['modules', 'sources', module ?? 'all'] as const,
    graph: (module: string) => ['modules', 'graph', module] as const,
  },
  chat: {
    threads: (kind?: string) => ['chat', 'threads', kind ?? 'all'] as const,
    /* Extends `threads` with the search — so invalidating `threads` also hits
       the filtered list. */
    search: (query: string, kind?: string) => ['chat', 'threads', kind ?? 'all', query] as const,
    thread: (id: string) => ['chat', 'thread', id] as const,
  },
  ingest: {
    jobs: () => ['ingest', 'jobs'] as const,
    detail: (path: string) => ['ingest', 'detail', path] as const,
    ytdlp: () => ['ingest', 'ytdlp'] as const,
  },
  llm: {
    presets: () => ['llm', 'presets'] as const,
    providers: () => ['llm', 'providers'] as const,
    models: (id: string) => ['llm', 'models', id] as const,
    detect: () => ['llm', 'detect'] as const,
    tasks: () => ['llm', 'tasks'] as const,
    routing: () => ['llm', 'routing'] as const,
    machineScan: () => ['llm', 'machineScan'] as const,
  },
  dashboard: {
    data: () => ['dashboard', 'data'] as const,
    layout: () => ['dashboard', 'layout'] as const,
  },
  reminders: {
    list: () => ['reminders', 'list'] as const,
  },
  gardener: {
    report: () => ['gardener', 'report'] as const,
  },
  claude: {
    sessions: () => ['claude', 'sessions'] as const,
  },
  agents: {
    projects: (agent: string) => ['agents', 'projects', agent] as const,
    sessions: (agent: string, projectKey: string) =>
      ['agents', 'sessions', agent, projectKey] as const,
    transcript: (agent: string, sessionId: string, cursor?: string | null) =>
      ['agents', 'transcript', agent, sessionId, cursor ?? null] as const,
  },
  settings: {
    snapshot: () => ['settings', 'snapshot'] as const,
  },
  app: {
    info: () => ['app', 'info'] as const,
  },
} as const;

/** Roots affected by a file change in the vault. No polling, only this. */
export const VAULT_DEPENDENT_ROOTS: readonly string[] = [
  'vault',
  'index',
  'search',
  'capture',
  'projects',
  'todos',
  'areas',
  'journal',
  'modules',
  /* Conversations live as files in the vault (`.secondbrain/chats/`): filing a
     reply or deleting a conversation changes the vault — and the list needs
     to pick that up, not only on the next stream. */
  'chat',
  'ingest',
  'dashboard',
  'reminders',
  'gardener',
  'claude',
  'agents',
];
