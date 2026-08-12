/* Ein Verweis auf eine Wiki-Seite: im Text, in den Belegen, in „Verlinkt hierher".

   Ein Knopf, kein Link: das Ziel liegt in derselben Ansicht, nicht im Web. Ein
   Ziel, das es nicht gibt, sagt das ausdrücklich — sichtbar (Marke), hörbar
   (`aria-label`) und im Tooltip. Ein kaputter Wikilink, der wie ein guter
   aussieht, ist der Anfang von Knowledge-Rot. */

import { useT } from '../../i18n';

export interface WikiRefProps {
  /** Ziel, wie es in der Datei steht: `slug` oder `modul/slug`. */
  target: string;
  /** Anzeigetext; Vorgabe ist das Ziel. */
  label?: string;
  /** Die Zielseite fehlt. */
  missing?: boolean;
  onOpen: (target: string) => void;
}

export function WikiRef({ target, label, missing = false, onOpen }: WikiRefProps) {
  const t = useT();
  const name = t(missing ? 'wiki.link.missing' : 'wiki.link.open', { target });
  return (
    <button
      type="button"
      className={`sb-wikilink${missing ? ' sb-wikilink--missing' : ''}`}
      title={missing ? name : undefined}
      aria-label={name}
      onClick={() => onOpen(target)}
    >
      {label === undefined || label.length === 0 ? target : label}
      {missing ? <span className="sb-wikilink-mark">{t('wiki.link.missingMark')}</span> : null}
    </button>
  );
}
