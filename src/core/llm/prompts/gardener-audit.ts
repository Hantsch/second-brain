/* Den Pflegelauf deuten: Widersprüche benennen, unscharfe Kandidaten bestätigen
   oder verwerfen, höchstens drei Sätze Rat geben.

   Das Modell bekommt **nur**, was deterministisch schon aufgefallen ist — die
   Befunde und die Ausschnitte der betroffenen Seiten. Es sucht nicht im Vault, es
   urteilt über eine Vorlage. Was es nennt, wird danach hart gegen den Index
   geprüft (`core/gardener/audit.ts`): ein Pfad, den es nicht gibt, wird verworfen,
   nicht angezeigt.

   Zwei Sprachen, getrennt: `note` wandert als benannte Notiz in eine Vault-Datei
   und steht deshalb in der Dokumentsprache; `advice` liest der Nutzer im Screen
   und steht in der Antwortsprache.

   Ein Widerspruch wird nie aufgelöst. Er wird benannt, beide Fassungen bleiben
   stehen (docs/MODULE-SCHEMA.md, „Widersprüche"). */

import type { ChatTurn, DocLanguage, GardenerFindingKind, UiLanguage } from '@shared/types';
import { clamp, documentLanguageRule, replyLanguageRule, turns } from './shared';

/** Ein deterministischer Befund, so knapp wie er gedeutet werden kann. */
export interface AuditFindingInput {
  id: string;
  kind: GardenerFindingKind;
  title: string;
  paths: readonly string[];
}

/** Eine betroffene Seite mit dem Ausschnitt, über den geurteilt wird. */
export interface AuditPageInput {
  /** Vault-relativer Pfad — genau so muss er in der Antwort stehen. */
  path: string;
  title: string;
  /** Wortwörtlicher Anfang der Seite. */
  excerpt: string;
  /** Seiten, die im Frontmatter schon als Widerspruch benannt sind. */
  named?: readonly string[];
}

export interface GardenerAuditInput {
  today: string;
  findings: readonly AuditFindingInput[];
  pages: readonly AuditPageInput[];
  /** Befund-Kennungen, die bestätigt oder verworfen werden dürfen. */
  candidateIds: readonly string[];
}

/** Höchstlänge eines Seitenausschnitts im Prompt. */
export const MAX_EXCERPT_CHARS = 700;

/** Höchstzahl an Ratschlägen. Mehr als drei liest niemand. */
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
