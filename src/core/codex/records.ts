/**
 * What one line of a Codex session file holds, and how to read it.
 *
 * Codex CLI ("rollout") files are JSONL like Claude's, but the shape is
 * different: every line is `{ timestamp, type, payload }`, and the payload's
 * own fields depend on `type` (and, for `event_msg`/`response_item`, on a
 * second `payload.type` one level down). The format is undocumented beyond
 * what the CLI itself writes, so — same discipline as `../claude/records.ts` —
 * every field here is optional and every accessor defensive: an unrecognized
 * record type or a missing nested field is bookkeeping, not an error, and
 * never produces an invented value (guardrail 3).
 *
 * Measured against a real `~/.codex/sessions` tree (2026-08-12, 205 sessions;
 * see the `## Plan` section of docs/requirements/001-agent-session-browser.md)
 * and against the synthetic fixtures in tests/fixtures/codex/, which are the
 * authoritative shape for this module.
 */

import { PATH_FIELDS } from '@core/claude';

/** One line of a Codex rollout file. Everything optional — see file header. */
export interface CodexRecord {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

/** A block in a `response_item`/`message` record's `content` array. */
interface CodexContentBlock {
  type?: string;
  text?: string;
}

function payloadOf(record: CodexRecord): Record<string, unknown> {
  return record.payload ?? {};
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function isSessionMeta(record: CodexRecord): boolean {
  return record.type === 'session_meta';
}

export function isTurnContext(record: CodexRecord): boolean {
  return record.type === 'turn_context';
}

/** `event_msg` records carry their real kind one level down, in `payload.type`. */
function eventType(record: CodexRecord): string | null {
  if (record.type !== 'event_msg') return null;
  return str(payloadOf(record).type);
}

export function isTokenCountEvent(record: CodexRecord): boolean {
  return eventType(record) === 'token_count';
}

export function isUserMessageEvent(record: CodexRecord): boolean {
  return eventType(record) === 'user_message';
}

/** `response_item` records carry a turn; only `message` items are conversation content. */
function responseItemType(record: CodexRecord): string | null {
  if (record.type !== 'response_item') return null;
  return str(payloadOf(record).type);
}

function messageRole(record: CodexRecord): string | null {
  if (responseItemType(record) !== 'message') return null;
  return str(payloadOf(record).role);
}

/** Roles that carry conversation content — `developer` is instructions, not a turn. */
const SEMANTIC_ROLES = new Set(['user', 'assistant']);

/**
 * A `response_item`/`message` with role `user` or `assistant`. Codex has no
 * top-level `SEMANTIC_TYPES` the way Claude does (RESEARCH.md-equivalent: the
 * distinction lives one level down, in `payload.type` + `payload.role`).
 */
export function isSemantic(record: CodexRecord): boolean {
  const role = messageRole(record);
  return role !== null && SEMANTIC_ROLES.has(role);
}

/** A `response_item`/`message` with role `user` — what a human typed. */
export function isUserTurn(record: CodexRecord): boolean {
  return messageRole(record) === 'user';
}

function contentBlocks(record: CodexRecord): CodexContentBlock[] {
  const content = payloadOf(record).content;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is CodexContentBlock => !!block && typeof block === 'object',
  );
}

/**
 * Text of a `response_item`/`message` record. User turns carry `input_text`
 * blocks, assistant turns `output_text` — both are just read as `text`,
 * whichever block type it is; anything without a `text` field contributes
 * nothing rather than throwing.
 */
export function recordText(record: CodexRecord): string | null {
  if (responseItemType(record) !== 'message') return null;
  const text = contentBlocks(record)
    .filter((block) => typeof block.text === 'string')
    .map((block) => block.text!.trim())
    .filter((part) => part.length > 0)
    .join('\n')
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * The record's own kind, wherever it states it. Codex writes tool traffic in two
 * shapes: as a top-level record (`type: 'function_call'`, which is what the
 * fixtures in tests/fixtures/codex/ and the measured sessions show) and nested
 * inside a `response_item` (`payload.type: 'function_call'`). Both are read here
 * rather than betting on one — an unknown kind stays unknown and is skipped by
 * the caller, never guessed.
 */
function itemType(record: CodexRecord): string | null {
  if (record.type === 'response_item') return str(payloadOf(record).type);
  return str(record.type);
}

/** Tool call kinds, and their `_output` counterparts (the `_output` convention is Codex's own). */
const TOOL_CALL_TYPES = new Set(['function_call', 'custom_tool_call']);
const TOOL_OUTPUT_TYPES = new Set(['function_call_output', 'custom_tool_call_output']);

/**
 * A `reasoning` record — the model's own thinking. The transcript view drops
 * these entirely (story 001, resolved open question "transcript depth":
 * reasoning blocks hidden), so this predicate exists to *exclude*, not to read.
 */
export function isReasoning(record: CodexRecord): boolean {
  return itemType(record) === 'reasoning';
}

/**
 * One tool call, reduced to what a collapsed transcript line needs. `target` is
 * unclipped — how long a line may be is the view's decision (mirrors
 * `ClaudeToolCall` in `../claude/records.ts`).
 */
export interface CodexToolCall {
  /** `call_id` — the matching `*_output` record repeats it. */
  callId: string | null;
  name: string | null;
  target: string | null;
  /** The payload itself, for expand-on-click. */
  raw: Record<string, unknown>;
}

/**
 * What a call acts on, in one line: a path field first (same field names as
 * Claude's `PATH_FIELDS`, imported rather than copied), then a `command` — the
 * shell tool's argument and by far the most common case — then the first string
 * argument, and only as a last resort the whole object as JSON.
 */
function targetFromObject(object: Record<string, unknown>): string | null {
  for (const field of PATH_FIELDS) {
    const value = str(object[field]);
    if (value !== null) return value;
  }
  const command = object.command;
  if (Array.isArray(command)) {
    const parts = command.filter((part): part is string => typeof part === 'string');
    if (parts.length > 0) return str(parts.join(' '));
  }
  for (const value of Object.values(object)) {
    const text = str(value);
    if (text !== null) return text;
  }
  if (Object.keys(object).length === 0) return null;
  try {
    return JSON.stringify(object);
  } catch {
    return null;
  }
}

/**
 * Codex states a call's arguments as a **JSON string** (`function_call.arguments`)
 * or as free text (`custom_tool_call.input`, e.g. an `apply_patch` body). Parsed
 * when it is JSON; otherwise the text itself is the most honest target there is.
 */
function targetFromValue(value: unknown): string | null {
  const object = obj(value);
  if (object !== null) return targetFromObject(object);
  const text = str(value);
  if (text === null) return null;
  try {
    const parsed = obj(JSON.parse(text));
    if (parsed !== null) return targetFromObject(parsed);
  } catch {
    /* Not JSON — fall through to the raw argument text. */
  }
  return text;
}

/** A `function_call`/`custom_tool_call` record, or `null` if this is something else. */
export function toolCallOf(record: CodexRecord): CodexToolCall | null {
  const type = itemType(record);
  if (type === null || !TOOL_CALL_TYPES.has(type)) return null;
  const payload = payloadOf(record);
  return {
    callId: str(payload.call_id),
    name: str(payload.name),
    target: targetFromValue(payload.arguments) ?? targetFromValue(payload.input),
    raw: payload,
  };
}

/**
 * A `function_call_output`/`custom_tool_call_output` record. The output records
 * carry no tool name — only the `call_id` ties them back to the call — so the
 * name is deliberately absent here instead of being inferred across records.
 */
export function toolOutputOf(
  record: CodexRecord,
): { callId: string | null; raw: Record<string, unknown> } | null {
  const type = itemType(record);
  if (type === null || !TOOL_OUTPUT_TYPES.has(type)) return null;
  const payload = payloadOf(record);
  return { callId: str(payload.call_id), raw: payload };
}

/** `session_id` — only `session_meta` carries it. */
export function sessionIdOf(record: CodexRecord): string | null {
  if (!isSessionMeta(record)) return null;
  return str(payloadOf(record).session_id);
}

/**
 * Working directory. Both `session_meta` and `turn_context` carry a `cwd`;
 * `turn_context` is the one Codex actually uses per turn, but the two agree
 * in every fixture and measured session seen so far, so either is read here.
 */
export function cwdOf(record: CodexRecord): string | null {
  if (isSessionMeta(record) || isTurnContext(record)) return str(payloadOf(record).cwd);
  return null;
}

/** Git branch — only `session_meta.payload.git.branch`. */
export function gitBranchOf(record: CodexRecord): string | null {
  if (!isSessionMeta(record)) return null;
  const git = obj(payloadOf(record).git);
  return git === null ? null : str(git.branch);
}

/** Model name — only `turn_context.payload.model` carries it. */
export function modelOf(record: CodexRecord): string | null {
  if (!isTurnContext(record)) return null;
  return str(payloadOf(record).model);
}

/**
 * Cumulative tokens used so far, as of this `token_count` event. Unlike
 * Claude's per-turn `usage` (see `contextTokensOf` in `../claude/records.ts`),
 * Codex tracks a running total for the whole session in
 * `payload.info.total_token_usage.total_tokens`. `null` unless this record is
 * a `token_count` event that actually carries the field.
 */
export function totalTokensOf(record: CodexRecord): number | null {
  if (!isTokenCountEvent(record)) return null;
  const info = obj(payloadOf(record).info);
  if (info === null) return null;
  const usage = obj(info.total_token_usage);
  return usage === null ? null : num(usage.total_tokens);
}

/**
 * The model's context window size. `token_count` events report the live
 * figure (`payload.info.model_context_window`); if the read window never
 * contains a `token_count` record, `session_meta.payload.context_window` is
 * the configured value for the same figure and is used as a fallback by the
 * caller — this function only reports what one single record states.
 */
export function contextWindowOf(record: CodexRecord): number | null {
  if (isTokenCountEvent(record)) {
    const info = obj(payloadOf(record).info);
    return info === null ? null : num(info.model_context_window);
  }
  if (isSessionMeta(record)) return num(payloadOf(record).context_window);
  return null;
}
