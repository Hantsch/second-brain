/* German UI texts for the title-bar update control. Same key set as
   `en-update.ts` — enforced by tests/renderer/i18n.test.ts. Every
   `update.error.*` key main can answer with has its sentence here. */

export const deUpdate = {
  'update.control': 'Update {version}',
  'update.control.aria': 'Update auf Version {version} verfügbar',
  'update.dialog.title': 'Update {version}',
  'update.dialog.body': 'Eine neuere Version von Gaston ist verfügbar.',
  'update.dialog.whatChanged': 'Was sich geändert hat',
  'update.dialog.notNow': 'Jetzt nicht',
  'update.dialog.close': 'Schließen',

  'update.action.download': 'Update herunterladen',
  'update.action.openRelease': 'Release-Seite öffnen',
  'update.action.cancel': 'Abbrechen',
  'update.action.install': 'Neu starten und installieren',
  'update.action.downloading': 'Update wird heruntergeladen',

  'update.error.notInstallable':
    'Diese Ausgabe kann sich nicht selbst aktualisieren. Öffne die Release-Seite.',
  'update.error.notAvailable': 'Es ist kein Update verfügbar.',
  'update.error.notReady': 'Das Update ist noch nicht vollständig heruntergeladen.',
  'update.error.taskRunning':
    'Eine Aufgabe läuft noch. Warte, bis sie fertig ist, oder stoppe sie.',
  'update.error.llmStreaming': 'Eine Antwort wird gerade erzeugt. Warte, bis sie fertig ist.',
  'update.error.installFailed': 'Die Installation konnte nicht gestartet werden.',
  'update.error.download.offline': 'Der Download ist fehlgeschlagen: keine Verbindung.',
  'update.error.download.checksum':
    'Der Download wurde verworfen: die Prüfsumme stimmt nicht überein.',
  'update.error.download.cancelled': 'Der Download wurde abgebrochen.',
  'update.error.download.unknown': 'Der Download ist fehlgeschlagen.',
} as const;
