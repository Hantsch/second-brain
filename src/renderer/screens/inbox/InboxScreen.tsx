/* Inbox — die Arbeitsfläche des Einordnens.

   Zwei Spalten statt aufklappender Karten: auf 1440 px bleibt die Liste stehen,
   während rechts der Vorschlag mit Textfeld, Todos und vier Aktionen liegt. Eine
   Karte, die all das aufklappt, schiebt die Liste weg — und genau die braucht
   man, um mit j/k zum nächsten Dump zu gehen.

   Tastatur: j/k oder Pfeile bewegen, Enter springt in den Vorschlag, e in den
   Text, Ctrl+Enter legt ab, Esc zurück in die Liste.

   Jede Aktion sagt danach, was geschehen ist, und trägt zehn Sekunden lang
   „Rückgängig": auch „liegen lassen" schreibt `status: kept` in den Dump, und
   genau das lässt sich zurücknehmen (`keepDump` in `core/capture/undo.ts`).

   Die Auswahl hängt am Pfad, nicht an der Stelle: ein Dump, der als „bleibt
   liegen" markiert wird, rutscht in der Liste nach hinten — die Auswahl darf ihm
   folgen und nicht auf einen fremden Dump springen. Verschwindet er ganz
   (abgelegt, verworfen), rückt der nächste an seine Stelle. */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { TargetPicker } from '../../components/TargetPicker';
import { applied, useProposalEdit } from '../../components/proposal-edit';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { useCaptureMutations, useProposal } from '../../lib/queries/capture';
import { useInbox, useModules, useProjects } from '../../lib/queries/data';
import { useTaskRouted } from '../../lib/queries/llm';
import { DumpDetail } from './DumpDetail';
import { DumpRow } from './DumpRow';
import { UndoStrip } from './UndoStrip';
import type { UndoOffer } from './UndoStrip';
import { useInboxKeys } from './use-inbox-keys';

/** So lange bleibt „Rückgängig" stehen. */
const UNDO_VISIBLE_MS = 10_000;

/** Woran die Auswahl hängt: am Pfad, mit der Stelle als Rückfallposition. */
interface Anchor {
  path: string;
  at: number;
}

/**
 * Die Stelle des gewählten Dumps. Der Pfad zählt zuerst: sortiert die Liste sich
 * neu, folgt die Auswahl demselben Dump. Ist er weg, gilt die alte Stelle — dort
 * steht jetzt der nächste.
 */
function pickIndex(dumps: readonly DumpItem[], anchor: Anchor | null): number {
  if (dumps.length === 0 || anchor === null) return 0;
  const found = dumps.findIndex((dump) => dump.path === anchor.path);
  return found >= 0 ? found : Math.min(anchor.at, dumps.length - 1);
}

