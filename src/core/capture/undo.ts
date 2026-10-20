/**
 * Der Rueckweg einer Ablage.
 *
 * Eine Ablage beruehrt mehrere Dateien; ein Papierkorb-Eintrag kennt nur eine.
 * Damit `undoToken` trotzdem **alles** zurueckdreht, liegt unter der Marke ein
 * Protokoll der Teilschritte: `.secondbrain/trash/<token>/filing.json`. Es
 * ueberlebt einen Neustart der App und verschwindet mit dem Papierkorb-Ordner.
 * Zu einer Marke muss dabei nicht zwingend eine Kopie gehoeren (`trashed`).
 *
 * Eine Regel gilt ueber allem: kein Rueckweg schreibt eine Nutzerzeile um. Hat
 * jemand den angehaengten Block inzwischen bearbeitet, bleibt er stehen.
 */

import type { DumpItem, WriteResult } from '@shared/types';
import { dumpFromDoc } from '@core/index/dumps';
import { joinVaultPath, trashDir } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import { FilingError, removeBlock } from './filing';
import type { FilingOptions, FilingStore } from './filing';

/** Was der Rueckweg am Store braucht. `VaultStore` erfuellt es strukturell. */
export interface UndoStore extends FilingStore {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<WriteResult>;
}

/** Ein ausgefuehrter Teilschritt, in der Form, in der er sich zuruecknehmen laesst. */
export type Step =
  | { kind: 'appended'; path: string; block: string }
  | { kind: 'created'; path: string }
  | { kind: 'frontmatter'; path: string; field: 'waiting_on' | 'status'; before: unknown };

/** Das Protokoll einer Ablage, wie es auf der Platte liegt. */
export interface FilingJournal {
  version: 1;
  dumpPath: string;
  /** Status des Dumps vor der Ablage — sonst kaeme er als „filed" zurueck. */
  dumpStatus: string | null;
  /** Liegt zu dieser Marke eine Papierkorb-Kopie? „Liegen lassen" schreibt nur
      ein Feld um und loescht nichts — dort gibt es nichts zurueckzuholen.
      Fehlt das Feld (aeltere Protokolle), gilt `true`: die einzigen Aufrufer
      vor dieser Erweiterung waren ausschliesslich Ablage und Verwerfen. */
  trashed?: boolean;
  steps: Step[];
}

/** Wo das Protokoll liegt: neben der Papierkorb-Kopie des Dumps. */
export function filingJournalPath(token: string): string {
  return joinVaultPath(trashDir(), token, 'filing.json');
}

function isStep(value: unknown): value is Step {
  if (value === null || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof (value as { path?: unknown }).path !== 'string') return false;
  return kind === 'appended' || kind === 'created' || kind === 'frontmatter';
}

/** Protokoll aus rohem JSON lesen; `null`, wenn es unbrauchbar ist. */
export function parseJournal(raw: string | null): FilingJournal | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const steps = (parsed as { steps?: unknown }).steps;
    const dumpPath = (parsed as { dumpPath?: unknown }).dumpPath;
    const status = (parsed as { dumpStatus?: unknown }).dumpStatus;
    const trashed = (parsed as { trashed?: unknown }).trashed;
    if (!Array.isArray(steps) || typeof dumpPath !== 'string') return null;
    return {
      version: 1,
      dumpPath,
      dumpStatus: typeof status === 'string' ? status : null,
      trashed: trashed === false ? false : true,
      steps: steps.filter(isStep),
    };
  } catch {
    return null;
  }
}

/** Protokoll schreiben. Fehlt es spaeter, wird nur der Dump wiederhergestellt. */
export async function writeJournal(
  store: UndoStore,
  token: string,
  journal: FilingJournal,
): Promise<void> {
  await store.writeText(filingJournalPath(token), `${JSON.stringify(journal, null, 2)}\n`);
}

/** Einen Teilschritt zuruecknehmen. */
export async function revertStep(store: UndoStore, step: Step): Promise<void> {
  if (step.kind === 'created') {
    await store.delete(step.path);
    return;
  }
  const doc = await store.read(step.path);
  if (doc === null) return;
  if (step.kind === 'appended') {
    const body = removeBlock(doc.body, step.block);
    // `null` heisst: der Nutzer hat den Block inzwischen selbst bearbeitet. Dann
    // bleibt er stehen — kein Rueckweg schreibt eine fremde Zeile um.
    if (body === null) return;
    await store.write({ path: step.path, body, expectedHash: doc.hash });
    return;
  }
  await store.write({
    path: step.path,
    frontmatter: { [step.field]: step.before },
    expectedHash: doc.hash,
  });
}

