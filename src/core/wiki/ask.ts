/**
 * Fragen beantworten — nur aus dem Vault, mit Beleg und Fundstelle.
 *
 * Der Weg ist immer derselbe, und er endet nie in einem toten Zustand:
 * 1. **Kandidaten** aus der Volltextsuche, optional vom Modell sortiert.
 * 2. **Keine Treffer** → ehrliche Absage. Ohne Beleg wird kein Modell gefragt: es
 *    haette nichts zu lesen und wuerde raten (Guardrail 3).
 * 3. **Kein Modell** → die Suchtreffer selbst sind die Antwort („ich kann nicht
 *    formulieren, aber hier sind die Stellen"). Die Ausschnitte stehen woertlich in
 *    den Dateien und sind damit gueltige Belege.
 * 4. **Mit Modell** → streamende Antwort, danach jede Fundstelle geprueft
 *    (`citations.ts`). Ein Zitat, das nirgends steht, wird verworfen und die Antwort
 *    als `unsupported` markiert.
 */

import type { DocType, Scope, UiLanguage } from '@shared/types';
import { LlmUnavailableError, isAbortError, parseJsonLoose } from '@core/llm';
import { queryAnswerPrompt } from '@core/llm';
import type { IndexedDoc } from '@core/index/types';
import { citationsFromExcerpts, validateCitations, type CitationSource } from './citations';
import { buildExcerpt, questionTerms } from './excerpts';
import { QUERY_RERANK_SCHEMA, applyOrder, rerankPrompt } from './rerank';
import { phrases } from './text';
import { WikiError } from './types';
import type { WikiAnswer, WikiDeps, WikiExcerpt, WikiIndexView } from './types';

/** So viele Ausschnitte gehen in eine Antwort. */
export const DEFAULT_RETRIEVE_LIMIT = 6;
/** So viele Kandidaten holt die Suche, bevor sortiert wird. */
export const CANDIDATE_FACTOR = 3;
/** Obergrenze der Kandidatenliste — mehr kostet nur Tokens. */
export const MAX_CANDIDATES = 24;

export interface RetrieveOptions {
  /** Auf ein Modul einschraenken. */
  module?: string | null;
  /** Auf Arbeit oder Privat einschraenken. */
  scope?: Scope | null;
  /** Auf Dokumenttypen einschraenken. */
  types?: readonly DocType[];
  limit?: number;
}

/**
 * Kandidaten zu einer Frage: Volltextsuche, dann je Treffer ein wortwoertlicher
 * Ausschnitt mit Zeilennummer. Leere Frage und leerer Vault liefern eine leere
 * Liste — das ist ein Ergebnis, kein Fehler.
 */
export function retrieve(
  index: WikiIndexView,
  question: string,
  options: RetrieveOptions = {},
): WikiExcerpt[] {
  const text = (question ?? '').trim();
  if (text.length === 0) return [];
  const limit = Math.max(1, options.limit ?? DEFAULT_RETRIEVE_LIMIT);
  const hits = index.search({
    text,
    limit: Math.min(MAX_CANDIDATES, limit),
    ...(options.module === undefined || options.module === null ? {} : { module: options.module }),
    ...(options.types === undefined ? {} : { types: [...options.types] }),
  });
  const byPath = index.index().byPath;
  const terms = questionTerms(text);
  const excerpts: WikiExcerpt[] = [];

  for (const hit of hits) {
    const doc = byPath.get(hit.path);
    if (doc === undefined) continue;
    if (options.scope !== undefined && options.scope !== null && doc.scope !== options.scope) {
      continue;
    }
    const slice = buildExcerpt(doc, terms);
    if (slice === null) continue;
    excerpts.push({
      path: hit.path,
      title: hit.title,
      module: doc.module,
      quote: slice.quote,
      line: slice.line,
      score: hit.score,
    });
    if (excerpts.length >= limit) break;
  }
  return excerpts;
}

export interface AskInput extends RetrieveOptions {
  question: string;
  /** Frueherer Verlauf desselben Gesprächs, aeltester zuerst. */
  history?: readonly { role: 'user' | 'assistant'; content: string }[];
  /** Sprache, in der dem Nutzer geantwortet wird (Oberflaechensprache). */
  replyLanguage?: UiLanguage;
  /** Jedes Textstueck der Antwort, sobald es da ist. Nur mit Modell. */
  onDelta?: (delta: string) => void;
}

