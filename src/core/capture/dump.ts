/**
 * Reindumpen: Text → Datei in `inbox/`.
 *
 * Der Schreibpfad ist absichtlich dumm. Er ordnet nichts ein, ruft kein Modell
 * und wartet auf nichts: der Gedanke muss weg sein, bevor er verloren geht.
 * Eingeordnet wird später, als Vorschlag, den der Nutzer bestätigt.
 *
 * Format: docs/VAULT-FORMAT.md, Abschnitt „Dump".
 */

import type { CaptureOrigin, DumpItem, Scope, WriteResult } from '@shared/types';
import { wordCount } from '@core/vault/doc';
import { MAX_SLUG_LENGTH, inboxPath, slugify } from '@core/vault/paths';
import type { DateLike } from '@core/vault/paths';
import { dumpId } from '@core/index/dumps';

/**
 * Was der Schreibpfad am Store braucht — bewusst schmal. `VaultStore` erfüllt es
 * strukturell; die Shell reicht ihre eigene, ebenso schmale Sicht herein.
 */
export interface DumpStore {
  exists(path: string): Promise<boolean>;
  create(path: string, frontmatter: Record<string, unknown>, body: string): Promise<WriteResult>;
}

/** Laenge des abgeleiteten Titels. Genug für eine Zeile in der Inbox. */
const TITLE_CHARS = 70;

/** So viele Namensvarianten werden probiert, wenn die Minute schon belegt ist. */
const MAX_ATTEMPTS = 50;

/**
 * Platz, den die Unterscheidung im Namen braucht: '-2' bis '-50', im Notfall
 * '-<Millisekunden>' (13 Stellen plus Bindestrich).
 */
const SUFFIX_ROOM = 14;

export interface DumpInput {
  text: string;
  origin: CaptureOrigin;
  tags?: string[];
  scope?: Scope | null;
}

export interface DumpWriteOptions {
  /** Das „jetzt" für Dateiname und `created`. Tests geben eine feste Zeit. */
  now?: DateLike;
}

/** Der Text ist leer, es gibt nichts abzulegen. */
export class EmptyDumpError extends Error {
  readonly code = 'invalid' as const;

  constructor() {
    super('Der Dump ist leer.');
    this.name = 'EmptyDumpError';
  }
}

/**
 * Titel eines Dumps: die erste inhaltliche Zeile, gekürzt. Ein Dump hat keinen
 * Titel — deshalb wird er abgeleitet und nicht erfunden.
 */
export function dumpTitle(text: string, maxChars = TITLE_CHARS): string {
  const first = text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|#{1,6}\s+|>\s*)/, '').trim())
    .find((line) => line.length > 0);
  if (first === undefined) return '';
  if (first.length <= maxChars) return first;
  const cut = first.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Freier Pfad in `inbox/`: bei Kollision wird '-2', '-3' … angehängt.
 *
 * Der Namensteil wird für die Varianten **vorher** gekürzt. `inboxPath` slugifiziert
 * erneut und kappt dabei auf `MAX_SLUG_LENGTH` — bei einem langen Titel fiele die
 * angehängte Nummer genau dieser Kappung zum Opfer, jeder Versuch hieße wieder
 * gleich, und der zweite Dump derselben Minute käme als Konflikt zurück statt als
 * Datei. Ein Gedanke darf nicht daran scheitern, dass er lang anfängt.
 */
async function freeInboxPath(store: DumpStore, at: DateLike, slug: string): Promise<string> {
  const first = inboxPath(at, slug);
  if (!(await store.exists(first))) return first;

  const base = slugify(slug, MAX_SLUG_LENGTH - SUFFIX_ROOM);
  for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const candidate = inboxPath(at, `${base}-${attempt}`);
    if (!(await store.exists(candidate))) return candidate;
  }
  return inboxPath(at, `${base}-${Date.now()}`);
}

/**
 * Schreibt den Dump und gibt ihn zurück, wie der Renderer ihn anzeigt.
 * Der Index zieht über den Watcher nach — hier wird nichts indiziert.
 */
export async function writeDump(
  store: DumpStore,
  input: DumpInput,
  options: DumpWriteOptions = {},
): Promise<DumpItem> {
  const text = input.text.replace(/\r\n/g, '\n').trim();
  if (text.length === 0) throw new EmptyDumpError();

  const at = options.now ?? new Date();
  const created = new Date(at instanceof Date ? at : new Date(at)).toISOString();
  const title = dumpTitle(text);
  const tags = (input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  const scope = input.scope ?? null;
  const path = await freeInboxPath(store, at, slugify(title));

  await store.create(
    path,
    {
      type: 'dump',
      title,
      created,
      origin: input.origin,
      status: 'raw',
      tags,
      scope,
    },
    `${text}\n`,
  );

  return {
    path,
    id: dumpId(path),
    title,
    text,
    created,
    origin: input.origin,
    status: 'raw',
    ageDays: 0,
    wordCount: wordCount(text),
    tags,
    scope,
  };
}
