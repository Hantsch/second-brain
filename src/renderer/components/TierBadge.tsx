/* Die Leistungsklasse eines Modells als Marke: klein, mittel, groß.

   Bewusst alle drei neutral: das eine Teal des Screens gehört der primären
   Aktion, nicht einer Einordnung. Unterschieden wird über den Text, nicht über
   die Farbe — das bleibt auch bei Farbfehlsicht lesbar.

   Die Begründung („warum diese Klasse") steht nicht in jeder Zeile: in einer
   Tabelle mit zehn Aufgaben wiederholt sie sich wortwörtlich und macht jede Zeile
   doppelt so hoch. Sie gehört an eine Stelle — unter „Standard je
   Leistungsklasse" — und als `title` an die Marke. */

import type { ModelTier } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { useT } from '../i18n';

export interface TierBadgeProps {
  tier: ModelTier;
  /** Erklärt in einem Satz, warum diese Klasse empfohlen ist — unter der Marke. */
  withReason?: boolean;
  /** Derselbe Satz nur beim Verweilen, für die enge Tabellenzeile. */
  title?: string;
}

export function TierBadge({ tier, withReason = false, title }: TierBadgeProps) {
  const t = useT();
  if (!withReason) {
    return (
      <Badge variant="neutral" {...(title === undefined ? {} : { title })}>
        {t(`settings.tier.${tier}`)}
      </Badge>
    );
  }
  return (
    <span className="sb-tier">
      <Badge variant="neutral">{t(`settings.tier.${tier}`)}</Badge>
      <span className="sb-tier-why">{t(`settings.tier.${tier}.why`)}</span>
    </span>
  );
}