/** Die Reihenfolge vom Modell sortieren lassen. Faellt sie aus, bleibt es, wie es war. */
async function rerank(
  deps: WikiDeps,
  question: string,
  candidates: readonly WikiExcerpt[],
): Promise<WikiExcerpt[]> {
  if (candidates.length < 2 || !deps.gateway.isAvailable('query-rerank')) return [...candidates];
  try {
    const result = await deps.gateway.complete({
      task: 'query-rerank',
      messages: rerankPrompt(
        question,
        candidates.map((entry) => ({
          path: entry.path,
          title: entry.title,
          snippet: entry.quote,
        })),
        deps.docLanguage ?? 'de',
      ),
      schema: QUERY_RERANK_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    const parsed = parseJsonLoose<{ order?: unknown }>(result.text);
    return applyOrder(candidates, parsed.order);
  } catch (error) {
    if (isAbortError(error)) throw error;
    return [...candidates];
  }
}

/** Die ganzen Dateien hinter den Ausschnitten — nur darin darf ein Zitat stehen. */
function sourcesFor(index: WikiIndexView, excerpts: readonly WikiExcerpt[]): CitationSource[] {
  const byPath = index.index().byPath;
  const sources: CitationSource[] = [];
  for (const excerpt of excerpts) {
    const doc: IndexedDoc | undefined = byPath.get(excerpt.path);
    if (doc === undefined) continue;
    sources.push({
      path: doc.path,
      title: doc.title,
      body: doc.body,
      bodyLine: doc.bodyLine,
    });
  }
  return sources;
}

/** Die Stellen als Antwort: ohne Modell formuliert die App nicht, sie zeigt. */
function passagesAnswer(deps: WikiDeps, excerpts: readonly WikiExcerpt[]): string {
  const text = phrases(deps.docLanguage ?? 'de');
  const lines = excerpts.map((entry) => `- ${entry.title} — ${entry.path}:${entry.line}`);
  return [text.noModel, '', ...lines].join('\n');
}

/**
 * Eine Frage beantworten. Wirft nur bei leerer Frage oder Abbruch des Aufrufers;
 * jeder andere Ausfall wird ein ehrlicher Zustand in `WikiAnswer`.
 */
export async function askQuestion(deps: WikiDeps, input: AskInput): Promise<WikiAnswer> {
  const question = (input.question ?? '').trim();
  if (question.length === 0) throw new WikiError('invalid', 'Frage ohne Text.');
  const limit = Math.max(1, input.limit ?? DEFAULT_RETRIEVE_LIMIT);
  const candidates = retrieve(deps.index, question, {
    ...input,
    limit: Math.min(MAX_CANDIDATES, limit * CANDIDATE_FACTOR),
  });

  if (candidates.length === 0) {
    // Kein Beleg, kein Modellaufruf: die App raet nicht.
    return {
      question,
      answer: phrases(deps.docLanguage ?? 'de').noEvidence,
      citations: [],
      excerpts: [],
      unsupported: true,
      usedLlm: false,
      model: null,
    };
  }

  const ranked = (await rerank(deps, question, candidates)).slice(0, limit);
  const fallback: WikiAnswer = {
    question,
    answer: passagesAnswer(deps, ranked),
    citations: citationsFromExcerpts(ranked),
    excerpts: [...ranked],
    unsupported: false,
    usedLlm: false,
    model: null,
  };
  if (!deps.gateway.isAvailable('query-answer')) return fallback;

  const messages = queryAnswerPrompt(
    {
      question,
      excerpts: ranked.map((entry) => ({
        path: entry.path,
        title: entry.title,
        snippet: entry.quote,
        line: entry.line,
      })),
      ...(input.history === undefined ? {} : { history: input.history }),
      ...(input.module === undefined ? {} : { module: input.module }),
    },
    deps.docLanguage ?? 'de',
    input.replyLanguage ?? deps.docLanguage ?? 'de',
  );

  try {
    const request = {
      task: 'query-answer' as const,
      messages,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    };
    const result =
      input.onDelta === undefined
        ? await deps.gateway.complete(request)
        : await deps.gateway.stream(request, input.onDelta);
    const checked = validateCitations(result.text, ranked, sourcesFor(deps.index, ranked));
    return {
      question,
      answer: result.text.trim(),
      citations: checked.citations,
      excerpts: [...ranked],
      unsupported: checked.unsupported,
      usedLlm: true,
      model: result.model,
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof LlmUnavailableError) return fallback;
    throw error;
  }
}
