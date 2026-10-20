/**
 * Der Ablage-Vorschlag: ein Dump kommt herein, die App sagt begruendet, wohin er
 * gehoert.
 *
 * Der Weg ist immer derselbe, mit oder ohne Modell:
 * 1. Dump lesen, Entscheidungskontext aus dem Index bauen.
 * 2. Heuristik entscheiden lassen — das ist das Fundament, nicht der Notfall.
 * 3. Steht ein Modell, wird es gefragt und seine Antwort **hart** gegen den
 *    Kontext geprueft. Ein Ziel, das es nicht gibt, ist keine Einordnung: es wird
 *    verworfen und die Heuristik behaelt das Wort.
 * 4. Fehlende Felder kommen aus der Heuristik. Faellt das Modell aus, ist das
 *    Ergebnis die Heuristik — nie ein Fehler nach oben (Guardrail 1).
 */

import type { DocLanguage, FilingProposal, FilingTarget, Scope, VaultDoc } from '@shared/types';
import { CLASSIFY_DUMP_SCHEMA, classifyDumpPrompt, isAbortError, parseJsonLoose } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import type { DateLike } from '@core/vault/paths';
import { buildProposal } from './actions';
import type { ProposalDraft } from './actions';
import { buildFilingContext, findArea, findModule, findProject, narrowContext } from './context';
import type { CaptureIndex, FilingContext } from './context';
import { FilingError } from './filing';
import { heuristicDraft } from './heuristic';
import { sanitizeTodos, sanitizeWaiting } from './tasks';

/** Ziele, die das Modell waehlen darf. */
const TARGETS: readonly FilingTarget[] = [
  'project',
  'journal',
  'area',
  'module',
  'new-project',
  'inbox',
];

/** Hoechstzahl an Tags, die aus einer Modellantwort uebernommen werden. */
const MAX_TAGS = 6;

/** Was das Einordnen zum Lesen braucht — bewusst schmal. */
export interface ClassifyStore {
  read(path: string): Promise<VaultDoc | null>;
}

