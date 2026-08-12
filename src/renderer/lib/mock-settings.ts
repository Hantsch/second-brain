/* Settings and LLM fixtures for the mock bridge.
   Deliberately separate copies: the renderer must not import `src/main/`. */

import type {
  DashboardLayout,
  ProviderConfig,
  ProviderPreset,
  Routing,
  SettingsSnapshot,
  TaskDefinition,
  TaskKind,
} from '@shared/types';
import { NOW } from './mock-fixtures';

export const dashboardLayout: DashboardLayout = {
  tiles: [
    { id: 'quick-capture', size: 'md' },
    { id: 'ask', size: 'md' },
    { id: 'recent-work', size: 'lg' },
    { id: 'deadlines', size: 'md' },
    { id: 'waiting-on', size: 'md' },
    { id: 'todos-work', size: 'md' },
    { id: 'todos-private', size: 'md' },
    { id: 'active-projects', size: 'lg' },
    { id: 'inbox', size: 'sm' },
    { id: 'stale-projects', size: 'md' },
    { id: 'journal-streak', size: 'sm' },
    { id: 'claude-sessions', size: 'md' },
    { id: 'gardener', size: 'sm' },
  ],
  updated: NOW,
};

export const routing: Routing = { tasks: {}, defaults: {} };

export const providers: ProviderConfig[] = [];

export const presets: ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'openai-compatible',
    baseUrl: 'http://localhost:11434/v1',
    needsKey: false,
    local: true,
    canListModels: true,
    hint: 'llm.preset.ollama.hint',
  },
];

const TASK_KINDS: readonly TaskKind[] = [
  'classify-dump',
  'title-tags',
  'extract-tasks',
  'summarize-source',
  'wiki-ingest',
  'query-answer',
  'query-rerank',
  'journal-chat',
  'project-status',
  'gardener-audit',
];

export const tasks: TaskDefinition[] = TASK_KINDS.map((kind) => ({
  kind,
  labelKey: `task.${kind}.label`,
  hintKey: `task.${kind}.hint`,
  suggested: 'balanced',
  sensitive: kind === 'journal-chat' || kind === 'classify-dump',
  streams: kind === 'journal-chat' || kind === 'query-answer',
  structured: false,
}));

export const settingsSnapshot: SettingsSnapshot = {
  app: {
    version: 2,
    lastVault: 'C:/vaults/demo',
    recentVaults: ['C:/vaults/demo'],
    theme: 'dark',
    customization: { background: 'none', appIcon: 'knowledge-garden' },
    uiLanguage: 'de',
    window: { width: 1440, height: 900 },
    startMinimized: false,
    onboarded: true,
  },
  vault: {
    version: 1,
    languages: { ui: 'de', documents: 'de', conversation: 'de', translateSources: true },
    capture: {
      quickCaptureShortcut: 'Control+Shift+Space',
      autoClassify: true,
      closeAfterCapture: true,
    },
    overview: {
      staleAfterDays: 14,
      deadlineHorizonDays: 14,
      waitingNudgeDays: 5,
      useClaudeSessions: true,
      claudeProjectsDir: '',
      notifications: true,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers,
    routing,
    dashboard: dashboardLayout,
    preferredTags: [],
  },
};
