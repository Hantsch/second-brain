/* The citations of an answer — the heart of asking questions.

   An answer without a citation is just a claim. That's why this list stands
   under every answer: number, title, verbatim excerpt, file path with line in
   mono. The number matches the marker `[1]` in the answer text; clicking the
   marker jumps here and highlights the citation.

   The words of the question are highlighted in the quote — the same
   highlighting as in full-text search. Without a model, this list is the
   result, not a bonus. */

import type { ReactNode } from 'react';
import type { Citation } from '@shared/types';
import { IconButton } from '../atoms/IconButton';
import { useT } from '../i18n';
import { plainExcerpt } from './markdown-render';

/** Shortest length of a word that gets highlighted in the quote. */
const MIN_TERM = 4;

/**
 * Words that show up in every other question. Highlighting them would turn
 * the quote into a patchwork and obscure what actually matched — the same
 * consideration as for the title stopwords in `core/capture/mentions`.
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

/** A citation's anchor in the DOM — the citation marker in the text jumps here. */
export function citationDomId(messageId: string, index: number): string {
  return `sb-cite-${messageId}-${index}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The load-bearing words of the question — they get highlighted in the quote. */
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

/** Quote with matches highlighted. Text only — nothing foreign is rendered.
    Passed through `plainExcerpt` first: the preview shows readable prose, not
    raw `##`, `- ` or `[[…]]` — the verbatim text stays in the citation panel
    with line numbers, where it belongs. */
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
  /** Message the citations belong to — it forms the anchor ids. */
  messageId: string;
  citations: readonly Citation[];
  /** Highlighted citation, 1-based. */
  active?: number | null;
  /** View citation in context, 1-based. */
  onSelect: (index: number) => void;
  /** Open the cited file — in the app since 059 (`AskPanel` hands in `useOpenDoc`). */
  onOpen: (path: string) => void;
  /** Question whose words get highlighted in the quote. */
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
              icon="book-open"
              size="sm"
              label={t('ask.citation.openInApp')}
              onClick={() => onOpen(citation.path)}
            />
          </li>
        );
      })}
    </ol>
  );
}
