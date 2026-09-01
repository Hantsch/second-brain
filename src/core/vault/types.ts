/**
 * Der Vertrag des Vaults: `VaultStore`. Alles, was Dateien liest oder schreibt,
 * kennt nur dieses Interface — nie ein Dateisystem.
 *
 * Zwei Implementierungen: `FsVaultStore` (echte Dateien) und `MemoryVaultStore`
 * (Tests). Beide verhalten sich gleich, inklusive Konflikt-Semantik.
 */

import type { ConflictInfo, VaultDoc, WriteResult } from '@shared/types';

/** Was der Store ueber einen Pfad weiss, ohne ihn zu lesen. */
export interface VaultStat {
  /** Vault-relativ, immer mit '/'. */
  path: string;
  /** Groesse in Byte; bei Ordnern 0. */
  size: number;
  /** mtime als ISO-String. */
  modified: string;
  dir: boolean;
}

/**
 * Ein Schreibvorgang. `expectedHash` ist der Hash, den der Aufrufer gelesen hat —
 * stimmt er nicht mehr, gibt es einen `VaultConflictError` und die Datei bleibt,
 * wie sie ist.
 */
export interface WriteInput {
  path: string;
  /**
   * Zu setzende Frontmatter-Felder. Bei bestehender Datei wird gemergt: unbekannte
   * Felder des Nutzers bleiben erhalten. `undefined` als Wert laesst ein Feld
   * unberuehrt, `null` setzt es ausdruecklich auf null.
   */
  frontmatter?: Record<string, unknown>;
  /** Neuer Rumpf. Fehlt er, bleibt der bestehende Rumpf stehen. */
  body?: string;
  expectedHash?: string;
  /** Die Datei darf noch nicht existieren, sonst Konflikt. */
  mustNotExist?: boolean;
  /** Frontmatter ersetzen statt mergen. Standard ist mergen. */
  replaceFrontmatter?: boolean;
}

export interface WriteTextOptions {
  expectedHash?: string;
  mustNotExist?: boolean;
}

export interface AppendOptions {
  expectedHash?: string;
  /**
   * Frontmatter fuer den Fall, dass die Datei noch nicht existiert. Fehlt es und
   * fehlt die Datei, wirft `append` einen `VaultNotFoundError`.
   */
  frontmatterIfNew?: Record<string, unknown>;
}

export interface AppendResult extends WriteResult {
  /** Der Abschnitt war nicht vorhanden und wurde am Dateiende angelegt. */
  sectionCreated: boolean;
}

export interface MoveOptions {
  /** Ziel darf ueberschrieben werden. Standard: nein (Konflikt). */
  overwrite?: boolean;
}

export interface ListOptions {
  /** Unterordner, vault-relativ. Fehlt er, gilt die Wurzel. */
  dir?: string;
  /** Nur Dateien mit dieser Endung, z. B. '.md'. */
  ext?: string;
  /** Unterordner mitnehmen. Standard: ja. */
  recursive?: boolean;
  /** Auch `.secondbrain/` durchlaufen. Standard: nein. */
  includeInternal?: boolean;
  /** Ordner mit ausgeben. Standard: nein — `walk` liefert nur Dateien. */
  includeDirs?: boolean;
  /** Hoechstzahl an Treffern. */
  limit?: number;
}

/** Ergebnis eines Loeschvorgangs — ohne Rueckweg wird nichts geloescht. */
export interface DeleteResult {
  path: string;
  /** Marke fuer `undo`. Zeigt auf die Kopie unter `.secondbrain/trash/`. */
  undoToken: string;
}

export interface VaultStore {
  /** Wurzel des Vaults; beim Speicher-Store ein symbolischer Wert. */
  readonly root: string;

  /** Dokument lesen; `null`, wenn es die Datei nicht gibt. */
  read(path: string): Promise<VaultDoc | null>;
  /** Mehrere Dokumente lesen; fehlende Pfade fallen still weg. */
  readMany(paths: string[]): Promise<VaultDoc[]>;
  /** Rohen Text lesen (JSON, Logs); `null`, wenn es die Datei nicht gibt. */
  readText(path: string): Promise<string | null>;

