/* Projects: read, create, change, check off waiting-on, suggest status.

   The list comes from the index (it's the derived truth), every write path
   goes through `VaultStore` — with hash, with merge, with follow-up.

   Five decisions you otherwise wouldn't see in the code:

   - **`patch` writes only known fields** and leaves everything else alone
     (`project-patch.ts`). The store merges, so every user field survives.
   - **`updated` is set when the app writes** — as documented in
     VAULT-FORMAT.md. On an external change, the mtime counts, not us.
   - **`suggestStatus` writes nothing.** The suggestion goes back to the
     caller; accepting it is a separate call the user makes.
   - **Provenance is stamped by the app, not by the caller.** `status_set` and
     `next_step_set` are written exactly when the patch touches `status` or
     `next_step` — a patch about something else leaves them alone. The caller
     only says where the change came from (`origin`); `status_set` in the patch
     itself is an unknown field and gets rejected.
   - **`createNote`/`removeNote` are one pair.** The note is written as the
     block `filingBlock` produces, and the undo takes exactly that block back
     out via `removeBlock`. If it isn't in the file verbatim any more, the
     user has edited it — then nothing is written. No undo rewrites a line the
     app didn't create. */

import {
  SECTION_NOTES,
  SECTION_STATE,
  SECTION_TODOS,
  filingBlock,
  removeBlock,
} from '@core/capture';
import { deriveProjects, toIndexedDoc } from '@core/index';
import { suggestProjectStatus } from '@core/overview';
import { projectNotesHeading } from '@core/projects';
import { isoDay, projectPath } from '@core/vault/paths';
import type { Project, Scope, VaultDoc } from '@shared/types';
import { SCOPES } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { requireLists } from './lists';
import { checkProjectPatch, resolveWaitingEntry } from './project-patch';
import { claudeSessions, forgetSessions, overviewIndex, overviewSettings } from './overview-deps';
import { docLanguage, settle } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/** Done and dropped items stay out, as long as nobody asks for them. */
function isOpen(project: Project): boolean {
  return project.status !== 'done' && project.status !== 'dropped';
}

function store(services: Services): VaultStoreLike {
  return services.requireStore();
}

/** All projects the index knows — empty if it doesn't derive any. */
function known(services: Services): readonly Project[] {
  return services.index()?.projects?.() ?? [];
}

/**
 * Derive a project from a file that was just read. Needed as long as the
 * index doesn't yet know about the just-created project: an empty answer
 * would be a false claim about a vault where the file already exists.
 */
async function derive(services: Services, path: string): Promise<Project> {
  const raw = await store(services).readText(path);
  if (raw === null) throw fail('not-found', `dieses Projekt gibt es nicht: ${path}`);
  const stat = { path, size: raw.length, modified: new Date().toISOString(), dir: false };
  const [project] = deriveProjects([toIndexedDoc(path, raw, stat)], []);
  if (project === undefined) throw fail('invalid', `keine Projektdatei: ${path}`);
  return project;
}

/** The project for a slug — from the index, otherwise from the file. */
async function projectFor(services: Services, slug: string): Promise<Project> {
  const found = known(services).find((project) => project.slug === slug);
  if (found !== undefined) return found;
  for (const scope of SCOPES) {
    const path = projectPath(scope, slug);
    if (await store(services).exists(path)) return derive(services, path);
  }
  throw fail('not-found', `dieses Projekt gibt es nicht: ${slug}`);
}

/** Project file and document in one go — both write paths need both. */
async function readProject(
  services: Services,
  slug: string,
): Promise<{ project: Project; doc: VaultDoc }> {
  const project = await projectFor(services, slug);
  const doc = await store(services).read(project.path);
  if (doc === null) throw fail('not-found', `diese Projektdatei gibt es nicht: ${project.path}`);
  return { project, doc };
}

/** Body of a new project file: the three sections every project has. */
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

