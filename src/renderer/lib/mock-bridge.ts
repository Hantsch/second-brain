/* Mock-Brücke: dieselbe API wie `window.sb`, aber mit Fixture-Daten.
   Sie greift, wenn der Renderer ohne Electron läuft — im Browser und in Tests.
   Für JEDEN Kanal aus `IPC_CHANNELS` gibt es eine Antwort; der Typ unten
   erzwingt das beim Übersetzen. */

import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import type { RawSource, WriteResult } from '@shared/types';
import type { SbBridge } from './bridge';
import { encodeIpcError } from './ipc-error';
import * as fx from './mock-fixtures';
import * as st from './mock-settings';

const writeResult: WriteResult = { path: fx.doc.path, hash: 'demo-hash', created: false };

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
  'projects:suggestStatus': () => ({
    status: 'active',
    nextStep: fx.project.nextStep ?? '',
    reason: 'Seit der Freigabe ist wieder Bewegung im Projekt.',
    /* Die Attrappe hat ein Modell — sonst behauptete der Screenshot einen
       gedeuteten Vorschlag, den niemand gedeutet hat. */
    heuristic: false,
  }),
  'projects:resolveWaiting': () => ({ ...fx.project, waitingOn: [] }),

  'todos:list': () => [fx.todo],
  'todos:toggle': () => ({ ...fx.todo, state: 'done', doneAt: fx.NOW }),
  'todos:create': ({ text, scope }) => ({ ...fx.todo, text, scope }),
  'todos:update': ({ text }) => ({ ...fx.todo, text: text ?? fx.todo.text }),
  'todos:reorder': () => [fx.todo],

  'journal:list': () => [fx.journalDay],
  /* Der Tag kommt in Abschnitten — so zeigt die Ansicht im Browser-Modus
     Tagestext, zwei Runden Gespräch und eine Fakten-Zeile. */
  'journal:get': () => ({
    day: fx.journalDay,
    doc: { ...fx.doc, path: fx.journalDay.path },
    text: fx.journalDay.excerpt,
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

  'modules:list': () => [fx.knowledgeModule],
  'modules:create': ({ title, description }) => ({ ...fx.knowledgeModule, title, description }),
  'modules:pages': () => [fx.wikiPage],
  /* Ein Rumpf mit einem gültigen und einem kaputten Wikilink — so zeigt die
     Ansicht im Browser-Modus beide Fälle. */
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
  /* Kennungen sind `modul/slug` — dieselbe Form wie `outbound`/`inbound`. */
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

  /* Die Marke der Antwort, die im Fixture-Gespräch schon steht: ohne Ereignisse
     (die Mock-Brücke schickt keine) wäre eine neue Marke ein Stream, der nie
     endet — und ein Screen, der ewig „Abbrechen" anbietet. */
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
  'llm:tasks': () => st.tasks,
  'llm:routing': () => st.routing,
  'llm:setRoute': () => st.routing,
  'llm:setDefault': () => st.routing,
  'llm:suggestRouting': () => st.routing,
  'llm:testTask': () => ({ ok: false, latencyMs: 0, sample: '', error: 'llm-unavailable' }),

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
    /* In der Attrappe gibt es einen Pflegebericht (`gardener:report`), also darf
       die Kachel den Wert zeigen. Ohne dieses Feld sagt sie „noch nicht
       geprüft" — und genau das tut die echte App, solange der Pflegelauf fehlt. */
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
  /* Die Attrappe schreibt nichts — sie gibt zurück, was ein Fix zurückgäbe. */
  'gardener:applyFix': ({ finding }) => ({
    written: finding.fix === null ? [] : [finding.paths[0] ?? fx.wikiPage.path],
    undoToken: 'demo-undo',
  }),
  'gardener:undoFix': () => ({ restored: [fx.wikiPage.path], kept: [] }),

  'claude:sessions': () => [fx.claudeSession],
  'claude:link': () => undefined,

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
    /* Der Zusammenhang zwischen Kanal, Anfrage und Antwort ist über
       `MockResponses` geprüft; die generische Signatur kann TypeScript hier
       nicht mehr nachvollziehen. */
    const respond = handler as (request: unknown) => unknown;
    return respond(payload) as Awaited<ReturnType<SbBridge['invoke']>>;
  },
  on: () => () => undefined,
  off: () => undefined,
};
