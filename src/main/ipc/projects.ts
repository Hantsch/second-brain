/* Projekte: lesen, anlegen, ändern, Warte-auf abhaken, Stand vorschlagen.

   Die Liste kommt aus dem Index (er ist die abgeleitete Wahrheit), jeder
   Schreibweg geht durch `VaultStore` — mit Hash, mit Merge, mit Nachlauf.

   Drei Entscheidungen, die man im Code sonst nicht sieht:

   - **`patch` schreibt nur bekannte Felder** und lässt alles andere in Ruhe
     (`project-patch.ts`). Der Store mergt, also überlebt jedes Nutzerfeld.
   - **`updated` wird gesetzt, wenn die App schreibt** — so steht es in
     VAULT-FORMAT.md. Bei einer externen Änderung zählt die mtime, nicht wir.
   - **`suggestStatus` schreibt nichts.** Der Vorschlag geht zurück, das
     Übernehmen ist ein eigener Aufruf des Nutzers. */

import { SECTION_NOTES, SECTION_STATE, SECTION_TODOS } from '@core/capture';
import { deriveProjects, toIndexedDoc } from '@core/index';
import { suggestProjectStatus } from '@core/overview';
import { isoDay, projectPath } from '@core/vault/paths';
import type { Project, Scope, VaultDoc } from '@shared/types';
import { SCOPES } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { requireLists } from './lists';
import { checkProjectPatch, resolveWaitingEntry } from './project-patch';
import { claudeSessions, forgetSessions, overviewIndex, overviewSettings } from './overview-deps';
import { settle } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Erledigtes und Verworfenes bleibt draußen, solange niemand danach fragt. */
function isOpen(project: Project): boolean {
  return project.status !== 'done' && project.status !== 'dropped';
}

function store(services: Services): VaultStoreLike {
  return services.requireStore();
}

/** Alle Projekte, die der Index kennt — leer, wenn er sie nicht ableitet. */
function known(services: Services): readonly Project[] {
  return services.index()?.projects?.() ?? [];
}

/**
 * Ein Projekt aus einer gelesenen Datei ableiten. Nötig, solange der Index das
 * gerade angelegte Projekt noch nicht kennt: eine leere Antwort wäre eine
 * Behauptung über einen Vault, in dem die Datei schon liegt.
 */
async function derive(services: Services, path: string): Promise<Project> {
  const raw = await store(services).readText(path);
  if (raw === null) throw fail('not-found', `dieses Projekt gibt es nicht: ${path}`);
  const stat = { path, size: raw.length, modified: new Date().toISOString(), dir: false };
  const [project] = deriveProjects([toIndexedDoc(path, raw, stat)], []);
  if (project === undefined) throw fail('invalid', `keine Projektdatei: ${path}`);
  return project;
}

/** Das Projekt zu einem Slug — aus dem Index, sonst aus der Datei. */
async function projectFor(services: Services, slug: string): Promise<Project> {
  const found = known(services).find((project) => project.slug === slug);
  if (found !== undefined) return found;
  for (const scope of SCOPES) {
    const path = projectPath(scope, slug);
    if (await store(services).exists(path)) return derive(services, path);
  }
  throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
}

/** Projektdatei und Dokument in einem Zug — beide Schreibwege brauchen beides. */
async function readProject(
  services: Services,
  slug: string,
): Promise<{ project: Project; doc: VaultDoc }> {
  const project = await projectFor(services, slug);
  const doc = await store(services).read(project.path);
  if (doc === null) throw fail('not-found', `diese Projektdatei gibt es nicht: ${project.path}`);
  return { project, doc };
}

/** Rumpf einer neuen Projektdatei: die drei Abschnitte, die jedes Projekt hat. */
function newBody(state: string): string {
  const stand = state.replace(/\r\n/g, '\n').trim();
  return [
    `## ${SECTION_STATE}`,
    '',
    ...(stand.length === 0 ? [] : [stand, '']),
    `## ${SECTION_TODOS}`,
    '',
    `## ${SECTION_NOTES}`,
    '',
  ].join('\n');
}

function requireScope(value: unknown): Scope {
  if (value === 'work' || value === 'private') return value;
  throw fail('invalid', 'scope: erwartet work oder private');
}

