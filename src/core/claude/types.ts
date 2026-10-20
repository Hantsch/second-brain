/**
 * Der Vertrag der Claude-Spur.
 *
 * Claude Code legt jede Sitzung als JSONL unter `~/.claude/projects/<ordner>/<id>.jsonl`
 * ab. Diese Schicht **liest** das mit — sie schreibt nie dorthin und ruft nie ein
 * Claude-Binary auf. Alles, was die Platte anfasst, laeuft ueber `ClaudeFileSystem`;
 * damit ist der ganze Leseweg ohne ein echtes `~/.claude` testbar (Guardrail 4 und
 * die QA-Regel „nie das echte ~/.claude").
 *
 * Die gemessenen Fakten ueber das Format stehen in `../claude-control/docs/RESEARCH.md`:
 * eine Datei kann Megabytes gross sein, die letzte Zeile ist regelmaessig ein
 * halbgeschriebener Torso, und die letzte Zeile ist meistens Buchhaltung
 * (`last-prompt`) statt Inhalt. Deshalb: nie ganz laden, nie auf die letzte Zeile
 * verlassen, kaputte Zeilen ueberspringen.
 */

import type { ClaudeSession } from '@shared/types';

/** Eine Datei im Claude-Verzeichnis, wie das Verzeichnis sie beschreibt. */
export interface ClaudeFileInfo {
  /** Absoluter Pfad. */
  path: string;
  /** Dateiname ohne Ordner. */
  name: string;
  size: number;
  /** mtime als ISO-Zeitstempel. */
  modified: string;
}

/**
 * Der Verzeichnis- und Datei-Adapter. Bewusst schmal und byte-genau: `readRange`
 * ist der einzige Leseweg, damit niemand versehentlich eine 5-MB-Datei in den
 * Speicher zieht.
 */
export interface ClaudeFileSystem {
  /** Namen der Unterordner. Leer, wenn der Pfad fehlt — das ist kein Fehler. */
  listDirs(path: string): Promise<string[]>;
  /** Dateien eines Ordners mit Groesse und mtime. Leer, wenn der Pfad fehlt. */
  listFiles(path: string): Promise<ClaudeFileInfo[]>;
  /**
   * `length` Bytes ab `start` als UTF-8-Text. Kuerzer als gewuenscht ist erlaubt
   * (Dateiende). Beginnt das Fenster mitten in einem Mehrbyte-Zeichen, steht dort
   * ein Ersatzzeichen — es liegt immer in der ersten, ohnehin verworfenen Zeile.
   */
  readRange(path: string, start: number, length: number): Promise<string>;
  /** Gibt es diesen Pfad? Nur fuer die Aufloesung des Projektordners. */
  exists(path: string): Promise<boolean>;
  /** Pfad zusammensetzen — Windows braucht Backslashes, POSIX Schraegstriche. */
  join(...parts: string[]): string;
  /** Heimatverzeichnis, Grundlage des Standardorts `~/.claude/projects`. */
  homeDir(): string;
}

export interface SessionListOptions {
  /** Hoechstzahl an Sitzungen, neueste zuerst. Standard: `DEFAULT_SESSION_LIMIT`. */
  limit?: number;
  /** Nur Sitzungen mit Aktivitaet ab diesem Zeitpunkt (ISO). */
  since?: string;
}

/**
 * Arbeitsspuren einer Agenten-CLI lesen — das vierte der vier Interfaces aus
 * docs/ARCHITECTURE.md. Implementierung: `ClaudeSessionReader`.
 */
export interface SessionReader {
  list(options?: SessionListOptions): Promise<ClaudeSession[]>;
}

/** So viele Sitzungen holt ein Lauf, wenn niemand eine Zahl nennt. */
export const DEFAULT_SESSION_LIMIT = 20;

/** Fenster fuer den Kopf einer Datei. 64 KB reichen fuer die ersten Zeilen. */
export const HEAD_BYTES = 64 * 1024;