export interface ClassifyDeps {
  store: ClassifyStore;
  index: CaptureIndex;
  gateway: LlmGateway;
  /**
   * Sprache, in der Titel und Notizen geschrieben werden — und in der die
   * Abschnitte des Vorschlags heissen. Vorgabe `'de'`.
   */
  docLanguage?: DocLanguage;
  /** Das „jetzt". Tests geben eine feste Zeit. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** Die geprueften Felder einer Modellantwort. `null` heisst „nichts Brauchbares". */
interface Verdict {
  title: string | null;
  scope: Scope | null;
  tags: string[] | null;
  target: FilingTarget | null;
  targetKey: string | null;
  newProjectTitle: string | null;
  section: string | null;
  reason: string | null;
  confidence: number | null;
  todos: unknown;
  waitingOn: unknown;
  entities: string[] | null;
}

function asText(value: unknown, maxChars = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed.slice(0, maxChars);
}

/** Eine Liste kurzer Zeichenketten; `null`, wenn nichts Brauchbares darin stand. */
function asList(value: unknown, limit: number, lower = false): string[] | null {
  if (!Array.isArray(value)) return null;
  const items: string[] = [];
  for (const entry of value) {
    const text = asText(entry, 40);
    if (text === null) continue;
    const item = lower ? text.toLowerCase().replace(/^#/, '') : text;
    if (item.length > 0 && !items.includes(item)) items.push(item);
    if (items.length >= limit) break;
  }
  return items.length === 0 ? null : items;
}

function asScope(value: unknown): Scope | null {
  if (value === 'work') return 'work';
  if (value === 'private' || value === 'privat') return 'private';
  return null;
}

/**
 * Zielpruefung: ein Projekt, Modul oder Bereich muss im Kontext stehen. Steht es
 * nicht drin, hat das Modell es sich ausgedacht — dann gilt das ganze Ziel als
 * nicht gesetzt und die Heuristik entscheidet.
 */
function verifyTarget(
  raw: unknown,
  key: string | null,
  newTitle: string | null,
  context: FilingContext,
): { target: FilingTarget; targetKey: string | null } | null {
  const target = TARGETS.find((candidate) => candidate === raw) ?? null;
  if (target === null) return null;
  if (target === 'project') {
    return findProject(context, key) === null ? null : { target, targetKey: key };
  }
  if (target === 'module') {
    return findModule(context, key) === null ? null : { target, targetKey: key };
  }
  if (target === 'area') {
    return findArea(context, key) === null ? null : { target, targetKey: key };
  }
  if (target === 'new-project') {
    return newTitle === null ? null : { target, targetKey: null };
  }
  return { target, targetKey: null };
}

function readVerdict(raw: Record<string, unknown>): Verdict {
  const confidence = typeof raw['confidence'] === 'number' ? raw['confidence'] : null;
  return {
    title: asText(raw['title'], 120),
    scope: asScope(raw['scope']),
    tags: asList(raw['tags'], MAX_TAGS, true),
    target: TARGETS.find((candidate) => candidate === raw['target']) ?? null,
    targetKey: asText(raw['targetKey'], 80),
    newProjectTitle: asText(raw['newProjectTitle'], 120),
    section: asText(raw['section'], 40),
    reason: asText(raw['reason'], 300),
    confidence:
      confidence === null || Number.isNaN(confidence) ? null : Math.min(1, Math.max(0, confidence)),
    todos: raw['todos'],
    waitingOn: raw['waitingOn'],
    entities: asList(raw['entities'], 8),
  };
}

/**
 * Modellantwort ueber die Heuristik legen. Alles, was die Pruefung nicht besteht,
 * bleibt so, wie die Heuristik es gesetzt hat — es gibt keinen halben Vorschlag.
 */
function merge(base: ProposalDraft, verdict: Verdict, context: FilingContext): ProposalDraft {
  const resolved = verifyTarget(
    verdict.target,
    verdict.targetKey,
    verdict.newProjectTitle,
    context,
  );
  const target = resolved ?? { target: base.target, targetKey: base.targetKey };
  const project = target.target === 'project' ? target.targetKey : null;
  const allowed = new Set(context.projects.map((candidate) => candidate.slug));
  const scope = verdict.scope ?? base.scope;
  const todos = sanitizeTodos(verdict.todos, { scope, project }, allowed);
  const waiting = sanitizeWaiting(verdict.waitingOn, context.today);

  return {
    ...base,
    title: verdict.title ?? base.title,
    scope,
    tags: verdict.tags ?? base.tags,
    target: target.target,
    targetKey: target.targetKey,
    newProjectTitle: target.target === 'new-project' ? verdict.newProjectTitle : null,
    section: verdict.section,
    todos: todos.length > 0 ? todos : base.todos,
    waitingOn: waiting.length > 0 ? waiting : base.waitingOn,
    entities: verdict.entities ?? base.entities,
    // Eine Begruendung, die zum verworfenen Ziel gehoert, waere eine Luege.
    reason: (resolved === null ? base.reason : verdict.reason) ?? base.reason,
    confidence: resolved === null ? base.confidence : (verdict.confidence ?? base.confidence),
    heuristic: resolved === null,
  };
}

/**
 * Einen Dump einordnen. Das Ergebnis ist immer ein vollstaendiger Vorschlag —
 * `heuristic: true` sagt, dass kein Modell daran beteiligt war.
 */
export async function classifyDump(deps: ClassifyDeps, dumpPath: string): Promise<FilingProposal> {
  const doc = await deps.store.read(dumpPath);
  if (doc === null) throw new FilingError('not-found', `Dump fehlt: ${dumpPath}`);

  const text = doc.body.replace(/\r\n/g, '\n').trim();
  const context = buildFilingContext(deps.index, { now: deps.now ?? new Date(), text });
  const tags = Array.isArray(doc.frontmatter['tags']) ? (doc.frontmatter['tags'] as string[]) : [];
  const docLanguage = deps.docLanguage ?? 'de';
  const base = heuristicDraft({
    dumpPath,
    text,
    context,
    tags,
    scope: asScope(doc.frontmatter['scope']),
    docLanguage,
  });
  const at = deps.now ?? context.today;

  if (text.length === 0 || !deps.gateway.isAvailable('classify-dump')) {
    return buildProposal(base, context, at, docLanguage);
  }

  try {
    const narrow = narrowContext(deps.index, context, text);
    const result = await deps.gateway.complete({
      task: 'classify-dump',
      messages: classifyDumpPrompt(
        {
          text,
          today: context.today,
          projects: narrow.projects,
          modules: narrow.modules,
          areas: narrow.areas.map((area) => area.slug),
          knownTags: context.tags,
        },
        docLanguage,
      ),
      schema: CLASSIFY_DUMP_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    const parsed = parseJsonLoose<Record<string, unknown>>(result.text);
    const verdict = readVerdict(parsed);
    return buildProposal(merge(base, verdict, context), context, at, docLanguage);
  } catch (error) {
    // Kein Modell, kein Netz, kaputtes JSON: die Heuristik traegt. Nur ein Abbruch
    // des Aufrufers ist ein echter Abbruch.
    if (isAbortError(error)) throw error;
    return buildProposal(base, context, at, docLanguage);
  }
}
