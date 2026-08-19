/**
 * Der Vertrag des Tagebuch-Kerns.
 *
 * Das ist der menschlich empfindlichste Teil der App. Zwei Regeln bestimmen
 * deshalb alles hier:
 *
 * 1. **Was der Mensch geschrieben hat, ist geschrieben.** Die Nutzerrunde wandert
 *    in die Datei, bevor irgendein Modell gefragt wird. Faellt das Modell aus,
 *    stirbt die App oder bricht der Nutzer ab, steht sein Satz trotzdem da.
 * 2. **Ohne Modell wird nichts erfunden.** Es gibt kein Textbaustein-Mitgefuehl.
 *    Der Kern meldet `noModel` und — im Modus `analyze` — die frueheren Stellen,
 *    die er wirklich gefunden hat. Formulieren tut der Renderer.
 *
 * Store und Index kommen als schmale Sichten herein, damit der Kern ohne
 * Dateisystem und ohne Indexdienst testbar bleibt. `VaultStore`, `IndexService`
 * und `MemoryVaultStore` erfuellen sie strukturell.
 */

import type {
  CoachMode,
  DocLanguage,
  FilingProposal,
  JournalDay,
  KnowledgeModule,
  LlmUnavailable,
  ModelRef,
  Project,
  SearchHit,
  SearchQuery,
  UiLanguage,
  VaultDoc,
  WriteResult,
} from '@shared/types';
import type { IndexedDoc } from '@core/index/types';
import type { LlmGateway } from '@core/llm';
import type { DateLike } from '@core/vault/paths';
import type { VaultStat } from '@core/vault/types';

/** So viele frueheren Tage gehen hoechstens als Belege in ein `analyze`-Gespraech. */
export const MAX_EARLIER_DAYS = 5;

/**
 * So viele frueheren Runden desselben Tages gehen als Vorgeschichte in den Prompt
 * — seit 011 die Bloecke des Tagesstroms (eigene Prosa und Antworten der App) und
 * die Runden eines noch nicht gefalteten „Gespraech"-Abschnitts zusammen.
 */
export const DIALOG_HISTORY_TURNS = 6;

/** Untermenge von `VaultStore`, die der Tagebuch-Kern braucht. */
export interface JournalStore {
  readText(path: string): Promise<string | null>;
  stat(path: string): Promise<VaultStat | null>;
  write(input: {
    path: string;
    frontmatter?: Record<string, unknown>;
    body?: string;
    expectedHash?: string;
  }): Promise<WriteResult>;
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
  /** Haengt unter einer Abschnitts-Ueberschrift an; fehlt sie, wird sie angelegt. */
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<{ path: string; hash: string; created: boolean; sectionCreated: boolean }>;
}

/**
 * Was der Kern am Index braucht — nur Lesen. Die Form ist ein Obermenge von
 * `CaptureIndex`, damit der Tagesabschluss den Ablage-Kontext des Erfassens
 * benutzen kann statt einen zweiten zu bauen.
 */
export interface JournalIndexView {
  index(): { docs: readonly IndexedDoc[]; byPath: ReadonlyMap<string, IndexedDoc> };
  search(query: SearchQuery): SearchHit[];
  projects(): readonly Project[];
  modules(): readonly KnowledgeModule[];
}

/** Gemeinsame Optionen aller Ablaeufe. */
export interface JournalOptions {
  /** Sprache, in der die Tagesdatei geschrieben ist (Titel, Abschnitte). */
  docLanguage?: DocLanguage;
  /** Das „jetzt". Tests geben eine feste Zeit — nie `Date.now()` im Kern. */
  now?: DateLike;
  signal?: AbortSignal;
}

/** Eine gelesene Tagesdatei: die Ableitung fuer die Anzeige plus das Dokument. */
export interface JournalDayDoc {
  day: JournalDay;
  doc: VaultDoc;
}

/** Ergebnis von `ensureDay`. `created: false` heisst: es lag schon alles bereit. */
export interface EnsureDayResult extends JournalDayDoc {
  path: string;
  created: boolean;
}

