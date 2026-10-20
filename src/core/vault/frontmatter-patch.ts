/**
 * Frontmatter aendern, ohne es neu zu schreiben.
 *
 * Der alte Weg war parsen → Objekt mergen → neu erzeugen. Dabei ging der Stil
 * des Nutzers verloren: aus `tags: [auth, migration]` wurde eine Blockliste
 * ueber vier Zeilen, aus `repos: ['C:/...']` eine Liste ohne Anfuehrungszeichen
 * — obwohl nur `waiting_on[0].resolved` gesetzt werden sollte. Eine Datei, die
 * nach jedem Klick anders aussieht, ist in Git nicht lesbar und in Obsidian
 * nicht wiederzuerkennen.
 *
 * Deshalb arbeitet dieses Modul am Document-Modell von `yaml`: geparst wird der
 * Baum **mit** seiner Formatierung, geaendert wird genau der Knoten, der sich
 * unterscheidet, und ausgegeben wird derselbe Baum. Was niemand angefasst hat,
 * steht danach Zeichen fuer Zeichen so da wie vorher — samt Kommentaren.
 *
 * Das Ergebnis ist inhaltlich dasselbe wie `mergeFrontmatter`: `undefined` heisst
 * „nicht anfassen", `null` setzt ausdruecklich null, Arrays und Objekte werden als
 * Ganzes ersetzt (also werden Felder, die der neue Wert nicht mehr nennt, auch im
 * Baum entfernt). Nur der Weg dorthin ist ein anderer.
 */

import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Document, Pair, YAMLMap, YAMLSeq } from 'yaml';
import { canonicalOrder, insertionIndex } from './frontmatter-order';
import type { Frontmatter } from './frontmatter';

const PARSE_OPTIONS = { schema: 'core', version: '1.2' } as const;

type Path = readonly (string | number)[];

/**
 * Was `yaml` beim Ausgeben nicht aus dem Baum weiss, weil es die Formatierung
 * dokumentweit entscheidet und nicht pro Knoten.
 */
interface BlockStyle {
  /** Einrueckung einer Ebene. */
  indent: number;
  /** Stehen Listenpunkte eingerueckt unter ihrem Schluessel? */
  indentSeq: boolean;
  /** `[ a, b ]` statt `[a, b]`. */
  flowCollectionPadding: boolean;
}

