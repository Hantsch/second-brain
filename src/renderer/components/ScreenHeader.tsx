/* Kopf eines Screens: Overline, Titel und genau eine primäre Aktion.
   Ein Fokuspunkt pro Screen — mehr als eine Teal-Aktion gibt es hier nicht. */

import type { ReactNode } from 'react';

export interface ScreenHeaderProps {
  /** Kurzes Mono-Label über dem Titel, bereits übersetzt. */
  overline: string;
  /** Titel des Screens, bereits übersetzt. */
  title: string;
  /** Die eine primäre Aktion. */
  action?: ReactNode;
}

export function ScreenHeader({ overline, title, action }: ScreenHeaderProps) {
  return (
    <div className="sb-header">
      <div className="sb-header-text">
        <span className="gs-overline">{overline}</span>
        <h1 className="sb-header-title">{title}</h1>
      </div>
      {action ? <div className="sb-header-action">{action}</div> : null}
    </div>
  );
}
