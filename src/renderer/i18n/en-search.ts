/* English strings for the generic reading view (story 059, D4): the fallback
   screen any vault document with no dedicated home opens in
   (`src/renderer/lib/doc-home.ts`).

   Field labels already shared with the wiki page view (type, created,
   updated, sources) live in `en-wiki.ts` and are reused directly rather than
   copied here — everything below is specific to the reader: the fields the
   wiki page never shows (date, status, scope, module, tags), the document
   types outside the wiki's own four, and the screen's own chrome. Same key
   set as `de-search.ts` — a test compares both. */

export const enSearch = {
  'reader.back': 'Back',
  'reader.openExternal': 'Open externally',
  'reader.notFound.title': 'Document not found',
  'reader.allFields': 'All fields',

  'reader.facts.date': 'Date',
  'reader.facts.status': 'Status',
  'reader.facts.scope': 'Scope',
  'reader.facts.module': 'Module',
  'reader.facts.tags': 'Tags',

  /* `source`, `entity`, `concept`, `overview` reuse `modules.type.*` — the
     same four types the wiki page view already names. */
  'reader.type.dump': 'Dump',
  'reader.type.note': 'Note',
  'reader.type.project': 'Project',
  'reader.type.area': 'Area',
  'reader.type.condensed': 'Condensed',
  'reader.type.journal': 'Journal',

  /* The full search result view (059, D5). */
  'screen.search.overline': 'Search',
  'screen.search.title': 'Search results',
  'screen.search.queryLabel': 'Search',
  'screen.search.queryPlaceholder': 'Search the vault',
  'screen.search.prompt.title': 'Type to search',
  'screen.search.prompt.body': 'Search titles, tags and text across the whole vault.',
  'screen.search.noIndex.title': 'No index yet',
  'screen.search.noIndex.body':
    'The vault has not been indexed yet, so search has nothing to look through.',
  'screen.search.empty.title': 'Nothing found',
  'screen.search.empty.body': 'No document matches {query}.',

  'search.filter.all': 'All',
  'search.filter.scope.label': 'Scope',
  'search.filter.type.label': 'Type',
  'search.filter.type.journal': 'Journal',
  'search.filter.type.projects': 'Projects',
  'search.filter.type.areas': 'Areas',
  'search.filter.type.knowledge': 'Knowledge',
  'search.filter.type.notes': 'Notes',
  'search.filter.type.condensed': 'Condensed',

  'search.result.openExternalAria': 'Open externally: {title}',
  'search.showMore': 'Show {count} more',
} as const;
