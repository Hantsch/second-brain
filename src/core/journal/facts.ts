/**
 * Was ein Tageseintrag ueber Personen, Projekte und Befinden sagt.
 *
 * Das sind die Frontmatter-Felder des Tages (`people`, `projects`, `mood`,
 * `energy`, `tags`) — und sie sind ein **Vorschlag**. Geschrieben wird hier
 * nichts.
 *
 * Zwei Wege, dasselbe Ergebnis:
 * - **Mit Modell** (`journal-close`-Prompt auf der Aufgabe `extract-tasks`, weil
 *   es dieselbe kleine, strukturierte Arbeit ist). Jede Antwort wird hart gegen
 *   den Text geprueft: eine Person, die im Eintrag nicht vorkommt, faellt weg.
 * - **Ohne Modell** aus Signalen: Wartende sind mit Sicherheit Menschen, bekannte
 *   Namen aus frueheren Tagen sind wiedererkennbar, Projektnennungen kommen aus
 *   dem Ablage-Kontext des Erfassens.
 *
 * Stimmung wird nur gemeldet, wenn der Text sie hergibt. Eine erfundene Zahl auf
 * der eigenen Stimmung ist schlimmer als keine.
 */

import type { DocLanguage, WaitingOn } from '@shared/types';
import {
  findEntities,
  findKnownTags,
  findProjectMentions,
  moodSignals,
  sentences,
} from '@core/capture';
import type { AreaCandidate, ProjectCandidate } from '@core/capture';
import { fold } from '@core/index/text';
import type { IndexedDoc } from '@core/index/types';
import { isAbortError, parseJsonLoose } from '@core/llm';
import type { LlmGateway } from '@core/llm';
import { JOURNAL_CLOSE_SCHEMA, journalClosePrompt } from '@core/llm/prompts';
import type { JournalFrontmatterSuggestion, JournalIndexView } from './types';

/** Mehr Personen als das nennt ein Tag selten, und mehr braucht kein Frontmatter. */
const MAX_PEOPLE = 8;
/** Mehr Tags sind keine Schlagworte mehr, sondern eine zweite Erzaehlung. */
const MAX_TAGS = 3;

/* Die Gefuehlsworte aus `core/capture/lexicon` (MOOD_WORDS), nach Richtung
   getrennt: nur diese Trennung erlaubt eine Zahl. Was hier nicht steht, wird
   erkannt, aber nicht gedeutet. */
const LOW_ENERGY = new Set([
  'muede',
  'erschoepft',
  'ausgelaugt',
  'kraftlos',
  'keine kraft',
  'keine energie',
  'schlecht geschlafen',
]);

const LOW_MOOD = new Set([
  'stress',
  'gestresst',
  'ueberfordert',
  'ueberforderung',
  'zu viel',
  'genervt',
  'traurig',
  'wuetend',
  'angst',
  'sorge',
  'sorgen',
  'einsam',
  'unruhig',
  'kopf voll',
]);

const HIGH_MOOD = new Set(['dankbar', 'erleichtert']);

/** Stimmung und Energie, wenn der Text sie hergibt. */
const LOW_LEVEL = 2;
const HIGH_LEVEL = 4;

export interface DayFacts extends JournalFrontmatterSuggestion {
  /** Ohne Modell entstanden. */
  heuristic: boolean;
}

export interface FactsInput {
  /** Der Tageseintrag — nur was der Mensch selbst geschrieben hat. */
  text: string;
  /** Kalendertag des Eintrags. */
  date: string;
  /** Projekte, die zugeordnet werden duerfen. */
  projects: readonly ProjectCandidate[];
  /** Bereiche, die zugeordnet werden duerfen. */
  areas: readonly AreaCandidate[];
  /** Namen, die im Vault schon vorkommen — sie halten die Schreibweise stabil. */
  people: readonly string[];
  /** Gebraeuchliche Tags des Vaults. */
  tags: readonly string[];
  /** Wartende aus der Aufgaben-Extraktion; das sind mit Sicherheit Menschen. */
  waitingOn?: readonly WaitingOn[];
}

export interface FactsDeps {
  gateway: LlmGateway;
  docLanguage?: DocLanguage;
  signal?: AbortSignal;
}

/** Alle Personen, die in frueheren Tageseintraegen genannt wurden. */
export function knownPeople(index: JournalIndexView): string[] {
  const names = new Set<string>();
  for (const doc of index.index().docs) {
    if (doc.docType !== 'journal') continue;
    for (const name of asNames(doc)) names.add(name);
  }
  return [...names];
}

function asNames(doc: IndexedDoc): string[] {
  const value = doc.frontmatter['people'];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Kommt der Name so im Text vor? Sonst ist er nicht genannt, sondern geraten. */
function mentioned(name: string, text: string): boolean {
  return fold(text).includes(fold(name));
}

function uniqueNames(names: readonly string[], text: string): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = fold(name);
    if (name.length === 0 || seen.has(key) || !mentioned(name, text)) continue;
    seen.add(key);
    found.push(name);
    if (found.length >= MAX_PEOPLE) break;
  }
  return found;
}

