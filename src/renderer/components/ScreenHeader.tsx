/* Header of a screen: overline, title, and exactly one primary action.
   One focal point per screen — there's never more than one teal action here. */

import type { ReactNode } from 'react';

export interface ScreenHeaderProps {
  /** Short mono label above the title, already translated. */
  overline: string;
  /** Title of the screen, already translated. */
  title: string;
  /** The one primary action. */
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
