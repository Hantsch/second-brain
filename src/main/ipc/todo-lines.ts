/* Eine Checkbox-Zeile ändern, ohne den Rest der Datei anzufassen.

   Die Schreibseite dessen, was `core/index/todos` liest. Beide Seiten setzen
   docs/VAULT-FORMAT.md um — deshalb stehen die Marker-Muster hier ein zweites
   Mal: der Kern exportiert sie nicht, und ein Import quer durch die Schichten
   wäre teurer als diese Kopie. Wer das Format ändert, ändert beide Stellen.

   Grundsatz: **wortwörtlich**. Einrückung, Listenzeichen, Abstände und die
   Reihenfolge der Marker bleiben, wie der Nutzer sie geschrieben hat. Geändert
   wird genau das, was gefragt war. */

/* Kopf (`  - [`), Kästchen, Abstand, Rest — vier Teile, damit der Kopf
   unverändert zurückgeschrieben werden kann. */
const CHECKBOX = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([ xX])(\]\s*)(.*)$/;

/* Alles, was in einer Todo-Zeile Marker ist und nicht Text (VAULT-FORMAT.md). */
const MARKER_SCAN =
  /@(?:due|needed|done|created):\d{4}-\d{2}-\d{2}|@wait:(?:"[^"]+"|[^\s,;]+)|(?:^|\s)!{1,3}(?=\s|$)|(?:^|\s)#[\p{L}\p{N}][\p{L}\p{N}/_-]*/u;

/** Marker mit Datum, die diese Datei setzen und entfernen kann. */
export type DayMarker = 'due' | 'needed' | 'done';

/** Eine zerlegte Checkbox-Zeile. `head` und `gap` sind wortwörtlich. */
export interface CheckboxLine {
  head: string;
  checked: boolean;
  gap: string;
  /** Text samt Markern — alles hinter `] `. */
  rest: string;
}

/** Zerlegt eine Zeile, oder `null`, wenn dort keine Checkbox steht. */
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

/** Setzt die Zeile wieder zusammen. */
export function formatCheckboxLine(parts: CheckboxLine): string {
  return `${parts.head}${parts.checked ? 'x' : ' '}${parts.gap}${parts.rest}`;
}

/** Doppelte Leerzeichen, die beim Entfernen eines Markers entstehen, wegräumen. */
function tidy(rest: string): string {
  return rest.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, '');
}

function markerPattern(marker: DayMarker): RegExp {
  return new RegExp(`(?:^|[ \\t]+)@${marker}:\\d{4}-\\d{2}-\\d{2}`);
}

/**
 * Einen Datumsmarker setzen, ersetzen oder entfernen. `null` entfernt ihn.
 * Ein neuer Marker geht ans Ende der Zeile — dort ist er in Obsidian sichtbar
 * und stört keine bestehende Reihenfolge.
 */
export function setDayMarker(rest: string, marker: DayMarker, day: string | null): string {
  const pattern = markerPattern(marker);
  const found = pattern.exec(rest);
  if (day === null) {
    return found === null ? rest : tidy(rest.replace(pattern, ''));
  }
  if (found !== null) {
    /* Den Abstand vor dem Marker behalten: er gehört dem Nutzer. */
    const lead = (found[0] ?? '').replace(`@${marker}:`, '').replace(/\d{4}-\d{2}-\d{2}/, '');
    return rest.replace(pattern, `${lead}@${marker}:${day}`);
  }
  const base = tidy(rest);
  return base.length === 0 ? `@${marker}:${day}` : `${base} @${marker}:${day}`;
}

/**
 * Den Anzeigetext austauschen und alle Marker behalten. Der Text ist das, was
 * vor dem ersten Marker steht — genau die Aufteilung, die der Parser sieht.
 */
export function replaceTodoText(rest: string, text: string): string {
  const found = MARKER_SCAN.exec(rest);
  const markers = found === null ? '' : rest.slice(found.index).trim();
  const next = text.replace(/\s+/g, ' ').trim();
  if (markers.length === 0) return next;
  return next.length === 0 ? markers : `${next} ${markers}`;
}
