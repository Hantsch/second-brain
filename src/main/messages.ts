/* The main process's only user-facing text. Three spots, all justified:

   1. **The Windows notification.** It's created in the main process, even
      when no window is open — the renderer can't compose it. A string that
      only `t()` knows would be unreachable here.
   2. **`RecentWorkItem.detail`.** At this point the IPC contract carries a
      finished sentence, not a code (unlike `IngestNoteCode`, where the
      renderer translates). The core lets the labels be injected
      (`core/overview/labels`) and defaults to German; the English
      counterpart lives here, because `src/core/` never chooses a language.
   3. **The tray menu.** Same reasoning as the notification: `Tray`/`Menu` are
      built in the main process, independent of whether any renderer window
      exists at all, so their labels can't go through `t()` either.

   All three follow `settings.uiLanguage()`. Sentence case, no emoji, statements
   instead of exclamations — the same tone as the UI. */

import { GERMAN_RECENT_LABELS } from '@core/overview';
import type { RecentWorkLabels } from '@core/overview';
import type { AgentKind, UiLanguage } from '@shared/types';

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

  session(agent: AgentKind, messages: number, branch: string | null): string {
    const parts = [agent === 'codex' ? 'Codex session' : 'Claude session'];
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

/** Labels for "recently worked on" in the UI's language. */
export function recentWorkLabels(language: UiLanguage): RecentWorkLabels {
  return language === 'en' ? ENGLISH_RECENT_LABELS : GERMAN_RECENT_LABELS;
}

/** Summary of a collected notification: what's overdue, what's due today? */
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

/** Labels for the tray menu's three items (058, D2). */
export interface TrayLabels {
  open: string;
  quickCapture: string;
  quit: string;
}

const ENGLISH_TRAY_LABELS: TrayLabels = {
  open: 'Open Gaston',
  quickCapture: 'Quick capture',
  quit: 'Quit Gaston',
};

const GERMAN_TRAY_LABELS: TrayLabels = {
  open: 'Gaston öffnen',
  quickCapture: 'Schnell erfassen',
  quit: 'Gaston beenden',
};

/** Labels for the tray menu in the UI's language. */
export function trayLabels(language: UiLanguage): TrayLabels {
  return language === 'en' ? ENGLISH_TRAY_LABELS : GERMAN_TRAY_LABELS;
}

/** The notification's body: the titles, plus how many more aren't listed. */
export function dueBody(language: UiLanguage, titles: readonly string[], rest: number): string {
  const listed = titles.join(' · ');
  if (rest <= 0) return listed;
  const more = language === 'en' ? `and ${rest} more` : `und ${rest} weitere`;
  return listed.length === 0 ? more : `${listed} · ${more}`;
}
