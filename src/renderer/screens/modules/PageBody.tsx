/* Make a wiki page readable: Markdown to React, wikilinks as buttons.

   Rendering goes through `components/markdown-render.tsx` — the same
   implementation as the answer in the ask screen. What's defined here is
   only what a wikilink means on a wiki page: `[[slug]]` doesn't lead onto
   the web, it leads into the same view. A target that doesn't exist is
   marked as missing instead of silently slipping through as plain text —
   the gardener run depends on that, and the reader sees immediately that a
   page is missing.

   Raw paths stay text here: a wiki page links via wikilinks, and a path in
   running text is usually the way to the raw source under `raw/`. */

import { useT } from '../../i18n';
import { renderMarkdown } from '../../components/markdown-render';
import { WikiRef } from './WikiRef';

export interface PageBodyProps {
  body: string;
  /** Does this target page exist? Decides "missing". */
  exists: (target: string) => boolean;
  /** Click on a wikilink. */
  onOpen: (target: string) => void;
}

export function PageBody({ body, exists, onOpen }: PageBodyProps) {
  const t = useT();
  const nodes = renderMarkdown(body, {
    wikilink: (target, label, key) => (
      <WikiRef
        key={key}
        target={target}
        label={label.length > 0 ? label : target}
        missing={!exists(target)}
        onOpen={onOpen}
      />
    ),
  });
  if (nodes.length === 0) return <p className="sb-panel-empty">{t('page.empty')}</p>;
  return <div className="sb-md">{nodes}</div>;
}
