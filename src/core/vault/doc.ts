/**
 * Hilfen zum Lesen typisierter Dokumente und zum Verdichten ihres Rumpfs.
 *
 * `excerpt` liefert den Wiedereinstiegspunkt, den Karten und Listen zeigen: den
 * ersten echten Absatz — keine Ueberschrift, kein Frontmatter, keine Liste.
 */

import type { BaseFrontmatter, VaultDoc } from '@shared/types';
import { parse, splitFrontmatterBlock } from './frontmatter';
import { byteLength, sha256 } from './hash';
import { sectionMap } from './sections';
import { baseName, extName, slugify } from './paths';
import type { VaultStore } from './types';

/** Zeilen, die kein Prosa-Absatz sind. */
const NON_PROSE = /^ {0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||:{3}|<!--|<[a-z]|={3,}$|-{3,}$)/i;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Rohtext zu einem Dokument machen. `hash` und `size` beziehen sich immer auf den
 * vollen Dateiinhalt, damit externe Aenderungen zuverlaessig auffallen.
 */
export function toVaultDoc<F extends BaseFrontmatter = BaseFrontmatter>(
  path: string,
  content: string,
  meta: { modified: string; hash?: string; size?: number },
): VaultDoc<F> {
  const parsed = parse(content);
  return {
    path,
    // Der Typ ist eine Zusage des Aufrufers: was in der Datei steht, prueft er selbst.
    frontmatter: parsed.frontmatter as unknown as F,
    body: parsed.body,
    hash: meta.hash ?? sha256(content),
    modified: meta.modified,
    size: meta.size ?? byteLength(content),
  };
}

/** Dokument mit erwartetem Frontmatter-Typ lesen; `null`, wenn es die Datei nicht gibt. */
export async function readDoc<F extends BaseFrontmatter = BaseFrontmatter>(
  store: VaultStore,
  path: string,
): Promise<VaultDoc<F> | null> {
  const doc = await store.read(path);
  return doc === null ? null : (doc as VaultDoc<F>);
}

/** Abschnitt → Text, fuer alle '##'-Ueberschriften des Rumpfs. */
export function extractSections(body: string): Map<string, string> {
  return sectionMap(body, 2);
}

/** Woerter im Rumpf. Code-Blöcke und Frontmatter zaehlen nicht mit. */
export function wordCount(body: string): number {
  const text = stripCode(splitFrontmatterBlock(body).body);
  const words = text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  return words.length;
}

/**
 * Erster echter Absatz, auf `maxChars` gekuerzt. Gibt es keine Prosa (etwa in
 * `wiki/log.md`), wird die erste inhaltliche Zeile genommen.
 */
export function excerpt(body: string, maxChars = 240): string {
  const lines = splitFrontmatterBlock(body).body.split('\n');
  const paragraph = firstParagraph(lines) ?? firstContentLine(lines);
  return truncate(clean(paragraph), maxChars);
}

/** Titel eines Dokuments: aus dem Frontmatter, sonst aus dem Dateinamen. */
export function titleFor(path: string, frontmatter: Record<string, unknown>): string {
  const title = frontmatter['title'];
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  const name = baseName(path);
  const withoutExt = name.slice(0, name.length - extName(name).length) || name;
  return withoutExt.replace(/[-_]+/g, ' ').trim();
}

/** Slug eines Dokuments: aus dem Frontmatter, sonst aus dem Dateinamen. */
export function slugFor(path: string, frontmatter: Record<string, unknown>): string {
  const slug = frontmatter['slug'];
  if (typeof slug === 'string' && slug.trim().length > 0) return slugify(slug);
  const name = baseName(path);
  return slugify(name.slice(0, name.length - extName(name).length) || name);
}

function firstParagraph(lines: string[]): string | null {
  const collected: string[] = [];
  let fence: string | null = null;
  for (const raw of lines) {
    const line = raw ?? '';
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '').slice(0, 1);
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    if (line.trim().length === 0) {
      if (collected.length > 0) break;
      continue;
    }
    if (NON_PROSE.test(line)) {
      if (collected.length > 0) break;
      continue;
    }
    collected.push(line.trim());
  }
  return collected.length > 0 ? collected.join(' ') : null;
}

function firstContentLine(lines: string[]): string {
  for (const raw of lines) {
    const line = (raw ?? '').trim();
    if (line.length === 0) continue;
    if (/^ {0,3}#{1,6}\s/.test(line)) continue;
    if (FENCE.test(line)) continue;
    return line.replace(/^([-*+]\s+|\d+[.)]\s+|>\s*)/, '');
  }
  return '';
}

/** Code-Zaeune samt Inhalt entfernen. */
function stripCode(text: string): string {
  const lines = text.split('\n');
  const kept: string[] = [];
  let fence: string | null = null;
  for (const raw of lines) {
    const line = raw ?? '';
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = (fenceMatch[1] ?? '').slice(0, 1);
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence === null) kept.push(line);
  }
  return kept.join('\n');
}

/** Markdown-Auszeichnung fuer die Anzeige entfernen. */
function clean(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s*\(source:[^)]*\)/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (_all, target: string) => target.split('/').pop() ?? target)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}
