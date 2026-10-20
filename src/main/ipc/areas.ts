/* Areas: read, write a note, create an area, move a note.
 *
 * The list comes from the index (it's the derived truth), every write goes
 * through `VaultStore` — with a hash, always. This is the story's only new write
 * path into the user's own files, so what it does *not* do matters most:
 *
 * - **No write without a hash.** The client's `expectedHash` if it has one, the
 *   file's current hash otherwise. There is no branch here that writes blind.
 * - **Every file is read fresh right before it is written.** The index is a
 *   derivation and may lag behind an external edit; a body from it would be a
 *   basis the file no longer has.
 * - **A note is never in two files, and never in none.** The move is two writes
 *   with a rollback — that part lives in `area-note.ts`.
 * - **Nothing is created behind the user's back except the default area.** It is
 *   the one area the app may bring into being on its own (the story's decision:
 *   a note with no chosen target has to land somewhere), and it is created with
 *   the note already in it — one write, never a half-filled file.
 */

import {
  areaNoteBlock,
  areaSectionIn,
  areaSections,
  moveNoteBlock,
  newAreaDocument,
  withAreaNote,
} from '@core/areas';
import { deriveAreas, parseAreaNotes, toIndexedDoc } from '@core/index';
import type { IndexedDoc } from '@core/index';
import { areaPath } from '@core/vault/paths';
import type { Area, WriteResult } from '@shared/types';
import { requireNoteBlock, applyNoteMove } from './area-note';
import { requireLists } from './lists';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { docLanguage, settle } from './wiki-bridge';
import type { VaultStoreLike } from '../contracts';
import type { Services } from '../services';

/**
 * Slug of the area a note lands in when the user names no target. Its path is
 * fixed (`areas/notes.md`) so that it stays the same area in every document
 * language; only its title follows the language.
 */
const DEFAULT_AREA = 'notes';

function store(services: Services): VaultStoreLike {
  return services.requireStore();
}

/** All areas the index knows — empty if it doesn't derive any. */
function known(services: Services): readonly Area[] {
  return services.index()?.areas?.() ?? [];
}

/**
 * A file as the index would read it: body, `bodyLine` and hash all from the same
 * text. `bodyLine` is what makes `AreaNote.line` a line in the *file*, so it has
 * to come from the same reading as the body — not from a second one.
 */
async function readIndexed(services: Services, path: string): Promise<IndexedDoc> {
  const raw = await store(services).readText(path);
  if (raw === null) throw fail('not-found', `diese Bereichsdatei gibt es nicht: ${path}`);
  const stat = { path, size: raw.length, modified: new Date().toISOString(), dir: false };
  return toIndexedDoc(path, raw, stat);
}

/**
 * Derive an area from a file that was just read. Needed as long as the index
 * doesn't know the freshly created area yet: an empty answer would be a false
 * claim about a vault where the file already exists.
 */
async function derive(services: Services, path: string): Promise<Area> {
  const [area] = deriveAreas([await readIndexed(services, path)], []);
  if (area === undefined) throw fail('invalid', `keine Bereichsdatei: ${path}`);
  return area;
}

/** The area for a slug — from the index, otherwise from the file. */
async function areaFor(services: Services, slug: unknown): Promise<Area> {
  const name = typeof slug === 'string' ? slug.trim() : '';
  if (name.length === 0) throw fail('invalid', 'slug: darf nicht leer sein');
  const found = known(services).find((area) => area.slug === name);
  if (found !== undefined) return found;
  const path = areaPath(name);
  if (await store(services).exists(path)) return derive(services, path);
  throw fail('not-found', `diesen Bereich gibt es nicht: ${name}`);
}

/** The text of a note, or a refusal — an empty note is never written. */
function noteText(text: unknown): string {
  const note = typeof text === 'string' ? text.replace(/\r\n/g, '\n').trim() : '';
  if (note.length === 0) throw fail('invalid', 'text: darf nicht leer sein');
  return note;
}

/**
 * Append a note to an existing area file. The heading comes from the file — an
 * area that says "Notizen" keeps saying it, even after the document language has
 * changed (`areaSectionIn`).
 */
async function appendNote(
  services: Services,
  path: string,
  note: string,
  expectedHash?: string,
): Promise<WriteResult> {
  const doc = await readIndexed(services, path);
  const section = areaSectionIn(doc.body, 'notes', docLanguage(services));
  const result = await store(services).append(path, section, areaNoteBlock(note), {
    expectedHash: expectedHash ?? doc.hash,
  });
  await settle(services, [path], 'areas');
  return { path: result.path, hash: result.hash, created: false };
}

