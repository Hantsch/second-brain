/* Einstellungen kommen aus dem Renderer und sind damit ungeprüfte Nutzlast.
   Hier wird daraus eine Änderung, die in die Datei darf: bekannte Felder,
   richtiger Typ, sinnvoller Bereich. Alles andere fällt weg.

   Zwei Absichten:
   - Eine kaputte oder erfundene Zahl darf die App nicht in einen Zustand
     bringen, aus dem der Nutzer ohne Texteditor nicht mehr herauskommt
     (`staleAfterDays: 0` hielte jedes Projekt für stagnierend).
   - `providers` läuft ausschließlich über `llm:*`. Über diesen Weg käme sonst
     ein selbst gesetztes `hasKey` in die Vault-Datei. */

import { COACH_MODES } from '@shared/types';
import type { AppSettings, CoachMode, DocLanguage, UiLanguage, VaultSettings } from '@shared/types';
import type { DeepPartial } from '@shared/ipc';
import { fail } from './errors';

const UI_LANGUAGES: readonly UiLanguage[] = ['de', 'en'];
const THEMES: readonly AppSettings['theme'][] = ['dark', 'light', 'system'];

/** Grenzen der Zahlenfelder. Außerhalb wird geklemmt, nicht abgelehnt. */
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
  if (source.notifications !== undefined) {
    out.notifications = boolean(source.notifications, 'overview.notifications');
  }
  return out;
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
 * Macht aus der Nutzlast eine Änderung an den Vault-Einstellungen.
 * Unbekannte Abschnitte fallen weg; `providers` wird ausdrücklich abgewiesen,
 * damit Schlüssel-Zustand nur über `llm:*` entsteht.
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

/** Nur Felder, die die Oberfläche wirklich setzen darf. Fenstergröße bleibt im Main. */
export function sanitizeAppPatch(patch: unknown): Partial<AppSettings> {
  const source = bag(patch, 'patch') ?? {};
  const out: Partial<AppSettings> = {};
  if (source.theme !== undefined) out.theme = oneOf(source.theme, 'theme', THEMES);
  if (source.uiLanguage !== undefined) {
    out.uiLanguage = oneOf(source.uiLanguage, 'uiLanguage', UI_LANGUAGES);
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

/** Die drei Sprachen sind getrennt einstellbar — jede für sich geprüft. */
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
