/* Get a section from a Markdown body.

   The headings of a project file are format, not UI: docs/VAULT-FORMAT.md
   calls them "Stand", "Todos", and "Notizen", independent of the UI language.
   That's why they appear here as constants and not as a translation.

   The renderer gets the body via `projects:get` and parses it itself — it
   never touches a file and doesn't know the core. */

export const SECTION_STATE = 'Stand';
export const SECTION_TODOS = 'Todos';
export const SECTION_NOTES = 'Notizen';

/** The other spelling of the notes heading — see `notesSectionOf` below. */
const SECTION_NOTES_EN = 'Notes';

const HEADING = /^(#{2,6})\s+(.+?)\s*$/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * The text under `## <heading>` up to the next heading of the same level.
 * Lines inside code fences don't count as a heading — that's example content.
 */
export function sectionOf(body: string, heading: string): string {
  const wanted = heading.trim().toLowerCase();
  const out: string[] = [];
  let inFence = false;
  let depth = 0;
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      if (depth > 0) out.push(line);
      continue;
    }
    const match = inFence ? null : HEADING.exec(line);
    if (match !== null) {
      const level = (match[1] ?? '').length;
      if (depth > 0 && level <= depth) break;
      if (depth === 0 && (match[2] ?? '').trim().toLowerCase() === wanted) {
        depth = level;
        continue;
      }
    }
    if (depth > 0) out.push(line);
  }
  return out.join('\n').trim();
}

/** Line index of the first heading whose text matches `heading`, or `null` if absent. */
function firstHeadingLine(body: string, heading: string): number | null {
  const wanted = heading.trim().toLowerCase();
  let inFence = false;
  const lines = body.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (match !== null && (match[2] ?? '').trim().toLowerCase() === wanted) return index;
  }
  return null;
}

/**
 * The notes section under whichever spelling of the heading — "Notizen" or
 * "Notes" (docs/VAULT-FORMAT.md) — appears FIRST in the file. This has to be
 * the same rule `headingFor` in `src/core/vault/sections.ts` uses for the
 * write path (via `projectNotesHeading` in `src/core/projects/sections.ts`):
 * read and write must agree on which heading is "the" notes section, or a
 * note written under one spelling could sit under a heading the panel never
 * looks at (a file carrying both), or the panel could quietly pick a
 * different one than the write path chose the moment there's a real
 * ambiguity. The renderer can't import core (CLAUDE.md, guardrail 5), so
 * this re-implements "first match wins" as plain parsing over the body
 * already in hand, rather than "Notizen wins whenever it's non-empty".
 */
export function notesSectionOf(body: string): string {
  const de = firstHeadingLine(body, SECTION_NOTES);
  const en = firstHeadingLine(body, SECTION_NOTES_EN);
  if (de === null && en === null) return '';
  const heading = en === null || (de !== null && de <= en) ? SECTION_NOTES : SECTION_NOTES_EN;
  return sectionOf(body, heading);
}

/** How many dated entries (`### …`) a section holds. */
export function datedEntries(section: string): number {
  let count = 0;
  let inFence = false;
  for (const line of section.split('\n')) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^###\s+/.test(line)) count += 1;
  }
  return count;
}