  /** Frontmatter und Rumpf schreiben — atomar, mit Konfliktschutz. */
  write(input: WriteInput): Promise<WriteResult>;
  /** Neu anlegen. Existiert die Datei schon, gibt es einen Konflikt. */
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
  /** Rohen Text schreiben — fuer alles, was kein Markdown mit Frontmatter ist. */
  writeText(path: string, content: string, options?: WriteTextOptions): Promise<WriteResult>;

  /**
   * Text unter einer Abschnitts-Ueberschrift anhaengen. Fehlt der Abschnitt, wird
   * er am Dateiende als '## <section>' angelegt. Frontmatter bleibt unberuehrt.
   */
  append(
    path: string,
    section: string,
    content: string,
    options?: AppendOptions,
  ): Promise<AppendResult>;

  move(from: string, to: string, options?: MoveOptions): Promise<WriteResult>;
  /** Verschiebt nach `.secondbrain/trash/<token>/` und gibt die Marke zurueck. */
  delete(path: string): Promise<DeleteResult>;
  /**
   * Legt den **aktuellen** Stand einer Datei als Kopie in den Papierkorb, ohne das
   * Original anzufassen — der Rueckweg fuer "Hash lesen → sichern → ueberschreiben".
   * `undo(token)` legt die Kopie spaeter wieder ueber die inzwischen geaenderte
   * Datei; anders als bei `delete` ist ein belegter Zielort hier kein Konflikt.
   *
   * `null`, wenn an dem Pfad keine Datei liegt — dann entsteht auch kein Eintrag im
   * Papierkorb. Ordner sichert `snapshot` nicht; dafuer gibt es `delete`.
   */
  snapshot(path: string): Promise<string | null>;
  /** Stellt alles wieder her, was zu dieser Marke gehoert. Gibt die Pfade zurueck. */
  undo(token: string): Promise<string[]>;

  list(options?: ListOptions): Promise<string[]>;
  walk(options?: ListOptions): AsyncIterable<VaultStat>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<VaultStat | null>;
  /** sha256 ueber den vollen Dateiinhalt; `null`, wenn es die Datei nicht gibt. */
  hash(path: string): Promise<string | null>;
  /** Ordner anlegen (rekursiv, idempotent). */
  mkdir(dir: string): Promise<void>;
}

/**
 * Basisklasse aller Vault-Fehler. `code` entspricht `IpcError.code`, damit der
 * Main den Fehler ohne Umrechnung weitergeben kann.
 */
export abstract class VaultError extends Error {
  abstract readonly code: 'conflict' | 'not-found' | 'invalid' | 'io';

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Die Datei hat sich seit dem Lesen geaendert. Es wurde nichts geschrieben. */
export class VaultConflictError extends VaultError {
  override readonly code = 'conflict' as const;
  readonly info: ConflictInfo;

  constructor(info: ConflictInfo, reason = 'Die Datei wurde zwischenzeitlich geaendert.') {
    super(`Konflikt in ${info.path}: ${reason}`);
    this.info = info;
  }
}

/** Der Pfad existiert nicht im Vault. */
export class VaultNotFoundError extends VaultError {
  override readonly code = 'not-found' as const;
  readonly path: string;

  constructor(path: string) {
    super(`Nicht gefunden: ${path}`);
    this.path = path;
  }
}

/**
 * Das Frontmatter der Datei ist kein gueltiges YAML. Die App weigert sich, darin zu
 * schreiben — sonst gingen Nutzerzeilen verloren. Lesen bleibt moeglich.
 */
export class VaultFrontmatterError extends VaultError {
  override readonly code = 'invalid' as const;
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Frontmatter in ${path} ist nicht lesbar: ${reason}`);
    this.path = path;
  }
}

/** Der Pfad ist unbrauchbar oder verlaesst den Vault. */
export class VaultPathError extends VaultError {
  override readonly code = 'invalid' as const;
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Unzulaessiger Pfad "${path}": ${reason}`);
    this.path = path;
  }
}
