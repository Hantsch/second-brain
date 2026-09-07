/* Projekte, Todos, Warte-auf und Journal — die Dinge, die den Kopf freihalten. */

import type { BaseFrontmatter, Scope } from './vault';

export type ProjectStatus = 'idea' | 'active' | 'waiting' | 'paused' | 'done' | 'dropped';

export type ProvenanceOrigin = 'user' | 'suggestion' | 'filing';

/** Who set a value, and when — day granularity, like `started`/`deadline`/`updated`. */
export interface Provenance {
  at: string;
  by: ProvenanceOrigin;
}

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  'idea',
  'active',
  'waiting',
  'paused',
  'done',
  'dropped',
];

export interface WaitingOn {
  /** Auf wen wird gewartet. */
  who: string;
  /** Worauf. */
  what: string;
  /** Seit wann, ISO-Datum. */
  since: string;
  /** Bis wann eine Antwort da sein sollte, ISO-Datum. */
  due?: string;
  /** Bereits erledigt/beantwortet. */
  resolved?: boolean;
}

export interface ProjectFrontmatter extends BaseFrontmatter {
  type: 'project';
  slug: string;
  scope: Scope;
  status: ProjectStatus;
  /** 1 = zuerst, 5 = irgendwann. */
  priority?: number;
  /** User- or app-set star; missing or anything but `true` counts as not-favourited. */
  favorite?: boolean;
  started?: string;
  /** Harte Frist des Projekts, ISO-Datum. */
  deadline?: string;
  /** Der eine nächste Schritt — was der Nutzer beim Wiedereinstieg zuerst liest. */
  next_step?: string;
  /** Where `status` came from and when it was set. */
  status_set?: Provenance;
  /** Where `next_step` came from and when it was set. */
  next_step_set?: Provenance;
  waiting_on?: WaitingOn[];
  /** Verknüpfte Wissens-Module (Ordnernamen unter `modules/`). */
  modules?: string[];
  /** Zugehörige Code-Verzeichnisse — Brücke zu den Claude-Sessions. */
  repos?: string[];
}

/** Ein Projekt, wie der Renderer es braucht: Frontmatter plus abgeleitete Fakten. */
export interface Project {
  path: string;
  slug: string;
  title: string;
  scope: Scope;
  status: ProjectStatus;
  priority: number;
  /** Starred by the user (or the app) to surface it immediately. */
  favorite: boolean;
  deadline: string | null;
  nextStep: string | null;
  /** Where `status` came from and when — undefined if the file never recorded it. */
  statusSet?: Provenance;
  /** Where `next_step` came from and when — undefined if the file never recorded it. */
  nextStepSet?: Provenance;
  /**
   * `next_step` predates work that happened since: `lastTouch`'s calendar day is
   * strictly after `nextStepSet.at`. Always `false` without a `nextStepSet` — nothing
   * invented for a value whose origin isn't recorded at all.
   */
  nextStepStale: boolean;
  waitingOn: WaitingOn[];
  tags: string[];
  modules: string[];
  repos: string[];
  /** Jüngste Spur: Dateiänderung im Projekt oder Claude-Session, ISO. */
  lastTouch: string;
  /** Woher `lastTouch` kommt. */
  lastTouchSource: 'file' | 'claude-session' | 'journal';
  /** Tage seit `lastTouch`. */
  ageDays: number;
  /** Länger unangetastet als die eingestellte Schwelle und noch nicht fertig. */
  stale: boolean;
  todoCount: number;
  openTodoCount: number;
  /** Erster Absatz des Projekt-Rumpfs, für Karten und Listen. */
  excerpt: string;
}

export type TodoState = 'open' | 'done';

/**
 * Ein Todo ist eine GFM-Checkbox in einer Vault-Datei — nichts Eigenes.
 * Inline-Marker: `@due:2026-08-20`, `@wait:Max`, `@needed:2026-08-25`, `!` bis `!!!`.
 */
export interface Todo {
  /** Stabile ID: Pfad + Zeilennummer + Textrumpf, gehasht. */
  id: string;
  text: string;
  state: TodoState;
  scope: Scope;
  /** Datei, in der die Checkbox steht. */
  path: string;
  line: number;
  /** Projekt-Slug, wenn das Todo in einer Projektdatei steht. */
  project: string | null;
  projectTitle: string | null;
  /** Bereichs-Slug, wenn das Todo in einer `areas/<slug>.md`-Datei steht. */
  area: string | null;
  due: string | null;
  /** Auf wen gewartet wird, falls `@wait:` gesetzt ist. */
  waitingFor: string | null;
  /** Bis wann die Antwort spätestens kommen muss. */
  neededBy: string | null;
  /** 1 = low, 2 = medium, 3 = high; 0 is a legacy todo without a marker. */
  priority: number;
  tags: string[];
  createdAt: string | null;
  doneAt: string | null;
  /** Fällig in Tagen; negativ = überfällig; null = ohne Datum. */
  dueInDays: number | null;
}

