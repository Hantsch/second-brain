import type { HTMLAttributes } from 'react';

/* Gaston Badge atom — thin wrapper over the `gs-badge` classes from
   docs/design-system/gaston/project/components/display/Badge.jsx. */

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  dot?: boolean;
}

export function Badge({
  variant = 'neutral',
  dot = false,
  className = '',
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`gs-badge gs-badge--${variant} ${className}`} {...rest}>
      {dot ? <span className="gs-badge-dot" aria-hidden="true"></span> : null}
      {children}
    </span>
  );
}
