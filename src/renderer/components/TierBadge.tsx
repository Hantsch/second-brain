/* A model's performance tier as a badge: cheap, balanced, strong.

   Deliberately all three neutral: the screen's one teal belongs to the
   primary action, not to a classification. Tiers are told apart via text, not
   color — that stays legible even with color blindness.

   The reasoning ("why this tier") doesn't appear in every row: in a table
   with ten tasks it would repeat verbatim and double the height of every row.
   It belongs in one place — under "default per performance tier" — and as a
   `title` on the badge. */

import type { ModelTier } from '@shared/types';
import { Badge } from '../atoms/Badge';
import { useT } from '../i18n';

export interface TierBadgeProps {
  tier: ModelTier;
  /** Explains in one sentence why this tier is recommended — below the badge. */
  withReason?: boolean;
  /** The same sentence, only on hover, for the tight table row. */
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
