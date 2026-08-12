/* Leerzustand. Erklärt, was hier erscheinen wird, und nennt die Aktion, die es
   füllt — nie ein leerer Kasten, nie „keine Daten".

   Er darf ausschließlich erscheinen, wenn die zugehörige Abfrage geladen hat und
   nichts gefunden wurde: „leer" ist eine Aussage über den Vault, und die darf nie
   dastehen, weil ein Bereich fehlt. (Es fehlt keiner mehr — jeder Screen der Rail
   ist gebaut.)

   Das Icon-Kachelchen bleibt neutral: das einzige Teal des Screens gehört dem
   Primärknopf. */

import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: string;
}

export interface EmptyStateProps {
  /** Kebab-case-Name für das Icon-Atom. */
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