/** Stimmung und Energie aus den Gefuehlsworten des Textes. */
export function heuristicMood(text: string): { mood: number | null; energy: number | null } {
  const words = moodSignals(text).map((word) => fold(word));
  const low = words.filter((word) => LOW_MOOD.has(word)).length;
  const high = words.filter((word) => HIGH_MOOD.has(word)).length;
  const tired = words.some((word) => LOW_ENERGY.has(word));
  return {
    /* Gleich viele Worte in beide Richtungen sagen nichts — dann bleibt es offen. */
    mood: low === high ? null : low > high ? LOW_LEVEL : HIGH_LEVEL,
    energy: tired ? LOW_LEVEL : null,
  };
}

/** Die Felder ohne Modell: Wartende, wiedererkannte Namen, Projektnennungen. */
export function heuristicFacts(input: FactsInput): DayFacts {
  const text = input.text;
  const waiting = (input.waitingOn ?? []).map((entry) => entry.who);
  const entities = findEntities(sentences(text), MAX_PEOPLE * 2);
  const knownHere = entities.filter((word) =>
    input.people.some((name) => fold(name) === fold(word)),
  );
  return {
    people: uniqueNames([...waiting, ...knownHere], text),
    projects: findProjectMentions(text, input.projects).map((hit) => hit.project.slug),
    /* Bereiche werden nie geraten — nur das Modell darf sie vorschlagen. Ohne
       Modell bleibt die Liste leer, auch wenn ein Bereichsname im Text steht. */
    areas: [],
    ...heuristicMood(text),
    tags: findKnownTags(text, input.tags).slice(0, MAX_TAGS),
    heuristic: true,
  };
}

interface RawFacts {
  people?: unknown;
  projects?: unknown;
  areas?: unknown;
  mood?: unknown;
  energy?: unknown;
  tags?: unknown;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function asLevel(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const level = Math.trunc(value);
  return level >= 1 && level <= 5 ? level : null;
}

/**
 * Die Modellantwort absichern. Erlaubt ist nur, was der Text und der Bestand
 * decken: genannte Namen, bekannte Projekt-Slugs, Zahlen von 1 bis 5.
 */
export function sanitizeFacts(value: unknown, input: FactsInput, fallback: DayFacts): DayFacts {
  const raw = (value ?? {}) as RawFacts;
  const allowed = new Set(input.projects.map((project) => project.slug));
  const projects = asStrings(raw.projects)
    .map((slug) => slug.trim())
    .filter((slug) => allowed.has(slug));
  const allowedAreas = new Set(input.areas.map((area) => area.slug));
  const areas = asStrings(raw.areas)
    .map((slug) => slug.trim())
    .filter((slug) => allowedAreas.has(slug));
  const tags = asStrings(raw.tags)
    .map((tag) => tag.trim().replace(/^#/, '').toLowerCase())
    .filter((tag) => tag.length > 0);
  return {
    people: uniqueNames([...asStrings(raw.people), ...fallback.people], input.text),
    projects: [...new Set([...projects, ...fallback.projects])],
    areas: [...new Set([...areas, ...fallback.areas])],
    mood: asLevel(raw.mood) ?? fallback.mood,
    energy: asLevel(raw.energy) ?? fallback.energy,
    tags: [...new Set([...tags, ...fallback.tags])].slice(0, MAX_TAGS),
    heuristic: false,
  };
}

/**
 * Die Felder des Tages herausziehen. Steht kein Modell (oder antwortet es
 * unbrauchbar), kommt das Heuristik-Ergebnis zurueck — nie ein Fehler.
 */
export async function dayFacts(deps: FactsDeps, input: FactsInput): Promise<DayFacts> {
  const fallback = heuristicFacts(input);
  const text = input.text.trim();
  if (text.length === 0 || !deps.gateway.isAvailable('extract-tasks')) return fallback;

  try {
    const result = await deps.gateway.complete({
      task: 'extract-tasks',
      messages: journalClosePrompt(
        {
          text,
          date: input.date,
          projects: input.projects.map((project) => ({
            slug: project.slug,
            title: project.title,
          })),
          areas: input.areas.map((area) => ({ slug: area.slug, title: area.title })),
          people: input.people,
          tags: input.tags,
        },
        deps.docLanguage ?? 'de',
      ),
      schema: JOURNAL_CLOSE_SCHEMA,
      temperature: 0,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
    });
    return sanitizeFacts(parseJsonLoose<RawFacts>(result.text), input, fallback);
  } catch (error) {
    /* Kein Modell, kein Netz, kaputtes JSON: die Signale tragen weiter. Nur ein
       Abbruch des Aufrufers ist ein echter Abbruch. */
    if (isAbortError(error)) throw error;
    return fallback;
  }
}
