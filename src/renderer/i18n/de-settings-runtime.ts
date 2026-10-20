/* German strings for the local-runtime card (019c): the three states
   (absent/installed-stopped/running), the install-confirm dialog, and the
   pull list. Split out of `de-settings-models.ts` so that file stays under
   the project's soft line limit — merged into it the same way that file is
   merged into `de-settings.ts`. */

export const deSettingsRuntime = {
  'settings.runtime.title': 'Lokale Laufzeit (Ollama)',
  /* 033, D10: llama.cpp's own card title — the Ollama key above stays
     untouched so its card's behaviour is exactly what it was before. */
  'settings.runtime.title.llamacpp': 'Lokale Laufzeit (llama.cpp)',
  'settings.runtime.note':
    'Läuft ausschließlich auf diesem Rechner. Nichts hier sendet etwas, bevor du es bestätigst.',
  'settings.runtime.recheck': 'Erneut prüfen',
  'settings.runtime.status.running': 'Ollama läuft auf diesem Rechner.',
  'settings.runtime.status.installedStopped': 'Ollama ist installiert, läuft aber gerade nicht.',
  'settings.runtime.status.absent': 'Auf diesem Rechner ist keine lokale Laufzeit installiert.',
  'settings.runtime.status.running.llamacpp': 'llama.cpp läuft auf diesem Rechner.',
  'settings.runtime.status.installedStopped.llamacpp':
    'llama.cpp ist installiert, läuft aber gerade nicht.',
  'settings.runtime.getIt': 'Jetzt holen',
  'settings.runtime.startIt': 'Jetzt starten',
  'settings.runtime.manualPath': 'Oder selbst installieren:',
  'settings.runtime.start.ok': 'Gestartet — Ollama läuft jetzt.',
  'settings.runtime.start.failed.timeout':
    'Ollama hat nicht rechtzeitig geantwortet. Selbst starten, dann erneut prüfen.',
  'settings.runtime.start.failed.spawn-failed':
    'Ollama ließ sich auf diesem Rechner nicht starten. Selbst starten, dann erneut prüfen.',
  'settings.runtime.start.ok.llamacpp': 'Gestartet — llama.cpp läuft jetzt.',
  'settings.runtime.start.failed.timeout.llamacpp':
    'llama.cpp hat nicht rechtzeitig geantwortet. Selbst starten, dann erneut prüfen.',
  'settings.runtime.start.failed.spawn-failed.llamacpp':
    'llama.cpp ließ sich auf diesem Rechner nicht starten. Selbst starten, dann erneut prüfen.',
  'settings.runtime.blocked.unsupported-platform':
    'Die App-interne Installation deckt nur Windows und macOS ab — auf diesem System bitte selbst installieren.',
  'settings.runtime.blocked.insufficient-disk':
    'Nicht genug freier Speicherplatz für den Installer — Platz schaffen oder selbst installieren.',
  'settings.runtime.blocked.no-write-permission':
    'Diese App hat kein Schreibrecht für den Download-Ort — bitte selbst installieren.',
  /* llama.cpp has no manual fallback page to point to (Decisions, Q4: all
     three platforms are handled in-app) — these three deliberately drop the
     Ollama wording's "install it yourself" clause instead of pointing
     nowhere. */
  'settings.runtime.blocked.unsupported-platform.llamacpp':
    'Für diese Plattform oder diesen Prozessor gibt es keinen llama.cpp-Build.',
  'settings.runtime.blocked.insufficient-disk.llamacpp':
    'Nicht genug freier Speicherplatz für die Engine — Platz schaffen und erneut versuchen.',
  'settings.runtime.blocked.no-write-permission.llamacpp':
    'Diese App hat kein Schreibrecht für den Download-Ort.',

  /* 034, D3: die erweiterten Fehlgründe von `llm:startLocalRuntime`, nur für
     llama.cpp — Ollamas Implementierung meldet diese vier nie. */
  'settings.runtime.start.failed.port-in-use.llamacpp':
    'Jeder Port von 11435 bis 11444 ist bereits belegt. Was ihn belegt, schließen, dann erneut versuchen.',
  'settings.runtime.start.failed.model-missing.llamacpp':
    'Es ist noch keine Modelldatei installiert. Erst eine holen, dann die Engine starten.',
  'settings.runtime.start.failed.binary-missing.llamacpp':
    'Die Engine selbst ist noch nicht installiert. Erst holen, dann starten.',
  'settings.runtime.start.failed.out-of-memory.llamacpp':
    'Beim Start ist der Speicher ausgegangen. Ressourcenbudget oder Kontext verkleinern, dann erneut versuchen.',

  /* 034, D4: `LlamaEngineDetails` — der abgeleitete Startplan, seine
     Warnungen und der Stopp-/Fremd-Engine-Text. Die `reason`-Codes kommen aus
     `llama-args.ts` (Vokabular siehe dessen Kopfkommentar); die Werte hier
     setzen daraus den jeweiligen Satz zusammen. */
  'settings.runtime.plan.gpuLayers.vram-fit':
    '{n} von {total} Layern laufen auf der GPU — der Rest läuft auf der CPU.',
  'settings.runtime.plan.gpuLayers.no-vram':
    'Kein Layer läuft auf der GPU — für diesen Rechner war kein VRAM eingeplant.',
  'settings.runtime.plan.gpuLayers.unknown-size':
    'Kein Layer läuft auf der GPU — die Dateigröße des Modells ließ sich nicht zur Bemessung nutzen.',
  'settings.runtime.plan.gpuLayers.manual':
    '{n} von {total} Layern auf der GPU — von Hand gesetzt.',
  'settings.runtime.plan.estimatedNote':
    'Die Layer-Anzahl ist aus der Modellgröße geschätzt, nicht aus der Datei gelesen.',
  'settings.runtime.plan.context.fits':
    'Kontext: {tokens} Tokens — die größte Stufe, die noch in den geplanten Speicher passt.',
  'settings.runtime.plan.context.floor':
    'Kontext: {tokens} Tokens — die kleinste Stufe, mit der die Engine noch startet; nichts Größeres hat gepasst.',
  'settings.runtime.plan.context.manual': 'Kontext: {tokens} Tokens — von Hand gesetzt.',
  'settings.runtime.plan.threads.budget':
    '{n} von {cores} CPU-Threads — entspricht dem Ressourcenbudget.',
  'settings.runtime.plan.threads.default':
    '{n} Threads — die Kernzahl ließ sich nicht bestimmen, daher ein Standardwert.',
  'settings.runtime.plan.warning.cpu-only':
    'Dieses Modell läuft vollständig auf der CPU — kein Layer wird auf eine GPU ausgelagert.',
  'settings.runtime.plan.warning.slow-floor-context':
    'Läuft auf der CPU mit einem Kontext von 2048 Tokens — Antworten brauchen auf diesem Rechner mehrere Minuten.',
  'settings.runtime.plan.warning.facts-unknown':
    'Einige Maschinenfakten sind unbekannt, daher kann dieser Plan von der tatsächlichen Maschine abweichen.',
  /* 034, D6: der Autostart-Schalter — `machine.llamaAutoStart`, Standard
     'manual'. */
  'settings.runtime.autoStart.label': 'Automatisch starten, wenn eine Aufgabe es braucht',
  'settings.runtime.autoStart.note':
    'Standardmäßig aus — die Engine startet nur, wenn du „Jetzt starten“ drückst.',
  'settings.runtime.advanced.summary': 'Erweitert',
  /* 034, D5: die beiden von Hand gesetzten Startplan-Werte hinter der
     „Erweitert“-Ausklappung — machine-lokal wie der VRAM-Override und das
     Ressourcenbudget, nie im Vault. */
  'settings.runtime.advanced.gpuLayers.label': 'GPU-Layer',
  'settings.runtime.advanced.contextTokens.label': 'Kontext-Tokens',
  'settings.runtime.advanced.clear': 'Zurücksetzen',
  'settings.runtime.advanced.error.empty': 'Eine Zahl eingeben.',
  'settings.runtime.advanced.error.not-a-number': 'Eine ganze Zahl eingeben.',
  'settings.runtime.advanced.error.negative': 'Mindestens 0 eingeben.',
  'settings.runtime.stop': 'Jetzt stoppen',
  'settings.runtime.stop.note': 'Stoppen bricht eine laufende Anfrage ab.',
  'settings.runtime.foreignEngine':
    'Diese App hat diese Engine nicht gestartet, daher kann sie von hier aus nicht gestoppt werden.',

  'settings.runtime.dialog.title': 'Lokale Laufzeit holen',
  'settings.runtime.dialog.intro': 'Bevor irgendetwas heruntergeladen wird:',
  'settings.runtime.dialog.size': 'Downloadgröße: {mb}',
  'settings.runtime.dialog.installerPath': 'Der Installer wird gespeichert unter: {path}',
  'settings.runtime.dialog.modelDir': 'Ollama legt Modelle ab unter: {path}',
  'settings.runtime.dialog.noUninstall':
    'Diese App kann Ollama später nicht deinstallieren — es bleibt auf diesem Rechner, auch wenn Gaston entfernt wird.',
  'settings.runtime.dialog.confirm': 'Installer herunterladen',
  'settings.runtime.dialog.downloading': 'Installer wird heruntergeladen …',
  'settings.runtime.dialog.progress': '{downloaded} von {total}',
  'settings.runtime.dialog.cancelDownload': 'Download abbrechen',
  'settings.runtime.dialog.done': 'Download abgeschlossen.',
  'settings.runtime.dialog.openInstaller': 'Installer öffnen',
  'settings.runtime.dialog.yourTurn':
    'Der Installer ist offen — durchklicken, dann hierher zurückkommen und „Erneut prüfen“ drücken.',
  'settings.runtime.dialog.openFailed.no-installer-downloaded':
    'Es wurde noch kein Installer heruntergeladen.',

  /* 033, D10: llama.cpp ships a plain archive, not an installer — these
     replace the Ollama-specific wording above wherever the two runtimes'
     download really differ (what is downloaded, where it lands, what
     "removing it" means); `dialog.title`/`intro`/`size`/`done`/`cancelDownload`
     stay generic enough to serve both runtimes unchanged. */
  'settings.runtime.dialog.installerPath.llamacpp': 'Die Engine wird installiert unter: {path}',
  'settings.runtime.dialog.modelDir.llamacpp': 'Modelldateien liegen unter: {path}',
  'settings.runtime.dialog.noUninstall.llamacpp':
    'Diese App verwaltet die Engine selbst in diesem Ordner — wird Gaston entfernt, verschwindet sie mit.',
  'settings.runtime.dialog.confirm.llamacpp': 'Engine herunterladen',
  'settings.runtime.dialog.downloading.llamacpp': 'Engine wird heruntergeladen …',
  'settings.runtime.dialog.openInstaller.llamacpp': 'Engine-Ordner öffnen',
  'settings.runtime.dialog.yourTurn.llamacpp':
    'Der Engine-Ordner ist offen — hier ist nichts weiter zu tun.',

  /* The build select (033, D10, guardrail 2): the GPU scan's pick shown as an
     overridable choice, not a fixed fact. */
  'settings.runtime.dialog.build.label': 'Build',
  'settings.runtime.dialog.build.option.cuda': 'CUDA (NVIDIA-GPU)',
  'settings.runtime.dialog.build.option.vulkan': 'Vulkan (GPU, jeder Hersteller)',
  'settings.runtime.dialog.build.option.cpu': 'Nur CPU',
  'settings.runtime.dialog.build.option.macos': 'Apple Silicon (Metal)',

  /* Die strukturierte Begründung (033, D2) wird hier zum Satz — Kernlogik
     liefert nur die Fakten, kein fertiges Englisch (CLAUDE.md, Grundsatz 7). */
  'settings.runtime.dialog.build.reason.noGpu':
    'Keine Grafikkarte erkannt — verwendet den CPU-Build, der keinen Treiber braucht.',
  'settings.runtime.dialog.build.reason.macos':
    'macOS: ein einziger, universeller Build auf Metal-Basis, keine Herstellerunterscheidung nötig.',
  'settings.runtime.dialog.build.reason.gpuDetected':
    '„{gpuName}“ erkannt — verwendet den {build}-Build.',
  'settings.runtime.dialog.build.reason.gpuUnsure':
    '„{gpuName}“ gemeldet, aber die Erkennung konnte es nicht bestätigen — verwendet den {build}-Build.',
  'settings.runtime.dialog.build.reason.fallback':
    '„{gpuName}“ erkannt — der {requested}-Build hat keine Variante für dieses System, verwendet stattdessen den {actual}-Build.',
  'settings.runtime.dialog.build.reason.fallbackUnsure':
    '„{gpuName}“ gemeldet, aber die Erkennung konnte es nicht bestätigen — der {requested}-Build hat keine Variante für dieses System, verwendet stattdessen den {actual}-Build.',

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

  /* 033, D11: the model search/download panel, llama.cpp's own model
     source (Hugging Face) rather than Ollama's pull list above. */
  'settings.runtime.model.title': 'Modelle für llama.cpp',
  'settings.runtime.model.note':
    'Sucht öffentliche GGUF-Repositorys auf Hugging Face — keine Anmeldung, kein Token.',
  'settings.runtime.model.searchLabel': 'Modellsuche',
  'settings.runtime.model.searchPlaceholder': 'z. B. qwen2.5 1.5b gguf',
  'settings.runtime.model.searchButton': 'Suchen',
  'settings.runtime.model.searchEmpty': 'Keine passenden Modelle gefunden.',
  'settings.runtime.model.filesFor': 'Dateien in {repo}',
  'settings.runtime.model.loadingFiles': 'Dateien werden geladen …',
  'settings.runtime.model.filesEmpty': 'Dieses Repository enthält keine GGUF-Datei.',
  'settings.runtime.model.sizeUnknown': 'Größe unbekannt',
  'settings.runtime.model.quantUnknown': 'Quantisierung unbekannt',
  'settings.runtime.model.reason.gated': 'Dieses Repository benötigt Zugriff auf huggingface.co.',
  'settings.runtime.model.reason.network-error': 'Hugging Face war nicht erreichbar.',
  'settings.runtime.model.reason.error': 'Hugging Face hat mit einem Fehler geantwortet.',
  'settings.runtime.model.diskRefused': 'Nicht genug freier Speicherplatz — nur {mb} MB frei.',
} as const;

export type SettingsRuntimeKey = keyof typeof deSettingsRuntime;
