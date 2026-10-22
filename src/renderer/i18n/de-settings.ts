/* Deutsche Texte der Einstellungen: Tabs, Vault, Sprachen, Verhalten, Info.
   Der Modelle-Tab hat wegen seines Umfangs eine eigene Datei und wird hier
   eingehängt, damit `de.ts` nur einen Import braucht. */

import { deSettingsModels } from './de-settings-models';

const own = {
  'settings.tab.languages': 'Sprachen',
  'settings.tab.models': 'Modelle',
  'settings.tab.behavior': 'Verhalten',
  'settings.tab.customization': 'Anpassung',
  'settings.tab.about': 'Info',

  'settings.agent.cli.title': 'Claude Code',
  'settings.agent.cli.installed': 'Claude Code ist installiert.',
  'settings.agent.cli.foundAt': 'Gefunden unter',
  'settings.agent.cli.absent':
    'Claude Code wurde im PATH dieses Rechners nicht gefunden. Gaston installiert es nicht.',
  'settings.agent.cli.guide': 'Installationsanleitung öffnen',
  'settings.agent.cli.unknown.timeout': 'Status unbekannt: Die Suche hat zu lange gedauert.',
  'settings.agent.cli.unknown.error': 'Status unbekannt: Die Suche ist fehlgeschlagen ({code}).',
  'settings.agent.cli.unknown.errorNoCode': 'Status unbekannt: Die Suche ist fehlgeschlagen.',
  'settings.agent.cli.note':
    'Gaston sucht die CLI nur. Es startet sie nicht, deshalb wird keine Version angezeigt.',
  'settings.agent.setup.title': 'Agent-Einrichtung',
  'settings.agent.setup.intro':
    'Gaston schreibt diese Dateien, damit Claude Code die Regeln dieses Vaults kennt. Dateien, die es nicht geschrieben hat, gehören dir und bleiben unberührt.',
  'settings.agent.setup.loading': 'Einrichtungsdateien werden gelesen',
  'settings.agent.setup.error': 'Die Einrichtung konnte nicht gelesen werden: {reason}',
  'settings.agent.setup.status.current': 'Aktuell',
  'settings.agent.setup.status.outdated': 'Veraltet',
  'settings.agent.setup.status.missing': 'Fehlt',
  'settings.agent.setup.status.modified': 'Von dir geändert',
  'settings.agent.setup.status.newer': 'Von einem neueren Gaston',
  'settings.agent.setup.status.yours': 'Deine Datei',
  'settings.agent.setup.install': 'Installieren',
  'settings.agent.setup.update': 'Aktualisieren',
  'settings.agent.setup.current': 'Die Einrichtung ist aktuell.',
  'settings.agent.setup.help.title': 'Hilfemodul',
  'settings.agent.setup.help.status.current': 'Aktuell',
  'settings.agent.setup.help.status.outdated': 'Veraltet',
  'settings.agent.setup.help.status.missing': 'Fehlt',
  'settings.agent.setup.help.status.collision': 'Blockiert',
  'settings.agent.setup.help.collision':
    'Ein Modul namens „gaston-help“, das nicht von Gaston stammt, blockiert das Hilfemodul. Wird dieses Modul umbenannt, ist der Name frei. Es wurde nichts geschrieben.',
  'settings.agent.setup.plan.install': 'Agent-Einrichtung installieren',
  'settings.agent.setup.plan.update': 'Agent-Einrichtung aktualisieren',
  'settings.agent.setup.plan.intro':
    'Gaston schreibt nur, was hier steht, und erst nach deiner Bestätigung.',
  'settings.agent.setup.plan.write': 'Wird geschrieben',
  'settings.agent.setup.plan.optIn': 'Von dir geändert',
  'settings.agent.setup.plan.optInHint': 'Überschreiben. Eine Kopie landet im Papierkorb.',
  'settings.agent.setup.plan.leave': 'Bleibt unberührt',
  'settings.agent.setup.plan.leaveManaged': 'Gaston schreibt diese Datei nicht.',
  'settings.agent.setup.plan.dirs': 'Legt Ordner an',
  'settings.agent.setup.plan.confirm': '{count} Dateien schreiben',
  'settings.agent.setup.plan.confirmOne': '1 Datei schreiben',
  'settings.agent.setup.plan.result.written': 'Einrichtung geschrieben. {count} Dateien.',
  'settings.agent.setup.plan.result.writtenOne': 'Einrichtung geschrieben. 1 Datei.',
  'settings.agent.setup.plan.result.none': 'Es wurde nichts geschrieben.',
  'settings.agent.setup.plan.result.conflict':
    'Seit dem Plan auf der Platte geändert: {path}. Nichts darauf geschrieben.',
  'settings.agent.setup.plan.result.refused': 'Nicht geschrieben: {path}.',
  'settings.agent.protection.title': 'Schutz',
  'settings.agent.protection.loading': 'Schutzregeln werden gelesen',
  'settings.agent.protection.none':
    'Noch schützt nichts diesen Vault vor dem Agenten. Installiere oben die Einrichtung, um die Regeln hinzuzufügen.',
  'settings.agent.protection.unreadable':
    '.claude/settings.json konnte nicht gelesen werden: {reason}. Der Stand der Regeln ist unbekannt.',
  'settings.agent.protection.status.installed': 'Installiert',
  'settings.agent.protection.status.missing': 'Fehlt',
  'settings.agent.protection.rule.journal-read':
    'journal/ und sein abgeleiteter Index können von den Datei-Werkzeugen von Claude weder gelesen noch geändert werden.',
  'settings.agent.protection.rule.raw-write': 'raw/ ist schreibgeschützt.',
  'settings.agent.protection.rule.setup-write': 'CLAUDE.md und .claude/ sind schreibgeschützt.',
  'settings.agent.protection.rule.overview-write':
    'wiki/overview.md ändert sich nur über einen Vorschlag.',
  'settings.agent.protection.rule.internal-write':
    '{dir}/ ist schreibgeschützt, außer Ergebnisse, Vorschläge und Läufe.',
  'settings.agent.protection.rule.pre-tool-guard':
    'Eine Prüfung vor jedem Werkzeugaufruf blockiert Shell-Zugriff auf journal/, Shell-Schreibzugriffe auf raw/ und Schreibzugriffe außerhalb der Wiki-Ebene.',
  'settings.agent.protection.rule.wiki-check':
    'Wiki-Schreibzugriffe werden auf Frontmatter und einen Eintrag in log.md geprüft.',
  'settings.agent.protection.extra': 'Regeln, die du hinzugefügt hast',
  'settings.agent.protection.limit':
    'Die Shell-Prüfung liest den Befehlstext. Ein Pfad, der aus Variablen gebaut wird, oder ein Skript, das Dateien selbst öffnet, wird nicht erkannt.',
  'settings.agent.about.title': 'Worum es geht',
  'settings.agent.about.open': 'Die Agent-Seite in Wissen lesen',
  'settings.agent.about.unavailable': 'Installiere oben das Hilfemodul, um es hier zu lesen.',
  'settings.agent.about.body':
    'Der Agent ist Claude Code, das du selbst in einem Terminal mit dem Vault als Arbeitsordner öffnest. Er darf die Wiki-Ebene eines Moduls pflegen, für alles andere Vorschläge schreiben und die Aufträge abarbeiten, die du ihm übergibst. Er liest nie journal/, schreibt nie raw/, und Gaston startet ihn nie ohne Terminal.',

  'settings.customization.background.title': 'Hintergrund',
  'settings.customization.background.note':
    'Das Motiv bleibt zentral und sehr dezent hinter den Inhalten. Die Auswahl wirkt sofort.',
  'settings.customization.background.none': 'Keiner',
  'settings.customization.background.none.preview': 'Kein Bild',
  'settings.customization.background.thought-catcher': 'Gedankenfänger',
  'settings.customization.background.knowledge-constellation': 'Wissenskonstellation',
  'settings.customization.background.pocket-vault': 'Taschen-Vault',
  'settings.customization.background.thread-of-return': 'Faden der Rückkehr',
  'settings.customization.background.knowledge-garden': 'Wissensgarten',
  'settings.customization.icon.title': 'App-Symbol',
  'settings.customization.icon.note':
    'Das zugeschnittene Symbol erscheint in der Titelzeile und im Betriebssystem.',
  'settings.customization.icon.knowledge-garden': 'Wissensgarten',
  'settings.customization.icon.neural-core': 'Neuronaler Kern',
  'settings.customization.icon.circuit-cortex': 'Schaltkreis-Kortex',
  'settings.customization.icon.brain-chip': 'Gehirn-Chip',
  'settings.customization.icon.vault-brain': 'Vault-Gehirn',

  'settings.customization.tray.title': 'Infobereich',
  'settings.customization.tray.closeToTray.label':
    'Beim Schließen des Fensters im Infobereich weiterlaufen',
  'settings.customization.tray.closeToTray.hint':
    'Das Schließen des Fensters lässt Gaston im Infobereich weiterlaufen — die Tastenkombination, Erinnerungen und das Schnell-Erfassen bleiben aktiv.',
  'settings.customization.tray.startMinimized.label': 'Im Infobereich starten',
  'settings.customization.tray.startMinimized.hint':
    'Gaston startet versteckt im Infobereich, statt das Fenster zu öffnen.',

  'settings.vault.about':
    'Ein Vault ist ein gewöhnlicher Ordner mit Markdown-Dateien. Er ist portabel: kopiere ihn auf einen USB-Stick oder eine externe Platte, dort funktioniert er vollständig weiter.',
  'settings.vault.reveal': 'Im Explorer öffnen',
  'settings.vault.create': 'Neuen Vault anlegen',
  'settings.vault.docs': 'Dokumente',
  'settings.vault.indexState': 'Indexstand',
  'settings.vault.indexReady': 'aktuell',
  'settings.vault.indexBuilding': 'wird gebaut',
  'settings.vault.indexFailed': 'Update fehlgeschlagen — Index neu bauen',
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
  'settings.lang.ui.example': 'Beispiel: der Bereich heißt „Erfassen“ statt „Capture“.',
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

  'settings.lang.migration.title': 'Alte Sprachüberschriften',
  'settings.lang.migration.warningOne': '1 Datei trägt noch Überschriften in {language}.',
  'settings.lang.migration.warning': '{count} Dateien tragen noch Überschriften in {language}.',
  'settings.lang.migration.action': 'Überschriften umstellen',
  'settings.lang.migration.dialog.title': 'Überschriften umstellen',
  'settings.lang.migration.dialog.intro':
    'Jede betroffene Datei bekommt ihre Abschnittsüberschriften in der aktuellen Dokumentsprache. Der übrige Inhalt bleibt unverändert.',
  'settings.lang.migration.dialog.countOne': '1 Datei wird umgestellt.',
  'settings.lang.migration.dialog.count': '{count} Dateien werden umgestellt.',
  'settings.lang.migration.dialog.confirm': 'Jetzt umstellen',
  'settings.lang.migration.result.noneMigrated': 'Keine Datei musste geändert werden.',
  'settings.lang.migration.result.migratedOne': '1 Datei umgestellt.',
  'settings.lang.migration.result.migrated': '{count} Dateien umgestellt.',
  'settings.lang.migration.result.conflictsOne':
    '1 Datei hat sich seit der Planung geändert und wurde übersprungen.',
  'settings.lang.migration.result.conflicts':
    '{count} Dateien haben sich seit der Planung geändert und wurden übersprungen.',

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
  'settings.behavior.codex.label': 'Codex-CLI-Sessions mitlesen',
  'settings.behavior.codex.hint':
    'Arbeitsspuren der CLI zählen als Fortschritt des Projekts, dessen Repo dort liegt.',
  'settings.behavior.codex.dir.label': 'Ordner der Codex-Sessions',
  'settings.behavior.codex.dir.hint': 'Leer lassen für ~/.codex/sessions.',
  'settings.behavior.notifications.label': 'Benachrichtigungen für fällige Erinnerungen',
  'settings.behavior.notifications.hint': 'Meldet Fristen, auch wenn das Fenster geschlossen ist.',
  'settings.behavior.journal': 'Tagebuch',
  'settings.behavior.coach.label': 'Grundhaltung des Coachs',
  'settings.behavior.coach.listen': 'Zuhören',
  'settings.behavior.coach.listen.hint': 'Spiegeln und bestätigen, keine Ratschläge.',
  'settings.behavior.coach.tips': 'Tipps geben',
  'settings.behavior.coach.tips.hint': 'Zuhören und danach konkrete Vorschläge machen.',
  'settings.behavior.coach.analyze': 'Analysieren',
  'settings.behavior.coach.analyze.hint': 'Verstehen helfen und stützen, mit echten Einträgen.',
  'settings.behavior.coach.where':
    'Gilt als Vorgabe. Im Tagebuch lässt sich die Haltung pro Runde mit Strg+1 bis Strg+3 wechseln.',
  'settings.behavior.gardener': 'Pflege',
  'settings.behavior.runOnOpen.label': 'Beim Öffnen des Vaults automatisch prüfen',
  'settings.behavior.runOnOpen.hint':
    'Findet verwaiste Seiten, kaputte Links und liegengebliebene Dumps.',
  'settings.behavior.review.label': 'Eine Seite gilt als angestaubt nach',
  'settings.behavior.review.hint':
    'Tage seit dem letzten „reviewed“ im Frontmatter. Die Prüfung nennt die Seite dann, sie ändert sie nicht.',
  'settings.behavior.gardenerLlm.label': 'Befunde von einem Modell deuten lassen',
  'settings.behavior.gardenerLlm.hint':
    'Zusätzlich zu den Prüfungen: Widersprüche zwischen Seiten, Beinahe-Dubletten, Begriffe ohne Seite. Ohne Route bleibt die Prüfung deterministisch und kostet nichts.',

  'settings.about.title': 'Über diese App',
  'settings.about.app': 'App',
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
  'settings.about.notes.title': 'Neu in {version}',
  'settings.about.notes.loading': 'Versionshinweise werden geladen …',
  'settings.about.notes.empty.title': 'Keine Versionshinweise für diese Version',
  'settings.about.notes.empty.body':
    'Das Changelog enthält keinen Eintrag zu dieser Version. Das vollständige Changelog ist unten verlinkt.',
  'settings.about.links.project': 'Projektseite',
  'settings.about.links.changelog': 'Vollständiges Changelog',
  'settings.about.updates.title': 'Updates',
  'settings.about.updates.status.idle': 'Noch nicht geprüft.',
  'settings.about.updates.status.checking': 'Suche nach einer neuen Version …',
  'settings.about.updates.status.upToDate': 'Gaston ist auf dem neuesten Stand.',
  'settings.about.updates.status.available': 'Version {version} ist verfügbar.',
  'settings.about.updates.status.error': 'Prüfung fehlgeschlagen: {reason}',
  'settings.about.updates.status.disabled.unpackaged':
    'Update-Prüfung ist in diesem Build aus: Er ist kein verpacktes Release.',
  'settings.about.updates.status.disabled.demo':
    'Update-Prüfung ist in diesem Build aus: Er läuft auf einem Beispiel-Vault.',
  'settings.about.updates.error.network': 'Der Release-Server war nicht erreichbar.',
  'settings.about.updates.error.http': 'Der Release-Server hat mit einem Fehler geantwortet.',
  'settings.about.updates.error.feed': 'Der Release-Feed ließ sich nicht lesen.',
  'settings.about.updates.error.timeout': 'Der Release-Server hat nicht rechtzeitig geantwortet.',
  'settings.about.updates.error.unknown': 'Unbekannter Fehler.',
  'settings.about.updates.lastChecked': 'Zuletzt geprüft',
  'settings.about.updates.distribution': 'Verteilung',
  'settings.about.updates.distribution.installed': 'Installiert',
  'settings.about.updates.distribution.portable': 'Portable Build',
  'settings.about.updates.check': 'Jetzt prüfen',
  'settings.about.updates.checking': 'Prüfe …',
  'settings.about.update.never': 'Nie geprüft',
  'settings.about.update.pending.title': 'Wartendes Update',
  'settings.about.update.pending.badge': 'Noch nicht installiert',
} as const;

export const deSettings = { ...own, ...deSettingsModels } as const;

export type SettingsKey = keyof typeof deSettings;
