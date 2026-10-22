/* The condensed tab of a module. Like the area and project tabs, the
   behaviour lives in `CondensedUnitPanel`; this says which unit it is, which
   routing entry a run needs and where the copy comes from. No delete: a
   module's overview page is part of the module, not a derived artefact next
   to it, and `condense:delete` refuses the module level. */

import { CondensedUnitPanel } from '../../components/condensed/CondensedUnitPanel';

export interface ModuleCondensedTabProps {
  module: { slug: string; title: string };
}

export function ModuleCondensedTab({ module }: ModuleCondensedTabProps) {
  return (
    <CondensedUnitPanel
      unit="module"
      slug={module.slug}
      title={module.title}
      task="condense-module"
      keyPrefix="modules.condensed"
      canDelete={false}
    />
  );
}
