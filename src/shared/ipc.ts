/**
 * Der IPC-Vertrag. Einzige Quelle der Wahrheit für die Grenze zwischen Renderer
 * und Main.
 *
 * Regeln:
 * - Der Renderer fasst niemals das Dateisystem an. Alles läuft über diese Kanäle.
 * - Ein Kanal wird hier eingetragen, im Main registriert und im Renderer über
 *   `src/renderer/lib/api.ts` benutzt. Das Preload kennt nur diese Liste.
 * - Kanäle sind `bereich:aktion`. Events sind `event:...` und fließen nur Main → Renderer.
 */

import type {
  AppSettings,
  ChatThread,
  Citation,
  ClaudeSession,
  CoachRequest,
  DashboardData,
  DashboardLayout,
  DocLanguage,
  DumpItem,
  FilingProposal,
  FilingResult,
  GardenerFinding,
  GardenerFindingKind,
  GardenerReport,
  IngestJob,
  IngestKind,
  JournalDay,
  KnowledgeModule,
  ModelRef,
  Project,
  ProjectFrontmatter,
  ProjectStatus,
  ProposedTodo,
  ProviderConfig,
  ProviderKind,
  ProviderPreset,
  RawSource,
  Reminder,
  Routing,
  Scope,
  SearchHit,
  SearchQuery,
  SettingsSnapshot,
  TaskDefinition,
  TaskKind,
  Todo,
  VaultDoc,
  VaultSettings,
  VaultStatus,
  WikiPage,
  WriteResult,
} from './types';

/** Antwort auf eine Frage an das Second Brain. */
export interface AskAnswer {
  threadId: string;
  messageId: string;
}

export interface IndexStats {
  docs: number;
  todos: number;
  projects: number;
  modules: number;
  pages: number;
  words: number;
  builtAt: string | null;
  durationMs: number | null;
}

export interface AppInfo {
  version: string;
  platform: string;
  electron: string;
  userData: string;
  /** Läuft die App im Demo-Modus auf einem Beispiel-Vault? */
  demo: boolean;
}

/** Ein Schreibvorgang mit Konfliktschutz: `expectedHash` = was der Client gelesen hat. */
export interface WriteRequest {
  path: string;
  frontmatter?: Record<string, unknown>;
  body?: string;
  expectedHash?: string;
}

/** Eine Runde des Coaching-Dialogs, wie sie im Tageseintrag steht. */
export interface JournalTurn {
  role: 'user' | 'assistant';
  text: string;
  /** Uhrzeit 'HH:MM' aus der Sprecherzeile; `null`, wenn keine dransteht. */
  at: string | null;
}

/**
 * Ein Tageseintrag für die Anzeige: die Datei plus ihre drei Abschnitte, schon
 * getrennt. Der Renderer parst kein Markdown — sonst gäbe es eine zweite Fassung
 * des Dateiformats, die beim ersten von Hand geschriebenen Tag auseinanderläuft.
 */
export interface JournalDayView {
  day: JournalDay;
  doc: VaultDoc;
  /** Prosa des Abschnitts „Tag" — was der Mensch selbst geschrieben hat. */
  text: string;
  /** Runden des Abschnitts „Gespräch", älteste zuerst. */
  turns: JournalTurn[];
  /** Der Abschnitt „Fakten", wörtlich wie in der Datei. */
  facts: string;
}

/**
 * Die Frontmatter-Felder eines Tageseintrags, wie der Tagesabschluss sie
 * vorschlägt und wie der Nutzer sie bestätigt. `null` bei Stimmung und Energie
 * heißt „nicht gefunden" bzw. „nicht schreiben" — nie „auf null setzen".
 */
export interface JournalFrontmatterFields {
  people: string[];
  /** Projekt-Slugs. */
  projects: string[];
  mood: number | null;
  energy: number | null;
  tags: string[];
}

/**
 * Der Vorschlag des Tagesabschlusses. Geschrieben ist davon nichts: die Karte
 * zeigt ihn, `journal:applyClose` führt aus, was bestätigt wurde.
 */
