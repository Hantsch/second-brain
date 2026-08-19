/* Markdown to React — the **one** version in the renderer.

   Two screens display markdown, and they used to do it two different ways:
   the answer in the ask screen via `innerHTML` plus a sanitizer, the wiki
   page via the lexer. The lexer is what remained:

   - **No `innerHTML`.** Parsing goes through `marked` (already in the
     dependency tree), rendering produces React elements. That way there is no
     place where foreign text — from a vault file or from a language model —
     can turn into markup, and no need for a sanitizer.
   - **The caller decides on references.** `[[target]]` becomes a button into
     the same view in the wiki, a citation marker in an answer; a raw vault
     path (`modules/x/wiki/y.md:12`) is clickable there, not here. Both go
     through `MarkdownRefs` — the renderer itself knows nothing about
     citations.

   Whatever `marked` doesn't recognize (raw HTML, unusual forms) appears as
   text. Nothing is lost: the file remains readable in its original form. */

import type { ReactNode } from 'react';
import { lexer } from 'marked';
import type { Token, Tokens } from 'marked';

/**
 * A reference in running text: `[[target|text]]` or a raw vault path with an
 * optional line number. If a function returns `null`, the spot stays as
 * text — a link to nowhere is worse than no link.
 */
export interface MarkdownRefs {
  wikilink(target: string, label: string, key: string): ReactNode | null;
  path?(path: string, line: string | null, key: string): ReactNode | null;
}

/** Headings start at h2 — h1 is the title of the screen. */
const HEADING_OFFSET = 1;

/**
 * `[[target|text]]` or a vault path (`a/b.md`, optionally `:12`). The path
 * must not follow `(` or `[`, so a markdown link doesn't get cut apart.
 */
const REF =
  /\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]|(?<![\w/[(])((?:[\w.@-]+\/)+[\w.@-]+\.md)(?::(\d+))?/g;

/** Running text with references. Anything that isn't a reference stays text. */
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
      /* Inside `code`, text stays text — even a `[[target]]`. */
      return (
        <code key={own} className="sb-md-code">
          {(token as Tokens.Codespan).text}
        </code>
      );
    }
    if (token.type === 'br') return <br key={own} />;
    if (token.type === 'link') {
      const anchor = token as Tokens.Link;
      /* Targets inside the vault are relative paths — those don't belong in
         the browser. They appear as plain text; opening happens via the page
         list. */
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
  headingOffset: number,
): ReactNode[] {
  return items.map((item, at) => (
    <li key={`${key}-${at}`} className={item.task ? 'sb-md-task' : undefined}>
      {item.task ? (
        <span className="sb-md-box sb-mono">{item.checked === true ? '[x]' : '[ ]'}</span>
      ) : null}
      {blocks(refs, item.tokens, `${key}-${at}`, headingOffset)}
    </li>
  ));
}

function heading(refs: MarkdownRefs, token: Tokens.Heading, key: string, offset: number): ReactNode {
  const level = Math.min(6, Math.max(2, token.depth + offset));
  const Tag = `h${level}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  return (
    <Tag key={key} className="sb-md-heading">
      {inline(refs, token.tokens, key)}
    </Tag>
  );
}

/** Tables come from metadata blocks of the raw sources — plain, but readable. */
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

function blocks(
  refs: MarkdownRefs,
  tokens: readonly Token[],
  key: string,
  headingOffset: number,
): ReactNode[] {
  const out: ReactNode[] = [];
  tokens.forEach((token, at) => {
    const own = `${key}-${at}`;
    if (token.type === 'space' || token.type === 'def') return;
    if (token.type === 'heading') {
      out.push(heading(refs, token as Tokens.Heading, own, headingOffset));
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
          {blocks(refs, (token as Tokens.Blockquote).tokens, own, headingOffset)}
        </blockquote>,
      );
      return;
    }
    if (token.type === 'list') {
      const list = token as Tokens.List;
      const items = listItems(refs, list.items, own, headingOffset);
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
    /* Unknown (raw HTML, unusual forms): as text, never as markup. */
    out.push(
      <p key={own} className="sb-md-p sb-md-raw">
        {(token as Tokens.Generic).raw}
      </p>,
    );
  });
  return out;
}

/**
 * Markdown as React nodes. Empty text yields an empty list.
 *
 * `headingOffset` defaults to the screen-level assumption ("h1 is the
 * screen's own title, so markdown headings start at h2"). A caller that
 * nests this inside something that already carries its own heading — a
 * `Panel`'s `<h2>` title, for instance — passes a larger offset so the
 * content's headings continue the outline instead of jumping past it.
 */
export function renderMarkdown(
  text: string,
  refs: MarkdownRefs,
  headingOffset: number = HEADING_OFFSET,
): ReactNode[] {
  const source = (text ?? '').trim();
  if (source.length === 0) return [];
  return blocks(refs, lexer(source), 'b', headingOffset);
}

/**
 * Make vault syntax readable from a short excerpt — for previews (citations
 * in the ask screen, list rows) that show no structure, just running text.
 * No rendering, text only: `[[target|text]]` becomes `text` (otherwise
 * `target`), leading markers (`#`, `-`, `>`, `1.`) are dropped, a trailing
 * `(source: …)` disappears. The same `REF` the renderer above uses to
 * recognize wikilinks — maintaining a second pattern here would be the
 * mistake of forgetting to update one of them on the next syntax change.
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
