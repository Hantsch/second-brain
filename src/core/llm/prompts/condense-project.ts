/* Verdichtet die Eingaben eines Projekts zu den vier maschinellen Abschnitten
   `state`, `next-step`, `waiting-on`, `learned` (docs/VAULT-FORMAT.md,
   „Condensed project"). Mirror von `condense-area.ts` — dieselben Leitsätze,
   eine Ebene höher:

   - Kein Satz ohne Beleg. Was das Modell schreibt, muss auf eine der
     mitgeschickten Eingaben zurückzuführen sein — genau die, die es in
     `sources` zurückgeben darf. Der Lauf (`condense/run-project.ts`, D8)
     prüft das anschließend deterministisch nach; dieser Prompt formuliert
     nur die Regel.
   - Eine Eingabe ist entweder ein Vault-Pfad oder ein `agent:<kind>/<pathKey>`-
     Verweis auf eine Agenten-Session (`condense/agent-ref.ts`, Story 044 Q2/D12).
     Beide Formen sind gleichberechtigt legale `sources`-Einträge; das Modell
     erfindet keine dritte Form.
   - Der Abschnitt „Direktiven" gehört dem Menschen. Er wird als Kontext
     mitgeschickt, damit das Modell weiß, welche Vorgaben gelten — nie zur
     Bearbeitung angeboten.

   Entscheidung D8 der Story 044: die Kürzungs-Notiz (AC 5), falls die Auswahl
   unvollständig war, schreibt der deterministische Lauf selbst in den
   Artefakttext — sie wird hier nicht vom Modell verlangt. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import type { CondensedProjectArtifact } from '@core/condense/artifact';
import { sectionNameFor } from '@core/vault/section-names';
import {
  CONDENSE_ITEM_CHARS,
  CONDENSE_SOFT_CAP_CHARS,
  CONDENSE_SOFT_CAP_WORDS,
  clamp,
  documentLanguageRule,
  turns,
} from './shared';

/** Eine Eingabe, aus der verdichtet wird — Notiz, Todo, Warteeintrag oder Tageseintrag. */
export interface CondenseProjectSourceItem {
  /** Vault-relativer Pfad oder `agent:<kind>/<pathKey>` — genau so muss das Modell ihn in `sources` zitieren. */
  path: string;
  text: string;
}

export interface CondenseProjectInput {
  title: string;
  scope: string;
  slug: string;
  /** Der bestehende Artefaktzustand — Kontext für die Kompression, kein Auftrag ihn zu kopieren. */
  current: CondensedProjectArtifact;
  /** `project.md`s Stand-Abschnitt, als eine einzelne Eingabe. */
  state: CondenseProjectSourceItem;
  notes: readonly CondenseProjectSourceItem[];
  todos: readonly CondenseProjectSourceItem[];
  waitingOn: readonly CondenseProjectSourceItem[];
  days: readonly CondenseProjectSourceItem[];
  /** Transkript-Ausschnitte verlinkter Agenten-Sessions, mit `agent:`-Pfad. */
  sessions: readonly CondenseProjectSourceItem[];
  /**
   * Ob der deterministische Selektor (D6) nur einen Teil der verfügbaren Eingaben
   * gelesen hat. Rein informativ für das Modell — die Kürzungs-Notiz im Artefakttext
   * schreibt der Lauf selbst (Decision D8), nicht das Modell.
   */
  truncated: boolean;
}

function sectionSchema(description: string): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['text', 'sources'],
    properties: {
      text: { type: 'string', description },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Teilmenge der mitgeschickten Eingaben, aus denen dieser Text stammt — Vault-Pfad oder agent:<kind>/<pathKey>.',
      },
    },
  };
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
export const CONDENSE_PROJECT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['state', 'next-step', 'waiting-on', 'learned'],
  properties: {
    state: sectionSchema(
      'Was aktuell gilt: der Wiedereinstiegspunkt. Widersprüche zwischen Eingaben werden hier als Widerspruch benannt, nicht aufgelöst.',
    ),
    'next-step': sectionSchema('Was als Nächstes zu tun ist.'),
    'waiting-on': sectionSchema('Worauf gerade gewartet wird und von wem.'),
    learned: sectionSchema('Was sich als Erkenntnis herausgestellt hat — kein Ratschlag.'),
  },
};

/**
 * Per-item cap when an input is folded into the prompt text — independent of
 * D6's own read bounds (90-day window, 3-session cap, transcript clamp). D6
 * reads a note or day entry **verbatim**; this cap only limits what the model
 * gets to *see* of it, so the input budget (`{in: 8000, out: 1200}`,
 * story 044 Q3) holds even for a long note. `run-project.ts` sums what this
 * clamp drops (`promptItemsClampedChars`) and folds it into the truncation
 * notice — a claim that reads "the whole file" in `sources:` while the model
 * saw only part of it is exactly the AC-5 gap story 037 had to fix.
 *
 * Re-exported under the project-specific name so a caller that only knows this
 * module does not have to reach into `shared.ts`; the number itself is the one
 * `condense-area.ts` uses too (review fix — the two were a literal `1500` each,
 * free to drift apart).
 */
export const CONDENSE_PROJECT_ITEM_CHARS = CONDENSE_ITEM_CHARS;

