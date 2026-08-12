/* Wissens-Module und Wiki-Seiten.

   Modul-, Seiten- und Quellenlisten kommen aus dem Index (er ist die abgeleitete
   Wahrheit); Anlegen, Lesen und Schreiben einer Seite gehen durch `@core/wiki`.
   Store, Index und Gateway kommen aus `wiki-bridge.ts` — dieselbe Verdrahtung
   benutzen auch die Quellen- und die Fragen-Kanäle.

   Eine Entscheidung, die man im Code sonst nicht sieht: **`modules:savePage`
   setzt `updated`,** weil hier die App schreibt. Ohne `expectedHash` wird
   ausdrücklich überschrieben — das ist der zweite Weg des Konfliktdialogs
   („neu laden oder überschreiben?"). */

import { excerpt, wordCount } from '@core/vault/doc';
import { createModule, listModules, pageRefOf, readPage, writePage } from '@core/wiki';
import type { KnowledgeModule, VaultDoc, WikiPage } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { gardenerStateFor } from './gardener-deps';
import { requireLists } from './lists';
import { docLanguage, settle, wikiIndex, wikiStore } from './wiki-bridge';
import type { Services } from '../services';

/**
 * Die Befundzahl je Modul aus dem letzten Pflegelauf.
 *
 * Der Kern setzt `findingCount: 0` — er kennt keinen Pflegelauf, und 0 heißt dort
 * „keine bekannten Befunde". Gab es einen Lauf, ist die Zahl bekannt, und dann soll
 * sie auf der Modulkarte stehen: sonst hätte der Nutzer zwei Orte für dieselbe
 * Frage. Gab es keinen, bleibt es bei 0 — nicht bei einer erfundenen Zahl.
 */
async function withFindings(
  services: Services,
  modules: readonly KnowledgeModule[],
): Promise<KnowledgeModule[]> {
  const report = (await gardenerStateFor(services)).present();
  if (report === null) return [...modules];
  return modules.map((module) => ({
    ...module,
    findingCount: report.findings.filter((finding) => finding.module === module.slug).length,
  }));
}

/**
 * Die Seite, wie der Renderer sie braucht. Der Index kennt Graph und Zählungen;
 * eine gerade angelegte Seite steht dort noch nicht — dann wird sie aus der Datei
 * beschrieben, mit leerem Graphen statt einer erfundenen Nachbarschaft.
 */
function pageOf(services: Services, path: string): WikiPage | null {
  const pages = services.index()?.pages?.() ?? [];
  return pages.find((page) => page.path === path) ?? null;
}

function pageFromDoc(path: string, doc: VaultDoc): WikiPage | null {
  const ref = pageRefOf(path, doc.frontmatter);
  if (ref === null) return null;
  const created = doc.frontmatter['created'];
  const tags = doc.frontmatter['tags'];
  const sources = doc.frontmatter['sources'];
  return {
    path,
    module: ref.module,
    slug: ref.slug,
    title: ref.title,
    type: ref.type,
    created: typeof created === 'string' ? created : doc.modified.slice(0, 10),
    updated: doc.modified,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [],
    sources: Array.isArray(sources)
      ? sources.filter((entry): entry is string => typeof entry === 'string')
      : [],
    outbound: [],
    inbound: [],
    excerpt: excerpt(doc.body),
    wordCount: wordCount(doc.body),
  };
}

/** Knoten und Kanten eines Moduls. Die Kennung ist `modul/slug` — wie `outbound`. */
function graphOf(
  services: Services,
  module: string,
): { nodes: { id: string; title: string; type: string }[]; edges: [string, string][] } {
  const pages = requireLists(services)
    .pages()
    .filter((page) => page.module === module);
  const nodes: { id: string; title: string; type: string }[] = [];
  const known = new Set<string>();
  for (const page of pages) {
    const id = `${page.module}/${page.slug}`;
    if (known.has(id)) continue;
    known.add(id);
    nodes.push({ id, title: page.title, type: page.type });
  }
  const edges: [string, string][] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const from = `${page.module}/${page.slug}`;
    for (const to of page.outbound) {
      /* Kanten über Modulgrenzen gehören nicht in diesen Graphen; kaputte Links
         sind hier gar keine Kante — sie haben kein Ziel. */
      if (!known.has(to) || to === from) continue;
      const key = from < to ? `${from}|${to}` : `${to}|${from}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([from, to]);
    }
  }
  return { nodes, edges };
}

export function moduleHandlers(services: Services): HandlerMap {
  return defineHandlers({
    'modules:list': async (): Promise<KnowledgeModule[]> =>
      withFindings(services, listModules(wikiIndex(services))),

    'modules:create': async ({ title, description }) => {
      const result = await createModule(
        wikiStore(services),
        { title, description },
        { docLanguage: docLanguage(services) },
      );
      await settle(services, result.created, 'modules');
      return result.module;
    },

    'modules:pages': ({ module, type }) =>
      requireLists(services)
        .pages()
        .filter((page) => page.module === module && (type === undefined || page.type === type)),

    'modules:page': async ({ path }) => {
      const found = await readPage(wikiStore(services), path);
      if (found === null) return null;
      const page = pageOf(services, path) ?? pageFromDoc(path, found.doc);
      if (page === null) throw fail('invalid', `keine Wiki-Seite: ${path}`);
      return { page, doc: found.doc };
    },

    /* Schreiben mit Konfliktschutz. `expectedHash` ist das, was der Nutzer
       gelesen hat; fehlt er, ist das die ausdrückliche Entscheidung, den
       fremden Stand zu überschreiben. */
    'modules:savePage': async (request) => {
      if (pageRefOf(request.path) === null) {
        throw fail('invalid', `keine Wiki-Seite: ${request.path}`);
      }
      const result = await writePage(
        wikiStore(services),
        request.path,
        {
          ...(request.frontmatter === undefined ? {} : { frontmatter: request.frontmatter }),
          ...(request.body === undefined ? {} : { body: request.body }),
          ...(request.expectedHash === undefined ? {} : { expectedHash: request.expectedHash }),
        },
        docLanguage(services),
      );
      await settle(services, [result.path], 'modules');
      return result;
    },

    'modules:sources': ({ module }) =>
      requireLists(services)
        .sources()
        .filter((source) => module === undefined || source.modules.includes(module)),

    'modules:graph': ({ module }) => graphOf(services, module),
  });
}
