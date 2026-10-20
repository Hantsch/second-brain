/**
 * The optional model pass over loose ends — the second, additive step.
 *
 * `findLooseEnds()` (D1) resolves fixed relative phrasing in German and English
 * ("morgen", "tomorrow", "next week") and written dates, and stops there, on
 * purpose. This step catches what that rule cannot see: a vague span in either
 * language ("in ein paar Tagen", "in a few days", "soon"), an announcement worded
 * around its date, a sentence whose subject only a reader recognizes. Without a route for
 * `journal-loose-ends` it does nothing at all and the heuristic result stands
 * whole — that is guardrail 1: the loose-end list is complete without a model,
 * only poorer in judgment.
 *
 * Nothing the model says is taken on trust (guardrail 3). A proposal survives
 * only if all four hold:
 *
 * 1. it names **one of the days that were sent** — the path never comes from the
 *    model, it comes from that day's own record;
 * 2. its sentence stands **verbatim in the user's own prose** of that day —
 *    whitespace may differ, nothing else may (`collapse`, the same normalization
 *    the heuristic's own quotes went through). The app's own answer blocks are
 *    not prose of the user's and are therefore not quotable;
 * 3. its `refDate` lies strictly **between that day and today** — the same rule
 *    the heuristic applies: an announcement for today has not come due, one for
 *    the day itself is a report;
 * 4. its `subject` uses **only words from the quoted sentence**.
 *
 * And it goes through the **same subtraction as a heuristic one** afterwards
 * (`settledCheck`, D1): an announcement a later day already answers, or one that
 * is already a todo with a deadline, is not a loose end — no matter who proposed
 * it. AC 6 and AC 8 are properties of a loose end, not of its finder, so they
 * cannot be left to the prompt's wording.
 *
 * What the heuristic already found drops out by id, so the same sentence never
 * arrives twice.
 *
 * Privacy: nothing here logs. Journal prose travels to the routed model and
 * nowhere else — not into a log line, not into an error message. An unusable
 * answer, a broken connection, a caller who aborted: all of them end in an empty
 * result, and the caller sees "no model loose ends", not a reason built out of
 * the day's text (guardrail 6).
 */

import type { LooseEnd, ModelRef } from '@shared/types';
import { findDates } from '@core/capture';
import { collapse, fold } from '@core/index/text';
import { parseJsonLoose } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import {
  JOURNAL_LOOSE_ENDS_SCHEMA,
  MAX_LOOSE_END_PROPOSALS,
  MAX_LOOSE_END_SUBJECT_WORDS,
  journalLooseEndsPrompt,
} from '@core/llm/prompts';
import {
  SENTENCE_LANGUAGES,
  findLooseEnds,
  looseEndId,
  resolutionCheck,
  sentencesOf,
} from './loose-ends';
import type { LooseEndDay, LooseEndTodo } from './loose-ends';
import type { LooseEndDerivation } from './loose-ends-derived';
import { parseStream } from './stream';

/**
 * Days that go into one request, most recent first. A bound is unavoidable — the
 * whole journal in a prompt would be expensive and, for personal prose, a
 * disclosure without cause. The price is an honest limit: an announcement older
 * than this many days is only found by the heuristic, not by the model.
 */
export const MAX_LOOSE_END_DAYS = 14;

/** Maximum length of a quote that is taken seriously. A sentence, not a page. */
export const MAX_LOOSE_END_QUOTE_CHARS = 300;

/** Dated todos that go into the prompt as "already tracked". */
export const MAX_TRACKED_TODOS = 30;

export interface LooseEndModelInput {
  /** The same days the heuristic reads — the caller has them already. */
  days: readonly LooseEndDay[];
  todos: readonly LooseEndTodo[];
  today: string;
  /**
   * The heuristic result and its resolution check, already computed once for
   * this index and day (056 D2). When present, the model stage reuses it
   * instead of running `findLooseEnds`/`settledCheck` a second time over the
   * same `days`/`todos` — the same derivation, not a second truth.
   */
  derived?: Pick<LooseEndDerivation, 'looseEnds' | 'resolve'>;
}

export interface LooseEndModelOptions {
  gateway: LlmGateway;
  signal?: AbortSignal;
}

export interface LooseEndModelResult {
  /** Did a model answer, and was the answer readable? */
  usedLlm: boolean;
  /** Additional loose ends, checked against the files, `origin: 'model'`. */
  looseEnds: LooseEnd[];
  model: ModelRef | null;
}

