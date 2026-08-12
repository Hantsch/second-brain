/* Der Gesundheitswert als Balken — mit Textalternative, nie als nackte Zahl.

   Drei Festlegungen:

   - **`null` ist ein eigener Zustand.** Kein Lauf heißt kein Wert: dann steht ein
     Gedankenstrich in der Spur und „noch nicht geprüft" daneben. Eine 100, weil
     niemand nachgesehen hat, wäre die Sorte Lüge, an der ein Dashboard stirbt.
   - **Die Farbe ist Beiwerk.** Die Aussage steht im Text (`aria-label` und die
     Erklärung daneben); der Balken macht sie nur schneller lesbar. Deshalb
     ausschließlich Tokens und kein Farbverlauf, der Genauigkeit vortäuscht.
   - **Ein Bild mit Namen.** `role="img"` plus `aria-label` — ein Balken aus zwei
     `<span>` ist für ein Hilfsmittel sonst nichts. */

import { useT } from '../i18n';

/** Ab hier gilt der Bestand als gesund bzw. als angeschlagen. */
export const HEALTH_GOOD = 80;
export const HEALTH_FAIR = 50;

export type HealthTone = 'good' | 'fair' | 'poor' | 'unknown';

export function healthTone(score: number | null): HealthTone {
  if (score === null) return 'unknown';
  if (score >= HEALTH_GOOD) return 'good';
  return score >= HEALTH_FAIR ? 'fair' : 'poor';
}

export interface HealthMeterProps {
  /** 0..100, oder `null`, wenn es keinen Lauf gibt. */
  score: number | null;
  /** Klein für die Kachel, groß für den Kopf des Screens. */
  size?: 'sm' | 'lg';
}

export function HealthMeter({ score, size = 'lg' }: HealthMeterProps) {
  const t = useT();
  const tone = healthTone(score);
  const label = score === null ? t('garden.health.unknown') : t('garden.health.aria', { score });
  const width = score === null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div className={`sb-health sb-health--${size}`} role="img" aria-label={label}>
      <span className={`sb-health-value sb-health-value--${tone}`}>
        {score === null ? '—' : score}
      </span>
      <span className="sb-health-body">
        <span className="sb-health-label">{t('garden.health.label')}</span>
        <span className="sb-health-track">
          <span
            className={`sb-health-fill sb-health-fill--${tone}`}
            style={{ width: `${width}%` }}
          />
        </span>
      </span>
    </div>
  );
}
