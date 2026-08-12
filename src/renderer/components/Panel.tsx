/* Ein Modul: Titel, Kennzahl, Inhalt, optional eine Fußnote.
   Das Bauteil, aus dem Dashboard und Listen bestehen — damit alle Module
   dieselbe Geometrie haben und ein Screen nicht aus Einzelstücken besteht. */

import type { ReactNode } from 'react';
import { Card } from '../atoms/Card';

export interface PanelProps {
  /** Titel des Moduls, bereits übersetzt. */
  title: string;
  /** Kennzahl rechts im Kopf — Daten, deshalb Mono. Bereits übersetzt. */
  meta?: string;
  /** Sekundäre Aktion im Kopf. Nie die primäre Aktion des Screens. */
  action?: ReactNode;
  /** Ruhige Fußnote, etwa eine Einschränkung. Bereits übersetzt. */
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
