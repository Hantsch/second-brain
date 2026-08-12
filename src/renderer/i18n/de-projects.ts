/* Deutsche Texte des Projekt-Screens: Liste, Detail, Warte-auf, Todos.

   Eigene Datei, weil `de-screens.ts` sonst über den Zeilenrahmen wächst — und
   weil hier mehrere Agenten gleichzeitig schreiben. Flache Keys, sentence case,
   keine Emoji. `en-projects.ts` trägt denselben Key-Satz. */

export const deProjects = {
  // ── Liste ────────────────────────────────────────────────────────────────
  'projects.tab.list': 'Projekte',
  'projects.tab.todos': 'Alle Todos',
  'projects.scope.all': 'Alle',
  'projects.filter.scope': 'Bereich',
  'projects.filter.status': 'Nach Status',
  'projects.filter.statusOpen': 'Nur laufende',
  'projects.filter.sort': 'Sortierung',
  'projects.sort.touch': 'Zuletzt berührt',
  'projects.sort.deadline': 'Frist',
  'projects.sort.priority': 'Priorität',
  'projects.sort.name': 'Name',
  'projects.search': 'Projekt suchen',
  'projects.searchEmpty': 'Kein Projekt passt zu „{query}".',
  'projects.filterEmpty': 'Kein Projekt passt zu diesem Filter.',
  'projects.stalled.title': 'Lange nicht angefasst — {count}',
  'projects.list.aria': 'Projekte',
  'projects.open': 'Projekt „{title}" öffnen',
  'projects.waitingMark': 'wartet',
  'projects.openTodos': '{count} offen',
  'projects.keys': 'j/k wählen · Enter öffnet · n neues Projekt · t neues Todo · x hakt ab',
  'projects.detail.none': 'Links ein Projekt wählen.',

  // ── Neues Projekt ────────────────────────────────────────────────────────
  'projects.new.title': 'Neues Projekt',
  'projects.new.description':
    'Ein Projekt ist ein Ordner mit einer Datei. Titel und Bereich genügen — alles andere kommt später.',
  'projects.new.titleField': 'Titel',
  'projects.new.titlePlaceholder': 'Kundenportal Relaunch',
  'projects.new.scopeField': 'Bereich',
  'projects.new.statusField': 'Status',
  'projects.new.stepField': 'Erster nächster Schritt',
  'projects.new.stepPlaceholder': 'Womit fängst du an?',
  'projects.new.stepHint': 'Freiwillig. Fehlt er, erscheint das in den Ergebnissen der Pflege.',
  'projects.new.submit': 'Anlegen',
  'projects.new.pathHint': 'Angelegt wird {path}.',

  // ── Detail ───────────────────────────────────────────────────────────────
  'project.detail.aria': 'Projektdetail',
  'project.priority': 'Priorität {value}',
  'project.deadlineNone': 'Keine Frist',
  'project.statusLabel': 'Status',
  'project.statusSaved': 'Status steht jetzt auf „{status}".',
  'project.openFile': 'Projektdatei öffnen',

  'project.nextStep.title': 'Nächster Schritt',
  'project.nextStep.empty': 'Kein nächster Schritt festgelegt',
  'project.nextStep.edit': 'Nächsten Schritt bearbeiten',
  'project.nextStep.hint': 'Enter speichert, Esc bricht ab',
  'project.nextStep.saved': 'Gespeichert.',
  'project.nextStep.external':
    'Der nächste Schritt wurde außerhalb geändert: „{value}". Speichern überschreibt das.',
  'project.nextStep.externalEmpty':
    'Der nächste Schritt wurde außerhalb entfernt. Speichern trägt deine Fassung ein.',
  'project.nextStep.take': 'Fremde Fassung übernehmen',
  'project.nextStep.keep': 'Meine Fassung behalten',

  'project.suggest.action': 'Vorschlag holen',
  'project.suggest.title': 'Vorschlag',
  'project.suggest.notice': 'Ein Vorschlag. Geschrieben wird erst, wenn du ihn übernimmst.',
  'project.suggest.heuristic': 'Aus Regeln über den Bestand abgeleitet, ohne Modell.',
  'project.suggest.status': 'Status: {status}',
  'project.suggest.step': 'Nächster Schritt: {step}',
  'project.suggest.accept': 'Beides übernehmen',
  'project.suggest.acceptStep': 'Nur den Schritt',
  'project.suggest.reject': 'Verwerfen',
  'project.suggest.none':
    'Aus diesem Projekt lässt sich kein nächster Schritt ableiten — es gibt kein offenes Todo und kein Warte-auf. Trag ihn selbst ein.',

  'project.waiting.title': 'Warte auf',
  'project.waiting.empty': 'Du wartest bei diesem Projekt auf niemanden.',
  'project.waiting.since': 'seit {date}',
  'project.waiting.due': 'bis {date}',
  'project.waiting.overdue': 'überfällig',
  'project.waiting.resolve': 'Erledigt',
  'project.waiting.resolveAria': 'Warten auf {who} als erledigt markieren',
  'project.waiting.resolved': 'Warten auf {who} steht jetzt auf erledigt.',
  'project.waiting.resolvedWhere':
    'Der Eintrag bleibt mit „resolved: true" in der Projektdatei stehen, nur die Liste zeigt ihn nicht mehr.',

  'project.todos.title': 'Todos',
  'project.todos.empty':
    'Keine Checkbox in dieser Datei. Im Text gelten @due:2026-08-20 für die Frist, @wait:Name für „warte auf" und !! für die Priorität — auch in Obsidian getippt.',

  'project.state.title': 'Stand',
  'project.state.empty':
    'Kein Stand notiert. Der erste Absatz unter „## Stand" ist der Wiedereinstieg nach einer Pause.',
  'project.notes.title': 'Notizen',
  'project.notes.empty': 'Noch keine eingeordneten Dumps.',
  'project.notes.show': 'Notizen zeigen',
  'project.notes.hide': 'Notizen verbergen',

  'project.trace.title': 'Arbeitsspur',
  'project.trace.lastTouch': 'Letzte Spur {age}',
  'project.trace.source.file': 'Dateiänderung im Projektordner',
  'project.trace.source.claude-session': 'Claude-Session',
  'project.trace.source.journal': 'Tageseintrag',
  'project.trace.sessions': 'Claude-Sessions',
  'project.trace.noSessions': 'Keine Claude-Session zu diesem Projekt.',
  'project.trace.noRepos':
    'Ohne das Feld repos im Frontmatter lässt sich keine Session zuordnen. Zugeordnet wird über das Arbeitsverzeichnis.',
  'project.trace.pending':
    'Die Claude-Sessions sind noch nicht angeschlossen. Diese Sektion füllt sich, sobald der Kanal steht.',
  'project.trace.messages': '{count} Nachrichten',

  // ── Todos ────────────────────────────────────────────────────────────────
  'todos.group.overdue': 'Überfällig',
  'todos.group.today': 'Heute',
  'todos.group.week': 'Diese Woche',
  'todos.group.later': 'Später',
  'todos.group.none': 'Ohne Frist',
  'todos.count': '{count} Todos',
  'todos.countOne': 'ein Todo',
  'todos.openOf': '{open} von {total} offen',
  'todos.showDone': 'Erledigte zeigen',
  'todos.empty.title': 'Kein Todo im Vault',
  'todos.empty.body':
    'Ein Todo ist eine Checkbox in einer beliebigen Datei. Im Text gelten @due:2026-08-20 für die Frist, @wait:Name für „warte auf" und !! für die Priorität — du kannst sie auch in Obsidian tippen.',
  'todos.scopeEmpty': 'Hier ist nichts offen.',

  'todo.toggle': '„{text}" abhaken',
  'todo.untoggle': 'Häkchen bei „{text}" entfernen',
  'todo.dueEdit': 'Frist von „{text}" ändern',
  'todo.waitingFor': 'wartet auf {who}',
  'todo.neededBy': 'Antwort bis {date}',
  'todo.priorityMark': 'Priorität {value}',
  'todo.priority.high': 'High',
  'todo.priority.medium': 'Medium',
  'todo.priority.low': 'Low',
  'todo.priorityEdit': 'Priorität von „{text}“ ändern',
  'todo.edit.action': '„{text}“ bearbeiten',
  'todo.edit.text': 'Todo-Text',
  'todo.reorder': '„{text}“ umsortieren',
  'todo.doneAt': 'erledigt {date}',
  'todo.new.action': 'Todo hinzufügen',
  'todo.new.field': 'Neues Todo',
  'todo.new.due': 'Frist des neuen Todos',
  'todo.new.priority': 'Priorität des neuen Todos',
  'todo.new.placeholder': 'Was ist zu tun?',
  'todo.new.submit': 'Anlegen',
  'todo.new.hint': 'Enter legt an, Esc bricht ab',
} as const;
