/* A citation in context.

   A quote alone leaves it open whether it still fits. So this panel shows the
   spot along with its surroundings, with real line numbers in mono — and the
   way into the file: in the app first (`useOpenDoc`, story 059), the OS editor
   only as the secondary exit. No scroll-to-line in the reader: rendered
   Markdown has no stable line mapping, and this panel already shows the line
   in context.

   The panel is reachable only for a citation `validateCitations` confirmed:
   the caller hands in an entry of the answer's `citations`, and an unconfirmed
   path in the answer text never becomes a mark (057, `Markdown.tsx`). Both
   buttons act on that same `citation.path`, so neither opens a path the panel
   was not given.

   The spot is located within the file's body, not by the line number alone:
   the user is free to edit their files at any time. If the quote can no longer
   be found, the panel says exactly that instead of showing a wrong context. */

import { useQuery } from '@tanstack/react-query';
import type { Citation } from '@shared/types';
import { Button } from '../atoms/Button';
import { Dialog } from '../atoms/Dialog';
import { Skeleton } from './Skeleton';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';
import { useOpenDoc } from '../lib/use-open-doc';

/** This many lines are shown above and below the match. */
const RADIUS = 4;
/** This much of the quote is used to relocate it. */
const ANCHOR_CHARS = 40;

interface ContextLine {
  number: number | null;
  text: string;
  hit: boolean;
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The surroundings of the match. `null` means: the quote no longer appears in
 * the file as-is — in that case nothing is asserted.
 */
export function contextOf(body: string, citation: Citation): ContextLine[] | null {
  const anchor = collapse(citation.quote).slice(0, ANCHOR_CHARS);
  if (anchor.length === 0) return null;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  /* A quote may span line breaks, so the search uses a sliding window. The
     latest window that still contains the start is kept — otherwise the match
     would point at the blank line before it and all line numbers would be off
     by one (same rule as `lineOfQuote` in `core/wiki/citations`). */
  let found: number | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (collapse(lines.slice(index, index + 4).join(' ')).includes(anchor)) found = index;
    else if (found !== null) break;
  }
  if (found === null) return null;
  const quoteLines = citation.quote.split('\n').length;
  const from = Math.max(0, found - RADIUS);
  const to = Math.min(lines.length, found + quoteLines + RADIUS);
  const offset = citation.line === null ? null : citation.line - found;
  return lines.slice(from, to).map((text, at) => ({
    number: offset === null ? null : offset + from + at,
    text,
    hit: from + at >= found && from + at < found + quoteLines,
  }));
}

export interface CitationPanelProps {
  /** The citation, or null — in which case the panel is closed. */
  citation: Citation | null;
  /** Number of the citation within the answer, 1-based. */
  index: number | null;
  onClose: () => void;
}

export function CitationPanel({ citation, index, onClose }: CitationPanelProps) {
  const t = useT();
  const openDoc = useOpenDoc();
  const path = citation?.path ?? null;
  const { data: doc, isPending } = useQuery({
    queryKey: qk.vault.doc(path ?? ''),
    queryFn: () => api.vault.read(path ?? ''),
    enabled: path !== null,
  });

  if (citation === null) return null;
  const context = doc == null ? null : contextOf(doc.body, citation);

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={citation.title}
      description={
        index === null
          ? t('ask.citations.title')
          : t('ask.citation.of', { index, path: citation.path })
      }
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="secondary"
            icon="external-link"
            onClick={() => void api.shell.openPath(citation.path).catch(() => undefined)}
          >
            {t('ask.citation.openExternal')}
          </Button>
          {/* The panel closes itself first: `openDoc` closes the ask overlay
              around it, but the panel is also embeddable where no overlay
              exists — it must not linger over the screen it navigated to. */}
          <Button
            icon="book-open"
            onClick={() => {
              onClose();
              openDoc(citation.path);
            }}
          >
            {t('ask.citation.openInApp')}
          </Button>
        </>
      }
    >
      {isPending && doc === undefined ? (
        <Skeleton lines={5} height={18} />
      ) : context === null ? (
        <>
          <p className="sb-panel-empty">{t('ask.citation.moved')}</p>
          <blockquote className="sb-cite-plain">{citation.quote}</blockquote>
        </>
      ) : (
        <ol className="sb-context" aria-label={t('ask.citation.context')}>
          {context.map((line, at) => (
            <li key={at} className={`sb-context-line ${line.hit ? 'sb-context-line--hit' : ''}`}>
              <span className="sb-context-number sb-mono">{line.number ?? ''}</span>
              <span className="sb-context-text">{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
