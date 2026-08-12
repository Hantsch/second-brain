/* Einen Abschnitt aus einem Markdown-Rumpf holen.

   Die Überschriften einer Projektdatei sind Format, nicht Oberfläche: sie heißen
   in docs/VAULT-FORMAT.md „Stand", „Todos" und „Notizen", unabhängig von der
   Sprache der Oberfläche. Deshalb stehen sie hier als Konstanten und nicht als
   Übersetzung.

   Der Renderer bekommt den Rumpf über `projects:get` und zerlegt ihn selbst — er
   fasst keine Datei an und kennt den Kern nicht. */

export const SECTION_STATE = 'Stand';
export const SECTION_TODOS = 'Todos';
export const SECTION_NOTES = 'Notizen';

const HEADING = /^(#{2,6})\s+(.+?)\s*$/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/**
 * Der Text unter `## <heading>` bis zur nächsten Überschrift derselben Ebene.
 * Zeilen in Code-Zäunen zählen nicht als Überschrift — dort steht ein Beispiel.
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

/** Wie viele datierte Einträge (`### …`) ein Abschnitt trägt. */
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
