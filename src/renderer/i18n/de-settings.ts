/* Deutsche Texte der Einstellungen: Tabs, Vault, Sprachen, Verhalten, Info.
   Der Modelle-Tab hat wegen seines Umfangs eine eigene Datei und wird hier
   eingehängt, damit `de.ts` nur einen Import braucht. */

import { deSettingsModels } from './de-settings-models';

const own = {
  'settings.tab.languages': 'Sprachen',
  'settings.tab.models': 'Modelle',
  'settings.tab.behavior': 'Verhalten',
  'settings.tab.about': 'Info',

  'settings.vault.about':
    'Ein Vault ist ein gewöhnlicher Ordner mit Markdown-Dateien. Er ist portabel: kopiere ihn auf einen USB-Stick oder eine externe Platte, dort funktioniert er vollständig weiter.',
  'settings.vault.reveal': 'Im Explorer öffnen',
  'settings.vault.create': 'Neuen Vault anlegen',
  'settings.vault.docs': 'Dokumente',
  'settings.vault.indexState': 'Indexstand',
  'settings.vault.indexReady': 'aktuell',
  'settings.vault.indexBuilding': 'wird gebaut',
  'settings.vault.indexMissing': 'kein Index',
  'settings.vault.indexAt': 'Letzter Indexlauf',
  'settings.vault.indexNever': 'noch nie',
  'settings.vault.duration': 'Dauer',
  'settings.vault.indexDuration': '{ms} ms',
  'settings.vault.rebuild': 'Index neu bauen',
  'settings.vault.rebuilding': 'Index wird gebaut',
  'settings.vault.rebuildProgress': '{done} von {total} Dateien',
  'settings.vault.rebuildDone': 'Index neu gebaut, {count} Dokumente.',
  'settings.vault.indexNote':
    'Der Index ist abgeleitet. Er darf jederzeit neu gebaut werden — dabei geht nichts verloren.',
  'settings.vault.recent': 'Zuletzt geöffnet',
  'settings.vault.recentMissing': 'nicht gefunden',
  'settings.vault.recentOpen': 'Vault {name} öffnen',

  'settings.lang.title': 'Sprachen',
  'settings.lang.note':
    'Drei Einstellungen, die nichts miteinander zu tun haben müssen: die Oberfläche darf deutsch sein, während die Notizen englisch entstehen.',
  'settings.lang.ui.label': 'Oberfläche',
  'settings.lang.ui.hint': 'Sprache der Knöpfe, Titel und Meldungen. Wirkt sofort, ohne Neustart.',
  'settings.lang.ui.example': 'Beispiel: der Bereich heißt „Erfassen" statt „Capture".',
  'settings.lang.documents.label': 'Dokumentsprache',
  'settings.lang.documents.hint':
    'In dieser Sprache schreibt das Modell Notizen, Wiki-Seiten und Zusammenfassungen in den Vault.',
  'settings.lang.documents.example':
    'Beispiel: aus einem englischen Transkript entsteht eine deutsche Source-Seite.',
  'settings.lang.conversation.label': 'Gesprächssprache',
  'settings.lang.conversation.hint':
    'In dieser Sprache antwortet die App im Gespräch — beim Fragen und im Tagebuch.',
  'settings.lang.conversation.example':
    'Beispiel: du fragst auf Englisch, die Antwort kommt auf Deutsch.',
  'settings.lang.translate.label': 'Fremdsprachige Quellen beim Verdichten übersetzen',
  'settings.lang.translate.hint':
    'Aus einer englischen Quelle entsteht dann eine Seite in der Dokumentsprache. Zitate bleiben im Original.',
  'settings.lang.de': 'Deutsch',
  'settings.lang.en': 'English',

  'settings.behavior.capture': 'Erfassen',
  'settings.behavior.hotkey.label': 'Tastenkombination für das Schnell-Erfassen',
  'settings.behavior.hotkey.hint':
    'Öffnet das kleine Fenster, egal welche App gerade vorne ist. Ist die Kombination belegt, sagt die App das und die alte bleibt.',
  'settings.behavior.hotkey.record': 'Aufnehmen',
  'settings.behavior.hotkey.recording': 'Tasten drücken, Esc bricht ab',
  'settings.behavior.hotkey.reset': 'Zurücksetzen',
  'settings.behavior.hotkey.none': 'keine',
  'settings.behavior.autoClassify.label': 'Dumps nach dem Ablegen einordnen lassen',
  'settings.behavior.autoClassify.hint':
    'Das Modell macht einen Vorschlag. Ausgeführt wird er erst, wenn du zustimmst.',
  'settings.behavior.closeAfter.label': 'Schnell-Erfassen-Fenster nach dem Ablegen schließen',
  'settings.behavior.closeAfter.hint':
    'Es bleibt so lange stehen, dass die Bestätigung mit Pfad und Rückgängig zu lesen ist. Abgeschaltet bleibt es offen für den nächsten Gedanken.',
  'settings.behavior.overview': 'Übersicht und Erinnerungen',
  'settings.behavior.stale.label': 'Ein Projekt gilt als stagnierend nach',
  'settings.behavior.stale.hint': 'Tage ohne jede Spur — Datei, Todo oder Session.',
  'settings.behavior.deadline.label': 'Deadlines auftauchen lassen',
  'settings.behavior.deadline.hint': 'Tage im Voraus, in denen eine Frist im Dashboard steht.',
  'settings.behavior.waiting.label': 'Warte-auf ohne Frist anmahnen nach',
  'settings.behavior.waiting.hint': 'Tage, nach denen ein offenes Warte-auf sichtbar wird.',
  'settings.behavior.days': 'Tagen',
  'settings.behavior.claude.label': 'Claude-Code-Sessions mitlesen',
  'settings.behavior.claude.hint':
    'Arbeitsspuren der CLI zählen als Fortschritt des Projekts, dessen Repo dort liegt.',
  'settings.behavior.claude.dir.label': 'Ordner der Claude-Projekte',
  'settings.behavior.claude.dir.hint': 'Leer lassen für ~/.claude/projects.',
  'settings.behavior.notifications.label': 'Benachrichtigungen für fällige Erinnerungen',
  'settings.behavior.notifications.hint': 'Meldet Fristen, auch wenn das Fenster geschlossen ist.',
  'settings.behavior.journal': 'Tagebuch',
  'settings.behavior.coach.label': 'Grundhaltung des Coachs',
  'settings.behavior.coach.listen': 'Zuhören',
  'settings.behavior.coach.listen.hint': 'Spiegeln und bestätigen, keine Ratschläge.',
  'settings.behavior.coach.tips': 'Tipps geben',
  'settings.behavior.coach.tips.hint': 'Zuhören und danach konkrete Vorschläge machen.',
  'settings.behavior.coach.analyze': 'Analysieren',
  'settings.behavior.coach.analyze.hint': 'Im Licht früherer Einträge Muster zeigen.',
  'settings.behavior.coach.where':
    'Gilt als Vorgabe. Im Tagebuch lässt sich die Haltung pro Runde mit Strg+1 bis Strg+3 wechseln.',
  'settings.behavior.gardener': 'Pflege',
  'settings.behavior.runOnOpen.label': 'Pflegelauf beim Öffnen des Vaults',
  'settings.behavior.runOnOpen.hint':
    'Findet verwaiste Seiten, kaputte Links und liegengebliebene Dumps.',
  'settings.behavior.review.label': 'Eine Seite gilt als angestaubt nach',
  'settings.behavior.review.hint':
    'Tage seit dem letzten „reviewed" im Frontmatter. Die Pflege nennt die Seite dann, sie ändert sie nicht.',
  'settings.behavior.gardenerLlm.label': 'Befunde von einem Modell deuten lassen',
  'settings.behavior.gardenerLlm.hint':
    'Zusätzlich zu den Prüfungen: Widersprüche zwischen Seiten, Beinahe-Dubletten, Begriffe ohne Seite. Ohne Route bleibt der Lauf deterministisch und kostet nichts.',

  'settings.about.title': 'Über diese App',
  'settings.about.version': 'Version',
  'settings.about.electron': 'Electron',
  'settings.about.platform': 'Plattform',
  'settings.about.userData': 'Einstellungen und Schlüssel',
  'settings.about.demo': 'Läuft auf einem Beispiel-Vault.',
  'settings.about.keys':
    'API-Schlüssel liegen verschlüsselt in keys.json in diesem Ordner — mit der Verschlüsselung des Betriebssystems, gebunden an dieses Benutzerkonto. Sie stehen nie im Vault, nie in einem Log und nie in einer Fehlermeldung.',
  'settings.about.format.title': 'Vault-Format',
  'settings.about.format.body':
    'Das verbindliche Dateiformat steht in docs/VAULT-FORMAT.md im Projektordner: Frontmatter, Ordnerbaum, Wikilinks. Was dort nicht steht, schreibt die App nicht.',
  'settings.about.format.open': 'Vault-README öffnen',
} as const;

export const deSettings = { ...own, ...deSettingsModels } as const;

export type SettingsKey = keyof typeof deSettings;
