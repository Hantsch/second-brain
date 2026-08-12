/* Platzhalter für Wartezeit. Alles über 200 ms bekommt einen — sichtbare
   Latenz statt eines eingefrorenen Screens. */

export interface SkeletonProps {
  /** CSS-Breite, z. B. '100%' oder 120. */
  width?: string | number;
  height?: string | number;
  /** Mehrere Zeilen untereinander. */
  lines?: number;
}

export function Skeleton({ width = '100%', height = 14, lines = 1 }: SkeletonProps) {
  if (lines > 1) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
        aria-hidden="true"
      >
        {Array.from({ length: lines }, (_, line) => (
          <span
            key={line}
            className="sb-skeleton"
            style={{
              width: line === lines - 1 ? '60%' : width,
              height,
              display: 'block',
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <span className="sb-skeleton" style={{ width, height, display: 'block' }} aria-hidden="true" />
  );
}
