/* Der Stimmungsverlauf als schlichte Spark-Darstellung: ein SVG, keine
   Bibliothek, keine Achsen, keine Beschriftung — die Form ist die Aussage.

   Zwei Regeln machen sie ehrlich:
   - **Nur eingetragene Tage.** Wo keine Stimmung steht, gibt es keinen Punkt. Es
     wird nichts interpoliert und nichts geglättet.
   - **Textalternative.** Das SVG trägt `role="img"` und einen Namen, der die
     Werte nennt. Wer die Kurve nicht sieht, liest die Zahlen.

   Farben und Maße kommen aus den Tokens; das Teal gehört hier nicht her (der
   Fokuspunkt des Screens ist ein anderer), deshalb zeichnet die Linie in der
   Randfarbe des Textes. */

export interface MoodSparkProps {
  /** Stimmungen 1..5, ältester Wert zuerst. */
  values: readonly number[];
  /** Zugänglicher Name — bereits übersetzt und mit den Werten darin. */
  label: string;
  width?: number;
  height?: number;
}

/** Die Skala der Stimmung im Vault-Format: 1 bis 5. */
const MIN = 1;
const MAX = 5;

export function MoodSpark({ values, label, width = 132, height = 34 }: MoodSparkProps) {
  if (values.length === 0) return null;
  const span = Math.max(1, values.length - 1);
  const scale = (value: number): number =>
    height - 3 - ((Math.min(MAX, Math.max(MIN, value)) - MIN) / (MAX - MIN)) * (height - 6);
  const step = values.length === 1 ? 0 : (width - 6) / span;
  const points = values.map((value, index) => ({ x: 3 + index * step, y: scale(value) }));
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      className="sb-spark"
      role="img"
      aria-label={label}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {values.length === 1 ? null : <path className="sb-spark-line" d={path} fill="none" />}
      {last === undefined ? null : (
        <circle className="sb-spark-dot" cx={last.x} cy={last.y} r={2.5} />
      )}
    </svg>
  );
}
