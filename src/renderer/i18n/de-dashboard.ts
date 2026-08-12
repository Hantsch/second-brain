/* Deutsche Oberflächentexte des Dashboards: die Zusammenfassung des Tages, das
   Gitter mit seinen zwei Bedienwegen, die Auswahl der Module und die Kacheln.

   `module.<id>.name` ist zweimal derselbe Text und deshalb nur einmal da: er ist
   der Titel der Kachel *und* ihr Name in der Auswahl. `module.<id>.purpose` ist
   der eine Satz, der sagt, wofür das Modul gut ist.

   Flache Keys, sentence case, keine Emoji. `en-dashboard.ts` trägt denselben
   Key-Satz — ein Test prüft das. */

export const deDashboard = {
  // ── Zusammenfassung des Tages ─────────────────────────────────────────────
  'dashboard.summary.label': 'Was heute drückt',
  'dashboard.summary.overdue': '{count} überfällig',
  'dashboard.summary.today': '{count} heute fällig',
  'dashboard.summary.waitingOne': '1 Antwort ausstehend',
  'dashboard.summary.waitingMany': '{count} Antworten ausstehend',
  'dashboard.summary.clear': 'Nichts ist überfällig, nichts ist heute fällig.',
  'dashboard.summary.jump': 'Zu „{module}" springen',

  // ── Das Gitter ───────────────────────────────────────────────────────────
  'dashboard.tiles.label': 'Module des Dashboards',
  'dashboard.tiles.empty':
    'Alle Module sind ausgeblendet. In der Auswahl steht, was hier stehen kann.',
  'dashboard.tile.grab': '{title} verschieben',
  'dashboard.tile.menu': 'Menü von {title}',
  'dashboard.tile.size': 'Breite',
  'dashboard.tile.size.sm': 'Schmal, eine Spalte',
  'dashboard.tile.size.md': 'Mittel, zwei Spalten',
  'dashboard.tile.size.lg': 'Breit, drei Spalten',
  'dashboard.tile.size.xl': 'Ganze Zeile, vier Spalten',
  'dashboard.tile.hide': 'Ausblenden',
  'dashboard.tile.position': 'Position {position} von {total}',
  'dashboard.move.hint':
    'Leertaste hebt an, Pfeiltasten verschieben, Enter legt ab, Esc bricht ab.',
  'dashboard.move.lifted': 'Verschiebemodus. {title}, Position {position} von {total}.',
  'dashboard.move.moved': '{title}, Position {position} von {total}.',
  'dashboard.move.dropped': '{title} liegt auf Position {position} von {total}.',
  'dashboard.move.cancelled': 'Abgebrochen. {title} steht wieder auf Position {position}.',
  'dashboard.move.status': 'Verschieben',
  'dashboard.move.bar':
    '{title}, Position {position} von {total} · Pfeile verschieben · Enter legt ab · Esc bricht ab',
  'dashboard.tile.hidden': '„{title}" ausgeblendet',
  'dashboard.tile.hiddenWhere': 'Die Kachel steht weiter in der Auswahl unter „Module".',
  'dashboard.layout.saveFailed': 'Die Anordnung ließ sich nicht speichern.',

  // ── Auswahl der Module ───────────────────────────────────────────────────
  'dashboard.catalog.open': 'Module',
  'dashboard.catalog.title': 'Module des Dashboards',
  'dashboard.catalog.body':
    'Haken setzen zeigt ein Modul, Haken entfernen blendet es aus. Verschoben wird im Gitter.',
  'dashboard.catalog.visible': '{count} von {total} sichtbar',
  'dashboard.catalog.reset': 'Anordnung zurücksetzen',

  // ── Namen und Zweck der Module ───────────────────────────────────────────
  'module.quick-capture.name': 'Schnell erfassen',
  'module.quick-capture.purpose': 'Ein Feld für den Gedanken, der gerade kommt.',
  'module.ask.name': 'Frage',
  'module.ask.purpose': 'Eine Frage an das Second Brain, beantwortet aus dem Vault.',
  'module.recent-work.name': 'Zuletzt gearbeitet',
  'module.recent-work.purpose':
    'Dateiänderungen, Claude-Sessions, Tageseinträge und Quellen in einer Spur.',
  'module.deadlines.name': 'Steht an',
  'module.deadlines.purpose': 'Fristen von Projekten und Todos im eingestellten Horizont.',
  'module.waiting-on.name': 'Warte auf',
  'module.waiting-on.purpose': 'Wer was schuldet, seit wann und bis wann.',
  'module.todos-work.name': 'Todos Arbeit',
  'module.todos-work.purpose': 'Offene Aufgaben aus dem Arbeitsbereich, nach Fälligkeit gruppiert.',
  'module.todos-private.name': 'Todos Privat',
  'module.todos-private.purpose':
    'Offene Aufgaben aus dem privaten Bereich, nach Fälligkeit gruppiert.',
  'module.active-projects.name': 'Laufende Projekte',
  'module.active-projects.purpose': 'Was läuft, mit nächstem Schritt und Frist.',
  'module.inbox.name': 'Inbox',
  'module.inbox.purpose': 'Wie viele Dumps liegen und welche am längsten.',
  'module.stale-projects.name': 'Stagnierende Projekte',
  'module.stale-projects.purpose': 'Lange nicht angefasst und noch nicht abgeschlossen.',
  'module.journal-streak.name': 'Tagebuch-Serie',
  'module.journal-streak.purpose': 'Tage in Folge, letzter Eintrag, Stimmung der letzten Wochen.',
  'module.claude-sessions.name': 'Claude-Sessions',
  'module.claude-sessions.purpose': 'Arbeitsspuren der Agenten-CLI, den Projekten zugeordnet.',
  'module.gardener.name': 'Pflege',
  'module.gardener.purpose': 'Gesundheitswert und Befunde des letzten Pflegelaufs.',

  // ── Kacheln ──────────────────────────────────────────────────────────────
  'tile.more': '{count} weitere',
  'tile.capture.label': 'Gedanke',
  'tile.capture.placeholder': 'Roh und unsortiert.',
  'tile.capture.hint': 'speichert in die Inbox',
  'tile.ask.label': 'Frage an das Second Brain',
  'tile.ask.placeholder': 'Was weiß ich über …?',
  'tile.ask.submit': 'Fragen',
  'tile.ask.hint': 'Die Frage wandert mit in den Fragen-Screen.',

  'tile.recent.empty':
    'Noch keine Arbeitsspur. Wer eine Datei ändert, eine Sitzung fährt oder einen Tageseintrag schreibt, steht hier.',

  'tile.claude.empty': 'Keine Sitzung in den letzten Tagen.',
  'tile.claude.off': 'Das Mitlesen der Claude-Sessions ist ausgeschaltet.',
  'tile.claude.settings': 'Einschalten',
  'tile.claude.messages': '{count} Nachrichten',
  'tile.claude.unlinked': 'Ohne Projekt',
  'tile.claude.link': 'Projekt zuordnen',
  'tile.claude.linkFor': 'Sitzung „{name}" einem Projekt zuordnen',
  'tile.claude.linkHint': 'Der Pfad der Sitzung wandert in „repos" des Projekts.',
  'tile.claude.linked': 'Zugeordnet. Der Pfad steht jetzt in „repos".',
  'tile.claude.linkedTo': 'Sitzung „{name}" zugeordnet',
  'tile.claude.linkSearch': 'Projekt suchen',
  'tile.claude.linkNoMatch': 'Kein Projekt passt zu „{query}".',

  'tile.stale.empty': 'Kein Projekt liegt länger als die eingestellte Schwelle brach.',
  'tile.stale.days': 'seit {count} Tagen',
  'tile.active.empty':
    'Kein laufendes Projekt. Ein Projekt auf „läuft" zu setzen, macht es hier sichtbar.',
  'tile.project.open': 'Projekt „{title}" öffnen',
  'tile.projects.all': 'Zu den Projekten',

  'tile.todos.emptyWork': 'Kein offenes Todo im Arbeitsbereich.',
  'tile.todos.emptyPrivate': 'Kein offenes Todo im privaten Bereich.',
  'tile.todos.group.overdue': 'Überfällig',
  'tile.todos.group.today': 'Heute',
  'tile.todos.group.week': 'Diese Woche',
  'tile.todos.group.later': 'Später',
  'tile.todos.group.none': 'Ohne Frist',
  'tile.todos.open': 'Alle Todos',

  'tile.waiting.empty': 'Du wartest auf niemanden.',
  'tile.waiting.since': 'seit {date}',
  'tile.waiting.due': 'bis {date}',
  'tile.waiting.overdue': 'überfällig',

  'tile.deadlines.empty': 'Keine Frist in den nächsten {days} Tagen.',
  'tile.deadlines.project': 'Projektfrist',
  'tile.deadlines.todo': 'Todo',
  'tile.deadlines.snooze': '„{title}" ruhig stellen',

  /* Ruhig stellen heißt: bis zu einem Tag nicht mahnen. Deshalb steht in jeder
     Auswahl der Tag, an dem wieder gemahnt wird — „für drei Tage" ist eine
     Rechnung, die der Nutzer im Kopf machen müsste. */
  'reminder.snooze.title': 'Wieder erinnern',
  'reminder.snooze.today': 'Nicht mehr heute',
  'reminder.snooze.tomorrow': 'Bis morgen',
  'reminder.snooze.week': 'Nächste Woche',
  'reminder.snooze.custom': 'Eigenes Datum',
  'reminder.snooze.pick': 'Wieder erinnern am',
  'reminder.snooze.apply': 'Ruhig stellen',
  'reminder.snooze.until': 'mahnt wieder am {date}',
  'reminder.snooze.done': 'Ruhig gestellt. Mahnt wieder am {date}.',
  'reminder.snooze.undo': 'Rückgängig',
  'reminder.snooze.undone': 'Mahnt wieder.',
  'reminder.snooze.past': 'Dieser Tag ist nicht in der Zukunft.',

  'tile.inbox.empty': 'Die Inbox ist leer. Erfasste Gedanken liegen hier, bis sie ein Ziel haben.',
  'tile.inbox.countOne': '1 Dump liegt hier',
  'tile.inbox.countMany': '{count} Dumps liegen hier',
  'tile.inbox.open': 'Zur Inbox',

  'tile.journal.empty': 'Noch kein Tageseintrag. Ein Eintrag am Tag hält die Serie.',
  'tile.journal.streakOne': '1 Tag in Folge',
  'tile.journal.streakMany': '{count} Tage in Folge',
  'tile.journal.streakNone': 'Keine Serie',
  'tile.journal.last': 'Letzter Eintrag {date}',
  'tile.journal.moodLabel': 'Stimmungsverlauf der letzten {days} Tage',
  'tile.journal.moodValues': 'Stimmung, älteste zuerst: {values} von 5.',
  'tile.journal.moodNone': 'Keine Stimmung eingetragen.',
  'tile.journal.open': 'Zum Tagebuch',

  'tile.gardener.unknown':
    'Noch nicht geprüft. Der Pflegelauf findet verwaiste Seiten, kaputte Links und liegengebliebene Dumps.',
  'tile.gardener.check': 'Jetzt prüfen',
  'tile.gardener.worst': 'Am schwersten',
  'tile.gardener.health': 'Gesundheit',
  'tile.gardener.findingsOne': '1 Befund',
  'tile.gardener.findingsMany': '{count} Befunde',
  'tile.gardener.open': 'Zur Pflege',
} as const;
