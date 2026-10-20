/* German texts for the journal's month calendar (010, D1) — a separate
   partial from `de-journal.ts` because that file is already large; both are
   spread into `de.ts` the same way. */

export const deJournalCalendar = {
  'journal.calendar.title': 'Monatskalender',
  'journal.calendar.prevMonth': 'Vorheriger Monat',
  'journal.calendar.nextMonth': 'Nächster Monat',
  'journal.calendar.today': 'Heute',
  'journal.calendar.expand': 'Kalender ausklappen',
  'journal.calendar.collapse': 'Kalender einklappen',
  /* Bewusst nicht „Eintrag vom {date} öffnen“ — das ist wortgleich mit
     `journal.open` (die Zeile der Tagesliste) für denselben Tag, und seit
     010/D2 stehen beide Bedienelemente auf demselben Bildschirm: zwei
     Elemente mit demselben barrierefreien Namen wären für Screenreader wie
     für `getByRole` nicht mehr unterscheidbar. */
  'journal.calendar.open': 'Kalendertag {date} öffnen',
  /* Der Grund, warum der Tag nicht klickbar ist — nicht nur „deaktiviert“. */
  'journal.calendar.future': 'Liegt in der Zukunft, noch kein Eintrag',
  'journal.calendar.hasEntry': 'Hat einen Eintrag',
  /* 010/D3: der sichtbare Hinweis auf die Tasten des Gitters — die
     Monatsschritte haben eigene Knöpfe, die Pfeile im Gitter nur diese Zeile. */
  'journal.calendar.keys': 'Pfeiltasten bewegen im Gitter, Bild-auf und Bild-ab den Monat',
  /* 010/D4: der Tag ist vorbei, hat eine Datei, aber `closed` ist noch
     `null` — nie für heute (siehe `isDayOpen`). */
  'journal.calendar.unfinished': 'Tag noch nicht abgeschlossen',
  /* 070/D4: eine zukünftige Erwähnung verweist auf diesen Tag — wird an den
     barrierefreien Namen der Zelle angehängt (`journal.calendar.open`/
     `journal.calendar.future`), nicht als Ersatz dafür. */
  'journal.calendar.upcomingMention': 'Eine zukünftige Erwähnung verweist hierher',
} as const;
