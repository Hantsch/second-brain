/**
 * Einen Ablage-Vorschlag ausfuehren — vollstaendig oder gar nicht.
 *
 * Ein Vorschlag beruehrt oft mehr als eine Datei: die Notiz beim Projekt, die
 * Todos unter '## Todos', `waiting_on` im Frontmatter, am Ende der Dump selbst.
 * Zwei Zusagen halten das zusammen:
 *
 * - **Kein halber Zustand.** Scheitert ein Schritt in der Mitte, wird alles
 *   Geschriebene zurueckgedreht und der Fehler gemeldet.
 * - **Ein Rueckweg fuer alles.** Der `undoToken` dreht jeden Teilschritt zurueck,
 *   nicht nur den Dump; das Protokoll dazu liegt unter der Marke im
 *   Papierkorb-Ordner (`undo.ts`).
 *
 * Der abgelegte Dump **bleibt liegen**: er traegt `status: filed` samt `filed_into`
 * und `filed_at` und wird damit zum Beleg, wohin sein Inhalt gewandert ist. Es gibt
 * dafuer weder eine Papierkorb-Kopie noch eine Loeschung — `movedTo` ist immer `null`.
 *
 * Format: docs/VAULT-FORMAT.md. Neue Projektdateien tragen die Abschnitte Stand,
 * Todos und Notizen; angehaengte Dumps stehen unter „Notizen" mit ihrem Datum.
 */

import type {
  FilingAction,
  FilingProposal,
  FilingResult,
  WaitingOn,
  WriteResult,
} from '@shared/types';
import { isoDay } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { createUndoToken } from '@core/vault/trash';
import { SECTION_NOTES, SECTION_STATE, SECTION_TODOS } from './actions';
import { FilingError } from './filing';
import { revertStep, writeJournal } from './undo';
import type { FilingJournal, Step, UndoStore } from './undo';

/** Was das Ausfuehren am Store braucht. `VaultStore` erfuellt es strukturell. */
export interface ProposalStore extends UndoStore {
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
}

export interface ApplyOptions {
  /** Das „jetzt" fuer Datumsfelder. Tests geben eine feste Zeit. */
  now?: DateLike;
  /**
   * Hashes, die der Aufrufer gelesen hat, je Pfad. Wer sie mitgibt, bekommt bei
   * einer fremden Aenderung einen Konflikt statt eines Ueberschreibens.
   */
  expectedHashes?: Readonly<Record<string, string>>;
}

/** Slug eines Projekts aus seinem Pfad — der Pfad ist die Wahrheit, nicht der Titel. */
function projectSlugOf(path: string): string {
  const match = /^projects\/[^/]+\/([^/]+)\/project\.md$/.exec(path);
  if (match?.[1] === undefined) throw new FilingError('invalid', `Kein Projektpfad: ${path}`);
  return match[1];
}

/** Frontmatter einer neuen Projektdatei nach VAULT-FORMAT.md. */
function projectFrontmatter(
  proposal: FilingProposal,
  slug: string,
  today: string,
): Record<string, unknown> {
  const firstTodo = proposal.todos[0];
  return {
    type: 'project',
    title: proposal.title,
    slug,
    scope: proposal.scope,
    status: 'active',
    status_set: { at: today, by: 'filing' },
    priority: 3,
    started: today,
    ...(firstTodo === undefined
      ? {}
      : { next_step: firstTodo.text, next_step_set: { at: today, by: 'filing' } }),
    tags: proposal.tags,
    modules: [],
    repos: [],
    created: today,
    updated: today,
    ...(proposal.waitingOn.length > 0 ? { waiting_on: proposal.waitingOn } : {}),
  };
}

/** Rumpf einer neuen Projektdatei: die drei Abschnitte, die jedes Projekt hat. */
function projectBody(state: string): string {
  return [
    `## ${SECTION_STATE}`,
    '',
    state.trim(),
    '',
    `## ${SECTION_TODOS}`,
    '',
    `## ${SECTION_NOTES}`,
    '',
  ].join('\n');
}

/** Ein Warte-auf gilt als dasselbe, wenn Person und Sache uebereinstimmen. */
function waitingKey(entry: WaitingOn): string {
  return `${entry.who.trim().toLowerCase()}|${entry.what.trim().toLowerCase()}`;
}

/**
 * Bestehende und neue Eintraege zusammenlegen. Bestand gewinnt: was der Nutzer
 * selbst eingetragen hat, ueberlebt jeden Schreibvorgang der App.
 */
