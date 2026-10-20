/* The passage where a contradiction is stated — and the honest answer when
   there isn't one.

   Per docs/MODULE-SCHEMA.md, a contradiction is named under the heading
   "Widersprüche" (English "Contradictions" — the same words as in
   `core/wiki/text.ts`). If the section exists, it's the passage. If it
   doesn't, the card shows the beginning of the page and states that the
   passage isn't named in the file. Selling an excerpt as "the contradicting
   passage" would be a claim about text no one has checked. */

/** Headings under which a named contradiction appears (both languages). */
const HEADINGS: readonly string[] = ['widersprüche', 'widerspruche', 'contradictions'];

/** How much text the excerpt shows when there's no section. */
export const EXCERPT_CHARS = 420;

export interface Passage {
  text: string;
  /** Does the text come from the "Contradictions" section? */
  named: boolean;
}

function trimTo(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = cut.lastIndexOf(' ');
  return `${(stop > max * 0.6 ? cut.slice(0, stop) : cut).trimEnd()} …`;
}

/**
 * The "Contradictions" section of a page body, otherwise the beginning of the
 * page. `named` says which of the two — the card labels accordingly.
 */
export function contradictionPassage(body: string): Passage {
  const lines = body.split(/\r?\n/);
  const collected: string[] = [];
  let inside = false;
  for (const line of lines) {
    const heading = /^(#{2,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      const title = (heading[2] ?? '').trim().toLowerCase();
      if (inside) break;
      inside = HEADINGS.includes(title);
      continue;
    }
    if (inside) collected.push(line);
  }
  const section = collected.join('\n').trim();
  if (section.length > 0) return { text: trimTo(section, EXCERPT_CHARS), named: true };

  /* Without a section: the beginning of the body, without the headings. */
  const plain = lines
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .join('\n')
    .trim();
  return { text: trimTo(plain, EXCERPT_CHARS), named: false };
}
