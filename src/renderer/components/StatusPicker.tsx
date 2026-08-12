/* Den Status eines Projekts wechseln — mit sichtbarer Bestätigung.

   Der Wechsel schreibt sofort ins Frontmatter. Deshalb sagt das Feld danach, was
   in der Datei steht: eine Auswahl, die nur anders aussieht, wäre eine
   Behauptung. Läuft der Schreibvorgang noch, ist das Feld gesperrt — sonst
   klickte man gegen einen Stand, der noch nicht gilt. */

import { Select } from '../atoms/Select';
import type { ProjectStatus } from '@shared/types';
import { PROJECT_STATUSES } from '@shared/types';
import { useT } from '../i18n';

export interface StatusPickerProps {
  value: ProjectStatus;
  /** Der Schreibvorgang läuft. */
  busy?: boolean;
  /** Der letzte Wechsel steht in der Datei — dann steht die Bestätigung da. */
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
