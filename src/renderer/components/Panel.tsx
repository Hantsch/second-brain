/* A module: title, figure, content, optionally a footnote.
   The building block that the dashboard and lists are made of — so every
   module shares the same geometry and a screen isn't assembled from
   one-off pieces. */

import type { ReactNode } from 'react';
import { Card } from '../atoms/Card';

export interface PanelProps {
  /** Title of the module, already translated. */
  title: string;
  /** Figure on the right of the header — data, hence mono. Already translated. */
  meta?: string;
  /** Secondary action in the header. Never the screen's primary action. */
  action?: ReactNode;
  /** Quiet footnote, e.g. a caveat. Already translated. */
  note?: string;
  children: ReactNode;
}

export function Panel({ title, meta, action, note, children }: PanelProps) {
  return (
    <Card padded={false} className="sb-panel">
      <div className="sb-panel-head">
        <h2 className="sb-panel-title">{title}</h2>
        {meta ? <span className="sb-panel-meta">{meta}</span> : null}
        {action ? <div className="sb-panel-action">{action}</div> : null}
      </div>
      <div className="sb-panel-body">{children}</div>
      {note ? <p className="sb-panel-note">{note}</p> : null}
    </Card>
  );
}
