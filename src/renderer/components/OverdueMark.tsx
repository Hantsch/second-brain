/* The mark on a row that is overdue.

   A triangle, not a colour: red text alone is a statement only a certain pair
   of eyes can read, and in a list of ten rows the eye still has to compare
   shades to find the one that presses. The icon is the signal, the red is the
   emphasis, and the word behind it is what a screen reader announces.

   One component for every tile that can hold an overdue row, so "overdue"
   looks the same in "Upcoming" as it does in "Waiting on". */

import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

export function OverdueMark() {
  const t = useT();
  return (
    <span className="sb-overduemark" title={t('row.overdue')}>
      <Icon name="triangle-alert" size={13} />
      <span className="sb-visually-hidden">{t('row.overdue')}</span>
    </span>
  );
}
