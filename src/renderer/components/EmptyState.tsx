/* Empty state. Explains what will appear here, and names the action that
   fills it — never an empty box, never "no data".

   It may only appear once the corresponding query has loaded and found
   nothing: "empty" is a statement about the vault, and it must never appear
   just because a section is missing. (None are missing anymore — every
   screen in the rail is built.)

   The icon tile stays neutral: the screen's one teal belongs to the primary
   button. */

import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: string;
}

export interface EmptyStateProps {
  /** Kebab-case name for the icon atom. */
  icon?: string;
  title: string;
  body: string;
  action?: EmptyStateAction;
}

export function EmptyState({ icon = 'sparkles', title, body, action }: EmptyStateProps) {
  return (
    <Card padded={false} className="sb-empty-card">
      <div className="sb-empty">
        <span className="sb-empty-icon">
          <Icon name={icon} size={20} />
        </span>
        <h2 className="sb-empty-title">{title}</h2>
        <p className="sb-empty-body">{body}</p>
        {action ? (
          <Button {...(action.icon ? { icon: action.icon } : {})} onClick={action.onClick}>
            {action.label}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
