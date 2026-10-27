/** Validates and normalizes the raw JSON shape of a persisted gardener-state
 * file — moved verbatim out of `src/main/gardener-state.ts` (027, D2). */

import { GARDENER_FINDING_KINDS } from '@shared/types';
import type {
  GardenerFinding,
  GardenerFindingKind,
  GardenerHealthContribution,
  GardenerRunScope,
  GardenerStageId,
} from '@shared/types';
import type { FixedFinding, RunAudit, StoredGardener, StoredRun } from './run-record';
import { narrowedScope } from './run-scope';

function isFinding(value: unknown): value is GardenerFinding {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['id'] === 'string' &&
    typeof record['kind'] === 'string' &&
    typeof record['severity'] === 'string' &&
    typeof record['title'] === 'string' &&
    Array.isArray(record['paths'])
  );
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Only entries that look like `YYYY-MM-DD` — anything else isn't a day. */
function readDays(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [key, day] of Object.entries(value as Record<string, unknown>)) {
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) out[key] = day;
  }
  return out;
}

function isStageId(value: unknown): value is GardenerStageId {
  return value === 'checks' || value === 'audit' || value === 'loose-ends';
}

/**
 * Only the stage ids this build knows. Dropping unknown ones rather than
 * rejecting the whole list — a future version's stage name must not make a
 * plan or a completed list unreadable for this one.
 */
function readStageIds(value: unknown): GardenerStageId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isStageId);
}

function isHealthContribution(value: unknown): value is GardenerHealthContribution {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['kind'] === 'string' &&
    typeof record['count'] === 'number' &&
    typeof record['points'] === 'number'
  );
}

/** The frozen score of a partial run. Missing or malformed reads as absent —
 * the health of that run is then unknown, never computed over its own
 * (incomplete) findings (`present()`). */
function readHealthAsOf(value: unknown): StoredRun['healthAsOf'] {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const ranAt = record['ranAt'];
  const score = record['score'];
  if (typeof ranAt !== 'string' || typeof score !== 'number') return undefined;
  const contributions = Array.isArray(record['contributions'])
    ? record['contributions'].filter(isHealthContribution)
    : [];
  return { ranAt, score, contributions };
}

function isFindingKind(value: unknown): value is GardenerFindingKind {
  return GARDENER_FINDING_KINDS.some((kind) => kind === value);
}

/**
 * A stored scope. Unknown kinds are dropped, the same reasoning as
 * `readStageIds`: a future version's finding kind must not make the file
 * unreadable for this one.
 *
 * What is left of a scope naming nothing this build knows is not a narrower
 * scope but **no** scope (`narrowedScope`) — reading it as one would leave a run
 * permanently incomplete while being unable to say what it covered. The
 * `module` axis survives on its own: an empty `kinds` next to a module is a
 * module scope.
 */
function readScope(value: unknown): GardenerRunScope | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const kinds = Array.isArray(record['kinds']) ? record['kinds'].filter(isFindingKind) : [];
  const module = record['module'];
  return narrowedScope(
    module === null || typeof module === 'string' ? { kinds, module } : { kinds },
  );
}

/**
 * The kinds a stored run recorded as looked-for. `undefined` — no such field —
 * is **not** the same as `[]`: absent means the run predates the field and
 * looked at whatever its scope named, `[]` means it looked for nothing. Unknown
 * kinds drop out for the same reason as in `readScope`; the cost is a finding of
 * that kind surviving one run longer, which is the harmless direction.
 */
function readCheckedKinds(value: unknown): GardenerFindingKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isFindingKind);
}

/** `null` (a run without an audit) is kept; a malformed mark reads as absent — the
 * run itself stays readable. */
function readAudit(value: unknown): RunAudit | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const by = record['by'];
  const at = record['at'];
  if ((by !== 'model' && by !== 'agent') || typeof at !== 'string') return undefined;
  return { by, at };
}

function readFixed(value: unknown): FixedFinding[] {
  if (!Array.isArray(value)) return [];
  const result: FixedFinding[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = record['id'];
    const undoToken = record['undoToken'];
    if (typeof id === 'string' && typeof undoToken === 'string') result.push({ id, undoToken });
  }
  return result;
}

/** A stored run, or `null` if the file carries nothing usable. */
function readRun(value: unknown): StoredRun | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const ranAt = record['ranAt'];
  const size = record['size'];
  if (typeof ranAt !== 'string' || typeof size !== 'number') return null;
  const findings = Array.isArray(record['findings']) ? record['findings'].filter(isFinding) : [];
  return {
    ranAt,
    usedLlm: record['usedLlm'] === true,
    findings,
    consideredIds: readStrings(record['consideredIds']),
    advice: readStrings(record['advice']),
    size: Math.max(0, Math.trunc(size)),
    plan: readStageIds(record['plan']),
    completed: readStageIds(record['completed']),
    healthAsOf: readHealthAsOf(record['healthAsOf']),
    scope: readScope(record['scope']),
    checkedKinds: readCheckedKinds(record['checkedKinds']),
    audit: readAudit(record['audit']),
  };
}

/**
 * The validated shape of a `gardener.json` that parsed as JSON but is
 * otherwise untrusted — it may have been written by an older build, edited by
 * hand, or truncated. `version` is passed in rather than read from the value:
 * a stored version number is never trusted over the version this build
 * actually writes (`GARDENER_STATE_VERSION`, defined in
 * `src/main/gardener-state.ts`), and this module has no reason to know that
 * file's constants (same reasoning as `run-record.ts#empty`).
 */
export function readStoredGardener(value: unknown, version: number): StoredGardener {
  const record = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Partial<StoredGardener>;
  return {
    version,
    run: readRun(record.run),
    dismissed: readStrings(record.dismissed),
    snoozed: readDays(record.snoozed),
    fixed: readFixed(record.fixed),
  };
}
