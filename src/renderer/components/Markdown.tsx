/* Markdown einer Antwort — mit klickbaren Verweisen.

   Gerendert wird über `markdown-render.tsx`, dieselbe Fassung wie die Wiki-Seite;
   hier steht nur, was ein Verweis in einer Antwort bedeutet:

   1. **Belegmarke.** Ein `[[pfad]]` (oder ein roher Pfad `a/b.md:12`) wird zu
      `[1]`, wenn es dazu einen geprüften Beleg gibt — das ist der Faden vom Satz
      zur Datei.
   2. **Dateiverweis.** Gibt es keinen Beleg, bleibt der Pfad klickbar, aber ohne
      Akzent: er behauptet nichts.
   3. **Nur Text.** Ein `[[begriff]]` ohne Pfad wird Text. Ein Link ins Nichts ist
      schlimmer als keiner.

   Kein `dangerouslySetInnerHTML`, kein Sanitizer: Fremdtext wird hier nie Markup. */

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import type { Citation } from '@shared/types';
import { useT } from '../i18n';
import { renderMarkdown } from './markdown-render';
import type { MarkdownRefs } from './markdown-render';

function leaf(path: string): string {
  return path.split('/').pop() ?? path;
}

/** Der Beleg zu einem Pfad: genau derselbe, sonst eindeutig über den Dateinamen. */
function citeIndexOf(target: string, citations: readonly Citation[]): number | null {
  const wanted = target.replace(/^\.\//, '').trim();
  const exact = citations.findIndex((citation) => citation.path === wanted);
  if (exact >= 0) return exact + 1;
  const name = leaf(wanted);
  const matches = citations.filter((citation) => leaf(citation.path) === name);
  if (matches.length !== 1 || matches[0] === undefined) return null;
  return citations.indexOf(matches[0]) + 1;
}

export interface MarkdownProps {
  text: string;
  /** Geprüfte Belege der Antwort — sie bestimmen die Nummern der Marken. */
  citations?: readonly Citation[];
  /** Klick auf eine Belegmarke, 1-basiert. */
  onCitation?: (index: number) => void;
  /** Klick auf einen Dateiverweis ohne Beleg. */
  onOpenPath?: (path: string) => void;
  className?: string;
}

export function Markdown({
  text,
  citations = [],
  onCitation,
  onOpenPath,
  className = '',
}: MarkdownProps) {
  const t = useT();

  const nodes = useMemo(() => {
    /** Ein Ziel als Belegmarke, als Dateiverweis — oder als nichts. */
    const reference = (target: string, label: string, key: string): ReactNode | null => {
      const cite = citeIndexOf(target, citations);
      if (cite !== null) {
        return (
          <button
            key={key}
            type="button"
            className="sb-citemark"
            aria-label={t('ask.citation.mark', { index: cite })}
            onClick={() => onCitation?.(cite)}
          >
            [{cite}]
          </button>
        );
      }
      return (
        <button
          key={key}
          type="button"
          className="sb-pathref"
          title={target}
          aria-label={t('ask.citation.openPath', { path: target })}
          onClick={() => onOpenPath?.(target)}
        >
          {label.length > 0 ? label : leaf(target)}
        </button>
      );
    };

    const refs: MarkdownRefs = {
      wikilink: (target, label, key) => {
        /* Ohne Pfadanteil ist es ein Begriff, keine Datei — dann bleibt es Text. */
        if (!target.includes('/') && !target.endsWith('.md')) {
          return label.length > 0 ? label : target;
        }
        return reference(target, label, key);
      },
      path: (path, line, key) =>
        reference(path, line === null ? leaf(path) : `${leaf(path)}:${line}`, key),
    };
    return renderMarkdown(text, refs);
  }, [text, citations, onCitation, onOpenPath, t]);

  return <div className={`sb-md sb-markdown ${className}`.trim()}>{nodes}</div>;
}
