/* Die Auswahl der Module: was es gibt, wofür es gut ist, und ob es steht.

   Bewusst kein zweiter Ort, an dem verschoben wird — das gehört ins Gitter. Hier
   gibt es genau zwei Entscheidungen: zeigen oder ausblenden, und die Anordnung
   zurücksetzen.

   Der Haken schaltet sofort. Ein „Speichern" wäre ein zweiter Zustand, in dem die
   Auswahl etwas anderes zeigt als das Dashboard dahinter. */

import type { DashboardLayout, DashboardModuleId } from '@shared/types';
import { DASHBOARD_MODULES } from '@shared/types';
import { Button } from '../atoms/Button';
import { Checkbox } from '../atoms/Checkbox';
import { Dialog } from '../atoms/Dialog';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';
import { MODULE_META } from './tiles/modules';

export interface TileCatalogProps {
  open: boolean;
  layout: DashboardLayout;
  onToggle: (id: DashboardModuleId, visible: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

export function TileCatalog({ open, layout, onToggle, onReset, onClose }: TileCatalogProps) {
  const t = useT();
  const hidden = new Set(
    layout.tiles.filter((tile) => tile.hidden === true).map((tile) => tile.id),
  );
  const visibleCount = DASHBOARD_MODULES.length - hidden.size;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('dashboard.catalog.title')}
      description={t('dashboard.catalog.body')}
      size="lg"
      closeLabel={t('common.close')}
      footer={
        <>
          <span className="sb-catalog-count">
            {t('dashboard.catalog.visible', {
              count: visibleCount,
              total: DASHBOARD_MODULES.length,
            })}
          </span>
          <Button variant="secondary" icon="refresh-cw" onClick={onReset}>
            {t('dashboard.catalog.reset')}
          </Button>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </>
      }
    >
      <ul className="sb-catalog">
        {/* Jedes Modul der Tabelle hat einen Screen dahinter — es gibt keinen
            Eintrag mehr, der angehakt werden könnte, ohne etwas zu liefern. */}
        {DASHBOARD_MODULES.map((id) => {
          const meta = MODULE_META[id];
          return (
            <li key={id} className="sb-catalog-item">
              <span className="sb-catalog-icon" aria-hidden="true">
                <Icon name={meta.icon} size={16} />
              </span>
              <Checkbox
                className="sb-catalog-check"
                checked={!hidden.has(id)}
                label={t(meta.nameKey)}
                description={t(meta.purposeKey)}
                onChange={(event) => onToggle(id, event.target.checked)}
              />
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
