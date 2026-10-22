/* Mock bridge: the same API as `window.sb`, but with fixture data.
   It takes over when the renderer runs without Electron — in the browser
   and in tests. There is a response for EVERY channel in `IPC_CHANNELS`;
   the type below enforces that at compile time. */

import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc';
import {
  DEFAULT_RESOURCE_BUDGET_PERCENT,
  isValidResourceBudgetPercent,
} from '@shared/llm/resource-budget';
import { isValidVramOverrideMb } from '@shared/llm/vram-override';
import type {
  MachineScanResult,
  RawSource,
  RecommendationSet,
  WorkTask,
  WriteResult,
} from '@shared/types';
import type { SbBridge } from './bridge';
import { encodeIpcError } from './ipc-error';
import { agentSetupNotInstalled } from './mock-agent-setup';
import * as fx from './mock-fixtures';
import * as st from './mock-settings';

/* 028: the manually entered VRAM figure and (test-only) a "detected" figure,
   simulating the merge `applyVramOverride` does on the main side — kept as
   module state so a save survives a re-scan within the same session, the way
   the real `userData/settings.json`-backed override does. Browser mode has
   no real GPU detection, so `detectedVramMb` only ever moves when a renderer
   test calls `setMockDetectedVramMb` to exercise the conflict note.
   `resetVramOverrideMock` exists so `tests/renderer/settings.test.tsx` can
   clear this between tests — it is module-level state and would otherwise
   leak from one test into the next. */
let vramOverrideMb: number | null = null;
let detectedVramMb: number | null = null;

/* 029: the resource budget, module state for the same reason as the override
   above — a save has to survive a re-scan inside one browser session. Read by
   `mockVramVerdict` below to plan the VRAM ceiling the same way main's
   `judgeCapacity` would, and by `MachineCard.tsx`'s `BudgetRow` (D4) as the
   current value to display and edit. */
let resourceBudgetPercent: number = DEFAULT_RESOURCE_BUDGET_PERCENT;

/** Clears every 028/029 machine-card lever back to its default: the VRAM
    override, the simulated detected figure, and (D4) the resource budget —
    all module-level state, so a value a test sets must not leak into the
    next one via this same shared mock. */
export function resetVramOverrideMock(): void {
  vramOverrideMb = null;
  detectedVramMb = null;
  resourceBudgetPercent = DEFAULT_RESOURCE_BUDGET_PERCENT;
  hasScanned = false;
}

/* 035, D2: whether `llm:scanMachine` has ever run in this session — mirrors
   the real cache file's presence, so `llm:getMachineScan` can answer the
   same "never scanned" honestly instead of always finding a result. */
let hasScanned = false;

/** Test-only lever: lets a renderer test simulate a machine where detection
    found a VRAM figure — including one that conflicts with an entered value —
    without a real GPU. Not reachable from the UI. */
export function setMockDetectedVramMb(mb: number | null): void {
  detectedVramMb = mb;
}

/** Test-only lever: seeds "the machine card mounts with an already-remembered
    scan" (035, D2) without going through the UI's "Diesen Rechner scannen"
    button — the state `llm:getMachineScan` needs to answer honestly the
    moment the tab renders, before any click. */
export function seedMockScanned(): void {
  hasScanned = true;
}

/* 029, D4: mirrors just the VRAM half of `judgeCapacity`'s math (see the
   header comment and constants in `src/core/llm/capacity.ts`) so the budget
   control's planned-figure row and "nothing fits" state are demonstrable in
   browser mode/tests — without this file importing `core/llm`, which would
   break the renderer/core boundary the top-of-file comment already explains.
   RAM stays out of scope here: the mock never has a real `totalRamMb`, so
   there is nothing honest to plan against on that side regardless of budget. */
const MOCK_VRAM_HEADROOM_MB = 1024;
const MOCK_GB_PER_PARAM_B_AT_Q4 = 0.55;
const MOCK_COMFORTABLE_HEADROOM_FACTOR = 0.8;
const MOCK_TIER_LANDMARKS_B: readonly number[] = [3, 7, 8, 13, 34, 70];

interface MockVramVerdict {
  plannedMb: number;
  comfortableParamsB: number;
  possibleParamsB: number;
  tiersThatFit: string[];
}

