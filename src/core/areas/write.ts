/**
 * Pure write-side helpers for area files (`areas/<slug>.md`, docs/VAULT-FORMAT.md).
 *
 * Everything here is a string transform — no store, no IPC. The one write path
 * that touches a note's text lives in `core/capture/filing.ts` (`filingBlock`,
 * `removeBlock`); this file reuses those exactly rather than growing a second
 * copy of "### YYYY-MM-DD\n\n<text>" that could drift from the filing path's.
 * The IPC handler that actually moves a note between files (D4) is one layer up.
 */

import { filingBlock, removeBlock } from '@core/capture';
import { serialize } from '@core/vault/frontmatter';
import { areaPath, isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { appendToSection } from '@core/vault/sections';
import type { DocLanguage } from '@shared/types';
import { areaSectionIn, areaSections } from './sections';

/**
 * A freshly created area file: path via `areaPath`, content ready to write.
 *
 * `frontmatter` and `body` are the same document taken apart, because that is
 * how it gets created: `VaultStore.create(path, frontmatter, body)` wants the
 * two halves, and re-parsing the serialized `content` to get them back would be
 * a second reading of a document this function just built itself.
 */
export interface NewAreaDocument {
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/**
 * A brand-new `areas/<slug>.md`: frontmatter plus its two managed sections,
 * both empty. `scope` defaults to `private` — nothing about a freshly created
 * area is known to be work-scoped yet; the user can change it later.
 *
 * `now` defaults to the current time but takes an override so this stays a pure
 * function in tests, mirroring `filingBlock`'s `at` parameter.
 */
export function newAreaDocument(
  title: string,
  docLanguage: DocLanguage,
  now: DateLike = new Date(),
): NewAreaDocument {
  const sections = areaSections(docLanguage);
  const frontmatter = {
    type: 'area',
    title,
    created: isoDay(now),
    scope: 'private',
    tags: [],
    lang: docLanguage,
  };
  const body = [`## ${sections.notes}`, '', `## ${sections.todos}`, ''].join('\n');
  return { path: areaPath(title), content: serialize(frontmatter, body), frontmatter, body };
}

/**
 * The same area file with a first note already in its notes section — one write
 * instead of create-then-append, so a brand-new area never exists on disk in a
 * half-filled state.
 *
 * Placed through `appendToSection`, the exact routine `VaultStore.append` uses:
 * the first note in a file has to land the same way the second one will, or the
 * two write paths would drift apart on spacing alone.
 */
export function withAreaNote(doc: NewAreaDocument, block: string): NewAreaDocument {
  /* The heading comes from the document itself — it has one, so the document
     language is not asked again here. */
  const body = appendToSection(doc.body, areaSectionIn(doc.body, 'notes'), block).content;
  return { ...doc, body, content: serialize(doc.frontmatter, body) };
}

/**
 * The block a note lands in an area file as. Delegates to `filingBlock` so an
 * area note and a filed dump are built by the exact same rule.
 */
export function areaNoteBlock(content: string, at?: DateLike): string {
  return filingBlock(content, at);
}

/**
 * The removal half of moving a note out of an area file. Delegates to
 * `removeBlock`: `null` when the block isn't there verbatim, because the user
 * has edited it since.
 */
export function moveNoteBlock(body: string, block: string): string | null {
  return removeBlock(body, block);
}
