/* Die Belege einer Antwort — das Herzstück des Fragens.

   Eine Antwort ohne Beleg ist eine Behauptung. Deshalb steht unter jeder Antwort
   diese Liste: Nummer, Titel, wortwörtlicher Ausschnitt, Dateipfad mit Zeile in
   Mono. Die Nummer ist dieselbe wie die Marke `[1]` im Antworttext; ein Klick auf
   die Marke springt hierher und hebt den Beleg hervor.

   Markiert werden die Wörter der Frage im Zitat — dieselbe Hervorhebung wie in der
   Volltextsuche. Ohne Modell ist diese Liste das Ergebnis, nicht die Zugabe. */

import type { ReactNode } from 'react';
import type { Citation } from '@shared/types';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';
import { plainExcerpt } from './markdown-render';

/** Kürzeste Länge eines Wortes, das im Zitat markiert wird. */
const MIN_TERM = 4;

/**
 * Wörter, die in jeder zweiten Frage stehen. Sie zu markieren macht aus dem Zitat
 * einen Flickenteppich und verdeckt, was wirklich getroffen hat — dieselbe
 * Überlegung wie bei den Titel-Stoppwörtern in `core/capture/mentions`.
 */
const STOPWORDS = new Set([
  'aber',
  'about',
  'alle',
  'allem',
  'allen',
  'aller',
  'auch',
  'been',
  'dass',
  'dein',
  'deine',
  'dies',
  'diese',
  'diesem',
  'diesen',
  'dieser',
  'does',
  'durch',
  'eine',
  'einen',
  'einer',
  'from',
  'have',
  'hier',
  'know',
  'mein',
  'meine',
  'nach',
  'nicht',
  'oder',
  'sich',
  'sind',
  'that',
  'them',
  'then',
  'there',
  'they',
  'ueber',
  'über',
  'unter',
  'vom',
  'wann',
  'warum',
  'was',
  'weiss',
  'weiß',
  'welche',
  'welcher',
  'wenn',
  'what',
  'when',
  'wie',
  'wieso',
  'will',
  'with',
  'wird',
  'wurde',
]);

/** Anker eines Belegs im DOM — die Belegmarke im Text springt hierhin. */
export function citationDomId(messageId: string, index: number): string {
  return `sb-cite-${messageId}-${index}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Die tragenden Wörter der Frage — sie werden im Zitat markiert. */
export function highlightTerms(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length >= MIN_TERM && !STOPWORDS.has(word)),
    ),
  ];
}

/** Zitat mit markierten Fundstellen. Nur Text — nichts Fremdes wird gerendert.
    Vorher durch `plainExcerpt`: die Vorschau zeigt lesbaren Fließtext, nicht
    rohes `##`, `- ` oder `[[…]]` — der wörtliche Text bleibt im Beleg-Panel
    mit Zeilennummern stehen, wo er hingehört. */
function mark(quote: string, terms: readonly string[]): ReactNode[] {
  const clean = plainExcerpt(quote);
  if (terms.length === 0) return [clean];
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'giu');
  return clean.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="sb-hit-mark">
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export interface CitationListProps {
  /** Nachricht, zu der die Belege gehören — sie bildet die Anker-Kennungen. */
  messageId: string;
  citations: readonly Citation[];
  /** Hervorgehobener Beleg, 1-basiert. */
  active?: number | null;
  /** Beleg im Kontext ansehen, 1-basiert. */
  onSelect: (index: number) => void;
  /** Datei im Editor öffnen. */
  onOpen: (path: string) => void;
  /** Frage, deren Wörter im Zitat markiert werden. */
  question?: string;
}

export function CitationList({
  messageId,
  citations,
  active = null,
  onSelect,
  onOpen,
  question = '',
}: CitationListProps) {
  const t = useT();
  const terms = highlightTerms(question);

  return (
    <ol className="sb-cites" aria-label={t('ask.citations.title')}>
      {citations.map((citation, at) => {
        const index = at + 1;
        return (
          <li
            key={`${citation.path}:${citation.line ?? 0}:${index}`}
            id={citationDomId(messageId, index)}
            className={`sb-cite ${active === index ? 'sb-cite--active' : ''}`.trim()}
          >
            <button
              type="button"
              className="sb-cite-main"
              aria-label={t('ask.citation.show', { index })}
              onClick={() => onSelect(index)}
            >
              <span className="sb-cite-index sb-mono">[{index}]</span>
              <span className="sb-cite-text">
                <span className="sb-cite-title">{citation.title}</span>
                <span className="sb-cite-quote">{mark(citation.quote, terms)}</span>
                <span className="sb-mono sb-cite-path">
                  {citation.line === null ? citation.path : `${citation.path}:${citation.line}`}
                </span>
              </span>
            </button>
            <IconButton
              icon="external-link"
              size="sm"
              label={t('common.openInEditor')}
              onClick={() => onOpen(citation.path)}
            />
          </li>
        );
      })}
    </ol>
  );
}
