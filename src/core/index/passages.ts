/**
 * Lange Rumpftexte in zeilenverankerte Passagen schneiden.
 *
 * Ein einzelnes Dokument im Index kann zu lang sein, um es dem Modell oder der
 * Anzeige als Ganzes zu geben — dieselbe Ueberlegung wie in `wiki/chunk.ts`, aber
 * fuer den Index: hier zaehlt nicht die Kontextfenster-Grenze, sondern die Frage
 * "welche Datei, welche Zeile" (053). Deshalb tragen Passagen echte Dateizeilen
 * (`startLine`/`endLine`), keine Zeichen-Offsets.
 *
 * Kurze Rumpftexte bleiben eine einzige Passage. Laengere werden zeilenweise bis
 * knapp unter `PASSAGE_TARGET_CHARS` gepackt, moeglichst an einer Leerzeile
 * geschnitten — nie mitten in einer Zeile.
 */

/** Eine zusammenhaengende, zeilenverankerte Teilmenge eines Rumpftexts. */
export interface Passage {
  /** 1-basierte (oder wie vom Aufrufer uebergeben) Dateizeile, an der die Passage beginnt. */
  startLine: number;
  /** Dateizeile, an der die Passage endet — inklusive. */
  endLine: number;
  text: string;
}

/** Ab dieser Rumpflaenge wird ueberhaupt in mehrere Passagen geschnitten. */
export const PASSAGE_THRESHOLD_CHARS = 4000;

/** Zielgroesse einer Passage, wenn geschnitten wird. */
export const PASSAGE_TARGET_CHARS = 3000;

/**
 * Den Rumpftext in Passagen schneiden. `bodyLine` ist die Dateizeile, an der `body`
 * beginnt (siehe `bodyLineOf` in `build.ts`) — jede zurueckgegebene Passage traegt
 * echte Dateizeilen, keine Indizes relativ zum Rumpf.
 */
export function splitPassages(
  body: string,
  bodyLine: number,
  threshold: number = PASSAGE_THRESHOLD_CHARS,
): Passage[] {
  const lines = body.split('\n');
  if (body.length <= threshold) {
    return [{ startLine: bodyLine, endLine: bodyLine + lines.length - 1, text: body }];
  }

  const passages: Passage[] = [];
  let idx = 0;
  while (idx < lines.length) {
    const seed = lines[idx] as string;
    let len = seed.length;
    let last = idx;
    let lastBlank = seed === '' ? idx : -1;
    let next = idx + 1;
    while (next < lines.length) {
      const nextLine = lines[next] as string;
      const addLen = len + 1 + nextLine.length;
      if (addLen > PASSAGE_TARGET_CHARS) break;
      len = addLen;
      last = next;
      if (nextLine === '') lastBlank = next;
      next += 1;
    }
    // Wurde wegen der Zielgroesse abgebrochen (statt weil die Zeilen ausgingen) und
    // liegt eine Leerzeile im Puffer, dort statt am harten Limit schneiden — der
    // Absatz bleibt dann in einer Passage beisammen.
    const cutEnd = next < lines.length && lastBlank > idx && lastBlank < last ? lastBlank : last;
    passages.push({
      startLine: bodyLine + idx,
      endLine: bodyLine + cutEnd,
      text: lines.slice(idx, cutEnd + 1).join('\n'),
    });
    idx = cutEnd + 1;
  }
  return passages;
}