export interface JournalCloseSuggestion {
  date: string;
  path: string;
  /** Dieselbe Form wie in der Inbox — dieselbe Karte, dieselben Knöpfe. */
  proposal: FilingProposal;
  frontmatter: JournalFrontmatterFields;
  /** Vollständig ohne Modell entstanden. */
  heuristic: boolean;
}

/**
 * Alle Kanäle: Kanalname → Anfrage/Antwort.
 * `void` heißt: kein Argument bzw. kein Rückgabewert.
 */
export interface IpcRoutes {
  // ── Vault ────────────────────────────────────────────────────────────────
  'vault:status': { req: void; res: VaultStatus };
  /** Ordner-Dialog öffnen und Vault laden. null = abgebrochen. */
  'vault:choose': { req: void; res: VaultStatus | null };
  'vault:open': { req: { path: string }; res: VaultStatus };
  'vault:create': { req: { path: string; name: string }; res: VaultStatus };
  'vault:close': { req: void; res: VaultStatus };
  'vault:recent': { req: void; res: { path: string; name: string; exists: boolean }[] };
  'vault:read': { req: { path: string }; res: VaultDoc | null };
  'vault:write': { req: WriteRequest; res: WriteResult };
  'vault:delete': { req: { path: string }; res: { undoToken: string } };
  'vault:tree': { req: { dir?: string }; res: { path: string; dir: boolean; size: number }[] };

  // ── Index & Suche ────────────────────────────────────────────────────────
  'index:stats': { req: void; res: IndexStats };
  'index:rebuild': { req: void; res: IndexStats };
  'search:query': { req: SearchQuery; res: SearchHit[] };

  // ── Erfassen & Einordnen ─────────────────────────────────────────────────
  'capture:dump': {
    req: { text: string; origin: DumpItem['origin']; tags?: string[]; scope?: Scope | null };
    res: DumpItem;
  };
  'capture:inbox': { req: void; res: DumpItem[] };
  'capture:classify': { req: { path: string }; res: FilingProposal };
  'capture:apply': { req: { proposal: FilingProposal }; res: FilingResult };
  /** „Liegen lassen" — mit Rückgängig: `undoToken` schreibt den vorigen Status zurück. */
  'capture:keep': { req: { path: string }; res: { dump: DumpItem; undoToken: string } };
  'capture:discard': { req: { path: string }; res: { undoToken: string } };
  'capture:undo': { req: { undoToken: string }; res: void };
  /** Schnell-Erfassen-Fenster öffnen/schließen. */
  'capture:window': { req: { show: boolean }; res: void };

  // ── Projekte ─────────────────────────────────────────────────────────────
  'projects:list': { req: { scope?: Scope; includeDone?: boolean }; res: Project[] };
  'projects:get': { req: { slug: string }; res: { project: Project; doc: VaultDoc } | null };
  'projects:create': {
    req: { title: string; scope: Scope; status?: ProjectStatus; body?: string };
    res: Project;
  };
  'projects:patch': {
    req: { slug: string; patch: Partial<ProjectFrontmatter>; expectedHash?: string };
    res: Project;
  };
  'projects:append': {
    req: { slug: string; section: string; content: string };
    res: WriteResult;
  };
  /** LLM leitet Status und nächsten Schritt aus der Projekthistorie ab (Vorschlag). */
  'projects:suggestStatus': {
    req: { slug: string };
    res: {
      status: ProjectStatus;
      nextStep: string;
      reason: string;
      /**
       * Ohne Modell erzeugt — aus Regeln über den Bestand. Steht ein Modell,
       * fällt der Kanal darauf zurück, wenn es ausfällt oder Unsinn liefert;
       * dann sagt dieses Feld es, statt eine Deutung zu behaupten.
       */
      heuristic?: boolean;
    } | null;
  };
  'projects:resolveWaiting': { req: { slug: string; index: number }; res: Project };

