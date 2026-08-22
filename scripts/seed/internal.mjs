/* Gerüst des Vaults: Ordner, Marker, Vault-Einstellungen, README.
   Die Einstellungen sind die Defaults aus src/main/settings-defaults.ts, aber
   ohne Provider und ohne Routing — die App muss ohne LLM gut aussehen. */

import { join } from 'node:path';
import { CLAUDE_DIR } from './claude.mjs';
import { CODEX_DIR } from './codex.mjs';

const STRUCTURE_DIRS = [
  'inbox',
  'journal',
  'projects',
  'projects/work',
  'projects/private',
  'areas',
  'modules',
  'raw',
  'raw/youtube',
  'raw/files',
  'raw/web',
  '.secondbrain',
  '.secondbrain/index',
  '.secondbrain/chats',
  '.secondbrain/logs',
  '.secondbrain/trash',
];

/** Startanordnung des Dashboards, gleiche Reihenfolge wie die App-Defaults
    (`DEFAULT_DASHBOARD_TILES` in src/shared/types/overview.ts) — samt der acht
    Module, die ausgeblendet starten. */
const DASHBOARD_TILES = [
  { id: 'deadlines', size: 'md' },
  { id: 'waiting-on', size: 'md' },
  { id: 'recent-work', size: 'xl' },
  { id: 'todos-work', size: 'md' },
  { id: 'gardener', size: 'sm' },
  { id: 'todos-private', size: 'md', hidden: true },
  { id: 'active-projects', size: 'xl', hidden: true },
  { id: 'inbox', size: 'sm', hidden: true },
  { id: 'stale-projects', size: 'md', hidden: true },
  { id: 'journal-streak', size: 'sm', hidden: true },
  { id: 'claude-sessions', size: 'md', hidden: true },
  { id: 'quick-capture', size: 'md', hidden: true },
  { id: 'ask', size: 'md', hidden: true },
];

export const VAULT_NAME = 'Demo-Vault';

/**
 * Die Verlaufsablage eines CLI-Verlaufs im Demo-Vault, absolut. Sowohl
 * `claudeProjectsDir` als auch `codexSessionsDir` nehmen nur absolute Pfade —
 * und ohne diesen Eintrag läse der Demo-Lauf den echten `~/.claude/projects`
 * bzw. `~/.codex/sessions` (siehe Kopf von scripts/seed/claude.mjs und
 * scripts/seed/codex.mjs).
 */
function absoluteDirOf(seeder, dir) {
  return join(seeder.root, dir).replace(/\\/g, '/');
}

export function seedInternal(seeder, clock) {
  for (const dir of STRUCTURE_DIRS) seeder.mkdir(dir);

  /* `demo: true` ist die Sicherung von scripts/seed-vault.mjs: nur ein Ordner
     mit diesem Marker darf beim nächsten Lauf gelöscht werden. */
  seeder.json('.secondbrain/vault.json', {
    version: 1,
    name: VAULT_NAME,
    createdAt: clock.at(-240, '18:04'),
    demo: true,
  });

  seeder.json('.secondbrain/settings.json', {
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
      claudeProjectsDir: absoluteDirOf(seeder, CLAUDE_DIR),
      useCodexSessions: true,
      codexSessionsDir: absoluteDirOf(seeder, CODEX_DIR),
      notifications: true,
    },
    journal: { mode: 'tips' },
    gardener: { runOnOpen: true, reviewAfterDays: 120, useLlm: true },
    providers: [],
    routing: { tasks: {}, defaults: {} },
    dashboard: { tiles: DASHBOARD_TILES, updated: clock.at(-12, '08:15') },
    preferredTags: ['auth', 'kundenportal', 'wissen', 'garten'],
  });

  seeder.text(
    'README.md',
    `# ${VAULT_NAME}

Dieser Vault ist erfunden. \`npm run seed\` legt ihn neu an, damit die Oberfläche
mit glaubwürdigem Bestand geprüft werden kann — Projekte in beiden Scopes, Todos
mit und ohne Frist, Warte-auf, zwei Wissens-Module mit echten Wikilinks,
Tageseinträge mit Lücken, Rohquellen und eine gefüllte Inbox.

Alle Namen, Firmen, Repos und Inhalte sind Erfindungen. Es stehen absichtlich
Fehler darin (verwaiste Seite, kaputter Wikilink, Seite fehlt im Katalog,
benannter Widerspruch, lange nicht geprüfte Seite, unverdichtete Quelle,
liegengebliebene Dumps, Projekt ohne nächsten Schritt), damit der Pflege-Screen
echte Befunde zeigt.

Nichts hier ist von Hand gepflegt: Änderungen gehen beim nächsten \`npm run seed\`
verloren.
`,
  );
}
