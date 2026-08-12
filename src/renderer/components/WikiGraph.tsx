/* The wikilink graph of a knowledge module — no library, no force simulation.

   Why columns instead of a circle: with 40 nodes, labels on a circle overlap
   each other, and a graph whose names you can't read shows nothing. The four
   categories become four columns, with nodes stacked within each; the edges
   run as subtle lines between them.

   Two things are deliberate:
   - **The nodes are buttons, not SVG shapes.** That makes them reachable by
     keyboard, gives them a name, and a focus ring. The SVG only draws lines
     and is invisible to assistive tech.
   - **Beyond 80 nodes, the graph is capped.** The 40 most connected nodes are
     shown, and the card says so — instead of showing an unreadable tangle and
     hoping nobody looks closely. */

import { useMemo, useState } from 'react';
import { useT } from '../i18n';

/** Beyond this many nodes, the graph is capped. */
export const GRAPH_LIMIT = 80;
/** This many remain after capping. */
export const GRAPH_KEPT = 40;

/** Column order — same as the categories in the catalog. */
const COLUMNS: readonly string[] = ['source', 'entity', 'concept', 'overview'];

/** Height per row in px, plus room for the column headers. */
const ROW_HEIGHT = 34;
const HEAD_ROOM = 56;
const MIN_HEIGHT = 220;

export interface GraphNode {
  id: string;
  title: string;
  type: string;
}

export interface WikiGraphProps {
  nodes: readonly GraphNode[];
  edges: readonly [string, string][];
  /** Click on a node. */
  onOpen: (id: string) => void;
  /** Highlighted node (the page currently being read). */
  active?: string | null;
}

interface Placed extends GraphNode {
  /** Percent of width and height respectively — this way the graph scales with the window. */
  left: number;
  top: number;
}

interface Layout {
  placed: Placed[];
  /** Column headers: category and its center, in percent. */
  columns: { type: string; left: number }[];
  rows: number;
  /** Edges whose both ends are shown. */
  edges: [string, string][];
  /** Total number of nodes, if the graph was capped. */
  total: number | null;
}

/** Degree per node: how many edges are attached to it. */
function degrees(edges: readonly [string, string][]): Map<string, number> {
  const count = new Map<string, number>();
  for (const [from, to] of edges) {
    count.set(from, (count.get(from) ?? 0) + 1);
    count.set(to, (count.get(to) ?? 0) + 1);
  }
  return count;
}

/**
 * Place nodes into columns. When there are too many, the most connected ones
 * remain — they carry the structure that's worth seeing.
 */
function layout(nodes: readonly GraphNode[], edges: readonly [string, string][]): Layout {
  const capped = nodes.length > GRAPH_LIMIT;
  const degree = degrees(edges);
  const kept = capped
    ? [...nodes]
        .sort(
          (a, b) =>
            (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || a.title.localeCompare(b.title),
        )
        .slice(0, GRAPH_KEPT)
    : [...nodes];

  const visible = new Set(kept.map((node) => node.id));
  const known = COLUMNS.filter((type) => kept.some((node) => node.type === type));
  /* An unknown type gets its own column instead of disappearing. */
  const others = [...new Set(kept.map((node) => node.type))].filter(
    (type) => !COLUMNS.includes(type),
  );
  const order = [...known, ...others];

  const placed: Placed[] = [];
  const columns: { type: string; left: number }[] = [];
  let rows = 0;
  order.forEach((type, column) => {
    const inColumn = kept
      .filter((node) => node.type === type)
      .sort((a, b) => a.title.localeCompare(b.title));
    const left = ((column + 0.5) / order.length) * 100;
    columns.push({ type, left });
    rows = Math.max(rows, inColumn.length);
    inColumn.forEach((node, row) => {
      placed.push({ ...node, left, top: ((row + 1) / (inColumn.length + 1)) * 100 });
    });
  });

  return {
    placed,
    columns,
    rows,
    edges: edges.filter(([from, to]) => visible.has(from) && visible.has(to)),
    total: capped ? nodes.length : null,
  };
}

export function WikiGraph({ nodes, edges, onOpen, active = null }: WikiGraphProps) {
  const t = useT();
  const [hover, setHover] = useState<string | null>(null);
  const view = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const byId = useMemo(
    () => new Map(view.placed.map((node) => [node.id, node] as const)),
    [view.placed],
  );

  if (nodes.length === 0) return <p className="sb-panel-empty">{t('graph.empty')}</p>;

  const focus = hover ?? active;
  const neighbours = new Set<string>();
  if (focus !== null) {
    neighbours.add(focus);
    for (const [from, to] of view.edges) {
      if (from === focus) neighbours.add(to);
      if (to === focus) neighbours.add(from);
    }
  }

  const height = Math.max(MIN_HEIGHT, view.rows * ROW_HEIGHT + HEAD_ROOM);

  return (
    <div className="sb-graph">
      <p className="sb-note-line">{t('graph.hint')}</p>
      {view.total === null ? null : (
        <p className="sb-graph-capped">
          {t('graph.capped', { shown: view.placed.length, total: view.total })}
        </p>
      )}
      {view.edges.length === 0 ? <p className="sb-note-line">{t('graph.lonely')}</p> : null}

      <div className="sb-graph-heads">
        {view.columns.map((column) => (
          <span
            key={column.type}
            className="sb-graph-head sb-mono"
            style={{ left: `${column.left}%` }}
          >
            {t(`modules.category.${column.type}`)}
          </span>
        ))}
      </div>

      <div className="sb-graph-plane" style={{ height }}>
        {/* Lines only: the nodes drawn on top are buttons and carry the interaction. */}
        <svg className="sb-graph-lines" aria-hidden="true">
          {view.edges.map(([from, to]) => {
            const a = byId.get(from);
            const b = byId.get(to);
            if (a === undefined || b === undefined) return null;
            const lit = focus !== null && (from === focus || to === focus);
            return (
              <line
                key={`${from}|${to}`}
                x1={`${a.left}%`}
                y1={`${a.top}%`}
                x2={`${b.left}%`}
                y2={`${b.top}%`}
                className={`sb-graph-edge${lit ? ' sb-graph-edge--lit' : ''}`}
              />
            );
          })}
        </svg>

        {view.placed.map((node) => {
          const dim = focus !== null && !neighbours.has(node.id);
          return (
            <button
              key={node.id}
              type="button"
              className={[
                'sb-graph-node',
                `sb-graph-node--${node.type}`,
                node.id === active ? 'sb-graph-node--active' : '',
                dim ? 'sb-graph-node--dim' : '',
              ]
                .join(' ')
                .trim()}
              style={{ left: `${node.left}%`, top: `${node.top}%` }}
              onMouseEnter={() => setHover(node.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(node.id)}
              onBlur={() => setHover(null)}
              onClick={() => onOpen(node.id)}
            >
              {node.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
