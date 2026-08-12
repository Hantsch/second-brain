/* Change a checkbox line without touching the rest of the file.

   The write side of what `core/index/todos` reads. Both sides implement
   docs/VAULT-FORMAT.md — that's why the marker patterns appear here a second
   time: the core doesn't export them, and an import across the layers would
   be more expensive than this copy. Anyone who changes the format changes
   both places.

   Principle: **verbatim**. Indentation, list markers, spacing, and the order
   of markers stay exactly as the user wrote them. Only what was actually
   requested gets changed. */

/* Head (`  - [`), checkbox, gap, rest — four parts, so the head can be
   written back unchanged. */
const CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s*)(.*)$/;

/* Everything in a todo line that's a marker and not text (VAULT-FORMAT.md). */
const MARKER_SCAN =
  /@(?:due|needed|done|created):\d{4}-\d{2}-\d{2}|@wait:(?:"[^"]+"|[^\s,;]+)|(?:^|\s)!{1,3}(?=\s|$)|(?:^|\s)#[\p{L}\p{N}][\p{L}\p{N}/_-]*/u;

/** Date markers that this file can set and remove. */
export type DayMarker = 'due' | 'needed' | 'done';

/** A parsed checkbox line. `head` and `gap` are verbatim. */
export interface CheckboxLine {
  head: string;
  checked: boolean;
  gap: string;
  /** Text including markers — everything after `] `. */
  rest: string;
}

/** Parses a line, or `null` if there's no checkbox there. */
export function parseCheckboxLine(line: string): CheckboxLine | null {
  const match = CHECKBOX.exec(line);
  if (match === null) return null;
  return {
    head: match[1] ?? '',
    checked: (match[2] ?? ' ') !== ' ',
    gap: match[3] ?? '] ',
    rest: match[4] ?? '',
  };
}

/** Reassembles the line. */
export function formatCheckboxLine(parts: CheckboxLine): string {
  return `${parts.head}${parts.checked ? 'x' : ' '}${parts.gap}${parts.rest}`;
}

/** Cleans up double spaces left behind when a marker is removed. */
function tidy(rest: string): string {
  return rest.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '');
}

function markerPattern(marker: DayMarker): RegExp {
  return new RegExp(`(?:^|[ \\t]+)@${marker}:\\d{4}-\\d{2}-\\d{2}`);
}

/**
 * Set, replace, or remove a date marker. `null` removes it. A new marker
 * goes to the end of the line — there it's visible in Obsidian and doesn't
 * disturb any existing order.
 */
export function setDayMarker(rest: string, marker: DayMarker, day: string | null): string {
  const pattern = markerPattern(marker);
  const found = pattern.exec(rest);
  if (day === null) {
    return found === null ? rest : tidy(rest.replace(pattern, ''));
  }
  if (found !== null) {
    /* Keep the spacing before the marker: it belongs to the user. */
    const lead = (found[0] ?? '').replace(`@${marker}:`, '').replace(/\d{4}-\d{2}-\d{2}/, '');
    return rest.replace(pattern, `${lead}@${marker}:${day}`);
  }
  const base = tidy(rest);
  return base.length === 0 ? `@${marker}:${day}` : `${base} @${marker}:${day}`;
}

/**
 * Swap out the display text and keep all markers. The text is whatever
 * comes before the first marker — exactly the split the parser sees.
 */
export function replaceTodoText(rest: string, text: string): string {
  const found = MARKER_SCAN.exec(rest);
  const markers = found === null ? '' : rest.slice(found.index).trim();
  const next = text.replace(/\s+/g, ' ').trim();
  if (markers.length === 0) return next;
  return next.length === 0 ? markers : `${next} ${markers}`;
}
