/* German strings for the models tab: onboarding without a provider, detection
   of local runtimes, provider cards, and task routing.

   Two tones come together here: the onboarding explains the three paths to a
   user without a model in one sentence each, while the routing stays
   technical and terse. `settings.fallback.*` states, per task, what still
   works without a model — honest, not sugar-coated. */

import { deSettingsRuntime } from './de-settings-runtime';

const own = {
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

  'llm.preset.llamacpp.hint':
    'Läuft auf diesem Rechner. Gibt die Kontrolle über GPU-Auslagerung und Kontextgröße, die Ollama dir abnimmt — die Wahl für schwache Hardware.',

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
  'settings.detect.runtimeCardHint':
    'Geführte Einrichtung samt Download und Fortschritt steht weiter unten unter „Lokale Laufzeit“.',
  'settings.detect.goToRuntimeCard': 'Zur Karte „Lokale Laufzeit“',
  'settings.detect.guideLink': 'ollama.com öffnen',
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
    'Ein Provider mit Modellen ist eingerichtet. „Automatisch zuordnen“ schlägt zu jeder Aufgabe ein Modell vor; gespeichert wird erst nach deiner Zustimmung.',
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
  'settings.routing.agent': 'Agent (Auftrag)',
  'settings.routing.agentHint':
    'Geht als Auftrag an den Agenten. Er erledigt ihn beim nächsten Lauf von /gaston-jobs; bis dahin gilt, was ohne Modell geht.',
  'settings.routing.selectAria': 'Modell für {task}',
  'settings.routing.note': 'Aufgaben ohne eigene Wahl nehmen den Standard ihrer Klasse.',
  'settings.routing.test': 'Testen',
  'settings.routing.testOk': 'Antwort nach {ms} ms',
  'settings.routing.agentReady':
    'Das Agent-Setup ist installiert. Der Job wartet auf den nächsten Lauf von /gaston-jobs.',
  'settings.routing.testFailed': 'Kein Ergebnis',
  /* Reasons from `LlmUnavailable.reason` — spelled out, not as a code. */
  'settings.routing.reason.no-route': 'Für diese Aufgabe ist kein Modell zugeordnet.',
  'settings.routing.reason.provider-disabled': 'Der zugeordnete Provider ist abgeschaltet.',
  'settings.routing.reason.no-key': 'Für den zugeordneten Provider fehlt der Schlüssel.',
  'settings.routing.reason.unreachable': 'Der zugeordnete Provider war nicht erreichbar.',
  'settings.routing.reason.no-vault': 'Es ist kein Vault geöffnet.',
  'settings.routing.reason.agent-setup-missing':
    'Das Agent-Setup ist nicht installiert. Installiere es unter Einstellungen → Agent.',
  'settings.routing.reason.error': 'Der Aufruf ist fehlgeschlagen.',

  /* Der Ausweg aus einer Empfehlungszeile ohne Treffer (067, D2, AC1): sonst
     eine Sackgasse, egal welcher Grund die Zeile dorthin gebracht hat. */
  'settings.routing.deadEnd.pointer':
    'Weise ein Modell direkt in der Aufgaben-Routing-Tabelle oben zu.',
  'settings.routing.deadEnd.assign': 'Manuell zuordnen',
  'settings.routing.deadEnd.assignAria': 'Modell für {task} manuell zuordnen',

  /* Die Warnung der manuellen Tabelle selbst (067, D3, AC2): blockiert
     nichts, ein Satz, der nennt, warum das gerade zugeordnete Modell die
     Sensitiv-Regel nicht erfüllt. Ein Schlüssel je `SensitiveRefusalReason`. */
  'settings.routing.sensitiveWarn.trains-on-input':
    'Dieser Provider trainiert mit eingereichten Inhalten — für eine Aufgabe mit persönlichen Inhalten ungeeignet.',
  'settings.routing.sensitiveWarn.policy-unknown':
    'Für dieses Modell ist keine Datenrichtlinie bekannt — für eine Aufgabe mit persönlichen Inhalten ungeeignet.',
  'settings.routing.sensitiveWarn.policy-unattributed':
    'Die „ohne Training“-Richtlinie für dieses Modell nennt weder Quelle noch Lesedatum — für eine Aufgabe mit persönlichen Inhalten ungeeignet.',

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
  'settings.fallback.journal-loose-ends': 'Lose Enden bleiben unentdeckt',
  'settings.fallback.project-status': 'Stand und nächster Schritt bleiben Handarbeit',
  'settings.fallback.gardener-audit': 'Die deterministischen Prüfungen laufen weiter',
  'settings.fallback.condense-area': 'Die Bereichsseite bleibt, wie sie ist',
  'settings.fallback.condense-project': 'Die Projektseiten bleiben, wie sie sind',
  'settings.fallback.condense-module': 'Die Modulseiten bleiben, wie sie sind',

  'settings.machine.title': 'Diese Maschine',
  'settings.machine.scan': 'Diesen Rechner scannen',
  'settings.machine.rescan': 'Erneut scannen',
  'settings.machine.scannedAt': 'Zuletzt gescannt: {when}',
  'settings.machine.group.facts': 'Was diese Maschine ist',
  'settings.machine.group.capacity': 'Was sie tragen kann',
  'settings.machine.group.editable': 'Was du ändern darfst',
  'settings.machine.idle':
    'Noch kein Scan gelaufen. Er liest RAM, Grafikspeicher, CPU-Kerne und freien Speicherplatz — nichts wird gesendet oder gespeichert.',
  'settings.machine.disclaimer':
    'Faustregel, keine Messung: der tatsächliche Durchsatz hängt vom Modell, der Quantisierung und der Software ab.',
  'settings.machine.unknown': 'unbekannt',
  'settings.machine.unknowns': 'Nicht zu ermitteln: {list}.',
  'settings.machine.verdict.unknown':
    'Lässt sich nicht einschätzen — dafür fehlen zu viele Angaben.',
  'settings.machine.resource.ram': 'Der Arbeitsspeicher (RAM)',
  'settings.machine.resource.vram': 'Der Grafikspeicher (VRAM)',
  'settings.machine.resource.cpu': 'Die Anzahl der CPU-Kerne',
  'settings.machine.verdict.band.none':
    '{resource} setzt die Grenze: dafür passt derzeit kein lokales Modell bequem auf diese Maschine.',
  'settings.machine.verdict.band.small':
    '{resource} setzt die Grenze: diese Maschine trägt bequem kleine lokale Modelle, etwa für schnelle Chat-Aufgaben.',
  'settings.machine.verdict.band.medium':
    '{resource} setzt die Grenze: diese Maschine trägt bequem mittelgroße lokale Modelle mit mehr Kontext und besseren Antworten.',
  'settings.machine.verdict.band.large':
    '{resource} setzt die Grenze: diese Maschine trägt bequem auch große lokale Modelle.',
  'settings.machine.fact.ram': 'Arbeitsspeicher (RAM)',
  'settings.machine.fact.vram': 'Grafikspeicher (VRAM)',
  'settings.machine.fact.gpu': 'Grafikkarte',
  'settings.machine.fact.cpu': 'CPU-Kerne',
  'settings.machine.fact.disk': 'Freier Speicherplatz',
  'settings.machine.vram.unitGb': 'GB',
  'settings.machine.vram.enter': 'Eintragen',
  'settings.machine.vram.manual': 'Von dir eingetragen',
  'settings.machine.vram.clear': 'Löschen',
  'settings.machine.vram.error.empty': 'Eine Zahl eingeben.',
  'settings.machine.vram.error.not-a-number': 'Eine Zahl in GB eingeben.',
  'settings.machine.vram.error.not-positive': 'Mindestens {min} GB eingeben.',
  'settings.machine.vram.error.too-large': 'Höchstens {max} GB eingeben.',
  'settings.machine.vram.conflict':
    'Die Erkennung meldet inzwischen {detected}, was von den {manual} abweicht, die du eingetragen hast.',
  'settings.machine.vram.conflict.keepMine': 'Meins behalten',
  'settings.machine.vram.conflict.useDetected': 'Erkannten Wert verwenden',
  'settings.machine.budget.title': 'Ressourcen-Budget',
  'settings.machine.budget.value': '{percent} %',
  'settings.machine.budget.help':
    'Bemisst Modellempfehlungen an diesem Anteil von RAM und VRAM, nach der festen Reserve. Ein bereits laufendes Modell wird dadurch nicht gedrosselt.',
  'settings.machine.budget.aria': 'Anteil von RAM und VRAM für lokale Modelle',
  'settings.machine.budget.planned': 'geplant mit {planned} bei {percent} % nach Reserve',

  'settings.recommend.title': 'Modellempfehlung',
  'settings.recommend.action': 'Empfehlungen holen',
  'settings.recommend.note':
    'Ein Vorschlag je Aufgabe, aus dem Katalog erreichbarer Modelle — übernommen wird erst nach deiner Zustimmung.',
  'settings.recommend.idle':
    'Noch keine Empfehlung geholt. Sie schlägt zu jeder Aufgabe ein erreichbares Modell vor, mit Begründung und Kosten.',
  'settings.recommend.stale':
    'Preise könnten veraltet sein — sie stammen aus dem mitgelieferten Katalog, Stand {date}.',
  'settings.recommend.acceptAll': 'Alle übernehmen',
  'settings.recommend.discard': 'Verwerfen',
  'settings.recommend.accept': 'Übernehmen',
  'settings.recommend.accepted': 'Übernommen',
  'settings.recommend.acceptAria': 'Empfehlung für {task} übernehmen',
  'settings.recommend.needsDownload': '{model} — braucht einen Download von {gb} GB',
  'settings.recommend.notYetSetUp': 'Passenden Provider einrichten, um dies zu übernehmen.',
  'settings.recommend.costEstimate': '~{cost} pro Lauf (Schätzung)',
  'settings.recommend.policy': 'Richtlinie gelesen aus {source}, Stand {date}.',
  /* One sentence per `RecommendationReasonKey`, jargon-free per the story's
     requirement — see the doc comment on that type in `@shared/types/llm`. */
  'settings.recommend.reason.best-fit-for-task':
    'Passt in Umfang und Kosten genau zu dieser Aufgabe.',
  'settings.recommend.reason.cheapest-reachable':
    'Die passende Größe war nicht erreichbar — das hier ist die günstigste erreichbare Alternative.',
  'settings.recommend.reason.only-local-option':
    'Für diese Aufgabe ist nur ein lokales Modell erreichbar, mit dem sich etwas vergleichen ließe.',
  'settings.recommend.reason.no-reachable-model':
    'Kein Modell, das du derzeit erreichen kannst, passt zu dieser Aufgabe.',
  'settings.recommend.reason.sensitive-rule-no-qualifying-target':
    'Diese Aufgabe liest persönliche Inhalte, und kein erreichbares Modell erfüllt die Regel dafür — die Aufgabe bleibt ohne Modell.',
  'settings.recommend.reason.beyond-this-machine':
    'Diese Aufgabe braucht mehr, als diese Maschine tragen kann.',
  /* One sentence per `RecommendationTradeoffKey`. */
  'settings.recommend.tradeoff.cheaper-alternative-available':
    'Eine günstigere oder lokale Alternative wäre auch möglich: {alternatives}.',

  /* The shortfall block for a `beyond-this-machine` row (032, D4): required
     size, what the machine carries, and the two honest options. */
  'settings.recommend.shortfall.required': 'Braucht mindestens {required} Mrd. Parameter.',
  'settings.recommend.shortfall.carried': 'Diese Maschine trägt etwa {carried} Mrd.',
  'settings.recommend.shortfall.carriedUnknown':
    'Was diese Maschine trägt, ließ sich nicht ermitteln.',
  'settings.recommend.shortfall.optionCloud':
    'Ein Cloud-Modell könnte diese eine Aufgabe stattdessen übernehmen.',
  'settings.recommend.shortfall.optionNone':
    'Auch dafür ist keine Cloud-Alternative eingerichtet — die Aufgabe bleibt ohne Modell.',
} as const;

export const deSettingsModels = { ...own, ...deSettingsRuntime } as const;

export type SettingsModelsKey = keyof typeof deSettingsModels;