function mockVramVerdict(vramMb: number, budgetPercent: number): MockVramVerdict {
  const usableMb = Math.max(0, vramMb - MOCK_VRAM_HEADROOM_MB);
  const plannedMb = usableMb * (budgetPercent / 100);
  const possibleParamsB = plannedMb / 1024 / MOCK_GB_PER_PARAM_B_AT_Q4;
  const comfortableParamsB = possibleParamsB * MOCK_COMFORTABLE_HEADROOM_FACTOR;
  const tiersThatFit = MOCK_TIER_LANDMARKS_B.filter((b) => b <= comfortableParamsB).map(
    (b) => `${b}B`,
  );
  return { plannedMb, comfortableParamsB, possibleParamsB, tiersThatFit };
}

function mockMachineScan(): MachineScanResult {
  const vramMb = vramOverrideMb ?? detectedVramMb;
  const vramSource: 'detected' | 'manual' | 'none' =
    vramOverrideMb !== null ? 'manual' : detectedVramMb !== null ? 'detected' : 'none';
  /* No real facts in the mock bridge, so `judgeCapacity` (main-side, D3)
     would come back unable to judge anything beyond what a VRAM figure
     allows — RAM and CPU stay unknown regardless of the VRAM override;
     entering VRAM does not manufacture a RAM or CPU figure. */
  const vramVerdict = vramMb !== null ? mockVramVerdict(vramMb, resourceBudgetPercent) : null;
  return {
    facts: {
      totalRamMb: null,
      cpuCores: null,
      platform: null,
      arch: null,
      freeDiskMb: null,
      vramMb,
      gpuName: null,
      gpuDetection: detectedVramMb !== null ? 'detected' : 'not-attempted',
      detectedVramMb,
      manualVramMb: vramOverrideMb,
      vramSource,
      vramConflict:
        vramOverrideMb !== null && detectedVramMb !== null && vramOverrideMb !== detectedVramMb,
    },
    verdict: vramVerdict
      ? {
          limitingFactor: 'vram',
          maxComfortableParamsB: vramVerdict.comfortableParamsB,
          maxPossibleParamsB: vramVerdict.possibleParamsB,
          tiersThatFit: vramVerdict.tiersThatFit,
          heuristic: true,
          unknowns: ['ram', 'cpu'],
          budgetPercent: resourceBudgetPercent,
          plannedVramMb: vramVerdict.plannedMb,
        }
      : {
          limitingFactor: 'unknown',
          maxComfortableParamsB: null,
          maxPossibleParamsB: null,
          tiersThatFit: [],
          heuristic: true,
          unknowns: ['ram', 'cpu'],
          budgetPercent: resourceBudgetPercent,
        },
    scannedAt: fx.NOW,
  };
}

const writeResult: WriteResult = { path: fx.doc.path, hash: 'demo-hash', created: false };

/* 073, D3: `condense:run` queues a task instead of answering with the
   proposal, so browser mode needs one to hand back — already finished, since
   there is no real run to wait for here. It only appears in `work:list` once a
   run was actually triggered (`condenseQueued`), so the tasks screen keeps
   showing the honest empty queue until then. */
const DEMO_CONDENSE_TASK: WorkTask = {
  id: 'demo-condense-task',
  kind: 'condense',
  lane: 'model',
  subject: { label: fx.area.title, ref: `area:${fx.area.slug}` },
  state: 'done',
  progress: 1,
  message: null,
  error: null,
  queuePosition: null,
  queuedAt: fx.NOW,
  startedAt: fx.NOW,
  finishedAt: fx.NOW,
  hasResult: true,
  detail: null,
  retryable: true,
};
let condenseQueued = false;

/* 073, D4: `journal:close` queues a task the same way `condense:run` does
   (073, D3) — a second, already-finished demo task, off the model lane since
   this demo vault routes no model for `extract-tasks` either. */
