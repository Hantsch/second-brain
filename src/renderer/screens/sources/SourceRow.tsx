/* Eine aufgenommene Rohquelle als Zeile. Auch der Modul-Screen benutzt sie —
   eine Quelle sieht überall gleich aus.

   Das Symbol trägt die Aussage nicht allein: die Art steht daneben als Wort. Und
   eine unverdichtete Quelle wird hervorgehoben, statt in der Liste zu
   verschwinden — sie ist eine offene Aufgabe, kein Zustand ohne Folgen. */

import type { RawSource } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Icon } from '../../atoms/Icon';
import { useT, useLanguage } from '../../i18n';
import { formatDate } from '../../lib/format';

/** Symbol je Quellenart. Das Wort daneben sagt dasselbe — doppelt hält. */
const ICONS: Record<RawSource['kind'], string> = {
  youtube: 'download',
  url: 'globe',
  file: 'file-text',
  text: 'paperclip',
  bundle: 'layers',
};

export interface SourceRowProps {
  source: RawSource;
  /** Open the source's detail view. */
  onOpen: (path: string) => void;
  /** Zur Wiki-Seite springen, wenn es eine gibt. */
  onOpenPage?: (sourcePage: string) => void;
}

export function SourceRow({ source, onOpen, onOpenPage }: SourceRowProps) {
  const t = useT();
  const language = useLanguage();
  const condensed = source.sourcePage !== null;

  return (
    <li className="sb-row">
      <button
        type="button"
        className="sb-row-button"
        aria-label={t('sources.list.open', { title: source.title })}
        onClick={() => onOpen(source.path)}
      >
        <span className="sb-row-title">
          <Icon name={ICONS[source.kind]} size={15} />
          <span className="sb-row-name">{source.title}</span>
          {condensed ? null : <Badge variant="warning">{t('sources.list.uncondensed')}</Badge>}
        </span>
        <span className="sb-row-meta">
          <span>{t(`sources.kind.${source.kind}`)}</span>
          <span>{formatDate(source.ingestedAt, language)}</span>
          <span>
            {source.modules.length === 0
              ? t('sources.list.noModule')
              : t('sources.list.module', { module: source.modules.join(', ') })}
          </span>
          <span className="sb-mono">{source.path}</span>
        </span>
      </button>
      {condensed && onOpenPage !== undefined ? (
        <button
          type="button"
          className="sb-textlink sb-row-side"
          onClick={() => onOpenPage(source.sourcePage ?? '')}
        >
          {t('sources.list.page')}
        </button>
      ) : null}
    </li>
  );
}
