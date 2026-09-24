/* German UI text for the generic reading view (story 059, D4): the fallback
   screen any vault document with no dedicated home opens in
   (`src/renderer/lib/doc-home.ts`).

   Field labels already shared with the wiki page view (type, created,
   updated, sources) live in `de-wiki.ts` and are reused directly rather than
   copied here — everything below is specific to the reader: the fields the
   wiki page never shows (date, status, scope, module, tags), the document
   types outside the wiki's own four, and the screen's own chrome. */

export const deSearch = {
  'reader.back': 'Zurück',
  'reader.openExternal': 'Extern öffnen',
  'reader.notFound.title': 'Dokument nicht gefunden',
  'reader.allFields': 'Alle Felder',

  'reader.facts.date': 'Datum',
  'reader.facts.status': 'Status',
  'reader.facts.scope': 'Bereich',
  'reader.facts.module': 'Modul',
  'reader.facts.tags': 'Tags',

  /* `source`, `entity`, `concept`, `overview` reuse `modules.type.*` — the
     same four types the wiki page view already names. */
  'reader.type.dump': 'Dump',
  'reader.type.note': 'Notiz',
  'reader.type.project': 'Projekt',
  'reader.type.area': 'Bereich',
  'reader.type.condensed': 'Verdichtet',
  'reader.type.journal': 'Tagebuch',

  /* Die vollständige Trefferliste der Suche (059, D5). */
  'screen.search.overline': 'Suche',
  'screen.search.title': 'Suchergebnisse',
  'screen.search.queryLabel': 'Suche',
  'screen.search.queryPlaceholder': 'Vault durchsuchen',
  'screen.search.prompt.title': 'Suchbegriff eingeben',
  'screen.search.prompt.body': 'Durchsucht Titel, Tags und Text im gesamten Vault.',
  'screen.search.noIndex.title': 'Noch kein Index',
  'screen.search.noIndex.body':
    'Der Vault wurde noch nicht indiziert, daher hat die Suche nichts zu durchsuchen.',
  'screen.search.empty.title': 'Nichts gefunden',
  'screen.search.empty.body': 'Kein Dokument passt zu „{query}“.',

  'search.filter.all': 'Alle',
  'search.filter.scope.label': 'Bereich',
  'search.filter.type.label': 'Typ',
  'search.filter.type.journal': 'Tagebuch',
  'search.filter.type.projects': 'Projekte',
  'search.filter.type.areas': 'Bereiche',
  'search.filter.type.knowledge': 'Wissen',
  'search.filter.type.notes': 'Notizen',
  'search.filter.type.condensed': 'Verdichtet',

  'search.result.openExternalAria': 'Extern öffnen: {title}',
  'search.showMore': '{count} weitere anzeigen',
} as const;
