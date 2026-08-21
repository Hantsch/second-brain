/* German strings for the models tab: onboarding without a provider, detection
   of local runtimes, provider cards, and task routing.

   Two tones come together here: the onboarding explains the three paths to a
   user without a model in one sentence each, while the routing stays
   technical and terse. `settings.fallback.*` states, per task, what still
   works without a model — honest, not sugar-coated. */

export const deSettingsModels = {
  'settings.models.start.title': 'Noch kein Modell eingerichtet',
  'settings.models.start.body':
    'Drei Wege stehen offen, und du kannst jederzeit wechseln. Ohne Modell bleibt die App benutzbar.',
  'settings.models.start.local.title': 'Lokal (Ollama)',
  'settings.models.start.local.body':
    'Läuft auf diesem Rechner, nichts verlässt das Gerät, kostenlos.',
  'settings.models.start.cloud.title': 'API-Schlüssel (Anthropic, OpenAI, OpenRouter)',
  'settings.models.start.cloud.body':
    'Stark, kostet pro Anfrage. Der Schlüssel bleibt verschlüsselt auf dieser Maschine.',
  'settings.models.start.none.title': 'Ohne Modell weiterarbeiten',
  'settings.models.start.none.body':
    'Erfassen, Suchen, Projekte und Todos funktionieren ohne jedes Modell.',
  'settings.models.start.none.action': 'Zum Dashboard',

  'settings.detect.title': 'Läuft hier schon ein Modell?',
  'settings.detect.checking': 'Suche auf diesem Rechner',
  'settings.detect.found':
    '{label} läuft auf diesem Rechner, {count} Modelle gefunden. Als lokalen Provider übernehmen?',
  'settings.detect.foundOne':
    '{label} läuft auf diesem Rechner, ein Modell gefunden. Als lokalen Provider übernehmen?',
  'settings.detect.foundEmpty':
    '{label} antwortet auf diesem Rechner, hat aber kein Modell geladen. Erst ein Modell laden, dann übernehmen.',
  'settings.detect.configured': '{label} ist schon als Provider eingerichtet.',
  'settings.detect.adopt': 'Als Provider übernehmen',
  'settings.detect.none': 'Kein lokales Modell gefunden.',
  'settings.detect.guide':
    'Anleitung: ollama.com öffnen, Ollama installieren, dann im Terminal das Modell holen.',
  'settings.detect.guideLink': 'ollama.com öffnen',
  'settings.detect.command': 'ollama pull llama3.1:8b',
  'settings.detect.recheck': 'Erneut suchen',
  'settings.detect.failed': 'Die Suche ist fehlgeschlagen.',

  'settings.providers.title': 'Provider',
  'settings.providers.count': '{count} Provider',
  'settings.providers.countOne': 'ein Provider',
  'settings.providers.empty':
    'Noch kein Provider eingerichtet. Sobald einer steht, erscheint er hier als Karte mit Verbindungstest und Modell-Liste.',
  'settings.providers.add': 'Provider hinzufügen',
  'settings.providers.note':
    'Die Provider-Liste reist mit dem Vault. Die Schlüssel bleiben verschlüsselt auf dieser Maschine.',

  'provider.kind.anthropic': 'Anthropic Messages',
  'provider.kind.openai-compatible': 'OpenAI-kompatibel',
  'provider.kind.fake': 'Testgeber',
  'provider.local': 'Lokal',
  'provider.remote': 'Cloud',
  'provider.models': '{count} Modelle',
  'provider.modelsOne': 'ein Modell',
  'provider.noModels': 'noch keine Modelle geladen',
  'provider.probeOk': 'Verbindung stand, {ms} ms',
  'provider.probeFailed': 'Verbindung fehlgeschlagen',
  'provider.probeNever': 'noch nicht getestet',
  'provider.probeAt': 'zuletzt {when}',
  'provider.needsKey': 'Schlüssel fehlt',
  'provider.disabled': 'Abgeschaltet',
  'provider.probe': 'Verbindung testen',
  'provider.loadModels': 'Modelle laden',
  'provider.modelsLoaded': '{count} Modelle geladen.',
  'provider.edit': 'Bearbeiten',
  'provider.remove': 'Entfernen',
  'provider.removeAsk': 'Diesen Provider entfernen? Zugeordnete Aufgaben verlieren ihr Modell.',
  'provider.removeConfirm': 'Ja, entfernen',
  'provider.enable': 'Einschalten',
  'provider.disable': 'Abschalten',

  'provider.dialog.addTitle': 'Provider hinzufügen',
  'provider.dialog.editTitle': 'Provider bearbeiten',
  'provider.dialog.presetLead': 'Womit soll gesprochen werden?',
  'provider.dialog.labelLabel': 'Name',
  'provider.dialog.labelHint': 'Nur für dich — er steht später in der Modell-Auswahl.',
  'provider.dialog.baseUrlLabel': 'Adresse',
  'provider.dialog.baseUrlHint': 'Endpunkt der API, zum Beispiel http://localhost:11434/v1.',
  'provider.dialog.keyLabel': 'API-Schlüssel',
  'provider.dialog.keyHint': 'Wird verschlüsselt auf dieser Maschine gespeichert, nie im Vault.',
  'provider.dialog.keyKeep': 'Leer lassen behält den gespeicherten Schlüssel.',
  'provider.dialog.localLabel': 'Läuft auf diesem Rechner',
  'provider.dialog.localHint': 'Lokale Provider werden für persönliche Aufgaben empfohlen.',
  'provider.dialog.save': 'Speichern und testen',
  'provider.dialog.testing': 'Verbindung wird getestet',
  'provider.dialog.back': 'Andere Vorlage',

  'settings.routing.title': 'Aufgaben-Routing',
  'settings.routing.summary': '{routed} von {total} Aufgaben haben ein Modell.',
  /* The honesty note sits in the task's own row, not as a nested sentence
     above the table — nobody reads it there. */
  'settings.routing.withoutRow': 'Ohne Modell: {fallback}',
  'settings.routing.callToAction':
    'Ein Provider mit Modellen ist eingerichtet. „Automatisch zuordnen" schlägt zu jeder Aufgabe ein Modell vor; gespeichert wird erst nach deiner Zustimmung.',
  'settings.routing.allRouted': 'Jede Aufgabe hat ein Modell.',
  'settings.routing.empty':
    'Sobald ein Provider Modelle hat, lässt sich hier jede Aufgabe einzeln zuordnen.',
  'settings.routing.col.task': 'Aufgabe',
  'settings.routing.col.suggestion': 'Empfehlung',
  'settings.routing.col.model': 'Provider und Modell',
  'settings.routing.col.test': 'Test',
  'settings.routing.sensitive': 'Läuft über persönliche Inhalte — lokales Modell empfohlen.',
  /* Shown as a small badge in the table; the full sentence sits in the badge's title. */
  'settings.routing.sensitiveShort': 'Persönlich',
  'settings.routing.inherit': 'Standard: {model}',
  'settings.routing.noModel': 'ohne Modell',
  'settings.routing.selectAria': 'Modell für {task}',
  'settings.routing.note': 'Aufgaben ohne eigene Wahl nehmen den Standard ihrer Klasse.',
  'settings.routing.test': 'Testen',
  'settings.routing.testOk': 'Antwort nach {ms} ms',
  'settings.routing.testFailed': 'Kein Ergebnis',
  /* Reasons from `LlmUnavailable.reason` — spelled out, not as a code. */
  'settings.routing.reason.no-route': 'Für diese Aufgabe ist kein Modell zugeordnet.',
  'settings.routing.reason.provider-disabled': 'Der zugeordnete Provider ist abgeschaltet.',
  'settings.routing.reason.no-key': 'Für den zugeordneten Provider fehlt der Schlüssel.',
  'settings.routing.reason.unreachable': 'Der zugeordnete Provider war nicht erreichbar.',
  'settings.routing.reason.no-vault': 'Es ist kein Vault geöffnet.',
  'settings.routing.reason.error': 'Der Aufruf ist fehlgeschlagen.',

  'settings.routing.defaults': 'Standard je Leistungsklasse',
  'settings.routing.defaultsNote':
    'Diese drei greifen für jede Aufgabe, die keine eigene Wahl hat — die Fallback-Kette.',
  'settings.routing.defaultAria': 'Standardmodell der Klasse {tier}',
  'settings.routing.auto': 'Automatisch zuordnen',
  'settings.routing.autoHint':
    'Sucht zu jeder Aufgabe ein passendes Modell aus dem, was eingerichtet ist.',
  'settings.routing.preview.title': 'Vorschlag',
  'settings.routing.preview.lead':
    '{count} Zuordnungen würden sich ändern. Gespeichert wird erst, wenn du zustimmst.',
  'settings.routing.preview.leadOne':
    'Eine Zuordnung würde sich ändern. Gespeichert wird erst, wenn du zustimmst.',
  'settings.routing.preview.none': 'Der Vorschlag entspricht dem, was schon eingestellt ist.',
  'settings.routing.preview.apply': 'Übernehmen',
  'settings.routing.preview.discard': 'Verwerfen',
  'settings.routing.preview.tier': 'Standard {tier}',
  'settings.routing.preview.arrow': 'wird',

  'settings.tier.cheap': 'Klein',
  'settings.tier.balanced': 'Mittel',
  'settings.tier.strong': 'Groß',
  'settings.tier.cheap.why': 'Kurze Ein- und Ausgabe — ein großes Modell wäre Verschwendung.',
  'settings.tier.balanced.why': 'Braucht Sorgfalt im Kontext, aber kein Spitzenmodell.',
  'settings.tier.strong.why': 'Verändert Bestand und braucht Urteilsvermögen.',

  'settings.fallback.title-tags': 'Titel kommt aus der ersten Zeile',
  'settings.fallback.classify-dump': 'Dump bleibt in der Inbox liegen',
  'settings.fallback.extract-tasks': 'Checkboxen im Text werden trotzdem gefunden',
  'settings.fallback.query-answer': 'Volltextsuche zeigt die Stellen',
  'settings.fallback.query-rerank': 'Treffer bleiben in der Reihenfolge der Suche',
  'settings.fallback.summarize-source': 'Quelle bleibt unter raw/ liegen',
  'settings.fallback.wiki-ingest': 'Seiten bleiben, wie sie sind',
  'settings.fallback.journal-chat': 'Tageseintrag lässt sich weiter schreiben',
  'settings.fallback.project-status': 'Stand und nächster Schritt bleiben Handarbeit',
  'settings.fallback.gardener-audit': 'Die deterministischen Prüfungen laufen weiter',

  'settings.machine.title': 'Diese Maschine',
  'settings.machine.scan': 'Diesen Rechner scannen',
  'settings.machine.rescan': 'Erneut scannen',
  'settings.machine.idle':
    'Noch kein Scan gelaufen. Er liest RAM, Grafikspeicher, CPU-Kerne und freien Speicherplatz — nichts wird gesendet oder gespeichert.',
  'settings.machine.disclaimer':
    'Faustregel, keine Messung: der tatsächliche Durchsatz hängt vom Modell, der Quantisierung und der Software ab.',
  'settings.machine.unknown': 'unbekannt',
  'settings.machine.unknowns': 'Nicht zu ermitteln: {list}.',
  'settings.machine.tiers': 'Größen, die bequem passen sollten: {tiers}.',
  'settings.machine.verdict.ram':
    'Der Arbeitsspeicher setzt die Grenze: bequem etwa {comfortable} Mrd. Parameter, höchstens {possible} Mrd.',
  'settings.machine.verdict.vram':
    'Der Grafikspeicher (VRAM) setzt die Grenze: bequem etwa {comfortable} Mrd. Parameter, höchstens {possible} Mrd.',
  'settings.machine.verdict.cpu':
    'Die Anzahl der CPU-Kerne setzt die Grenze: bequem etwa {comfortable} Mrd. Parameter, darüber werden Antworten spürbar langsam.',
  'settings.machine.verdict.unknown':
    'Lässt sich nicht einschätzen — dafür fehlen zu viele Angaben.',
  'settings.machine.fact.ram': 'Arbeitsspeicher (RAM)',
  'settings.machine.fact.vram': 'Grafikspeicher (VRAM)',
  'settings.machine.fact.gpu': 'Grafikkarte',
  'settings.machine.fact.cpu': 'CPU-Kerne',
  'settings.machine.fact.disk': 'Freier Speicherplatz',
} as const;

export type SettingsModelsKey = keyof typeof deSettingsModels;
