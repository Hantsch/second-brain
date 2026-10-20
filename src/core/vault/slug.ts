/**
 * Namen: aus einem Titel wird ein Dateiname. Klein, ASCII, Bindestriche — so wie
 * VAULT-FORMAT.md es verlangt, damit der Vault auf jedem System und in jedem Editor
 * gleich heisst.
 *
 * Reine Zeichenkettenarbeit, ohne Node-Importe.
 */

/* Deutsche Umlaute werden ausgeschrieben, nicht entschaerft: 'Groesse' statt 'grosse'. */
const TRANSLITERATION: [RegExp, string][] = [
  [/ä/g, 'ae'],
  [/ö/g, 'oe'],
  [/ü/g, 'ue'],
  [/ß/g, 'ss'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/ø/g, 'oe'],
  [/å/g, 'aa'],
  [/þ/g, 'th'],
  [/ð/g, 'd'],
  [/đ/g, 'd'],
  [/ł/g, 'l'],
  [/&/g, '-und-'],
];

/** Wird benutzt, wenn nach dem Saeubern nichts uebrig bleibt. */
export const FALLBACK_SLUG = 'notiz';

/**
 * Hoechstlaenge eines Slugs. Oeffentlich, weil jeder, der eine Nummer oder einen
 * Zeitstempel anhaengt, vorher Platz dafuer lassen muss — `slugify` kappt sonst
 * genau das Unterscheidungsmerkmal wieder weg.
 */
export const MAX_SLUG_LENGTH = 60;

/**
 * Dateinamen-taugliche Kurzform: klein, ASCII, Bindestriche, Umlaute ausgeschrieben.
 * Die Laenge wird an einer Bindestrich-Grenze gekappt.
 */
export function slugify(input: string, maxLength = MAX_SLUG_LENGTH): string {
  let text = (input ?? '').normalize('NFC').toLowerCase();
  for (const [pattern, replacement] of TRANSLITERATION) {
    text = text.replace(pattern, replacement);
  }
  // Restliche Diakritika (é, ç, ñ ...) auf den Grundbuchstaben zurueckfuehren.
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  text = text
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  if (text.length > maxLength) {
    const cut = text.slice(0, maxLength);
    const lastDash = cut.lastIndexOf('-');
    text = (lastDash > maxLength / 2 ? cut.slice(0, lastDash) : cut).replace(/-$/, '');
  }
  return text.length > 0 ? text : FALLBACK_SLUG;
}

/**
 * Freier Slug: haengt bei Kollision '-2', '-3', ... an.
 * `taken` ist entweder eine Liste belegter Slugs oder eine Pruef-Funktion.
 */
export function uniqueSlug(
  base: string,
  taken: Iterable<string> | ((candidate: string) => boolean),
): string {
  const isTaken =
    typeof taken === 'function'
      ? taken
      : (
          (set) => (candidate: string) =>
            set.has(candidate)
        )(new Set(taken));
  const slug = slugify(base);
  if (!isTaken(slug)) return slug;
  for (let suffix = 2; suffix <= 9999; suffix += 1) {
    const candidate = `${slug}-${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  return `${slug}-${Date.now()}`;
}

/**
 * Saeubert ein Segment, ohne die Gross-/Kleinschreibung anzutasten. Fuer Bezeichner,
 * die von aussen kommen und exakt bleiben muessen — etwa eine YouTube-Video-ID.
 */
export function sanitizeSegment(input: string): string {
  const cleaned = (input ?? '')
    .normalize('NFC')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return cleaned.length > 0 ? cleaned : FALLBACK_SLUG;
}
