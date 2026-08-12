/* The text work on the daily entry: reading sections, replacing the "Day"
 * section, writing the confirmed day close.
 *
 * Separate from `journal.ts`, because that's two responsibilities: the flow
 * lives there (who streams, who aborts, who brings the index up to date),
 * here is what exactly happens in the file.
 *
 * Two promises hold above everything else in this file:
 *
 * - **Only its own section gets touched.** Conversation, facts, and
 *   anything else the user has written in stay character-for-character
 *   intact.
 * - **No half-finished state.** If the day close fails partway through, what
 *   was written gets reverted; the undo path for a successful run comes out
 *   as a list of `vault:write` requests. `capture:apply` doesn't fit here —
 *   it would delete the "dump", here the daily entry, at the end.
 */

import { SECTION_FACTS, todoActions, todoBlock } from '@core/capture';
import {
  dayText,
  isSectionOf,
  journalSections,
  parseDialog,
  requireDay,
  sectionIn,
} from '@core/journal';
import type { JournalIndexView, JournalStore } from '@core/journal';
import { FsVaultStore, findSections, toVaultDoc } from '@core/vault';
import type { SectionRange } from '@core/vault';
import type {
  IpcRequest,
  JournalDayView,
  JournalFrontmatterFields,
  WriteRequest,
} from '@shared/ipc';
import type { DocLanguage, FilingAction, JournalDay, VaultDoc } from '@shared/types';
import { fail } from './errors';
import type { Services } from '../services';

/**
 * The store as the journal core needs it: `stat` and an `append` that
 * reports the section it created — the shell's narrow view doesn't know
 * those. `FsVaultStore` holds no state, so a second one costs nothing (same
 * spot as in `wiki-bridge.ts`).
 *
 * The **only** place where it gets created: journal, day close, and the
 * todos module should all take the same path into the same file.
 */
export function journalStore(services: Services): JournalStore {
  return new FsVaultStore(services.requireVaultRoot());
}

// ── Reading sections ─────────────────────────────────────────────────────────

/** The first section of this kind; several with the same name only happen by hand. */
function sectionOf(body: string, kind: 'day' | 'facts'): SectionRange | null {
  return findSections(body, 2).find((range) => isSectionOf(range.heading, kind)) ?? null;
}

function textIn(body: string, range: SectionRange): string {
  return body.split('\n').slice(range.start, range.end).join('\n').trim();
}

/**
 * The daily entry for display. If the "Day" heading is missing entirely (a
 * hand-written file), everything except conversation and facts counts as the
 * day's text — exactly what `dayText` reads, and exactly what `withDayText`
 * replaces. This way the screen never shows an empty day whose file actually
 * has prose in it.
 */
export function toView(found: { day: JournalDay; doc: VaultDoc }): JournalDayView {
  const body = found.doc.body;
  const day = sectionOf(body, 'day');
  const facts = sectionOf(body, 'facts');
  return {
    day: found.day,
    doc: found.doc,
    text: day === null ? dayText(body) : textIn(body, day),
    /* The turns come from the core (`parseDialog`, lenient about blocks
       added by hand) — the renderer receives them pre-built. */
    turns: parseDialog(body).map((turn) => ({ role: turn.role, text: turn.text, at: turn.at })),
    facts: facts === null ? '' : textIn(body, facts),
  };
}

/**
 * Replace the "Day" section with `text` — the editor's write path.
 */
export function withDayText(body: string, text: string, language: DocLanguage): string {
  const lines = body.split('\n');
  const block = text.replace(/\r\n/g, '\n').trim();
  const middle = block.length === 0 ? [''] : ['', block, ''];
  const range = sectionOf(body, 'day');
  if (range !== null) {
    return [...lines.slice(0, range.start), ...middle, ...lines.slice(range.end)].join('\n');
  }
  /* No "Day" heading: the loose lines before the first section are the day's
     text. The heading gets added so the file matches the format from
     docs/VAULT-FORMAT.md afterward. */
  const first = findSections(body, 2)[0]?.headingLine ?? lines.length;
  return [`## ${journalSections(language).day}`, ...middle, ...lines.slice(first)].join('\n');
}

// ── Executing the day close ──────────────────────────────────────────────────