/** Wer in einer Dialogrunde spricht. */
export type DialogRole = 'user' | 'assistant';

/** Eine Runde aus dem Abschnitt „Gespraech", so wie sie in der Datei steht. */
export interface DialogTurn {
  role: DialogRole;
  /** Der Text ohne die '> '-Zeichen, Zeilenumbrueche erhalten. */
  text: string;
  /** Uhrzeit 'HH:MM' aus der Sprecherzeile; `null`, wenn keine dransteht. */
  at: string | null;
  /** 0-basierte Zeile der Sprecherzeile im Rumpf — fuer Anzeige und Fehlersuche. */
  line: number;
}

/**
 * Ein Block im „Tag"-Abschnitt, so wie er geschrieben wurde (011): entweder ein
 * Prosa-Lauf der Nutzerin oder eine Antwort der App als Blockzitat im Format von
 * `formatTurn`. Reihenfolge der Liste = Reihenfolge im Dokument.
 */
export type JournalBlock =
  | { kind: 'entry'; text: string; line: number }
  | { kind: 'answer'; text: string; at: string | null; line: number };

/**
 * Der Fragebogen als Starthilfe (012): die feste Themenmenge, nie erweitert —
 * auch nicht vom Modell (`interview-followup`, D3). `planInterview`
 * (`interview.ts`) bestimmt daraus, welche Fragen an einem Tag noch offen sind.
 */
export const INTERVIEW_TOPICS = ['work', 'events', 'people', 'open', 'feeling'] as const;

/** Eines der fuenf Themen, nach denen der Fragebogen fragt. */
export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];

/**
 * Ob fuer die optionale Rueckfrage (`journal-chat`, D3) ein Modell geroutet
 * ist. Das entscheidet der Aufrufer (IPC, D4) — ein reiner Kernbaustein hat
 * kein `LlmGateway`, um das selbst zu pruefen, und soll auch keins bekommen,
 * nur um diese eine Frage zu beantworten.
 */
export type InterviewMode = 'fixed' | 'model';

/** Eine noch zu stellende Frage, schon in der verlangten Dokumentsprache. */
export interface InterviewStep {
  topic: InterviewTopic;
  question: string;
}

/** Ergebnis von `planInterview`: was von der festen Themenmenge noch offen ist. */
export interface InterviewPlan {
  /** Verbleibende Schritte, in der Reihenfolge von `INTERVIEW_TOPICS`. */
  steps: InterviewStep[];
  mode: InterviewMode;
  /**
   * Fertig, sobald jedes Thema entweder aus dem Frontmatter hervorgeht oder an
   * diesem Tag schon einmal beantwortet wurde — also `steps.length === 0`.
   * Ein eigenes Feld statt einer leeren Liste, damit „fertig" nie erraten,
   * sondern immer ausdruecklich gemeldet wird.
   */
  finished: boolean;
}

/** Alles, was das Coaching-Gespraech braucht. */
export interface CoachDeps extends JournalOptions {
  store: JournalStore;
  index: JournalIndexView;
  gateway: LlmGateway;
  /** Sprache, in der geantwortet wird (Konversationssprache der Einstellungen). */
  replyLanguage?: UiLanguage;
  /** Jedes Textstueck der Antwort, sobald es da ist. */
  onDelta?: (delta: string) => void;
}

/**
 * Ein frueherer Tag als Beleg. Wortwoertlich aus der Datei — auch ohne Modell
 * darf der Renderer daraus „an diesen Tagen ging es dir aehnlich" machen.
 */
export interface CoachEvidence {
  /** Kalendertag 'YYYY-MM-DD'. */
  date: string;
  path: string;
  /** Erster Absatz des Tages, gekuerzt. */
  excerpt: string;
}