  // ── Todos ────────────────────────────────────────────────────────────────
  'todos:list': {
    req: { scope?: Scope; project?: string; open?: boolean; dueBefore?: string };
    res: Todo[];
  };
  'todos:toggle': { req: { id: string }; res: Todo };
  'todos:create': {
    req: {
      text: string;
      scope: Scope;
      project?: string | null;
      due?: string | null;
      /** 1 = low, 2 = medium, 3 = high. Medium is the default. */
      priority?: 1 | 2 | 3;
    };
    res: Todo;
  };
  'todos:update': {
    req: { id: string; text?: string; due?: string | null; priority?: 1 | 2 | 3 };
    res: Todo;
  };
  /** Reorder every checkbox in one project file by stable todo id. */
  'todos:reorder': { req: { ids: string[] }; res: Todo[] };

  // ── Journal & Coaching ───────────────────────────────────────────────────
  'journal:list': { req: { limit?: number }; res: JournalDay[] };
  /** Der Tageseintrag samt seinen drei Abschnitten — der Renderer parst kein Markdown. */
  'journal:get': { req: { date: string }; res: JournalDayView | null };
  /** Prosa an den Abschnitt „Tag" anhängen; fehlt die Datei, wird sie angelegt. */
  'journal:append': { req: { date: string; text: string }; res: WriteResult };
  /**
   * Den Abschnitt „Tag" ersetzen — der Schreibweg des Editors. `expectedHash` ist
   * der Hash, den der Editor beim Öffnen gelesen hat: ohne ihn überschriebe das
   * Speichern eine fremde Änderung stillschweigend.
   */
  'journal:setDay': {
    req: { date: string; text: string; expectedHash?: string };
    res: WriteResult;
  };
  'journal:setMood': {
    req: { date: string; mood?: number; energy?: number; expectedHash?: string };
    res: JournalDay;
  };
  /** Coaching-Antwort; streamt über `event:llm-stream`. */
  'journal:coach': { req: CoachRequest; res: { threadId: string; messageId: string } };
  /** Laufende Coaching-Antwort abbrechen. Die eigene Runde bleibt geschrieben. */
  'journal:abort': { req: { messageId: string }; res: void };
  /** Tagesabschluss: Fakten, Todos und Stimmung als Vorschläge extrahieren. */
  'journal:close': { req: { date: string }; res: JournalCloseSuggestion | null };
  /**
   * Den bestätigten Tagesabschluss schreiben: Todos als Checkboxen (unter „Fakten"
   * bzw. in der Projektdatei, die das Todo nennt) und die Frontmatter-Felder des
   * Tages. `undo` ist der Rückweg — jeder Eintrag ist ein `vault:write`, das den
   * Stand von vorher wiederherstellt.
   */
  'journal:applyClose': {
    req: {
      date: string;
      todos: ProposedTodo[];
      frontmatter: JournalFrontmatterFields;
      expectedHash?: string;
    };
    res: { written: string[]; undo: WriteRequest[] };
  };

  // ── Wissens-Module ───────────────────────────────────────────────────────
  'modules:list': { req: void; res: KnowledgeModule[] };
  'modules:create': { req: { title: string; description: string }; res: KnowledgeModule };
  'modules:pages': { req: { module: string; type?: WikiPage['type'] }; res: WikiPage[] };
  'modules:page': { req: { path: string }; res: { page: WikiPage; doc: VaultDoc } | null };
  'modules:savePage': { req: WriteRequest; res: WriteResult };
  'modules:sources': { req: { module?: string }; res: RawSource[] };
  /** Graph für die Modul-Ansicht. */
  'modules:graph': {
    req: { module: string };
    res: { nodes: { id: string; title: string; type: string }[]; edges: [string, string][] };
  };

  // ── Fragen stellen ───────────────────────────────────────────────────────
  /** Frage an das Second Brain; Antwort streamt über `event:llm-stream`. */
  'chat:ask': {
    req: { question: string; threadId?: string; module?: string | null; scope?: Scope | null };
    res: AskAnswer;
  };
  /**
   * Die neuesten Gespräche. `query` sucht in Titel und Nachrichten — damit bleibt
   * auch erreichbar, was aus der Liste herausgefallen ist, statt ein Sammelsurium
   * zu zeigen.
   */
  'chat:threads': {
    req: { kind?: ChatThread['kind']; query?: string; limit?: number };
    res: ChatThread[];
  };
  'chat:thread': { req: { id: string }; res: ChatThread | null };
  'chat:delete': { req: { id: string }; res: void };
  'chat:abort': { req: { messageId: string }; res: void };
  /** Antwort als Wiki-Seite ablegen, damit die Erkundung nicht im Chat verschwindet. */
  'chat:fileBack': {
    req: { threadId: string; messageId: string; module: string; title: string };
    res: WriteResult;
  };

