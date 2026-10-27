/* Reads the run report the setup's stop hook leaves in `.secondbrain/agent/runs/`. A report
   that cannot be read still comes back as a state with a short reason, never as a throw and
   never with the file's content: the human sees that the last run left something broken. */

import { parse } from '@core/vault/frontmatter';
import { baseName } from '@core/vault/paths';
import type { VaultStore } from '@core/vault/types';
import {
  AGENT_DIRS,
  RUN_REPORT_FORMAT,
  RUN_REPORT_VERSION,
  type AgentLastRun,
  type AgentRunReport,
} from '@shared/types';

const REASON_MAX = 200;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type StringListField = 'pages' | 'proposals' | 'jobsDone' | 'jobsFailed' | 'jobsSkipped';
const LIST_FIELDS: StringListField[] = [
  'pages',
  'proposals',
  'jobsDone',
  'jobsFailed',
  'jobsSkipped',
];

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));
}

/** A list field as strings; absent is empty, anything but an array of strings is `null`. */
function stringList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value as string[];
}

/** The report a file holds, or the first rule it breaks. Reasons name fields, never content. */
export function parseRunReport(content: string): AgentRunReport | { error: string } {
  const parsed = parse(content);
  if (!parsed.hadFrontmatter || parsed.warning !== undefined) {
    return { error: 'The frontmatter is missing or not valid YAML' };
  }
  const fields = parsed.frontmatter;
  if (fields.gaston !== RUN_REPORT_FORMAT) return { error: 'Not a run report' };
  if (typeof fields.version !== 'number') return { error: 'The version is missing' };
  if (fields.version > RUN_REPORT_VERSION) return { error: 'Written by a newer Gaston' };
  if (typeof fields.skill !== 'string' || fields.skill.trim().length === 0) {
    return { error: 'The skill is missing' };
  }
  if (!isIsoTimestamp(fields.started)) return { error: 'The start time is missing or not a date' };
  if (!isIsoTimestamp(fields.finished)) {
    return { error: 'The finish time is missing or not a date' };
  }
  if (fields.argument !== undefined && typeof fields.argument !== 'string') {
    return { error: 'The argument is not text' };
  }

  const lists = {} as Record<StringListField, string[]>;
  for (const field of LIST_FIELDS) {
    const list = stringList(fields[field]);
    if (list === null) return { error: `The field ${field} is not a list of text` };
    lists[field] = list;
  }
  return {
    skill: fields.skill,
    argument: typeof fields.argument === 'string' ? fields.argument : null,
    started: fields.started,
    finished: fields.finished,
    ...lists,
  };
}

/** The report files in `runs/`, oldest first (file names sort by start time). */
async function runPaths(store: Pick<VaultStore, 'list'>): Promise<string[]> {
  const paths = await store.list({
    dir: AGENT_DIRS.runs,
    ext: '.md',
    recursive: false,
    includeInternal: true,
  });
  return [...paths].sort((a, b) => (baseName(a) < baseName(b) ? -1 : 1));
}

/** The newest `limit` readable reports, newest first; an unreadable file is skipped. */
export async function readRecentRuns(
  store: Pick<VaultStore, 'list' | 'readText'>,
  limit: number,
): Promise<AgentRunReport[]> {
  const reports: AgentRunReport[] = [];
  for (const path of (await runPaths(store)).reverse().slice(0, limit)) {
    const raw = await store.readText(path).catch(() => null);
    const report = raw === null ? null : parseRunReport(raw);
    if (report !== null && !('error' in report)) reports.push(report);
  }
  return reports;
}

/** The newest report in `runs/`; `none` without one. */
export async function readLastRun(
  store: Pick<VaultStore, 'list' | 'readText'>,
): Promise<AgentLastRun> {
  const newest = (await runPaths(store)).at(-1);
  if (newest === undefined) return { state: 'none' };

  const unreadable = (reason: string): AgentLastRun => ({
    state: 'unreadable',
    path: newest,
    reason: reason.slice(0, REASON_MAX),
  });
  const raw = await store.readText(newest).catch(() => null);
  if (raw === null) return unreadable('The file could not be read');
  const report = parseRunReport(raw);
  return 'error' in report ? unreadable(report.error) : { state: 'read', path: newest, report };
}
