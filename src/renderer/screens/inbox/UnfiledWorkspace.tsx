/* The unfiled filter's workspace — filing, as a job.

   Story 006 moved this out of a screen of its own: "Inbox" named a container,
   not a job, so what used to sit at `/inbox` is now the body of Notes while
   `filter=unfiled` is in the address. Everything below is the former
   `InboxScreen` unchanged; only the `ScreenHeader` is gone, because the host
   (`NotesScreen`) owns the one header of this screen, filtered or not — and
   the surrounding `.sb-screen--fill` column, which the host owns for the same
   reason: `height: 100%` only resolves against a parent with a definite
   height, and nesting a second `.sb-screen` inside the host's would have made
   the two columns grow with their content instead of scrolling inside
   themselves.

   Two columns instead of expanding cards: at 1440 px the list stays put
   while the proposal sits on the right with text field, todos, and four
   actions. A card that expands all of that would push the list away — and
   that list is exactly what's needed to move to the next dump with j/k.

   Keyboard: j/k or arrows move, Enter jumps into the proposal, e into the
   text, Ctrl+Enter files it, Esc back to the list.

   Every action states afterward what happened, and carries "Undo" for ten
   seconds: even "leave it" writes `status: kept` to the dump, and that's
   exactly what can be undone (`keepDump` in `core/capture/undo.ts`).

   The selection hangs off the path, not the position: a dump marked "stays
   put" slides further down the list — the selection is allowed to follow
   it and must not jump to an unrelated dump. If it disappears entirely
   (filed, discarded), the next one takes its place. */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Dialog } from '../../atoms/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
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
import { FiledTrail } from './FiledTrail';
import { UndoStrip } from './UndoStrip';
import type { UndoOffer } from './UndoStrip';
import { useInboxKeys } from './use-inbox-keys';

/** How long "Undo" stays visible. */
const UNDO_VISIBLE_MS = 10_000;

/** What the selection hangs off: the path, with the position as fallback. */
interface Anchor {
  path: string;
  at: number;
}

/**
 * The position of the selected dump. The path counts first: if the list
 * re-sorts, the selection follows the same dump. If it's gone, the old
 * position applies — the next one now sits there.
 */
function pickIndex(dumps: readonly DumpItem[], anchor: Anchor | null): number {
  if (dumps.length === 0 || anchor === null) return 0;
  const found = dumps.findIndex((dump) => dump.path === anchor.path);
  return found >= 0 ? found : Math.min(anchor.at, dumps.length - 1);
}

export function UnfiledWorkspace() {
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

  /* `capture:inbox` returns every dump under `inbox/` regardless of status —
     since a filed dump stays on disk as its own receipt (story 006, D4), it
     shows up here too. Split right here, once: `dumps` is the working set
     the keyboard, the count, and the list below all still operate on;
     `filed` feeds the trail beneath them and touches none of that. */
  const dumps: DumpItem[] = (data ?? []).filter((dump) => dump.status !== 'filed');
  const filed: DumpItem[] = (data ?? []).filter((dump) => dump.status === 'filed');
  const index = pickIndex(dumps, anchor);
  const current = dumps[index] ?? null;
  /* Even the first selection — which nobody clicked — hangs off the path.
     Applied during render, not in an effect: otherwise the first frame
     would show a different selection than the second. */
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
    /* All rows are in the DOM — focus doesn't need to wait for a render. */
    if (focus) rows.current.get(dump.path)?.focus();
  };

  const file = (): void => {
    if (current === null || proposal.data === undefined || edit === null) return;
    if (mutations.apply.isPending) return;
    mutations.apply.mutate(applied(proposal.data, edit), {
      /* What the confirmation says is decided by the result: without a
         written file and without a marker, the dump was left as-is, not
         filed. */
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
      /* Contrary to what the name suggests, "Leave it" really does write
         something (`status: kept`) — and therefore gets the same undo path
         as filing and discarding, not just a statement without a button. */
      onSuccess: ({ undoToken }) => setUndoOffer({ kind: 'kept', paths: [], undoToken }),
    });
  };

  /* If the proposal reads "Stays in the inbox", the card's primary button is
     "Leave it" and that goes through `keep` (`capture:keep`, with an undo
     path) — not through `file` (`capture:apply`, which would write the same
     status without a marker for `target: 'inbox'`). Ctrl+Enter must trigger
     the same action as the button the eye sees. */
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

  /* Filing is an offer, not a chore (story 006) — and the sentence that says
     so sits where the screen's own header used to, above every state of the
     workspace. Same shape as `notes.rule` one level up, which the host also
     keeps above its error and skeleton states. */
  const rule = <p className="sb-notes-rule">{t('notes.unfiled.optional')}</p>;

  /* Passed to `DumpDetail`/`TargetPicker` today, and to `FiledTrail` for the
     same reason: resolving a filed dump's target path to a human title
     needs the same lookup tables. */
  const names = { projects: projects.data ?? [], modules: modules.data ?? [] };

  const strip =
    undoOffer === null ? null : (
      <UndoStrip offer={undoOffer} busy={mutations.undo.isPending} onUndo={() => undo(undoOffer)} />
    );

  /* No silent error: whatever goes wrong while filing, leaving, discarding,
     or undoing shows up as a card — the first error counts. */
  const failed =
    mutations.apply.error ??
    mutations.keep.error ??
    mutations.discard.error ??
    mutations.undo.error ??
    null;

  if (error) {
    return (
      <>
        {rule}
        <ErrorState error={error} onRetry={() => void refetch()} />
      </>
    );
  }

  if (isPending || data === undefined) {
    return (
      <>
        {rule}
        <Skeleton lines={6} height={48} />
      </>
    );
  }

  if (dumps.length === 0) {
    return (
      <>
        {rule}
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
        <FiledTrail dumps={filed} names={names} />
      </>
    );
  }

  return (
    <>
      {rule}
      {strip}
      {failed === null ? null : (
        /* Secondary: this screen's one teal belongs to the action in the card. */
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

      <FiledTrail dumps={filed} names={names} />

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
    </>
  );
}
