/* Die einzigen Nutzertexte des Hauptprozesses. Zwei Stellen, beide begründet:

   1. **Die Windows-Benachrichtigung.** Sie entsteht im Main, auch wenn kein
      Fenster offen ist — der Renderer kann sie nicht formulieren. Ein Text, den
      nur `t()` kennt, wäre hier nicht erreichbar.
   2. **`RecentWorkItem.detail`.** Der IPC-Vertrag trägt an dieser Stelle einen
      fertigen Satz, keinen Code (anders als `IngestNoteCode`, wo der Renderer
      übersetzt). Der Kern lässt die Beschriftungen einsetzen
      (`core/overview/labels`) und stellt Deutsch als Vorgabe; das englische
      Gegenstück steht hier, weil `src/core/` keine Sprache wählt.

   Beides folgt `settings.uiLanguage()`. Sentence case, keine Emoji, Aussagen
   statt Ausrufe — dieselbe Tonlage wie die Oberfläche. */

import { GERMAN_RECENT_LABELS } from '@core/overview';
import type { RecentWorkLabels } from '@core/overview';
import type { UiLanguage } from '@shared/types';

const ENGLISH_KIND_NAMES: Record<string, string> = {
  youtube: 'YouTube',
  file: 'File',
  url: 'Web page',
  text: 'Text',
  bundle: 'Bundle',
};

const ENGLISH_RECENT_LABELS: RecentWorkLabels = {
  filesChanged(count: number): string {
    return count === 1 ? '1 file changed' : `${count} files changed`;
  },

  session(messages: number, branch: string | null): string {
    const parts = ['Session'];
    parts.push(messages === 1 ? '1 message' : `${messages} messages`);
    if (branch !== null && branch.length > 0) parts.push(`branch ${branch}`);
    return parts.join(', ');
  },

  journalEntry(words: number, turns: number): string {
    const parts = ['Journal entry', `${words} words`];
    if (turns > 0) parts.push(turns === 1 ? '1 exchange' : `${turns} exchanges`);
    return parts.join(', ');
  },

  ingested(kind: string, distilled: boolean): string {
    const name = ENGLISH_KIND_NAMES[kind] ?? kind;
    return distilled
      ? `Source added (${name}), distilled`
      : `Source added (${name}), not distilled`;
  },
};

/** Beschriftungen für „zuletzt gearbeitet" in der Sprache der Oberfläche. */
export function recentWorkLabels(language: UiLanguage): RecentWorkLabels {
  return language === 'en' ? ENGLISH_RECENT_LABELS : GERMAN_RECENT_LABELS;
}

/** Zusammenfassung einer Sammelbenachrichtigung: was ist überfällig, was heute fällig? */
export function dueSummary(language: UiLanguage, overdue: number, today: number): string {
  if (language === 'en') {
    const parts: string[] = [];
    if (overdue > 0) parts.push(overdue === 1 ? '1 thing overdue' : `${overdue} things overdue`);
    if (today > 0) parts.push(today === 1 ? '1 thing due today' : `${today} things due today`);
    return parts.join(', ');
  }
  const parts: string[] = [];
  if (overdue > 0)
    parts.push(overdue === 1 ? '1 Sache überfällig' : `${overdue} Sachen überfällig`);
  if (today > 0) {
    parts.push(today === 1 ? '1 Sache ist heute fällig' : `${today} Sachen sind heute fällig`);
  }
  return parts.join(', ');
}

/** Der Rumpf der Benachrichtigung: die Titel, plus wie viele nicht draufstehen. */
export function dueBody(language: UiLanguage, titles: readonly string[], rest: number): string {
  const listed = titles.join(' · ');
  if (rest <= 0) return listed;
  const more = language === 'en' ? `and ${rest} more` : `und ${rest} weitere`;
  return listed.length === 0 ? more : `${listed} · ${more}`;
}
