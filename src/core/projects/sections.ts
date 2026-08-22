/**
 * The notes heading of a project file (docs/VAULT-FORMAT.md). A project's notes
 * land under "## Notizen" or "## Notes" depending on the document language — but
 * the language only decides when the file has neither heading yet. If the file
 * already has one, content is appended below it, so a document-language switch
 * never orphans notes already filed under the other spelling.
 *
 * This is the same rule `src/core/areas/sections.ts` applies to areas, reused here
 * via the generic `headingFor` in `src/core/vault/sections.ts` rather than copied —
 * `src/core/areas/` itself stays untouched to avoid regression risk on that write
 * path (see docs/requirements/003-project-notes-and-waiting-on.md, Decisions).
 */

import type { DocLanguage } from '@shared/types';
import { sectionHeadingIn } from '@core/vault/section-names';

/**
 * The heading a new note is appended under: whichever of "Notizen" / "Notes" is
 * already in the file, or the document language's word when the file has neither.
 *
 * Sourced from the shared table (`core/vault/section-names`) — the filing path and
 * the hand-written note path must agree on the same word, or a fresh file would
 * grow two "notes" sections depending on which path wrote first.
 */
export function projectNotesHeading(body: string, docLanguage: DocLanguage = 'de'): string {
  return sectionHeadingIn(body, 'notes', docLanguage);
}
