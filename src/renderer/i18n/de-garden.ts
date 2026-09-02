/* German UI texts for maintenance: health with reasoning, advice, findings
   with filters, the contradiction card, and the run with progress.

   Two rules are baked into the wording:
   - **Never claim something that isn't true.** "Not checked yet" instead of
     a made-up 100, "only opens" for every action that writes nothing,
     "derived from count and severity" for advice given without a model.
   - **A finding says why it is one.** Title and explanation come from the
     core (finished sentences in the IPC contract); what sits around them
     here are the labels — kinds, counts, buttons.

   Flat keys, sentence case, no emoji. `en-garden.ts` carries the same key
   set — a test checks that. */

export const deGarden = {
  // ── Lauf ──────────────────────────────────────────────────────────────────
  'garden.run.action': 'Jetzt prüfen',
  'garden.run.again': 'Neu prüfen',
  'garden.run.cancel': 'Prüfung abbrechen',
  'garden.run.running': 'Prüfung läuft',
  'garden.run.check': 'Prüfung: {check}',
  'garden.run.audit': 'Das Modell deutet die Befunde',
  'garden.run.looseEnds': 'Das Modell prüft lose Enden',
  'garden.run.step': '{done} von {total}',
  'garden.run.remaining': 'Noch aus: {list}',
  'garden.run.stage.checks': 'Prüfungen',
  'garden.run.stage.audit': 'Widersprüche',
  'garden.run.stage.loose-ends': 'lose Enden',
  'garden.run.elapsed': 'Laufzeit {elapsed}',
  /* 021a D6: steht nur, wenn der Stufenplan dieses Laufs gar keine
     Modell-Stufe enthält — nicht, wenn sie nur noch nicht dran war. Absichtlich
     ohne Ursache: der Renderer kann „kein Modell konfiguriert“ nicht von
     „für diesen Lauf abgeschaltet“ unterscheiden. */
  'garden.run.noModelStage':
    'Keine Modell-Stufe — Widersprüche und lose Enden werden nicht geprüft.',
  'garden.run.disabledWhileRunning': 'Ein Pflegelauf läuft schon.',
  /* 021b, D4: der Knopf neben „jetzt prüfen“ — nur da, wenn der letzte Lauf
     vorzeitig stoppte und noch Stufen offen sind. */
  'garden.run.continue': 'Prüfung fortsetzen',
  /* 021c, D3: „nur dies prüfen“ neben dem Filter — genau dann da, wenn Art
     oder Modul die Ansicht einschränken, und benennt, was geprüft würde. */
  'garden.run.checkOnlyKind': 'Nur {kind} prüfen',
  'garden.run.checkOnlyModule': 'Nur Modul {module} prüfen',
  'garden.run.checkOnlyBoth': 'Nur {kind} in Modul {module} prüfen',

  // ── Umfang des letzten Laufs (021c, D4) ──────────────────────────────────────
  /* Benennt, was ein Teil-Lauf geprüft hat — neben 021b's eingefrorenem Stand,
     nicht statt dessen. Ein Teil-Lauf ist nie `complete`, darf sich aber nicht
     wie „vorzeitig gestoppt“ lesen: hier wurde nichts abgebrochen, der Lauf
     wollte nie mehr abdecken. */
  'garden.scope.kind': 'Letzte Prüfung: nur {kind}',
  'garden.scope.module': 'Letzte Prüfung: nur Modul {module}',
  'garden.scope.both': 'Letzte Prüfung: nur {kind} in Modul {module}',
  /* Der Weg zurück zu einem vollständigen Lauf, neben dem Umfangs-Hinweis. */
  'garden.scope.checkEverything': 'Alles prüfen',

  // ── Vorzeitig gestoppt ────────────────────────────────────────────────────
  /* 021b, D4: der letzte Lauf hat nicht jede geplante Stufe erreicht — der
     Bericht ist ehrlich unvollständig, statt das stillschweigend zu
     verschweigen. */
  'garden.stopped.title': 'Vorzeitig gestoppt.',
  'garden.stopped.missing': 'Fehlende Stufen: {list}.',
  /* 042, D4: Knopf auf dem Laufstreifen, um das Angebot ohne Fortsetzung
     wegzulegen — danach ist der Streifen wieder leer, bis der nächste Lauf
     startet. */
  'garden.stopped.dismiss': 'Verwerfen',

  // ── Gesundheit ────────────────────────────────────────────────────────────
  'garden.health.label': 'Gesundheit',
  'garden.health.aria': 'Gesundheit {score} von 100',
  'garden.health.unknown': 'Noch nicht geprüft',
  'garden.health.unknownBody':
    'Es liegt noch keine Prüfung vor. Ohne Prüfung gibt es keinen Wert — eine 100 wäre erfunden.',
  'garden.health.noStock':
    'Kein Bestand, auf den sich ein Wert beziehen könnte: keine Seiten, keine Projekte, keine Quellen, keine Dumps.',
  'garden.health.why': 'Woher der Wert kommt',
  'garden.health.perfect': 'Nichts drückt den Wert: Die Prüfung hat keine Befunde ergeben.',
  'garden.health.lost': '{count} von 100 Punkten gehen auf diese Befunde zurück.',
  'garden.health.pointOne': '1 Punkt',
  'garden.health.points': '{count} Punkte',
  'garden.health.ranAt': 'Zuletzt geprüft',
  /* 021b, D4: steht statt der lebenden Zeitangabe, wenn der Wert vom letzten
     vollständigen Lauf einfriert — dieser Lauf hat ihn nicht neu berechnet. */
  'garden.health.asOf': 'Stand {when}, letzte vollständige Prüfung',
  /* Und wenn der Stopp nichts einzufrieren hatte — die erste Prüfung dieses
     Vaults war die gestoppte. Es gibt keine vollständige Prüfung, auf die sich
     ein Wert beziehen könnte, also bleibt er unbekannt. */
  'garden.health.noComplete': 'Noch keine vollständige Prüfung',
  'garden.health.noCompleteBody':
    'Die Prüfung wurde vorzeitig gestoppt, und eine frühere vollständige gibt es nicht. Ein Wert über eine halbe Prüfung wäre nicht die Gesundheit dieses Vaults.',
  'garden.health.withModel': 'mit Modell gedeutet',
  'garden.health.withoutModel': 'ohne Modell, nur die maschinellen Prüfungen',
  'garden.health.hiddenOne':
    '1 Befund bleibt bei diesem Wert ausgeklammert: {dismissed} als kein Problem markiert, {snoozed} nicht jetzt.',
  'garden.health.hidden':
    '{total} Befunde bleiben bei diesem Wert ausgeklammert: {dismissed} als kein Problem markiert, {snoozed} nicht jetzt.',
  'garden.health.showHidden': 'Ausgeklammerte Befunde zeigen',

  // ── Rat ───────────────────────────────────────────────────────────────────
  'garden.advice.label': 'Was als nächstes',
  'garden.advice.fromModel': 'Vom Modell gedeutet.',
  'garden.advice.heuristic': 'Ohne Modell aus Zahl und Schwere der Befunde abgeleitet.',
  'garden.advice.orphan':
    'Auf verwaiste Seiten einen Verweis setzen — über Links findet sie sonst niemand.',
  'garden.advice.broken-link': 'Kaputte Wikilinks in den genannten Zeilen richtigstellen.',
  'garden.advice.index-drift': 'Fehlende Katalogzeilen nachtragen, eine je Seite.',
  'garden.advice.stale-page': 'Angestaubte Seiten lesen und als geprüft markieren.',
  'garden.advice.unfiled-dump': 'Liegengebliebene Dumps einordnen.',
  'garden.advice.unprocessed-source': 'Unverdichtete Quellen zu Source-Seiten verdichten.',
  'garden.advice.project-without-next-step':
    'Für Projekte ohne nächsten Schritt je einen Satz festlegen.',
  'garden.advice.contradiction': 'Widersprüche benennen — beide Fassungen bleiben stehen.',
  'garden.advice.near-duplicate':
    'Beinahe-Dubletten vergleichen und zusammenlegen, wo es dasselbe ist.',
  'garden.advice.missing-page': 'Für häufig genannte Begriffe eigene Seiten anlegen.',
  'garden.advice.loose-end':
    'Angekündigte Sätze aufgreifen — beantworten oder als erledigt weglegen.',
  'garden.advice.condensation-due': 'Areas mit fälliger Verdichtung öffnen und neu verdichten.',

  // ── Befunde ───────────────────────────────────────────────────────────────
  'garden.findings.label': 'Befunde',
  'garden.findings.totalOne': '1 Befund',
  'garden.findings.total': '{count} Befunde',
  'garden.findings.shown': '{shown} von {total} angezeigt',
  'garden.findings.none': 'Keine Befunde.',
  'garden.findings.noneBody':
    'Geprüft wurden Wiki-Seiten und Kataloge, Rohquellen, Dumps in der Inbox und Projekte ohne nächsten Schritt.',
  'garden.findings.filtered': 'Kein Befund passt zu diesem Filter.',
  'garden.checkedAt': 'Zuletzt geprüft: {when}',
  'garden.findings.hiddenOne': '1 weggelegt',
  'garden.findings.hidden': '{count} weggelegt',

  // ── Filter ────────────────────────────────────────────────────────────────
  'garden.filter.label': 'Befunde filtern',
  'garden.filter.kind': 'Art',
  'garden.filter.module': 'Modul',
  'garden.filter.severity': 'Schwere',
  'garden.filter.state': 'Zustand',
  'garden.filter.stateOpen': 'Offen',
  'garden.filter.stateDismissed': 'Kein Problem',
  'garden.filter.stateSnoozed': 'Nicht jetzt',
  'garden.filter.all': 'Alle',
  'garden.filter.noModule': 'Ohne Modul',
  'garden.filter.reset': 'Filter zurücksetzen',
  'garden.severity.high': 'Hoch',
  'garden.severity.warn': 'Mittel',
  'garden.severity.info': 'Gering',

  // ── Arten ─────────────────────────────────────────────────────────────────
  'garden.kind.orphan': 'Verwaiste Seiten',
  'garden.kind.broken-link': 'Kaputte Wikilinks',
  'garden.kind.index-drift': 'Katalog-Drift',
  'garden.kind.stale-page': 'Angestaubte Seiten',
  'garden.kind.contradiction': 'Widersprüche',
  'garden.kind.missing-page': 'Begriffe ohne Seite',
  'garden.kind.near-duplicate': 'Beinahe-Dubletten',
  'garden.kind.unfiled-dump': 'Liegengebliebene Dumps',
  'garden.kind.unprocessed-source': 'Unverdichtete Quellen',
  'garden.kind.project-without-next-step': 'Projekte ohne nächsten Schritt',
  'garden.kind.loose-end': 'Lose Enden',
  'garden.kind.condensation-due': 'Fällige Verdichtungen',

  'garden.countOne.orphan': '1 verwaiste Seite',
  'garden.countMany.orphan': '{count} verwaiste Seiten',
  'garden.countOne.broken-link': '1 kaputter Wikilink',
  'garden.countMany.broken-link': '{count} kaputte Wikilinks',
  'garden.countOne.index-drift': '1 Katalogeintrag',
  'garden.countMany.index-drift': '{count} Katalogeinträge',
  'garden.countOne.stale-page': '1 angestaubte Seite',
  'garden.countMany.stale-page': '{count} angestaubte Seiten',
  'garden.countOne.contradiction': '1 Widerspruch',
  'garden.countMany.contradiction': '{count} Widersprüche',
  'garden.countOne.missing-page': '1 Begriff ohne Seite',
  'garden.countMany.missing-page': '{count} Begriffe ohne Seite',
  'garden.countOne.near-duplicate': '1 Beinahe-Dublette',
  'garden.countMany.near-duplicate': '{count} Beinahe-Dubletten',
  'garden.countOne.unfiled-dump': '1 liegengebliebener Dump',
  'garden.countMany.unfiled-dump': '{count} liegengebliebene Dumps',
  'garden.countOne.unprocessed-source': '1 unverdichtete Quelle',
  'garden.countMany.unprocessed-source': '{count} unverdichtete Quellen',
  'garden.countOne.project-without-next-step': '1 Projekt ohne nächsten Schritt',
  'garden.countMany.project-without-next-step': '{count} Projekte ohne nächsten Schritt',
  'garden.countOne.loose-end': '1 loses Ende',
  'garden.countMany.loose-end': '{count} lose Enden',
  'garden.countOne.condensation-due': '1 fällige Verdichtung',
  'garden.countMany.condensation-due': '{count} fällige Verdichtungen',

  // ── Karte ─────────────────────────────────────────────────────────────────
  'garden.card.files': 'Betroffene Dateien',
  'garden.card.openFile': 'Datei öffnen',
  'garden.card.openThis': '„{path}“ öffnen',
  'garden.card.preview': 'Geschrieben wird in {file}:',
  'garden.card.previewNothing': 'Schreibt nichts. Öffnet nur, wo es weitergeht.',
  'garden.card.noFix':
    'Von selbst richten lässt sich hier nichts. Die Wege daraus stehen darunter.',
  'garden.card.dismiss': 'Ist kein Problem',
  'garden.card.dismissed': 'Kein Problem. Der Befund zählt nicht mehr gegen die Gesundheit.',
  'garden.card.handled': 'Habe ich in den Dateien erledigt',
  'garden.card.recheckGone': 'Neu geprüft: der Befund ist weg.',
  'garden.card.recheckStill':
    'Neu geprüft: der Befund steht noch. In den Dateien hat sich daran nichts geändert.',
  'garden.card.snooze': 'Nicht jetzt: „{title}“',
  'garden.card.snoozed': 'Nicht jetzt. Der Befund kommt am {date} wieder.',
  'garden.card.unsnoozed': 'Der Befund zählt wieder.',
  'garden.card.undismiss': 'Wieder anzeigen',
  'garden.card.written': 'Geschrieben: {file}',
  'garden.card.discarded': '„{file}“ liegt jetzt im Papierkorb.',
  'garden.card.undo': 'Rückgängig',
  'garden.card.undone': 'Zurückgedreht.',
  'garden.card.keptOne': '1 Datei blieb unberührt: sie wurde seither bearbeitet.',
  'garden.card.kept': '{count} Dateien blieben unberührt: sie wurden seither bearbeitet.',
  'garden.card.opened': 'Geöffnet: {path}',
  'garden.card.alsoOpen': 'Die zweite Datei: {path}',
  'garden.card.openSecond': 'Zweite Datei öffnen',

  // ── Weggelegt ─────────────────────────────────────────────────────────────
  'garden.hidden.dismissed': 'Ist kein Problem.',
  'garden.hidden.snoozed': 'Kommt am {date} wieder.',

  // ── Widerspruch ───────────────────────────────────────────────────────────
  'garden.contradiction.never': 'Nie automatisch aufgelöst: beide Fassungen bleiben stehen.',
  'garden.contradiction.section': 'Abschnitt „Widersprüche“ dieser Seite',
  'garden.contradiction.excerpt': 'Anfang der Seite — die Stelle ist in der Datei nicht benannt',
  'garden.contradiction.updated': 'Stand',
  'garden.contradiction.name': 'Beide behalten und benennen',
  'garden.contradiction.supersede': '„{newer}“ überholt „{older}“',
  'garden.contradiction.supersedeHint':
    'Trägt supersedes: [{slug}] in {file} ein. Beide Seiten bleiben stehen, die ältere ist damit als überholt markiert.',
  'garden.contradiction.sameDate':
    'Beide Seiten tragen dasselbe Datum. Welche die ältere ist, entscheidet ein Mensch — in der Datei.',
  'garden.contradiction.named':
    'Der Widerspruch ist auf der Seite benannt. Zu schreiben ist nichts.',
  'garden.contradiction.superseded': 'Eingetragen in {file}.',

  // ── Beinahe-Dublette ──────────────────────────────────────────────────────
  'garden.nearDuplicate.created': 'Angelegt',
  'garden.nearDuplicate.neverMerged':
    'Zusammengeführt wird nie automatisch: „Beide Seiten vergleichen“ öffnet nur beide Dateien.',
  'garden.nearDuplicate.directionLabel': 'Welche Seite ist die neuere?',
  'garden.nearDuplicate.noDefault':
    'Kein Vorschlag: Bei einer Seite fehlt das Erstelldatum, oder beide tragen dasselbe. Ein Mensch entscheidet hier.',
  'garden.nearDuplicate.optionNewer': '„{file}“ ist die neuere Seite',
  'garden.nearDuplicate.supersede': 'Überholt: {older} → {newer}',
  'garden.nearDuplicate.supersedeHint':
    'Trägt supersedes: [{slug}] in {file} ein. Beide Seiten bleiben stehen, die ältere ist damit als überholt markiert.',
  'garden.nearDuplicate.alreadyNamed':
    'Diese Beziehung ist schon eingetragen. Es gibt nichts zu schreiben.',
  'garden.nearDuplicate.pageMissing':
    'Eine der beiden Seiten lässt sich nicht lesen — vielleicht liegt sie schon im Papierkorb. Der nächste Lauf sagt, was von dem Paar bleibt.',

  // ── Verwaiste Seite: Ziel wählen ──────────────────────────────────────────
  'garden.orphan.targetLabel': 'Zielseite',
  'garden.orphan.empty': 'Keine andere Seite in diesem Modul, auf die verwiesen werden könnte.',
  'garden.orphan.fromOverview': 'Von der Übersicht des Moduls „{module}“ aus verlinken',
  'garden.orphan.pickToggle': 'Andere Seite wählen',
  'garden.orphan.searchLabel': 'Seite suchen',
  'garden.orphan.pickPlaceholder': 'Seite wählen',
  'garden.orphan.pickAria': 'Zielseite wählen',
  'garden.orphan.noMatch': 'Keine Seite passt zu „{query}“.',
  'garden.orphan.confirm': 'Verweis in „{file}“ eintragen',

  // ── Verwerfen ─────────────────────────────────────────────────────────────
  'garden.discard.action': '„{file}“ verwerfen',
  'garden.discard.title': '„{file}“ verwerfen?',
  'garden.discard.inboundNone': 'Keine andere Seite verlinkt darauf.',
  'garden.discard.inboundOne': '1 Seite verlinkt auf diese Seite.',
  'garden.discard.inboundMany': '{count} Seiten verlinken auf diese Seite.',
  'garden.discard.catalogPreview': 'Diese Katalogzeile würde entfernt:',
  'garden.discard.catalogNone': 'Keine Katalogzeile zu entfernen.',
  'garden.discard.repoint': 'Verweise auf „{file}“ statt darauf umbiegen',
  'garden.discard.willBreak':
    'Diese Links würden brechen — es gibt keine Zielseite, auf die sie umgebogen werden.',
  'garden.discard.confirm': 'Verwerfen',

  // ── Loses Ende ────────────────────────────────────────────────────────────
  'garden.looseEnd.empty': 'Keine losen Enden.',
  'garden.looseEnd.quote': '„{quote}“',
  'garden.looseEnd.announced': 'Angekündigt am {day}. Seitdem nichts dazu.',
  'garden.looseEnd.foundByHeuristic': 'Von der eingebauten Prüfung gefunden.',
  'garden.looseEnd.foundByModel': 'Vom Modell gefunden.',
  'garden.looseEnd.answerLabel': 'Antwort',
  'garden.looseEnd.answerPlaceholder': 'Was ist daraus geworden?',
  'garden.looseEnd.answerSubmit': 'Eintragen',

  // ── Ohne Modell ───────────────────────────────────────────────────────────
  'garden.llm.title': 'Was ein Modell zusätzlich fände',
  'garden.llm.body':
    'Widersprüche zwischen zwei Seiten, Beinahe-Dubletten und häufig genannte Begriffe ohne eigene Seite. Alles darüber steht oben vollständig.',

  // ── Schließen während eines Laufs (042, D7) ──────────────────────────────
  /* Nur der Stopp wird angeboten, kein „trotzdem schließen“ — ein Schreib-
     vorgang könnte noch laufen (Decisions der Story). */
  'garden.quit.title': 'Ein Pflegelauf läuft noch.',
  'garden.quit.body':
    'Ihn jetzt zu stoppen beendet ihn sauber — genau wie der Stopp-Knopf im Laufstreifen. Schließen ohne zu stoppen wird nicht angeboten: Ein Schreibvorgang könnte noch laufen.',
  'garden.quit.stopAndClose': 'Lauf stoppen und schließen',
  'garden.quit.cancel': 'Abbrechen',
} as const;
