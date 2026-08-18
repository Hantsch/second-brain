/* Notes — a home for the areas: ongoing responsibilities that belong to
   neither a project nor a single day (story 005).

   The composer sits at the top, always visible, target defaulting to "no
   target" — nothing about capturing a thought asks for structure first
   (CONCEPT.md principle 1). Below it, one collapsible section per area
   (story decision: areas are grouped, not a flat stream, and there is no
   separate area detail view for this sprint).

   `?a=<slug>` is the deep link into an area: that section starts open in
   addition to the default area (`slug === 'notes'`), which is always open —
   it is where an untargeted note lands, so it should never look empty. */

import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { useAreaMutations, useAreas } from '../../lib/queries/areas';
import { pushToast } from '../../lib/toast';
import { AreaSection } from './AreaSection';
import { NewAreaDialog } from './NewAreaDialog';
import { NoteComposer } from './NoteComposer';

export function NotesScreen() {
  const t = useT();
  const [params] = useSearchParams();
  const areas = useAreas();
  const mutations = useAreaMutations();
  const field = useRef<HTMLTextAreaElement>(null);
  const [newAreaOpen, setNewAreaOpen] = useState(false);

  const wanted = params.get('a');

  const header = (
    <ScreenHeader
      overline={t('screen.notes.overline')}
      title={t('screen.notes.title')}
      action={
        <Button variant="secondary" icon="folder-plus" onClick={() => setNewAreaOpen(true)}>
          {t('notes.newArea.title')}
        </Button>
      }
    />
  );

  /* Only in the tree while open: that way the fields are empty on reopen,
     mirroring `NewProjectDialog`'s wiring in `ProjectsScreen`. */
  const newAreaDialog = !newAreaOpen ? null : (
    <NewAreaDialog
      open={newAreaOpen}
      busy={mutations.createArea.isPending}
      error={mutations.createArea.error}
      onClose={() => {
        mutations.createArea.reset();
        setNewAreaOpen(false);
      }}
      onCreate={(title) =>
        mutations.createArea.mutate(title, { onSuccess: () => setNewAreaOpen(false) })
      }
    />
  );

  const createNoteError = mutations.createNote.error;
  const createNoteConflict =
    createNoteError instanceof IpcCallError && createNoteError.code === 'conflict';

  const composer = (
    <>
      <NoteComposer
        areas={areas.data ?? []}
        busy={mutations.createNote.isPending}
        fieldRef={field}
        onSave={(text, target) =>
          mutations.createNote.mutateAsync(target === null ? { text } : { text, area: target }, {
            onError: (error) => {
              /* A conflict here doesn't lose anything — the composer only
                 clears its field on success (`NoteComposer.tsx`) — so it
                 reads best as toast-only; every other code keeps the inline
                 card below. */
              const code = error instanceof IpcCallError ? error.code : 'unknown';
              if (code !== 'conflict') return;
              const subject =
                (areas.data ?? []).find((entry) => entry.slug === (target ?? 'notes'))?.title ??
                t('screen.notes.title');
              pushToast('error', { message: 'error.about.conflict', values: { subject } });
            },
          })
        }
      />
      {createNoteError === null || createNoteError === undefined || createNoteConflict ? null : (
        <ErrorState error={createNoteError} variant="secondary" scrollIntoView />
      )}
    </>
  );

  if (areas.error) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <p className="sb-notes-rule">{t('notes.rule')}</p>
        {composer}
        <ErrorState error={areas.error} onRetry={() => void areas.refetch()} />
        {newAreaDialog}
      </div>
    );
  }

  if (areas.isPending) {
    return (
      <div className="sb-screen sb-screen--wide">
        {header}
        <p className="sb-notes-rule">{t('notes.rule')}</p>
        {composer}
        <Skeleton lines={4} height={64} />
        {newAreaDialog}
      </div>
    );
  }

  return (
    <div className="sb-screen sb-screen--wide">
      {header}
      <p className="sb-notes-rule">{t('notes.rule')}</p>
      {composer}

      {areas.data.length === 0 ? (
        <EmptyState
          icon="sticky-note"
          title={t('screen.notes.empty.title')}
          body={t('screen.notes.empty.body')}
          action={{
            label: t('screen.notes.empty.action'),
            icon: 'pencil',
            onClick: () => field.current?.focus(),
          }}
        />
      ) : (
        <ul className="sb-noteslist" aria-label={t('notes.list.aria')}>
          {areas.data.map((area) => (
            <li key={area.path}>
              <AreaSection area={area} startOpen={area.slug === 'notes' || area.slug === wanted} />
            </li>
          ))}
        </ul>
      )}
      {newAreaDialog}
    </div>
  );
}
