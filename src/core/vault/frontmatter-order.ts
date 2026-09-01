/**
 * Die kanonische Reihenfolge der Frontmatter-Felder, abgelesen aus
 * docs/VAULT-FORMAT.md — eine Liste je Dokumenttyp, weil die Beispiele dort
 * bewusst verschieden bauen (ein Dump nennt `created` vor `status`, ein Projekt
 * `scope` vor `status`).
 *
 * Sie entscheidet **nur, wohin ein neues Feld kommt**. Vorhandene Felder
 * behalten ihren Platz, auch wenn der Nutzer sie anders sortiert hat: seine
 * Datei ist seine Datei. Ohne diese Tabelle landete ein erstmalig gesetztes
 * `next_step` hinter `waiting_on` — formal richtig, zum Lesen falsch.
 */

/** Wiki-Seiten (source, entity, concept, overview) tragen dasselbe Schema. */
const WIKI = [
  'type',
  'title',
  'module',
  'created',
  'updated',
  'reviewed',
  'tags',
  'sources',
] as const;

const PROJECT = [
  'type',
  'title',
  'slug',
  'scope',
  'status',
  'priority',
  'favorite',
  'created',
  'started',
  'deadline',
  'updated',
  'next_step',
  'status_set',
  'next_step_set',
  'tags',
  'modules',
  'repos',
  'waiting_on',
] as const;

/** Verdichtete Area (`areas/<slug>.condensed.md`) — die Belege stehen in `sources`. */
const CONDENSED = ['type', 'title', 'condensed_at', 'sources', 'created', 'updated', 'tags'] as const;

const CANONICAL: Readonly<Record<string, readonly string[]>> = {
  project: PROJECT,
  condensed: CONDENSED,
  dump: ['type', 'title', 'created', 'updated', 'origin', 'status', 'tags', 'scope'],
  journal: [
    'type',
    'title',
    'date',
    'closed',
    'created',
    'updated',
    'mood',
    'energy',
    'people',
    'projects',
    'tags',
  ],
  note: ['type', 'title', 'description', 'slug', 'scope', 'created', 'updated', 'tags'],
  source: WIKI,
  entity: WIKI,
  concept: WIKI,
  overview: WIKI,
};

/**
 * Die Reihenfolge fuer einen Dokumenttyp. Ein unbekannter Typ hat keine — dann
 * kommt ein neues Feld hinten dazu, statt geraten zu werden.
 */
export function canonicalOrder(type: unknown): readonly string[] {
  return typeof type === 'string' ? (CANONICAL[type] ?? []) : [];
}

/**
 * Wohin `key` zwischen `present` gehoert: der Index, vor dem eingefuegt wird,
 * oder `present.length` fuer „hinten dran".
 *
 * Eingefuegt wird vor dem ersten bekannten Feld, das in der kanonischen
 * Reihenfolge spaeter kommt. Felder, die die Reihenfolge nicht kennt (die des
 * Nutzers), sind dabei durchsichtig — sie halten nichts auf und werden nicht
 * verschoben.
 */
export function insertionIndex(
  present: readonly string[],
  key: string,
  order: readonly string[],
): number {
  const rank = order.indexOf(key);
  if (rank < 0) return present.length;
  for (const [at, name] of present.entries()) {
    const other = order.indexOf(name);
    if (other > rank) return at;
  }
  return present.length;
}
