/* Get a section from a Markdown body.

   The headings of a project file are format, not UI: docs/VAULT-FORMAT.md
   calls them "Stand", "Todos", and "Notizen", independent of the UI language.
   That's why they appear here as constants and not as a translation.

   The renderer gets the body via `projects:get` and parses it itself — it
   never touches a file and doesn't know the core. */

export const SECTION_STATE = 'Stand';
export const SECTION_TODOS = 'Todos';
export const SECTION_NOTES = 'Notizen';

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
