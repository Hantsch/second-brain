/* Deutsche Texte des Tagebuchs: Tagesliste, Tageseintrag, Coaching-Gespräch,
   Tagesabschluss.

   Zwei Dinge, die hier Text sind und nicht Code:

   - **Die Haltungen erklären sich selbst.** Jede trägt einen Satz in der Ich-Form
     des Coachs („ich spiegle und frage nach, ohne Ratschläge") — man muss wissen,
     mit wem man spricht, bevor man tippt.
   - **Der Ausfall ist eine Feststellung, keine Entschuldigung.** Jeder Grund aus
     `LlmUnavailable.reason` hat einen eigenen Satz, und jeder beginnt mit dem, was
     trotzdem passiert ist: aufgeschrieben. */

export const deJournal = {
  // ── Tagesliste ────────────────────────────────────────────────────────────
  'journal.list.title': 'Tage',
  'journal.list.count': '{count} Tage mit Eintrag',
  'journal.today': 'Heute',
  'journal.today.none': 'Noch kein Eintrag',
  'journal.words': '{count} Wörter',
  'journal.gap': '{count} Tage ohne Eintrag',
  'journal.gapOne': 'Ein Tag ohne Eintrag',
  'journal.hasDialogue': 'Mit Gespräch',
  'journal.open': 'Eintrag vom {date} öffnen',
  'journal.keys': 'Pfeiltasten wechseln den Tag',

  // ── Kopf des Tages ────────────────────────────────────────────────────────
  'journal.mood.label': 'Stimmung',
  'journal.mood.1': 'Schwer',
  'journal.mood.2': 'Gedrückt',
  'journal.mood.3': 'Geht so',
  'journal.mood.4': 'Gut',
  'journal.mood.5': 'Sehr gut',
  'journal.energy.label': 'Energie',
  'journal.energy.1': 'Leer',
  'journal.energy.2': 'Wenig',
  'journal.energy.3': 'Mittel',
  'journal.energy.4': 'Viel',
  'journal.energy.5': 'Voll',
  'journal.level.none': 'nicht eingetragen',
  'journal.level.set': '{label} eintragen',
  'journal.level.saved': 'Gespeichert',
  'journal.people': 'Personen',
  'journal.projects': 'Projekte',
  'journal.project.open': 'Projekt {title} öffnen',
  'journal.file.open': 'Datei im Editor öffnen',
  /* Nur im engen Fenster sichtbar (`DayEntry.tsx`) — zwei Reiter statt zwei
     Spalten, weil beides zusammen in eine Rollspalte nicht passt. */
  'journal.tab.day': 'Tag',
  'journal.tab.talk': 'Gespräch',

  // ── Abschnitt „Tag" ───────────────────────────────────────────────────────
  'journal.day.title': 'Tag',
  'journal.day.ask': 'Wie war der Tag?',
  'journal.day.askHint': 'Ein Absatz genügt. Ctrl+Enter speichert.',
  'journal.day.placeholder': 'Was ist passiert?',
  'journal.day.write': 'Tagestext schreiben',
  'journal.day.edit': 'Tagestext bearbeiten',
  'journal.day.editLabel': 'Tagestext',
  'journal.day.save': 'Speichern',
  'journal.day.hint': 'Ctrl+Enter speichert, Esc verwirft',
  'journal.day.saved': 'Gespeichert.',
  'journal.day.unsaved': 'Nicht gespeichert.',
  'journal.day.external.title': 'Dieser Abschnitt hat sich außerhalb geändert',
  'journal.day.external.body':
    'Der Tagestext in der Datei ist nicht mehr der, mit dem du angefangen hast. Dein Text steht noch hier — du entscheidest, welcher bleibt.',
  'journal.day.external.take': 'Fremden Stand holen',
  'journal.day.external.keep': 'Meinen Text behalten',
  'journal.day.conflict.title': 'Die Datei wurde zwischenzeitlich geändert',
  'journal.day.conflict.body':
    'Nichts wurde überschrieben. Du kannst den aktuellen Stand holen oder deinen Text ausdrücklich darüber schreiben.',
  'journal.day.conflict.reload': 'Stand holen',
  'journal.day.conflict.overwrite': 'Trotzdem speichern',

  // ── Gespräch ──────────────────────────────────────────────────────────────
  'journal.dialogue.title': 'Gespräch',
  'journal.dialogue.empty': 'Was du hier schreibst, steht wörtlich im Tageseintrag — und nur dort.',
  'journal.turn.user': 'Ich',
  'journal.turn.assistant': 'Second Brain',
  'journal.thinking': 'Denkt nach',
  'journal.field.label': 'Was beschäftigt dich?',
  'journal.field.placeholder': 'Schreib es hin, wie es dir kommt.',
  'journal.field.hintSend': 'sagt es',
  'journal.send': 'Sagen',
  'journal.mode.label': 'Haltung',
  'journal.mode.listen': 'Zuhören',
  'journal.mode.tips': 'Tipps',
  'journal.mode.analyze': 'Analysieren',
  'journal.mode.listen.hint': 'Zuhören: ich spiegle und frage nach, ohne Ratschläge.',
  'journal.mode.tips.hint': 'Tipps: ich höre erst zu, dann höchstens drei kleine Schritte.',
  'journal.mode.analyze.hint':
    'Analysieren: ich vergleiche mit früheren Tagen und zeige Muster, mit Datum.',
  'journal.mode.keys': 'Ctrl+1 bis Ctrl+3 wechseln die Haltung',
  'journal.mode.set': 'Haltung {label} wählen',

  // ── Vertraulichkeit ───────────────────────────────────────────────────────
  'journal.privacy.remote':
    'Dieses Gespräch geht an {provider} — ein lokales Modell bleibt auf diesem Rechner.',
  'journal.privacy.local': 'Läuft lokal auf diesem Rechner.',
  'journal.privacy.none':
    'Für das Gespräch ist kein Modell zugeordnet — schreiben lässt sich der Eintrag trotzdem.',
  'journal.privacy.action': 'Modell ändern',

  // ── Ohne Antwort ──────────────────────────────────────────────────────────
  'journal.failure.no-route': 'Aufgeschrieben. Für eine Antwort ist kein Modell zugeordnet.',
  'journal.failure.provider-disabled': 'Aufgeschrieben. Der zugeordnete Provider ist abgeschaltet.',
  'journal.failure.no-key': 'Aufgeschrieben. Für das zugeordnete Modell fehlt der Schlüssel.',
  'journal.failure.unreachable': 'Aufgeschrieben. Das Modell war nicht erreichbar.',
  'journal.failure.error': 'Aufgeschrieben. Das Modell hat nichts zurückgegeben.',
  'journal.failure.cancelled': 'Aufgeschrieben. Die Antwort hast du abgebrochen.',
  'journal.failure.other': 'Aufgeschrieben. Eine Antwort kam nicht.',
  'journal.evidence.title': 'Ähnlich klang es an diesen Tagen',
  'journal.evidence.open': 'Zum Eintrag vom {date}',

  // ── Fakten und Tagesabschluss ─────────────────────────────────────────────
  'journal.facts.title': 'Fakten',
  'journal.facts.empty': 'Hier steht, was der Tagesabschluss gefunden und du bestätigt hast.',
  'journal.close.action': 'Tag abschließen',
  'journal.close.title': 'Tagesabschluss',
  'journal.close.body':
    'Gefunden im Tagestext. Geschrieben ist nichts — du entscheidest, was übernommen wird.',
  'journal.close.empty': 'Im Tagestext steht noch nichts, was sich herausziehen ließe.',
  'journal.close.heuristic': 'Ohne Modell gefunden — Regeln statt Verstehen.',
  'journal.close.nothing': 'Im Tagestext war nichts zu holen. Der Eintrag bleibt, wie er ist.',
  'journal.close.todos': 'Erkannte Todos',
  'journal.close.waiting': 'Warte-auf',
  'journal.close.waitingInto': 'als Todo mit @wait im Tageseintrag',
  'journal.close.into': 'in {target}',
  'journal.close.target.day': 'Tageseintrag, Abschnitt Fakten',
  'journal.close.target.project': 'Projekt {title}',
  'journal.close.fields': 'Für das Frontmatter des Tages',
  'journal.close.people': 'Personen',
  'journal.close.projects': 'Projekte',
  'journal.close.tags': 'Tags',
  'journal.close.mood': 'Stimmung {label}',
  'journal.close.energy': 'Energie {label}',
  'journal.close.apply': 'Übernehmen',
  'journal.close.dueOf': 'Frist für „{text}"',
  'journal.close.done': 'Übernommen in',
  'journal.close.doneMore': 'und {count} weitere',
  'journal.close.doneNothing': 'Nichts ausgewählt — nichts geschrieben.',
} as const;
