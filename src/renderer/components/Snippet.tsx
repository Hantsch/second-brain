/* Renders a search snippet (`makeSnippet`, `src/core/index/snippet.ts`):
   matched terms come marked with `**term**`, and this turns those markers
   into real `<strong>` elements — a small, purpose-built parser rather than a
   Markdown renderer, since a snippet is guaranteed to carry only this one
   marker and nothing else `makeSnippet` could emit.

   The mark deliberately does not use the teal accent (`.sb-snippet-mark` in
   `styles/app/search.css`): the one accent per screen belongs to the focal
   point — the active roving row — not to every matched word in every row. */

import { Fragment } from 'react';

export interface SnippetProps {
  text: string;
}

interface Segment {
  key: number;
  value: string;
  marked: boolean;
}

/** Splits on `**term**` pairs into plain/marked segments, in order. Each
    segment's own start offset in `text` is its key: segments never overlap,
    so the offset is already a stable, unique identity — no separate mutable
    counter needed. */
function segments(text: string): Segment[] {
  const pattern = /\*\*(.+?)\*\*/g;
  const parts: Segment[] = [];
  let cursor = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    if (match.index > cursor) {
      parts.push({ key: cursor, value: text.slice(cursor, match.index), marked: false });
    }
    parts.push({ key: match.index, value: match[1] ?? '', marked: true });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ key: cursor, value: text.slice(cursor), marked: false });
  return parts;
}

export function Snippet({ text }: SnippetProps) {
  return (
    <>
      {segments(text).map((part) =>
        part.marked ? (
          <strong key={part.key} className="sb-snippet-mark">
            {part.value}
          </strong>
        ) : (
          <Fragment key={part.key}>{part.value}</Fragment>
        ),
      )}
    </>
  );
}
