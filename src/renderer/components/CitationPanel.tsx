/* Ein Beleg im Kontext.

   Ein Zitat allein lässt offen, ob es passt. Also zeigt dieses Panel die Stelle
   samt Umgebung, mit echten Zeilennummern in Mono — und den Weg in die Datei.

   Gesucht wird die Stelle im Rumpf der Datei, nicht über die Zeilennummer allein:
   der Nutzer darf seine Dateien jederzeit selbst ändern. Findet sich das Zitat
   nicht mehr, sagt das Panel genau das, statt eine falsche Umgebung zu zeigen. */

import { useQuery } from '@tanstack/react-query';
import type { Citation } from '@shared/types';
import { Button } from '../atoms/Button';
import { Dialog } from '../atoms/Dialog';
import { Skeleton } from './Skeleton';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { qk } from '../lib/queries/keys';

/** So viele Zeilen stehen über und unter der Fundstelle. */
const RADIUS = 4;
/** So viel Zitat wird zum Wiederfinden benutzt. */
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
 * Die Umgebung der Fundstelle. `null` heißt: das Zitat steht so nicht mehr in der
 * Datei — dann wird nichts behauptet.
 */
export function contextOf(body: string, citation: Citation): ContextLine[] | null {
  const anchor = collapse(citation.quote).slice(0, ANCHOR_CHARS);
  if (anchor.length === 0) return null;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  /* Ein Zitat darf über Umbrüche laufen, deshalb wird in einem Fenster gesucht.
     Genommen wird das späteste Fenster, das den Anfang noch enthält — sonst zeigte
     die Fundstelle auf die Leerzeile davor und alle Zeilennummern wären um eins
     verschoben (dieselbe Regel wie `lineOfQuote` in `core/wiki/citations`). */
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
  /** Der Beleg, oder null — dann ist das Panel zu. */
  citation: Citation | null;
  /** Nummer des Belegs in der Antwort, 1-basiert. */
  index: number | null;
  onClose: () => void;
}

export function CitationPanel({ citation, index, onClose }: CitationPanelProps) {
  const t = useT();
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
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            icon="external-link"
            onClick={() => void api.shell.openPath(citation.path).catch(() => undefined)}
          >
            {t('ask.citation.openFile')}
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
