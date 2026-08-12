/**
 * Benannte Beziehungen zwischen zwei Seiten — `contradicts`, `supersedes`,
 * `extends` (docs/MODULE-SCHEMA.md, Abschnitt „Widersprueche").
 *
 * Ein benannter Widerspruch ist **kein Defekt**: er ist der gewuenschte Endzustand.
 * Beide Fassungen bleiben stehen, eine Notiz sagt, worin der Konflikt besteht.
 * Deshalb braucht der Pflegelauf an zwei Stellen dieselbe Frage: „ist dieser
 * Konflikt schon benannt?" — im Audit entscheidet sie ueber die Schwere, im Fix
 * darueber, ob es ueberhaupt etwas zu schreiben gibt.
 *
 * Gelesen wird beides: das Frontmatter und der Abschnitt „Widersprueche" im Rumpf,
 * in beiden Dokumentsprachen. Ein Vault, in dem jemand die Notiz von Hand
 * geschrieben hat, gilt genauso als benannt wie einer, in dem die App sie gesetzt hat.
 */

import type { DocLanguage } from '@shared/types';
import { asStringList, collapse } from '@core/index/text';
import { extractSections } from '@core/vault/doc';
import { pageRefOf, phrases } from '@core/wiki';

/** Frontmatter-Felder, die eine benannte Beziehung tragen. */
export const RELATION_FIELDS = ['contradicts', 'supersedes', 'extends'] as const;

/** Ueberschriften, unter denen benannte Widersprueche stehen (beide Sprachen). */
export const CONTRADICTION_HEADINGS: readonly string[] = [
  phrases('de').contradictions,
  phrases('en').contradictions,
];

/** Slug einer Wiki-Seite aus ihrem Pfad; `null`, wenn der Pfad keine Seite ist. */
export function pageSlugOf(path: string): string | null {
  return pageRefOf(path)?.slug ?? null;
}

/** Wort, mit dem ein nachgetragener Verweis beginnt — in der Dokumentsprache. */
const RELATED_WORD: Record<DocLanguage, string> = { de: 'Bezug', en: 'Related' };

/**
 * Die Zeile, mit der ein Verweis auf eine verwaiste Seite nachgetragen wird.
 * Angehaengt, nie eingesetzt: eine bestehende Nutzerzeile wird dabei nicht
 * umgeschrieben (VAULT-FORMAT.md, „Was die App niemals tut").
 */
export function relatedLine(slug: string, language: DocLanguage = 'de'): string {
  return `${RELATED_WORD[language]}: [[${slug}]]`;
}

/**
 * Die Zeile, mit der ein Widerspruch benannt wird — ein Listenpunkt fuer den
 * Abschnitt „Widersprueche". Sie loest nichts auf: beide Fassungen bleiben stehen.
 */
export function contradictionLine(
  slug: string,
  note: string,
  language: DocLanguage = 'de',
): string {
  return `- [[${slug}]] ${phrases(language).contradicts} ${collapse(note)}`;
}

/** Alle Slugs, die das Frontmatter als benannte Beziehung nennt. */
export function relationSlugs(frontmatter: Record<string, unknown>): string[] {
  const slugs: string[] = [];
  for (const field of RELATION_FIELDS) {
    for (const value of asStringList(frontmatter[field])) {
      const slug = value.includes('/') ? (value.split('/').pop() ?? value) : value;
      if (!slugs.includes(slug)) slugs.push(slug);
    }
  }
  return slugs;
}

/**
 * Nennt diese Seite den Konflikt mit `otherSlug` schon? Entweder im Frontmatter
 * oder als Wikilink im Abschnitt „Widersprueche".
 */
export function namesContradiction(
  doc: { frontmatter: Record<string, unknown>; body: string },
  otherSlug: string,
): boolean {
  if (relationSlugs(doc.frontmatter).includes(otherSlug)) return true;
  const sections = extractSections(doc.body);
  for (const [heading, text] of sections) {
    if (
      !CONTRADICTION_HEADINGS.some((known) => known.toLowerCase() === heading.trim().toLowerCase())
    ) {
      continue;
    }
    if (text.includes(`[[${otherSlug}]]`) || text.includes(`[[${otherSlug}|`)) return true;
  }
  return false;
}
