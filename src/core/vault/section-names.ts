/**
 * The one table of section headings the whole vault agrees on, across both
 * document languages (docs/VAULT-FORMAT.md).
 *
 * Journal, areas, projects and capture each used to keep their own
 * per-language heading and their own folded alias list. That meant four
 * places that had to agree on the spelling of "Notizen"/"Notes" — and four
 * places a new kind or a typo'd alias could quietly drift apart. This module
 * is the single source: one enum of kinds, one per-language name table, one
 * folded alias list, reused by every module that decides which heading a
 * piece of content lands under.
 *
 * `capture/` may not import from `journal/` (journal already sources
 * `SECTION_DAY`/`SECTION_FACTS` from capture) — so this table sits below both,
 * in `core/vault/`, where neither direction creates a cycle.
 */

import type { DocLanguage } from '@shared/types';
import { fold } from '@core/index/text';
import { headingFor } from './sections';

/** Every section kind used anywhere in the vault. Not every module uses all of them. */
export type SectionKind =
  'notes' | 'todos' | 'state' | 'day' | 'facts' | 'dialogue' | 'patterns' | 'open' | 'directives';

/** The headings of one document language. */
export type SectionNames = Record<SectionKind, string>;

/*
 * "Todos" is the same word in both languages — that is the vault format
 * (docs/VAULT-FORMAT.md), not an oversight left for this story to fix.
 */
const NAMES: Record<DocLanguage, SectionNames> = {
  de: {
    notes: 'Notizen',
    todos: 'Todos',
    state: 'Stand',
    day: 'Tag',
    facts: 'Fakten',
    dialogue: 'Gespräch',
    patterns: 'Muster',
    open: 'Offen',
    directives: 'Direktiven',
  },
  en: {
    notes: 'Notes',
    todos: 'Todos',
    state: 'Status',
    day: 'Day',
    facts: 'Facts',
    dialogue: 'Conversation',
    patterns: 'Patterns',
    open: 'Open',
    directives: 'Directives',
  },
};

/**
 * Headings that count as the same section, compared folded (`core/index/text`'s
 * `fold`) — so "Notizen" and "Notes", or "Gespräch" and "Gespraech", address the
 * one section a file has.
 */
const ALIASES: Record<SectionKind, readonly string[]> = {
  notes: ['notizen', 'notes'],
  todos: ['todos'],
  /* "State" alongside "Stand"/"Status": the read side accepted it before this
     table existed (`overview/status.ts`), and a file already carrying
     "## State" must keep being recognized. */
  state: ['stand', 'status', 'state'],
  day: ['tag', 'day'],
  facts: ['fakten', 'facts'],
  dialogue: ['gespraech', 'conversation'],
  patterns: ['muster', 'patterns'],
  open: ['offen', 'open'],
  directives: ['direktiven', 'directives'],
};

/** The heading of this kind, in this document language. */
export function sectionNameFor(kind: SectionKind, docLanguage: DocLanguage = 'de'): string {
  return (NAMES[docLanguage] ?? NAMES.de)[kind];
}

/** Which section kind this heading names, or `null` if it isn't one of them. */
export function sectionKindOf(heading: string): SectionKind | null {
  const folded = fold(heading.trim());
  for (const kind of Object.keys(ALIASES) as SectionKind[]) {
    if (ALIASES[kind].includes(folded)) return kind;
  }
  return null;
}

/**
 * The heading a piece of content of this kind gets appended under: whichever
 * spelling is already in the file, or the document language's word when the
 * file has neither yet. Built on the generic `headingFor` (`core/vault/sections`),
 * so "which heading wins when a file already has one" stays one rule.
 */
export function sectionHeadingIn(
  body: string,
  kind: SectionKind,
  docLanguage: DocLanguage = 'de',
): string {
  return headingFor(body, [...ALIASES[kind]], sectionNameFor(kind, docLanguage));
}
