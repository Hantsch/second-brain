/* Release notes markdown as React nodes. Shared by the installed version's
   notes and the notes of a pending update, so both are rendered the same way.

   No vault references: a `[[x]]` or a path in a changelog is plain text here,
   and raw HTML in the notes stays text — nothing from a notes string can
   become markup. */

import { renderMarkdown } from '../../../components/markdown-render';
import type { MarkdownRefs } from '../../../components/markdown-render';

const NO_REFS: MarkdownRefs = { wikilink: () => null };

/** Added to each markdown heading depth, clamped to h2-h6: `#` and `##` both render as h2. */
const HEADING_OFFSET = 0;

export function ReleaseNotesBody({ markdown }: { markdown: string }) {
  return (
    <div className="sb-md" data-testid="release-notes">
      {renderMarkdown(markdown, NO_REFS, HEADING_OFFSET)}
    </div>
  );
}
