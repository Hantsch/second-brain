/* Settings come from the renderer and are thus unvalidated payload.
   Here that becomes a change allowed into the file: known fields,
   correct type, sensible range. Everything else is dropped.

   Two intentions:
   - A broken or made-up number must not push the app into a state the
     user can no longer escape without a text editor (`staleAfterDays: 0`
     would consider every project stagnant).
   - `providers` runs exclusively through `llm:*`. Otherwise, this path
     would let a self-set `hasKey` slip into the vault file. */

import { APP_BACKGROUNDS, APP_ICONS, COACH_MODES } from '@shared/types';
import type { AppSettings, CoachMode, DocLanguage, UiLanguage, VaultSettings } from '@shared/types';
import type { DeepPartial } from '@shared/ipc';
import { fail } from './errors';

const UI_LANGUAGES: readonly UiLanguage[] = ['de', 'en'];
const THEMES: readonly AppSettings['theme'][] = ['dark', 'light', 'system'];

/** Bounds of the number fields. Out of range gets clamped, not rejected. */
const RANGES = {
  staleAfterDays: { min: 1, max: 365 },
  deadlineHorizonDays: { min: 1, max: 365 },
  waitingNudgeDays: { min: 1, max: 365 },
  reviewAfterDays: { min: 7, max: 3650 },
} as const;

type Bag = Record<string, unknown>;

function bag(value: unknown, field: string): Bag | null {
  if (value === undefined) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw fail('invalid', `${field} muss ein Objekt sein`);
  }
  return value as Bag;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw fail('invalid', `${field} muss wahr oder falsch sein`);
  return value;
}

function clamped(value: unknown, field: string, range: { min: number; max: number }): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw fail('invalid', `${field} muss eine Zahl sein`);
  }
  return Math.min(range.max, Math.max(range.min, value));
}

function integerClamped(
  value: unknown,
  field: string,
  range: { min: number; max: number },
): number {
  return Math.round(clamped(value, field, range));
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw fail('invalid', `${field} muss Text sein`);
  return value.trim().slice(0, max);
}

function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw fail('invalid', `${field} kennt diesen Wert nicht`);
  }
  return value as T;
}

function languages(source: Bag): Partial<VaultSettings['languages']> {
  const out: Partial<VaultSettings['languages']> = {};
  if (source.ui !== undefined) out.ui = oneOf(source.ui, 'languages.ui', UI_LANGUAGES);
  if (source.documents !== undefined) {
    out.documents = oneOf<DocLanguage>(source.documents, 'languages.documents', UI_LANGUAGES);
  }
  if (source.conversation !== undefined) {
    out.conversation = oneOf(source.conversation, 'languages.conversation', UI_LANGUAGES);
  }
  if (source.translateSources !== undefined) {
    out.translateSources = boolean(source.translateSources, 'languages.translateSources');
  }
  return out;
}

function capture(source: Bag): Partial<VaultSettings['capture']> {
  const out: Partial<VaultSettings['capture']> = {};
  if (source.quickCaptureShortcut !== undefined) {
    out.quickCaptureShortcut = text(
      source.quickCaptureShortcut,
      'capture.quickCaptureShortcut',
      60,
    );
  }
  if (source.autoClassify !== undefined) {
    out.autoClassify = boolean(source.autoClassify, 'capture.autoClassify');
  }
  if (source.closeAfterCapture !== undefined) {
    out.closeAfterCapture = boolean(source.closeAfterCapture, 'capture.closeAfterCapture');
  }
  return out;
}

function overview(source: Bag): Partial<VaultSettings['overview']> {
  const out: Partial<VaultSettings['overview']> = {};
  for (const key of ['staleAfterDays', 'deadlineHorizonDays', 'waitingNudgeDays'] as const) {
    if (source[key] !== undefined) {
      out[key] = integerClamped(source[key], `overview.${key}`, RANGES[key]);
    }
  }
  if (source.useClaudeSessions !== undefined) {
    out.useClaudeSessions = boolean(source.useClaudeSessions, 'overview.useClaudeSessions');
  }
  if (source.claudeProjectsDir !== undefined) {
    out.claudeProjectsDir = text(source.claudeProjectsDir, 'overview.claudeProjectsDir', 260);
  }
  if (source.useCodexSessions !== undefined) {
    out.useCodexSessions = boolean(source.useCodexSessions, 'overview.useCodexSessions');
  }
  if (source.codexSessionsDir !== undefined) {
    out.codexSessionsDir = text(source.codexSessionsDir, 'overview.codexSessionsDir', 260);
  }
  if (source.notifications !== undefined) {
    out.notifications = boolean(source.notifications, 'overview.notifications');
  }
  if (source.dismissedAgentProjects !== undefined) {
    out.dismissedAgentProjects = dismissedAgentProjects(source.dismissedAgentProjects);
  }
  if (source.showEmptySessionsTab !== undefined) {
    out.showEmptySessionsTab = boolean(
      source.showEmptySessionsTab,
      'overview.showEmptySessionsTab',
    );
  }
  return out;
}

/*
 * Same shape as `preferredTags`, but without lowercasing: an entry is
 * `<agent kind>:<project key>` (e.g. `claude:-home-me-repo`), and the project
 * key is derived from a path — case decides whether the dismissal still
 * matches. The caps hold a machine full of repos (256) with room for long
 * paths (300 chars) and still bound what a broken renderer can grow in the
 * vault file.
 */
const DISMISSED_MAX_ENTRIES = 256;
const DISMISSED_MAX_LENGTH = 300;

function dismissedAgentProjects(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw fail('invalid', 'overview.dismissedAgentProjects muss eine Liste sein');
  }
  const keys = value
    .map((entry) => text(entry, 'overview.dismissedAgentProjects', DISMISSED_MAX_LENGTH))
    .filter((entry) => entry.length > 0);
  return [...new Set(keys)].slice(0, DISMISSED_MAX_ENTRIES);
}

