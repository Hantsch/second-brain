/* Ein Wissens-Modul in Dateien schreiben: `module.md`, `wiki/index.md`,
   `wiki/log.md`, `wiki/overview.md` und die Seiten unter `sources/`,
   `entities/`, `concepts/`.

   Konvention dieses Seeds (in docs/VAULT-FORMAT.md nicht festgelegt, siehe
   Bericht): `index.md` und `log.md` tragen kein Frontmatter — sie sind
   Struktur, keine Wissensseiten. `module.md` trägt `type: note`. */

const PAGE_DIRS = { source: 'sources', entity: 'entities', concept: 'concepts' };

function pagePath(moduleSlug, page) {
  if (page.type === 'overview') return `modules/${moduleSlug}/wiki/overview.md`;
  return `modules/${moduleSlug}/wiki/${PAGE_DIRS[page.type]}/${page.slug}.md`;
}

/** Schreibt Modulbeschreibung, Katalog, Chronik und alle Seiten. */
export function writeModule(seeder, clock, module) {
  seeder.doc(
    `modules/${module.slug}/module.md`,
    {
      type: 'note',
      title: module.title,
      slug: module.slug,
      description: module.description,
      created: clock.day(module.created),
      updated: clock.day(module.updated),
      tags: module.tags,
      lang: 'de',
    },
    module.body,
    clock.date(module.updated, '10:00'),
  );
  seeder.bump('modules');

  for (const page of module.pages) {
    seeder.doc(
      pagePath(module.slug, page),
      {
        type: page.type,
        title: page.title,
        module: module.slug,
        created: clock.day(page.created),
        updated: clock.day(page.updated),
        reviewed: clock.day(page.reviewed),
        tags: page.tags ?? [],
        sources: page.sources,
        lang: 'de',
        ...(page.extra ?? {}),
      },
      page.body,
      clock.date(page.updated, page.time ?? '11:30'),
    );
    seeder.bump('pages');
    seeder.bump(`pages.${page.type}`);
  }

  /* Katalog: eine Zeile pro Seite mit Einzeiler. Was hier fehlt, ist ein
     Befund für den Pflege-Screen (Index-Drift) — im Modul absichtlich so. */
  const catalog = [`# Katalog — ${module.title}`, ''];
  for (const [heading, type] of [
    ['Quellen', 'source'],
    ['Entitäten', 'entity'],
    ['Begriffe', 'concept'],
  ]) {
    const listed = module.pages.filter((page) => page.type === type && !page.unlisted);
    if (listed.length === 0) continue;
    catalog.push(`## ${heading}`, '');
    for (const page of listed) catalog.push(`- [[${page.slug}]] — ${page.summary}`);
    catalog.push('');
  }
  catalog.push('## Synthese', '', `- [[overview]] — ${module.overviewSummary}`);
  seeder.text(
    `modules/${module.slug}/wiki/index.md`,
    catalog.join('\n'),
    clock.date(module.updated, '10:05'),
  );

  const log = ['# Chronik', ''];
  for (const entry of module.log) {
    log.push(`## [${clock.day(entry.day)}] ${entry.kind} | ${entry.title}`);
    if (entry.summary) log.push(`- summary: ${entry.summary}`);
    log.push(`- touched: ${entry.touched.join(', ')}`);
    if (entry.notes) log.push(`- notes: ${entry.notes}`);
    log.push('');
  }
  seeder.text(
    `modules/${module.slug}/wiki/log.md`,
    log.join('\n'),
    clock.date(module.updated, '10:06'),
  );
}
