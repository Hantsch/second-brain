/* Markdown zu React — die **eine** Fassung im Renderer.

   Zwei Screens zeigen Markdown, und sie zeigten es vorher auf zwei Wegen: die
   Antwort im Fragen-Screen über `innerHTML` plus Sanitizer, die Wiki-Seite über
   den Lexer. Geblieben ist der Lexer:

   - **Kein `innerHTML`.** Geparst wird mit `marked` (schon im Bestand), gerendert
     wird zu React-Elementen. Damit gibt es keine Stelle, an der Fremdtext — aus
     einer Vault-Datei oder aus einem Sprachmodell — zu Markup werden kann, und
     keinen Bedarf an einem Sanitizer.
   - **Verweise entscheidet der Aufrufer.** `[[ziel]]` wird im Wiki ein Knopf in
     dieselbe Ansicht, in einer Antwort eine Belegmarke; ein roher Vault-Pfad
     (`modules/x/wiki/y.md:12`) wird dort klickbar, hier nicht. Beides über
     `MarkdownRefs` — der Renderer selbst weiß von Belegen nichts.

   Was `marked` nicht kennt (rohes HTML, Sonderformen), erscheint als Text.
   Verloren geht nichts: die Datei bleibt im Original lesbar. */

import type { ReactNode } from 'react';
import { lexer } from 'marked';
import type { Token, Tokens } from 'marked';

/**
 * Ein Verweis im Fließtext: `[[ziel|text]]` oder ein roher Vault-Pfad mit
 * optionaler Zeilennummer. Gibt eine Funktion `null` zurück, bleibt die Stelle
 * Text — ein Link ins Nichts ist schlimmer als keiner.
 */
export interface MarkdownRefs {
  wikilink(target: string, label: string, key: string): ReactNode | null;
  path?(path: string, line: string | null, key: string): ReactNode | null;
}

/** Überschriften beginnen bei h2 — h1 ist der Titel des Screens. */
const HEADING_OFFSET = 1;

/**
 * `[[ziel|text]]` oder ein Vault-Pfad (`a/b.md`, optional `:12`). Der Pfad nicht
 * nach `(` oder `[`, damit ein Markdown-Link nicht zerschnitten wird.
 */
