/* Interpret the maintenance run: name contradictions, confirm or reject
   uncertain candidates, give at most three sentences of advice.

   The model gets **only** what was already spotted deterministically — the
   findings and the excerpts of the affected pages. It doesn't search the
   vault, it judges a template. What it names is then checked hard against the
   index afterward (`core/gardener/audit.ts`): a path that doesn't exist is
   discarded, not shown.

   Two languages, kept separate: `note` travels as a named note into a vault
   file and is therefore in the document language; `advice` is read by the
   user in the screen and is in the reply language.

   A contradiction is never resolved. It's named, both versions remain
   standing (docs/MODULE-SCHEMA.md, "contradictions"). */

import type { ChatTurn, DocLanguage, GardenerFindingKind, UiLanguage } from '@shared/types';
import { clamp, documentLanguageRule, replyLanguageRule, turns } from './shared';

/** A deterministic finding, as terse as it can be while still being judgeable. */
export interface AuditFindingInput {
  id: string;
  kind: GardenerFindingKind;
  title: string;
  paths: readonly string[];
}

/** An affected page with the excerpt the judgment is based on. */
export interface AuditPageInput {
  /** Vault-relative path — must appear in the response exactly like this. */
  path: string;
  title: string;
  /** Verbatim beginning of the page. */
  excerpt: string;
  /** Pages already named as a contradiction in the frontmatter. */
  named?: readonly string[];
}

export interface GardenerAuditInput {
  today: string;
  findings: readonly AuditFindingInput[];
  pages: readonly AuditPageInput[];
  /** Finding IDs that may be confirmed or rejected. */
  candidateIds: readonly string[];
}

/** Maximum length of a page excerpt in the prompt. */
export const MAX_EXCERPT_CHARS = 700;

/** Maximum number of advice items. Nobody reads more than three. */
export const MAX_ADVICE = 3;

export const GARDENER_AUDIT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['contradictions', 'confirmed', 'rejected', 'advice'],
  properties: {
    contradictions: {
      type: 'array',
      description: 'Seitenpaare, die dieselbe Sache unterschiedlich behaupten.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pathA', 'pathB', 'note'],
        properties: {
          pathA: { type: 'string', description: 'Pfad der ersten Seite, wortwörtlich.' },
          pathB: { type: 'string', description: 'Pfad der zweiten Seite, wortwörtlich.' },
          note: {
            type: 'string',
            description: 'Ein Satz: worin der Widerspruch besteht. Keine Empfehlung.',
          },
        },
      },
    },
    confirmed: {
      type: 'array',
      description: 'Kennungen der Kandidaten, die zutreffen.',
      items: { type: 'string' },
    },
    rejected: {
      type: 'array',
      description: 'Kennungen der Kandidaten, die nicht zutreffen.',
      items: { type: 'string' },
    },
    advice: {
      type: 'array',
      description: 'Höchstens drei Sätze: was als Nächstes zu tun ist.',
      items: { type: 'string' },
    },
  },
};

function findingLines(input: GardenerAuditInput): string {
  if (input.findings.length === 0) return 'Befunde: keine.';
  const lines = input.findings.map(
    (finding) =>
      `- ${finding.id} | ${finding.kind} | ${finding.title} | ${finding.paths.join(', ')}`,
  );
  return ['Befunde (Kennung | Art | Titel | Dateien):', ...lines].join('\n');
}

function candidateLines(input: GardenerAuditInput): string {
  if (input.candidateIds.length === 0) {
    return 'Zu bestätigen oder zu verwerfen: nichts.';
  }
  return `Zu bestätigen oder zu verwerfen (nur diese Kennungen): ${input.candidateIds.join(', ')}`;
}

function pageLines(input: GardenerAuditInput): string {
  if (input.pages.length === 0) return '(keine Seiten)';
  return input.pages
    .map((page) =>
      [
        `--- Seite ---`,
        `pfad: ${page.path}`,
        `titel: ${page.title}`,
        page.named !== undefined && page.named.length > 0
          ? `bereits benannter widerspruch zu: ${page.named.join(', ')}`
          : '',
        clamp(page.excerpt, MAX_EXCERPT_CHARS),
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    )
    .join('\n\n');
}

export function gardenerAuditPrompt(
  input: GardenerAuditInput,
  docLanguage: DocLanguage,
  replyLanguage: UiLanguage,
): ChatTurn[] {
  return turns(
    [
      'Du deutest das Ergebnis eines Pflegelaufs über ein persönliches Wissensarchiv aus Markdown-Dateien.',
      documentLanguageRule(docLanguage),
      replyLanguageRule(replyLanguage),
      `Heute ist ${input.today}.`,
      'Du hast nur, was unten steht. Suche nichts hinzu und nenne keinen Pfad, der unten nicht vorkommt.',
      'Ein Widerspruch liegt vor, wenn zwei Seiten dieselbe Sache unterschiedlich behaupten (andere Zahl, andere Regel, anderer Stand). Verschiedene Themen sind kein Widerspruch, eine Ergänzung ist keiner.',
      'Löse keinen Widerspruch auf. Empfehle keine Löschung, kein Zusammenführen, kein Überschreiben. `note` ist ein Satz und beschreibt nur, worin der Konflikt besteht.',
      'Ist ein Widerspruch auf der Seite schon benannt, darfst du ihn trotzdem nennen — schreibe dann in `note`, worum es geht, ohne eine Änderung zu fordern.',
      'In `confirmed` und `rejected` stehen ausschließlich Kennungen aus der Kandidatenliste. Was du nicht beurteilen kannst, lässt du in beiden Listen weg.',
      `In \`advice\` stehen höchstens ${MAX_ADVICE} Sätze. Jeder Satz ist eine Handlung an einer der genannten Dateien. Gibt es nichts zu raten, bleibt die Liste leer.`,
      'Keine Lobsätze, keine Zusammenfassung des Auftrags, keine Emoji.',
    ],
    [findingLines(input), '', candidateLines(input), '', 'Seiten:', pageLines(input)],
  );
}
