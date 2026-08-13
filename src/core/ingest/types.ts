/**
 * Der Vertrag des Aufnehmens: `SourceIngestor`.
 *
 * Eine Quelle kommt als Zeichenkette herein (URL, Dateipfad, eingefuegter Text)
 * und liegt danach unveraenderlich unter `raw/`. Was hier zurueckkommt, ist genau
 * das, was die Verdichtung braucht — nicht mehr: Pfad, Titel, Text, Herkunft,
 * Provenienz.
 *
 * Alles, was Netz, Prozesse oder Dateien ausserhalb des Vaults anfasst, kommt als
 * injizierte Abhaengigkeit herein (`fetchImpl`, `run`, `fs`). Damit laeuft jeder
 * Test dieser Schicht ohne Netz und ohne Binary.
 */

import type { FetchLike } from '@core/llm';
import type { DateLike } from '@core/vault/paths';
import type { IngestKind, IngestStage, WriteResult } from '@shared/types';

export type { FetchLike };

// ── Fortschritt ────────────────────────────────────────────────────────────────

export interface IngestProgressEvent {
  stage: IngestStage;
  /** 0..1. Unbekannter Fortschritt ist 0, nicht geraten. */
  progress: number;
  /**
   * Maschinenlesbarer Hinweis (`IngestNoteCode`) oder ein technisches Detail —
   * nie ein fertiger Nutzertext. Uebersetzt wird im Renderer.
   */
  message: string | null;
}

export type IngestProgressFn = (event: IngestProgressEvent) => void;

// ── Hinweise ───────────────────────────────────────────────────────────────────

/**
 * Ehrliche Auskunft ueber eine Einschraenkung. Der Kern kennt keine Sprache, also
 * reist ein Code: der Renderer setzt ihn als `ingest.note.<code>` in Text um.
 */
export type IngestNoteCode =
  /** PDF wird noch nicht gelesen — die Datei liegt als Quelle, der Text fehlt. */
  | 'pdf-not-read'
  /** Dateiart unbekannt: abgelegt, aber nicht ausgelesen. */
  | 'binary-not-read'
  /** Das Video hat keine Untertitel — Metadaten liegen trotzdem. */
  | 'no-transcript'
  /** Kernfelder der Metadaten fehlen (Titel, Description, Kanal, Dauer). */
  | 'partial-metadata'
  /** yt-dlp fehlt; nur die Fallback-Provider waren im Spiel. */
  | 'ytdlp-missing'
  /** Die Seite war laenger als das Groessenlimit und wurde abgeschnitten. */
  | 'content-truncated'
  /** Die Antwort war kein Text (Bild, Archiv) — nichts zu verdichten. */
  | 'unsupported-content'
  /** Rohquelle liegt, die Verdichtung braucht ein Modell. */
  | 'awaiting-llm'
  /** Diese Quelle ist schon verdichtet — ein zweiter Lauf wurde gestoppt. */
  | 'already-condensed';

export interface IngestNote {
  code: IngestNoteCode;
  /** Technisches Detail (Dateiname, Statuscode, Sprache) — nie ein Nutzersatz. */
  detail?: string;
}

// ── Ergebnis ───────────────────────────────────────────────────────────────────

export interface IngestOutcome {
  kind: IngestKind;
  /** Vault-relativ: der Ordner bei YouTube und Dateien, die Datei bei URLs. */
  rawPath: string;
  title: string;
  /** Der Text, den die Verdichtung liest. Leer heisst: es gibt nichts zu lesen. */
  text: string;
  /** URL oder Ursprungspfad — die Herkunft, wie der Nutzer sie eingegeben hat. */
  origin: string;
  /** Grob je Bestandteil: `{ metadata: 'yt-dlp', transcript: 'yt-dlp' }`. */
  provenance: Record<string, string>;
  notes: IngestNote[];
}

// ── Injizierte Abhaengigkeiten ─────────────────────────────────────────────────

/** Was das Aufnehmen am Vault braucht — bewusst schmal. `VaultStore` erfuellt es. */
export interface IngestStore {
  /** Wurzel des Vaults; wird gebraucht, um Dateien von aussen hereinzukopieren. */
  readonly root: string;
  exists(path: string): Promise<boolean>;
  /** Rohen Text lesen; `null`, wenn es die Datei nicht gibt. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<WriteResult>;
  mkdir(dir: string): Promise<void>;
}

export interface IngestFileStat {
  size: number;
  /** mtime als ISO-String. */
  modified: string;
  dir: boolean;
}

