/* Verdichtet die Wiki-Seiten eines Moduls zu den drei maschinellen Abschnitten
   `decided`, `open`, `contradictions` der Modul-Übersicht
   (`modules/<slug>/wiki/overview.md`, docs/VAULT-FORMAT.md). Mirror von
   `condense-project.ts` — dieselben Leitsätze, andere Eingaben:

   - Kein Satz ohne Beleg. Jede Eingabe ist eine Wiki-Seite des Moduls, genannt
     mit ihrem Vault-Pfad; genau diese Pfade darf das Modell in `sources`
     zurückgeben. Der Lauf (`condense/run-module.ts`) prüft das anschließend
     deterministisch nach; dieser Prompt formuliert nur die Regel.
   - Widersprüche zwischen Seiten stehen im eigenen Abschnitt `contradictions`,
     benannt und nie aufgelöst.
   - Der Abschnitt „Direktiven“ gehört dem Menschen. Er wird als Kontext
     mitgeschickt — nie zur Bearbeitung angeboten. */

import type { ChatTurn, DocLanguage } from '@shared/types';
import type { CondensedModuleArtifact } from '@core/condense/artifact';
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

/** Eine Wiki-Seite des Moduls, mit ihrem Pfad — so muss das Modell sie zitieren. */
export interface CondenseModuleSourceItem {
  path: string;
  text: string;
}

export interface CondenseModuleInput {
  title: string;
  slug: string;
  /** Der bestehende Artefaktzustand — Kontext für die Kompression, kein Auftrag ihn zu kopieren. */
  current: CondensedModuleArtifact;
  pages: readonly CondenseModuleSourceItem[];
}

const MODULE_KEYS = ['decided', 'open', 'contradictions'] as const;

function sectionSchema(description: string): Record<string, unknown> {
  return condenseSectionSchema(
    description,
    'Teilmenge der mitgeschickten Seitenpfade, aus denen dieser Text stammt.',
  );
}

/** Erwartete Antwortform. Wird als `schema` mitgeschickt. */
export const CONDENSE_MODULE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [...MODULE_KEYS],
  properties: {
    decided: sectionSchema('Was die Seiten als entschieden festhalten.'),
    open: sectionSchema('Was in den Seiten noch offen ist.'),
    contradictions: sectionSchema(
      'Wo sich Seiten widersprechen — jeder Widerspruch benannt, mit den beteiligten Seiten, nie aufgelöst. Leer, wenn es keinen gibt.',
    ),
  },
};

function pageLines(items: readonly CondenseModuleSourceItem[]): string {
  if (items.length === 0) return 'Seiten des Moduls: keine.';
  const lines = items.map(
    (item) => `--- ${item.path} ---\n${clamp(item.text, CONDENSE_ITEM_CHARS)}`,
  );
  return ['Seiten des Moduls:', ...lines].join('\n\n');
}

function currentSectionText(current: CondensedModuleArtifact): string {
  const parts = MODULE_KEYS.map((kind) => current.sections[kind].text.trim()).filter(
    (text) => text.length > 0,
  );
  return parts.length === 0 ? '(noch kein bisheriges Artefakt)' : parts.join('\n\n');
}

export function condenseModulePrompt(
  input: CondenseModuleInput,
  docLanguage: DocLanguage,
): ChatTurn[] {
  const decidedName = sectionNameFor('decided', docLanguage);
  const openName = sectionNameFor('open', docLanguage);
  const contradictionsName = sectionNameFor('contradictions', docLanguage);
  const directivesName = sectionNameFor('directives', docLanguage);

  return turns(
    [
      `Du verdichtest das Wissens-Modul „${input.title}“ zu drei Abschnitten: ${decidedName}, ${openName}, ${contradictionsName}.`,
      documentLanguageRule(docLanguage),
      `Schreibe die Überschriften und den Fließtext auf ${docLanguage === 'en' ? 'Englisch' : 'Deutsch'} — die Feldnamen der Antwort (decided, open, contradictions) bleiben englisch.`,
      'Erfinde nichts: ein Satz, der sich keiner der mitgeschickten Seiten zuordnen lässt, wird nicht geschrieben.',
      'Jeder Abschnitt trägt in `sources` genau die Pfade der Seiten, auf die er sich stützt — keine anderen, keine erfundenen.',
      `Widersprechen sich Seiten, gehört das in den Abschnitt „${contradictionsName}“: jeder Widerspruch benannt, mit den beteiligten Seiten. Löse ihn nicht auf und entscheide nicht, welche Seite recht hat.`,
      `Ziel ist ein kompaktes Ganzes: zusammen höchstens etwa ${CONDENSE_SOFT_CAP_WORDS} Wörter bzw. ${CONDENSE_SOFT_CAP_CHARS} Zeichen — für den gesamten Artefakttext, nicht pro Abschnitt.`,
      'Das bisherige Artefakt unten ist bereits verdichtetes Material: komprimiere es zusammen mit den Seiten zu etwas Kürzerem, hänge nicht einfach an.',
      `Der Abschnitt „${directivesName}“ unten ist von Hand geschrieben. Er ist Kontext, keine Aufgabe — schlage für ihn nichts vor.`,
    ],
    [
      `Modul: ${input.title} (${input.slug})`,
      '',
      `Bisheriges Artefakt (Abschnitte ${decidedName}/${openName}/${contradictionsName}):`,
      clamp(currentSectionText(input.current), 4000),
      '',
      `Abschnitt „${directivesName}“ (unverändert übernehmen, nicht bearbeiten):`,
      clamp(
        input.current.directives.content.length > 0 ? input.current.directives.content : '(leer)',
        2000,
      ),
      '',
      pageLines(input.pages),
    ],
  );
}
