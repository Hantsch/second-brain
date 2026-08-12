/* Alle Query-Keys an einem Ort. Wer eine Query anlegt, nimmt einen Key von
   hier — sonst kann `events.ts` sie nicht gezielt invalidieren. */

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
    /* Dieselbe Wurzel wie die Liste: eine Dateiänderung trifft beides. */
    project: (slug: string) => ['todos', 'project', slug] as const,
  },
  journal: {
    list: () => ['journal', 'list'] as const,
    day: (date: string) => ['journal', 'day', date] as const,
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
    /* Erweitert `threads` um die Suche — damit trifft eine Invalidierung von
       `threads` auch die gefilterte Liste. */
    search: (query: string, kind?: string) => ['chat', 'threads', kind ?? 'all', query] as const,
    thread: (id: string) => ['chat', 'thread', id] as const,
  },
  ingest: {
    jobs: () => ['ingest', 'jobs'] as const,
    ytdlp: () => ['ingest', 'ytdlp'] as const,
  },
  llm: {
    presets: () => ['llm', 'presets'] as const,
    providers: () => ['llm', 'providers'] as const,
    models: (id: string) => ['llm', 'models', id] as const,
    detect: () => ['llm', 'detect'] as const,
    tasks: () => ['llm', 'tasks'] as const,
    routing: () => ['llm', 'routing'] as const,
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
  settings: {
    snapshot: () => ['settings', 'snapshot'] as const,
  },
  app: {
    info: () => ['app', 'info'] as const,
  },
} as const;

/** Wurzeln, die eine Dateiänderung im Vault betrifft. Kein Polling, nur das. */
export const VAULT_DEPENDENT_ROOTS: readonly string[] = [
  'vault',
  'index',
  'search',
  'capture',
  'projects',
  'todos',
  'journal',
  'modules',
  /* Gespräche liegen als Dateien im Vault (`.secondbrain/chats/`): wer eine
     Antwort ablegt oder ein Gespräch löscht, ändert den Vault — und die Liste
     muss das mitbekommen, nicht erst beim nächsten Stream. */
  'chat',
  'ingest',
  'dashboard',
  'reminders',
  'gardener',
  'claude',
];