/**
 * Dateisystem **ausserhalb** des Vaults: die Quelldatei des Nutzers, das Temp-
 * Verzeichnis der Untertitel, die verwaltete yt-dlp-Kopie. Pfade sind absolute
 * OS-Pfade — im Vault gilt weiter der `IngestStore`.
 */
export interface IngestFileSystem {
  readText(path: string): Promise<string | null>;
  stat(path: string): Promise<IngestFileStat | null>;
  /** Kopiert eine Datei; Zielordner wird angelegt. */
  copyFile(from: string, to: string): Promise<void>;
  mkdir(dir: string): Promise<void>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Ausfuehrbar-Bit setzen (auf Windows ein No-op). */
  chmod(path: string, mode: number): Promise<void>;
  /** Ist die Datei vorhanden und ausfuehrbar? */
  isExecutable(path: string): Promise<boolean>;
  /** Dateinamen eines Verzeichnisses, ohne Pfad. */
  readDir(path: string): Promise<string[]>;
  /** Eigenes Temp-Verzeichnis; der Aufrufer raeumt es mit `remove` weg. */
  tempDir(prefix: string): Promise<string>;
  join(...parts: string[]): string;
  baseName(path: string): string;
}

export interface ProcessResult {
  /** Exit-Code; -1, wenn der Prozess ohne Code endete. */
  code: number;
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  cwd?: string;
}

/** Ein Prozess-Aufruf (der `spawn`-Adapter). Tests reichen eine Faelschung herein. */
export type ProcessRunner = (
  binary: string,
  args: string[],
  options?: ProcessOptions,
) => Promise<ProcessResult>;

/**
 * Das, was youtubei.js an Information liefert — absichtlich `unknown`: die
 * Objektstruktur wandert zwischen Major-Versionen, der Provider liest jedes Feld
 * defensiv aus mehreren moeglichen Pfaden.
 */
export interface InnertubeInfoSource {
  getInfo(videoId: string): Promise<unknown>;
}

export type InnertubeFactory = () => Promise<InnertubeInfoSource>;

export interface YoutubeOptions {
  /** Pfad des yt-dlp-Binaries, oder null wenn keines da ist. */
  ytdlpPath?: string | null;
  /** Zusaetzliche yt-dlp-Argumente (Cookies, Proxy) — vom Nutzer gesetzt. */
  ytdlpArgs?: readonly string[];
  /** Fabrik des Fallback-Clients ohne Binary. */
  innertube?: InnertubeFactory;
  /** Sound-Marker (`[music]`) aus dem Transcript filtern. Standard: ja. */
  stripNonSpeech?: boolean;
}

// ── Kontext ────────────────────────────────────────────────────────────────────

export interface IngestContext {
  store: IngestStore;
  /** Das „jetzt" fuer Datumsteile in Pfaden und Protokollen. */
  now?: DateLike;
  /** Sprachpriorität der Untertitel; `original` = Sprache des Videos. */
  languages?: readonly string[];
  /** Zielmodul der spaeteren Verdichtung — nur fuer das Protokoll. */
  module?: string | null;
  onProgress?: IngestProgressFn;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  fs?: IngestFileSystem;
  run?: ProcessRunner;
  youtube?: YoutubeOptions;
}

export interface SourceIngestor {
  readonly kind: IngestKind;
  /** Kann dieser Ingestor mit der Eingabe umgehen? Keine Netzabfrage, nur Form. */
  canHandle(input: string): boolean;
  ingest(input: string, ctx: IngestContext): Promise<IngestOutcome>;
}

/** Fehler des Aufnehmens. `code` entspricht `IpcError.code`. */
export class IngestError extends Error {
  readonly code: 'invalid' | 'not-found' | 'io' | 'cancelled' | 'unknown';
  readonly detail: string | undefined;

  constructor(
    code: IngestError['code'],
    message: string,
    options: { detail?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = 'IngestError';
    this.code = code;
    this.detail = options.detail;
  }
}

/** Der Lauf wurde abgebrochen — wirft, sobald das Signal gesetzt ist. */
export function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new IngestError('cancelled', 'Aufnahme abgebrochen.');
}

export const DEFAULT_LANGUAGES: readonly string[] = ['original', 'de', 'en'];
