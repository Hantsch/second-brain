/* Settings. Two levels, deliberately separated:
   - App settings live in userData (machine-bound: window, vault history, keys)
   - Vault settings live in `<vault>/.secondbrain/settings.json` (travel with the vault) */

import type { CoachMode } from './domain';
import type { LlamaOverrides, ProviderConfig, Routing } from './llm';
import type { DashboardLayout } from './overview';

export type UiLanguage = 'de' | 'en';

/** Language documents in the vault are written in. */
export type DocLanguage = 'de' | 'en';

export type ThemeMode = 'dark' | 'light' | 'system';

export const APP_BACKGROUNDS = [
  'none',
  'thought-catcher',
  'knowledge-constellation',
  'pocket-vault',
  'thread-of-return',
  'knowledge-garden',
] as const;

export type AppBackground = (typeof APP_BACKGROUNDS)[number];

export const APP_ICONS = [
  'knowledge-garden',
  'neural-core',
  'circuit-cortex',
  'brain-chip',
  'vault-brain',
] as const;

export type AppIcon = (typeof APP_ICONS)[number];

export interface CustomizationSettings {
  background: AppBackground;
  appIcon: AppIcon;
}

export interface LanguageSettings {
  /** Language of the UI. */
  ui: UiLanguage;
  /** Language the LLM writes notes, wiki pages, and summaries in. */
  documents: DocLanguage;
  /** Language responses are given in (chat, coaching). */
  conversation: UiLanguage;
  /** Translate foreign-language sources into the document language while condensing. */
  translateSources: boolean;
}

/*
 * There used to be a threshold above which a filing suggestion would be
 * carried out without asking. It's gone: guardrail 2 doesn't allow it
 * (nothing gets written that nobody confirmed), so nobody could ever read
 * it — and a slider in settings that nobody reads is a false claim.
 */
export interface CaptureSettings {
  /** Global hotkey for the quick-capture window. */
  quickCaptureShortcut: string;
  /** Have the LLM classify dumps immediately after saving. */
  autoClassify: boolean;
  /** Close the window after saving. */
  closeAfterCapture: boolean;
}

export interface OverviewSettings {
  /** After how many days without activity a project counts as stagnant. */
  staleAfterDays: number;
  /** How many days ahead deadlines show up. */
  deadlineHorizonDays: number;
  /** Nudge about waiting-on entries without a due date after this many days. */
  waitingNudgeDays: number;
  /** Read Claude sessions in as part of the work trace. */
  useClaudeSessions: boolean;
  /** Root of the Claude projects; empty = `~/.claude/projects`. */
  claudeProjectsDir: string;
  /** Read Codex sessions in as part of the work trace. */
  useCodexSessions: boolean;
  /** Root of the Codex sessions; empty = `~/.codex/sessions`. */
  codexSessionsDir: string;
  /** Windows notifications for due reminders. */
  notifications: boolean;
  /**
   * Agent projects the user dismissed from the all-sessions list.
   * Key format is `<agent kind>:<project key>`, e.g. `claude:-home-me-repo`.
   */
  dismissedAgentProjects: string[];
  /** Show the per-project "Sessions" tab even for projects without a linked agent project. */
  showEmptySessionsTab: boolean;
}

/*
 * Here too there were two switches too many (`askMood`, `extractFacts`).
 * The day close-out suggests what's in the text, and the human checks it
 * off — there's nothing to disable up front without withholding a
 * suggestion the human could just as easily reject anyway. Nobody read
 * them; now they no longer exist.
 */
export interface JournalSettings {
  /** The coach's base stance — the default for the segmented control on the journal screen. */
  mode: CoachMode;
}

export interface GardenerSettings {
  /** Start a maintenance run automatically when the vault opens. */
  runOnOpen: boolean;
  /** Pages that haven't been reviewed for longer than this count as stale. */
  reviewAfterDays: number;
  /** Does an LLM interpret the findings (contradictions, missing pages)? */
  useLlm: boolean;
}

/** What travels with the vault. */
export interface VaultSettings {
  version: number;
  languages: LanguageSettings;
  capture: CaptureSettings;
  overview: OverviewSettings;
  journal: JournalSettings;
  gardener: GardenerSettings;
  /** Providers without keys — the keys stay on the machine. */
  providers: ProviderConfig[];
  routing: Routing;
  dashboard: DashboardLayout;
  /** Additional tags preferred during filing. */
  preferredTags: string[];
}

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized?: boolean;
}

/** What's tied to the machine. */
export interface AppSettings {
  version: number;
  /** Most recently opened vault. */
  lastVault: string | null;
  /** History for the vault picker. */
  recentVaults: string[];
  theme: ThemeMode;
  customization: CustomizationSettings;
  /** UI language before a vault is opened. */
  uiLanguage: UiLanguage;
  /** Seed for `languages.documents` / `.conversation` / `.translateSources` the
      first time a vault is opened or created (`SettingsService.openVault`) —
      chosen on the onboarding screen's "advanced" disclosure, before any vault
      exists to carry `LanguageSettings` itself. Ignored once a vault has its
      own settings file. */
  newVaultLanguages: Pick<LanguageSettings, 'documents' | 'conversation' | 'translateSources'>;
  window: WindowBounds;
  /** Start minimized to the tray. */
  startMinimized: boolean;
  /** Closing the window sends the app to the tray instead of quitting. */
  closeToTray: boolean;
  /** Onboarding already completed. */
  onboarded: boolean;
  /** What's tied to this machine specifically, not to the app installation
      in general (028) — kept as its own object so more machine-local facts
      have somewhere to go without growing the flat `AppSettings` shape. */
  machine: {
    /** Manually entered VRAM figure in MB, or `null` when nothing was
        entered — detection on Windows can't read a card's real VRAM above
        4 GB (32-bit `AdapterRAM`, see 019a's Done section), so the user can
        fill it in by hand. Never written into the vault: this travels with
        the machine, not with the vault. */
    vramOverrideMb: number | null;
    /** Percentage of this machine's RAM/VRAM the app may plan model
        recommendations against (029) — the user's way of reserving headroom
        for everything else running on the machine. Not written into the
        vault: this travels with the machine, like `vramOverrideMb`. */
    resourceBudgetPercent: number;
    /** Whether the llama.cpp engine starts only on a button press, or on the
        first task that needs it while it is installed-but-stopped (034,
        Decisions Q2). Default `'manual'` — the app never starts a process
        the user didn't ask for. Machine-local, like the two fields above. */
    llamaAutoStart: 'manual' | 'on-demand';
    /** Hand-entered overrides for the llama.cpp start plan (034, Decisions
        Q1), behind the card's "advanced" disclosure — `null` fields derive
        as usual. Machine-local: a GPU-layer count tuned for this box has no
        business travelling with the vault to another one. */
    llamaOverrides: LlamaOverrides;
  };
}

export interface SettingsSnapshot {
  app: AppSettings;
  /** null while no vault is open. */
  vault: VaultSettings | null;
}