/** Ergebnis einer Gespraechsrunde. Der Eintrag ist in jedem Fall geschrieben. */
export interface CoachResult {
  date: string;
  path: string;
  mode: CoachMode;
  /** Die protokollierte Nutzerrunde, wortwoertlich wie in der Datei. */
  message: string;
  /** Die protokollierte Antwort. Leer, wenn keine kam — nie erfunden. */
  reply: string;
  /**
   * Es kam keine Antwort von einem Modell, **obwohl eine gewollt war**. Der Eintrag
   * wurde trotzdem geschrieben; `earlier` traegt, was statt einer Antwort belegt
   * ist. In der Haltung `listen` ist das `false`: dort war keine Antwort verlangt,
   * und eine ausgebliebene ist dann kein Mangel, sondern der Auftrag.
   */
  noModel: boolean;
  /**
   * Warum keine Antwort kam — `null`, wenn eine kam. Der Kern gibt den Grund als
   * Code weiter; formuliert wird er im Renderer: „kein Modell zugeordnet" ist eine
   * andere Nachricht als „das Modell war nicht erreichbar".
   */
  failure: LlmUnavailable | null;
  /** Fruehere Tage als Belege — nur im Modus `analyze` gefuellt. */
  earlier: CoachEvidence[];
  usedLlm: boolean;
  model: ModelRef | null;
  /** Hash der Tagesdatei nach dem letzten Schreiben — Grundlage des naechsten Schreibwegs. */
  hash: string;
}

/** Stimmung und Energie, wie `setMood` sie annimmt. */
export interface MoodPatch {
  /** 1–5. `null` loescht das Feld ausdruecklich, `undefined` laesst es stehen. */
  mood?: number | null;
  energy?: number | null;
}

/** Frontmatter-Felder, die der Tagesabschluss vorschlaegt. Nichts davon ist geschrieben. */
export interface JournalFrontmatterSuggestion {
  people: string[];
  /** Projekt-Slugs, die im Eintrag vorkommen. */
  projects: string[];
  mood: number | null;
  energy: number | null;
  tags: string[];
}

/** Was der Tagesabschluss gefunden hat — Zaehlungen fuer die Begruendung. */
export interface CloseFindings {
  todos: number;
  waitingOn: number;
  people: number;
  projects: number;
  /** Stand eine Stimmung im Text? */
  mood: boolean;
  /** War ein Modell beteiligt? */
  usedLlm: boolean;
}

/**
 * Die Begruendung des Vorschlags ist Nutzertext, und der Kern kennt die
 * Oberflaechensprache nicht. Sie ist deshalb einsetzbar — dieselbe Loesung wie
 * bei `core/overview/labels.ts`; die Vorgabe ist Deutsch.
 */
export interface CloseLabels {
  reason(found: CloseFindings): string;
}

/** Alles, was der Tagesabschluss braucht. */
export interface CloseDayDeps extends JournalOptions {
  store: JournalStore;
  index: JournalIndexView;
  gateway: LlmGateway;
  /** Beschriftung der Begruendung. Fehlt sie, ist sie deutsch. */
  labels?: CloseLabels;
}

/**
 * Der Tagesabschluss als Vorschlag: die Ablage im Format des Erfassens plus die
 * Frontmatter-Felder, die der Eintrag selbst bekommen soll. Geschrieben wird
 * nichts — erst die Bestaetigung des Menschen loest Schreibvorgaenge aus.
 */
export interface DayCloseSuggestion {
  date: string;
  path: string;
  /** Passt auf `FilingProposal` — dieselbe Karte, dieselben Knoepfe wie in der Inbox. */
  proposal: FilingProposal;
  frontmatter: JournalFrontmatterSuggestion;
  /** Vollstaendig ohne Modell entstanden. */
  heuristic: boolean;
}

/** Fehler des Tagebuch-Kerns. `code` entspricht `IpcError.code`. */
export class JournalError extends Error {
  readonly code: 'not-found' | 'invalid';

  constructor(code: 'not-found' | 'invalid', message: string) {
    super(message);
    this.name = 'JournalError';
    this.code = code;
  }
}