/** What's there wins: whatever is already in the frontmatter survives every write. */
function union(existing: unknown, added: readonly string[]): string[] {
  const known = Array.isArray(existing)
    ? existing.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const seen = new Set(known.map((entry) => entry.trim().toLowerCase()));
  const merged = [...known];
  for (const entry of added) {
    const value = entry.trim();
    if (value.length === 0 || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    merged.push(value);
  }
  return merged;
}

/** The fields that actually get written. Empty lists change nothing. */
function fieldPatch(doc: VaultDoc, fields: JournalFrontmatterFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of ['people', 'projects', 'tags'] as const) {
    const values = fields[key] ?? [];
    if (values.length === 0) continue;
    const merged = union(doc.frontmatter[key], values);
    if (merged.length > 0) patch[key] = merged;
  }
  if (fields.mood !== null) patch['mood'] = fields.mood;
  if (fields.energy !== null) patch['energy'] = fields.energy;
  return patch;
}

/** The state before writing — the basis of the undo path. */
function previousFields(doc: VaultDoc, patch: Record<string, unknown>): Record<string, unknown> {
  const before: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const old = doc.frontmatter[key];
    /* A field that didn't exist before gets cleared: a frontmatter patch
       can't remove it, and an old value would be invented. */
    before[key] = old ?? (Array.isArray(value) ? [] : null);
  }
  return before;
}

/** Revert what this run has written. An error here hides nothing. */
async function revert(store: JournalStore, plan: readonly WriteRequest[]): Promise<void> {
  for (const entry of [...plan].reverse()) {
    try {
      await store.write(entry);
    } catch {
      continue;
    }
  }
}

/**
 * Read a target file; if it's missing, nothing gets written.
 *
 * Through the core (`toVaultDoc`): body and hash have to be computed the
 * same way as when writing, or the conflict protection would be a false
 * claim.
 */
async function readTarget(
  store: JournalStore,
  path: string,
): Promise<{ body: string; hash: string }> {
  const raw = await store.readText(path);
  if (raw === null) throw fail('not-found', `Zieldatei fehlt: ${path}`);
  const doc = toVaultDoc(path, raw, { modified: new Date().toISOString() });
  return { body: doc.body, hash: doc.hash };
}

/**
 * Write the confirmed day close: todos as checkboxes and the day's
 * frontmatter fields. Returns what was written and the undo path for it.
 */
export async function applyClose(
  store: JournalStore,
  index: JournalIndexView,
  language: DocLanguage,
  request: IpcRequest<'journal:applyClose'>,
): Promise<{ written: string[]; undo: WriteRequest[] }> {
  const day = await requireDay(store, request.date);
  const section = sectionIn(day.doc.body, 'facts', language) || SECTION_FACTS;
  const home: FilingAction = {
    target: 'journal',
    path: day.doc.path,
    section,
    content: todoBlock([]),
  };
  const projects = index.projects();
  /* The same spot the inbox also uses: only `core/capture/actions` knows
     what a checkbox line looks like and where a todo with a project belongs. */
  const actions = todoActions(
    home,
    request.todos,
    (slug) => projects.find((project) => project.slug === slug)?.path ?? null,
  );
  const patch = fieldPatch(day.doc, request.frontmatter);
  const undo: WriteRequest[] = [];
  const written: string[] = [];

  try {
    const own = actions.find((action) => action.path === day.doc.path) ?? null;
    if (own !== null || Object.keys(patch).length > 0) {
      const before: WriteRequest = {
        path: day.doc.path,
        body: day.doc.body,
        frontmatter: previousFields(day.doc, patch),
      };
      /* The hash the renderer read on opening — its own after that: the run
         must not get in its own way. */
      let hash = request.expectedHash ?? day.doc.hash;
      if (own !== null) {
        hash = (await store.append(day.doc.path, section, own.content, { expectedHash: hash }))
          .hash;
      }
      if (Object.keys(patch).length > 0) {
        hash = (await store.write({ path: day.doc.path, frontmatter: patch, expectedHash: hash }))
          .hash;
      }
      undo.push({ ...before, expectedHash: hash });
      written.push(day.doc.path);
    }

    for (const action of actions) {
      if (action.path === day.doc.path) continue;
      const target = await readTarget(store, action.path);
      const result = await store.append(action.path, action.section ?? section, action.content, {
        expectedHash: target.hash,
      });
      undo.push({ path: action.path, body: target.body, expectedHash: result.hash });
      written.push(action.path);
    }
  } catch (error) {
    /* No half-finished state: whatever was already written gets reverted. */
    await revert(store, undo);
    throw error;
  }
  /* The undo path is in reverse order — the renderer executes it exactly as
     it stands here. */
  return { written, undo: [...undo].reverse() };
}
