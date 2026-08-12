/* Projekte, Todos, Warte-auf und Journal — die Dinge, die den Kopf freihalten. */

import type { BaseFrontmatter, Scope } from './vault';

export type ProjectStatus = 'idea' | 'active' | 'waiting' | 'paused' | 'done' | 'dropped';

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
  started?: string;
  /** Harte Frist des Projekts, ISO-Datum. */
  deadline?: string;
  /** Der eine nächste Schritt — was der Nutzer beim Wiedereinstieg zuerst liest. */
  next_step?: string;
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
  deadline: string | null;
  nextStep: string | null;
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
  mood: number | null;
  energy: number | null;
  people: string[];
  projects: string[];
  tags: string[];
  /** Erste Zeilen des Eintrags. */
  excerpt: string;
  wordCount: number;
  /** Anzahl Dialog-Runden mit dem Coach an diesem Tag. */
  turns: number;
}
