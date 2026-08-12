/* Die Stelle, an der ein Widerspruch steht — und die ehrliche Auskunft, wenn es
   sie nicht gibt.

   Ein Widerspruch wird laut docs/MODULE-SCHEMA.md unter der Überschrift
   „Widersprüche" benannt (auf Englisch „Contradictions" — dieselben Wörter wie in
   `core/wiki/text.ts`). Gibt es den Abschnitt, ist er die Stelle. Gibt es ihn
   nicht, zeigt die Karte den Anfang der Seite und sagt dazu, dass die Stelle in
   der Datei nicht benannt ist. Einen Ausschnitt als „die widersprechende Stelle"
   zu verkaufen wäre eine Behauptung über einen Text, den niemand geprüft hat. */

/** Überschriften, unter denen ein benannter Widerspruch steht (beide Sprachen). */
const HEADINGS: readonly string[] = ['widersprüche', 'widerspruche', 'contradictions'];

/** So viel Text zeigt der Ausschnitt, wenn es keinen Abschnitt gibt. */
export const EXCERPT_CHARS = 420;

export interface Passage {
  text: string;
  /** Stammt der Text aus dem Abschnitt „Widersprüche"? */
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
 * Der Abschnitt „Widersprüche" eines Seitenrumpfs, sonst der Anfang der Seite.
 * `named` sagt, welches von beiden — die Karte beschriftet danach.
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

  /* Ohne Abschnitt: der Anfang des Rumpfs, ohne die Überschriften. */
  const plain = lines
    .filter((line) => !/^#{1,6}\s+/.test(line))
    .join('\n')
    .trim();
  return { text: trimTo(plain, EXCERPT_CHARS), named: false };
}
