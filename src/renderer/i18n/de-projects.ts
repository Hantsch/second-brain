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
  'projects.filter.statusAll': 'Alle',
  'projects.filter.statusOpen': 'Nur laufende',
  'projects.filter.sort': 'Sortierung',
  'projects.filter.showEmptySessions': 'Sitzungen-Tab immer zeigen',
  'projects.filter.showEmptySessionsFailed': 'Die Einstellung ließ sich nicht speichern.',
  'projects.sort.touch': 'Zuletzt berührt',
  'projects.sort.deadline': 'Frist',
  'projects.sort.priority': 'Priorität',
  'projects.sort.name': 'Name',
  'projects.search': 'Projekt suchen',
  'projects.searchEmpty': 'Kein Projekt passt zu „{query}“.',
  'projects.filterEmpty': 'Kein Projekt passt zu diesem Filter.',
  'projects.stalled.title': 'Lange nicht angefasst — {count}',
  'projects.list.aria': 'Projekte',
  'projects.open': 'Projekt „{title}“ öffnen',
  'projects.favorite.add': '„{title}“ mit Stern markieren',
  'projects.favorite.remove': 'Stern von „{title}“ entfernen',
  'projects.lastWorkedOn': 'Zuletzt bearbeitet',
  'projects.waitingMark': 'wartet',
  'projects.openTodos': '{count} offen',
  'projects.keys':
    'j/k wählen · Enter öffnet · n neues Projekt · t neues Todo · x hakt ab · m neue Notiz · w warte auf',
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
  'projects.new.stepHint': 'Freiwillig. Fehlt er, erscheint das in den Befunden der Pflege.',
  'projects.new.submit': 'Anlegen',
  'projects.new.pathHint': 'Angelegt wird {path}.',

  // ── Detail ───────────────────────────────────────────────────────────────
  'project.detail.aria': 'Projektdetail',
  'project.priority': 'Priorität {value}',
  'project.deadlineNone': 'Keine Frist',
  'project.statusLabel': 'Status',
  'project.statusSaved': 'Status steht jetzt auf „{status}“.',
  'project.openFile': 'Projektdatei öffnen',

  // ── Herkunft ─────────────────────────────────────────────────────────────
  'project.provenance.setByUser': 'Von dir gesetzt · {date}',
  'project.provenance.acceptedSuggestion': 'Aus einem Vorschlag übernommen · {date}',
  'project.provenance.writtenByFiling': 'Durch Ablage eingetragen · {date}',
  'project.provenance.unknown': 'Herkunft nicht erfasst · zuletzt berührt {age}',

  'project.nextStep.title': 'Nächster Schritt',
  'project.nextStep.empty': 'Kein nächster Schritt festgelegt',
  'project.nextStep.edit': 'Nächsten Schritt bearbeiten',
  'project.nextStep.hint': 'Enter speichert, Esc bricht ab',
  'project.nextStep.saved': 'Gespeichert.',
  'project.nextStep.external':
    'Der nächste Schritt wurde außerhalb geändert: „{value}“. Speichern überschreibt das.',
  'project.nextStep.externalEmpty':
    'Der nächste Schritt wurde außerhalb entfernt. Speichern trägt deine Fassung ein.',
  'project.nextStep.take': 'Fremde Fassung übernehmen',
  'project.nextStep.keep': 'Meine Fassung behalten',
  'project.nextStep.stale': 'Möglicherweise veraltet',
  'project.nextStep.staleExplain': 'Seit dem Eintragen hat sich etwas im Projekt getan.',

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
    'Der Eintrag bleibt mit „resolved: true“ in der Projektdatei stehen, nur die Liste zeigt ihn nicht mehr.',
  'project.waiting.added': 'Warten auf {who} eingetragen.',
  'project.waiting.new.action': 'Warten auf hinzufügen',
  'project.waiting.new.who': 'Auf wen wird gewartet',
  'project.waiting.new.whoPlaceholder': 'Name',
  'project.waiting.new.what': 'Worauf wird gewartet',
  'project.waiting.new.whatPlaceholder': 'Worauf? (optional)',
  'project.waiting.new.since': 'Seit',
  'project.waiting.new.due': 'Bis',
  'project.waiting.new.submit': 'Eintragen',
  'project.waiting.new.hint': 'Enter trägt ein, Esc bricht ab',

  'project.todos.title': 'Todos',
  'project.todos.empty':
    'Keine Checkbox in dieser Datei. Im Text gelten @due:2026-08-20 für die Frist, @wait:Name für „warte auf“ und !! für die Priorität — auch in Obsidian getippt.',

  'project.state.title': 'Stand',
  'project.state.empty':
    'Kein Stand notiert. Der erste Absatz unter „## Stand“ ist der Wiedereinstieg nach einer Pause.',
  'project.notes.title': 'Notizen',
  'project.notes.empty': 'Noch keine eingeordneten Dumps.',
  'project.notes.added': 'Notiz eingetragen.',
  'project.notes.composer.placeholder': 'Notiz eintragen',
  'project.notes.composer.hint': 'Strg+Enter speichert die Notiz.',
  'project.notes.composer.save': 'Speichern',

  'project.tab.label': 'Projektansicht wählen',
  'project.tab.overview': 'Überblick',
  'project.tab.knowledge': 'Wissen',
  'project.tab.sessions': 'Sitzungen',

  // ── Der Wissen-Tab (Story 045, D4) ────────────────────────────────────────
  'project.condensed.empty.title': 'Noch nicht verdichtet',
  'project.condensed.empty.body':
    'Eine Verdichtung fasst dieses Projekt zu einer Seite zusammen, die ein Modell von da an aktuell hält.',
  'project.condensed.trigger': 'Dieses Projekt verdichten',
  'project.condensed.triggerAgain': 'Erneut verdichten',
  'project.condensed.running': 'Verdichtung läuft',
  'project.condensed.meta.condensedAt': 'Verdichtet am {date}',
  'project.condensed.meta.sources': '{count} Quellen',
  'project.condensed.notEvidence':
    'Diese Verdichtung wird nicht als Beleg zitiert — Antworten verweisen stattdessen auf ihre Quellen.',

  'project.condensed.diff.summary': '{removed} entfernt, {added} hinzugefügt',
  'project.condensed.diff.added': 'hinzugefügt',
  'project.condensed.diff.removed': 'entfernt',
  'project.condensed.accept': 'Übernehmen',
  'project.condensed.accept.conflict':
    'Die Datei für {subject} hat sich seit diesem Vorschlag geändert. Verdichtung erneut ausführen.',

  'project.condensed.reject': 'Ablehnen',
  'project.condensed.reject.title': 'Diesen Vorschlag ablehnen',
  'project.condensed.reject.description':
    'Eine Begründung ist erforderlich — sie bleibt beim Projekt, damit die nächste Verdichtung sie berücksichtigen kann.',
  'project.condensed.reject.fieldLabel': 'Begründung',
  'project.condensed.reject.placeholder': 'Was sollte sich ändern, bevor das übernommen wird?',
  'project.condensed.reject.submit': 'Ablehnen',

  'project.condensed.delete.action': 'Verdichtung löschen',
  'project.condensed.delete.title': '„{path}“ löschen?',
  'project.condensed.delete.description':
    'Abschnitte und Quellen darin lassen sich neu erzeugen — ein späterer Lauf baut sie aus dem Projekt wieder auf.',
  'project.condensed.delete.directivesLost':
    'Der Direktiven-Abschnitt ist der einzige Teil, den kein späterer Lauf wiederherstellen kann — er kam ausschließlich aus dem, was du selbst dort hineingeschrieben hast.',
  'project.condensed.delete.confirm': 'Löschen',
  'project.condensed.delete.done': 'Verdichtung gelöscht.',
  'project.condensed.delete.conflict':
    'Die Datei für {subject} hat sich seit dem letzten Lesen geändert. Es wurde nichts gelöscht.',

  'project.trace.title': 'Arbeitsspur',
  'project.trace.lastTouch': 'Letzte Spur {age}',
  'project.trace.source.file': 'Dateiänderung im Projektordner',
  'project.trace.source.claude-session': 'Claude-Session',
  'project.trace.source.journal': 'Tageseintrag',
  'project.trace.noRepos':
    'Ohne das Feld repos im Frontmatter lässt sich keine Session zuordnen. Zugeordnet wird über das Arbeitsverzeichnis.',

  'project.sessions.noneLinked':
    'Kein Arbeitsverzeichnis von {agent} gehört zu diesem Projekt. Zugeordnet wird über das Arbeitsverzeichnis aus repos.',
  'project.sessions.empty': 'Keine Sitzung von {agent} in diesem Projekt aufgezeichnet.',
  'project.sessions.notFound.title': 'Sitzung nicht gefunden',
  'project.sessions.unlinked.title': 'Kein Arbeitsverzeichnis zugeordnet',
  'project.sessions.unlinked.where':
    'Unter „Alle Sitzungen“ ordnest du diesem Projekt ein Arbeitsverzeichnis zu.',
  'project.sessions.unlinked.action': 'Verzeichnis zuordnen',

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
    'Ein Todo ist eine Checkbox in einer beliebigen Datei. Im Text gelten @due:2026-08-20 für die Frist, @wait:Name für „warte auf“ und !! für die Priorität — du kannst sie auch in Obsidian tippen.',
  'todos.scopeEmpty': 'Hier ist nichts offen.',

  'todo.toggle': '„{text}“ abhaken',
  'todo.untoggle': 'Häkchen bei „{text}“ entfernen',
  'todo.dueEdit': 'Frist von „{text}“ ändern',
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