export function projectHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* Sortierung kommt aus dem Index: jüngste Spur zuerst — das ist die Antwort
       auf „woran habe ich zuletzt gearbeitet". */
    'projects:list': ({ scope, includeDone }) =>
      requireLists(services)
        .projects()
        .filter(
          (project) =>
            (scope === undefined || project.scope === scope) &&
            (includeDone === true || isOpen(project)),
        ),

    'projects:get': async ({ slug }) => {
      if (typeof slug !== 'string' || slug.trim().length === 0) return null;
      const project = known(services).find((entry) => entry.slug === slug);
      const paths =
        project === undefined ? SCOPES.map((s) => projectPath(s, slug)) : [project.path];
      for (const path of paths) {
        const doc = await store(services).read(path);
        if (doc === null) continue;
        return { project: project ?? (await derive(services, path)), doc };
      }
      return null;
    },

    /* Angelegt wird mit `create`: gibt es die Datei schon, ist das ein Konflikt
       und kein zweites Projekt mit demselben Slug. */
    'projects:create': async ({ title, scope, status, body }) => {
      const name = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
      if (name.length === 0) throw fail('invalid', 'title: darf nicht leer sein');
      const where = requireScope(scope);
      const today = isoDay(new Date());
      const path = projectPath(where, name);
      const slug = path.split('/').at(-2) ?? name;
      const frontmatter = checkProjectPatch({
        title: name,
        status: status ?? 'idea',
        priority: 3,
        started: today,
        tags: [],
        modules: [],
        repos: [],
      });
      await store(services).create(
        path,
        {
          type: 'project',
          ...frontmatter,
          slug,
          scope: where,
          created: today,
          updated: today,
        },
        newBody(typeof body === 'string' ? body : ''),
      );
      await settle(services, [path], 'projects');
      return projectFor(services, slug);
    },

    'projects:patch': async ({ slug, patch, expectedHash }) => {
      const { project, doc } = await readProject(services, slug);
      const fields = checkProjectPatch(patch);
      await store(services).write({
        path: project.path,
        frontmatter: { ...fields, updated: isoDay(new Date()) },
        expectedHash: expectedHash ?? doc.hash,
      });
      /* `repos` ist die Zuordnung der Sitzungen. Ändert sie sich, ist der
         Sitzungspuffer falsch — auch beim Zurücknehmen einer Zuordnung. */
      if (fields['repos'] !== undefined) forgetSessions();
      await settle(services, [project.path], 'projects');
      return projectFor(services, slug);
    },

    'projects:append': async ({ slug, section, content }) => {
      const name = typeof section === 'string' ? section.trim() : '';
      if (name.length === 0 || name.includes('\n')) {
        throw fail('invalid', 'section: erwartet eine Abschnitts-Überschrift');
      }
      const text = typeof content === 'string' ? content.replace(/\r\n/g, '\n').trim() : '';
      if (text.length === 0) throw fail('invalid', 'content: darf nicht leer sein');
      const { project, doc } = await readProject(services, slug);
      const result = await store(services).append(project.path, name, text, {
        expectedHash: doc.hash,
      });
      await settle(services, [project.path], 'projects');
      return { path: result.path, hash: result.hash, created: false };
    },

    'projects:resolveWaiting': async ({ slug, index }) => {
      const { project, doc } = await readProject(services, slug);
      const next = resolveWaitingEntry(doc.frontmatter['waiting_on'], index);
      await store(services).write({
        path: project.path,
        frontmatter: { waiting_on: next, updated: isoDay(new Date()) },
        expectedHash: doc.hash,
      });
      await settle(services, [project.path], 'projects');
      return projectFor(services, slug);
    },

    /* Nur ein Vorschlag: übernommen wird er über `projects:patch`, wenn der
       Nutzer ihn bestätigt. Gerechnet wird er in `@core/overview/status` — die
       eine Fassung, die auch Tageseinträge und Arbeitsspuren mitliest. */
    'projects:suggestStatus': async ({ slug }) => {
      /* Wirft `not-found`, wenn es das Projekt nicht gibt — der Kern gäbe `null`
         zurück, und „kein Vorschlag" wäre für einen fehlenden Slug gelogen. */
      const project = await projectFor(services, slug);
      const index = overviewIndex(services);
      if (!index.projects().some((entry) => entry.slug === project.slug)) {
        /* Die Datei liegt da, der Index hat sie noch nicht gelesen. */
        await services.index()?.refresh?.([project.path]);
      }
      return suggestProjectStatus(
        {
          index,
          gateway: createGateway(services),
          sessions: await claudeSessions(services),
          docLanguage: services.settings.vault()?.languages.documents ?? 'de',
          settings: overviewSettings(services),
        },
        project.slug,
      );
    },
  });
}
