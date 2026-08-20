/* German texts for the journal: day list, day entry, coaching dialogue,
   day close-out.

   Two things here are text, not code:

   - **The stances explain themselves.** Each carries a sentence naming what it
     does before you press send ("Listen: filed as is, no answer" / "Tips: I
     listen first, then at most three small steps") — you need to know what
     happens next before you type, not after.
   - **The failure is a statement, not an apology.** Every reason from
     `LlmUnavailable.reason` has its own sentence, and each begins with what
     happened anyway: it was written down. */

export const deJournal = {
  // ── Tagesliste ────────────────────────────────────────────────────────────
  'journal.list.title': 'Tage',
  'journal.list.count': '{count} Tage mit Eintrag',
  'journal.today': 'Heute',
  'journal.today.none': 'Noch kein Eintrag',
  'journal.words': '{count} Wörter',
  'journal.gap': '{count} Tage ohne Eintrag',
  'journal.gapOne': 'Ein Tag ohne Eintrag',
  'journal.hasDialogue': 'Mit Antwort der App',
  'journal.list.closed': 'Abgeschlossen',
  'journal.list.unfinished': 'Tag noch nicht abgeschlossen',
  'journal.open': 'Eintrag vom {date} öffnen',
  'journal.keys': 'Pfeiltasten wechseln den Tag',
  /* Der Filter (009, D5): heute bleibt immer sichtbar, gilt aber selbst nie
     als offen — deshalb zählt die Zeile darüber nur die vergangenen Tage. */
  'journal.filter.openOnly': 'Nur offene Tage',
  'journal.filter.count': '{count} Tage offen',
  'journal.filter.countOne': 'Ein Tag offen',
  'journal.filter.none': 'Nichts offen. Jeder vergangene Tag ist abgeschlossen.',

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
  /* Der manuelle Schalter (009, D3/D6) — unabhängig vom Tagesabschluss weiter
     unten (`journal.close.*`), der Fakten und Todos herauszieht: hier geht es
     nur um das eine Feld „offen/abgeschlossen", das auch den Listenfilter
     speist (009, D5). */
  'journal.finish.markFinished': 'Als abgeschlossen markieren',
  'journal.finish.reopen': 'Wieder öffnen',
  'journal.finish.badge': 'Abgeschlossen am {date}',

  // ── Abschnitt „Tag" ───────────────────────────────────────────────────────
  'journal.day.title': 'Tag',
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

  // ── Conversation ───────────────────────────────────────────────────────────
  /* Heißt bewusst nicht mehr „Gespräch" (011, D10): der Stream zeigt meist
     nur meinen eigenen Text ohne jede Antwort — „Zuhören" fragt nie ein
     Modell — und eine Überschrift, die Dialog verspricht, wäre dann falsch. */
  'journal.dialogue.title': 'Verlauf',
  'journal.dialogue.empty': 'Was du hier schreibst, steht wörtlich im Tageseintrag — und nur dort.',
  'journal.turn.user': 'Ich',
  'journal.turn.assistant': 'Second Brain',
  'journal.thinking': 'Denkt nach',
  'journal.field.label': 'Was beschäftigt dich?',
  'journal.field.placeholder': 'Schreib es hin, wie es dir kommt.',
  'journal.field.hintSend': 'sagt es',
  'journal.send': 'Sagen',
  /* Nur für Tipps/Analysieren (011, D8): die Haltung entscheidet, ob überhaupt
     ein Modell gefragt wird, und der Knopf sagt es geradeheraus. */
  'journal.sendAsk': 'Speichern und fragen',
  'journal.mode.label': 'Haltung',
  'journal.mode.listen': 'Zuhören',
  'journal.mode.tips': 'Tipps',
  'journal.mode.analyze': 'Analysieren',
  'journal.mode.listen.hint': 'Zuhören: wird abgelegt, ohne Antwort und ohne Rückfrage.',
  'journal.mode.tips.hint': 'Tipps: ich höre erst zu, dann höchstens drei kleine Schritte.',
  'journal.mode.analyze.hint':
    'Analysieren: ich helfe verstehen und stütze dich, anhand echter früherer Einträge.',
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

  // ── Altes Gespräch (Legacy, 011/D9) ───────────────────────────────────────
  'journal.legacy.title': 'Altes Gespräch',
  'journal.legacy.fold.action': 'In den Eintrag übernehmen',
  'journal.legacy.fold.title': 'Gespräch in den Eintrag übernehmen',
  'journal.legacy.fold.body':
    'Was sich als Gesprächsrunde lesen lässt, wandert der Reihe nach in den Tagestext — deine Worte als Absatz, die Antworten der App als Zitat. Zeilen im alten Abschnitt, die sich keiner Runde zuordnen lassen, gehen dabei verloren. Das Kapitel „Gespräch" verschwindet danach aus der Datei, und es gibt keinen Weg zurück.',
  'journal.legacy.fold.confirm': 'Übernehmen',

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

  // ── Interview (012) ───────────────────────────────────────────────────────
  /* Der Einstieg direkt am Tag (D6) — ein Schlüssel für den Knopf, unabhängig
     davon, ob der Tag leer ist oder schon Text hat; nur die Variante
     (primary/secondary) des Knopfs ändert sich damit. */
  'journal.interview.start': 'Interview starten',
  'journal.interview.title': 'Interview',
  'journal.interview.description':
    'Eine Frage nach der anderen — antworten, überspringen oder selbst weiterschreiben.',
  'journal.interview.field.label': 'Deine Antwort',
  'journal.interview.field.placeholder': 'Schreib deine Antwort hierhin.',
  'journal.interview.answer': 'Antworten und weiter',
  'journal.interview.skip': 'Überspringen',
  'journal.interview.leave': 'Verlassen und selbst schreiben',
  'journal.interview.progress': '{current} / {total}',
  'journal.interview.engine.fixed': 'Fester Fragenkatalog — kein Modell nötig.',
  'journal.interview.engine.model.local': 'Rückfragen laufen lokal auf diesem Rechner.',
  'journal.interview.engine.model.remote':
    'Rückfragen gehen an {provider} — ein lokales Modell bleibt auf diesem Rechner.',
  'journal.interview.done.body':
    'Das Interview ist für heute durch — Übersprungenes bleibt offen. Stimmung und Energie warten noch auf die Regler oben im Tag.',
} as const;
