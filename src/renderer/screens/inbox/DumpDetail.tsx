/* Die rechte Spalte der Inbox: der Dump, darunter sein Vorschlag.

   Reihenfolge ist Absicht — erst lesen, was da steht, dann entscheiden, wohin es
   geht. Der Vorschlag darf laden, ohne dass der Text verschwindet: der Dump ist
   schon da, nur die Einordnung braucht einen Moment.

   Der Dumptext steht hier als Vorschau, nicht als Volltext: derselbe Text steht
   drei Zeilen weiter unten noch einmal — nämlich genau so, wie er geschrieben
   wird. Zweimal dasselbe schiebt die Aktionsleiste aus dem Fenster. Wer den
   Volltext oben sehen will, klappt ihn auf; im Feld darunter steht er ohnehin. */

import { useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DumpItem, FilingProposal } from '@shared/types';
import { IconButton } from '../../atoms/IconButton';
import { ErrorState } from '../../components/ErrorState';
import { ProposalCard } from '../../components/ProposalCard';
import type { ProposalEdit } from '../../components/proposal-edit';
import { Skeleton } from '../../components/Skeleton';
import type { TargetNames } from '../../components/TargetPicker';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { OVERDUE_DAYS, dumpAge } from './DumpRow';

/** Ab so vielen Zeichen lohnt „mehr anzeigen" — kürzer passt in die Vorschau. */
const CLAMP_FROM = 220;

export interface DumpDetailProps {
  dump: DumpItem;
  proposal: FilingProposal | undefined;
  proposalError: unknown;
  onRetryProposal: () => void;
  edit: ProposalEdit | null;
  onEdit: Dispatch<SetStateAction<ProposalEdit | null>>;
  names: TargetNames;
  modelRouted: boolean | undefined;
  busy: boolean;
  onFile: () => void;
  onPickTarget: () => void;
  onKeep: () => void;
  onDiscard: () => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
  panelRef: RefObject<HTMLDivElement | null>;
}

export function DumpDetail({
  dump,
  proposal,
  proposalError,
  onRetryProposal,
  edit,
  onEdit,
  names,
  modelRouted,
  busy,
  onFile,
  onPickTarget,
  onKeep,
  onDiscard,
  textRef,
  panelRef,
}: DumpDetailProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const overdue = dump.ageDays >= OVERDUE_DAYS;
  /* Steht derselbe Text unten im Feld, ist die Vorschau oben eine Wiederholung
     und darf enger stehen. */
  const twice = edit !== null && edit.content.includes(dump.text.trim());
  const long = dump.text.length > CLAMP_FROM || dump.text.split('\n').length > 4;
  const clamped = long && !open;

  return (
    <div className="sb-inbox-detail" ref={panelRef} tabIndex={-1}>
      <div className="sb-dumphead">
        <div className="sb-dumphead-text">
          <h2 className="sb-dumphead-title">{dump.title}</h2>
          <div className="sb-dumphead-meta">
            <span className={`sb-mono${overdue ? ' sb-dumpitem-old' : ''}`}>
              {dumpAge(dump.ageDays)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t(`inbox.origin.${dump.origin}`)}</span>
            <span aria-hidden="true">·</span>
            <span>{dump.scope === null ? t('inbox.scope.open') : t(`scope.${dump.scope}`)}</span>
            <span aria-hidden="true">·</span>
            <span className="sb-mono">{t('inbox.words', { count: dump.wordCount })}</span>
          </div>
          <span className="sb-mono sb-dumphead-path">{dump.path}</span>
        </div>
        <IconButton
          icon="external-link"
          variant="ghost"
          size="sm"
          label={t('common.openInEditor')}
          onClick={() => void api.shell.openPath(dump.path).catch(() => undefined)}
        />
      </div>

      <div className="sb-dumpview">
        <p
          className={`sb-dumptext${clamped ? ' sb-dumptext--clamped' : ''}${twice ? ' sb-dumptext--twice' : ''}`}
        >
          {dump.text}
        </p>
        {long ? (
          <button type="button" className="sb-textlink" onClick={() => setOpen((value) => !value)}>
            {open ? t('inbox.dump.less') : t('inbox.dump.more')}
          </button>
        ) : null}
      </div>

      {proposalError ? (
        <ErrorState error={proposalError} onRetry={onRetryProposal} subject={dump.path} />
      ) : proposal === undefined || edit === null ? (
        <div className="sb-proposal-loading">
          <span className="gs-overline">{t('inbox.proposal.pending')}</span>
          <Skeleton lines={4} height={40} />
        </div>
      ) : (
        <ProposalCard
          proposal={proposal}
          edit={edit}
          onEdit={onEdit}
          names={names}
          modelRouted={modelRouted}
          busy={busy}
          onFile={onFile}
          onPickTarget={onPickTarget}
          onKeep={onKeep}
          onDiscard={onDiscard}
          textRef={textRef}
        />
      )}
    </div>
  );
}
