/* German UI texts for the knowledge screens: modules and sources.

   Its own file so `de-screens.ts` doesn't grow past the line limit — and so
   the texts live where the screens live.

   The category names are the same ones the core writes in `wiki/index.md`
   (`core/wiki/text.ts`): whoever reads "Konzepte" in the UI finds the same
   heading in the vault. */

export const deWiki = {
  // ── Knowledge: the screen's own tabs ───────────────────────────────────────
  'knowledge.tab.modules': 'Module',
  'knowledge.tab.sources': 'Quellen',

  // ── Modules: overview ──────────────────────────────────────────────────────
  'modules.count': '{count} Module',
  'modules.countOne': 'ein Modul',
  'modules.counts': '{sources} Quellen · {entities} Entitäten · {concepts} Konzepte',
  'modules.lastIngest': 'zuletzt verdichtet {date}',
  'modules.neverIngested': 'noch nichts verdichtet',
  'modules.findings': '{count} Befunde aus der Pflege',
  'modules.findingsOne': 'ein Befund aus der Pflege',
  'modules.open': 'Modul {title} öffnen',
  'modules.back': 'Alle Module',
  'modules.noDescription': 'Ohne Beschreibung.',

  'modules.create.action': 'Modul anlegen',
  'modules.create.title': 'Modul anlegen',
  'modules.create.what':
    'Ein Modul ist ein kleines Wiki zu einem Thema: Quellen werden einmal verdichtet, Begriffe und Zusammenhänge wachsen zusammen, und jede Aussage trägt ihren Beleg.',
  'modules.create.name': 'Titel',
  'modules.create.namePlaceholder': 'Identitätsmanagement',
  'modules.create.purpose': 'Zweck',
  'modules.create.purposePlaceholder': 'Was gehört hier hinein — und was nicht?',
  'modules.create.hint':
    'Angelegt werden der Ordner, der Katalog, die Chronik, die Synthese und AGENTS.md — das Schema, mit dem auch ein fremdes Modell das Modul pflegen kann.',
  'modules.create.submit': 'Anlegen',

  // ── Module: Detail ────────────────────────────────────────────────────────
  'modules.tab.pages': 'Seiten',
  'modules.tab.graph': 'Graph',
  'modules.tab.sources': 'Quellen',
  'modules.tab.log': 'Protokoll',

  'modules.category.source': 'Quellen',
  'modules.category.entity': 'Entitäten',
  'modules.category.concept': 'Konzepte',
  'modules.category.overview': 'Synthese',
  'modules.category.all': 'Alle Kategorien',
  'modules.type.source': 'Quelle',
  'modules.type.entity': 'Entität',
  'modules.type.concept': 'Konzept',
  'modules.type.overview': 'Synthese',

  'pages.list': 'Seiten dieses Moduls',
  'pages.search': 'Seite suchen',
  'pages.filter': 'Kategorie',
  'pages.count': '{count} Seiten',
  'pages.countOne': 'eine Seite',
  'pages.noMatch': 'Keine Seite passt zu „{query}“.',
  'pages.empty': 'Dieses Modul hat noch keine Seite. Nimm eine Quelle auf, dann entstehen sie.',
  'pages.words': '{count} Wörter',
  'pages.choose': 'Wähle links eine Seite.',
  'pages.chooseBody':
    'Rechts steht dann die Seite: Fakten aus dem Frontmatter, der Text mit klickbaren Wikilinks und wer hierher verlinkt.',

  'page.facts.type': 'Typ',
  'page.facts.created': 'Angelegt',
  'page.facts.updated': 'Aktualisiert',
  'page.facts.reviewed': 'Geprüft',
  'page.facts.notReviewed': 'noch nie',
  'page.facts.sources': 'Quellen',
  'page.facts.noSources': 'ohne Beleg',
  'page.inbound': 'Verlinkt hierher',
  'page.inbound.empty': 'Keine andere Seite verlinkt hierher.',
  'page.view': 'Ansehen',
  'page.edit': 'Bearbeiten',
  'page.editLabel': 'Markdown dieser Seite',
  'page.editHint': 'Der Text, wie er in der Datei steht. Frontmatter bleibt unberührt.',
  'page.save': 'Speichern',
  'page.saved': 'Gespeichert.',
  'page.unsaved': 'Nicht gespeichert — die Datei wurde außerhalb geändert.',
  'page.cancel': 'Verwerfen',
  'page.conflict.title': 'Gespeichert wurde nichts — die Datei hat sich geändert',
  'page.conflict.body':
    'Seit dem Öffnen hat jemand anders geschrieben — dein Editor, Obsidian, ein Ingest. Nichts wurde überschrieben. Neu laden holt den fremden Stand, Überschreiben setzt deinen darüber.',
  'page.conflict.reload': 'Neu laden',
  'page.conflict.overwrite': 'Überschreiben',
  'page.external.title': 'Die Datei ändert sich gerade außerhalb',
  'page.external.body':
    'Während du hier tippst, hat jemand anders in die Datei geschrieben. Dein Entwurf steht noch da. Neu laden verwirft ihn und holt den fremden Stand; behältst du deine Fassung, fragt das Speichern nochmal nach.',
  'page.external.reload': 'Neu laden',
  'page.external.keep': 'Meine Fassung behalten',
  'page.empty': 'Diese Seite hat noch keinen Text.',

  'wiki.link.open': 'Seite {target} öffnen',
  'wiki.link.missing': 'Seite {target} gibt es nicht',
  'wiki.link.missingMark': 'fehlt',

  'graph.title': 'Wikilink-Graph',
  'graph.meta': '{nodes} Seiten · {edges} Verbindungen',
  'graph.hint': 'Zeigen hebt die Nachbarn hervor, Klicken öffnet die Seite.',
  'graph.empty': 'Noch keine Seite in diesem Modul — also auch kein Graph.',
  'graph.capped':
    'Für eine lesbare Darstellung zu groß: gezeigt werden die {shown} am stärksten verbundenen Seiten von {total}.',
  'graph.lonely': 'Keine Seite verlinkt auf eine andere. Der Graph zeigt sie einzeln.',

  'log.title': 'Chronik',
  'log.empty': 'Die Chronik ist leer. Jeder Ingest und jede Frage schreiben hier eine Zeile.',
  'log.missing': 'Für dieses Modul gibt es noch keine Chronik.',
  'log.kind.ingest': 'Quelle aufgenommen',
  'log.kind.query': 'Frage beantwortet',
  'log.kind.lint': 'Prüfung',
  'log.touched': 'Berührt',
  'log.summary': 'Zusammenfassung',
  'log.notes': 'Notiz',
  'log.answeredFrom': 'Beantwortet aus',
  'log.filedBack': 'Abgelegt als',
  'log.findings': 'Befunde',

  'modules.sourcesTab.empty':
    'Für dieses Modul ist noch keine Rohquelle verdichtet. Quellen kommen über den Screen „Quellen“ herein.',
  'modules.sourcesTab.ingest': 'Quelle in dieses Modul aufnehmen',

  // ── Quellen: Eingang ──────────────────────────────────────────────────────
  'sources.input.title': 'Quelle aufnehmen',
  'sources.input.label': 'URL, YouTube-Link oder Text',
  'sources.input.placeholder': 'https://… einfügen, oder Text hier hineinwerfen',
  'sources.input.submit': 'Aufnehmen',
  'sources.input.files': 'Dateien wählen',
  'sources.input.module': 'Zielmodul',
  'sources.input.moduleLater': 'Später einordnen',
  'sources.input.moduleHint':
    'Ohne Zielmodul liegt die Quelle unverändert in raw/ und wartet auf ihre Verdichtung.',
  'sources.detect.youtube': 'YouTube-Video erkannt',
  'sources.detect.url': 'Webseite erkannt',
  'sources.detect.file': 'Dateipfad erkannt',
  'sources.detect.text': 'Text erkannt — wird als Quelle abgelegt',
  'sources.detect.empty': 'Erkannt wird selbst, was hereinkommt.',

  'sources.drop.title': 'Datei hier fallen lassen',
  'sources.drop.body': 'Text und Markdown werden übernommen.',
  'sources.drop.unsupported':
    'Diese Dateiart lässt sich nicht hineinziehen: {names}. Über „Dateien wählen“ wandert das Original unverändert nach raw/.',
  'sources.drop.unreadable': 'Diese Datei ließ sich nicht lesen: {names}',

  'sources.ytdlp.present': 'yt-dlp vorhanden',
  'sources.ytdlp.missing': 'yt-dlp fehlt',
  'sources.ytdlp.checking': 'yt-dlp wird geprüft',
  'sources.ytdlp.what':
    'Ohne yt-dlp bleibt der Ersatzweg: Untertitel ja, Kapitelmarken und manuelle Spuren nein. „Automatisch holen“ legt das eigenständige Binary in den Anwendungsordner — kein Python, keine Installation im System.',
  'sources.ytdlp.install': 'Automatisch holen',
  'sources.ytdlp.installing': 'Wird geholt',

  // ── Sources: jobs ──────────────────────────────────────────────────────────
  'sources.jobs.title': 'Aufträge',
  'sources.jobs.count': '{count} Aufträge',
  'sources.jobs.countOne': 'ein Auftrag',
  'sources.jobs.empty': 'Noch kein Auftrag in dieser Sitzung.',
  'sources.stage.queued': 'Wartet',
  'sources.stage.fetching': 'Wird geholt',
  'sources.stage.writing-raw': 'Rohquelle geschrieben',
  'sources.stage.summarizing': 'Wird verdichtet',
  'sources.stage.wiki-update': 'Wiki wird nachgezogen',
  'sources.stage.indexing': 'Index zieht nach',
  'sources.stage.done': 'Aufgenommen',
  'sources.stage.error': 'Fehlgeschlagen',
  'sources.stage.duplicate': 'Bereits vorhanden',
  'sources.stage.awaiting-llm': 'Wartet auf ein Modell',
  'sources.stage.no-content': 'Kein Inhalt',
  'sources.stage.blocked.no-transcript': 'Kein Transcript verfügbar',
  'sources.job.cancel': 'Abbrechen',
  'sources.job.retry': 'Wiederholen',
  'sources.job.raw': 'Rohquelle ansehen',
  'sources.job.page': 'Wiki-Seite ansehen',
  'sources.job.pages': '{count} Seiten berührt',
  'sources.job.module': 'nach {module}',
  'sources.job.noModule': 'ohne Modul',
  'sources.awaiting.title': 'Quelle liegt im Vault, die Verdichtung braucht ein Modell',
  'sources.awaiting.body':
    'Die Rohquelle ist unverändert gespeichert. Sobald ein Modell für „Quelle verdichten“ eingerichtet ist, entstehen daraus Wiki-Seiten.',
  'sources.awaiting.model': 'Modell einrichten',
  'sources.unfiled.title': 'Quelle liegt im Vault, noch keinem Modul zugeordnet',
  'sources.unfiled.body':
    'So gewollt bei „später einordnen“: die Rohquelle steht, verdichtet wird sie später — die Prüfung meldet sie als unverdichtet.',
  'sources.duplicate':
    'Diese Quelle liegt bereits unter {path}. Es wurde nichts doppelt importiert.',
  'sources.duplicate.title': 'Quelle bereits im Vault',
  'sources.duplicate.body':
    'Der vorhandene Eintrag wurde geöffnet. Für eine offene Verdichtung dient dort die Aktion „Verdichten“.',
  'sources.duplicate.condensedTitle': 'Quelle ist bereits verdichtet',
  'sources.noContent.title': 'Quelle liegt im Vault, es gibt nichts zu verdichten',
  'sources.noContent.body':
    'Die Rohquelle ist gespeichert, aber ohne lesbaren Text — kein Modell könnte daraus eine Seite machen. Ein erneuter Versuch endet gleich; ein Digest aus der Beschreibung ist die Wahl in der Bestandsliste.',

  // ── Quellen: Bestand ──────────────────────────────────────────────────────
  'sources.list.title': 'Aufgenommene Quellen',
  'sources.list.count': '{count} Quellen',
  'sources.list.countOne': 'eine Quelle',
  'sources.list.hideSuccessful': 'Erfolgreiche ausblenden',
  'sources.list.noAttention':
    'Keine Quelle braucht gerade Aufmerksamkeit. Alle aufgenommenen Quellen sind erfolgreich verdichtet.',
  'sources.list.uncondensed': 'Unverdichtet',
  'sources.list.module': 'in {module}',
  'sources.list.noModule': 'ohne Modul',
  'sources.list.open': 'Details der Quelle {title} öffnen',
  'sources.list.page': 'Zur Wiki-Seite',
  'sources.list.moduleFor': 'Zielmodul für {title}',
  'sources.detail.title': 'Quellendetails',
  'sources.detail.status': 'Status',
  'sources.detail.condensed': 'Verdichtet',
  'sources.detail.kind': 'Art',
  'sources.detail.ingested': 'Aufgenommen',
  'sources.detail.origin': 'Herkunft',
  'sources.detail.unknown': 'unbekannt',
  'sources.detail.size': 'Größe',
  'sources.detail.targetModule': 'Zielmodul',
  'sources.detail.chooseModule': 'Modul wählen',
  'sources.detail.targetHint':
    'Die Verdichtung schreibt die Source-Seite und pflegt dieses Modul nach.',
  'sources.detail.condense': 'Verdichten',
  'sources.detail.condensing': 'Wird verdichtet',
  'sources.detail.condenseFromMetadata': 'Aus Beschreibung verdichten',
  'sources.detail.folder': 'Quellordner',
  'sources.detail.wikiPage': 'Wiki-Seite',
  'sources.detail.resources': 'Erwähnte Ressourcen',
  'sources.detail.resourcesChecked': 'Transcript geprüft',
  'sources.detail.linksOnly': 'Nur Description-Links',
  'sources.detail.checkResources': 'Ressourcen prüfen',
  'sources.detail.noResources':
    'Keine konkrete herunterladbare Ressource erkannt. Description-Links bleiben darunter vollständig einsehbar.',
  'sources.detail.inDescription': 'in der Description',
  'sources.detail.inVideo': 'im Video',
  'sources.detail.inVideoAt': 'im Video bei {time}',
  'sources.detail.descriptionLinks': '{count} Links in der Description',
  'sources.detail.attachments': 'Nachgereichte Quellen',
  'sources.detail.upload': 'Dateien hinzufügen',
  'sources.detail.noAttachments': 'Noch keine Datei nachgereicht.',
  'sources.detail.uploadHint':
    'Die gewählten Dateien werden in sources/ dieses Videos kopiert. Gleichnamige Dateien werden nicht überschrieben.',
  'sources.detail.folderType': 'Ordner',
  'sources.kind.youtube': 'YouTube',
  'sources.kind.url': 'Webseite',
  'sources.kind.file': 'Datei',
  'sources.kind.text': 'Text',
  'sources.kind.bundle': 'Sammlung',
  'sources.kinds.title': 'Vier Wege herein',
  'sources.kinds.youtube':
    'YouTube: Transkript, Kapitel und Metadaten landen zitierfähig mit Zeitmarken in raw/.',
  'sources.kinds.url': 'Webseite: der Artikel wird zu Markdown, Navigation und Werbung fallen weg.',
  'sources.kinds.file':
    'Datei: das Original wandert unverändert in raw/, der lesbare Text daneben.',
  'sources.kinds.text':
    'Text: eingefügtes Material aus Chat, Mail oder PDF, wortwörtlich abgelegt.',
} as const;