/** So viele Zeilen des Kopfes werden gedeutet (RESEARCH.md: cwd steht ganz vorn). */
export const HEAD_LINES = 20;

/** Fenster fuer das Ende einer Datei. */
export const TAIL_BYTES = 40 * 1024;

/** So lang darf die erste Nutzer-Nachricht im Dashboard sein. */
export const MAX_FIRST_PROMPT_CHARS = 160;

/** So lang darf eine mitgelesene Zusammenfassung sein. */
export const MAX_SUMMARY_CHARS = 300;

/** Hoechstzahl der beruehrten Dateien je Sitzung. */
export const MAX_SESSION_FILES = 5;

/** So viele Dateien werden gleichzeitig gelesen. */
export const READ_CONCURRENCY = 8;

/** Endung der Verlaufsdateien. */
export const TRANSCRIPT_EXTENSION = '.jsonl';

/**
 * Was aus einer Verlaufsdatei herauszulesen ist, ohne sie ganz zu laden.
 * `null` heisst durchweg „steht nicht in den gelesenen Fenstern" — nicht „gibt es nicht".
 */
export interface SessionFacts {
  /** `sessionId` aus den Records; leer, wenn keiner ihn traegt. */
  sessionId: string | null;
  /** Arbeitsverzeichnis, wie die Records es nennen. Das ist die Wahrheit. */
  cwd: string | null;
  gitBranch: string | null;
  /** Zeitstempel des ersten gelesenen Records. */
  startedAt: string | null;
  /** Zeitstempel des letzten gelesenen Records. */
  lastActivity: string | null;
  /** Anzahl inhaltlicher Nachrichten (`user`/`assistant`). */
  messageCount: number;
  /**
   * Ist `messageCount` gezaehlt (die Fenster deckten die Datei ab) oder geschaetzt?
   * Geschaetzt wird ueber die Nachrichtendichte des Endfensters.
   */
  messageCountExact: boolean;
  /** Erste Nutzer-Nachricht im Kopffenster, bereinigt und gekuerzt. */
  firstPrompt: string | null;
  /** `summary`- bzw. `ai-title`-Zeile, falls vorhanden. */
  summary: string | null;
  /** Haeufigste Dateipfade aus den Werkzeugaufrufen, haeufigste zuerst. */
  files: string[];
  /** Records, die ueberhaupt gelesen wurden — 0 heisst: keine Arbeitsspur. */
  records: number;
  /** Zeilen, die kein JSON waren und uebersprungen wurden. */
  skippedLines: number;
  /** Bytes, die fuer diese Fakten gelesen wurden. */
  bytesRead: number;
  /** Modellname des juengsten gelesenen Assistant-Records, oder `null`. */
  model: string | null;
  /**
   * Distinkte `subagent_type`-Werte aus `Task`-Werkzeugaufrufen, zuerst gesehen
   * zuerst. `null` heisst „keiner in den gelesenen Fenstern gesehen" — bewusst
   * kein leeres Array, das haette „gesehen und mit null Subagenten" bedeutet.
   * Gleiche Unterscheidung wie bei `AgentSessionSummary.subagents`.
   */
  subagents: string[] | null;
  /**
   * Naeherung fuer die zuletzt belegte Kontextgroesse: Claude legt anders als
   * Codex (`model_context_window`) keine eigene Kennzahl dafuer ab. Genommen
   * wird die Token-Summe aus `usage` des juengsten Assistant-Records — siehe
   * Kommentar bei `contextTokensOf` in `records.ts`.
   */
  contextTokens: number | null;
}

/** Leere Fakten — der ehrliche Zustand einer leeren oder unlesbaren Datei. */
export function emptyFacts(): SessionFacts {
  return {
    sessionId: null,
    cwd: null,
    gitBranch: null,
    startedAt: null,
    lastActivity: null,
    messageCount: 0,
    messageCountExact: true,
    firstPrompt: null,
    summary: null,
    files: [],
    records: 0,
    skippedLines: 0,
    bytesRead: 0,
    model: null,
    subagents: null,
    contextTokens: null,
  };
}
