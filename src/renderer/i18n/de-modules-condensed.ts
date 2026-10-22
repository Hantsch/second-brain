/* Deutsche Texte des Verdichtet-Tabs eines Moduls. Gleicher Schlüsselsatz wie
   `en-modules-condensed.ts` — ein Test erzwingt das. Einen Löschen-Block gibt es
   nicht: Die Übersichtsseite gehört zum Modul, das Panel bietet dafür kein
   Löschen an. Diff- und Ablehnen-Dialog lesen die gemeinsamen
   `notes.condensed.*`-Texte. */

export const deModulesCondensed = {
  'modules.condensed.empty.title': 'Noch nicht verdichtet',
  'modules.condensed.empty.body':
    'Eine Verdichtung fasst die Seiten dieses Moduls zu einer Übersicht zusammen. Sie läuft nur, wenn du auf Verdichten klickst, und du siehst sie als Diff, bevor etwas geschrieben wird.',
  'modules.condensed.trigger': 'Dieses Modul verdichten',
  'modules.condensed.triggerAgain': 'Erneut verdichten',
  'modules.condensed.running': 'Verdichtung läuft',
  'modules.condensed.waiting': 'Wartet auf das Modell — Platz {position} in der Warteschlange',
  'modules.condensed.failed.reason': 'Grund: {reason}',
  'modules.condensed.meta.condensedAt': 'Verdichtet am {date}',
  'modules.condensed.meta.sources': '{count} Quellen',
  'modules.condensed.notEvidence':
    'Diese Verdichtung wird nicht als Beleg zitiert — Antworten verweisen stattdessen auf ihre Quellen.',
  'modules.condensed.accept': 'Übernehmen',
  'modules.condensed.accept.conflict':
    'Die Datei für {subject} hat sich seit diesem Vorschlag geändert. Verdichtung erneut ausführen.',
  'modules.condensed.reject': 'Ablehnen',
} as const;
