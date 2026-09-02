/**
 * Guardrail 3, in code: what a condensation run may claim, and from what.
 *
 * Extracted from `run.ts` (story 044, D11) so the area run and the project run
 * enforce the *same* check rather than two copies of it — a second
 * implementation is a second place the rule can quietly stop being true. Like
 * `artifact.ts` (D9), the module is parameterised over the section set instead
 * of knowing one: the area passes `CONDENSED_SECTIONS`, the project passes
 * `PROJECT_SECTIONS`.
 *
 * Two rules, both fatal to the **whole** run — never a repaired artifact and
 * never a dropped sentence:
 *
 * - every cited source must be a member of the set actually read ("some input"
 *   is not enough), and
 * - prose without any citation is a claim nobody can check.
 *
 * Pure data work: no model, no gateway, no filesystem.
 */

import { toVaultPath } from '@core/vault/paths';
import type { SectionKind } from '@core/vault/section-names';
import type { CondensedSectionContent } from './artifact';
import { parseAgentRef } from './agent-ref';

/** A section whose citations did not survive the subset check. */
export interface AttributionProblem<K extends SectionKind = SectionKind> {
  section: K;
  /**
   * `unknown-source`: cited a source that was not among the inputs read.
   * `no-source`: wrote prose and cited nothing — a claim without evidence.
   */
  reason: 'unknown-source' | 'no-source';
  /** The offending sources; empty for `no-source`. */
  sources: readonly string[];
}

/** The section a reply is missing, when it is missing one. */
export interface MissingSection<K extends SectionKind> {
  missing: K;
}

/** A reply read into the machine-owned sections of one level. */
export interface ReadSections<K extends SectionKind> {
  sections: Record<K, CondensedSectionContent>;
}

/**
 * One section of a model reply, or `null` when it does not match the schema.
 *
 * A source token is normalised with `toVaultPath()` — except an
 * `agent:<kind>/<pathKey>` reference (story 044, D12), which is passed through
 * unchanged. `toVaultPath()` drops empty path segments, which would corrupt a
 * `pathKey` built from a POSIX cwd: `pathKey()` keeps a leading `/`
 * (`src/core/claude/paths.ts`), so `agent:claude//home/x` would collapse to
 * `agent:claude/home/x` and no longer match the ref the run actually read —
 * a false attribution failure on every non-Windows agent session.
 */
function readSection(raw: unknown): CondensedSectionContent | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const text = record['text'];
  const sources = record['sources'];
  if (typeof text !== 'string' || !Array.isArray(sources)) return null;
  return {
    text: text.trim(),
    sources: sources
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => (parseAgentRef(entry) ? entry : toVaultPath(entry)))
      .filter((entry) => entry.length > 0),
  };
}

/**
 * Reads every machine-owned section out of a reply. The first section that does
 * not match the schema is named back, so the caller can report *which* one — a
 * reply missing one of them is a failed run, not a partial artifact.
 */
export function readReplySections<K extends SectionKind>(
  reply: Record<string, unknown>,
  sections: readonly K[],
): ReadSections<K> | MissingSection<K> {
  const read = {} as Record<K, CondensedSectionContent>;
  for (const kind of sections) {
    const section = readSection(reply[kind]);
    if (section === null) return { missing: kind };
    read[kind] = section;
  }
  return { sections: read };
}

/**
 * Every section whose citations fail the subset check, in section order.
 * Empty means the reply is attributable — the only case a run may compose.
 */
export function attributionProblems<K extends SectionKind>(
  sections: Record<K, CondensedSectionContent>,
  order: readonly K[],
  read: readonly string[],
): AttributionProblem<K>[] {
  const allowed = new Set(read);
  const problems: AttributionProblem<K>[] = [];
  for (const kind of order) {
    const section = sections[kind];
    const unknown = section.sources.filter((path) => !allowed.has(path));
    if (unknown.length > 0) {
      problems.push({ section: kind, reason: 'unknown-source', sources: unknown });
      continue;
    }
    if (section.text.length > 0 && section.sources.length === 0) {
      problems.push({ section: kind, reason: 'no-source', sources: [] });
    }
  }
  return problems;
}
