/**
 * The line a page gets in the overview's "Pages" section.
 *
 * The digestion no longer writes there; only the gardener's orphan fix does, and it
 * must write the same shape the user sees elsewhere.
 */

/** Der Eintrag einer Seite im Abschnitt „Seiten" — auch die Form, die die Pflege dort schreibt. */
export function overviewEntryLine(page: { slug: string; title: string }): string {
  return `- [[${page.slug}]] — ${page.title}`;
}