function emptyResult(): LooseEndModelResult {
  return { usedLlm: false, looseEnds: [], model: null };
}

/** One block of the user's own prose, with the body line it starts on. */
interface EntryBlock {
  text: string;
  line: number;
}

/** A day as this step needs it: its record plus its own prose, block by block. */
interface DaySource {
  day: LooseEndDay;
  blocks: EntryBlock[];
}

/**
 * The days the model may judge: only days that are over (an announcement in a day
 * that has not passed cannot be due), only days that carry the user's own prose,
 * most recent first and capped.
 */
function looseEndSources(days: readonly LooseEndDay[], today: string): Map<string, DaySource> {
  const sources = new Map<string, DaySource>();
  const candidates = [...days]
    .filter((source) => source.day.date < today)
    .sort((a, b) => b.day.date.localeCompare(a.day.date));

  for (const day of candidates) {
    if (sources.size >= MAX_LOOSE_END_DAYS) break;
    const blocks = parseStream(day.doc.body)
      .filter((block) => block.kind === 'entry')
      .map((block) => ({ text: block.text, line: block.line }))
      .filter((block) => collapse(block.text).length > 0);
    if (blocks.length === 0) continue;
    sources.set(day.day.date, { day, blocks });
  }
  return sources;
}

/**
 * The file line the quoted sentence starts on — and `null` when the sentence does
 * not stand in this day at all. `quote` arrives collapsed, and the day's prose is
 * collapsed the same way: whitespace is layout, not content, and a sentence
 * across a soft line break is one sentence (the heuristic joins it likewise).
 * Everything else has to match character for character.
 *
 * Both answers come from the same walk on purpose:
 * the verbatim check and the line are the same question, "where is this sentence",
 * and a second implementation of it would be a second truth.
 */
function locate(source: DaySource, quote: string): number | null {
  if (quote.length === 0) return null;
  for (const block of source.blocks) {
    if (!collapse(block.text).includes(quote)) continue;
    /* Inside the block, the sentence the quote belongs to gives the exact line;
       a quote spanning several sentences falls back to the block's first line. */
    const fragment = sentencesOf(block.text).find((candidate) => {
      const text = collapse(candidate.text);
      return text.includes(quote) || quote.includes(text);
    });
    return source.day.doc.bodyLine + block.line + (fragment?.line ?? 0);
  }
  return null;
}

/** The subject, reduced to the words the user actually wrote in that sentence. */
function subjectFrom(quote: string, subject: string): string {
  const folded = fold(quote);
  const words = subject
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0 && folded.includes(fold(word)));
  return words.slice(0, MAX_LOOSE_END_SUBJECT_WORDS).join(' ');
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

interface RawLooseEnd {
  day: string;
  quote: string;
  subject: string;
  refDate: string;
}

function readLooseEnds(value: unknown): RawLooseEnd[] {
  if (!Array.isArray(value)) return [];
  const result: RawLooseEnd[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const day = typeof record['day'] === 'string' ? record['day'].trim() : '';
    const refDate = typeof record['refDate'] === 'string' ? record['refDate'].trim() : '';
    const quote = typeof record['quote'] === 'string' ? collapse(record['quote']) : '';
    const subject = typeof record['subject'] === 'string' ? collapse(record['subject']) : '';
    if (!ISO_DAY.test(day) || !ISO_DAY.test(refDate) || quote.length === 0) continue;
    result.push({ day, refDate, quote: quote.slice(0, MAX_LOOSE_END_QUOTE_CHARS), subject });
  }
  return result;
}

/**
 * A proposal becomes a loose end — or falls away. It falls away for an unknown
 * day, a date that is not an announcement come due, a sentence that is not in the
 * file, a sentence the heuristic already found, and one that is already settled:
 * answered by a later day or carried by a dated todo.
 */
/**
 * Where the proposed `refDate` stands inside the quote — the same anchor
 * `findLooseEnds` uses for its own subject terms. The model does not report an
 * offset, so it is recovered the same way the quote itself is grounded: run
 * the same date parser over the same text, in the same languages
 * (`SENTENCE_LANGUAGES`), and take the position of whichever
 * hit matches the date the model proposed. `undefined` when none does — the
 * settled check then falls back to reading the subject from the sentence's
 * head, exactly as it did before `at`-anchoring existed.
 */
