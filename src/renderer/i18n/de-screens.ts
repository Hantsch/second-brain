/* German UI texts, part 2: the screens, onboarding, and the quick-capture
   window.

   Two kinds of text per screen that must never be mixed up:
   - `empty.*` applies only once the query has loaded AND nothing was found.
     Empty means empty.
   - `pending.*` applies while the view is still being built. These texts
     make no claim about the vault; the number next to them comes from the
     index. */

export const deScreens = {
  'screen.dashboard.overline': 'Überblick',
  'screen.dashboard.title': 'Dashboard',
  'screen.dashboard.empty.title': 'Noch keine Spur im Vault',
  'screen.dashboard.empty.body':
    'Sobald Projekte, Todos und Tageseinträge im Vault liegen, stehen hier drei Module: woran du zuletzt gearbeitet hast, was ansteht und auf wen du wartest.',
  'screen.dashboard.empty.action': 'Gedanken erfassen',

  'dashboard.recent.title': 'Zuletzt gearbeitet',
  'dashboard.recent.empty': 'Noch keine Arbeitsspur. Wer an einem Projekt schreibt, steht hier.',
  'dashboard.next.title': 'Steht an',
  'dashboard.next.empty': 'Kein offenes Todo mit Frist.',
  'dashboard.waiting.title': 'Warte auf',
  'dashboard.waiting.empty': 'Du wartest auf niemanden.',
  'dashboard.waiting.since': 'seit {date}',

  'stats.title': 'Was im Vault steht',
  'stats.docs': 'Dokumente',
  'stats.projects': 'Projekte',
  'stats.todos': 'Todos',
  'stats.pages': 'Wiki-Seiten',
  'stats.words': 'Wörter',

  'screen.capture.overline': 'Reindumpen',
  'screen.capture.title': 'Erfassen',
  'screen.capture.empty.title': 'Ein Feld, ein Gedanke',
  'screen.capture.empty.body':
    'Schreib rein, was dir durch den Kopf geht. Eingeordnet wird später — als Vorschlag, den du bestätigst.',
  'screen.capture.empty.action': 'Schnell erfassen',
  'capture.ask': 'Was liegt an?',
  'capture.placeholder': 'Ein Gedanke, ein Arbeitsstand, eine Sorge — roh und unsortiert.',
  'capture.save': 'Speichern',
  'capture.hint': 'speichert',
  'capture.hintEscape': 'verlässt das Feld',
  'capture.hintPalette': 'springt in die Befehlspalette',
  'capture.window': 'Im eigenen Fenster',
  'capture.count': '{chars} Zeichen · {words} Wörter',
  'capture.scope': 'Bereich',
  'capture.scopeOpen': 'Offen lassen',
  'capture.tags': 'Tags',
  'capture.tagsPlaceholder': 'kundenportal, idee',
  'capture.saved': 'Gespeichert in',
  'capture.undo': 'Rückgängig',
  'capture.toInbox': 'Zur Inbox',
  'capture.classifying': 'Vorschlag wird erstellt …',
  'capture.classified': 'Vorschlag steht — in der Inbox',
  'capture.toProposal': 'In der Inbox ansehen',

  'screen.inbox.overline': 'Einordnen',
  'screen.inbox.title': 'Inbox',
  'screen.inbox.empty.title': 'Die Inbox ist leer',
  'screen.inbox.empty.body':
    'Erfasste Gedanken liegen hier, bis sie ein Ziel haben. Zu jedem Dump schlägt die App eine Ablage vor und sagt, warum.',
  'screen.inbox.empty.action': 'Gedanken erfassen',
  'inbox.panelTitle': 'Liegt in der Inbox',
  'inbox.count': '{count} Dumps',
  'inbox.countOne': 'ein Dump',
  'inbox.age.today': 'heute erfasst',
  'inbox.age.one': 'liegt seit einem Tag',
  'inbox.age.days': 'liegt seit {count} Tagen',
  'inbox.scope.open': 'Bereich offen',
  'inbox.words': '{count} Wörter',
  'inbox.dump.more': 'Mehr anzeigen',
  'inbox.dump.less': 'Weniger anzeigen',

  'inbox.proposal.overline': 'Vorschlag',
  'inbox.proposal.confidence': 'Zuversicht {percent} %',
  'inbox.proposal.changed': 'Ziel von dir gewählt.',
  'inbox.proposal.heuristic': 'Ohne Modell eingeordnet — Regeln statt Verstehen.',
  'inbox.proposal.exact': 'Das wird geschrieben',
  /* „Bleibt in der Inbox" schreibt nichts. Die Beschriftung muss das sagen,
     sonst behauptet das Feld einen Schreibvorgang, den es nicht gibt. */
  'inbox.proposal.nothing': 'Nichts wird geschrieben — der Dump bleibt liegen',
  'inbox.proposal.todos': 'Erkannte Todos',
  'inbox.proposal.waiting': 'Warte auf',
  'inbox.proposal.dueOf': 'Frist für „{text}"',
  'inbox.proposal.due': 'Frist',
  'inbox.proposal.dueToday': 'heute',
  'inbox.proposal.dueTomorrow': 'morgen',
  'inbox.proposal.duePick': 'Datum …',
  'inbox.proposal.dueNone': 'ohne Frist',
  'inbox.proposal.todoInto': 'nach {target}',
  'inbox.proposal.pending': 'Vorschlag wird erstellt',

  'inbox.action.file': 'Ablegen',
  'inbox.action.fileHint': 'legt ab',
  'inbox.action.other': 'Anderes Ziel',
  /* Was der Knopf tut, wenn das Ziel „Bleibt in der Inbox" ist: nichts
     schreiben, den Dump als bewusst behalten markieren. */
  'inbox.action.leave': 'Liegen lassen',
  'inbox.action.leaveHint': 'lässt liegen',
  'inbox.action.discard': 'Verwerfen',
  'inbox.discard.title': 'Dump verwerfen?',
  'inbox.discard.body':
    'Der Dump wandert in den Papierkorb. Rückgängig bleibt zehn Sekunden möglich.',

  'inbox.undo.filed': 'Abgelegt in',
  'inbox.undo.kept': 'Bleibt liegen — als bewusst behalten markiert.',
  'inbox.undo.discarded': 'Verworfen.',
  'inbox.undo.more': 'und {count} weitere',
  'inbox.undo.action': 'Rückgängig',

  'inbox.target.project': 'Projekt',
  'inbox.target.new-project': 'Neues Projekt',
  'inbox.target.area': 'Bereich',
  'inbox.target.module': 'Modul',
  'inbox.target.journal': 'Tageseintrag',
  'inbox.target.inbox': 'Bleibt in der Inbox',
  'inbox.target.section': '→ Abschnitt {section}',
  'inbox.picker.title': 'Anderes Ziel',
  'inbox.picker.body': 'Gewählt wird aus den Zielen, die es im Vault gibt.',
  'inbox.picker.search': 'Projekt, Modul oder Bereich suchen',
  'inbox.picker.empty': 'Kein Ziel passt dazu.',

  'inbox.status.raw': 'Unberührt',
  'inbox.status.proposed': 'Vorschlag liegt vor',
  'inbox.status.filed': 'Abgelegt',
  'inbox.status.kept': 'Bleibt liegen',
  'inbox.origin.window': 'Hauptfenster',
  'inbox.origin.quick-capture': 'Schnell erfassen',
  'inbox.origin.chat': 'Gespräch',
  'inbox.origin.clipboard': 'Zwischenablage',
  'inbox.origin.drop': 'Hineingezogen',
  'inbox.origin.cli': 'Kommandozeile',

  'screen.ask.overline': 'Nachschlagen',
  'screen.ask.title': 'Fragen',
  'screen.ask.empty.title': 'Frag dein zweites Hirn',
  'screen.ask.empty.body':
    'Antworten kommen ausschließlich aus deinen eigenen Notizen, mit Zitat und Dateipfad. Gibt es keinen Beleg, sagt die App das.',
  'screen.ask.empty.action': 'Quelle aufnehmen',
  'ask.field.label': 'Deine Frage',
  'ask.field.placeholder': 'Was weiß ich über …?',
  'ask.field.hintSend': 'fragt',
  'ask.field.hintBreak': 'macht einen Umbruch',
  'ask.field.hintEscape': 'verlässt das Feld',
  'ask.action.send': 'Frage stellen',
  'ask.action.cancel': 'Abbrechen',
  'ask.action.new': 'Neue Frage',
  'ask.filter.scope': 'Bereich',
  'ask.filter.module': 'Modul',
  'ask.filter.all': 'alles',

  'ask.turn.question': 'Frage',
  'ask.turn.answer': 'Antwort',
  'ask.thinking': 'Liest die Fundstellen',
  'ask.cancelled': 'Abgebrochen — die Antwort ist unvollständig und wurde nicht gespeichert.',
  'ask.noEvidence': 'Dazu steht nichts im Vault.',
  'ask.noEvidenceHint':
    'Andere Wörter probieren — oder die Quelle erst aufnehmen. Geraten wird hier nichts.',
  'ask.noModel':
    'Ich kann daraus keine Antwort formulieren — hier sind die Stellen, die zur Frage passen.',
  'ask.unsupported':
    'Teile dieser Antwort ließen sich nicht belegen. Nur was unten steht, ist geprüft.',

  'ask.citations.title': 'Belege',
  'ask.citation.mark': 'Beleg {index} anzeigen',
  'ask.citation.show': 'Beleg {index} im Kontext ansehen',
  'ask.citation.openPath': 'Datei öffnen: {path}',
  'ask.citation.of': 'Beleg {index} — {path}',
  'ask.citation.context': 'Die Stelle im Kontext',
  'ask.citation.openFile': 'Datei öffnen',
  'ask.citation.moved':
    'Diese Stelle steht so nicht mehr in der Datei — sie wurde inzwischen geändert.',

  'ask.examples.title': 'Fang hiermit an',
  'ask.example.module': 'Was weiß ich über {title}?',
  'ask.example.project': 'Woran habe ich bei „{title}" zuletzt gearbeitet?',
  'ask.example.waiting': 'Worauf warte ich bei {who}?',

  'ask.threads.title': 'Gespräche',
  'ask.threads.search': 'Im Verlauf suchen',
  'ask.threads.empty': 'Noch kein Gespräch. Die erste Frage legt eines an.',
  'ask.threads.noMatch': 'Kein Gespräch passt dazu.',
  'ask.threads.open': 'Gespräch „{title}" öffnen',
  'ask.threads.delete': 'Gespräch „{title}" löschen',
  'ask.threads.deleteTitle': 'Gespräch löschen?',
  'ask.threads.deleteBody':
    'Der Verlauf wandert in den Papierkorb des Vaults. Abgelegte Wiki-Seiten bleiben.',
  'ask.threads.deleteConfirm': 'Löschen',

  'ask.fileBack.action': 'Als Wiki-Seite ablegen',
  'ask.fileBack.title': 'Antwort als Wiki-Seite ablegen',
  'ask.fileBack.body':
    'So füttert eine gute Frage das Wissen: die Antwort wird eine Konzept-Seite mit ihren Belegen.',
  'ask.fileBack.module': 'Modul',
  'ask.fileBack.newModule': 'Neues Modul anlegen',
  'ask.fileBack.newModuleName': 'Name des neuen Moduls',
  'ask.fileBack.newModulePlaceholder': 'Identity management',
  'ask.fileBack.pageTitle': 'Titel der Seite',
  'ask.fileBack.preview':
    'Geschrieben wird eine neue Konzept-Seite im Modul „{module}", dazu ein Eintrag im Katalog und in der Chronik. {count} Belege kommen mit.',
  'ask.fileBack.confirm': 'Ablegen',
  'ask.fileBack.done': 'Abgelegt in',

  'screen.projects.overline': 'Arbeit und Privat',
  'screen.projects.title': 'Projekte',
  'screen.projects.empty.title': 'Noch kein Projekt im Vault',
  'screen.projects.empty.body':
    'Ein Projekt hält Stand, nächsten Schritt, Todos und Warte-auf an einer Stelle — der Wiedereinstieg nach einer Pause.',
  'screen.projects.empty.action': 'Projekt anlegen',
  'projects.count': '{count} Projekte',
  'projects.countOne': 'ein Projekt',
  'projects.nextStep': 'Nächster Schritt',
  'projects.noNextStep': 'Kein nächster Schritt festgelegt.',
  'projects.todos': '{open} von {total} offen',
  'projects.noTodos': 'ohne Todos',
  'projects.stale': 'Stagniert',
  'projects.deadline': 'Frist {date}',
  'projects.waiting': 'Warte auf {who}',

  'screen.journal.overline': 'Tag und Gespräch',
  'screen.journal.title': 'Tagebuch',
  'screen.journal.empty.title': 'Noch kein Tageseintrag im Vault',
  'screen.journal.empty.body':
    'Ein Tag ist eine Datei. Dazu ein Gespräch, wenn du reden willst, und ein Tagesabschluss, der Fakten und Todos vorschlägt.',
  'screen.journal.empty.action': 'Tag beginnen',
  /* Die Texte des Screens selbst liegen in `de-journal.ts`. */

  'screen.modules.overline': 'Wissen',
  'screen.modules.title': 'Module',
  'screen.modules.empty.title': 'Noch kein Wissens-Modul im Vault',
  'screen.modules.empty.body':
    'Ein Modul ist ein kleines Wiki: Quellen, Begriffe und Zusammenhänge zu einem Thema, jede Aussage mit Beleg.',
  'screen.modules.empty.action': 'Modul anlegen',
  'screen.sources.overline': 'Aufnehmen',
  'screen.sources.title': 'Quellen',
  'screen.sources.empty.title': 'Noch keine Rohquelle im Vault',
  'screen.sources.empty.body':
    'Videos, Dateien und Webseiten landen unveränderlich in raw/ und werden von dort zu Wiki-Seiten verdichtet.',
  'screen.sources.empty.action': 'Quelle aufnehmen',
  'screen.garden.overline': 'Gegen das Verrotten',
  'screen.garden.title': 'Pflege',
  'screen.garden.empty.title': 'Noch kein Pflegelauf',
  'screen.garden.empty.body':
    'Der Pflegelauf findet verwaiste Seiten, kaputte Links, unverdichtete Quellen und Projekte ohne nächsten Schritt.',
  'screen.garden.empty.action': 'Pflegelauf starten',

  /* Nicht „Verhalten": das ist einer der Tabs — als Überzeile gelesen sähe der
     Screen aus, als wäre dieser Tab offen. */
  'screen.settings.overline': 'Einrichten',
  'screen.settings.title': 'Einstellungen',
  'screen.settings.empty.title': 'Einstellungen folgen',
  'screen.settings.empty.body':
    'Sprachen, Provider und Modelle, Aufgaben-Routing, Vault und Verhalten werden hier eingerichtet.',
  'screen.settings.empty.action': 'Vault wählen',
  'screen.settings.pending.title': 'Die Einstellungen kommen als nächstes',
  'screen.settings.pending.body':
    'Geplant sind: Oberflächen- und Dokumentsprache, Provider und Modelle, das Aufgaben-Routing und der Vault-Wechsel.',
  'settings.vault': 'Vault',
  'settings.vaultOpen': 'Anderen Vault öffnen',

  'onboarding.overline': 'Erster Schritt',
  'onboarding.title': 'Willkommen',
  'onboarding.what.title': 'Was ist ein Vault?',
  'onboarding.what.body':
    'Ein Vault ist ein gewöhnlicher Ordner mit Markdown-Dateien. Er gehört dir: du kannst ihn in Obsidian oder VS Code öffnen, mit Git versionieren und auf einen USB-Stick kopieren. Diese App legt darin ab, ordnet ein und macht wiederfindbar — die Dateien bleiben die Wahrheit.',
  'onboarding.open': 'Vault öffnen',
  'onboarding.openHint': 'Wähle den Ordner, in dem dein Vault schon liegt.',
  'onboarding.createSection': 'Noch kein Vault?',
  'onboarding.createStart': 'Neuen Vault anlegen',
  'onboarding.create': 'Ordner wählen und anlegen',
  'onboarding.createCancel': 'Abbrechen',
  'onboarding.nameLabel': 'Name des neuen Vaults',
  'onboarding.namePlaceholder': 'Zweites Hirn',
  'onboarding.nameHint':
    'Der Name steht später in der Titelzeile. Den Ordner wählst du im nächsten Schritt — er sollte leer sein, die Struktur legt die App an.',
  'onboarding.recent': 'Zuletzt geöffnet',
  'onboarding.missing': 'nicht gefunden',

  'quickCapture.title': 'Schnell erfassen',
  'quickCapture.placeholder': 'Was ist dir durch den Kopf gegangen?',
  'quickCapture.hint': 'speichert, Esc schließt',
  'quickCapture.savedTo': 'Gespeichert in',
  'quickCapture.undo': 'Rückgängig',
  'quickCapture.ask': 'Entwurf verwerfen?',
  'quickCapture.keep': 'Weiter schreiben',
  'quickCapture.drop': 'Verwerfen',
  'quickCapture.noVault': 'Kein Vault offen — der Text bleibt hier als Entwurf.',
  'quickCapture.toMain': 'Hauptfenster zeigen',
} as const;