/**
 * Eine Ablage zuruecknehmen: erst die Teilschritte, dann der Dump aus dem
 * Papierkorb, dann sein alter Status. Ohne Protokoll (etwa nach
 * `capture:discard`) bleibt es beim Wiederherstellen der Datei — die Marke
 * funktioniert in beiden Faellen.
 *
 * `trashed: false` heisst: zu dieser Marke gibt es keine Papierkorb-Kopie —
 * so bei „Liegen lassen" (`keepDump`) und beim Ablegen, das den Dump als Beleg
 * liegen laesst (`applyProposal`). `store.undo(token)` wuerde dort mit „nicht
 * gefunden" scheitern; es gibt nichts zu holen, also wird es gar nicht erst
 * versucht. Der Dump kommt dann ueber `dumpStatus` weiter unten zurecht.
 */
export async function undoFiling(store: UndoStore, token: string): Promise<string[]> {
  const journal = parseJournal(await store.readText(filingJournalPath(token)));
  const touched: string[] = [];
  const note = (path: string): void => {
    if (!touched.includes(path)) touched.push(path);
  };

  for (const step of [...(journal?.steps ?? [])].reverse()) {
    await revertStep(store, step);
    note(step.path);
  }
  if (journal === null || journal.trashed !== false) {
    for (const path of await store.undo(token)) note(path);
  }

  // Der abgelegte Dump trug `status: filed` samt Beleg-Feldern. Wird die Ablage
  // zurueckgedreht, muss er wieder den Status tragen, mit dem er vorher dalag —
  // sonst verschwindet er aus jeder Liste, die auf offene Dumps schaut — und der
  // Beleg muss weg, denn er zeigte auf eine Ablage, die es nicht mehr gibt.
  // `null` heisst „ausdruecklich nicht gesetzt": der Merge kann Felder nur setzen,
  // nicht entfernen (`frontmatter.ts`).
  const status = journal?.dumpStatus ?? null;
  if (journal !== null && status !== null) {
    const restored = await store.read(journal.dumpPath);
    if (restored !== null) {
      await store.write({
        path: journal.dumpPath,
        frontmatter: { status, filed_into: null, filed_at: null },
        expectedHash: restored.hash,
      });
      /* Ohne diese Zeile fehlte der Dump in `touched`: liegt er nicht im Papierkorb
         (`trashed: false`), nennt ihn kein anderer Zweig — der Aufrufer wuerde den
         Index fuer die eine Datei nicht nachziehen, obwohl das Rueckgaengig
         gelungen ist. */
      note(journal.dumpPath);
    }
  }
  return touched;
}

/**
 * Ein Dump bleibt bewusst liegen: `status: kept`, mit echtem Rueckweg.
 *
 * Anders als beim Ablegen oder Verwerfen wird dabei nichts geloescht — die
 * Marke traegt deshalb nur den vorigen Status als Teilschritt und
 * `trashed: false`, damit `undoFiling` nicht in einem Papierkorb sucht, den es
 * dafuer nie gab. Ohne diese Marke waere „Liegen lassen" der einzige
 * Schreibweg der App ohne Rueckgaengig.
 */
export async function keepDump(
  store: UndoStore,
  path: string,
  options: FilingOptions = {},
): Promise<{ dump: DumpItem; undoToken: string }> {
  const doc = await store.read(path);
  if (doc === null) throw new FilingError('not-found', `Dump fehlt: ${path}`);
  const before = doc.frontmatter['status'] ?? null;
  await store.write({ path, frontmatter: { status: 'kept' }, expectedHash: doc.hash });

  const token = createUndoToken();
  await writeJournal(store, token, {
    version: 1,
    dumpPath: path,
    dumpStatus: null,
    trashed: false,
    steps: [{ kind: 'frontmatter', path, field: 'status', before }],
  });

  const updated = await store.read(path);
  return { dump: dumpFromDoc(updated ?? doc, options), undoToken: token };
}
