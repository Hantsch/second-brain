/* Placeholder for wait time. Anything over 200 ms gets one — visible
   latency instead of a frozen screen. */

export interface SkeletonProps {
  /** CSS width, e.g. '100%' or 120. */
  width?: string | number;
  height?: string | number;
  /** Multiple lines stacked on top of each other. */
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
