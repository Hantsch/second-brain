/**
 * Public surface of the condensed area (`areas/<slug>.condensed.md`): the
 * machine-owned sibling of the human's `areas/<slug>.md` (docs/VAULT-FORMAT.md,
 * section "Condensed area"). Other modules import from here, not from the single
 * files.
 *
 * The module is deliberately split along "who owns the file": `artifact.ts` is
 * pure text work, `inputs.ts` (area) and `inputs-project.ts` (project) decide
 * what may be read without asking a model,
 * `sources.ts` holds the hash contract between a run and the maintenance check,
 * `run.ts` (area) and `run-project.ts` (project) ask — and never write, and
 * `write.ts` is the one place that does. What both runs must enforce the same
 * way lives in `attribution.ts` (Guardrail 3) and `notice.ts` (AC 5).
 */

export { agentRef, parseAgentRef, type AgentRef } from './agent-ref';
export { areaSlugFromCondensedPath, condensedAreaPath, isCondensedAreaPath } from './paths';
export { condensedProjectPath, isCondensedProjectPath, projectRefFromCondensedPath } from './paths';
export { moduleOverviewPath, moduleSlugFromOverviewPath } from './paths';
export { diffLines } from './diff';
export type { DiffRow, DiffRowKind, LineDiffResult } from './diff';
export { buildAcceptedDocument } from './apply';
export { appendDirective } from './directives';
export {
  attributionProblems,
  readReplySections,
  type AttributionProblem,
  type MissingSection,
  type ReadSections,
} from './attribution';
export {
  areaTruncationNotice,
  partialInputsNote,
  preambleWithoutNotice,
  projectTruncationNotice,
  promptClampNotice,
  TRUNCATION_MARKER,
} from './notice';
export {
  composeArtifact,
  CONDENSED_SECTIONS,
  CONDENSED_TYPE,
  composeCondensedArtifact,
  emptyArtifact,
  emptyCondensedArtifact,
  MODULE_SECTIONS,
  parseArtifact,
  parseCondensedArtifact,
  PROJECT_SECTIONS,
  sourceLineFor,
  type CondensedArtifact,
  type CondensedDirectives,
  type CondensedExtraSection,
  type CondensedModuleArtifact,
  type CondensedModuleSectionKind,
  type CondensedProjectArtifact,
  type CondensedProjectSectionKind,
  type CondensedSectionContent,
  type CondensedSectionKind,
} from './artifact';
export {
  areaInputs,
  CONDENSE_DAY_WINDOW_DAYS,
  selectCondenseInputs,
  type CondenseInput,
  type CondenseInputSelection,
  type CondenseInputsOptions,
  type CondenseTruncationReport,
} from './inputs';
export {
  CONDENSE_SESSION_LIMIT,
  CONDENSE_SESSION_TAIL_CHARS,
  projectInputs,
  selectProjectCondenseInputs,
  type CondenseProjectInputSelection,
  type CondenseProjectMention,
  type CondenseProjectNote,
  type CondenseProjectSession,
  type CondenseProjectSources,
  type CondenseProjectTruncationReport,
  type CondenseProjectVaultSources,
} from './inputs-project';
export { moduleInputs } from './inputs-module';
export {
  recordedSources,
  SOURCE_HASHES_FIELD,
  sourceHashesIn,
  sourceHashesOf,
  sourcePaths,
  type RecordedSource,
} from './sources';
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
export {
  condenseProject,
  CONDENSE_PROJECT_TASK,
  type CondenseProjectAttributionFailure,
  type CondenseProjectAttributionProblem,
  type CondenseProjectDeps,
  type CondenseProjectFailed,
  type CondenseProjectNoInputs,
  type CondenseProjectNoModel,
  type CondenseProjectProposal,
  type CondenseProjectResult,
} from './run-project';
export {
  condenseModule,
  CONDENSE_MODULE_TASK,
  MODULE_OVERVIEW_TYPE,
  type CondenseModuleAttributionFailure,
  type CondenseModuleAttributionProblem,
  type CondenseModuleDeps,
  type CondenseModuleFailed,
  type CondenseModuleNoInputs,
  type CondenseModuleNoModel,
  type CondenseModuleProposal,
  type CondenseModuleResult,
} from './run-module';
export {
  proposalFromModuleReply,
  type ModuleReplyInput,
  type ModuleReplyResult,
} from './module-reply';
export {
  writeCondensedArea,
  writeCondensedArtifact,
  writeCondensedProject,
  type CondensedWrite,
} from './write';
