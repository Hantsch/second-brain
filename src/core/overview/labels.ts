/**
 * Die Beschriftungen von „zuletzt gearbeitet".
 *
 * `RecentWorkItem.detail` ist der einzige Nutzertext, den der Ueberblick selbst
 * bildet — „3 Dateien geaendert", „Session, 47 Nachrichten, Branch feature/auth".
 * Damit er nicht auf Deutsch festgenagelt ist, ist er **einsetzbar**: die Shell
 * kann eine Uebersetzung hereingeben, die Vorgabe ist Deutsch.
 *
 * Zahlen bleiben Zahlen: was hier steht, ist gezaehlt, nicht geschaetzt.
 */

/** Was „zuletzt gearbeitet" an Formulierungen braucht. */
export interface RecentWorkLabels {
  /** `count` geaenderte Dateien in einem Projekt an einem Tag. */
  filesChanged(count: number): string;
  /** Eine Claude-Sitzung mit Nachrichtenzahl und Branch. */
  session(messages: number, branch: string | null): string;
  /** Ein Tageseintrag mit Wortzahl und Dialogrunden. */
  journalEntry(words: number, turns: number): string;
  /** Eine aufgenommene Quelle; `distilled` sagt, ob sie schon verdichtet ist. */
  ingested(kind: string, distilled: boolean): string;
}

const KIND_NAMES: Record<string, string> = {
  youtube: 'YouTube',
  file: 'Datei',
  url: 'Webseite',
  text: 'Text',
  bundle: 'Sammlung',
};

/** Vorgabe auf Deutsch. Sentence case, keine Emoji, Aussagen statt Ausrufe. */
export const GERMAN_RECENT_LABELS: RecentWorkLabels = {
  filesChanged(count: number): string {
    return count === 1 ? '1 Datei geändert' : `${count} Dateien geändert`;
  },

  session(messages: number, branch: string | null): string {
    const parts = ['Session'];
    parts.push(messages === 1 ? '1 Nachricht' : `${messages} Nachrichten`);
    if (branch !== null && branch.length > 0) parts.push(`Branch ${branch}`);
    return parts.join(', ');
  },

  journalEntry(words: number, turns: number): string {
    const parts = ['Tageseintrag', `${words} Wörter`];
    if (turns > 0) parts.push(turns === 1 ? '1 Dialogrunde' : `${turns} Dialogrunden`);
    return parts.join(', ');
  },

  ingested(kind: string, distilled: boolean): string {
    const name = KIND_NAMES[kind] ?? kind;
    return distilled
      ? `Quelle aufgenommen (${name}), verdichtet`
      : `Quelle aufgenommen (${name}), noch nicht verdichtet`;
  },
};
