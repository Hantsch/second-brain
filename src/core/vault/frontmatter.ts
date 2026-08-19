/**
 * YAML-Frontmatter lesen, schreiben und mergen.
 *
 * Zwei Regeln aus VAULT-FORMAT.md bestimmen alles hier:
 * 1. Unbekannte Felder bleiben erhalten — die App entfernt nie, was sie nicht kennt.
 * 2. Datumsfelder sind Strings. `yaml` wuerde sie mit dem YAML-1.1-Schema in
 *    `Date`-Objekte verwandeln; wir bleiben deshalb ausdruecklich beim Core-Schema.
 *
 * Kaputtes oder fehlendes Frontmatter wirft nicht. Es kommt als leeres Objekt mit
 * einer Warnung zurueck, damit ein einzelner Tippfehler in einer Datei nicht die
 * ganze Indizierung stoppt.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const DELIMITER = '---';

/* Core-Schema, YAML 1.2: '2026-08-10' bleibt ein String, 'no' bleibt 'no'. */
const PARSE_OPTIONS = { schema: 'core', version: '1.2' } as const;
/* lineWidth 0 = nie umbrechen. Lange Werte (next_step, Repo-Pfade) bleiben einzeilig. */
const STRINGIFY_OPTIONS = { schema: 'core', version: '1.2', lineWidth: 0 } as const;

export type Frontmatter = Record<string, unknown>;

export interface ParsedDocument {
  frontmatter: Frontmatter;
  /** Der Text unter dem Frontmatter, unveraendert. */
  body: string;
  /** War ueberhaupt ein Frontmatter-Block vorhanden? */
  hadFrontmatter: boolean;
  /** Deutschsprachiger Hinweis, wenn etwas fehlte oder nicht lesbar war. */
  warning?: string;
  /** Der rohe YAML-Text, wenn er sich nicht parsen liess — damit nichts verloren geht. */
  rawFrontmatter?: string;
}

/**
 * Trennt den Frontmatter-Block **wortwoertlich** vom Rumpf. `prefix` enthaelt den
 * Block samt Begrenzern und abschliessendem Umbruch. Damit kann ein Aufrufer den
 * Rumpf aendern, ohne das YAML des Nutzers neu zu formatieren.
 */
export function splitFrontmatterBlock(content: string): { prefix: string; body: string } {
  const text = stripBom(content);
  const bom = content.length > text.length ? content.slice(0, content.length - text.length) : '';
  const lines = text.split('\n');
  if (lines.length === 0 || (lines[0] ?? '').trimEnd() !== DELIMITER) {
    return { prefix: bom, body: text };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if ((lines[i] ?? '').trimEnd() === DELIMITER) {
      const prefix = `${bom}${lines.slice(0, i + 1).join('\n')}\n`;
      return { prefix, body: lines.slice(i + 1).join('\n') };
    }
  }
  // Kein Abschluss gefunden: der Block ist kaputt, wir tasten den Rumpf nicht an.
  return { prefix: bom, body: text };
}

/** Frontmatter und Rumpf einer Markdown-Datei. Wirft nie. */
export function parse(content: string): ParsedDocument {
  const text = stripBom(content ?? '');
  const lines = text.split('\n');
  if ((lines[0] ?? '').trimEnd() !== DELIMITER) {
    return {
      frontmatter: {},
      body: text,
      hadFrontmatter: false,
      warning: 'Kein Frontmatter gefunden; die Datei wird als reiner Text behandelt.',
    };
  }
  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === DELIMITER);
  if (closing < 0) {
    return {
      frontmatter: {},
      body: text,
      hadFrontmatter: false,
      warning: 'Frontmatter ohne abschliessende "---"-Zeile; nichts davon wird gedeutet.',
      rawFrontmatter: lines.slice(1).join('\n'),
    };
  }
  const rawFrontmatter = lines.slice(1, closing).join('\n');
  const body = lines.slice(closing + 1).join('\n');
  let parsed: unknown;
  try {
    parsed = rawFrontmatter.trim().length === 0 ? {} : parseYaml(rawFrontmatter, PARSE_OPTIONS);
  } catch (error) {
    return {
      frontmatter: {},
      body,
      hadFrontmatter: true,
      warning: `Frontmatter ist kein gueltiges YAML: ${messageOf(error)}`,
      rawFrontmatter,
    };
  }
  if (parsed === null || parsed === undefined) {
    return { frontmatter: {}, body, hadFrontmatter: true };
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      frontmatter: {},
      body,
      hadFrontmatter: true,
      warning: 'Frontmatter ist keine Feldliste; es wird ignoriert.',
      rawFrontmatter,
    };
  }
  return { frontmatter: { ...(parsed as Frontmatter) }, body, hadFrontmatter: true };
}

/**
 * Der rohe YAML-Text zwischen den Begrenzern — `null`, wenn die Datei keinen
 * Frontmatter-Block hat oder er nicht geschlossen ist. Wortwoertlich, damit ein
 * Aufrufer ihn aendern kann, ohne ihn neu zu erzeugen.
 */
export function frontmatterText(content: string): string | null {
  const text = stripBom(content ?? '');
  const lines = text.split('\n');
  if ((lines[0] ?? '').trimEnd() !== DELIMITER) return null;
  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === DELIMITER);
  return closing < 0 ? null : lines.slice(1, closing).join('\n');
}

/**
 * Frontmatter und Rumpf zu einer Datei zusammensetzen. Leeres Frontmatter erzeugt
 * keinen Block — Dateien wie `wiki/log.md` tragen bewusst keins.
 */
export function serialize(frontmatter: Frontmatter, body: string): string {
  const fields = dropUndefined(frontmatter);
  if (Object.keys(fields).length === 0) return normalizeBody(body);
  return serializeBlock(stringifyYaml(fields, STRINGIFY_OPTIONS), body);
}

/**
 * Einen fertigen YAML-Block (ohne Begrenzer) mit einem Rumpf zu einer Datei
 * fuegen. Die eine Stelle, die weiss, wie eine Vault-Datei aufgebaut ist.
 */
export function serializeBlock(yamlBlock: string, body: string): string {
  const block = yamlBlock.endsWith('\n') ? yamlBlock : `${yamlBlock}\n`;
  return `${DELIMITER}\n${block}${DELIMITER}\n\n${normalizeBody(body)}`;
}

/**
 * Merge mit Gedaechtnis: bestehende Felder behalten ihre Reihenfolge, neue Felder
 * kommen hinten dazu, unbekannte Felder des Nutzers bleiben unangetastet.
 *
 * - `undefined` im Patch heisst „nicht anfassen" — nie „loeschen".
 * - `null` im Patch setzt das Feld ausdruecklich auf null.
 * - Arrays und Objekte werden als Ganzes ersetzt, nicht tief gemischt.
 */
export function mergeFrontmatter(existing: Frontmatter, patch: Frontmatter): Frontmatter {
  const merged: Frontmatter = { ...existing };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged;
}

/** Nur die Felder, die tatsaechlich gesetzt sind. */
function dropUndefined(fields: Frontmatter): Frontmatter {
  const result: Frontmatter = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** Rumpf normalisieren: keine Leerzeilen am Anfang, genau ein Umbruch am Ende. */
function normalizeBody(body: string): string {
  const text = (body ?? '').replace(/^\s*\n/, '').replace(/\s+$/, '');
  return text.length === 0 ? '' : `${text}\n`;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
