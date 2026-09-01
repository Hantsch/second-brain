/* One area as a collapsible section — the whole area experience for this
   sprint (story 005 decision: no separate area detail view).

   Full notes and the area's todos only load once the section is open:
   `useAreaNotes`/`useAreaTodos` are both passed `null` while it's closed, so
   a screen with many areas never fetches what nobody has expanded — the same
   gate `useAreaNotes` already uses for "no slug at all". */

import { useState } from 'react';
import type { Area, AreaNote } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Tabs } from '../../atoms/Tabs';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import { IpcCallError } from '../../lib/api';
import { useAreaMutations, useAreaNotes, useAreas } from '../../lib/queries/areas';
import { useAreaTodos, useTodoMutations } from '../../lib/queries/todos';
import { pushToast } from '../../lib/toast';
import { AreaCondensedTab } from './AreaCondensedTab';
import { AreaNotesTab } from './AreaNotesTab';
import { AreaTodosTab } from './AreaTodosTab';
import { MoveNoteDialog } from './MoveNoteDialog';

/** The three tabs inside an area section. */
export type AreaTab = 'notes' | 'todos' | 'condensed';

export interface AreaSectionProps {
  area: Area;
  /** Story decision: the default area (`slug === 'notes'`) and the area
      named by `?a=` start open, everything else starts closed. */
  startOpen: boolean;
  /** Seeds the tab state once, from `?tab=` at the call site — same idea as
      `startOpen` from `?a=`. Defaults to `notes` when absent or unknown. */
  initialTab?: AreaTab;
}

export function AreaSection({ area, startOpen, initialTab = 'notes' }: AreaSectionProps) {
  const t = useT();
  const [open, setOpen] = useState(startOpen);
  const [tab, setTab] = useState<AreaTab>(initialTab);
  const [moving, setMoving] = useState<AreaNote | null>(null);
  const notes = useAreaNotes(open ? area.slug : null);
  const todos = useAreaTodos(open ? area.slug : null);
  const todoMutations = useTodoMutations();
  /* The full area list, for the "move to another area" targets. TanStack
     Query dedupes this against `NotesScreen`'s own `useAreas()` call by key
     — a cache read, not a second IPC round trip. */
  const allAreas = useAreas();
  const areaMutations = useAreaMutations();
  const otherAreas = (allAreas.data ?? []).filter((entry) => entry.slug !== area.slug);

  const meta = [
    t('notes.area.noteCount', { count: area.noteCount }),
    area.openTodoCount > 0 ? t('notes.area.openTodos', { count: area.openTodoCount }) : null,
  ]
    .filter((entry): entry is string => entry !== null)
    .join(' · ');

  const failed =
    todoMutations.toggle.error ?? todoMutations.update.error ?? todoMutations.create.error ?? null;

  return (
    <Panel
      title={area.title}
      meta={meta}
      action={
        <Button
          variant="ghost"
          size="sm"
          icon={open ? 'chevron-up' : 'chevron-down'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {t(open ? 'notes.area.hide' : 'notes.area.show')}
        </Button>
      }
    >
      {!open ? null : (
        <div className="sb-areabody">
          <Tabs
            aria-label={t('notes.area.tab.label')}
            items={[
              { id: 'notes', label: t('notes.tab.notes'), icon: 'file-text' },
              { id: 'todos', label: t('notes.tab.todos'), icon: 'circle-check-big' },
              { id: 'condensed', label: t('notes.tab.condensed'), icon: 'layers' },
            ]}
            value={tab}
            onChange={(id) => setTab(id as AreaTab)}
          />

          {tab === 'notes' ? (
            <AreaNotesTab area={area} notes={notes} onMove={(note) => setMoving(note)} />
          ) : tab === 'todos' ? (
            <AreaTodosTab area={area} todos={todos} todoMutations={todoMutations} failed={failed} />
          ) : (
            <AreaCondensedTab area={area} />
          )}
        </div>
      )}

      {moving === null ? null : (
        <MoveNoteDialog
          open={moving !== null}
          note={moving}
          from={area}
          others={otherAreas}
          busy={areaMutations.moveNote.isPending}
          /* A `conflict` gets its own toast below and stays out of the
             card — every other code (the note vanished, the target area is
             gone, an unreachable store) would otherwise fail with no
             feedback at all, since nothing else here renders the mutation's
             error. */
          error={
            areaMutations.moveNote.error instanceof IpcCallError &&
            areaMutations.moveNote.error.code === 'conflict'
              ? null
              : areaMutations.moveNote.error
          }
          onClose={() => {
            areaMutations.moveNote.reset();
            setMoving(null);
          }}
          onSubmit={(toSlug) =>
            areaMutations.moveNote.mutate(
              { from: area.slug, to: toSlug, line: moving.line, expectedHash: area.hash },
              {
                onSuccess: () => setMoving(null),
                onError: (error) => {
                  /* The dialog stays open on error: closing it would leave the
                     user guessing whether the move happened. The note itself
                     stays put too — a failed mutation triggers no cache
                     invalidation, so `notes.data` is untouched. */
                  const code = error instanceof IpcCallError ? error.code : 'unknown';
                  if (code === 'conflict') {
                    pushToast('error', {
                      message: 'error.about.conflict',
                      values: { subject: area.title },
                    });
                  }
                },
              },
            )
          }
        />
      )}
    </Panel>
  );
}
