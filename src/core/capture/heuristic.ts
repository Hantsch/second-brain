/**
 * Einordnen ohne Sprachmodell.
 *
 * Das ist kein Notbehelf, sondern die Untergrenze der App: ohne Modell muss ein
 * Dump trotzdem begruendet irgendwo landen (Guardrail 1). Aus den Signalen
 * (`mentions`, `dates`, `signals`, `tasks`) wird hier eine Entscheidung — und
 * daraus ein vollstaendiger `FilingProposal`.
 *
 * Zwei Selbstbeschraenkungen:
 * - `confidence` bleibt unter `MAX_CONFIDENCE`. Eine Heuristik hat nie recht,
 *   sie hat einen Verdacht.
 * - `reason` nennt den echten Grund („Erwaehnt 'Kundenportal' und einen Termin am
 *   15.08."), nicht eine Floskel. Der Nutzer soll widersprechen koennen.
 */

import type { FilingProposal, FilingTarget, Scope } from '@shared/types';
import type { DateLike } from '@core/vault/paths';
import { buildProposal } from './actions';
import type { ProposalDraft } from './actions';
import type { FilingContext } from './context';
import { findDates, germanDay, primaryDate } from './dates';
import type { DateHit } from './dates';
import { dumpTitle } from './dump';
import {
  MENTION_WEIGHT,
  findAreaMention,
  findKnownTags,
  findModuleMention,
  findProjectMentions,
} from './mentions';
import { findEntities, findUrls, hostOf, moodSignals, scopeSignals, sentences } from './signals';
import { heuristicTasks } from './tasks';

/** Obergrenze der Zuversicht ohne Modell. */
export const MAX_CONFIDENCE = 0.6;

export interface HeuristicInput {
  dumpPath: string;
  text: string;
  context: FilingContext;
  /** Das „jetzt". Tests geben eine feste Zeit. */
  now?: DateLike;
  /** Vom Nutzer beim Erfassen gesetzte Tags — sie gelten, sie werden nicht geraten. */
  tags?: readonly string[];
  /** Vom Nutzer beim Erfassen gesetzter Scope. */
  scope?: Scope | null;
}

/** Scope aus den Signalwoertern: Mehrheit gewinnt, Gleichstand entscheidet nicht. */
function scopeFromSignals(text: string): Scope | null {
  const signals = scopeSignals(text);
  if (signals.work.length > signals.private.length) return 'work';
  if (signals.private.length > signals.work.length) return 'private';
  return null;
}

interface Decision {
  target: FilingTarget;
  targetKey: string | null;
  scope: Scope | null;
  reason: string;
  confidence: number;
}

/** Begruendung mit Termin, wenn einer im Text steht. */
function withDate(clause: string, dates: readonly DateHit[], today: string): string {
  const date = primaryDate(dates, today);
  return date === null
    ? `${clause}.`
    : `${clause} und einen Termin am ${germanDay(date.iso, today)}`;
}

/**
 * Die Entscheidung. Reihenfolge ist Absicht: ein Projektbezug schlaegt alles,
 * danach zaehlt der Tag (Stimmung), dann Wissen (Link), dann ein Bereich. Bleibt
 * nichts, bleibt der Dump liegen — das ist ein ehrliches Ergebnis, kein Fehler.
 */
function decide(input: HeuristicInput, dates: readonly DateHit[]): Decision {
  const { text, context } = input;
  const today = context.today;
  const scope = scopeFromSignals(text);
  const mentions = findProjectMentions(text, context.projects);
  const best = mentions[0];

  /* Ein Treffer, der nur auf einem gemeinsamen Tag beruht, benennt kein Projekt —
     er sagt „gleiches Themenfeld". Ein Text, der mit „Idee:" anfaengt, gehoert
     nicht in ein Projekt, dessen Tags 'idee' enthalten. Also zaehlt hier nur, was
     mehr wiegt als ein Tag; sonst entscheiden die naechsten Regeln. */
  if (best !== undefined && best.score > MENTION_WEIGHT.tag) {
    // Ein voller Titel oder Slug wiegt schwerer als ein einzelnes Titelwort, und
    // ein einziges passendes Projekt schwerer als eine Auswahl.
    const base = best.score >= MENTION_WEIGHT.title ? 0.4 : 0.3;
    return {
      target: 'project',
      targetKey: best.project.slug,
      scope: best.project.scope,
      reason: withDate(`Erwähnt "${best.matched}"`, dates, today),
      confidence: base + (mentions.length === 1 ? 0.05 : 0),
    };
  }

  const mood = moodSignals(text);
  if (mood.length > 0) {
    const words = mood
      .slice(0, 2)
      .map((word) => `"${word}"`)
      .join(' und ');
    return {
      target: 'journal',
      targetKey: null,
      scope,
      reason: `Enthält Gefühlsworte (${words}) und keinen Projektbezug.`,
      confidence: 0.3 + Math.min(0.15, 0.05 * mood.length),
    };
  }

  const url = findUrls(text)[0];
  if (url !== undefined) {
    const module = findModuleMention(text, context.modules);
    if (module !== null) {
      return {
        target: 'module',
        targetKey: module.slug,
        scope,
        reason: `Enthält einen Link (${hostOf(url)}) und passt zum Modul "${module.title}".`,
        confidence: 0.35,
      };
    }
    return {
      target: 'inbox',
      targetKey: null,
      scope,
      reason: `Enthält einen Link (${hostOf(url)}), aber kein Modul, in das er gehört.`,
      confidence: 0.25,
    };
  }

  const area = findAreaMention(text, context);
  if (area !== null) {
    return {
      target: 'area',
      targetKey: area.area.slug,
      scope,
      reason: withDate(`Erwähnt "${area.matched}" aus einem laufenden Bereich`, dates, today),
      confidence: 0.35,
    };
  }

  return {
    target: 'inbox',
    targetKey: null,
    scope,
    reason: 'Kein Projektbezug, kein Tagesbezug und keine Quelle erkennbar — bleibt liegen.',
    confidence: 0.2,
  };
}

/** Die Rohentscheidung, bevor Pfade und Markdown daraus werden. */
export function heuristicDraft(input: HeuristicInput): ProposalDraft {
  const text = input.text.replace(/\r\n/g, '\n').trim();
  const today = input.context.today;
  const dates = findDates(text, today);
  const decision = decide(input, dates);
  const scope = input.scope ?? decision.scope ?? 'private';
  const project = decision.target === 'project' ? decision.targetKey : null;
  const tasks = heuristicTasks(text, { now: today, scope, project });
  const userTags = (input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  const tags = [...new Set([...userTags, ...findKnownTags(text, input.context.tags)])];

  // Ein Termin und ein klares Scope-Signal sind Bestaetigungen, keine Beweise:
  // sie heben die Zuversicht, aber nie ueber die Obergrenze.
  let confidence = decision.confidence;
  if (dates.length > 0) confidence += 0.05;
  if (decision.scope !== null) confidence += 0.05;

  return {
    dumpPath: input.dumpPath,
    text,
    title: dumpTitle(text),
    scope,
    tags,
    target: decision.target,
    targetKey: decision.targetKey,
    newProjectTitle: null,
    section: null,
    todos: tasks.todos,
    waitingOn: tasks.waitingOn,
    entities: findEntities(sentences(text)),
    reason: decision.reason,
    confidence: Math.min(MAX_CONFIDENCE, confidence),
    heuristic: true,
  };
}

/** Der vollstaendige Vorschlag ohne Modell. */
export function heuristicProposal(input: HeuristicInput): FilingProposal {
  return buildProposal(heuristicDraft(input), input.context, input.now ?? input.context.today);
}
