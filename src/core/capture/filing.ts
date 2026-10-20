/**
 * Einordnen ohne Modell: einen Dump ablegen oder verwerfen. „Liegen lassen"
 * (`keepDump`) steht in `undo.ts`, weil es einen Rueckweg braucht, der hier
 * nicht existiert.
 *
 * Das ist der Teil des Einordnens, der **kein** Sprachmodell braucht — der
 * Nutzer nennt das Ziel, die App fuehrt es aus (Guardrail 1). Der LLM-Vorschlag
 * (`classify`) legt spaeter denselben `FilingProposal` vor; ausgefuehrt wird er
 * dann durch genau diese Funktion, damit es nur einen Schreibpfad gibt.
 *
 * Format: docs/VAULT-FORMAT.md — angehaengte Dumps landen im Notizen-Abschnitt,
 * jeder mit seinem Datum als Unterueberschrift. Wie der Abschnitt heisst,
 * entscheidet die Zieldatei, die hier gerade gelesen wurde, und erst danach die
 * Dokumentsprache (`resolveSection` in `sections.ts`). Der Dump selbst wandert
 * danach in den Papierkorb; die Marke von dort ist der Rueckweg.
 */

import type {
  DocLanguage,
  FilingProposal,
  FilingResult,
  VaultDoc,
  WriteResult,
} from '@shared/types';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { resolveSection } from './sections';

/** Ziele, die ohne Modell und ohne neue Datei auskommen. */
const APPENDABLE = new Set(['project', 'area', 'journal']);

/** Was das Einordnen am Store braucht — bewusst schmal. */
export interface FilingStore {
  read(path: string): Promise<VaultDoc | null>;
  write(input: {
    path: string;
    frontmatter?: Record<string, unknown>;
    body?: string;
    expectedHash?: string;
  }): Promise<WriteResult>;
  append(
    path: string,
    section: string,
    content: string,
    options?: { expectedHash?: string },
  ): Promise<{ path: string; hash: string }>;
  delete(path: string): Promise<{ path: string; undoToken: string }>;
  undo(token: string): Promise<string[]>;
}

/** Fehler des Einordnens. `code` entspricht `IpcError.code`. */
export class FilingError extends Error {
  readonly code: 'not-found' | 'invalid';

  constructor(code: 'not-found' | 'invalid', message: string) {
    super(message);
    this.name = 'FilingError';
    this.code = code;
  }
}

/**
 * Ein Schreibvorgang, der sich zuruecknehmen laesst: der Block, der in eine
 * bestehende Datei geschrieben wurde. Der Papierkorb deckt nur den Dump ab —
 * ohne diese Notiz waere die Ablage nur halb rueckgaengig.
 */
export interface FilingEdit {
  path: string;
  block: string;
}

export interface FilingOutcome {
  result: FilingResult;
  edits: FilingEdit[];
}

export interface FilingOptions {
  /** Das „jetzt" fuer die Unterueberschrift. Tests geben eine feste Zeit. */
  now?: DateLike;
  /**
   * Sprache, in der ein **fehlender** Abschnitt angelegt wird. Hat die Zieldatei
   * schon einen, gewinnt ihre Ueberschrift — die Sprache entscheidet nur, wo die
   * Datei nichts zu sagen hat.
   */
  docLanguage?: DocLanguage;
}

/** Der Block, wie er in der Zieldatei steht: Datum als Unterueberschrift, dann der Text. */
export function filingBlock(content: string, at: DateLike = new Date()): string {
  const text = content.replace(/\r\n/g, '\n').trim();
  return `### ${isoDay(at)}\n\n${text}`;
}

/**
 * Einen Dump ablegen: Text in die Zieldatei anhaengen, Dump in den Papierkorb.
 *
 * Reihenfolge ist Absicht — erst schreiben, dann loeschen. Scheitert das
 * Schreiben, liegt der Dump noch da; scheitert das Loeschen, steht der Text
 * schon in der Zieldatei und der Dump bleibt sichtbar. Nichts geht verloren.
 *
 * Deckt nur `primary` ab und wickelt den Inhalt selbst in einen Datumsblock.
 * Fuer einen **vollstaendigen** Vorschlag (extras, `waiting_on`, neues Projekt,
 * Rueckweg ueber alle Teilschritte) ist `applyProposal` aus `apply.ts` der Weg;
 * dessen `content` traegt den Datumskopf schon.
 */
export async function applyFiling(
  store: FilingStore,
  proposal: FilingProposal,
  options: FilingOptions = {},
): Promise<FilingOutcome> {
  const action = proposal.primary;
  if (!APPENDABLE.has(action.target)) {
    throw new FilingError('invalid', `Ziel "${action.target}" laesst sich noch nicht ausfuehren.`);
  }
  const target = await store.read(action.path);
  if (target === null) throw new FilingError('not-found', `Zieldatei fehlt: ${action.path}`);

  const block = filingBlock(action.content, options.now);
  /* Der Abschnitt wird hier neu bestimmt, nicht aus dem Vorschlag uebernommen:
     dessen Ueberschrift stammt aus dem Index und kann aelter sein als die Datei,
     die gerade gelesen wurde. Ein „Notes" gegen ein bestehendes „## Notizen"
     waere ein zweiter Abschnitt fuer dieselbe Sache. */
  const section = resolveSection(target.body, action, 'notes', options.docLanguage);
  await store.append(action.path, section, block, {
    expectedHash: target.hash,
  });

  const removed = await store.delete(proposal.dumpPath);
  return {
    result: {
      dumpPath: proposal.dumpPath,
      written: [action.path],
      movedTo: null,
      undoToken: removed.undoToken,
    },
    edits: [{ path: action.path, block }],
  };
}

/**
 * Eine Ablage zurueckholen: Dump aus dem Papierkorb, Block aus der Zieldatei.
 *
 * Hat der Nutzer den Text inzwischen selbst bearbeitet, bleibt er stehen — kein
 * Rueckweg schreibt eine Nutzerzeile um, die er nicht selbst erzeugt hat.
 * Rueckgabe: die Dateien, die tatsaechlich angefasst wurden.
 */
export async function revertFiling(
  store: FilingStore,
  token: string,
  edits: readonly FilingEdit[] = [],
): Promise<string[]> {
  const touched = await store.undo(token);
  for (const edit of edits) {
    const doc = await store.read(edit.path);
    if (doc === null) continue;
    const body = removeBlock(doc.body, edit.block);
    if (body === null) continue;
    await store.write({ path: edit.path, body, expectedHash: doc.hash });
    touched.push(edit.path);
  }
  return touched;
}

/**
 * Einen angehaengten Block aus einem Rumpf herausnehmen. `null`, wenn er dort
 * nicht wortwoertlich steht — dann hat jemand ihn bearbeitet.
 */
export function removeBlock(body: string, block: string): string | null {
  const needle = block.replace(/\r\n/g, '\n').trim();
  if (needle.length === 0) return null;
  const at = body.indexOf(needle);
  if (at < 0) return null;
  const rest = `${body.slice(0, at)}${body.slice(at + needle.length)}`;
  return `${rest.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')}\n`;
}

/** Ein Dump wird verworfen: in den Papierkorb, mit Marke zurueck. */
export async function discardDump(
  store: FilingStore,
  path: string,
): Promise<{ undoToken: string }> {
  const doc = await store.read(path);
  if (doc === null) throw new FilingError('not-found', `Dump fehlt: ${path}`);
  const removed = await store.delete(path);
  return { undoToken: removed.undoToken };
}
