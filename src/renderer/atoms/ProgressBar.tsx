/* Progress bar atom: a track span holding a fill span, exposed as a
   `progressbar`. Callers pass their own track/fill classes so the look stays in
   their CSS; the atom owns only the semantics, so the ARIA attributes cannot
   drift between copies. `value: null` is indeterminate: no `aria-valuenow`
   (its absence is what tells assistive tech the progress is unknown) and no
   fill width. */

export interface ProgressBarProps {
  /** 0–100, or null while the amount is unknown. */
  value: number | null;
  label: string;
  className?: string;
  fillClassName?: string;
}

export function ProgressBar({ value, label, className, fillClassName }: ProgressBarProps) {
  return (
    <span
      className={className}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span className={fillClassName} style={value === null ? undefined : { width: `${value}%` }} />
    </span>
  );
}
