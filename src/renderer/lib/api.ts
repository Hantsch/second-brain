/* Der typisierte IPC-Client des Renderers, nach Bereichen gruppiert.
   Kein Component ruft `window.sb` direkt — alles geht über `api`. Fehler kommen
   immer als `IpcCallError` zurück, also in `IpcError`-Form. */

import type { IpcChannel, IpcError, IpcRequest, IpcResponse } from '@shared/ipc';
import type { AgentKind, DocLanguage, UiLanguage } from '@shared/types';
import { bridge } from './bridge';
import { decodeIpcError } from './ipc-error';

/** Ein fehlgeschlagener IPC-Aufruf, mit dem `code`, aus dem der Renderer formuliert. */
export class IpcCallError extends Error implements IpcError {
  readonly code: IpcError['code'];
  readonly detail?: unknown;

  constructor(error: IpcError) {
    super(error.message);
    this.name = 'IpcCallError';
    this.code = error.code;
    if (error.detail !== undefined) this.detail = error.detail;
  }
}

export async function call<K extends IpcChannel>(
  channel: K,
  payload?: IpcRequest<K>,
): Promise<IpcResponse<K>> {
  try {
    return await bridge().invoke(channel, payload);
  } catch (error) {
    throw new IpcCallError(decodeIpcError(error));
  }
}