/** Wie viele Leerzeichen am Zeilenanfang. */
function leading(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Den Blockstil aus dem vorgefundenen Text ablesen. `yaml` gibt Einrueckung und
 * Flow-Abstand fuer das ganze Dokument einheitlich aus; ohne diese Messung
 * bekaeme eine Datei mit vierer-Einrueckung nach dem ersten Klick eine mit zwei
 * — eine Aenderung an Zeilen, die niemand angefasst hat.
 */
function styleOf(raw: string): BlockStyle {
  const lines = raw.split('\n');
  let indent = 0;
  let indentSeq: boolean | null = null;
  for (const [at, line] of lines.entries()) {
    const next = lines[at + 1];
    if (next === undefined) continue;
    if (!line.trimEnd().endsWith(':') || line.trimStart().startsWith('#')) continue;
    if (next.trim().length === 0 || next.trimStart().startsWith('#')) continue;
    const own = leading(line);
    const step = leading(next);
    const child = next.trimStart();
    if (child === '-' || child.startsWith('- ')) {
      if (indentSeq === null) indentSeq = step > own;
      if (step <= own) continue;
    }
    if (step > own && indent === 0) indent = step - own;
  }
  return {
    indent: indent >= 1 && indent <= 8 ? indent : 2,
    indentSeq: indentSeq ?? true,
    /* Genau ein Leerzeichen hinter der Klammer — nicht `[]`, nicht `[\n`. */
    flowCollectionPadding: /[[{] \S/.test(raw),
  };
}

/**
 * Patch auf einen vorhandenen YAML-Block anwenden und ihn als Text zurueckgeben
 * (ohne die `---`-Begrenzer). `null` heisst: so nicht behandelbar — der Aufrufer
 * soll den Block neu erzeugen. Das gilt fuer kaputtes YAML, fuer einen leeren
 * Block und fuer alles, was keine Feldliste ist.
 */
export function patchFrontmatterYaml(raw: string, patch: Frontmatter): string | null {
  if (raw.trim().length === 0) return null;
  const doc = parseDocument(raw, PARSE_OPTIONS);
  if (doc.errors.length > 0) return null;
  const root = doc.contents;
  if (!isMap(root)) return null;

  const type = doc.get('type');
  const order = canonicalOrder(patch['type'] ?? type);
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (root.has(key)) setPreserving(doc, [key], value);
    else insertNew(doc, root, key, value, order);
  }
  /* lineWidth 0 = nie umbrechen — dieselbe Zusicherung wie beim Neuschreiben. */
  return doc.toString({ lineWidth: 0, ...styleOf(raw) });
}

/**
 * Ein neues Feld an seiner kanonischen Stelle einsetzen. `createPair` statt
 * `setIn`, weil `setIn` immer hinten anhaengt.
 */
function insertNew(
  doc: Document,
  root: YAMLMap,
  key: string,
  value: unknown,
  order: readonly string[],
): void {
  const present = root.items.map((item) => keyName(item) ?? '');
  const at = insertionIndex(present, key, order);
  root.items.splice(at, 0, doc.createPair(key, value));
}

/**
 * `value` an `path` setzen und dabei so wenig anfassen wie moeglich.
 *
 * Der Kern ist die erste Zeile jeder Verzweigung: ist der Wert schon derselbe,
 * passiert **nichts** — und damit bleibt der Stil dieses Knotens erhalten. Nur
 * wo sich etwas unterscheidet, wird geschrieben, und auch dann bleibt bei einem
 * Skalar die Anfuehrungsart stehen.
 */
function setPreserving(doc: Document, path: Path, value: unknown): void {
  const current = doc.getIn(path, true);

  if (isScalar(current) && isPrimitive(value)) {
    if (current.value === value) return;
    /* Text bleibt Text: `status: 'active'` behaelt seine Anfuehrungszeichen,
       wenn nur der Inhalt wechselt. */
    if (typeof current.value === 'string' && typeof value === 'string') {
      current.value = value;
      return;
    }
    doc.setIn(path, value);
    return;
  }

  if (isMap(current) && isPlainObject(value)) {
    for (const [key, inner] of Object.entries(value)) {
      if (inner === undefined) continue;
      if (current.has(key)) setPreserving(doc, [...path, key], inner);
      else current.items.push(doc.createPair(key, inner));
    }
    /* Als Ganzes ersetzt heisst: was der neue Wert nicht nennt, ist weg. */
    for (const key of current.items.map((item) => keyName(item))) {
      if (key === null) continue;
      if (!Object.prototype.hasOwnProperty.call(value, key)) current.delete(key);
    }
    return;
  }

  if (isSeq(current) && Array.isArray(value)) {
    fillSeq(doc, current, path, value);
    return;
  }

  doc.setIn(path, value);
}

/** Anfuehrungszeichen, die ein neuer Eintrag von seinen Nachbarn erben darf. */
const QUOTE_STYLES: readonly string[] = ['QUOTE_SINGLE', 'QUOTE_DOUBLE'];

/**
 * Der Zitierstil des letzten Skalars einer Liste; `null`, wenn keiner zitiert ist.
 *
 * Nur Anfuehrungszeichen, keine Blockstile: ein `|`-Skalar mitten in einer
 * Flow-Liste waere kein Stil mehr, sondern ein Syntaxfehler.
 */
function quoteStyleOf(seq: YAMLSeq): string | null {
  for (let at = seq.items.length - 1; at >= 0; at -= 1) {
    const item: unknown = seq.items[at];
    if (!isScalar(item) || typeof item.value !== 'string') continue;
    const type = item.type;
    return type !== undefined && QUOTE_STYLES.includes(type) ? type : null;
  }
  return null;
}

/** Eine Liste auf `value` bringen: gleiche Stellen tief, neue anhaengen, Rest weg. */
function fillSeq(doc: Document, seq: YAMLSeq, path: Path, value: readonly unknown[]): void {
  /* Ein **neuer** Eintrag erbt die Anfuehrungszeichen seiner Nachbarn. `createNode`
     baut sonst einen Plain-Scalar, und dann steht `repos: ['C:/a', C:/b]` in der
     Datei: inhaltlich gleich (yaml liest beide als denselben String), aber eine
     gemischte Schreibweise ist eine Aenderung, die niemand wollte — und die Datei
     gehoert dem Nutzer. */
  const style = quoteStyleOf(seq);
  for (const [at, entry] of value.entries()) {
    if (at < seq.items.length) {
      setPreserving(doc, [...path, at], entry);
      continue;
    }
    const node: unknown = doc.createNode(entry);
    if (style !== null && isScalar(node) && typeof node.value === 'string') {
      node.type = style as typeof node.type;
    }
    seq.items.push(node);
  }
  /* Kuerzen statt neu bauen — `splice` haelt den Rest samt Stil zusammen. */
  if (seq.items.length > value.length) seq.items.splice(value.length);
}

/** Der Schluesselname eines Paares, wenn er ein Text ist. */
function keyName(pair: Pair<unknown, unknown>): string | null {
  const key: unknown = pair.key;
  if (typeof key === 'string') return key;
  if (isScalar(key) && typeof key.value === 'string') return key.value;
  return null;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