function itemLines(label: string, items: readonly CondenseProjectSourceItem[]): string {
  if (items.length === 0) return `${label}: keine.`;
  const lines = items.map(
    (item) => `--- ${item.path} ---\n${clamp(item.text, CONDENSE_PROJECT_ITEM_CHARS)}`,
  );
  return [`${label}:`, ...lines].join('\n\n');
}

/**
 * Characters the prompt's own per-item cap drops across a set of inputs — the
 * same items `itemLines()` renders, so the two never drift apart. Used by
 * `run-project.ts` to state in the artifact when the model was shown less
 * than the whole of a verbatim-read input.
 */
export function promptItemsClampedChars(items: readonly CondenseProjectSourceItem[]): number {
  // Mirrors clamp()'s own rule: it trims first and only cuts what's left over
  // the cap, so counting `item.text.length` here would overstate the drop for
  // any item with surrounding whitespace (a doc body keeps its trailing
  // newline) — a false "N characters trimmed" in the artifact when nothing was.
  return items.reduce(
    (sum, item) => sum + Math.max(0, item.text.trim().length - CONDENSE_PROJECT_ITEM_CHARS),
    0,
  );
}

function currentSectionText(current: CondensedProjectArtifact): string {
  const parts = (['state', 'next-step', 'waiting-on', 'learned'] as const)
    .map((kind) => current.sections[kind].text.trim())
    .filter((text) => text.length > 0);
  return parts.length === 0 ? '(noch kein bisheriges Artefakt)' : parts.join('\n\n');
}

export function condenseProjectPrompt(
  input: CondenseProjectInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  const stateName = sectionNameFor('state', docLanguage);
  const nextStepName = sectionNameFor('next-step', docLanguage);
  const waitingOnName = sectionNameFor('waiting-on', docLanguage);
  const learnedName = sectionNameFor('learned', docLanguage);
  const directivesName = sectionNameFor('directives', docLanguage);

  return turns(
    [
      `Du verdichtest das Projekt „${input.title}“ zu vier Abschnitten: ${stateName}, ${nextStepName}, ${waitingOnName}, ${learnedName}.`,
      documentLanguageRule(docLanguage),
      `Schreibe die Überschriften und den Fließtext auf ${docLanguage === 'en' ? 'Englisch' : 'Deutsch'} — die Feldnamen der Antwort (state, next-step, waiting-on, learned) bleiben englisch.`,
      'Erfinde nichts: ein Satz, der sich keiner der mitgeschickten Eingaben zuordnen lässt, wird nicht geschrieben.',
      'Jeder Abschnitt trägt in `sources` genau die Pfade der Eingaben, auf die er sich stützt — keine anderen, keine erfundenen.',
      'Eine Quelle ist entweder ein Vault-Pfad (z. B. "projects/work/nyota/notes/kickoff.md") oder ein Agenten-Verweis der Form "agent:claude/<pathKey>" (z. B. "agent:claude/c--dev-nyota") — beide Formen sind gültig, keine dritte.',
      `Ziel ist ein kompaktes Ganzes: zusammen höchstens etwa ${CONDENSE_SOFT_CAP_WORDS} Wörter bzw. ${CONDENSE_SOFT_CAP_CHARS} Zeichen — für den gesamten Artefakttext, nicht pro Abschnitt.`,
      'Das bisherige Artefakt unten ist bereits verdichtetes Material: komprimiere es zusammen mit den neuen Eingaben zu etwas Kürzerem, hänge nicht einfach an.',
      `Widersprechen sich Eingaben, wird das im Abschnitt „${stateName}“ als Widerspruch benannt — keine eigene Kategorie dafür.`,
      `Der Abschnitt „${directivesName}“ unten ist von Hand geschrieben. Er ist Kontext, keine Aufgabe — schlage für ihn nichts vor.`,
      input.truncated
        ? 'Die Eingabenauswahl ist unvollständig: nur ein Teil der verfügbaren Notizen, Todos, Warteeinträge, Tageseinträge oder Session-Transkripte wurde mitgeschickt. Das ist reiner Kontext für dich — die Notiz darüber im Artefakttext schreibt der Lauf selbst, nicht du.'
        : '',
    ],
    [
      `Projekt: ${input.title} (${input.scope}/${input.slug})`,
      '',
      `Bisheriges Artefakt (Abschnitte ${stateName}/${nextStepName}/${waitingOnName}/${learnedName}):`,
      clamp(currentSectionText(input.current), 4000),
      '',
      `Abschnitt „${directivesName}“ (unverändert übernehmen, nicht bearbeiten):`,
      clamp(
        input.current.directives.content.length > 0 ? input.current.directives.content : '(leer)',
        2000,
      ),
      '',
      itemLines('Stand des Projekts', [input.state]),
      '',
      itemLines('Notizen des Projekts', input.notes),
      '',
      itemLines('Todos des Projekts', input.todos),
      '',
      itemLines('Wartet-auf-Einträge des Projekts', input.waitingOn),
      '',
      itemLines('Tageseinträge mit diesem Projekt', input.days),
      '',
      itemLines('Ausschnitte verlinkter Agenten-Sessions', input.sessions),
    ],
  );
}
