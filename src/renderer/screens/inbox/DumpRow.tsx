/* Eine Zeile der Inbox-Liste: Titel, Alter, Herkunft, Zustand.

   Die ganze Fläche ist der Knopf — nicht ein Icon daneben. Das Alter steht in
   Mono und wird ab einer Woche zur Warnung: ein Dump, der eine Woche liegt, ist
   ein Befund, keine Zahl. */

import type { DumpItem } from '@shared/types';
import { Badge } from '../../atoms/Badge';
import { t as translate, useT } from '../../i18n';

/** Ab so vielen Tagen fällt ein liegengebliebener Dump auf. */
export const OVERDUE_DAYS = 7;

/** „liegt seit 6 Tagen" — bereits übersetzt. */
export function dumpAge(ageDays: number): string {
  if (ageDays <= 0) return translate('inbox.age.today');
  if (ageDays === 1) return translate('inbox.age.one');
  return translate('inbox.age.days', { count: ageDays });
}

export interface DumpRowProps {
  dump: DumpItem;
  active: boolean;
  onSelect: () => void;
  /** Für den Tastaturweg: die Zeile bekommt den Fokus, wenn sie gewählt wird. */
  buttonRef?: (element: HTMLButtonElement | null) => void;
}

export function DumpRow({ dump, active, onSelect, buttonRef }: DumpRowProps) {
  const t = useT();
  const overdue = dump.ageDays >= OVERDUE_DAYS;
  return (
    <li className="sb-dumprow">
      <button
        type="button"
        ref={buttonRef}
        className={`sb-dumpitem${active ? ' sb-dumpitem--active' : ''}`}
        aria-current={active ? 'true' : undefined}
        onClick={onSelect}
      >
        <span className="sb-dumpitem-title">{dump.title}</span>
        <span className="sb-dumpitem-meta">
          <span className={`sb-mono${overdue ? ' sb-dumpitem-old' : ''}`}>
            {dumpAge(dump.ageDays)}
          </span>
          <span aria-hidden="true">·</span>
          <span>{t(`inbox.origin.${dump.origin}`)}</span>
          {dump.scope !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{t(`scope.${dump.scope}`)}</span>
            </>
          ) : null}
        </span>
        {dump.status === 'kept' ? <Badge variant="warning">{t('inbox.status.kept')}</Badge> : null}
      </button>
    </li>
  );
}
