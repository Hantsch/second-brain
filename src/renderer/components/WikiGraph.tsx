/* Der Wikilink-Graph eines Moduls — ohne Bibliothek, ohne Kräftesimulation.

   Warum Spalten statt eines Kreises: mit 40 Knoten überlappen sich auf einem
   Kreis die Beschriftungen, und ein Graph, dessen Namen man nicht lesen kann,
   zeigt nichts. Die vier Kategorien werden zu vier Spalten, die Knoten
   untereinander; die Kanten laufen als dezente Linien dazwischen.

   Zwei Dinge sind Absicht:
   - **Die Knoten sind Knöpfe, keine SVG-Formen.** Damit sind sie mit der Tastatur
     erreichbar, haben einen Namen und einen Fokusring. Das SVG zeichnet nur
     Linien und ist für Hilfsmittel unsichtbar.
   - **Über 80 Knoten wird gekappt.** Gezeigt werden die 40 am stärksten
     verbundenen, und die Karte sagt das — statt ein unlesbares Knäuel zu zeigen
     und zu hoffen, dass niemand hinsieht. */

import { useMemo, useState } from 'react';
import { useT } from '../i18n';

/** Ab so vielen Knoten wird gekappt. */
export const GRAPH_LIMIT = 80;
/** So viele bleiben dann übrig. */
export const GRAPH_KEPT = 40;

/** Reihenfolge der Spalten — wie die Rubriken im Katalog. */
const COLUMNS: readonly string[] = ['source', 'entity', 'concept', 'overview'];

/** Höhe je Zeile in px, plus Platz für die Spaltenköpfe. */
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
  /** Klick auf einen Knoten. */
  onOpen: (id: string) => void;
  /** Hervorgehobener Knoten (die gerade gelesene Seite). */
  active?: string | null;
}

interface Placed extends GraphNode {
  /** Prozent der Breite bzw. Höhe — so skaliert der Graph mit dem Fenster. */
  left: number;
  top: number;
}

interface Layout {
  placed: Placed[];
  /** Spaltenköpfe: Kategorie und ihre Mitte in Prozent. */
  columns: { type: string; left: number }[];
  rows: number;
  /** Kanten, deren beide Enden gezeigt werden. */
  edges: [string, string][];
  /** Wie viele Knoten es insgesamt gibt, wenn gekappt wurde. */
  total: number | null;
}

/** Grad je Knoten: wie viele Kanten hängen daran. */
function degrees(edges: readonly [string, string][]): Map<string, number> {
  const count = new Map<string, number>();
  for (const [from, to] of edges) {
    count.set(from, (count.get(from) ?? 0) + 1);
    count.set(to, (count.get(to) ?? 0) + 1);
  }
  return count;
}

/**
 * Knoten in Spalten legen. Bei zu vielen Knoten bleiben die am stärksten
 * verbundenen — sie tragen die Struktur, die man sehen will.
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
  /* Ein unbekannter Typ bekommt seine eigene Spalte statt zu verschwinden. */
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
        {/* Nur Linien: die Knoten darüber sind Knöpfe und tragen die Bedienung. */}
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
