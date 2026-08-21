/* Knowledge modules and wiki pages.

   Module, page, and source lists come from the index (it is the derived
   truth); creating, reading, and writing a page goes through `@core/wiki`.
   Store, index, and gateway come from `wiki-bridge.ts` — the source and
   question channels use the same wiring.

   A decision you wouldn't otherwise see in the code: **`modules:savePage`
   sets `updated`,** because this is where the app writes. Without
   `expectedHash`, it explicitly overwrites — that's the second path of the
   conflict dialog ("reload or overwrite?"). */

import { excerpt, wordCount } from '@core/vault/doc';
import { createModule, listModules, pageRefOf, readPage, writePage } from '@core/wiki';
import type { KnowledgeModule, VaultDoc, WikiPage } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { gardenerStateFor, gardenerToday } from './gardener-deps';
import { requireLists } from './lists';
import { docLanguage, settle, wikiIndex, wikiStore } from './wiki-bridge';
import type { Services } from '../services';

/**
 * The finding count per module from the last maintenance run.
 *
 * The core sets `findingCount: 0` — it knows nothing of a maintenance run, and
 * 0 there means "no known findings". If there was a run, the number is known,
 * and then it should show up on the module card: otherwise the user would have
 * two places for the same question. If there wasn't one, it stays at 0 — not
 * at a made-up number.
 */
async function withFindings(
  services: Services,
  modules: readonly KnowledgeModule[],
): Promise<KnowledgeModule[]> {
  const report = (await gardenerStateFor(services)).present(gardenerToday());
  if (report === null) return [...modules];
  return modules.map((module) => ({
    ...module,
    findingCount: report.findings.filter((finding) => finding.module === module.slug).length,
  }));
}

/**
 * The page as the renderer needs it. The index knows the graph and counts;
 * a page that was just created isn't in there yet — then it's described from
 * the file, with an empty graph instead of a made-up neighborhood.
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

/** Nodes and edges of a module. The identifier is `module/slug` — same as `outbound`. */
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
      /* Edges across module boundaries don't belong in this graph; broken
         links aren't an edge here at all — they have no target. */
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

    /* Writing with conflict protection. `expectedHash` is what the user has
       read; if it's missing, that's the explicit decision to overwrite
       someone else's version. */
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
