/**
 * The two sections of an area file (docs/VAULT-FORMAT.md): the notes section
 * holds dated entries, the todos section holds the checkboxes.
 *
 * Two things this file decides, and only this file:
 *
 * - **What the heading is called.** In the document language — but only when the
 *   file has nothing to say about it yet.
 * - **Which heading is used when the file already has one.** If the file has
 *   "## Notizen" and the document language has since become English, content is
 *   appended below it rather than creating a second section "Notes". The user's
 *   file sets the tone, not the setting.
 *
 * Reading tolerates both languages, compared folded. That is not a nicety: the
 * filing path has always written `SECTION_NOTES` ("Notizen") while
 * docs/VAULT-FORMAT.md shows "## Notes". An area whose heading isn't recognized
 * would lose every note it holds, and lose it silently — no error, just an empty
 * screen. Hence one alias list for both spellings, and nothing hardcoded
 * anywhere else.
 */

import type { DocLanguage } from '@shared/types';
import { sectionKindOf, sectionNameFor, type SectionKind } from '@core/vault/section-names';
import { findSections } from '@core/vault/sections';
import type { SectionRange } from '@core/vault/sections';

/** Heading level of an area's sections; entries below them are one level deeper. */
export const AREA_SECTION_LEVEL = 2;

/** Heading level of a single entry inside a section: `### YYYY-MM-DD`. */
export const AREA_ENTRY_LEVEL = AREA_SECTION_LEVEL + 1;

/** Which of the two sections is meant. */
export type AreaSectionKind = Extract<SectionKind, 'notes' | 'todos'>;

/** The headings of an area file in one language. */
export type AreaSections = Record<AreaSectionKind, string>;

/* Sourced from the shared table (`core/vault/section-names`) — two versions of
   these names would mean two versions of docs/VAULT-FORMAT.md. "Todos" is the
   same word in both languages; that is the vault format, not an oversight. */
function sectionsFor(docLanguage: DocLanguage): AreaSections {
  return {
    notes: sectionNameFor('notes', docLanguage),
    todos: sectionNameFor('todos', docLanguage),
  };
}

const HEADINGS: Record<DocLanguage, AreaSections> = {
  de: sectionsFor('de'),
  en: sectionsFor('en'),
};

/** The headings in this document language. */
export function areaSections(docLanguage: DocLanguage = 'de'): AreaSections {
  return HEADINGS[docLanguage] ?? HEADINGS.de;
}

/** Is this heading the named section? */
export function isAreaSectionOf(heading: string, kind: AreaSectionKind): boolean {
  return sectionKindOf(heading) === kind;
}

/**
 * Every section of this kind, in file order. Plural on purpose: a hand-edited
 * file may carry "## Notizen" twice, and both halves are the user's content.
 */
export function areaSectionRanges(body: string, kind: AreaSectionKind): SectionRange[] {
  return findSections(body, AREA_SECTION_LEVEL).filter((range) =>
    isAreaSectionOf(range.heading, kind),
  );
}

/**
 * The heading content gets appended under: the existing one if there is one,
 * otherwise the document language's.
 */
export function areaSectionIn(
  body: string,
  kind: AreaSectionKind,
  docLanguage: DocLanguage = 'de',
): string {
  const found = areaSectionRanges(body, kind)[0];
  return found?.heading.trim() ?? areaSections(docLanguage)[kind];
}
