/**
 * Public surface of the condensed area (`areas/<slug>.condensed.md`): the
 * machine-owned sibling of the human's `areas/<slug>.md` (docs/VAULT-FORMAT.md,
 * section "Condensed area"). Other modules import from here, not from the single
 * files.
 *
 * The module is deliberately split along "who owns the file": `artifact.ts` is
 * pure text work, `inputs.ts` decides what may be read without asking a model,
 * and `run.ts` asks — and never writes.
 */

export { areaSlugFromCondensedPath, condensedAreaPath, isCondensedAreaPath } from './paths';
export {
  CONDENSED_SECTIONS,
  CONDENSED_TYPE,
  composeCondensedArtifact,
  emptyCondensedArtifact,
  parseCondensedArtifact,
  sourceLineFor,
  type CondensedArtifact,
  type CondensedDirectives,
  type CondensedExtraSection,
  type CondensedSectionContent,
  type CondensedSectionKind,
} from './artifact';
export {
  CONDENSE_DAY_WINDOW_DAYS,
  selectCondenseInputs,
  type CondenseInputSelection,
  type CondenseInputsOptions,
  type CondenseTruncationReport,
} from './inputs';
export {
  CONDENSE_AREA_TASK,
  condenseArea,
  type CondenseAreaAttributionFailure,
  type CondenseAreaDeps,
  type CondenseAreaFailed,
  type CondenseAreaNoInputs,
  type CondenseAreaNoModel,
  type CondenseAreaProposal,
  type CondenseAreaResult,
  type CondenseAttributionProblem,
} from './run';