const REF =
  /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]|(?<![\w/[(])((?:[\w.@-]+\/)+[\w.@-]+\.md)(?::(\d+))?/g;

/** Fließtext mit Verweisen. Alles, was kein Verweis ist, bleibt Text. */
function withRefs(refs: MarkdownRefs, text: string, key: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  REF.lastIndex = 0;
  for (let match = REF.exec(text); match !== null; match = REF.exec(text)) {
    const own = `${key}-r${index}`;
    const node =
      match[1] === undefined
        ? (refs.path?.(match[3] ?? '', match[4] ?? null, own) ?? null)
        : refs.wikilink((match[1] ?? '').trim(), (match[2] ?? '').trim(), own);
    index += 1;
    if (node === null) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(node);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function inline(
  refs: MarkdownRefs,
  tokens: readonly Token[] | undefined,
  key: string,
): ReactNode[] {
  if (tokens === undefined) return [];
  return tokens.map((token, at) => {
    const own = `${key}-${at}`;
    if (token.type === 'strong') {
      return <strong key={own}>{inline(refs, (token as Tokens.Strong).tokens, own)}</strong>;
    }
    if (token.type === 'em') {
      return <em key={own}>{inline(refs, (token as Tokens.Em).tokens, own)}</em>;
    }
    if (token.type === 'del') {
      return <del key={own}>{inline(refs, (token as Tokens.Del).tokens, own)}</del>;
    }
    if (token.type === 'codespan') {
      /* In `code` bleibt Text Text — auch ein `[[ziel]]`. */
      return (
        <code key={own} className="sb-md-code">
          {(token as Tokens.Codespan).text}
        </code>
      );
    }
    if (token.type === 'br') return <br key={own} />;
    if (token.type === 'link') {
      const anchor = token as Tokens.Link;
      /* Ziele im Vault sind relative Pfade — die gehören nicht in den Browser.
         Sie stehen als Text da; geöffnet wird über die Seitenliste. */
      const external = /^[a-z][a-z0-9+.-]*:/i.test(anchor.href);
      if (!external) return <span key={own}>{inline(refs, anchor.tokens, own)}</span>;
      return (
        <a key={own} className="sb-md-link" href={anchor.href} target="_blank" rel="noreferrer">
          {inline(refs, anchor.tokens, own)}
        </a>
      );
    }
    if (token.type === 'image') return <span key={own}>{(token as Tokens.Image).text}</span>;
    const nested = (token as Tokens.Generic).tokens;
    if (token.type === 'text' && Array.isArray(nested) && nested.length > 0) {
      return <span key={own}>{inline(refs, nested, own)}</span>;
    }
    const text =
      typeof (token as Tokens.Generic).text === 'string' ? (token as Tokens.Text).text : '';
    return <span key={own}>{withRefs(refs, text, own)}</span>;
  });
}

function listItems(
  refs: MarkdownRefs,
  items: readonly Tokens.ListItem[],
  key: string,
): ReactNode[] {
  return items.map((item, at) => (
    <li key={`${key}-${at}`} className={item.task ? 'sb-md-task' : undefined}>
      {item.task ? (
        <span className="sb-md-box sb-mono">{item.checked === true ? '[x]' : '[ ]'}</span>
      ) : null}
      {blocks(refs, item.tokens, `${key}-${at}`)}
    </li>
  ));
}

function heading(refs: MarkdownRefs, token: Tokens.Heading, key: string): ReactNode {
  const level = Math.min(6, Math.max(2, token.depth + HEADING_OFFSET));
  const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag key={key} className="sb-md-heading">
      {inline(refs, token.tokens, key)}
    </Tag>
  );
}

/** Tabellen kommen aus Metadaten-Blöcken der Rohquellen — schlicht, aber lesbar. */
function table(refs: MarkdownRefs, token: Tokens.Table, key: string): ReactNode {
  return (
    <table key={key} className="gs-table sb-md-table">
      <thead>
        <tr>
          {token.header.map((cell, at) => (
            <th key={`${key}-h${at}`}>{inline(refs, cell.tokens, `${key}-h${at}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {token.rows.map((row, at) => (
          <tr key={`${key}-r${at}`}>
            {row.map((cell, column) => (
              <td key={`${key}-r${at}-${column}`}>
                {inline(refs, cell.tokens, `${key}-r${at}-${column}`)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function blocks(refs: MarkdownRefs, tokens: readonly Token[], key: string): ReactNode[] {
  const out: ReactNode[] = [];
  tokens.forEach((token, at) => {
    const own = `${key}-${at}`;
    if (token.type === 'space' || token.type === 'def') return;
    if (token.type === 'heading') {
      out.push(heading(refs, token as Tokens.Heading, own));
      return;
    }
    if (token.type === 'hr') {
      out.push(<hr key={own} className="sb-md-rule" />);
      return;
    }
    if (token.type === 'code') {
      out.push(
        <pre key={own} className="sb-md-pre">
          <code>{(token as Tokens.Code).text}</code>
        </pre>,
      );
      return;
    }
    if (token.type === 'blockquote') {
      out.push(
        <blockquote key={own} className="sb-md-quote">
          {blocks(refs, (token as Tokens.Blockquote).tokens, own)}
        </blockquote>,
      );
      return;
    }
    if (token.type === 'list') {
      const list = token as Tokens.List;
      const items = listItems(refs, list.items, own);
      out.push(
        list.ordered ? (
          <ol key={own} className="sb-md-list">
            {items}
          </ol>
        ) : (
          <ul key={own} className="sb-md-list">
            {items}
          </ul>
        ),
      );
      return;
    }
    if (token.type === 'table') {
      out.push(table(refs, token as Tokens.Table, own));
      return;
    }
    if (token.type === 'paragraph' || token.type === 'text') {
      const block = token as Tokens.Paragraph;
      out.push(
        <p key={own} className="sb-md-p">
          {block.tokens === undefined
            ? withRefs(refs, block.text, own)
            : inline(refs, block.tokens, own)}
        </p>,
      );
      return;
    }
    /* Unbekannt (rohes HTML, Sonderformen): als Text, nie als Markup. */
    out.push(
      <p key={own} className="sb-md-p sb-md-raw">
        {(token as Tokens.Generic).raw}
      </p>,
    );
  });
  return out;
}

/** Markdown als React-Knoten. Leerer Text ergibt eine leere Liste. */
export function renderMarkdown(text: string, refs: MarkdownRefs): ReactNode[] {
  const source = (text ?? '').trim();
  if (source.length === 0) return [];
  return blocks(refs, lexer(source), 'b');
}

/**
 * Vault-Syntax aus einem kurzen Ausschnitt lesbar machen — für Vorschauen
 * (Zitate im Fragen-Screen, Listenzeilen), die keine Struktur zeigen, nur
 * Fließtext. Kein Rendering, nur Text: `[[ziel|text]]` wird zu `text` (sonst
 * `ziel`), führende Marker (`#`, `-`, `>`, `1.`) fallen weg, eine angehängte
 * `(source: …)` verschwindet. Derselbe `REF`, mit dem der Renderer oben
 * Wikilinks erkennt — ein zweites Muster hier zu pflegen wäre der Fehler, der
 * beim nächsten Syntaxwechsel eines vergisst.
 */
export function plainExcerpt(text: string): string {
  const withoutSource = (text ?? '').replace(/\s*\(source:[^)]*\)\s*$/i, '');
  const withoutMarkers = withoutSource
    .split('\n')
    .map((line) => line.replace(/^\s{0,3}(?:#{1,6}|[-*+]|>|\d+\.)\s+/, ''))
    .join('\n');
  REF.lastIndex = 0;
  return withoutMarkers
    .replace(REF, (match, target: string | undefined, label: string | undefined) => {
      if (target === undefined) return match;
      const trimmedLabel = (label ?? '').trim();
      return trimmedLabel.length > 0 ? trimmedLabel : target.trim();
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