export function mergeWaitingOn(existing: unknown, added: readonly WaitingOn[]): WaitingOn[] {
  const list = Array.isArray(existing) ? [...(existing as WaitingOn[])] : [];
  const seen = new Set(
    list
      .filter(
        (entry) => entry !== null && typeof entry === 'object' && typeof entry.who === 'string',
      )
      .map(waitingKey),
  );
  for (const entry of added) {
    const key = waitingKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(entry);
  }
  return list;
}

/** Ein Ausfuehrungslauf mit Gedaechtnis: was gelang, laesst sich zuruecknehmen. */
class Run {
  readonly steps: Step[] = [];
  readonly written: string[] = [];

  constructor(
    private readonly store: ProposalStore,
    private readonly options: ApplyOptions,
  ) {}

  /**
   * Der Hash, gegen den geschrieben wird. Der mitgegebene Hash schuetzt vor einer
   * **fremden** Aenderung — nach dem ersten eigenen Schreibvorgang in dieselbe
   * Datei zaehlt deshalb der frisch gelesene, sonst wuerde sich der Lauf selbst
   * im Weg stehen.
   */
  private hashFor(path: string, fresh: string): string {
    return this.written.includes(path) ? fresh : (this.options.expectedHashes?.[path] ?? fresh);
  }

  private note(path: string): void {
    if (!this.written.includes(path)) this.written.push(path);
  }

  /** Einen Block unter einem Abschnitt anhaengen. */
  async append(action: FilingAction, section: string): Promise<void> {
    const block = action.content.replace(/\r\n/g, '\n').trim();
    if (block.length === 0) return;
    const doc = await this.store.read(action.path);
    if (doc === null) throw new FilingError('not-found', `Zieldatei fehlt: ${action.path}`);
    await this.store.append(action.path, section, block, {
      expectedHash: this.hashFor(action.path, doc.hash),
    });
    this.steps.push({ kind: 'appended', path: action.path, block });
    this.note(action.path);
  }

  /** Eine neue Datei anlegen. Existiert sie schon, ist das ein Konflikt. */
  async create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<void> {
    await this.store.create(path, frontmatter, body);
    this.steps.push({ kind: 'created', path });
    this.note(path);
  }

  /** `waiting_on` mergen, ohne bestehende Eintraege zu verlieren. */
  async mergeWaiting(path: string, added: readonly WaitingOn[]): Promise<void> {
    if (added.length === 0) return;
    const doc = await this.store.read(path);
    if (doc === null) throw new FilingError('not-found', `Zieldatei fehlt: ${path}`);
    const raw = doc.frontmatter['waiting_on'];
    const before = Array.isArray(raw) ? raw : [];
    const merged = mergeWaitingOn(before, added);
    if (merged.length === before.length) return;
    await this.store.write({
      path,
      frontmatter: { waiting_on: merged },
      expectedHash: this.hashFor(path, doc.hash),
    });
    this.steps.push({ kind: 'frontmatter', path, field: 'waiting_on', before });
    this.note(path);
  }

  /** Alles zurueckdrehen, was dieser Lauf geschrieben hat — letzter Schritt zuerst. */
  async rollback(): Promise<void> {
    for (const step of [...this.steps].reverse()) {
      try {
        await revertStep(this.store, step);
      } catch {
        // Ein gescheiterter Rueckweg darf den eigentlichen Fehler nicht verdecken.
        continue;
      }
    }
    this.steps.length = 0;
  }
}

/** Der Abschnitt, unter dem eine Aktion landet. */
function sectionOf(action: FilingAction, fallback: string): string {
  const section = action.section?.trim();
  return section === undefined || section.length === 0 ? fallback : section;
}

/**
 * Der Status, den der Dump vor der Ablage trug — der Wert, auf den ein Rueckgaengig
 * ihn zurueckstellt.
 *
 * Trug er keinen, ist die Antwort `raw`: genau das leitet jeder Leser aus einem
 * Dump ohne `status` ab (`index/dumps.ts`). Die Ablage schreibt das Feld ohnehin,
 * und `null` hiesse fuer den Rueckweg „nichts zurueckzustellen" — der Dump bliebe
 * mit `status: filed` liegen, obwohl seine Ablage gerade zurueckgenommen wurde.
 */
function previousStatus(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'raw';
}

/**
 * Den Hauptvorschlag ausfuehren. `inbox` schreibt keine Zieldatei: der Dump bleibt
 * liegen und wird nur als bewusst behalten markiert.
 */
