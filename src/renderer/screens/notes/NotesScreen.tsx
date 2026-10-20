/* Notes — a home for the areas: ongoing responsibilities that belong to
   neither a project nor a single day (story 005).

   The composer sits at the top, always visible, target defaulting to "no
   target" — nothing about capturing a thought asks for structure first
   (CONCEPT.md principle 1). Below it, one collapsible section per area
   (story decision: areas are grouped, not a flat stream, and there is no
   separate area detail view for this sprint).

   `?a=<slug>` is the deep link into an area: that section starts open in
   addition to the default area (`slug === 'notes'`), which is always open —
   it is where an untargeted note lands, so it should never look empty.
   `?tab=<notes|todos|condensed>` rides along with it (story 038, D5) and
   seeds which of the area's own tabs opens first — it only ever applies to
   the area named by `?a=`, everything else opens on its default tab.

   `?filter=unfiled` is the second parameter, from story 006: the inbox stopped
   being a place of its own, so the dumps nobody has filed yet are a filter
   here. It switches the body — and only the body — into `UnfiledWorkspace`;
   the header stays the same either way, because it is still one screen. The
   switch happens before the areas query is looked at, so the workspace mounts
   once for as long as the filter is in the address and its keyboard listener,
   selection anchor, and ten-second undo timer never see a remount from an
   areas refetch. */

import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../atoms/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { useAreaMutations, useAreas } from '../../lib/queries/areas';
import { useDashboardData } from '../../lib/queries/dashboard';
import { pushToast } from '../../lib/toast';
import { UnfiledWorkspace } from '../inbox/UnfiledWorkspace';
import type { AreaTab } from './AreaSection';
import { AreaSection } from './AreaSection';
import { NewAreaDialog } from './NewAreaDialog';
import { NoteComposer } from './NoteComposer';

const AREA_TABS: readonly AreaTab[] = ['notes', 'todos', 'condensed'];

/** Reads `?tab=` back into an `AreaTab`, same defaulting `AreaSection` itself
    falls back to when the prop is omitted — an unknown or absent value is
    simply not passed down, so `initialTab`'s own default (`notes`) applies. */
function areaTabFromParam(value: string | null): AreaTab | undefined {
  return AREA_TABS.find((tab) => tab === value);
}

/** The address of the filter — used as a link target and read back from it. */
const UNFILED = '/notes?filter=unfiled';

export function NotesScreen() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const areas = useAreas();
  const dashboard = useDashboardData();
  const mutations = useAreaMutations();
  const field = useRef<HTMLTextAreaElement>(null);
  const [newAreaOpen, setNewAreaOpen] = useState(false);

  const wanted = params.get('a');
  const wantedTab = areaTabFromParam(params.get('tab'));
  const unfiled = params.get('filter') === 'unfiled';

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

  /* The filter, not a second screen: one header, one wrapper — the body below
     is either the workspace or the areas. `sb-screen--fill` only comes with the
     filter, because only the workspace's two columns scroll inside themselves
     (`inbox.css`); the areas list scrolls with the page.

     Deliberately before the areas query is inspected: `areas` may go pending
     again on any refetch, and a `return` per query state would put
     `<UnfiledWorkspace />` in a differently shaped child list each time —
     React would remount it, and with it the key listener, the anchor, and the
     running undo timer. */
  if (unfiled) {
    return (
      <div className="sb-screen sb-screen--wide sb-screen--fill">
        {header}
        <UnfiledWorkspace />
        {newAreaDialog}
      </div>
    );
  }

  /* AC1: unfiled dumps are reachable from Notes as a filter, labelled with
     their count. Present at zero too — this is a permanent way into a filter,
     not a notification (the strip on Today that disappears at zero is a
     different thing). The count comes from `dashboard:data`, the one place
     that counts open dumps; `InboxTile` reads the same field. */
  const unfiledLink = (
    <p className="sb-notes-rule">
      <button type="button" className="sb-textlink" onClick={() => void navigate(UNFILED)}>
        {/* One interpolated key, no singular/plural pair: "1 nicht abgelegt"
            and "3 nicht abgelegt" inflect the same in both languages — the
            same reason `notes.area.openTodos` gets by with one. */}
        {t('notes.filter.unfiled', { count: dashboard.data?.inboxCount ?? 0 })}
      </button>
    </p>
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
        {unfiledLink}
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
        {unfiledLink}
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
      {unfiledLink}
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
              <AreaSection
                area={area}
                startOpen={area.slug === 'notes' || area.slug === wanted}
                {...(area.slug === wanted && wantedTab !== undefined
                  ? { initialTab: wantedTab }
                  : {})}
              />
            </li>
          ))}
        </ul>
      )}
      {newAreaDialog}
    </div>
  );
}