  // ── Quellen aufnehmen ────────────────────────────────────────────────────
  'ingest:start': {
    req: { kind: IngestKind; input: string; module?: string | null };
    res: IngestJob;
  };
  'ingest:jobs': { req: void; res: IngestJob[] };
  'ingest:cancel': { req: { id: string }; res: void };
  'ingest:retry': { req: { id: string }; res: IngestJob };
  /** Dateien per Dialog auswählen. */
  'ingest:pickFiles': { req: void; res: string[] };
  /** Status des yt-dlp-Binaries. */
  'ingest:ytdlpStatus': {
    req: void;
    res: { available: boolean; path: string | null; version: string | null };
  };
  'ingest:ytdlpInstall': {
    req: void;
    res: { available: boolean; path: string | null; version: string | null };
  };

  // ── LLM-Verwaltung ───────────────────────────────────────────────────────
  'llm:presets': { req: void; res: ProviderPreset[] };
  'llm:providers': { req: void; res: ProviderConfig[] };
  'llm:addProvider': {
    req: { label: string; kind: ProviderKind; baseUrl: string; apiKey?: string; local?: boolean };
    res: ProviderConfig;
  };
  'llm:updateProvider': {
    req: { id: string; patch: Partial<Omit<ProviderConfig, 'id'>>; apiKey?: string };
    res: ProviderConfig;
  };
  'llm:removeProvider': { req: { id: string }; res: void };
  'llm:probe': { req: { id: string }; res: ProviderConfig };
  'llm:models': { req: { id: string }; res: string[] };
  /**
   * Läuft auf diesem Rechner schon eine lokale Runtime? Prüft die Adressen der
   * Vorlagen mit `local: true` (Ollama, LM Studio) und meldet, was antwortet.
   * Damit kann die Einstellung konkret anleiten statt allgemein zu raten; sie
   * legt dabei nichts an — das Übernehmen bleibt ein eigener Schritt.
   */
  'llm:detectLocal': {
    req: void;
    res: {
      /** Kennung der Vorlage aus `core/llm/presets`. */
      presetId: string;
      label: string;
      baseUrl: string;
      /** Hat die Adresse geantwortet? */
      running: boolean;
      /** Was dort geladen ist — leer, wenn nichts antwortete. */
      models: string[];
      /** Ist für diese Adresse schon ein Provider eingerichtet? */
      configured: boolean;
    }[];
  };
  'llm:tasks': { req: void; res: TaskDefinition[] };
  'llm:routing': { req: void; res: Routing };
  'llm:setRoute': { req: { task: TaskKind; ref: ModelRef | null }; res: Routing };
  'llm:setDefault': {
    req: { tier: 'cheap' | 'balanced' | 'strong'; ref: ModelRef | null };
    res: Routing;
  };
  /**
   * Vorschlag, welches vorhandene Modell zu welcher Aufgabe passt. Nur ein
   * Vorschlag: übernommen wird er über `llm:setRoute`/`llm:setDefault`, wenn der
   * Nutzer ihn bestätigt.
   */
  'llm:suggestRouting': { req: void; res: Routing };
  'llm:testTask': {
    req: { task: TaskKind };
    res: { ok: boolean; latencyMs: number; sample: string; error?: string };
  };

