/* Change a project's status — with visible confirmation.

   The change writes to the frontmatter immediately. That's why the field
   afterward states what's in the file: a selection that merely looks
   different would be a false claim. While the write is still in progress,
   the field is locked — otherwise you'd be clicking against a state that
   doesn't apply yet. */

import { Select } from '../atoms/Select';
import type { ProjectStatus } from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { useT } from '../i18n';

export interface StatusPickerProps {
  value: ProjectStatus;
  /** The write is in progress. */
  busy?: boolean;
  /** The last change is in the file — then the confirmation is shown. */
  savedAs?: ProjectStatus | null;
  onChange: (next: ProjectStatus) => void;
}

export function StatusPicker({ value, busy = false, savedAs = null, onChange }: StatusPickerProps) {
  const t = useT();
  return (
    <div className="sb-statuspick">
      <Select
        className="sb-statuspick-field"
        label={t('project.statusLabel')}
        value={value}
        disabled={busy}
        options={PROJECT_STATUSES.map((status) => ({
          value: status,
          label: t(`project.status.${status}`),
        }))}
        onChange={(event) => onChange(event.target.value as ProjectStatus)}
      />
      <span className="sb-statuspick-note" role="status">
        {savedAs === null
          ? ''
          : t('project.statusSaved', { status: t(`project.status.${savedAs}`) })}
      </span>
    </div>
  );
}