async function applyPrimary(run: Run, proposal: FilingProposal, today: string): Promise<void> {
  const action = proposal.primary;
  if (action.target === 'inbox') return;
  if (action.target === 'new-project') {
    await run.create(
      action.path,
      projectFrontmatter(proposal, projectSlugOf(action.path), today),
      projectBody(action.content),
    );
    return;
  }
  await run.append(action, sectionOf(action, SECTION_NOTES));
}

/**
 * Einen Vorschlag ausfuehren: Hauptziel, Nebenschreibvorgaenge, `waiting_on`, dann
 * der Dump. Rueckgabe traegt die Marke, mit der sich alles zuruecknehmen laesst.
 */
export async function applyProposal(
  store: ProposalStore,
  proposal: FilingProposal,
  options: ApplyOptions = {},
): Promise<FilingResult> {
  const today = isoDay(options.now ?? new Date());
  const dump = await store.read(proposal.dumpPath);
  if (dump === null) throw new FilingError('not-found', `Dump fehlt: ${proposal.dumpPath}`);
  const dumpHash = options.expectedHashes?.[proposal.dumpPath] ?? dump.hash;
  const keepsDump = proposal.primary.target === 'inbox';

  const run = new Run(store, options);
  try {
    await applyPrimary(run, proposal, today);

    /* Ein echtes Ziel (nicht `inbox`), das trotzdem nichts geschrieben hat: der
       Vorschlagstext war leer oder nur Leerraum — `Run.append` haengt einen
       leeren Block gar nicht erst an. Ohne diese Pruefung liefe der Code unten
       weiter und schriebe `status: filed` samt `filed_into` auf eine Zieldatei,
       die nichts empfangen hat: ein Beleg, der lügt, und ein Widerspruch zum
       `written`, das dann leer bliebe. Kein stiller Erfolg also, sondern ein
       Fehler — die Oberflaeche zeigt ihn, statt eine Ablage zu bestaetigen, die
       nie stattfand. */
    if (!keepsDump && run.written.length === 0) {
      throw new FilingError('invalid', 'Nichts zum Ablegen: der Text ist leer.');
    }

    /* Bleibt der Dump liegen, wird **nichts** geschrieben — auch kein Todo-Block
       in einer fremden Projektdatei. Es gaebe dafuer keinen Rueckweg: dieser Zweig
       schreibt kein Protokoll und gibt keine Marke zurueck. Ein Schreibvorgang ohne
       Rueckweg ist keiner, den die Oberflaeche „Liegen lassen" nennen darf. */
    if (!keepsDump) {
      for (const extra of proposal.extras) {
        if (extra.target === 'inbox') continue;
        await run.append(extra, sectionOf(extra, SECTION_TODOS));
      }
      // Bei `new-project` steht `waiting_on` schon im frisch geschriebenen Frontmatter.
      if (proposal.primary.target !== 'new-project') {
        await run.mergeWaiting(proposal.primary.path, proposal.waitingOn);
      }
    }

    /* Der Beleg: wohin der Inhalt ging und an welchem Tag. Nur beim Ablegen — ein
       liegen gelassener Dump wurde nirgends abgelegt und traegt die Felder nicht. */
    const filedFields = keepsDump ? {} : { filed_into: proposal.primary.path, filed_at: today };
    await store.write({
      path: proposal.dumpPath,
      frontmatter: { status: keepsDump ? 'kept' : 'filed', ...filedFields },
      expectedHash: dumpHash,
    });
    if (keepsDump) {
      return {
        dumpPath: proposal.dumpPath,
        written: [...run.written],
        movedTo: null,
        undoToken: null,
      };
    }

    /* Die Marke entsteht hier selbst, nicht aus einer Loeschung: der Dump bleibt als
       Beleg liegen, es gibt also keine Papierkorb-Kopie, die eine Marke stiften
       koennte. Das Protokoll traegt sie trotzdem — und `trashed: false` sagt dem
       Rueckweg, dass er im Papierkorb nichts zu suchen hat. */
    const token = createUndoToken();
    const journal: FilingJournal = {
      version: 1,
      dumpPath: proposal.dumpPath,
      dumpStatus: previousStatus(dump.frontmatter['status']),
      trashed: false,
      steps: run.steps,
    };
    await writeJournal(store, token, journal);

    return {
      dumpPath: proposal.dumpPath,
      written: [...run.written],
      movedTo: null,
      undoToken: token,
    };
  } catch (error) {
    await run.rollback();
    throw error;
  }
}