  // ── Dashboard, Erinnerungen, Pflege ──────────────────────────────────────
  'dashboard:data': { req: void; res: DashboardData };
  'dashboard:layout': { req: void; res: DashboardLayout };
  'dashboard:setLayout': { req: { layout: DashboardLayout }; res: DashboardLayout };
  'reminders:list': { req: void; res: Reminder[] };
  'reminders:snooze': { req: { id: string; days: number }; res: void };
  /** Ruhe aufheben — der Rückweg zu `reminders:snooze`, sonst gäbe es keinen. */
  'reminders:unsnooze': { req: { id: string }; res: void };
  'gardener:report': { req: void; res: GardenerReport | null };
  'gardener:run': { req: { useLlm?: boolean }; res: GardenerReport };
  /** Bricht einen laufenden Pflegelauf ab; ohne Lauf passiert nichts. */
  'gardener:cancel': { req: void; res: void };
  'gardener:dismiss': { req: { id: string }; res: void };
  /** „Passt so" zurücknehmen: der Befund zählt wieder — und wieder gegen die Gesundheit. */
  'gardener:undismiss': { req: { id: string }; res: void };
  /**
   * `written` sind die geänderten Dateien, `open` die, die der Screen aufmachen
   * soll (bei `merge` und den `open-*`-Aktionen die einzige Wirkung — sie
   * schreiben nichts). `undoToken` fehlt genau dann, wenn nichts geschrieben wurde.
   */
  'gardener:applyFix': {
    req: { finding: GardenerFinding };
    res: { written: string[]; open?: string[]; undoToken?: string };
  };
  /**
   * Einen Fix zurückdrehen. `restored` sind die Dateien, die wieder auf dem Stand
   * von vorher sind; `kept` die, die der Nutzer seither selbst bearbeitet hat —
   * die bleiben, wie sie sind. Eine unbekannte Marke ändert nichts.
   */
  'gardener:undoFix': {
    req: { undoToken: string };
    res: { restored: string[]; kept: string[] };
  };

  // ── Claude-Sessions ──────────────────────────────────────────────────────
  'claude:sessions': { req: { limit?: number }; res: ClaudeSession[] };
  'claude:link': { req: { sessionId: string; project: string }; res: void };

  // ── Einstellungen ────────────────────────────────────────────────────────
  'settings:get': { req: void; res: SettingsSnapshot };
  'settings:setApp': { req: { patch: DeepPartial<AppSettings> }; res: SettingsSnapshot };
  'settings:setVault': { req: { patch: DeepPartial<VaultSettings> }; res: SettingsSnapshot };
  'settings:setLanguages': {
    req: { ui?: 'de' | 'en'; documents?: DocLanguage; conversation?: 'de' | 'en' };
    res: SettingsSnapshot;
  };

  // ── Fenster & System ─────────────────────────────────────────────────────
  'window:minimize': { req: void; res: void };
  'window:toggleMaximize': { req: void; res: { maximized: boolean } };
  'window:close': { req: void; res: void };
  'window:isMaximized': { req: void; res: boolean };
  /**
   * Holt das Hauptfenster nach vorn (aus dem Symbol, aus dem Hintergrund) und
   * gibt ihm den Fokus. Das Schnell-Erfassen braucht es: „Hauptfenster zeigen"
   * ist sonst ein Knopf, der nur sich selbst schließt.
   */
  'window:show': { req: void; res: void };
  'shell:openPath': { req: { path: string }; res: void };
  'shell:openExternal': { req: { url: string }; res: void };
  'shell:showInFolder': { req: { path: string }; res: void };
  'app:info': { req: void; res: AppInfo };
}

export type IpcChannel = keyof IpcRoutes;
export type IpcRequest<K extends IpcChannel> = IpcRoutes[K]['req'];
export type IpcResponse<K extends IpcChannel> = IpcRoutes[K]['res'];