/* The text of a note, or a refusal — an empty note is never written. Same rule
   as `noteText` in `areas.ts`; it stays a rule of each channel module so that
   neither of the two write paths depends on the other. */
function noteText(text: unknown): string {
  const note = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';
  if (note.length === 0) throw fail('invalid', 'text: darf nicht leer sein');
  return note;
}

/**
 * The block the undo is supposed to take out. An empty one would match nothing
 * and quietly report success — that is a malformed request, not an undo.
 */
function requireBlock(value: unknown): string {
  const block = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
  if (block.length === 0) throw fail('invalid', 'block: darf nicht leer sein');
  return block;
}

export function projectHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* Sorting comes from the index: most recent trail first — that's the
       answer to "what did I last work on". */
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

    /* Created with `create`: if the file already exists, that's a conflict,
       not a second project with the same slug. */
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
          /* The status of a project the user just created is his own — there is
             no suggestion that could have set it. */
          status_set: { at: today, by: 'user' },
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

    'projects:patch': async ({ slug, patch, expectedHash, origin }) => {
      const { project, doc } = await readProject(services, slug);
      const fields = checkProjectPatch(patch);
      const today = isoDay(new Date());
      /* Only the caller knows whether this is a hand edit or an accepted
         suggestion; anything else counts as the user's own decision. */
      const by = origin === 'suggestion' ? 'suggestion' : 'user';
      const frontmatter: Record<string, unknown> = { ...fields, updated: today };
      /* `undefined` never reaches here for a field the caller sent — an explicit
         `next_step: null` is a change too and gets its stamp. Fields the patch
         doesn't mention stay out of the write entirely, so the store's merge
         keeps their old stamp. */
      if (fields['status'] !== undefined) frontmatter['status_set'] = { at: today, by };
      if (fields['next_step'] !== undefined) frontmatter['next_step_set'] = { at: today, by };
      await store(services).write({
        path: project.path,
        frontmatter,
        expectedHash: expectedHash ?? doc.hash,
      });
      /* `repos` is the link for sessions. If it changes, the session buffer
         is stale — including when undoing a link. */
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

    /* The file is read fresh right before it is written: the index is a
       derivation and may lag behind an external edit, so a body from it would
       be a basis the file no longer has. The heading comes from that fresh
       body — a project that says "Notizen" keeps saying it, even after the
       document language has changed. */
    'projects:createNote': async ({ slug, text, expectedHash }) => {
      const note = noteText(text);
      const { project, doc } = await readProject(services, slug);
      const heading = projectNotesHeading(doc.body, docLanguage(services));
      /* The same function the filing path uses — the two must not drift apart,
         or the same file would grow two shapes of "a note". */
      const block = filingBlock(note);
      const result = await store(services).append(project.path, heading, block, {
        expectedHash: expectedHash ?? doc.hash,
      });
      await settle(services, [project.path], 'projects');
      return { path: result.path, hash: result.hash, created: false, block };
    },

    'projects:removeNote': async ({ slug, block }) => {
      const wanted = requireBlock(block);
      const { project, doc } = await readProject(services, slug);
      const body = removeBlock(doc.body, wanted);
      /* Not in the file verbatim any more: the user has edited it since. His
         text wins — nothing is written, and that is the honest answer, not a
         failure. The hash is the file's current one, so the caller stays in
         step with what is really there. */
      if (body === null) return { path: project.path, hash: doc.hash, created: false };
      const result = await store(services).write({
        path: project.path,
        body,
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

    /* Only a suggestion: it's applied via `projects:patch` once the user
       confirms it. Calculated in `@core/overview/status` — the single
       version that also reads day entries and work trails. */
    'projects:suggestStatus': async ({ slug }) => {
      /* Throws `not-found` if the project doesn't exist — the core would
         return `null`, and "no suggestion" would be a lie for a missing
         slug. */
      const project = await projectFor(services, slug);
      const index = overviewIndex(services);
      if (!index.projects().some((entry) => entry.slug === project.slug)) {
        /* The file is there, the index hasn't read it yet. */
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
