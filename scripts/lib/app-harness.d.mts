/* Types for app-harness.mjs. The harness itself stays plain JavaScript — the
   screenshot and a11y scripts are .mjs and always were. This declaration exists
   so the TypeScript side (tests/e2e) can use the same harness without `any`,
   which is the whole point of having one launch path instead of two. */

import type { ElectronApplication, Page } from 'playwright';

export declare const REPO_ROOT: string;

export declare class HarnessError extends Error {}

/** Throws a HarnessError naming the missing entry points when out/ is absent. */
export declare function ensureBuild(): void;

/** Seeds the sample vault at `vaultPath` unless it is already there. */
export declare function ensureDemoVault(vaultPath: string, log?: (message: string) => void): string;

export interface UserDataOptions {
  /** `null` starts the app in onboarding — no last vault. */
  vault: string | null;
  recent?: string[];
  width?: number;
  height?: number;
  /** Defaults to 'de' (the screenshots); the e2e suite pins 'en'. */
  uiLanguage?: 'de' | 'en';
  /** Defaults to `false` — the app starts with its main window visible. */
  startMinimized?: boolean;
  /** Defaults to `true`, matching the app-level default (058, D1). */
  closeToTray?: boolean;
}

/** Writes a fresh userData directory with prepared app settings. */
export declare function prepareUserData(dir: string, options: UserDataOptions): string;

export interface LogEntry {
  at: string;
  level: 'info' | 'warn' | 'error';
  source: string;
  text: string;
  location: string;
}

export interface LogSink {
  entries: LogEntry[];
  readonly errors: LogEntry[];
  format(): string;
}

export interface AppSession {
  app: ElectronApplication;
  page: Page;
  logs: LogSink;
  mainWindowId: number | undefined;
  placeSecondary(
    width: number,
    height: number,
  ): Promise<{ x: number; y: number; width: number; height: number } | null>;
  resize(width: number, height: number): Promise<void>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  userDataDir: string;
  vault?: string | null;
  timeout?: number;
  /** Drops anything key-shaped from the child's environment. */
  withoutKeyEnv?: boolean;
  /** Merged into the child's environment last, e.g. `SB_E2E_STAGE_DELAY_MS` for one spec. */
  extraEnv?: Record<string, string>;
}

/** Starts the built app and returns window, log and a forgiving `close()`. */
export declare function launchApp(options: LaunchOptions): Promise<AppSession>;