function journal(source: Bag): Partial<VaultSettings['journal']> {
  const out: Partial<VaultSettings['journal']> = {};
  if (source.mode !== undefined) {
    out.mode = oneOf<CoachMode>(source.mode, 'journal.mode', COACH_MODES);
  }
  return out;
}

function gardener(source: Bag): Partial<VaultSettings['gardener']> {
  const out: Partial<VaultSettings['gardener']> = {};
  if (source.runOnOpen !== undefined) {
    out.runOnOpen = boolean(source.runOnOpen, 'gardener.runOnOpen');
  }
  if (source.reviewAfterDays !== undefined) {
    out.reviewAfterDays = integerClamped(
      source.reviewAfterDays,
      'gardener.reviewAfterDays',
      RANGES.reviewAfterDays,
    );
  }
  if (source.useLlm !== undefined) out.useLlm = boolean(source.useLlm, 'gardener.useLlm');
  return out;
}

function preferredTags(value: unknown): string[] {
  if (!Array.isArray(value)) throw fail('invalid', 'preferredTags muss eine Liste sein');
  const tags = value
    .map((entry) => text(entry, 'preferredTags', 40).toLowerCase())
    .filter((entry) => entry.length > 0);
  return [...new Set(tags)].slice(0, 64);
}

/**
 * Turns the payload into a change to the vault settings.
 * Unknown sections are dropped; `providers` is explicitly rejected so
 * key state can only originate from `llm:*`.
 */
export function sanitizeVaultPatch(patch: unknown): DeepPartial<VaultSettings> {
  const source = bag(patch, 'patch') ?? {};
  if (source.providers !== undefined) {
    throw fail('invalid', 'Provider werden über die LLM-Kanäle gepflegt');
  }
  const out: DeepPartial<VaultSettings> = {};
  const sections = {
    languages: (value: Bag) => languages(value),
    capture: (value: Bag) => capture(value),
    overview: (value: Bag) => overview(value),
    journal: (value: Bag) => journal(value),
    gardener: (value: Bag) => gardener(value),
  } as const;

  for (const [key, build] of Object.entries(sections)) {
    const section = bag(source[key], key);
    if (!section) continue;
    const value = build(section);
    if (Object.keys(value).length > 0) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  if (source.preferredTags !== undefined) out.preferredTags = preferredTags(source.preferredTags);
  if (Object.keys(out).length === 0) throw fail('invalid', 'diese Änderung enthält nichts');
  return out;
}

/** Only fields the UI is actually allowed to set. Window size stays in the main process. */
export function sanitizeAppPatch(patch: unknown): DeepPartial<AppSettings> {
  const source = bag(patch, 'patch') ?? {};
  const out: DeepPartial<AppSettings> = {};
  if (source.theme !== undefined) out.theme = oneOf(source.theme, 'theme', THEMES);
  const customization = bag(source.customization, 'customization');
  if (customization) {
    const value: Partial<AppSettings['customization']> = {};
    if (customization.background !== undefined) {
      value.background = oneOf(
        customization.background,
        'customization.background',
        APP_BACKGROUNDS,
      );
    }
    if (customization.appIcon !== undefined) {
      value.appIcon = oneOf(customization.appIcon, 'customization.appIcon', APP_ICONS);
    }
    if (Object.keys(value).length > 0) out.customization = value;
  }
  if (source.uiLanguage !== undefined) {
    out.uiLanguage = oneOf(source.uiLanguage, 'uiLanguage', UI_LANGUAGES);
  }
  const newVaultLanguages = bag(source.newVaultLanguages, 'newVaultLanguages');
  if (newVaultLanguages) {
    const value: Partial<AppSettings['newVaultLanguages']> = {};
    if (newVaultLanguages.documents !== undefined) {
      value.documents = oneOf<DocLanguage>(
        newVaultLanguages.documents,
        'newVaultLanguages.documents',
        UI_LANGUAGES,
      );
    }
    if (newVaultLanguages.conversation !== undefined) {
      value.conversation = oneOf(
        newVaultLanguages.conversation,
        'newVaultLanguages.conversation',
        UI_LANGUAGES,
      );
    }
    if (newVaultLanguages.translateSources !== undefined) {
      value.translateSources = boolean(
        newVaultLanguages.translateSources,
        'newVaultLanguages.translateSources',
      );
    }
    if (Object.keys(value).length > 0) out.newVaultLanguages = value;
  }
  if (source.startMinimized !== undefined) {
    out.startMinimized = boolean(source.startMinimized, 'startMinimized');
  }
  if (source.onboarded !== undefined) {
    out.onboarded = boolean(source.onboarded, 'onboarded');
  }
  if (Object.keys(out).length === 0) throw fail('invalid', 'diese Änderung enthält nichts');
  return out;
}

export interface LanguageChange {
  ui?: UiLanguage;
  documents?: DocLanguage;
  conversation?: UiLanguage;
}

/** The three languages are configurable separately — each validated on its own. */
export function sanitizeLanguages(next: unknown): LanguageChange {
  const source = bag(next, 'languages') ?? {};
  const out: LanguageChange = {};
  if (source.ui !== undefined) out.ui = oneOf(source.ui, 'ui', UI_LANGUAGES);
  if (source.documents !== undefined) {
    out.documents = oneOf<DocLanguage>(source.documents, 'documents', UI_LANGUAGES);
  }
  if (source.conversation !== undefined) {
    out.conversation = oneOf(source.conversation, 'conversation', UI_LANGUAGES);
  }
  if (Object.keys(out).length === 0) throw fail('invalid', 'keine Sprache angegeben');
  return out;
}
