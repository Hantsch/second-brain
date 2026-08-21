/* Mock bridge: the same API as `window.sb`, but with fixture data.
   It takes over when the renderer runs without Electron — in the browser
   and in tests. There is a response for EVERY channel in `IPC_CHANNELS`;
   the type below enforces that at compile time. */

import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { RawSource, RecommendationSet, WriteResult } from '@shared/types';
import type { SbBridge } from './bridge';
import { encodeIpcError } from './ipc-error';
import * as fx from './mock-fixtures';
import * as st from './mock-settings';

const writeResult: WriteResult = { path: fx.doc.path, hash: 'demo-hash', created: false };

/* Ten tasks — one per `TASK_KINDS` entry, in `mock-settings.ts`'s order —
   covering every reason and tradeoff key at least once: a sensitive task
   with nothing reachable (`classify-dump`), a sensitive task with a local
   pick and a policy citation (`journal-chat`), a needs-download local pick
   (`wiki-ingest`), priced cloud picks with and without a cheaper/local
   alternative, and a non-sensitive task with nothing reachable
   (`project-status`). Exercises `RecommendationSection` meaningfully instead
   of the empty task list D6-D8 shipped with. */
const recommendationSet: RecommendationSet = {
  catalogueGeneratedAt: fx.NOW,
  catalogueStale: true,
  tasks: [
    {
      task: 'classify-dump',
      pick: null,
      reasonKey: 'sensitive-rule-no-qualifying-target',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'title-tags',
      pick: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      reasonKey: 'best-fit-for-task',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'extract-tasks',
      pick: { providerId: 'openai', model: 'gpt-4o-mini' },
      reasonKey: 'cheapest-reachable',
      tradeoffKey: 'cheaper-alternative-available',
      costPerRun: 0.0012,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [{ providerId: 'ollama-1', model: 'llama3.1:8b' }],
    },
    {
      task: 'summarize-source',
      pick: { providerId: 'anthropic', model: 'claude-3-5-haiku' },
      reasonKey: 'best-fit-for-task',
      tradeoffKey: null,
      costPerRun: 0.0034,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'wiki-ingest',
      pick: { providerId: 'openai-compatible', model: 'qwen2.5:32b' },
      reasonKey: 'only-local-option',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: 18,
      alternatives: [],
    },
    {
      task: 'query-answer',
      pick: { providerId: 'anthropic', model: 'claude-3-5-sonnet' },
      reasonKey: 'best-fit-for-task',
      tradeoffKey: 'cheaper-alternative-available',
      costPerRun: 0.021,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [{ providerId: 'ollama-1', model: 'qwen2.5:32b' }],
    },
    {
      task: 'query-rerank',
      pick: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      reasonKey: 'best-fit-for-task',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'journal-chat',
      pick: { providerId: 'ollama-1', model: 'llama3.1:8b' },
      reasonKey: 'only-local-option',
      tradeoffKey: null,
      costPerRun: null,
      policySource: 'vault settings.json: llm.sensitivePolicy',
      policyReadAt: fx.NOW,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'project-status',
      pick: null,
      reasonKey: 'no-reachable-model',
      tradeoffKey: null,
      costPerRun: null,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [],
    },
    {
      task: 'gardener-audit',
      pick: { providerId: 'openai', model: 'gpt-4o-mini' },
      reasonKey: 'cheapest-reachable',
      tradeoffKey: 'cheaper-alternative-available',
      costPerRun: 0.0009,
      policySource: null,
      policyReadAt: null,
      needsDownloadGb: null,
      alternatives: [{ providerId: 'ollama-1', model: 'llama3.1:8b' }],
    },
  ],
};

const rawSource: RawSource = {
  path: 'raw/youtube/xOFkpf9KgKg',
  title: 'Your AI second brain is slowly rotting',
  kind: 'youtube',
  ingestedAt: fx.NOW,
  sourcePage: 's-2026-08-10-ai-second-brain-rotting',
  origin: 'https://www.youtube.com/watch?v=xOFkpf9KgKg',
  bytes: 48210,
  modules: [fx.knowledgeModule.slug],
};

type MockResponses = {
  [K in IpcChannel]: (request: IpcRequest<K>) => IpcResponse<K>;
};

