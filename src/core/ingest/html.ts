/**
 * HTML → Markdown, ohne DOM-Bibliothek.
 *
 * Bewusst kein jsdom: eine ganze Browser-Engine, um einen Artikeltext zu finden,
 * waere ein Megabyte Abhaengigkeit fuer eine Aufgabe, die ein kleiner Scanner
 * erledigt. Der Scanner kann genau zwei Dinge — ein Element mitsamt Inhalt
 * herausschneiden und ein Element mitsamt Inhalt entfernen — und beides zaehlt
 * verschachtelte gleichnamige Tags korrekt mit.
 *
 * Die Umwandlung selbst macht `turndown`; das ist der eine Ort im Projekt, der
 * HTML in Markdown verwandelt.
 */

import TurndownService from 'turndown';

/**
 * Elemente, die nie Inhalt sind. `header` fehlt hier absichtlich: viele Artikel
 * tragen ihre Ueberschrift in einem `<header>` **innerhalb** des Artikels — wer den
 * entfernt, verliert den Titel des Textes.
 */
const DROP_TAGS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'nav',
  'footer',
  'aside',
  'form',
];

/** Wo der Inhalt am wahrscheinlichsten steht, in dieser Reihenfolge. */
const CONTENT_SELECTORS: { tag: string; attribute?: RegExp }[] = [
  { tag: 'article' },
  { tag: 'main' },
  { tag: 'div', attribute: /\bid\s*=\s*["']?(content|main|article|post)\b/i },
  {
    tag: 'div',
    attribute:
      /\bclass\s*=\s*["'][^"']*\b(post-content|entry-content|article-body|markdown-body)\b/i,
  },
  { tag: 'body' },
];

/** HTML-Kommentare weg — auch die, die halbe Seiten auskommentieren. */
export function stripComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, ' ');
}

function tagPattern(tag: string): RegExp {
  return new RegExp(`</?${tag}(\\s[^>]*)?>`, 'gi');
}

/**
 * Ein Element samt Inhalt finden. `from` ist der Index des `<`; zurueck kommt der
 * Bereich [start, end) einschliesslich der Tags, oder null bei fehlendem Ende.
 */
function elementRange(
  html: string,
  tag: string,
  from: number,
): { start: number; end: number } | null {
  const pattern = tagPattern(tag);
  pattern.lastIndex = from;
  let depth = 0;
  let start = -1;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    const isClosing = match[0].startsWith('</');
    const selfClosing = /\/>$/.test(match[0]);
    if (!isClosing) {
      if (start === -1) start = match.index;
      if (!selfClosing) depth += 1;
      else if (depth === 0) return { start, end: match.index + match[0].length };
      continue;
    }
    if (start === -1) continue;
    depth -= 1;
    if (depth <= 0) return { start, end: match.index + match[0].length };
  }
  return null;
}

/** Alle Elemente dieser Tags mitsamt Inhalt entfernen. */
export function dropElements(html: string, tags: readonly string[] = DROP_TAGS): string {
  let out = html;
  for (const tag of tags) {
    for (let guard = 0; guard < 200; guard += 1) {
      const opening = new RegExp(`<${tag}(\\s[^>]*)?>`, 'i').exec(out);
      if (opening === null) break;
      const range = elementRange(out, tag, opening.index);
      if (range === null) {
        // Kein Ende gefunden: nur das offene Tag entfernen, der Text bleibt.
        out = `${out.slice(0, opening.index)} ${out.slice(opening.index + opening[0].length)}`;
        continue;
      }
      out = `${out.slice(0, range.start)} ${out.slice(range.end)}`;
    }
  }
  return out;
}

/** Der wahrscheinliche Inhaltsbereich. Findet sich keiner, gilt das ganze Dokument. */
export function pickMainContent(html: string): string {
  for (const selector of CONTENT_SELECTORS) {
    const pattern = new RegExp(`<${selector.tag}(\\s[^>]*)?>`, 'gi');
    for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
      if (selector.attribute !== undefined && !selector.attribute.test(match[0])) continue;
      const range = elementRange(html, selector.tag, match.index);
      if (range === null) continue;
      const inner = html.slice(range.start, range.end);
      // Ein leerer Rahmen ist kein Inhalt — dann weiter zum naechsten Kandidaten.
      if (inner.replace(/<[^>]*>/g, '').trim().length >= 200) return inner;
    }
  }
  return html;
}

function decodeBasicEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/** Titel der Seite: `og:title` zuerst, dann `<title>`, dann die erste `<h1>`. */
export function extractTitle(html: string): string | null {
  const og = /<meta[^>]+(?:property|name)\s*=\s*["']og:title["'][^>]*>/i.exec(html);
  if (og !== null) {
    const content = /content\s*=\s*["']([^"']+)["']/i.exec(og[0]);
    if (content?.[1] !== undefined) return decodeBasicEntities(content[1]).trim();
  }
  const title = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(html);
  if (title?.[1] !== undefined) {
    const text = decodeBasicEntities(title[1].replace(/\s+/g, ' ')).trim();
    if (text.length > 0) return text;
  }
  const heading = /<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/i.exec(html);
  if (heading?.[1] !== undefined) {
    const text = decodeBasicEntities(
      heading[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '),
    ).trim();
    if (text.length > 0) return text;
  }
  return null;
}

let turndown: TurndownService | null = null;

function converter(): TurndownService {
  if (turndown === null) {
    turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
    });
    // Bilder tragen im Wissenskontext nichts; der Alt-Text bleibt als Satz erhalten.
    turndown.addRule('images', {
      filter: 'img',
      replacement: (_content, node) => {
        const alt = (node as { getAttribute?: (name: string) => string | null }).getAttribute?.(
          'alt',
        );
        return alt === null || alt === undefined || alt.trim().length === 0
          ? ''
          : `(${alt.trim()})`;
      },
    });
  }
  return turndown;
}

/**
 * Ein HTML-Fragment in Markdown umwandeln.
 *
 * Turndown polstert Listenpunkte auf vier Zeichen (`-   Punkt`). Im Vault gilt
 * `- Punkt` — dieselbe Schreibweise, die die App selbst schreibt und die Prettier in
 * Obsidian-Notizen erwartet.
 */
export function htmlToMarkdown(html: string): string {
  const markdown = converter().turndown(html);
  return markdown
    .replace(/^(\s*)([-*+]) {2,}/gm, '$1- ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export interface HtmlArticle {
  title: string | null;
  markdown: string;
}

/**
 * Eine ganze HTML-Seite zu Titel und Artikeltext. Navigation, Kopf- und Fusszeilen
 * sind vorher weg — was bleibt, ist der Text, den ein Leser als Inhalt erkennt.
 */
export function htmlToArticle(html: string): HtmlArticle {
  const clean = stripComments(html);
  const title = extractTitle(clean);
  const content = dropElements(
    pickMainContent(dropElements(clean, ['script', 'style', 'noscript'])),
  );
  return { title, markdown: htmlToMarkdown(content) };
}