export function InboxScreen() {
  const t = useT();
  const navigate = useNavigate();
  const { data, error, isPending, refetch } = useInbox();
  const projects = useProjects();
  const modules = useModules();
  const modelRouted = useTaskRouted('classify-dump');
  const mutations = useCaptureMutations();

  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [undoOffer, setUndoOffer] = useState<UndoOffer | null>(null);

  const rows = useRef(new Map<string, HTMLButtonElement>());
  const textField = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const dumps: DumpItem[] = data ?? [];
  const index = pickIndex(dumps, anchor);
  const current = dumps[index] ?? null;
  /* Auch die erste Auswahl — die niemand geklickt hat — hängt am Pfad. Beim
     Rendern nachgezogen, nicht in einem Effekt: sonst zeigte das erste Bild eine
     andere Auswahl als das zweite. */
  if (current !== null && anchor?.path !== current.path) {
    setAnchor({ path: current.path, at: index });
  }

  const proposal = useProposal(current?.path ?? null);
  const [edit, setEdit] = useProposalEdit(proposal.data);

  useEffect(() => {
    if (undoOffer === null) return undefined;
    const timer = setTimeout(() => setUndoOffer(null), UNDO_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [undoOffer]);

  const select = (next: number, focus = false): void => {
    const dump = dumps[next];
    if (dump === undefined) return;
    setAnchor({ path: dump.path, at: next });
    /* Alle Zeilen stehen im DOM — der Fokus braucht kein Warten auf ein Rendern. */
    if (focus) rows.current.get(dump.path)?.focus();
  };

  const file = (): void => {
    if (current === null || proposal.data === undefined || edit === null) return;
    if (mutations.apply.isPending) return;
    mutations.apply.mutate(applied(proposal.data, edit), {
      /* Was die Bestätigung sagt, entscheidet das Ergebnis: ohne geschriebene
         Datei und ohne Marke ist der Dump liegengeblieben, nicht abgelegt. */
      onSuccess: (result) =>
        setUndoOffer({
          kind: result.undoToken === null || result.written.length === 0 ? 'kept' : 'filed',
          paths: result.written,
          undoToken: result.undoToken,
        }),
    });
  };

  const keep = (): void => {
    if (current === null) return;
    mutations.keep.mutate(current.path, {
      /* Anders als der Name vermuten lässt, schreibt „Liegen lassen" wirklich
         etwas (`status: kept`) — und bekommt deshalb denselben Rückweg wie
         Ablegen und Verwerfen, nicht nur eine Feststellung ohne Knopf. */
      onSuccess: ({ undoToken }) => setUndoOffer({ kind: 'kept', paths: [], undoToken }),
    });
  };

  /* Lautet der Vorschlag „Bleibt in der Inbox", ist der Primärknopf der Karte
     „Liegen lassen" und der geht über `keep` (`capture:keep`, mit Rückweg) —
     nicht über `file` (`capture:apply`, das für `target: 'inbox'` denselben
     Status ohne Marke schriebe). Ctrl+Enter muss dieselbe Aktion auslösen wie
     der Knopf, den das Auge sieht. */
  const stays = edit?.action.target === 'inbox';
  const primary = (): void => (stays ? keep() : file());

  const discard = (): void => {
    if (current === null) return;
    setConfirmDiscard(false);
    mutations.discard.mutate(current.path, {
      onSuccess: ({ undoToken }) => setUndoOffer({ kind: 'discarded', paths: [], undoToken }),
    });
  };

  const undo = (offer: UndoOffer): void => {
    if (offer.undoToken === null) return;
    mutations.undo.mutate(offer.undoToken, { onSuccess: () => setUndoOffer(null) });
  };

  useInboxKeys({
    count: dumps.length,
    index,
    select,
    file: primary,
    focusPanel: () => panel.current?.focus(),
    focusText: () => textField.current?.focus(),
  });

  const header = (
    <ScreenHeader
      overline={t('screen.inbox.overline')}
      title={t('screen.inbox.title')}
      action={
        /* Sekundär: der eine Teal-Fokuspunkt dieses Screens ist „Ablegen". */
        <Button variant="secondary" icon="zap" onClick={() => void navigate('/capture')}>
          {t('screen.inbox.empty.action')}
        </Button>
      }
    />
  );

  const strip =
    undoOffer === null ? null : (
      <UndoStrip offer={undoOffer} busy={mutations.undo.isPending} onUndo={() => undo(undoOffer)} />
    );

  /* Kein stiller Fehler: was beim Ablegen, Liegenlassen, Verwerfen oder
     Zurücknehmen schiefgeht, steht als Karte da — der erste Fehler zählt. */
  const failed =
    mutations.apply.error ??
    mutations.keep.error ??
    mutations.discard.error ??
    mutations.undo.error ??
    null;

  if (error) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (isPending || data === undefined) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <Skeleton lines={6} height={48} />
      </div>
    );
  }

  if (dumps.length === 0) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        {strip}
        <EmptyState
          icon="inbox"
          title={t('screen.inbox.empty.title')}
          body={t('screen.inbox.empty.body')}
          action={{
            label: t('screen.inbox.empty.action'),
            icon: 'zap',
            onClick: () => void navigate('/capture'),
          }}
        />
      </div>
    );
  }

  const names = { projects: projects.data ?? [], modules: modules.data ?? [] };

  return (
    <div className="sb-screen sb-screen--wide sb-screen--fill">
      {header}
      {strip}
      {failed === null ? null : (
        /* Sekundär: das eine Teal des Screens gehört der Aktion in der Karte. */
        <ErrorState
          error={failed}
          variant="secondary"
          {...(current === null ? {} : { subject: current.path })}
          scrollIntoView
        />
      )}

      <div className="sb-inbox">
        <div className="sb-inbox-list">
          <p className="sb-inbox-count sb-mono">
            {plural(dumps.length, 'inbox.countOne', 'inbox.count')}
          </p>
          <ul className="sb-dumplist" aria-label={t('inbox.panelTitle')}>
            {dumps.map((dump, at) => (
              <DumpRow
                key={dump.path}
                dump={dump}
                active={at === index}
                onSelect={() => select(at)}
                buttonRef={(element) => {
                  if (element === null) rows.current.delete(dump.path);
                  else rows.current.set(dump.path, element);
                }}
              />
            ))}
          </ul>
        </div>

        {current === null ? null : (
          <DumpDetail
            key={current.path}
            dump={current}
            proposal={proposal.data}
            proposalError={proposal.error}
            onRetryProposal={() => void proposal.refetch()}
            edit={edit}
            onEdit={setEdit}
            names={names}
            modelRouted={modelRouted}
            busy={mutations.apply.isPending}
            onFile={file}
            onPickTarget={() => setPickerOpen(true)}
            onKeep={keep}
            onDiscard={() => setConfirmDiscard(true)}
            textRef={textField}
            panelRef={panel}
          />
        )}
      </div>

      {proposal.data !== undefined && edit !== null ? (
        <TargetPicker
          open={pickerOpen}
          actions={[proposal.data.primary, ...proposal.data.alternatives]}
          current={edit.action}
          names={names}
          onClose={() => setPickerOpen(false)}
          onPick={(action) => {
            setEdit((state) =>
              state === null ? state : { ...state, action, content: action.content },
            );
            setPickerOpen(false);
          }}
        />
      ) : null}

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={t('inbox.discard.title')}
        description={t('inbox.discard.body')}
        size="sm"
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" icon="trash-2" onClick={discard}>
              {t('inbox.action.discard')}
            </Button>
          </>
        }
      />
    </div>
  );
}
