/* Eine Wiki-Seite lesbar machen: Markdown zu React, Wikilinks als Knöpfe.

   Gerendert wird über `components/markdown-render.tsx` — dieselbe Fassung wie die
   Antwort im Fragen-Screen. Hier steht nur, was ein Wikilink auf einer Wiki-Seite
   bedeutet: `[[slug]]` führt nicht ins Web, sondern in dieselbe Ansicht. Ein Ziel,
   das es nicht gibt, wird als fehlend ausgezeichnet statt still als Text
   durchzurutschen — daraus lebt der Pflegelauf, und der Leser sieht sofort, dass
   da eine Seite fehlt.

   Rohe Pfade bleiben hier Text: eine Wiki-Seite verweist über Wikilinks, und ein
   Pfad im Fließtext ist meist der Weg zur Rohquelle unter `raw/`. */

import { useT } from '../../i18n';
import { renderMarkdown } from '../../components/markdown-render';
import { WikiRef } from './WikiRef';

export interface PageBodyProps {
  body: string;
  /** Gibt es diese Zielseite? Entscheidet über „fehlt". */
  exists: (target: string) => boolean;
  /** Klick auf einen Wikilink. */
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
