/* German strings for the local-runtime card (019c): the three states
   (absent/installed-stopped/running), the install-confirm dialog, and the
   pull list. Split out of `de-settings-models.ts` so that file stays under
   the project's soft line limit — merged into it the same way that file is
   merged into `de-settings.ts`. */

export const deSettingsRuntime = {
  'settings.runtime.title': 'Lokale Laufzeit (Ollama)',
  'settings.runtime.note':
    'Läuft ausschließlich auf diesem Rechner. Nichts hier sendet etwas, bevor du es bestätigst.',
  'settings.runtime.recheck': 'Erneut prüfen',
  'settings.runtime.status.running': 'Ollama läuft auf diesem Rechner.',
  'settings.runtime.status.installedStopped': 'Ollama ist installiert, läuft aber gerade nicht.',
  'settings.runtime.status.absent': 'Auf diesem Rechner ist keine lokale Laufzeit installiert.',
  'settings.runtime.getIt': 'Jetzt holen',
  'settings.runtime.startIt': 'Jetzt starten',
  'settings.runtime.manualPath': 'Oder selbst installieren:',
  'settings.runtime.start.ok': 'Gestartet — Ollama läuft jetzt.',
  'settings.runtime.start.failed.timeout':
    'Ollama hat nicht rechtzeitig geantwortet. Selbst starten, dann erneut prüfen.',
  'settings.runtime.start.failed.spawn-failed':
    'Ollama ließ sich auf diesem Rechner nicht starten. Selbst starten, dann erneut prüfen.',
  'settings.runtime.blocked.unsupported-platform':
    'Die App-interne Installation deckt nur Windows und macOS ab — auf diesem System bitte selbst installieren.',
  'settings.runtime.blocked.insufficient-disk':
    'Nicht genug freier Speicherplatz für den Installer — Platz schaffen oder selbst installieren.',
  'settings.runtime.blocked.no-write-permission':
    'Diese App hat kein Schreibrecht für den Download-Ort — bitte selbst installieren.',

  'settings.runtime.dialog.title': 'Lokale Laufzeit holen',
  'settings.runtime.dialog.intro': 'Bevor irgendetwas heruntergeladen wird:',
  'settings.runtime.dialog.size': 'Downloadgröße: {mb}',
  'settings.runtime.dialog.installerPath': 'Der Installer wird gespeichert unter: {path}',
  'settings.runtime.dialog.modelDir': 'Ollama legt Modelle ab unter: {path}',
  'settings.runtime.dialog.noUninstall':
    'Diese App kann Ollama später nicht deinstallieren — es bleibt auf diesem Rechner, auch wenn Second brain entfernt wird.',
  'settings.runtime.dialog.confirm': 'Installer herunterladen',
  'settings.runtime.dialog.downloading': 'Installer wird heruntergeladen …',
  'settings.runtime.dialog.progress': '{downloaded} von {total}',
  'settings.runtime.dialog.cancelDownload': 'Download abbrechen',
  'settings.runtime.dialog.done': 'Download abgeschlossen.',
  'settings.runtime.dialog.openInstaller': 'Installer öffnen',
  'settings.runtime.dialog.yourTurn':
    'Der Installer ist offen — durchklicken, dann hierher zurückkommen und „Erneut prüfen" drücken.',
  'settings.runtime.dialog.openFailed.no-installer-downloaded':
    'Es wurde noch kein Installer heruntergeladen.',

  'settings.runtime.pull.title': 'Modelle, die sich lohnen',
  'settings.runtime.pull.note':
    'Nur Modelle, die diese Maschine tatsächlich tragen kann — jedes mit seiner Downloadgröße.',
  'settings.runtime.pull.empty':
    'Nichts zu holen im Moment — entweder ist schon alles installiert, was passt, oder noch keine Empfehlung vorhanden.',
  'settings.runtime.pull.size': '{gb} GB',
  'settings.runtime.pull.start': 'Holen',
  'settings.runtime.pull.startAria': '{model} holen',
  'settings.runtime.pull.cancel': 'Abbrechen',
  'settings.runtime.pull.cancelAria': 'Download von {model} abbrechen',
  'settings.runtime.pull.retry': 'Erneut versuchen',
  'settings.runtime.pull.retryAria': 'Download von {model} erneut versuchen',
  'settings.runtime.pull.progress': '{completed} von {total}',
  'settings.runtime.pull.progressAria': 'Download-Fortschritt für {model}',
  'settings.runtime.pull.done': 'Installiert.',
  'settings.runtime.pull.failed': 'Der Download ist fehlgeschlagen.',
} as const;

export type SettingsRuntimeKey = keyof typeof deSettingsRuntime;
