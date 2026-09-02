/* All query keys in one place. Anyone creating a query takes a key from
   here — otherwise `events.ts` can't invalidate it selectively. */

export const qk = {
  vault: {
    status: () => ['vault', 'status'] as const,
    recent: () => ['vault', 'recent'] as const,
    doc: (path: string) => ['vault', 'doc', path] as const,
    tree: (dir: string) => ['vault', 'tree', dir] as const,
    /** The section-heading migration plan (024, D7/D8) for one target
        document language — queried live, not only right after a switch, so
        the offer in `SectionMigrationCard` survives a reload. */
    sectionPlan: (to: string) => ['vault', 'sectionPlan', to] as const,
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
  condense: {
    /** `unit` is part of the key — an area and a project can share a slug,
        and without the discriminator they'd collide on one cache entry:
        opening the area's tab would then serve its content, hash and path
        to the project's tab (and vice versa), asking the human to confirm
        the wrong artifact (045 review finding). */
    read: (unit: string, slug: string) => ['condense', 'read', unit, slug] as const,
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
    recommendations: () => ['llm', 'recommendations'] as const,
    /* Whether a local runtime is installed/running (019c; 033 adds `runtime`
       so Ollama's and llama.cpp's cards each keep their own cache entry
       instead of overwriting one another) — distinct from `detect()`, which
       probes every local preset's endpoint at once. */
    runtimeStatus: (runtime: string) => ['llm', 'runtimeStatus', runtime] as const,
    runtimeInstallPlan: (runtime: string) => ['llm', 'runtimeInstallPlan', runtime] as const,
    /* llama.cpp-only (034, D4): the engine's own status (ownership + port)
       and the derived start plan, each their own cache entry so a stop/start
       can invalidate them without touching the generic `runtimeStatus`. */
    llamaEngineStatus: () => ['llm', 'llamaEngineStatus'] as const,
    llamaStartPlan: () => ['llm', 'llamaStartPlan'] as const,
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
  'condense',
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