function anchorOf(raw: RawLooseEnd): number | undefined {
  return findDates(raw.quote, raw.day, SENTENCE_LANGUAGES).find((hit) => hit.iso === raw.refDate)
    ?.at;
}

function toLooseEnd(
  raw: RawLooseEnd,
  sources: ReadonlyMap<string, DaySource>,
  today: string,
  known: ReadonlySet<string>,
  settled: (day: string, quote: string, at?: number) => boolean,
): LooseEnd | null {
  const source = sources.get(raw.day);
  if (source === undefined) return null;
  if (raw.refDate <= raw.day || raw.refDate >= today) return null;
  const line = locate(source, raw.quote);
  if (line === null) return null;
  const id = looseEndId(raw.day, raw.quote);
  if (known.has(id)) return null;
  /* The same check the heuristic runs, over the same days and todos — a model
     that overlooks the answering entry must not be able to re-open a loose end
     the files have already closed. Anchored at the same offset `findLooseEnds`
     would use, so both paths read the identical subject terms for the same
     sentence and cannot disagree about whether it is already settled. */
  if (settled(raw.day, raw.quote, anchorOf(raw))) return null;
  return {
    id,
    day: raw.day,
    path: source.day.day.path,
    line,
    quote: raw.quote,
    subject: subjectFrom(raw.quote, raw.subject),
    refDate: raw.refDate,
    origin: 'model',
  };
}

/**
 * Ask the model for what the heuristic missed. Never throws: without a route,
 * without days, on an unusable answer and on a caller's abort the result is
 * empty, and the deterministic loose ends carry the list on their own.
 *
 * Deliberately different from `auditFindings`, which re-throws an abort: this
 * step is additive. A run whose model pass was cancelled is not a failed run —
 * it is a run without judgment, and that state already has an honest name
 * (`usedLlm: false`).
 */
export async function modelLooseEnds(
  input: LooseEndModelInput,
  options: LooseEndModelOptions,
): Promise<LooseEndModelResult> {
  if (!options.gateway.isAvailable('journal-loose-ends')) return emptyResult();

  const sources = looseEndSources(input.days, input.today);
  /* No prose, nothing to read: no call, no cost, no data leaving the machine. */
  if (sources.size === 0) return emptyResult();

  const heuristic = input.derived?.looseEnds ?? findLooseEnds(input.days, input.todos, input.today);
  const known = new Set(heuristic.map((looseEnd) => looseEnd.id));
  const resolve = input.derived?.resolve ?? resolutionCheck(input.days, input.todos);
  const settled = (day: string, quote: string, at?: number): boolean =>
    resolve(day, quote, at) !== null;

  try {
    const result = await options.gateway.complete({
      task: 'journal-loose-ends',
      messages: journalLooseEndsPrompt({
        today: input.today,
        /* Oldest first in the prompt, so the same stock yields the same prompt. */
        days: [...sources.values()]
          .map((source) => ({
            date: source.day.day.date,
            text: source.blocks.map((block) => block.text).join('\n\n'),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        known: heuristic.map((looseEnd) => ({ day: looseEnd.day, quote: looseEnd.quote })),
        tracked: input.todos
          .filter((todo) => todo.due !== null)
          .map((todo) => collapse(todo.text))
          .slice(0, MAX_TRACKED_TODOS),
      }),
      schema: JOURNAL_LOOSE_ENDS_SCHEMA,
      temperature: 0,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const parsed = parseJsonLoose<Record<string, unknown>>(result.text);
    const found = new Map<string, LooseEnd>();
    for (const raw of readLooseEnds(parsed['looseEnds'])) {
      const looseEnd = toLooseEnd(raw, sources, input.today, known, settled);
      if (looseEnd === null || found.has(looseEnd.id)) continue;
      found.set(looseEnd.id, looseEnd);
      if (found.size >= MAX_LOOSE_END_PROPOSALS) break;
    }

    return {
      usedLlm: true,
      looseEnds: [...found.values()].sort((a, b) => a.day.localeCompare(b.day) || a.line - b.line),
      model: result.model,
    };
  } catch {
    /* No model, no network, broken JSON, an abort: the heuristic result stands.
       The error is deliberately not passed on and not logged — its message could
       carry the day's text (guardrail 6), and there is nothing the caller could
       do with it that `usedLlm: false` does not already say. */
    return emptyResult();
  }
}