const DEMO_CLOSE_TASK: WorkTask = {
  id: 'demo-close-task',
  kind: 'close-day',
  lane: 'free',
  subject: { label: fx.journalDay.date, ref: fx.journalDay.date },
  state: 'done',
  progress: 1,
  message: null,
  error: null,
  queuePosition: null,
  queuedAt: fx.NOW,
  startedAt: fx.NOW,
  finishedAt: fx.NOW,
  hasResult: true,
  detail: null,
  retryable: true,
};
let closeQueued = false;

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
  blocked: null,
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
  'vault:sectionPlan': ({ to }) => ({ to, count: 0, entries: [] }),
  'vault:sectionMigrate': () => ({ results: [], migrated: 0, conflicts: 0 }),

  'index:stats': () => fx.indexStats,
  'index:rebuild': () => fx.indexStats,
  'search:query': () => [fx.searchHit],
  'search:resolveLinks': ({ targets }) =>
    Object.fromEntries(targets.map((target) => [target, null])),

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
  /* Condensation (038, D4/D5-D9): fixed fixtures, no simulated model — the
     screens driven by these channels are a later deliverable of this story. */
  'condense:read': () => null,
  /* Since 073, D3 a run only queues a task; the proposal is fetched back under
     that task's id via `tasks:result` below. */
  'condense:run': () => {
    condenseQueued = true;
    return DEMO_CONDENSE_TASK;
  },
  'condense:accept': () => ({
    path: 'areas/gesundheit.condensed.md',
    hash: 'demo-hash',
    undoToken: null,
  }),
  'condense:reject': () => ({ path: 'areas/gesundheit.condensed.md' }),
  'condense:delete': () => ({ path: 'areas/gesundheit.condensed.md', undoToken: 'demo-undo' }),

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
    /* No loose end in the mock fixtures yet (020, D6 wires the real ones). */
    looseEnds: [],
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
  /* Since 073, D4 a close only queues a task; the suggestion is fetched back
     under that task's id via `tasks:result` below — mirrors `condense:run`. */
  'journal:close': () => {
    closeQueued = true;
    return DEMO_CLOSE_TASK;
  },
  'journal:applyClose': () => ({ written: [fx.journalDay.path], undo: [] }),
  /* No stored result to mark in browser mode — a no-op, same as the real
     handler for a date nothing was ever queued under. */
  'journal:discardClose': () => undefined,
  'journal:foldDay': () => ({ ...writeResult, path: fx.journalDay.path }),
  'journal:answerLooseEnd': () => ({ path: fx.journalDay.path, hash: writeResult.hash }),
  'journal:interviewPlan': () => ({
    steps: [
      { topic: 'events', question: 'Was ist heute passiert, das dir aufgefallen ist?' },
      { topic: 'open', question: 'Was ist noch offen?' },
    ],
    mode: 'fixed',
    finished: false,
    looseEnd: null,
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
  /* 063, D4/D5/D6: rename/delete plans and results. Plausible, fixture-shaped
     data — browser mode never actually rewrites or trashes anything. */
  'modules:renamePlan': ({ slug, title }) => ({
    slug,
    newSlug: slug,
    oldTitle: fx.knowledgeModule.title,
    title,
    titleOnly: true,
    changes: [
      { path: `modules/${slug}/module.md`, kind: 'module-file', summary: 'Titel ändert sich.' },
    ],
    pages: [fx.wikiPage],
    blocked: null,
    fingerprint: 'demo-fingerprint',
  }),
  'modules:rename': ({ slug, title }) => ({
    slug,
    newSlug: slug,
    title,
    moved: false,
    written: [`modules/${slug}/module.md`],
    undoToken: 'demo-undo-token',
    logged: `modules/${slug}/wiki/log.md`,
  }),
  'modules:deletePlan': ({ slug }) => ({
    slug,
    changes: [],
    pages: [fx.wikiPage],
    sources: [
      {
        path: rawSource.path,
        protocolPath: `${rawSource.path}.ingest.json`,
        outcome: 'undigested',
        remainingModule: null,
      },
    ],
    brokenLinks: [],
    projects: [],
    blocked: null,
    fingerprint: 'demo-fingerprint',
  }),
  'modules:delete': ({ slug }) => ({
    slug,
    written: [],
    deleted: `modules/${slug}`,
    undoToken: 'demo-undo-token',
  }),
  'modules:undo': () => ({ restored: [fx.wikiPage.path], kept: [] }),

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
  'ingest:refetch': ({ path }) => ({
    ...fx.ingestJob,
    rawPath: path,
    module: null,
    refetch: true,
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
  'llm:localRuntimeStatus': ({ runtime }) => ({ runtime, status: 'absent' }),
  /* Honest like `llm:scanMachine` above: the browser-mode mock has no real
     platform or disk facts, so it reports the install as blocked rather than
     pretending a download would work. */
  'llm:runtimeInstallPlan': ({ runtime }) => ({
    runtime,
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
  'llm:startLocalRuntime': ({ runtime }) => ({
    runtime,
    started: false,
    status: 'absent',
    reason: 'spawn-failed',
  }),
  /* Same honesty (034, D2): browser mode never has a real llama.cpp binary or
     model file on disk, so the card sees "absent" and "nothing to plan for"
     rather than an invented plan. */
  'llm:llamaEngineStatus': () => ({ status: 'absent', ownedByApp: false, port: null }),
  'llm:llamaStartPlan': () => null,
  /* Nothing was ever started here, so there is nothing to stop — the same
     no-op the real channel reports for that case (034, D3), not a refusal. */
  'llm:stopLlamaEngine': () => ({ stopped: false }),
  /* Same honesty as `llm:llamaStartPlan` above: browser mode never has an
     installed `.gguf` file, so there is no plan to hand back here either —
     the write itself is harmless (nothing else in this mock reads the
     overrides back), but inventing a plan would contradict that `null`. */
  'llm:setLlamaOverrides': () => null,
  /* 034, D6: the mock never actually starts anything, so there is nothing
     for this to affect beyond acknowledging the write. */
  'llm:setLlamaAutoStart': () => undefined,
  /* And for the same reason there is no runtime to pull a model into: a fake
     progress stream would be the one thing this mock must not invent. */
  'llm:pullModel': () => {
    throw encodeIpcError({
      code: 'invalid',
      message: 'im Browser-Modus läuft keine lokale Laufzeit',
    });
  },
  'llm:cancelPull': () => undefined,
  /* Browser mode never reaches the real Hugging Face API — an offline
     network is exactly the honest state D3's outcome type already names, so
     the mock reports that instead of inventing search hits. */
  'llm:searchModelFiles': (request) =>
    request.step === 'search'
      ? { step: 'search', ok: false, reason: 'network-error' }
      : { step: 'files', ok: false, reason: 'network-error' },
  'llm:tasks': () => st.tasks,
  'llm:routing': () => st.routing,
  'llm:setRoute': () => st.routing,
  'llm:setDefault': () => st.routing,
  'llm:suggestRouting': () => st.routing,
  'llm:testTask': () => ({ ok: false, latencyMs: 0, sample: '', error: 'llm-unavailable' }),
  'llm:scanMachine': () => {
    hasScanned = true;
    return mockMachineScan();
  },
  /* `null` until a scan has run this session — the same "never scanned"
     honesty `llm:scanMachine` above already carries for the real detection
     facts, now for the cache read too. */
  'llm:getMachineScan': () => (hasScanned ? mockMachineScan() : null),
  /* Persists into the module-level slot above rather than a real settings
     store — good enough for browser mode and for the renderer test's
     save/clear/rescan-survival scenarios (`resetVramOverrideMock` guards
     against it leaking between tests). Mirrors D3's `isValidVramOverrideMb`
     guard: the renderer already validates before calling, but an invalid
     payload is rejected here too rather than silently accepted. */
  'llm:setVramOverride': ({ vramMb }) => {
    if (vramMb !== null && !isValidVramOverrideMb(vramMb)) {
      throw encodeIpcError({ code: 'invalid', message: 'vramMb außerhalb des gültigen Bereichs' });
    }
    vramOverrideMb = vramMb;
    return mockMachineScan();
  },
  /* Same shape for the budget: validated here too, then persisted into the
     module slot, and the fresh scan reports the percentage it was just set to. */
  'llm:setResourceBudget': ({ percent }) => {
    if (!isValidResourceBudgetPercent(percent)) {
      throw encodeIpcError({ code: 'invalid', message: 'percent außerhalb des gültigen Bereichs' });
    }
    resourceBudgetPercent = percent;
    return mockMachineScan();
  },
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
  /* No run is ever going in the mock — there is nothing that starts one on
     its own, so mounting the maintenance screen here never has a run to seed. */
  'gardener:runStatus': () => null,
  'gardener:run': () => fx.gardenerReport,
  'gardener:cancel': () => undefined,
  'gardener:dismiss': () => undefined,
  'gardener:undismiss': () => undefined,
  'gardener:snooze': () => undefined,
  'gardener:unsnooze': () => undefined,
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
  /* Read-only preview (016 D2): one plausible candidate from the fixture page. */
  'gardener:orphanTargets': () => ({
    line: `Bezug: [[${fx.wikiPage.slug}]]`,
    targets: [{ path: fx.wikiPage.path, title: fx.wikiPage.title, slug: fx.wikiPage.slug }],
  }),
  /* The confirm step (016 D3): `add-links` writes exactly one file. */
  'gardener:linkOrphan': () => ({ written: [fx.wikiPage.path], undoToken: 'demo-undo' }),
  'gardener:linkOrphans': () => ({ written: [fx.wikiPage.path], undoToken: 'demo-undo' }),
  /* No work in flight in the demo/screenshot vault (071, D3) — an empty queue
     is the honest state, the same as `gardener:report` returning `null`. */
  'work:list': () => [
    ...(condenseQueued ? [DEMO_CONDENSE_TASK] : []),
    ...(closeQueued ? [DEMO_CLOSE_TASK] : []),
  ],
  /* And with an empty queue there is never a task to act on (072, D2): every
     verb honestly answers "there was nothing there", the same as the real
     registry does for an id it does not know. */
  'tasks:cancel': () => false,
  'tasks:remove': () => false,
  'tasks:retry': () => null,
  /* The two exceptions to the empty queue above: the demo condensation run
     (073, D3) and the demo day close-out (073, D4) each answer with the
     fixed result the synchronous channel used to return directly, keyed by
     the task id so the condensed panel and the close-out card each get their
     own kind back rather than each other's. */
  'tasks:result': ({ id }) => {
    if (id === DEMO_CLOSE_TASK.id) {
      return {
        kind: 'journal-close',
        suggestion: {
          date: fx.journalDay.date,
          path: fx.journalDay.path,
          proposal: fx.proposal,
          frontmatter: {
            people: fx.journalDay.people,
            projects: fx.journalDay.projects,
            mood: 3,
            energy: 2,
            tags: [],
            areas: [],
          },
          heuristic: true,
        },
      };
    }
    return {
      kind: 'condense',
      proposal: {
        unit: 'area',
        slug: fx.area.slug,
        path: 'areas/gesundheit.condensed.md',
        baseHash: null,
        before: '',
        after: '---\ntype: condensed\ntitle: Gesundheit\n---\n\n## Stand\n\nDemo-Stand.\n',
        sources: [fx.area.path],
      },
    };
  },

  'claude:sessions': () => [fx.claudeSession],
  'claude:link': () => undefined,

  /* D1 of the agent session browser only defines the contract — no fixture
     data yet, so the mock returns "nothing found" for all three channels. */
  'agents:projects': () => [],
  'agents:sessions': () => [],
  'agents:transcript': () => ({ entries: [], nextCursor: null, totalKnown: true }),
  'agents:link': () => undefined,
  'agent:cliStatus': () => ({ state: 'absent' }),
  'agent:setupStatus': () => agentSetupNotInstalled,
  'agent:protectionStatus': () => ({ state: 'none' }),
  'agent:setupApply': ({ confirmed }) => ({
    results: confirmed.map(({ path }) => ({ path, outcome: 'written' as const })),
  }),

  'settings:get': () => st.settingsSnapshot,
  'settings:setApp': () => st.settingsSnapshot,
  'settings:setVault': () => st.settingsSnapshot,
  'settings:setLanguages': () => st.settingsSnapshot,

  'window:minimize': () => undefined,
  'window:toggleMaximize': () => ({ maximized: false }),
  'window:close': () => undefined,
  'window:confirmClose': () => undefined,
  'window:cancelClose': () => undefined,
  'window:isMaximized': () => false,
  'window:show': () => undefined,

  'shell:openPath': () => undefined,
  'shell:openExternal': () => undefined,
  'shell:showInFolder': () => undefined,
  'app:info': () => fx.appInfo,
  'app:releaseNotes': () => fx.releaseNotes,
  'update:state': () => MOCK_UPDATE_STATE,
  'update:check': () => MOCK_UPDATE_STATE,
  'update:download': () => ({
    ok: false,
    error: 'update.error.notAvailable',
    state: MOCK_UPDATE_STATE,
  }),
  'update:cancelDownload': () => ({ ok: true, state: MOCK_UPDATE_STATE }),
  'update:installAndRestart': () => ({
    ok: false,
    error: 'update.error.notReady',
    state: MOCK_UPDATE_STATE,
  }),
  'update:dismiss': () => ({ ok: true, state: MOCK_UPDATE_STATE }),
};

const MOCK_UPDATE_STATE: IpcResponse<'update:state'> = {
  phase: 'idle',
  status: 'up-to-date',
  supported: true,
  disabledReason: null,
  distribution: 'installed',
  currentVersion: fx.appInfo.version,
  update: null,
  error: null,
  lastCheckedAt: null,
  lastSuccessAt: null,
  progress: null,
  dismissed: false,
  downloadError: null,
  releaseUrl: null,
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