/**
 * The default area with its first note already inside. The title is the document
 * language's word for it, the path is not: `areas/notes.md` has to stay the same
 * file for the same vault, whatever the language is set to today.
 */
async function createDefaultArea(services: Services, note: string): Promise<WriteResult> {
  const language = docLanguage(services);
  const fresh = newAreaDocument(areaSections(language).notes, language);
  const doc = withAreaNote({ ...fresh, path: areaPath(DEFAULT_AREA) }, areaNoteBlock(note));
  /* `create` refuses an existing file: if it appeared between the check and
     here, that is a conflict and not an overwrite. */
  const result = await store(services).create(doc.path, doc.frontmatter, doc.body);
  await settle(services, [doc.path], 'areas');
  return result;
}

/** A line number the file can actually have. */
function requireLine(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return value;
  throw fail('invalid', 'line: erwartet die Zeilennummer der Notiz');
}

export function areaHandlers(services: Services): HandlerMap {
  return defineHandlers({
    /* Sorting comes from the index: newest note first — which area sits at the
       top of the screen is the screen's decision, not this channel's. */
    'areas:list': () => [...requireLists(services).areas()],

    /* Read from the file, not from the index: an external edit the watcher
       hasn't picked up yet must still be visible the moment the user expands a
       section. `verbatim`, because this is where the full note comes from. */
    'areas:notes': async ({ slug }) => {
      const area = await areaFor(services, slug);
      const doc = await readIndexed(services, area.path);
      return parseAreaNotes(doc.body, { lineOffset: doc.bodyLine, verbatim: true });
    },

    'areas:createNote': async ({ text, area, expectedHash }) => {
      const note = noteText(text);
      if (typeof area === 'string' && area.trim().length > 0) {
        return appendNote(services, (await areaFor(services, area)).path, note, expectedHash);
      }
      const path = areaPath(DEFAULT_AREA);
      if (await store(services).exists(path)) {
        return appendNote(services, path, note, expectedHash);
      }
      return createDefaultArea(services, note);
    },

    /* Created with `create`: if the file already exists, that's a conflict, not
       a second area with the same slug. */
    'areas:create': async ({ title }) => {
      const name = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim() : '';
      if (name.length === 0) throw fail('invalid', 'title: darf nicht leer sein');
      const doc = newAreaDocument(name, docLanguage(services));
      await store(services).create(doc.path, doc.frontmatter, doc.body);
      await settle(services, [doc.path], 'areas');
      /* From the file, not from the index: the answer is about the file that was
         just written, and the derivation is what the index will say too. */
      return derive(services, doc.path);
    },

    'areas:moveNote': async ({ from, to, line, expectedHash }) => {
      const at = requireLine(line);
      if (typeof expectedHash !== 'string' || expectedHash.length === 0) {
        throw fail('invalid', 'expectedHash: erwartet den Hash der Quelldatei');
      }
      const source = await areaFor(services, from);
      /* The target has to exist — creating it on the fly would create an area
         nobody asked for. `areas:create` is that path. */
      const target = await areaFor(services, to);
      if (source.path === target.path) {
        throw fail('invalid', `Quelle und Ziel sind derselbe Bereich: ${source.slug}`);
      }

      const doc = await readIndexed(services, source.path);
      /* The guard runs before the note is even looked up: with a stale hash, the
         line number in the request is about a file that no longer exists in that
         form. Nothing gets read out of it, nothing gets written. */
      if (doc.hash !== expectedHash) {
        throw fail('conflict', `${source.path} wurde zwischenzeitlich geändert`);
      }
      const block = requireNoteBlock(doc, at, source.path);
      const body = moveNoteBlock(doc.body, block);
      /* The hash matched, so this can only be a note whose block isn't in the
         body verbatim — the same answer as for an edited file: conflict, no
         write. */
      if (body === null) {
        throw fail('conflict', `die Notiz in Zeile ${at} steht so nicht in ${source.path}`);
      }

      /* The target is read before anything is written: a missing section, a
         changed file — better found now than after the source has already lost
         the note. */
      const into = await readIndexed(services, target.path);
      const result = await applyNoteMove(
        store(services),
        { path: source.path, body, previous: doc.body, hash: doc.hash },
        {
          path: target.path,
          section: areaSectionIn(into.body, 'notes', docLanguage(services)),
          hash: into.hash,
          block,
        },
      );
      await settle(services, [source.path, target.path], 'areas');
      return result;
    },
  });
}
