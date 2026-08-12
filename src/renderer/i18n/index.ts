/* Translation. No German string is hardcoded in the renderer — everything
   goes through `t()`. The language comes from the settings (`languages.ui`);
   without a vault, the app language applies. */

import { useSyncExternalStore } from 'react';
import type { UiLanguage } from '@shared/types';
import { de } from './de';
import type { TranslationKey } from './de';
import { en } from './en';

export type { TranslationKey } from './de';
export type Vars = Record<string, string | number>;

const CATALOGS: Record<UiLanguage, Record<string, string>> = { de, en };
const subscribers = new Set<() => void>();

let language: UiLanguage = 'de';

function emit(): void {
  for (const notify of subscribers) notify();
}

export function currentLanguage(): UiLanguage {
  return language;
}

export function setLanguage(next: UiLanguage): void {
  if (next === language) return;
  language = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  emit();
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Translates a key. Unknown keys come back unchanged — this way a message
 * from the main process stays readable even when it isn't a key.
 */
export function t(key: TranslationKey | string, vars?: Vars): string {
  const template = CATALOGS[language][key] ?? (de as Record<string, string>)[key] ?? key;
  return interpolate(template, vars);
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/** Hook variant: re-renders when the language changes. */
export function useLanguage(): UiLanguage {
  return useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
}

export function useT(): typeof t {
  useLanguage();
  return t;
}
