/* The notes tab of an area section (story 038, D5) — the notes list that used
   to sit directly inside `AreaSection`'s body, unchanged: a skeleton while
   `useAreaNotes` is pending, the empty state, or the list with each note's
   move-to-another-area button. */

import type { Area, AreaNote } from '@shared/types';
import type { UseQueryResult } from '@tanstack/react-query';
import { IconButton } from '../../atoms/IconButton';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';

export interface AreaNotesTabProps {
  area: Area;
  notes: UseQueryResult<AreaNote[]>;
  /** Opens the move dialog in the parent (`AreaSection` owns `moving`). */
  onMove: (note: AreaNote) => void;
}

export function AreaNotesTab({ area, notes, onMove }: AreaNotesTabProps) {
  const t = useT();

  if (notes.isPending) return <Skeleton lines={2} height={20} />;
  if (area.noteCount === 0) return <p className="sb-panel-empty">{t('notes.area.empty')}</p>;

  return (
    <ul className="sb-areanotes">
      {(notes.data ?? []).map((note) => (
        <li key={note.line} className="sb-areanote">
          <div className="sb-areanote-head">
            {note.heading === null ? null : (
              <span className="sb-areanote-day sb-mono">{note.heading}</span>
            )}
            <IconButton
              icon="folder-open"
              size="sm"
              label={t('notes.moveNote.action')}
              className="sb-areanote-move"
              onClick={() => onMove(note)}
            />
          </div>
          <p className="sb-areanote-text">{note.excerpt}</p>
        </li>
      ))}
    </ul>
  );
}
