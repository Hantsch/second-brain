/* German UI text, part 1: shell, shared building blocks, errors, tasks.
   The screen texts live in `de-screens.ts` — two files so neither grows
   past the line limit.

   Flat keys, sentence case, no emoji. `en.ts` must carry the same key set —
   a test checks that. */

import { deDashboard } from './de-dashboard';
import { deGarden } from './de-garden';
import { deJournal } from './de-journal';
import { deProjects } from './de-projects';
import { deScreens } from './de-screens';
import { deSettings } from './de-settings';
import { deWiki } from './de-wiki';

export const de = {
  'app.name': 'Second brain',

  'common.cancel': 'Abbrechen',
  'common.close': 'Schließen',
  'common.open': 'Öffnen',
  'common.retry': 'Erneut versuchen',
  'common.loading': 'Lädt',
  'common.search': 'Suchen',
  'common.details': 'Details anzeigen',
  'common.save': 'Speichern',
  'common.undo': 'Rückgängig',
  'common.showAll': 'Alle {count} anzeigen',
  'common.openInEditor': 'Im Editor öffnen',

  'titlebar.minimize': 'Fenster minimieren',
  'titlebar.maximize': 'Fenster maximieren',
  'titlebar.restore': 'Fenster verkleinern',
  'titlebar.close': 'Fenster schließen',
  'titlebar.search': 'Springen, erfassen, suchen',
  'titlebar.searchAria': 'Befehlspalette öffnen — springen, erfassen, suchen',

  'rail.region': 'Hauptnavigation',
  'rail.dashboard': 'Dashboard',
  'rail.capture': 'Erfassen',
  'rail.inbox': 'Inbox',
  'rail.ask': 'Fragen',
  'rail.projects': 'Projekte',
  'rail.journal': 'Tagebuch',
  'rail.modules': 'Module',
  'rail.sources': 'Quellen',
  'rail.garden': 'Pflege',
  'rail.settings': 'Einstellungen',

  'time.today': 'heute',
  'time.yesterday': 'gestern',
  'time.daysAgo': 'vor {count} Tagen',
  'due.overdue': '{count} Tage überfällig',
  'due.overdueOne': 'seit gestern überfällig',
  'due.today': 'heute fällig',
  'due.tomorrow': 'morgen fällig',
  'due.inDays': 'in {count} Tagen fällig',
  'due.none': 'ohne Frist',

  'scope.work': 'Arbeit',
  'scope.private': 'Privat',

  'project.status.idea': 'Idee',
  'project.status.active': 'Aktiv',
  'project.status.waiting': 'Wartet',
  'project.status.paused': 'Pausiert',
  'project.status.done': 'Fertig',
  'project.status.dropped': 'Verworfen',

  'palette.title': 'Befehle',
  'palette.placeholder': 'Springen, erfassen, suchen',
  'palette.empty': 'Kein Treffer',
  'palette.group.screens': 'Bereiche',
  'palette.group.actions': 'Aktionen',
  'palette.group.search': 'Suche',
  'palette.action.capture': 'Gedanken erfassen',
  'palette.hint': 'Pfeiltasten wählen, Enter öffnet, Esc schließt',

  'error.title': 'Das hat nicht funktioniert',
  'error.details': 'Details anzeigen',
  'error.detailsHide': 'Details verbergen',
  'error.retry': 'Erneut versuchen',
  'error.code.no-vault': 'Es ist kein Vault geöffnet.',
  'error.code.not-found': 'Das Gesuchte gibt es nicht (mehr).',
  'error.code.conflict': 'Die Datei wurde zwischenzeitlich geändert. Nichts wurde überschrieben.',
  'error.code.llm-unavailable': 'Für diesen Schritt ist kein Sprachmodell erreichbar.',
  'error.code.invalid': 'Diese Eingabe passt nicht.',
  'error.code.io': 'Der Dateizugriff ist fehlgeschlagen.',
  'error.code.cancelled': 'Abgebrochen.',
  'error.code.unknown': 'Unerwarteter Fehler.',
  /* Dieselben Fälle mit Gegenstand. Ein Fehler ohne Objekt lässt den Nutzer
     raten, was gemeint war — „Der Vault „kaputter-vault" ließ sich nicht
     öffnen" sagt es. Der Aufrufer gibt den Gegenstand mit, wenn er ihn kennt. */
  'error.about.no-vault': 'Für „{subject}" ist kein Vault geöffnet.',
  'error.about.not-found': '„{subject}" gibt es nicht (mehr).',
  'error.about.conflict':
    '„{subject}" wurde zwischenzeitlich geändert. Nichts wurde überschrieben.',
  'error.about.llm-unavailable': 'Für „{subject}" ist kein Sprachmodell erreichbar.',
  'error.about.invalid': '„{subject}" passt nicht.',
  'error.about.io': '„{subject}" ließ sich nicht öffnen — der Ordner ist nicht beschreibbar.',
  'error.about.cancelled': '„{subject}" wurde abgebrochen.',
  'error.about.unknown': 'Bei „{subject}" ist etwas Unerwartetes passiert.',

  'llm.missing.title': 'Für diesen Schritt fehlt ein Modell',
  'llm.missing.body':
    'Die Aufgabe „{task}" braucht ein Sprachmodell. Alles, was ohne Modell geht, bleibt benutzbar.',
  'llm.missing.action': 'Routing einrichten',
  'llm.note.query-answer':
    'Belegte Antworten in Prosa brauchen ein Modell — die Fundstellen zeigt die App auch ohne.',
  'llm.note.classify-dump':
    'Ablage-Vorschläge brauchen ein Modell — Erfassen und Ablegen gehen ohne.',
  'llm.note.project-status':
    'Ein gedeuteter Vorschlag braucht ein Modell — der aus Regeln kommt auch ohne.',
  'llm.note.gardener-audit':
    'Widersprüche, Beinahe-Dubletten und Begriffe ohne Seite braucht ein Modell — die maschinellen Prüfungen laufen ohne.',
  'llm.note.action': 'Routing einrichten',

  'vault.none': 'Kein Vault',
  'vault.choose': 'Vault öffnen',
  'vault.docs': '{count} Dokumente',
  'vault.indexing': 'Index wird gebaut',
  'vault.indexed': 'Index aktuell',
  'vault.noIndex': 'Kein Index',
  'vault.statusAria': 'Vault-Status, öffnet die Einstellungen',

  'toast.region': 'Meldungen',
  'toast.dismiss': 'Meldung schließen',
  'toast.classifyFailed': 'Der Ablage-Vorschlag ließ sich nicht erstellen. In der Inbox erneut.',
  'toast.hotkeyBusy':
    'Die Tastenkombination für das Schnell-Erfassen ist belegt. In den Einstellungen ändern.',
  'toast.keyNotPersisted':
    'Dieser Rechner kann Schlüssel nicht verschlüsselt ablegen. Der Schlüssel gilt nur bis zum Beenden.',

  /* Die Keys stammen aus `src/core/llm/presets.ts`. */
  'llm.preset.ollama.hint':
    'Läuft auf dieser Maschine. Kein Schlüssel nötig, erste Wahl für Tagebuch und Dumps.',
  'llm.preset.lmstudio.hint':
    'Lokaler Server von LM Studio. Das geladene Modell muss dort aktiv sein.',
  'llm.preset.openai.hint':
    'Cloud. Der Schlüssel bleibt verschlüsselt auf dieser Maschine, die Inhalte verlassen sie.',
  'llm.preset.openrouter.hint': 'Ein Schlüssel für viele Modelle. Gut, um Modelle zu vergleichen.',
  'llm.preset.anthropic.hint':
    'Claude-Modelle über die Messages-API. Stark beim Verdichten und Verknüpfen.',
  'llm.preset.custom-openai.hint':
    'Für vLLM, llama.cpp, Azure oder jeden anderen Dienst mit /chat/completions.',

  'task.classify-dump.label': 'Dump einordnen',
  'task.classify-dump.hint':
    'Liest einen rohen Gedanken und schlägt eine Ablage vor. Persönlich — ein lokales Modell ist die bessere Wahl.',
  'task.title-tags.label': 'Titel und Tags',
  'task.title-tags.hint': 'Kürzeste Aufgabe der App. Ein kleines Modell genügt.',
  'task.extract-tasks.label': 'Todos herausziehen',
  'task.extract-tasks.hint':
    'Findet Aufgaben, Fristen und Warte-auf im Text. Kleines Modell, strukturierte Antwort.',
  'task.summarize-source.label': 'Quelle verdichten',
  'task.summarize-source.hint':
    'Macht aus einem Transkript oder Dokument eine belegte Source-Seite. Braucht Ausdauer im Kontext.',
  'task.wiki-ingest.label': 'Wiki pflegen',
  'task.wiki-ingest.hint':
    'Schreibt Begriffs- und Konzeptseiten und verknüpft sie. Die anspruchsvollste Aufgabe.',
  'task.query-answer.label': 'Frage beantworten',
  'task.query-answer.hint':
    'Antwortet ausschließlich aus den gefundenen Stellen, mit Zitat. Fehler fallen hier am meisten auf.',
  'task.query-rerank.label': 'Treffer sortieren',
  'task.query-rerank.hint':
    'Sortiert Suchtreffer nach Passung zur Frage. Ein kleines Modell reicht.',
  'task.journal-chat.label': 'Tagebuch-Gespräch',
  'task.journal-chat.hint':
    'Das persönlichste Gespräch der App. Ein lokales Modell ist ausdrücklich empfohlen.',
  'task.project-status.label': 'Projekt-Stand',
  'task.project-status.hint':
    'Leitet Status und nächsten Schritt aus der Projekthistorie ab — als Vorschlag.',
  'task.gardener-audit.label': 'Ergebnisse deuten',
  'task.gardener-audit.hint':
    'Findet Widersprüche, veraltete Aussagen und fehlende Seiten. Braucht Urteilsvermögen.',

  /* Hinweise des Aufnehmens. Der Kern kennt keine Sprache und schickt einen Code
     (`IngestNoteCode`); hier steht der Satz dazu. Jede Absage ist eine Aussage über
     die Quelle, nie eine Entschuldigung. */
  'ingest.note.pdf-not-read':
    'PDF wird noch nicht gelesen — die Datei liegt als Quelle, den Text bitte einfügen.',
  'ingest.note.binary-not-read':
    'Diese Dateiart wird nicht gelesen — die Datei liegt als Quelle, den Text bitte einfügen.',
  'ingest.note.no-transcript':
    'Das Video hat keine Untertitel. Metadaten und Beschreibung liegen trotzdem.',
  'ingest.note.partial-metadata': 'Ein Teil der Metadaten fehlt.',
  'ingest.note.ytdlp-missing':
    'yt-dlp fehlt. Geholt wurde über den Ersatzweg — ohne Kapitelmarken und ohne manuelle Untertitel.',
  'ingest.note.content-truncated': 'Die Quelle war größer als 5 MB und wurde abgeschnitten.',
  'ingest.note.unsupported-content': 'Diese Adresse liefert keinen Text.',
  'ingest.note.awaiting-llm': 'Rohquelle liegt. Die Verdichtung braucht ein Modell.',

  ...deScreens,
  ...deDashboard,
  ...deGarden,
  ...deJournal,
  ...deProjects,
  ...deSettings,
  ...deWiki,
} as const;

export type TranslationKey = keyof typeof de;
