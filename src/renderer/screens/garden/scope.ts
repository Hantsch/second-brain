/* Names what a scoped run covered (021c, D4) — the reverse of `checkOnlyScope`
   in FindingList.tsx, which turns a filter into a `GardenerRunScope`; this
   turns a scope that already ran back into words for the report it produced.

   Shared by GardenScreen's "stopped partway" notice, HealthCard's stamp line,
   and the dashboard tile, so the wording for a scope is never invented twice
   and never drifts between the places that show it.

   Takes `t` as a parameter rather than importing the module-level `t` —
   mirrors `hiddenNote` in HealthCard.tsx: this is a plain function, not a
   component, so it cannot call `useT()` itself. Every current and future
   caller reads it from within a component body where `useT()` already
   subscribes to language changes, so the label never goes stale when the UI
   language changes at runtime. */

import type { GardenerRunScope } from '@shared/types';
import type { useT } from '../../i18n';

export function scopeLabel(scope: GardenerRunScope, t: ReturnType<typeof useT>): string {
  const kindLabel =
    scope.kinds !== undefined && scope.kinds.length > 0
      ? scope.kinds.map((kind) => t(`garden.kind.${kind}`)).join(', ')
      : null;
  const moduleLabel =
    scope.module === undefined
      ? null
      : scope.module === null
        ? t('garden.filter.noModule')
        : scope.module;

  if (kindLabel !== null && moduleLabel !== null) {
    return t('garden.scope.both', { kind: kindLabel, module: moduleLabel });
  }
  if (kindLabel !== null) return t('garden.scope.kind', { kind: kindLabel });
  if (moduleLabel !== null) return t('garden.scope.module', { module: moduleLabel });
  return '';
}
