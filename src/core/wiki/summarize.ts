/**
 * Eine Quelle verdichten — **einmal**, beim Ingest.
 *
 * Lange Quellen (Transcripts) werden abschnittsweise verdichtet und die
 * Teilergebnisse zusammengefuehrt (`chunk.ts`). Kurze Quellen kosten genau einen
 * Aufruf: nie mehr ans Modell schicken als noetig.
 *
 * Ohne Modell gibt es hier `markdown: null` — und keinen Fehler. Der Ingest traegt
 * die Rohquelle dann trotzdem ein (docs/CONCEPT.md, Guardrail 1); verloren geht
 * nichts, es fehlt nur die Verdichtung.
 */

import type { DocLanguage, ModelRef } from '@shared/types';
import {
  LlmUnavailableError,
  isAbortError,
  mergeSummariesClampedChars,
  mergeSummariesPrompt,
  summarizeSourcePrompt,
  type KnownPageHint,
  type SummarySections,
} from '@core/llm';
import { splitForSummary } from './chunk';
import { phrases } from './text';
import type { WikiDeps } from './types';

/** Die Abschnitte einer Source-Seite in der Dokumentsprache. */
export function summarySections(language: DocLanguage = 'de'): SummarySections {
  const text = phrases(language);
  return {
    about: text.about,
    claims: text.claims,
    novel: text.novel,
    contradictions: text.contradictions,
  };
}

export interface CondenseInput {
  title: string;
  text: string;
  /** Herkunft: Pfad unter `raw/` oder URL. */
  origin?: string | null;
  /** Seiten des Moduls — daran erkennt das Modell, was neu ist. */
  known?: readonly KnownPageHint[];
}

export interface CondenseResult {
  /** Die Verdichtung als Markdown, oder `null` wenn kein Modell verdichten konnte. */
  markdown: string | null;
  usedLlm: boolean;
  model: ModelRef | null;
  /** Wie viele Teilstuecke verdichtet wurden. 1 = ein Aufruf, kein Zusammenfuehren. */
  parts: number;
  /**
   * Zeichen, die der Zusammenfuehrungs-Clamp (`mergeSummariesClampedChars`)
   * tatsaechlich abgeschnitten hat, bevor die Teilverdichtungen ans Modell
   * gingen. 0 ausserhalb des Zusammenfuehrens — nur eine lange Quelle mit
   * mehreren Teilstuecken durchlaeuft diesen Schritt ueberhaupt (Story 050, D6).
   */
  clampedChars: number;
}

/** Frontmatter und Titelzeile aus einer Modellantwort entfernen — das schreibt die App. */
export function cleanMarkdown(text: string): string {
  let body = text.replace(/\r\n/g, '\n').trim();
  if (body.startsWith('---')) {
    const end = body.indexOf('\n---', 3);
    if (end >= 0) body = body.slice(end + 4).trim();
  }
  return body.replace(/^#\s+.*\n?/, '').trim();
}

/**
 * Die Quelle verdichten. Faellt das Modell aus, ist das Ergebnis
 * `{ markdown: null, usedLlm: false }` — nur ein Abbruch des Aufrufers ist ein
 * echter Abbruch.
 */
export async function condenseSource(
  deps: WikiDeps,
  input: CondenseInput,
): Promise<CondenseResult> {
  const empty: CondenseResult = {
    markdown: null,
    usedLlm: false,
    model: null,
    parts: 0,
    clampedChars: 0,
  };
  const chunks = splitForSummary(input.text);
  if (chunks.length === 0) return empty;
  if (!deps.gateway.isAvailable('summarize-source')) return { ...empty, parts: chunks.length };

  const language = deps.docLanguage ?? 'de';
  const sections = summarySections(language);
  const base = {
    title: input.title,
    sections,
    /* Die Einstellung `languages.translateSources`, durchgereicht: aus heisst, die
       Verdichtung bleibt in der Sprache der Quelle. */
    translate: deps.translateSources !== false,
    ...(input.origin === undefined ? {} : { origin: input.origin }),
    ...(input.known === undefined ? {} : { known: input.known }),
  };

  /*
   * Ein Bruchteil je verdichtetem Stueck, gedeckelt bei 0.9: der letzte Zehntel
   * bleibt dem Schreib-Tick nach der Verdichtung vorbehalten (`ingest.ts`), damit
   * der Balken nach dem letzten Stueck noch einmal sichtbar weiterwandert, statt
   * schon hier auf den Endwert zu springen (Story 050, D7).
   */
  const chunkProgress = (done: number): number => (done / chunks.length) * 0.9;

  /**
   * Der Tick, der den Zusammenfuehrungs-Aufruf einleitet — zwischen dem letzten
   * Stueck-Tick (hoechstens 0.9) und dem Endwert `1`, den `ingestSource` erst
   * nach dem Schreiben setzt.
   */
  const MERGE_PROGRESS = 0.95;

  try {
    if (chunks.length === 1) {
      const result = await deps.gateway.complete({
        task: 'summarize-source',
        messages: summarizeSourcePrompt({ ...base, text: chunks[0] ?? '' }, language),
        temperature: 0,
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      });
      deps.onProgress?.(chunkProgress(1));
      return {
        markdown: cleanMarkdown(result.text),
        usedLlm: true,
        model: result.model,
        parts: 1,
        clampedChars: 0,
      };
    }

    const parts: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const result = await deps.gateway.complete({
        task: 'summarize-source',
        messages: summarizeSourcePrompt(
          {
            ...base,
            text: chunks[index] ?? '',
            part: { index: index + 1, total: chunks.length },
          },
          language,
        ),
        temperature: 0,
        ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      });
      parts.push(cleanMarkdown(result.text));
      deps.onProgress?.(chunkProgress(index + 1));
    }
    /*
     * Ohne diesen Tick faellt der Balken zwischen dem letzten Stueck-Tick (0.9)
     * und dem Ende der Zusammenfuehrung fuer die gesamte Dauer dieses (oft
     * groessten) Modellaufrufs auf einen sichtbar stillen Wert zurueck — genau
     * das Symptom, das AC5 (Story 050, D7) ausschliesst. `MERGE_PROGRESS` liegt
     * bewusst zwischen dem letzten Stueck-Tick und dem Endwert `1`, den
     * `ingestSource` nach dem Schreiben setzt, und markiert damit "jetzt wird
     * zusammengefuehrt" als eigenen, unterscheidbaren Schritt.
     */
    deps.onProgress?.(MERGE_PROGRESS);
    const merged = await deps.gateway.complete({
      task: 'summarize-source',
      messages: mergeSummariesPrompt({ ...base, parts }, language),
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    return {
      markdown: cleanMarkdown(merged.text),
      usedLlm: true,
      model: merged.model,
      parts: chunks.length,
      clampedChars: mergeSummariesClampedChars(parts),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof LlmUnavailableError) return { ...empty, parts: chunks.length };
    // Ein kaputter oder leerer Antworttext ist kein Datenverlust: die Rohquelle wird
    // trotzdem eingetragen, nur unverdichtet.
    return { ...empty, parts: chunks.length };
  }
}
