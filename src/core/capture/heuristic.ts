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

import type { DocLanguage, FilingProposal, FilingTarget, Scope } from '@shared/types';
import type { DateLike } from '@core/vault/paths';
import { buildProposal } from './actions';
import type { ProposalDraft } from './actions';
import type { FilingContext } from './context';
import { dayLabel, findDates, primaryDate } from './dates';
import type { DateHit } from './dates';
import { dumpTitle } from './dump';
import {
  MENTION_WEIGHT,
  findAreaMention,
  findKnownTags,
  findModuleMention,
  findProjectMentions,
} from './mentions';
import { reasons } from './reasons';
import type { ReasonPhrases } from './reasons';
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
  /**
   * Dokumentsprache — sie benennt die Abschnitte des Vorschlags, waehlt die
   * Lexika fuer Erkennung (Stimmung, Scope, Aufgaben, Daten) und die Sprache der
   * Begruendungssaetze. Welches Projekt gemeint ist, steht weiterhin im Text,
   * nicht in dieser Einstellung — sie erweitert nur, welche Sprachtabellen
   * mitlaufen ('en' laeuft zusaetzlich zu 'de', nie an dessen Stelle).
   */
  docLanguage?: DocLanguage;
}

/** Sprachtabellen, die zur Dokumentsprache gehoeren — Deutsch bleibt immer dabei. */
function languagesFor(docLanguage: DocLanguage | undefined): readonly DocLanguage[] {
  return docLanguage === 'en' ? ['en', 'de'] : ['de'];
}

/** Scope aus den Signalwoertern: Mehrheit gewinnt, Gleichstand entscheidet nicht. */
function scopeFromSignals(text: string, languages: readonly DocLanguage[]): Scope | null {
  const signals = scopeSignals(text, languages);
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
function withDate(
  clause: string,
  dates: readonly DateHit[],
  today: string,
  language: DocLanguage,
  phrase: ReasonPhrases,
): string {
  const date = primaryDate(dates, today);
  return date === null
    ? phrase.withoutDate(clause)
    : phrase.withDate(clause, dayLabel(date.iso, today, language));
}

/**
 * Die Entscheidung. Reihenfolge ist Absicht: ein Projektbezug schlaegt alles,
 * danach zaehlt der Tag (Stimmung), dann Wissen (Link), dann ein Bereich. Bleibt
 * nichts, bleibt der Dump liegen — das ist ein ehrliches Ergebnis, kein Fehler.
 */
function decide(
  input: HeuristicInput,
  dates: readonly DateHit[],
  languages: readonly DocLanguage[],
): Decision {
  const { text, context } = input;
  const today = context.today;
  const language = input.docLanguage ?? 'de';
  const phrase = reasons(language);
  const scope = scopeFromSignals(text, languages);
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
      reason: withDate(phrase.mentionsClause(best.matched), dates, today, language, phrase),
      confidence: base + (mentions.length === 1 ? 0.05 : 0),
    };
  }

  const mood = moodSignals(text, languages);
  if (mood.length > 0) {
    const joiner = language === 'en' ? ' and ' : ' und ';
    const words = mood
      .slice(0, 2)
      .map((word) => `"${word}"`)
      .join(joiner);
    return {
      target: 'journal',
      targetKey: null,
      scope,
      reason: phrase.moodWords(words),
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
        reason: phrase.linkWithModule(hostOf(url), module.title),
        confidence: 0.35,
      };
    }
    return {
      target: 'inbox',
      targetKey: null,
      scope,
      reason: phrase.linkWithoutModule(hostOf(url)),
      confidence: 0.25,
    };
  }

  const area = findAreaMention(text, context);
  if (area !== null) {
    return {
      target: 'area',
      targetKey: area.area.slug,
      scope,
      reason: withDate(phrase.areaMentionClause(area.matched), dates, today, language, phrase),
      confidence: 0.35,
    };
  }

  return {
    target: 'inbox',
    targetKey: null,
    scope,
    reason: phrase.noMatch,
    confidence: 0.2,
  };
}

/** Die Rohentscheidung, bevor Pfade und Markdown daraus werden. */
export function heuristicDraft(input: HeuristicInput): ProposalDraft {
  const text = input.text.replace(/\r\n/g, '\n').trim();
  const today = input.context.today;
  const languages = languagesFor(input.docLanguage);
  const dates = findDates(text, today, languages);
  const decision = decide(input, dates, languages);
  const scope = input.scope ?? decision.scope ?? 'private';
  const project = decision.target === 'project' ? decision.targetKey : null;
  const tasks = heuristicTasks(text, { now: today, scope, project, languages });
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
  return buildProposal(
    heuristicDraft(input),
    input.context,
    input.now ?? input.context.today,
    input.docLanguage ?? 'de',
  );
}