export const api = {
  vault: {
    status: () => call('vault:status'),
    choose: () => call('vault:choose'),
    open: (path: string) => call('vault:open', { path }),
    create: (path: string, name: string) => call('vault:create', { path, name }),
    close: () => call('vault:close'),
    recent: () => call('vault:recent'),
    read: (path: string) => call('vault:read', { path }),
    write: (request: IpcRequest<'vault:write'>) => call('vault:write', request),
    remove: (path: string) => call('vault:delete', { path }),
    tree: (dir?: string) => call('vault:tree', dir === undefined ? {} : { dir }),
  },
  index: {
    stats: () => call('index:stats'),
    rebuild: () => call('index:rebuild'),
  },
  search: {
    query: (text: string, options: Omit<IpcRequest<'search:query'>, 'text'> = {}) =>
      call('search:query', { text, ...options }),
  },
  capture: {
    dump: (request: IpcRequest<'capture:dump'>) => call('capture:dump', request),
    inbox: () => call('capture:inbox'),
    classify: (path: string) => call('capture:classify', { path }),
    apply: (proposal: IpcRequest<'capture:apply'>['proposal']) =>
      call('capture:apply', { proposal }),
    keep: (path: string) => call('capture:keep', { path }),
    discard: (path: string) => call('capture:discard', { path }),
    undo: (undoToken: string) => call('capture:undo', { undoToken }),
    window: (show: boolean) => call('capture:window', { show }),
  },
  projects: {
    list: (request: IpcRequest<'projects:list'> = {}) => call('projects:list', request),
    get: (slug: string) => call('projects:get', { slug }),
    create: (request: IpcRequest<'projects:create'>) => call('projects:create', request),
    patch: (request: IpcRequest<'projects:patch'>) => call('projects:patch', request),
    append: (request: IpcRequest<'projects:append'>) => call('projects:append', request),
    createNote: (request: IpcRequest<'projects:createNote'>) =>
      call('projects:createNote', request),
    removeNote: (request: IpcRequest<'projects:removeNote'>) =>
      call('projects:removeNote', request),
    suggestStatus: (slug: string) => call('projects:suggestStatus', { slug }),
    resolveWaiting: (slug: string, index: number) =>
      call('projects:resolveWaiting', { slug, index }),
  },
  todos: {
    list: (request: IpcRequest<'todos:list'> = {}) => call('todos:list', request),
    toggle: (id: string) => call('todos:toggle', { id }),
    create: (request: IpcRequest<'todos:create'>) => call('todos:create', request),
    update: (request: IpcRequest<'todos:update'>) => call('todos:update', request),
    reorder: (request: IpcRequest<'todos:reorder'>) => call('todos:reorder', request),
  },
  areas: {
    list: () => call('areas:list'),
    notes: (slug: string) => call('areas:notes', { slug }),
    createNote: (request: IpcRequest<'areas:createNote'>) => call('areas:createNote', request),
    create: (title: string) => call('areas:create', { title }),
    moveNote: (request: IpcRequest<'areas:moveNote'>) => call('areas:moveNote', request),
  },
  journal: {
    list: (limit?: number) => call('journal:list', limit === undefined ? {} : { limit }),
    get: (date: string) => call('journal:get', { date }),
    append: (date: string, text: string) => call('journal:append', { date, text }),
    setDay: (request: IpcRequest<'journal:setDay'>) => call('journal:setDay', request),
    setMood: (request: IpcRequest<'journal:setMood'>) => call('journal:setMood', request),
    setClosed: (request: IpcRequest<'journal:setClosed'>) => call('journal:setClosed', request),
    coach: (request: IpcRequest<'journal:coach'>) => call('journal:coach', request),
    abort: (messageId: string) => call('journal:abort', { messageId }),
    close: (date: string) => call('journal:close', { date }),
    applyClose: (request: IpcRequest<'journal:applyClose'>) => call('journal:applyClose', request),
    foldDay: (date: string, expectedHash?: string) =>
      call('journal:foldDay', { date, expectedHash }),
    interviewPlan: (date: string) => call('journal:interviewPlan', { date }),
    interviewAnswer: (
      date: string,
      step: IpcRequest<'journal:interviewAnswer'>['step'],
      answer: string,
    ) => call('journal:interviewAnswer', { date, step, answer }),
    interviewFollowUp: (
      date: string,
      step: IpcRequest<'journal:interviewFollowUp'>['step'],
      answer: string,
    ) => call('journal:interviewFollowUp', { date, step, answer }),
  },
  modules: {
    list: () => call('modules:list'),
    create: (title: string, description: string) => call('modules:create', { title, description }),
    pages: (request: IpcRequest<'modules:pages'>) => call('modules:pages', request),
    page: (path: string) => call('modules:page', { path }),
    savePage: (request: IpcRequest<'modules:savePage'>) => call('modules:savePage', request),
    sources: (module?: string) => call('modules:sources', module === undefined ? {} : { module }),
    graph: (module: string) => call('modules:graph', { module }),
  },
  chat: {
    ask: (request: IpcRequest<'chat:ask'>) => call('chat:ask', request),
    threads: (request: IpcRequest<'chat:threads'> = {}) => call('chat:threads', request),
    thread: (id: string) => call('chat:thread', { id }),
    remove: (id: string) => call('chat:delete', { id }),
    abort: (messageId: string) => call('chat:abort', { messageId }),
    fileBack: (request: IpcRequest<'chat:fileBack'>) => call('chat:fileBack', request),
  },
  ingest: {
    start: (request: IpcRequest<'ingest:start'>) => call('ingest:start', request),
    jobs: () => call('ingest:jobs'),
    cancel: (id: string) => call('ingest:cancel', { id }),
    retry: (id: string) => call('ingest:retry', { id }),
    condense: (request: IpcRequest<'ingest:condense'>) => call('ingest:condense', request),
    detail: (path: string) => call('ingest:detail', { path }),
    analyzeResources: (path: string) => call('ingest:analyzeResources', { path }),
    attachFiles: (path: string) => call('ingest:attachFiles', { path }),
    pickFiles: () => call('ingest:pickFiles'),
    ytdlpStatus: () => call('ingest:ytdlpStatus'),
    ytdlpInstall: () => call('ingest:ytdlpInstall'),
  },
  llm: {
    presets: () => call('llm:presets'),
    providers: () => call('llm:providers'),
    addProvider: (request: IpcRequest<'llm:addProvider'>) => call('llm:addProvider', request),
    updateProvider: (request: IpcRequest<'llm:updateProvider'>) =>
      call('llm:updateProvider', request),
    removeProvider: (id: string) => call('llm:removeProvider', { id }),
    probe: (id: string) => call('llm:probe', { id }),
    models: (id: string) => call('llm:models', { id }),
    detectLocal: () => call('llm:detectLocal'),
    tasks: () => call('llm:tasks'),
    routing: () => call('llm:routing'),
    setRoute: (request: IpcRequest<'llm:setRoute'>) => call('llm:setRoute', request),
    setDefault: (request: IpcRequest<'llm:setDefault'>) => call('llm:setDefault', request),
    suggestRouting: () => call('llm:suggestRouting'),
    testTask: (task: IpcRequest<'llm:testTask'>['task']) => call('llm:testTask', { task }),
    scanMachine: () => call('llm:scanMachine'),
    recommendModels: () => call('llm:recommendModels'),
    localRuntimeStatus: () => call('llm:localRuntimeStatus'),
    runtimeInstallPlan: () => call('llm:runtimeInstallPlan'),
    downloadRuntime: () => call('llm:downloadRuntime'),
    cancelRuntimeDownload: (downloadId: string) =>
      call('llm:cancelRuntimeDownload', { downloadId }),
    openRuntimeInstaller: () => call('llm:openRuntimeInstaller'),
    startLocalRuntime: () => call('llm:startLocalRuntime'),
    pullModel: (modelId: string) => call('llm:pullModel', { modelId }),
    cancelPull: (pullId: string) => call('llm:cancelPull', { pullId }),
  },
  dashboard: {
    data: () => call('dashboard:data'),
    layout: () => call('dashboard:layout'),
    setLayout: (layout: IpcRequest<'dashboard:setLayout'>['layout']) =>
      call('dashboard:setLayout', { layout }),
  },
  reminders: {
    list: () => call('reminders:list'),
    snooze: (id: string, days: number) => call('reminders:snooze', { id, days }),
    unsnooze: (id: string) => call('reminders:unsnooze', { id }),
  },
  gardener: {
    report: () => call('gardener:report'),
    run: (useLlm?: boolean) => call('gardener:run', useLlm === undefined ? {} : { useLlm }),
    cancel: () => call('gardener:cancel'),
    dismiss: (id: string) => call('gardener:dismiss', { id }),
    undismiss: (id: string) => call('gardener:undismiss', { id }),
    applyFix: (finding: IpcRequest<'gardener:applyFix'>['finding']) =>
      call('gardener:applyFix', { finding }),
    undoFix: (undoToken: string) => call('gardener:undoFix', { undoToken }),
    discardPlan: (request: IpcRequest<'gardener:discardPlan'>) =>
      call('gardener:discardPlan', request),
    discardPage: (request: IpcRequest<'gardener:discardPage'>) =>
      call('gardener:discardPage', request),
    supersede: (request: IpcRequest<'gardener:supersede'>) => call('gardener:supersede', request),
  },
  claude: {
    sessions: (limit?: number) => call('claude:sessions', limit === undefined ? {} : { limit }),
    link: (sessionId: string, project: string) => call('claude:link', { sessionId, project }),
  },
  agents: {
    projects: (agent: AgentKind) => call('agents:projects', { agent }),
    sessions: (agent: AgentKind, projectKey: string) =>
      call('agents:sessions', { agent, projectKey }),
    transcript: (request: IpcRequest<'agents:transcript'>) => call('agents:transcript', request),
    link: (agent: AgentKind, projectKey: string, project: string) =>
      call('agents:link', { agent, projectKey, project }),
  },
  settings: {
    get: () => call('settings:get'),
    setApp: (patch: IpcRequest<'settings:setApp'>['patch']) => call('settings:setApp', { patch }),
    setVault: (patch: IpcRequest<'settings:setVault'>['patch']) =>
      call('settings:setVault', { patch }),
    setLanguages: (next: { ui?: UiLanguage; documents?: DocLanguage; conversation?: UiLanguage }) =>
      call('settings:setLanguages', next),
  },
  window: {
    minimize: () => call('window:minimize'),
    toggleMaximize: () => call('window:toggleMaximize'),
    close: () => call('window:close'),
    isMaximized: () => call('window:isMaximized'),
    show: () => call('window:show'),
  },
  shell: {
    openPath: (path: string) => call('shell:openPath', { path }),
    openExternal: (url: string) => call('shell:openExternal', { url }),
    showInFolder: (path: string) => call('shell:showInFolder', { path }),
  },
  app: {
    info: () => call('app:info'),
  },
} as const;