/**
 * One entry under the notes section of an area file, as it stands there:
 * `### YYYY-MM-DD` plus the text below it.
 *
 * The index carries the entry, not its body — `.secondbrain/index/index.json`
 * must not grow into a copy of the vault. The full text comes from reading the
 * file when a section is opened.
 */
export interface AreaNote {
  /** Date from the `###` heading; null when the heading names no date. */
  day: string | null;
  /**
   * The heading as it stands in the file, null for text that sits directly under
   * the notes section without one. Kept so that a hand-written heading isn't
   * lost on the way to the screen.
   */
  heading: string | null;
  /**
   * 1-based line in the file: the entry's heading, or its first line of text.
   * Also what names the entry when it is moved (`areas:moveNote`).
   */
  line: number;
  /**
   * First paragraph of the entry, for lists and cards.
   *
   * Two channels fill this field, and they mean different things by it:
   * `areas:list` puts the preview here (folded to one line, markup dropped,
   * shortened), `areas:notes` the entry itself — character for character as it
   * stands in the file, because that is where the text of an expanded section
   * comes from.
   */
  excerpt: string;
}

/**
 * An area (`areas/<slug>.md`): an ongoing responsibility with no end — the home
 * for thoughts that belong to neither a project nor a day.
 */
export interface Area {
  path: string;
  /** File name without extension, the same slug `areaPath()` builds from. */
  slug: string;
  title: string;
  scope: Scope;
  /** sha256 of the file — what a write into this area is guarded against. */
  hash: string;
  noteCount: number;
  openTodoCount: number;
  /** Newest first; entries without a parsable date keep file order at the end. */
  notes: AreaNote[];
}

export type CoachMode =
  /** Nur zuhören, spiegeln, bestätigen. Keine Ratschläge. */
  | 'listen'
  /** Zuhören und dann konkrete Vorschläge machen. */
  | 'tips'
  /** Im Licht früherer Einträge analysieren, Muster zeigen. */
  | 'analyze';

export const COACH_MODES: readonly CoachMode[] = ['listen', 'tips', 'analyze'];

export interface JournalFrontmatter extends BaseFrontmatter {
  type: 'journal';
  date: string;
  /** Tag abgeschlossen, ISO-Datum. Fehlt oder `null` heißt: noch nicht fertig. */
  closed?: string;
  /** 1–5, wie der Tag war. Freiwillig. */
  mood?: number;
  energy?: number;
  /** Genannte Personen — macht „wann habe ich X getroffen" beantwortbar. */
  people?: string[];
  /** Berührte Projekte (Slugs). */
  projects?: string[];
  scope?: Scope | 'both';
}

export interface JournalDay {
  path: string;
  date: string;
  title: string;
  /** Tag abgeschlossen, ISO-Datum, oder `null` — noch nicht fertig. */
  closed: string | null;
  mood: number | null;
  energy: number | null;
  people: string[];
  projects: string[];
  /** Bereichs-Slugs, die dieser Tag nennt (`areas:daysOfArea`). */
  areas: string[];
  tags: string[];
  /** Erste Zeilen des Eintrags. */
  excerpt: string;
  wordCount: number;
  /** Anzahl Dialog-Runden mit dem Coach an diesem Tag. */
  turns: number;
}

/** Who found a loose end: this repo's own rule, or a model pass over the same days. */
export type LooseEndOrigin = 'heuristic' | 'model';

/**
 * A loose end: a day announced something for a later date, that date has come
 * and gone, and no day since says how it went. Derived, never stored — the id is
 * a hash of the day plus the sentence, so it survives a deleted index.
 */
export interface LooseEnd {
  /** sha256 of day + quote, shortened. Stable across runs, never time-based. */
  id: string;
  /** The day the sentence stands in, 'YYYY-MM-DD'. */
  day: string;
  /** Vault-relative path of that day's file. */
  path: string;
  /** 1-based line in the file the sentence starts on. */
  line: number;
  /** The announcing sentence, as it stands in the entry (whitespace collapsed). */
  quote: string;
  /** What was announced, in the sentence's own words. Empty when the sentence names nothing. */
  subject: string;
  /**
   * The calendar day the sentence pointed at. Before today for a `LooseEnd` —
   * the day has come and gone; today or later for an `UpcomingMention`, which is
   * the same record before that day arrives.
   */
  refDate: string;
  origin: LooseEndOrigin;
}

/**
 * A mention of a coming day, before it arrives (070) — the same shape as a
 * `LooseEnd`, distinguished only by `refDate` lying today or later.
 *
 * An alias, not a type of its own: on the day after the one it points at the
 * very same record continues as a loose end, with the same id. A second
 * interface would suggest two things where there is one.
 */
export type UpcomingMention = LooseEnd;
