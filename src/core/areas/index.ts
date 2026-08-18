/**
 * Public surface of the areas: `areas/<slug>.md`, an ongoing responsibility with
 * no end (docs/VAULT-FORMAT.md). Other modules import from here, not from the
 * single files.
 *
 * Reading an area is the index's job (`core/index/areas.ts`); what lives here is
 * the knowledge about the file's own structure — which heading a note belongs
 * under, and what that heading is called.
 */

export {
  AREA_ENTRY_LEVEL,
  AREA_SECTION_LEVEL,
  areaSectionIn,
  areaSectionRanges,
  areaSections,
  isAreaSectionOf,
  type AreaSectionKind,
  type AreaSections,
} from './sections';
export {
  areaNoteBlock,
  moveNoteBlock,
  newAreaDocument,
  withAreaNote,
  type NewAreaDocument,
} from './write';
