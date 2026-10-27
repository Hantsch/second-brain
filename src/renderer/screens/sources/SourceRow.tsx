/* Eine aufgenommene Rohquelle als Zeile. Auch der Modul-Screen benutzt sie —
   eine Quelle sieht überall gleich aus.

   Das Symbol trägt die Aussage nicht allein: die Art steht daneben als Wort. Und
   eine unverdichtete Quelle wird hervorgehoben, statt in der Liste zu
   verschwinden — sie ist eine offene Aufgabe, kein Zustand ohne Folgen. */

import { useState } from 'react';
import type { AgentJobView, KnowledgeModule, RawSource } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { Button } from '../../atoms/Button';
import { Icon } from '../../atoms/Icon';
import { Select } from '../../atoms/Select';
import { useT, useLanguage } from '../../i18n';
import { formatDate } from '../../lib/format';
import { AgentHandOver } from './AgentHandOver';

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
  /** Module zur Auswahl, wenn direkt aus der Zeile verdichtet werden soll. */
  modules?: readonly KnowledgeModule[];
  /** Verdichten anstoßen, ohne erst die Detailansicht zu öffnen. */
  onCondense?: (path: string, module: string) => void;
  /** Verdichten aus der Beschreibung/den Metadaten statt aus dem Transcript —
      nur relevant, wenn `source.blocked !== null`. */
  onCondenseFromMetadata?: (path: string, module: string) => void;
  /** Diese Zeile verdichtet gerade. */
  condensing?: boolean;
  /** The open job the agent holds for this source, if any. */
  agentJob?: AgentJobView | null;
  /** Hand the source to the agent instead of condensing it here. */
  onHandOver?: (path: string, module: string) => void;
  /** Take the agent's open job back. */
  onWithdraw?: (id: string) => void;
}

export function SourceRow({
  source,
  onOpen,
  onOpenPage,
  modules,
  onCondense,
  onCondenseFromMetadata,
  condensing = false,
  agentJob = null,
  onHandOver,
  onWithdraw,
}: SourceRowProps) {
  const t = useT();
  const language = useLanguage();
  const condensed = source.sourcePage !== null;
  const [chosenModule, setChosenModule] = useState(source.modules[0] ?? '');

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
          {source.blocked === null ? null : (
            <Badge variant="warning">{t(`sources.stage.blocked.${source.blocked}`)}</Badge>
          )}
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
      {!condensed && agentJob !== null && onWithdraw !== undefined ? (
        <span className="sb-row-condense">
          <AgentHandOver job={agentJob} onHandOver={() => undefined} onWithdraw={onWithdraw} />
        </span>
      ) : null}
      {!condensed && agentJob === null && onCondense !== undefined && modules !== undefined ? (
        <span className="sb-row-condense">
          <Select
            aria-label={t('sources.list.moduleFor', { title: source.title })}
            value={chosenModule}
            onChange={(event) => setChosenModule(event.target.value)}
            options={modules.map((entry) => ({ value: entry.slug, label: entry.title }))}
            placeholder={t('sources.detail.chooseModule')}
          />
          <Button
            variant="secondary"
            size="sm"
            icon="sparkles"
            disabled={chosenModule.length === 0 || condensing}
            loading={condensing}
            onClick={() => onCondense(source.path, chosenModule)}
          >
            {condensing ? t('sources.detail.condensing') : t('sources.detail.condense')}
          </Button>
          {onHandOver !== undefined && onWithdraw !== undefined ? (
            <AgentHandOver
              job={null}
              disabled={chosenModule.length === 0 || condensing}
              onHandOver={() => onHandOver(source.path, chosenModule)}
              onWithdraw={onWithdraw}
            />
          ) : null}
          {source.blocked !== null && onCondenseFromMetadata !== undefined ? (
            <Button
              variant="ghost"
              size="sm"
              icon="file-text"
              disabled={chosenModule.length === 0 || condensing}
              onClick={() => onCondenseFromMetadata(source.path, chosenModule)}
            >
              {t('sources.detail.condenseFromMetadata')}
            </Button>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}
