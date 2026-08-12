/* Eine Quelle **einmal** verdichten — der teuerste und wichtigste Schritt des
   Karpathy-Wikis (docs/MODULE-SCHEMA.md). Was hier entsteht, ist der Fixpunkt, den
   spaetere Antworten zitieren; deshalb wird nicht bei jeder Frage neu abgeleitet.

   Vier Dinge muss die Verdichtung leisten: worum es geht, die tragenden Aussagen
   **mit Belegstelle**, was gegenueber dem Bestand neu ist, und wo sie dem Bestand
   widerspricht. Ein Widerspruch ist kein Defekt, der weggebuegelt wird.

   Die Abschnitts-Ueberschriften kommen von aussen: sie stehen in der Dokumentsprache
   und gehoeren zum Vault-Format, nicht in die LLM-Schicht. Lange Quellen (Transcripts)
   werden abschnittsweise verdichtet und mit `mergeSummariesPrompt` zusammengefuehrt.

   `translate` entscheidet, ob eine fremdsprachige Quelle in die Dokumentsprache
   uebersetzt wird (Einstellung `languages.translateSources`). Aus: die Verdichtung
   bleibt in der Sprache der Quelle — nur die Ueberschriften stehen weiter in der
   Dokumentsprache, denn sie gehoeren dem Vault-Format. Wer das abschaltet, will die
   Aussagen im Wortlaut der Quelle lesen, nicht durch eine Uebersetzung hindurch. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import { clamp, documentLanguageRule, turns } from './shared';

/** Die vier Abschnitte einer Source-Seite, in der Dokumentsprache. */
export interface SummarySections {
  about: string;
  claims: string;
  novel: string;
  contradictions: string;
}

/** Eine Seite, die es im Modul schon gibt — daran haengt „neu" und „widerspricht". */
export interface KnownPageHint {
  slug: string;
  title: string;
  /** Erster Absatz der Seite; mehr braucht das Modell nicht, um Bezug zu erkennen. */
  excerpt?: string;
}

export interface SummarizeSourceInput {
  title: string;
  /** Der Quelltext, schon auf ein Teilstueck zugeschnitten. */
  text: string;
  /** Herkunft: Pfad unter `raw/` oder URL. Wird als Beleg genannt, nicht erfunden. */
  origin?: string | null;
  sections: SummarySections;
  known?: readonly KnownPageHint[];
  /** Teilstueck `index` von `total` — nur gesetzt, wenn abschnittsweise verdichtet wird. */
  part?: { index: number; total: number };
  /** Hoechstlaenge des mitgeschickten Textes. */
  maxChars?: number;
  /**
   * Fremdsprachige Quellen in die Dokumentsprache uebersetzen
   * (`languages.translateSources`). Vorgabe `true` — so war es, bevor die
   * Einstellung einen Leser hatte.
   */
  translate?: boolean;
}

const MAX_KNOWN = 20;

function knownLine(page: KnownPageHint): string {
  const excerpt = page.excerpt === undefined ? '' : ` — ${page.excerpt}`;
  return `- [[${page.slug}]] ${page.title}${excerpt}`;
}

function knownBlock(known: readonly KnownPageHint[] | undefined): string[] {
  const pages = (known ?? []).slice(0, MAX_KNOWN);
  if (pages.length === 0) return ['Bestand im Modul: (noch keine Seiten)'];
  return ['Bestand im Modul:', pages.map(knownLine).join('\n')];
}

/**
 * Die Sprachregel dieser Aufgabe. Ohne Uebersetzung bleibt der Text in der Sprache
 * der Quelle, die Ueberschriften aber in der Dokumentsprache: sie sind Format, kein
 * Inhalt, und `sections` gibt sie ohnehin wortwoertlich vor.
 */
function languageRule(docLanguage: DocLanguage, translate: boolean): string {
  return translate
    ? documentLanguageRule(docLanguage)
    : 'Schreibe in der Sprache der Quelle. Uebersetze nicht — nur die vorgegebenen Abschnitts-Ueberschriften stehen wortwoertlich so da, wie sie unten genannt sind.';
}

