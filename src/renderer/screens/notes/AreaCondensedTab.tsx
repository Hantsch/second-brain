/* The condensed tab of an area section (story 038, D6/D7/D8; delete in 043).
   Since 045 (D3) the whole behaviour lives in `CondensedUnitPanel`, which is
   level-agnostic — this tab only says which unit it is looking at, which
   routing entry a run of it needs, and where its copy comes from. It stays a
   named component rather than being replaced by the panel at the call site:
   `NotesScreen` addresses the area tab, not the panel, and the area's own
   `condense-area` task and `notes.condensed.*` copy are decided here. */

import { CondensedUnitPanel } from '../../components/condensed/CondensedUnitPanel';

export interface AreaCondensedTabProps {
  area: { slug: string; title: string };
}

export function AreaCondensedTab({ area }: AreaCondensedTabProps) {
  return (
    <CondensedUnitPanel
      unit="area"
      slug={area.slug}
      title={area.title}
      task="condense-area"
      keyPrefix="notes.condensed"
    />
  );
}
