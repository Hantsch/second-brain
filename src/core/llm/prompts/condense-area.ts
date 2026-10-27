/* Verdichtet die Eingaben einer Area zu den drei maschinellen Abschnitten
   `state`, `patterns`, `open` (docs/VAULT-FORMAT.md, „Condensed area").

   Zwei Leitsätze, beide aus Guardrail 3 ("keine Halluzination"):

   - Kein Satz ohne Beleg. Was das Modell schreibt, muss auf einen der
     mitgeschickten Eingabepfade zurückzuführen sein — genau die Pfade, die
     es in `sources` zurückgeben darf. Der Lauf (`condense/run.ts`, D7)
     prüft das anschließend deterministisch nach; dieser Prompt formuliert
     nur die Regel.
   - Der Abschnitt „Direktiven" gehört dem Menschen. Er wird als Kontext
     mitgeschickt, damit das Modell weiß, welche Vorgaben gelten — nie zur
     Bearbeitung angeboten.

   Entscheidung D8 der Story: die Kürzungs-Notiz (AC 5), falls die Auswahl
   unvollständig war, schreibt der deterministische Lauf selbst in den
   Artefakttext — sie wird hier nicht vom Modell verlangt. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import type { CondensedArtifact } from '@core/condense/artifact';
import { sectionNameFor } from '@core/vault/section-names';
import {
  CONDENSE_ITEM_CHARS,
  CONDENSE_SOFT_CAP_CHARS,
  CONDENSE_SOFT_CAP_WORDS,
  clamp,
  condenseSectionSchema,
  documentLanguageRule,
  turns,
} from './shared';

/**
 * Der weiche Zielwert für den ganzen Artefakttext, nicht pro Abschnitt (Decision Q3).
 * Die Zahlen selbst leben seit Story 044 (D21) in `shared.ts` — hier nur ein
 * Re-Export unter dem bisherigen Namen, damit kein Aufrufer dieses Moduls bricht.
 */
export const CONDENSE_AREA_TARGET_WORDS = CONDENSE_SOFT_CAP_WORDS;
export const CONDENSE_AREA_TARGET_CHARS = CONDENSE_SOFT_CAP_CHARS;

/** Eine Eingabe, aus der verdichtet wird — Notiz, Todo oder Tageseintrag. */
export interface CondenseAreaSourceItem {
  /** Vault-relativer Pfad — genau so muss das Modell ihn in `sources` zitieren. */
  path: string;
  text: string;
}

export interface CondenseAreaInput {
  title: string;
  slug: string;
  /** Der bestehende Artefaktzustand — Kontext für die Kompression, kein Auftrag ihn zu kopieren. */
  current: CondensedArtifact;
  notes: readonly CondenseAreaSourceItem[];
  todos: readonly CondenseAreaSourceItem[];
  days: readonly CondenseAreaSourceItem[];
  /**
   * Ob der deterministische Selektor (D5) nur einen Teil der verfügbaren Eingaben
   * gelesen hat. Rein informativ für das Modell — die Kürzungs-Notiz im Artefakttext
   * schreibt der Lauf selbst (Decision D8), nicht das Modell.
   */
  truncated: boolean;
}

function sectionSchema(description: string): Record<string, unknown> {
  return condenseSectionSchema(
    description,
    'Teilmenge der mitgeschickten Eingabepfade, aus denen dieser Text stammt.',
  );
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
export const CONDENSE_AREA_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'patterns', 'open'],
  properties: {
    state: sectionSchema(
      'Was aktuell gilt: der Wiedereinstiegspunkt. Widersprüche zwischen Eingaben werden hier als Widerspruch benannt, nicht aufgelöst.',
    ),
    patterns: sectionSchema('Was sich wiederholt — beobachtete Muster, kein Ratschlag.'),
    open: sectionSchema('Was noch offen ist.'),
  },
};

function itemLines(label: string, items: readonly CondenseAreaSourceItem[]): string {
  if (items.length === 0) return `${label}: keine.`;
  const lines = items.map(
    (item) => `--- ${item.path} ---\n${clamp(item.text, CONDENSE_ITEM_CHARS)}`,
  );
  return [`${label}:`, ...lines].join('\n\n');
}

function currentSectionText(current: CondensedArtifact): string {
  const parts = (['state', 'patterns', 'open'] as const)
    .map((kind) => current.sections[kind].text.trim())
    .filter((text) => text.length > 0);
  return parts.length === 0 ? '(noch kein bisheriges Artefakt)' : parts.join('\n\n');
}

export function condenseAreaPrompt(input: CondenseAreaInput, docLanguage: DocLanguage): ChatTurn[] {
  const stateName = sectionNameFor('state', docLanguage);
  const patternsName = sectionNameFor('patterns', docLanguage);
  const openName = sectionNameFor('open', docLanguage);
  const directivesName = sectionNameFor('directives', docLanguage);

  return turns(
    [
      `Du verdichtest die Area „${input.title}“ zu drei Abschnitten: ${stateName}, ${patternsName}, ${openName}.`,
      documentLanguageRule(docLanguage),
      `Schreibe die Überschriften und den Fließtext auf ${docLanguage === 'en' ? 'Englisch' : 'Deutsch'} — die Feldnamen der Antwort (state, patterns, open) bleiben englisch.`,
      'Erfinde nichts: ein Satz, der sich keiner der mitgeschickten Eingaben zuordnen lässt, wird nicht geschrieben.',
      'Jeder Abschnitt trägt in `sources` genau die Pfade der Eingaben, auf die er sich stützt — keine anderen, keine erfundenen.',
      `Ziel ist ein kompaktes Ganzes: zusammen höchstens etwa ${CONDENSE_AREA_TARGET_WORDS} Wörter bzw. ${CONDENSE_AREA_TARGET_CHARS} Zeichen — für den gesamten Artefakttext, nicht pro Abschnitt.`,
      'Das bisherige Artefakt unten ist bereits verdichtetes Material: komprimiere es zusammen mit den neuen Eingaben zu etwas Kürzerem, hänge nicht einfach an.',
      `Widersprechen sich Eingaben, wird das im Abschnitt „${stateName}“ als Widerspruch benannt — keine eigene Kategorie dafür.`,
      `Der Abschnitt „${directivesName}“ unten ist von Hand geschrieben. Er ist Kontext, keine Aufgabe — schlage für ihn nichts vor.`,
      input.truncated
        ? 'Die Eingabenauswahl ist unvollständig: nur ein Teil der verfügbaren Notizen, Todos oder Tageseinträge wurde mitgeschickt. Das ist reiner Kontext für dich — die Notiz darüber im Artefakttext schreibt der Lauf selbst, nicht du.'
        : '',
    ],
    [
      `Area: ${input.title} (${input.slug})`,
      '',
      `Bisheriges Artefakt (Abschnitte ${stateName}/${patternsName}/${openName}):`,
      clamp(currentSectionText(input.current), 4000),
      '',
      `Abschnitt „${directivesName}“ (unverändert übernehmen, nicht bearbeiten):`,
      clamp(
        input.current.directives.content.length > 0 ? input.current.directives.content : '(leer)',
        2000,
      ),
      '',
      itemLines('Notizen der Area', input.notes),
      '',
      itemLines('Todos der Area', input.todos),
      '',
      itemLines('Tageseinträge mit dieser Area', input.days),
    ],
  );
}