const RESPONSES: MockResponses = {
  'vault:status': () => fx.vaultStatus,
  'vault:choose': () => fx.vaultStatus,
  'vault:open': () => fx.vaultStatus,
  'vault:create': () => fx.vaultStatus,
  'vault:close': () => ({ ...fx.vaultStatus, root: null, name: null, ready: false, docCount: 0 }),
  'vault:recent': () => [{ path: 'C:/vaults/demo', name: 'Demo-Vault', exists: true }],
  'vault:read': () => fx.doc,
  'vault:write': () => writeResult,
  'vault:delete': () => ({ undoToken: 'demo-undo' }),
  'vault:tree': () => [
    { path: 'inbox', dir: true, size: 0 },
    { path: 'projects', dir: true, size: 0 },
  ],

  'index:stats': () => fx.indexStats,
  'index:rebuild': () => fx.indexStats,
  'search:query': () => [fx.searchHit],

  'capture:dump': ({ text, origin }) => ({ ...fx.dump, text, origin }),
  'capture:inbox': () => [fx.dump],
  'capture:classify': () => fx.proposal,
  'capture:apply': () => ({
    dumpPath: fx.dump.path,
    written: [fx.project.path],
    movedTo: null,
    undoToken: 'demo-undo',
  }),
  'capture:keep': () => ({ dump: { ...fx.dump, status: 'kept' }, undoToken: 'demo-undo' }),
  'capture:discard': () => ({ undoToken: 'demo-undo' }),
  'capture:undo': () => undefined,
  'capture:window': () => undefined,

  'projects:list': () => [fx.project],
  'projects:get': () => ({ project: fx.project, doc: fx.doc }),
  'projects:create': ({ title, scope }) => ({ ...fx.project, title, scope }),
  'projects:patch': () => fx.project,
  'projects:append': () => writeResult,
  /* `block` is what the undo gets handed back. Shaped like `filingBlock` in
     `@core/capture`, written out here rather than imported: the renderer does
     not reach into the core. */
  'projects:createNote': ({ text }) => ({
    ...writeResult,
    path: fx.project.path,
    block: `### ${fx.TODAY}\n\n${text.trim()}`,
  }),
  'projects:removeNote': () => ({ ...writeResult, path: fx.project.path }),
  'projects:suggestStatus': () => ({
    status: 'active',
    nextStep: fx.project.nextStep ?? '',
    reason: 'Seit der Freigabe ist wieder Bewegung im Projekt.',
    /* The mock has a model — otherwise the screenshot would claim an
       interpreted suggestion that no one actually interpreted. */
    heuristic: false,
  }),
  'projects:resolveWaiting': () => ({ ...fx.project, waitingOn: [] }),

  'areas:list': () => [fx.area],
  /* The full entry, not the preview — that is what this channel is for. */
  'areas:notes': () => fx.area.notes,
  'areas:createNote': () => ({ ...writeResult, path: fx.area.path }),
  'areas:create': ({ title }) => ({ ...fx.area, title, slug: 'neuer-bereich', notes: [] }),
  'areas:moveNote': () => ({
    from: { ...writeResult, path: fx.area.path },
    to: { ...writeResult, path: 'areas/haus.md' },
  }),

  'todos:list': () => [fx.todo],
  'todos:toggle': () => ({ ...fx.todo, state: 'done', doneAt: fx.NOW }),
  'todos:create': ({ text, scope }) => ({ ...fx.todo, text, scope }),
  'todos:update': ({ text }) => ({ ...fx.todo, text: text ?? fx.todo.text }),
  'todos:reorder': () => [fx.todo],

  'journal:list': () => [fx.journalDay],
  /* The day comes in sections — this way the browser-mode view shows day
     text, two rounds of conversation, and one facts line. */
  'journal:get': () => ({
    day: fx.journalDay,
    doc: { ...fx.doc, path: fx.journalDay.path },
    text: fx.journalDay.excerpt,
    /* Same two rounds as `turns` below, in the shape the "Day" stream (011)
       shows them in — an `entry` for my words, an `answer` for the app's. */
    stream: [
      { kind: 'entry', text: 'Der Sprint fühlt sich unmöglich an.', at: null },
      {
        kind: 'answer',
        text: 'Zwei der drei offenen Punkte warten auf andere. Was heute an dir hing, ist fertig.',
        at: '18:40',
      },
    ],
    turns: [
      { role: 'user', text: 'Der Sprint fühlt sich unmöglich an.', at: '18:40' },
      {
        role: 'assistant',
        text: 'Zwei der drei offenen Punkte warten auf andere. Was heute an dir hing, ist fertig.',
        at: '18:40',
      },
    ],
    facts: '- [ ] Stefan wegen Rollenkonzept nachfassen @due:2026-08-12',
  }),
  'journal:append': () => ({ ...writeResult, path: fx.journalDay.path }),
  'journal:setDay': () => ({ ...writeResult, path: fx.journalDay.path }),
  'journal:setMood': ({ mood }) => ({ ...fx.journalDay, mood: mood ?? fx.journalDay.mood }),
  'journal:setClosed': ({ closed }) => ({
    ...fx.journalDay,
    closed: closed ? fx.TODAY : null,
  }),
  'journal:coach': () => ({ threadId: `journal-${fx.journalDay.date}`, messageId: 'm-demo' }),
  'journal:abort': () => undefined,
  'journal:close': () => ({
    date: fx.journalDay.date,
    path: fx.journalDay.path,
    proposal: fx.proposal,
    frontmatter: {
      people: fx.journalDay.people,
      projects: fx.journalDay.projects,
      mood: 3,
      energy: 2,
      tags: [],
    },
    heuristic: true,
  }),
  'journal:applyClose': () => ({ written: [fx.journalDay.path], undo: [] }),
  'journal:foldDay': () => ({ ...writeResult, path: fx.journalDay.path }),
  'journal:interviewPlan': () => ({
    steps: [
      { topic: 'events', question: 'Was ist heute passiert, das dir aufgefallen ist?' },
      { topic: 'open', question: 'Was ist noch offen?' },
    ],
    mode: 'fixed',
    finished: false,
  }),
  'journal:interviewAnswer': () => ({ ...writeResult, path: fx.journalDay.path, at: '14:32' }),
  'journal:interviewFollowUp': () => ({ question: null, noModel: true }),

  'modules:list': () => [fx.knowledgeModule],
  'modules:create': ({ title, description }) => ({ ...fx.knowledgeModule, title, description }),
  'modules:pages': () => [fx.wikiPage],
  /* A body with one valid and one broken wikilink — this way the browser-mode
     view shows both cases. */
  'modules:page': () => ({
    page: fx.wikiPage,
    doc: {
      ...fx.doc,
      path: fx.wikiPage.path,
      body: 'Rechte hängen an Rollen, nicht an Personen (source: [[s-2026-07-02-auth0-rbac-guide]]).\n\nMehr dazu in [[auth0]]; [[device-code-flow]] gibt es absichtlich nicht.\n',
    },
  }),
  'modules:savePage': () => ({ ...writeResult, path: fx.wikiPage.path }),
  'modules:sources': () => [rawSource],
  /* IDs are `module/slug` — the same form as `outbound`/`inbound`. */
  'modules:graph': () => ({
    nodes: [
      {
        id: `${fx.wikiPage.module}/${fx.wikiPage.slug}`,
        title: fx.wikiPage.title,
        type: 'concept',
      },
      { id: `${fx.wikiPage.module}/auth0`, title: 'Auth0', type: 'entity' },
    ],
    edges: [[`${fx.wikiPage.module}/${fx.wikiPage.slug}`, `${fx.wikiPage.module}/auth0`]],
  }),

  /* The message ID already present in the fixture conversation: without
     events (the mock bridge sends none) a new ID would be a stream that
     never ends — and a screen that offers "cancel" forever. */
  'chat:ask': () => ({ threadId: fx.chatThread.id, messageId: 'm-2' }),
  'chat:threads': () => [fx.chatThread],
  'chat:thread': () => fx.chatThread,
  'chat:delete': () => undefined,
  'chat:abort': () => undefined,
  'chat:fileBack': () => ({ ...writeResult, path: fx.wikiPage.path }),

  'ingest:start': ({ kind, input }) => ({ ...fx.ingestJob, kind, input, stage: 'queued' }),
  'ingest:jobs': () => [fx.ingestJob],
  'ingest:cancel': () => undefined,
  'ingest:retry': () => ({ ...fx.ingestJob, stage: 'queued', progress: 0 }),
  'ingest:condense': ({ path, module }) => ({
    ...fx.ingestJob,
    rawPath: path,
    module,
    stage: 'queued',
    progress: 0,
  }),
  'ingest:detail': () => ({ source: rawSource, resourceReport: null, attachments: [] }),
  'ingest:analyzeResources': () => ({
    source: rawSource,
    resourceReport: null,
    attachments: [],
  }),
  'ingest:attachFiles': () => ({ source: rawSource, resourceReport: null, attachments: [] }),
  'ingest:pickFiles': () => [],
  'ingest:ytdlpStatus': () => ({ available: false, path: null, version: null }),
  'ingest:ytdlpInstall': () => ({ available: false, path: null, version: null }),

  'llm:presets': () => st.presets,
  'llm:providers': () => st.providers,
  'llm:addProvider': ({ label, kind, baseUrl, local }) => ({
    id: 'provider-demo',
    label,
    kind,
    baseUrl,
    hasKey: false,
    local: local ?? false,
    enabled: true,
    models: [],
    createdAt: fx.NOW,
  }),
  'llm:updateProvider': ({ id, patch }) => ({
    id,
    label: patch.label ?? 'Demo',
    kind: patch.kind ?? 'openai-compatible',
    baseUrl: patch.baseUrl ?? 'http://127.0.0.1:11434/v1',
    hasKey: patch.hasKey ?? false,
    local: patch.local ?? true,
    enabled: patch.enabled ?? true,
    models: patch.models ?? [],
    createdAt: fx.NOW,
  }),
  'llm:removeProvider': () => undefined,
  'llm:probe': ({ id }) => ({
    id,
    label: 'Demo',
    kind: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    hasKey: false,
    local: true,
    enabled: true,
    models: [],
    probe: { ok: false, at: fx.NOW, error: 'kein Provider im Browser-Modus' },
    createdAt: fx.NOW,
  }),
  'llm:models': () => [],
  'llm:detectLocal': () => [
    {
      presetId: 'ollama',
      label: 'Ollama',
      baseUrl: 'http://localhost:11434/v1',
      running: false,
      models: [],
      configured: false,
    },
  ],
  'llm:localRuntimeStatus': () => 'absent',
  /* Honest like `llm:scanMachine` above: the browser-mode mock has no real
     platform or disk facts, so it reports the install as blocked rather than
     pretending a download would work. */
  'llm:runtimeInstallPlan': () => ({
    canInstall: false,
    blockedReason: 'unsupported-platform',
    downloadMb: 0,
    installerPath: '',
    modelDirHint: '',
  }),
  'llm:downloadRuntime': () => {
    throw encodeIpcError({
      code: 'invalid',
      message: 'im Browser-Modus ist keine App-interne Installation möglich',
    });
  },
  'llm:cancelRuntimeDownload': () => undefined,
  /* Same honesty as `llm:downloadRuntime` above: nothing was ever downloaded
     or started in browser mode, so both report the "nothing to do" case
     rather than pretending a runtime exists. */
  'llm:openRuntimeInstaller': () => ({ opened: false, reason: 'no-installer-downloaded' }),
  'llm:startLocalRuntime': () => ({ started: false, status: 'absent', reason: 'spawn-failed' }),
  /* And for the same reason there is no runtime to pull a model into: a fake
     progress stream would be the one thing this mock must not invent. */
  'llm:pullModel': () => {
    throw encodeIpcError({
      code: 'invalid',
      message: 'im Browser-Modus läuft keine lokale Laufzeit',
    });
  },
  'llm:cancelPull': () => undefined,
  'llm:tasks': () => st.tasks,
  'llm:routing': () => st.routing,
  'llm:setRoute': () => st.routing,
  'llm:setDefault': () => st.routing,
  'llm:suggestRouting': () => st.routing,
  'llm:testTask': () => ({ ok: false, latencyMs: 0, sample: '', error: 'llm-unavailable' }),
  'llm:scanMachine': () => ({
    facts: {
      totalRamMb: null,
      cpuCores: null,
      platform: null,
      arch: null,
      freeDiskMb: null,
      vramMb: null,
      gpuName: null,
      gpuDetection: 'not-attempted',
    },
    /* No real facts in the mock bridge, so `judgeCapacity` (main-side, D3)
       would come back unable to judge anything — mirrored here by hand since
       this fake has no access to `core/llm`. */
    verdict: {
      limitingFactor: 'unknown',
      maxComfortableParamsB: null,
      maxPossibleParamsB: null,
      tiersThatFit: [],
      heuristic: true,
      unknowns: ['ram', 'cpu'],
    },
    scannedAt: fx.NOW,
  }),
  'llm:recommendModels': () => recommendationSet,

  'dashboard:data': () => ({
    reminders: [fx.reminder],
    recentWork: [
      {
        at: fx.NOW,
        kind: 'file',
        title: fx.project.title,
        detail: 'Stand aktualisiert',
        path: fx.project.path,
        project: fx.project.slug,
        scope: 'work',
      },
    ],
    staleProjects: [],
    todos: { work: [fx.todo], private: [] },
    waitingOn: [
      {
        ...(fx.project.waitingOn[0] ?? { who: 'Stefan', what: 'Freigabe', since: '2026-08-04' }),
        project: fx.project.slug,
        projectTitle: fx.project.title,
        path: fx.project.path,
      },
    ],
    inboxCount: 1,
    journal: { streak: 3, lastEntry: fx.TODAY, moodTrend: [3, 4, 3] },
    health: fx.gardenerReport.health,
    findingCount: fx.gardenerReport.findings.length,
    /* The mock has a maintenance report (`gardener:report`), so the tile may
       show the value. Without this field it says "not checked yet" — which
       is exactly what the real app does while a maintenance run is missing. */
    healthKnown: true,
    sessions: [fx.claudeSession],
  }),
  'dashboard:layout': () => st.dashboardLayout,
  'dashboard:setLayout': ({ layout }) => layout,

  'reminders:list': () => [fx.reminder],
  'reminders:snooze': () => undefined,
  'reminders:unsnooze': () => undefined,

  'gardener:report': () => fx.gardenerReport,
  'gardener:run': () => fx.gardenerReport,
  'gardener:cancel': () => undefined,
  'gardener:dismiss': () => undefined,
  'gardener:undismiss': () => undefined,
  /* The mock writes nothing — it returns what a fix would return. */
  'gardener:applyFix': ({ finding }) => ({
    written: finding.fix === null ? [] : [finding.paths[0] ?? fx.wikiPage.path],
    undoToken: 'demo-undo',
  }),
  'gardener:undoFix': () => ({ restored: [fx.wikiPage.path], kept: [] }),
  /* Preview and confirm read/write nothing real in the mock — same fixture
     page both times, so a screen wiring the two calls sees a consistent path. */
  'gardener:discardPlan': () => ({
    target: { ...fx.wikiPage, hash: 'demo-hash' },
    inbound: [],
    catalogPath: `modules/${fx.wikiPage.module}/wiki/index.md`,
    catalogLine: `- [[${fx.wikiPage.slug}]] — ${fx.wikiPage.excerpt}`,
    repoints: [],
  }),
  'gardener:discardPage': () => ({
    discarded: fx.wikiPage.path,
    written: [`modules/${fx.wikiPage.module}/wiki/index.md`],
    undoToken: 'demo-undo',
    logged: null,
  }),
  'gardener:supersede': () => ({ written: fx.wikiPage.path, undoToken: 'demo-undo', logged: null }),

  'claude:sessions': () => [fx.claudeSession],
  'claude:link': () => undefined,

  /* D1 of the agent session browser only defines the contract — no fixture
     data yet, so the mock returns "nothing found" for all three channels. */
  'agents:projects': () => [],
  'agents:sessions': () => [],
  'agents:transcript': () => ({ entries: [], nextCursor: null, totalKnown: true }),
  'agents:link': () => undefined,

  'settings:get': () => st.settingsSnapshot,
  'settings:setApp': () => st.settingsSnapshot,
  'settings:setVault': () => st.settingsSnapshot,
  'settings:setLanguages': () => st.settingsSnapshot,

  'window:minimize': () => undefined,
  'window:toggleMaximize': () => ({ maximized: false }),
  'window:close': () => undefined,
  'window:isMaximized': () => false,
  'window:show': () => undefined,

  'shell:openPath': () => undefined,
  'shell:openExternal': () => undefined,
  'shell:showInFolder': () => undefined,
  'app:info': () => fx.appInfo,
};

export const mockBridge: SbBridge = {
  invoke: async (channel, payload) => {
    const handler = RESPONSES[channel];
    if (!handler) {
      throw encodeIpcError({ code: 'invalid', message: `unbekannter Kanal: ${channel}` });
    }
    /* The relationship between channel, request, and response is checked via
       `MockResponses`; the generic signature here is beyond what TypeScript
       can still follow. */
    const respond = handler as (request: unknown) => unknown;
    return respond(payload) as Awaited<ReturnType<SbBridge['invoke']>>;
  },
  on: () => () => undefined,
  off: () => undefined,
};