/** Die Regeln, die fuer Verdichten und Zusammenfuehren gleich gelten. */
function commonRules(
  input: { sections: SummarySections; translate?: boolean },
  docLanguage: DocLanguage,
): string[] {
  const { about, claims, novel, contradictions } = input.sections;
  return [
    'Du verdichtest eine Quelle zu einer Wiki-Seite in einem persoenlichen Second Brain.',
    languageRule(docLanguage, input.translate !== false),
    `Gliedere die Antwort in genau diese Abschnitte als Markdown-Ueberschriften zweiter Ebene: "## ${about}", "## ${claims}", "## ${novel}", "## ${contradictions}".`,
    `Unter "${about}" stehen zwei bis vier Saetze: worum es geht und fuer wen.`,
    `Unter "${claims}" stehen die tragenden Aussagen als Stichpunkte. Jede Aussage nennt ihre Belegstelle in Klammern — Abschnittstitel, Zeitmarke oder woertliches Zitat aus dem Text. Ohne Belegstelle keine Aussage.`,
    `Unter "${novel}" steht, was gegenueber dem Bestand neu ist, mit Verweis auf die betroffene Seite als [[slug]].`,
    `Unter "${contradictions}" steht, wo die Quelle dem Bestand widerspricht: beide Fassungen benennen, den Konflikt in einem Satz beschreiben. Widersprueche werden benannt, nicht geglaettet. Gibt es keinen, schreibe "keine".`,
    'Halte Version, Datum und Umgebung fest, wo sie die Aussage tragen. Verallgemeinere eine versionsspezifische Technik nicht zu allgemeinem Rat.',
    'Trenne Belegtes von Empfehlung. Was die Quelle nur vermutet, steht als Vermutung da.',
    'Ein woertliches Zitat bleibt im Original, wenn der Wortlaut zaehlt; die Uebersetzung steht daneben.',
    'Erfinde nichts. Steht etwas nicht in der Quelle, steht es auch nicht in der Zusammenfassung. Keine Einleitung, kein Lob, keine Emoji.',
  ];
}

/**
 * Eine Quelle (oder ein Abschnitt daraus) verdichten. Bei `part` bleibt die
 * Antwort ausdruecklich Teilergebnis — zusammengefuehrt wird danach.
 */
export function summarizeSourcePrompt(
  input: SummarizeSourceInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  const part = input.part;
  return turns(
    [
      ...commonRules(input, docLanguage),
      part === undefined
        ? ''
        : `Dies ist Abschnitt ${part.index} von ${part.total} einer langen Quelle. Verdichte nur diesen Abschnitt und wiederhole nichts aus anderen Abschnitten. Was du nicht siehst, existiert fuer dich nicht.`,
      input.origin === undefined || input.origin === null || input.origin.length === 0
        ? ''
        : `Die Quelle liegt unter ${input.origin}. Nenne diese Herkunft, wenn sie eine Aussage traegt.`,
    ],
    [
      `Titel der Quelle: ${input.title.trim()}`,
      '',
      ...knownBlock(input.known),
      '',
      part === undefined ? 'Quelle:' : `Quelle, Abschnitt ${part.index}/${part.total}:`,
      clamp(input.text, input.maxChars ?? 8000),
    ],
  );
}

export interface MergeSummariesInput {
  title: string;
  /** Die Teilergebnisse in Reihenfolge. */
  parts: readonly string[];
  sections: SummarySections;
  known?: readonly KnownPageHint[];
  maxChars?: number;
  /** Dieselbe Zusage wie beim Verdichten — sonst uebersetzte der letzte Schritt doch. */
  translate?: boolean;
}

/**
 * Teilergebnisse zu einer Seite zusammenfuehren. Nichts geht verloren, nichts wird
 * doppelt gesagt — und ein Widerspruch **zwischen** den Teilen wird benannt.
 */
export function mergeSummariesPrompt(
  input: MergeSummariesInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  return turns(
    [
      ...commonRules(input, docLanguage),
      'Dir liegen Teilverdichtungen derselben Quelle vor. Fuehre sie zu einer Seite zusammen: Dubletten weg, Reihenfolge sachlich, Belegstellen behalten.',
      `Widersprechen sich zwei Teile, benenne das unter "${input.sections.contradictions}" mit beiden Belegstellen.`,
    ],
    [
      `Titel der Quelle: ${input.title.trim()}`,
      '',
      ...knownBlock(input.known),
      '',
      'Teilverdichtungen:',
      clamp(
        input.parts.map((part, index) => `--- Teil ${index + 1} ---\n${part.trim()}`).join('\n\n'),
        input.maxChars ?? 12000,
      ),
    ],
  );
}