/** Alle Kanalnamen zur Laufzeit — das Preload lässt nur diese durch. */
export const IPC_CHANNELS: readonly IpcChannel[] = [
  'vault:status',
  'vault:choose',
  'vault:open',
  'vault:create',
  'vault:close',
  'vault:recent',
  'vault:read',
  'vault:write',
  'vault:delete',
  'vault:tree',
  'index:stats',
  'index:rebuild',
  'search:query',
  'capture:dump',
  'capture:inbox',
  'capture:classify',
  'capture:apply',
  'capture:keep',
  'capture:discard',
  'capture:undo',
  'capture:window',
  'projects:list',
  'projects:get',
  'projects:create',
  'projects:patch',
  'projects:append',
  'projects:suggestStatus',
  'projects:resolveWaiting',
  'todos:list',
  'todos:toggle',
  'todos:create',
  'todos:update',
  'todos:reorder',
  'journal:list',
  'journal:get',
  'journal:append',
  'journal:setDay',
  'journal:setMood',
  'journal:coach',
  'journal:abort',
  'journal:close',
  'journal:applyClose',
  'modules:list',
  'modules:create',
  'modules:pages',
  'modules:page',
  'modules:savePage',
  'modules:sources',
  'modules:graph',
  'chat:ask',
  'chat:threads',
  'chat:thread',
  'chat:delete',
  'chat:abort',
  'chat:fileBack',
  'ingest:start',
  'ingest:jobs',
  'ingest:cancel',
  'ingest:retry',
  'ingest:pickFiles',
  'ingest:ytdlpStatus',
  'ingest:ytdlpInstall',
  'llm:presets',
  'llm:providers',
  'llm:addProvider',
  'llm:updateProvider',
  'llm:removeProvider',
  'llm:probe',
  'llm:models',
  'llm:detectLocal',
  'llm:tasks',
  'llm:routing',
  'llm:setRoute',
  'llm:setDefault',
  'llm:suggestRouting',
  'llm:testTask',
  'dashboard:data',
  'dashboard:layout',
  'dashboard:setLayout',
  'reminders:list',
  'reminders:snooze',
  'reminders:unsnooze',
  'gardener:report',
  'gardener:run',
  'gardener:cancel',
  'gardener:dismiss',
  'gardener:undismiss',
  'gardener:applyFix',
  'gardener:undoFix',
  'claude:sessions',
  'claude:link',
  'settings:get',
  'settings:setApp',
  'settings:setVault',
  'settings:setLanguages',
  'window:minimize',
  'window:toggleMaximize',
  'window:close',
  'window:isMaximized',
  'window:show',
  'shell:openPath',
  'shell:openExternal',
  'shell:showInFolder',
  'app:info',
];

/** Ereignisse, die der Main dem Renderer schickt. */
export interface IpcEvents {
  /** Eine Datei im Vault hat sich geändert (auch von außen). */
  'event:vault-changed': { paths: string[]; external: boolean };
  'event:index-progress': { done: number; total: number; indexing: boolean };
  'event:ingest-progress': IngestJob;
  /** Ein Stück einer streamenden LLM-Antwort. */
  'event:llm-stream': {
    messageId: string;
    threadId: string;
    delta: string;
    done: boolean;
    citations?: Citation[];
    error?: string;
  };
  /**
   * Fortschritt eines Pflegelaufs. `check` ist die Prüfung, die gerade läuft;
   * `null` heißt: die Deutung durch ein Modell (`phase: 'audit'`) oder das Ende.
   * Der Lauf ist über `gardener:cancel` abbrechbar — deshalb ist Fortschritt hier
   * keine Zierde, sondern die Grundlage der Entscheidung, abzubrechen.
   */
  'event:gardener-progress': {
    phase: 'checks' | 'audit' | 'done';
    check: GardenerFindingKind | null;
    done: number;
    total: number;
    running: boolean;
  };
  'event:reminder': Reminder;
  'event:toast': { kind: 'info' | 'success' | 'warn' | 'error'; message: string };
  /** Der Nutzer hat den Quick-Capture-Hotkey gedrückt. */
  'event:capture-focus': { text?: string };
  'event:vault-status': VaultStatus;
  'event:settings': SettingsSnapshot;
}

export type IpcEventName = keyof IpcEvents;

export const IPC_EVENTS: readonly IpcEventName[] = [
  'event:vault-changed',
  'event:index-progress',
  'event:ingest-progress',
  'event:llm-stream',
  'event:gardener-progress',
  'event:reminder',
  'event:toast',
  'event:capture-focus',
  'event:vault-status',
  'event:settings',
];

/** Fehler, die über IPC zurückkommen, tragen diese Form. */
export interface IpcError {
  code:
    | 'no-vault'
    | 'not-found'
    | 'conflict'
    | 'llm-unavailable'
    | 'invalid'
    | 'io'
    | 'cancelled'
    | 'unknown';
  message: string;
  detail?: unknown;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object | undefined
      ? DeepPartial<NonNullable<T[K]>>
      : T[K];
};
